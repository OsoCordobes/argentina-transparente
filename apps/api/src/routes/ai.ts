import { Router, Request, Response, IRouter } from 'express'
import { z }                                   from 'zod'
import Anthropic                               from '@anthropic-ai/sdk'
import { apiErr }                              from '../lib/api-error'

const router: IRouter = Router()
const client = new Anthropic()

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos un investigador forense especializado en corrupción pública argentina.
Tu función es asistir a periodistas e investigadores en el análisis de contrataciones públicas,
redes empresariales y señales de irregularidades.

REGLAS CRÍTICAS:
- Toda afirmación concreta debe ir acompañada de su fuente (URL + fecha de consulta) cuando esté disponible.
- Nunca afirmés culpabilidad penal. Usá "indica", "sugiere", "es consistente con", "constituye indicio de".
- Cuando la evidencia no alcance, decilo explícitamente.
- Lenguaje técnico pero accesible. Citá normativa argentina relevante (leyes, decretos, artículos).
- Si te preguntán por algo fuera del dominio anti-corrupción, redirigí cortésmente.
- Los hallazgos del sistema ARGOS son señales algorítmicas — interpretaciones investigativas son tuyas.

CONTEXTO LEGAL RELEVANTE:
- Ley Provincial 8614 (Córdoba) — licitaciones públicas
- Ley 27.442 — Defensa de la Competencia
- Ley 25.188 — Ética Pública
- CP arts. 256-268 — delitos contra la administración pública
- Decreto 1023/2001 — régimen de contrataciones del Estado

Respondé siempre en español.`

// ─── Tool definitions ─────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'search_entity',
    description: 'Busca empresas, personas o contratos en la base de datos de ARGOS por nombre o CUIT.',
    input_schema: {
      type: 'object' as const,
      properties: {
        query: { type: 'string', description: 'Nombre de la empresa, persona, o número de CUIT' },
        type:  { type: 'string', enum: ['empresa', 'persona', 'contrato', 'all'], description: 'Tipo de entidad a buscar' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_entity_profile',
    description: 'Obtiene el perfil completo de una entidad (empresa o persona) incluyendo directores, contratos y señales de riesgo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_id: { type: 'string', description: 'ID o CUIT de la entidad' },
        desde:     { type: 'number', description: 'Año desde (default 2019)' },
        hasta:     { type: 'number', description: 'Año hasta (default 2023)' },
      },
      required: ['entity_id'],
    },
  },
  {
    name: 'get_entity_relations',
    description: 'Obtiene la red de relaciones (directores compartidos, contratos vinculados) de una entidad en el grafo.',
    input_schema: {
      type: 'object' as const,
      properties: {
        entity_id: { type: 'string', description: 'ID o CUIT de la entidad' },
      },
      required: ['entity_id'],
    },
  },
]

// ─── Tool executor ────────────────────────────────────────────────────────────

async function executeTool(name: string, input: Record<string, unknown>, baseUrl: string): Promise<string> {
  try {
    switch (name) {
      case 'search_entity': {
        const q    = encodeURIComponent(String(input.query ?? ''))
        const type = input.type ?? 'all'
        const res  = await fetch(`${baseUrl}/api/entidad/search?q=${q}&type=${type}`)
        const data = await res.json() as { results: unknown[]; total: number }
        return JSON.stringify(data, null, 2)
      }

      case 'get_entity_profile': {
        const id   = encodeURIComponent(String(input.entity_id ?? ''))
        const desde = input.desde ?? 2019
        const hasta = input.hasta ?? 2023
        const [profile, senales, timeline] = await Promise.all([
          fetch(`${baseUrl}/api/entidad/${id}`).then(r => r.json()),
          fetch(`${baseUrl}/api/entidad/${id}/senales?desde=${desde}&hasta=${hasta}`).then(r => r.json()),
          fetch(`${baseUrl}/api/entidad/${id}/timeline`).then(r => r.json()),
        ])
        return JSON.stringify({ profile, senales, timeline }, null, 2)
      }

      case 'get_entity_relations': {
        const id  = encodeURIComponent(String(input.entity_id ?? ''))
        const res = await fetch(`${baseUrl}/api/entidad/${id}/relaciones`)
        return JSON.stringify(await res.json(), null, 2)
      }

      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` })
    }
  } catch (err) {
    return JSON.stringify({ error: String(err) })
  }
}

