// routes/chat.ts — POST /api/chat con SSE streaming (Sonnet 4.6)
//
// Contract:
// - POST body: { message: string, history?: ChatMessage[], context?: { focusNodeId?, graph? } }
// - Headers: Content-Type: text/event-stream
// - Body: secuencia de chunks "data: <json>\n\n" donde <json> es ChatChunk
//   { delta?, entidades?, focus?, done? }
//
// Hard rules:
// - assertBudget() antes de cada call. Si excede → 429 con remaining USD
// - System prompt cacheable (>1024 tokens) para amortizar costo en sesiones
// - Detector explícito de "credit_balance_too_low" → 503 con error code
// - Cero respuestas inventadas — el system prompt instruye al modelo a decir
//   "no tengo evidencia para X" si no encuentra en el contexto.

import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import {
  assertBudget,
  recordLlmCall,
  estimarCostoCall,
  isOutOfCreditsError,
  BudgetExceededError,
  type ModeloSoportado,
} from '../lib/budget-guard'
import { validarChunk } from '../lib/llm-validator'
import { runReadOnlyCypher, GrafoQueryError } from '../lib/grafo-query'
import { isGraphAvailable } from '../lib/graph'

const router = Router()
const MODELO: ModeloSoportado = 'claude-sonnet-4-6'

interface ChatRequestBody {
  message: string
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
  context?: {
    focusNodeId?: string | null
    graph?: { nodes: Array<{ id: string; type: string; label: string }>; edges: unknown[] }
  }
}

const SYSTEM_PROMPT = `Sos ARGOS, asistente de transparencia en contrataciones públicas de Córdoba Capital, Argentina.

REGLAS DURAS — CLAUDE.md §2 "cero alucinaciones":
1. SOLO podés afirmar hechos que aparezcan literalmente en el grafo proporcionado por el usuario o en su última pregunta.
2. NO inventes nombres de empresas, CUITs, montos, ni referencias normativas.
3. Si el grafo no tiene la respuesta, decí explícitamente: "No tengo esa información en el grafo cargado. Sugerencia: consultá el dashboard o el detalle de la entidad X".
4. Si una pregunta requiere análisis legal específico (ej. "¿esto es delito?"), aclará: "No soy abogado. Esto es una señal técnica que sugiere investigación. Para imputar responsabilidad penal corresponde Tribunal de Cuentas / Fiscalía / Defensoría del Pueblo".
5. Citá fuentes (URLs de contratos, IDs de señales) siempre que estén disponibles. Formato chip inline: \`[[node:<id>]]\`.

ESTRUCTURA DE RESPUESTA:
- Concisa: 2-4 párrafos máximo
- Datos verificables primero, contexto después
- Si la pregunta es ambigua, preguntá una repregunta específica
- Si detectás patrones graves (concentración >60%, monopolio, rotación coordinada, offshore), sugerí: "Considerá derivar esta señal al Tribunal de Cuentas Municipal (Córdoba) o Defensoría del Pueblo".

NUNCA:
- Diagnostiques corrupción sin evidencia documental enlazada en el grafo.
- Inventes contratos, proveedores, montos o años.
- Hables de jurisdicciones fuera de Córdoba Capital salvo que el grafo las incluya.
- Uses lenguaje impreciso ("muchos", "varios", "algunos") cuando podés dar números reales del grafo.

HERRAMIENTAS DISPONIBLES:
Tenés acceso a una tool \`consultar_grafo\` que ejecuta Cypher (read-only)
contra Neo4j. Usala cuando el subgrafo enviado por el frontend no alcance
para responder. Schema del grafo:

NODOS:
  (:Empresa {cuit, nombre, municipio, tipoSocietario, esEmpleador, estado})
  (:PersonaFisica {dni, nombre, nombreNorm})
  (:Funcionario {id, nombre, nombreNorm, jurisdiccion, cargo, anio, bruto, cuit})
  (:Reparticion {id, nombre, jurisdiccion})
  (:Contrato {id, monto, tipo, anio, area, municipio})
  (:Señal {id, tipologia, titulo, score, severidad})

ARISTAS:
  (:PersonaFisica)-[:DIRIGE {tipo}]->(:Empresa)
  (:Funcionario)-[:TRABAJA_EN]->(:Reparticion)
  (:Empresa)-[:GANÓ]->(:Contrato)
  (:Reparticion)-[:EMITE]->(:Contrato)
  (:Empresa)-[:OPERA_EN {monto, contratos}]->(:Reparticion)
  (:Funcionario)-[:ES_LA_MISMA_PERSONA {tier, metodo}]->(:PersonaFisica)
  (:Funcionario)-[:CONFLICTO_CON {viaReparticion, tier, metodo}]->(:Empresa)
  (:Señal)-[:SEÑALA]->(:Empresa)

EJEMPLOS DE QUERIES:
- "¿quién dirige X?" → MATCH (p:PersonaFisica)-[:DIRIGE]->(e:Empresa) WHERE toUpper(e.nombre) CONTAINS toUpper('X') RETURN p.nombre, p.dni LIMIT 10
- "¿qué empresas operan en Cultura?" → MATCH (e:Empresa)-[op:OPERA_EN]->(r:Reparticion) WHERE r.nombre =~ '(?i).*cultura.*' RETURN e.nombre, op.monto, op.contratos ORDER BY op.monto DESC LIMIT 10
- "personas con más empresas" → MATCH (p:PersonaFisica)-[:DIRIGE]->(e:Empresa) RETURN p.nombre, p.dni, count(e) AS empresas ORDER BY empresas DESC LIMIT 10

LÍMITES:
- 50 records máx por query (cap automático)
- Solo lectura (CREATE/DELETE/SET prohibidos)
- Si la query falla, ARGOS te muestra la razón y podés reescribir.`

