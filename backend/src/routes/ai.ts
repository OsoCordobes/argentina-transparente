// routes/ai.ts — Endpoints LLM auxiliares
//
// POST /api/ai/suggestions  → sugerencias pasivas (Haiku 4.5, cacheable)
// POST /api/ai/analyze-signal → análisis breve de una señal específica (Haiku)
//
// Usa Haiku 4.5 (~$0.80 input / $4 output per Mtok) para mantener costo
// por call < $0.005. System prompt cacheable amortiza ~70% del input.

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
const MODELO: ModeloSoportado = 'claude-haiku-4-5-20251001'

interface SuggestionsRequestBody {
  caso_id?: string
  pinned_entity_ids?: string[]
  /** Lista mínima de nodos del grafo para que el modelo sepa de qué hablar */
  entities?: Array<{
    id: string
    type: string
    label: string
    severidad?: string
    monto?: number
    cantidad?: number
  }>
}

interface Suggestion {
  id: string
  kind: 'verify' | 'investigate' | 'escalate' | 'cross_check'
  severity: 'info' | 'warning' | 'critical'
  title: string
  desc: string
  /** Acciones concretas con node IDs reales si aplica */
  actions: Array<{ label: string; target_entity_id?: string }>
}

const SYSTEM_PROMPT_SUGGESTIONS = `Sos un analista de transparencia que produce SUGERENCIAS DE INVESTIGACIÓN ciudadana sobre contratos públicos de Córdoba Capital.

REGLAS DURAS — CLAUDE.md §2:
1. SOLO usás IDs/nombres/montos que aparezcan literalmente en el array \`entities\` del request.
2. NO inventás CUITs, nombres de empresas, o datos no presentes.
3. Las sugerencias deben ser ACCIONABLES por un ciudadano (FOIA, mirar tal contrato, cruzar con tal entidad), no genéricas.
4. Si \`entities\` está vacío o sin patrones claros, devolvé un array vacío. Mejor 0 sugerencias que 5 inventadas.

TIPOS DE SUGERENCIA (elegí el más adecuado):
- verify: información que requiere validación documental ("verificar contrato X en Boletín Oficial")
- investigate: profundizar análisis ("revisar adjudicaciones del proveedor X en años Y-Z")
- escalate: derivar a autoridad competente ("derivar a Tribunal de Cuentas Municipal Córdoba")
- cross_check: cruzar con otra entidad ("cruzar director X con empresas Y, Z")

SEVERIDAD:
- critical: patrón de captura de área, monopolio >80%, offshore, sanción internacional
- warning: concentración 35-80%, fraccionamiento, prórrogas excesivas
- info: anomalía menor, dato curioso

OUTPUT — JSON estricto, sin texto adicional:
{ "suggestions": [ {"id":"<slug>","kind":"...","severity":"...","title":"...","desc":"...","actions":[{"label":"...","target_entity_id":"..."}]} ] }

Devuelve hasta 5 sugerencias, ordenadas por severidad descendente.`

router.post('/suggestions', async (req: Request, res: Response) => {
  const body = req.body as Partial<SuggestionsRequestBody>
  const entities = body.entities ?? []

  if (entities.length === 0) {
    res.json({ ok: true, suggestions: [] })
    return
  }

  // Pre-flight
  const inputTokensProy = Math.ceil(SYSTEM_PROMPT_SUGGESTIONS.length / 4) +
                           Math.ceil(JSON.stringify(entities).length / 4) +
                           128
  const outputTokensProy = 800

  try {
    await assertBudget(MODELO, inputTokensProy, outputTokensProy)
  } catch (err) {
    if (err instanceof BudgetExceededError) {
      res.status(429).json({
        ok: false,
        error: 'budget_exceeded',
        message: err.message,
        remaining_usd: err.remaining,
      })
      return
    }
    res.status(500).json({ ok: false, error: String(err) })
    return
  }

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    res.status(503).json({ ok: false, error: 'no_api_key' })
    return
  }

  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheCreationTokens = 0

  try {
    const client = new Anthropic({ apiKey })
    const userMsg = `caso_id: ${body.caso_id ?? 'sin-caso'}\npinned_entity_ids: ${(body.pinned_entity_ids ?? []).join(', ') || '(ninguno)'}\nentities:\n` +
      entities.map(e => `- [${e.type}${e.severidad ? '/' + e.severidad : ''}] ${e.label} (id=${e.id})${e.monto ? ` monto=$${e.monto.toLocaleString('es-AR')}` : ''}${e.cantidad ? ` n=${e.cantidad}` : ''}`).join('\n')

    const response = await client.messages.create({
      model: MODELO,
      max_tokens: outputTokensProy,
      system: [
        { type: 'text', text: SYSTEM_PROMPT_SUGGESTIONS, cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userMsg }],
    })

    inputTokens = response.usage?.input_tokens ?? 0
    outputTokens = response.usage?.output_tokens ?? 0
    cacheReadTokens = response.usage?.cache_read_input_tokens ?? 0
    cacheCreationTokens = response.usage?.cache_creation_input_tokens ?? 0

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map(b => b.text).join('')

    let suggestions: Suggestion[] = []
    try {
      // Strip code fences si Haiku los pone
      const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned)
      suggestions = Array.isArray(parsed.suggestions) ? parsed.suggestions : []
    } catch {
      suggestions = []
    }

    const costo = estimarCostoCall(MODELO, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens)
    await recordLlmCall({
      endpoint: '/api/ai/suggestions',
      modelo: MODELO,
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
      costoUsd: costo,
      status: 'success',
    })

    res.json({
      ok: true,
      suggestions,
      costo_usd: costo,
      cache_hit_pct: inputTokens > 0 ? Math.round((cacheReadTokens / inputTokens) * 100) : 0,
    })
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    const status = isOutOfCreditsError(err) ? 'no_credits' : 'error'
    await recordLlmCall({
      endpoint: '/api/ai/suggestions',
      modelo: MODELO,
      inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
      costoUsd: 0,
      status,
      errorMessage: msg.slice(0, 500),
    }).catch(() => { /* swallow */ })

    res.status(status === 'no_credits' ? 503 : 500).json({
      ok: false, error: status, message: msg.slice(0, 200),
    })
  }
})

// ─── GET /api/ai/usage ───────────────────────────────────────────────────────
// Devuelve costos acumulados de la semana actual + budget.
import { ANTHROPIC_BUDGET_USD, getCostoAcumulado, getCostoPorRoute } from '../lib/budget-guard'

router.get('/usage', async (_req: Request, res: Response) => {
  try {
    const acumulado = await getCostoAcumulado()
    const porChat = await getCostoPorRoute('/api/chat')
    const porSug = await getCostoPorRoute('/api/ai/suggestions')
    res.json({
      ok: true,
      budget_usd: ANTHROPIC_BUDGET_USD,
      acumulado_semana_usd: acumulado,
      remaining_usd: Math.max(0, ANTHROPIC_BUDGET_USD - acumulado),
      por_endpoint: {
        '/api/chat': porChat,
        '/api/ai/suggestions': porSug,
      },
    })
  } catch (err) {
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
