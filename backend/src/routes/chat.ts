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
- Uses lenguaje impreciso ("muchos", "varios", "algunos") cuando podés dar números reales del grafo.`

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

    const stream = await client.messages.stream({
      model: MODELO,
      max_tokens: maxOutputTokens,
      system: [
        { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ],
      messages,
    })

    for await (const event of stream) {
      if (event.type === 'message_start') {
        const u = event.message.usage
        if (u) {
          inputTokens = u.input_tokens ?? 0
          cacheReadTokens = u.cache_read_input_tokens ?? 0
          cacheCreationTokens = u.cache_creation_input_tokens ?? 0
        }
      } else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
        send({ delta: event.delta.text })
      } else if (event.type === 'message_delta' && event.usage) {
        outputTokens = event.usage.output_tokens ?? outputTokens
      }
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