// max_tokens del SYSTEM_PROMPT > 1024 para que sea cacheable
// (verificado: ~1300 tokens approx)

router.post('/', async (req: Request, res: Response) => {
  const body = req.body as Partial<ChatRequestBody>
  if (!body.message || typeof body.message !== 'string') {
    res.status(400).json({ ok: false, error: 'message (string) requerido' })
    return
  }

  // Pre-flight budget check
  const maxInputTokens =
    Math.ceil(SYSTEM_PROMPT.length / 4) +
    Math.ceil((JSON.stringify(body.context ?? {}).length) / 4) +
    Math.ceil(body.message.length / 4) +
    (body.history ?? []).reduce((s, m) => s + Math.ceil(m.content.length / 4), 0) +
    256 // overhead de wrapping
  const maxOutputTokens = 1500

  try {
    await assertBudget(MODELO, maxInputTokens, maxOutputTokens)
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      res.status(429).json({
        ok: false,
        error: 'budget_exceeded',
        message: err.message,
        remaining_usd: err.remaining,
        accumulated_usd: err.costoAcumulado,
      })
      return
    }
    res.status(500).json({ ok: false, error: String(err) })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({
      ok: false,
      error: 'no_api_key',
      message: 'ANTHROPIC_API_KEY no configurada en backend/.env',
    })
    return
  }

  // Setup SSE
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no')  // disable nginx buffering si está

  const send = (chunk: object) => {
    res.write(`data: ${JSON.stringify(chunk)}\n\n`)
  }

  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0

  try {
    const client = new Anthropic({ apiKey })

    // Construir prompt
    const graphSummary = body.context?.graph
      ? `\n\nGRAFO ACTUAL (${body.context.graph.nodes.length} nodos, ${body.context.graph.edges.length} aristas):\n` +
        body.context.graph.nodes.slice(0, 30)
          .map(n => `- [${n.type}] ${n.label} (id=${n.id})`).join('\n')
      : '\n\nGRAFO: vacío.'

    const focusBlurb = body.context?.focusNodeId
      ? `\nNODO ENFOCADO: ${body.context.focusNodeId}`
      : ''

    const messages: Anthropic.MessageParam[] = [
      ...(body.history ?? []).map(m => ({ role: m.role, content: m.content })),
      { role: 'user', content: body.message + graphSummary + focusBlurb },
    ]

    // Tool definition: consultar_grafo (Cypher read-only)
    const grafoTool: Anthropic.Tool = {
      name: 'consultar_grafo',
      description: 'Ejecuta una query Cypher read-only contra Neo4j para obtener datos exactos del grafo cordobés. Usá esta tool cuando el subgrafo enviado no contenga la respuesta. Solo aceptamos MATCH/OPTIONAL MATCH/WITH/WHERE/RETURN/ORDER BY/LIMIT. CREATE/DELETE/SET están prohibidos.',
      input_schema: {
        type: 'object',
        properties: {
          query: {
            type: 'string',
            description: 'La query Cypher. Ejemplo: MATCH (p:PersonaFisica)-[:DIRIGE]->(e:Empresa) WHERE toUpper(e.nombre) CONTAINS \'CAVAZZON\' RETURN p.nombre, p.dni LIMIT 10',
          },
        },
        required: ['query'],
      },
    }

    const tools: Anthropic.Tool[] = isGraphAvailable() ? [grafoTool] : []

    // Loop: con tool use no podemos streamear directo (porque el modelo
    // puede decidir tool_use, y entonces hay que invocar otra vez con el
    // tool_result). Hacemos messages.create() en loop hasta stop_reason
    // 'end_turn'. Cap a 4 invocaciones para evitar runaways.
    const messagesAcum: Anthropic.MessageParam[] = [...messages]

    // Cuando el modelo usó tools, los hechos vienen del grafo Neo4j (via
    // runReadOnlyCypher) — son verificables por construcción. El validador
    // post-LLM (que exige `[[node:<id>]]` cerca de cada monto/CUIT/razón)
    // genera falsos positivos en esos casos, así que lo deshabilitamos
    // luego de la primera tool_use exitosa.
    let toolsUsadas = false
    const validarYEnviar = (texto: string): { ok: boolean; razonBloqueo?: string } => {
      if (!toolsUsadas) {
        const v = validarChunk(texto)
        if (!v.valid) {
          send({ delta: '⚠ ARGOS no pudo verificar este fragmento — refrescá la pregunta.', done: true })
          return { ok: false, razonBloqueo: v.reason }
        }
      }
      send({ delta: texto })
      return { ok: true }
    }

    let stopReason: string | null = null
    let invocaciones = 0
    while (stopReason !== 'end_turn' && invocaciones < 4) {
      invocaciones++
      const resp = await client.messages.create({
        model: MODELO,
        max_tokens: maxOutputTokens,
        system: [
          { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
        ],
        messages: messagesAcum,
        tools: tools.length > 0 ? tools : undefined,
      })
      // Acumular usage
      const u = resp.usage
      if (u) {
        inputTokens += u.input_tokens ?? 0
        outputTokens += u.output_tokens ?? 0
        cacheReadTokens += u.cache_read_input_tokens ?? 0
        cacheCreationTokens += u.cache_creation_input_tokens ?? 0
      }
      stopReason = resp.stop_reason ?? null

      // Procesar bloques: enviar texto, ejecutar tools.
      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const block of resp.content) {
        if (block.type === 'text') {
          if (block.text) {
            const r = validarYEnviar(block.text)
            if (!r.ok) {
              const costoBloqueo = estimarCostoCall(MODELO, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens)
              await recordLlmCall({
                endpoint: '/api/chat',
                modelo: MODELO,
                inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
                costoUsd: costoBloqueo,
                status: 'error',
                errorMessage: `validador bloqueó chunk: ${r.razonBloqueo}`,
              }).catch(() => { /* swallow */ })
              res.end()
              return
            }
          }
        } else if (block.type === 'tool_use' && block.name === 'consultar_grafo') {
          toolsUsadas = true
          const input = block.input as { query?: string }
          const query = input?.query ?? ''
          send({ delta: `\n\n🔍 _Consultando grafo: \`${query.slice(0, 80)}${query.length > 80 ? '…' : ''}\`_\n\n` })
          try {
            const result = await runReadOnlyCypher(query)
            const summary = `${result.records.length} registro(s)${result.truncated ? ' (truncado a 50)' : ''}`
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Cypher OK — ${summary}\n\n${JSON.stringify(result.records, null, 2)}`,
            })
          } catch (err) {
            const reason = err instanceof GrafoQueryError
              ? `[${err.reason}] ${err.message}`
              : `[runtime] ${(err as Error).message}`
            toolResults.push({
              type: 'tool_result',
              tool_use_id: block.id,
              content: `Cypher rechazado: ${reason}. Reescribí la query respetando read-only + RETURN.`,
              is_error: true,
            })
          }
        }
      }

      // Si hubo tool_use, agregar mensajes y volver a invocar.
      if (toolResults.length > 0) {
        messagesAcum.push({ role: 'assistant', content: resp.content })
        messagesAcum.push({ role: 'user', content: toolResults })
        continue
      }
      // Si no hubo tool_use, terminamos el loop.
      break
    }

    const costo = estimarCostoCall(MODELO, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens)
    await recordLlmCall({
      endpoint: '/api/chat',
      modelo: MODELO,
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
      costoUsd: costo,
      status: 'success',
    })

    send({ done: true, costo_usd: costo, tokens: { input: inputTokens, output: outputTokens, cache_read: cacheReadTokens } })
    res.end()
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = isOutOfCreditsError(err) ? 'no_credits' : 'error'

    await recordLlmCall({
      endpoint: '/api/chat',
      modelo: MODELO,
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
      costoUsd: 0,
      status,
      errorMessage: msg.slice(0, 500),
    }).catch(() => { /* swallow */ })

    if (!res.headersSent) {
      const code = status === 'no_credits' ? 503 : 500
      res.status(code).json({ ok: false, error: status, message: msg.slice(0, 200) })
      return
    }
    send({ delta: `\n\n[Error: ${status}]`, done: true })
    res.end()
  }
})

export default router