// ─── POST /api/ai/query ───────────────────────────────────────────────────────

const QueryBody = z.object({
  messages: z.array(z.object({
    role:    z.enum(['user', 'assistant']),
    content: z.string(),
  })).min(1),
  case_context: z.object({
    pinned_entities: z.array(z.string()).default([]),
    municipio:       z.string().default('cordoba-capital'),
    periodo:         z.string().default('2019–2023'),
  }).optional(),
})

router.post('/query', async (req: Request, res: Response) => {
  const parse = QueryBody.safeParse(req.body)
  if (!parse.success) return apiErr(res, 400, 'validation_error', 'Invalid request body', parse.error.flatten())

  const { messages, case_context } = parse.data

  // Build the context-enriched system prompt
  const contextBlock = case_context?.pinned_entities.length
    ? `\n\nCONTEXTO DEL CASO ACTIVO:\n- Municipio: ${case_context.municipio}\n- Período: ${case_context.periodo}\n- Entidades en investigación: ${case_context.pinned_entities.join(', ')}`
    : ''

  const systemPrompt = SYSTEM_PROMPT + contextBlock
  const baseUrl = `http://localhost:${process.env.PORT ?? 3002}`

  try {
    // Agentic loop: run until no more tool calls
    const apiMessages: Anthropic.MessageParam[] = messages.map(m => ({
      role:    m.role,
      content: m.content,
    }))

    const systemBlock: Anthropic.TextBlockParam & { cache_control?: { type: 'ephemeral' } } = {
      type:          'text',
      text:          systemPrompt,
      cache_control: { type: 'ephemeral' },
    }

    let response = await client.messages.create({
      model:      'claude-sonnet-4-6',
      max_tokens: 4096,
      system:     [systemBlock],
      tools:      TOOLS,
      messages:   apiMessages,
    })

    // Tool-use loop (up to 5 rounds to avoid runaway)
    let rounds = 0
    while (response.stop_reason === 'tool_use' && rounds < 5) {
      rounds++
      const toolUseBlocks = response.content.filter(
        (b): b is Anthropic.ToolUseBlock => b.type === 'tool_use'
      )

      // Execute all tool calls in parallel
      const toolResults = await Promise.all(
        toolUseBlocks.map(async (block) => {
          const result = await executeTool(block.name, block.input as Record<string, unknown>, baseUrl)
          return {
            type:        'tool_result' as const,
            tool_use_id: block.id,
            content:     result,
          }
        })
      )

      // Continue with tool results (system block cached from first call)
      response = await client.messages.create({
        model:      'claude-sonnet-4-6',
        max_tokens: 4096,
        system:     [systemBlock],
        tools:      TOOLS,
        messages: [
          ...apiMessages,
          { role: 'assistant', content: response.content },
          { role: 'user',      content: toolResults },
        ],
      })
    }

    // Extract final text
    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('\n')

    return res.json({
      text,
      stop_reason: response.stop_reason,
      usage:       response.usage,
    })
  } catch (err) {
    console.error('[ai/query]', err)
    return apiErr(res, 500, 'claude_error', 'Claude API call failed', String(err))
  }
})

// ─── POST /api/ai/suggestions ────────────────────────────────────────────────
// Passive insights for the AI co-investigator sidebar.
// Per HANDOFF §4.3: receives caso_id + pinned_entity_ids, returns 3–5 insight chips.
// Uses Haiku 4.5 (cheap) + prompt caching. Frontend debounces 2s after pin changes.
//
// Response: { suggestions: [{ id, kind, severity?, title, desc, actions }] }
// kind: 'connection' | 'signal' | 'anomaly'

const SUGGESTIONS_SYSTEM = `Sos un asistente de investigación anti-corrupción argentina especializado en detectar patrones sospechosos en contrataciones públicas.

Tu tarea es analizar un conjunto de entidades pinneadas por el investigador en su caso y producir entre 3 y 5 insights breves (chips) de alto valor.

REGLAS:
- Cada insight debe ser accionable: debe sugerir una acción concreta ("Ver relación", "Pinear entidad", "Revisar contratos").
- Sé específico: citá nombres, montos, años cuando estén disponibles en el contexto.
- Nunca afirmés culpabilidad. Usá: "sugiere", "indica", "es consistente con".
- Respondé SOLO con JSON válido — sin texto adicional, sin markdown fences.
- Si hay menos de 2 entidades pinneadas, devolvé 2 sugerencias generales de cómo expandir la investigación.

FORMATO DE RESPUESTA (JSON array, sin envolver en ningún objeto):
[
  {
    "kind": "connection" | "signal" | "anomaly",
    "severity": "grave" | "moderada" | "leve" | null,
    "title": "Título corto (< 80 chars)",
    "desc": "Descripción de 1–2 oraciones. Sé específico.",
    "actions": [
      { "label": "Texto del botón", "target_entity_id": "<id opcional>" }
    ]
  }
]`

const SuggestionsBody = z.object({
  caso_id:           z.string().min(1),
  pinned_entity_ids: z.array(z.string()).min(0).max(50),
})

const suggestionsClient = new Anthropic()

router.post('/suggestions', async (req: Request, res: Response) => {
  const parse = SuggestionsBody.safeParse(req.body)
  if (!parse.success) return apiErr(res, 400, 'validation_error', 'Invalid request body', parse.error.flatten())

  const { caso_id, pinned_entity_ids } = parse.data

  // Build a compact context block for the model from the pinned entity ids.
  // We deliberately keep the prompt minimal — Haiku is fast and cheap, not deep.
  const entityContext = pinned_entity_ids.length > 0
    ? `ENTIDADES PINNEADAS EN EL CASO:\n${pinned_entity_ids.map((id, i) => `${i + 1}. ${id}`).join('\n')}\n\nEl investigador ha pinneado estas entidades. Identificá conexiones, señales y anomalías entre ellas.`
    : `El investigador aún no ha pinneado ninguna entidad. Sugerí 2–3 pasos concretos para iniciar una investigación de contrataciones públicas cordobesas.`

  const systemBlock: Anthropic.TextBlockParam & { cache_control?: { type: 'ephemeral' } } = {
    type:          'text',
    text:          SUGGESTIONS_SYSTEM,
    cache_control: { type: 'ephemeral' }, // system is stable across calls — gets cached
  }

  try {
    const response = await suggestionsClient.messages.create({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      system:     [systemBlock],
      messages:   [{ role: 'user', content: `caso_id: ${caso_id}\n\n${entityContext}` }],
    })

    const raw = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text)
      .join('')
      .trim()

    // Parse and validate — graceful fallback if Haiku returns malformed JSON.
    // Strip markdown fences (```json ... ```) that models sometimes add despite instructions.
    const cleaned = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```\s*$/, '').trim()
    let suggestions: unknown[]
    try {
      const parsed: unknown = JSON.parse(cleaned)
      suggestions = Array.isArray(parsed) ? parsed : []
    } catch {
      console.warn('[ai/suggestions] JSON parse failed, raw:', cleaned.slice(0, 200))
      suggestions = []
    }

    // Stamp each suggestion with a stable id (index-based is fine for ephemeral chips).
    const stamped = suggestions.slice(0, 5).map((s, i) => ({
      id: `sug-${caso_id.slice(0, 8)}-${i}`,
      ...(s as Record<string, unknown>),
    }))

    return res.json({ suggestions: stamped, usage: response.usage })
  } catch (err) {
    console.error('[ai/suggestions]', err)
    return apiErr(res, 500, 'suggestions_failed', 'Suggestions generation failed', String(err))
  }
})

export default router
