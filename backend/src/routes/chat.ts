/**
 * routes/chat.ts
 *
 * POST /api/chat — streaming SSE endpoint con tool use anti-alucinación.
 *
 * El LLM (Claude Sonnet 4.6) NO recibe el grafo entero en el prompt — usa
 * tools que consultan DuckDB en vivo. Cada respuesta queda anclada a datos
 * reales: si la tool no devuelve nada, el modelo responde "no tengo ese dato".
 *
 * Tools disponibles:
 *   - get_dashboard          → totales + top entidades + señales graves
 *   - search_entidad(q)      → buscar proveedor por nombre
 *   - get_entidad(nombre)    → detalle completo (montos, timeline, señales)
 *   - get_señales_municipio  → todas las señales de una jurisdicción
 *   - get_señales_graves     → top N señales graves
 *
 * Rate limit: 10 req/min por IP (in-memory, reset on restart). Para producción
 * cambiar a Redis o usar middleware dedicado.
 */

import { Router, Request, Response } from 'express'
import Anthropic from '@anthropic-ai/sdk'
import {
  getDashboardMunicipios, getTopEntidades, getSeñalesCache, getSeñalesPorCuit,
  searchEntidades, getContratosPorProveedor, dbAll,
  type EntidadContrato, type SeñalCacheRow,
} from '../lib/db'

const router = Router()
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// ─── Rate limit por IP (in-memory) ───────────────────────────────────────────

const RATE_LIMIT_WINDOW_MS = 60_000
const RATE_LIMIT_MAX = 10
const ipBuckets = new Map<string, number[]>()

function checkRateLimit(ip: string): boolean {
  const now = Date.now()
  const bucket = ipBuckets.get(ip) ?? []
  const recent = bucket.filter((ts) => now - ts < RATE_LIMIT_WINDOW_MS)
  if (recent.length >= RATE_LIMIT_MAX) return false
  recent.push(now)
  ipBuckets.set(ip, recent)
  return true
}

// ─── Tool definitions ────────────────────────────────────────────────────────

const TOOLS: Anthropic.Tool[] = [
  {
    name: 'get_dashboard',
    description:
      'Devuelve estadísticas globales: totales de contratos y señales, top 15 ' +
      'proveedores por monto, municipios cubiertos y señales activas. Usar ' +
      'para preguntas tipo "panorama general", "top proveedores", "qué hay".',
    input_schema: { type: 'object', properties: {}, required: [] },
  },
  {
    name: 'search_entidad',
    description:
      'Busca proveedores por nombre (búsqueda parcial, case-insensitive). ' +
      'Devuelve hasta 30 matches con monto total y municipio. Usar antes de ' +
      'get_entidad cuando el usuario menciona un nombre de empresa.',
    input_schema: {
      type: 'object',
      properties: {
        query: { type: 'string', description: 'Texto a buscar (mín. 2 caracteres)' },
      },
      required: ['query'],
    },
  },
  {
    name: 'get_entidad',
    description:
      'Devuelve detalle completo de un proveedor: monto total, contratos por ' +
      'año (timeline), tipos de contrato, datos AFIP (CUIT, empleador, ' +
      'actividad), señales de riesgo asociadas. Usar cuando el usuario ' +
      'pregunta sobre una empresa específica. El nombre debe ser exacto ' +
      '(usar search_entidad primero si hay duda).',
    input_schema: {
      type: 'object',
      properties: {
        nombre: { type: 'string', description: 'Nombre exacto del proveedor (UPPERCASE)' },
      },
      required: ['nombre'],
    },
  },
  {
    name: 'get_señales_municipio',
    description:
      'Devuelve las señales de riesgo activas en una jurisdicción ' +
      '(cordoba-capital, argentina-compra, caba, santa-fe). Cada señal incluye ' +
      'tipología, severidad (grave/moderada/leve), score y evidencia.',
    input_schema: {
      type: 'object',
      properties: {
        municipio: { type: 'string', description: 'ID del municipio' },
      },
      required: ['municipio'],
    },
  },
  {
    name: 'get_señales_graves',
    description:
      'Devuelve las N señales más graves a nivel global, ordenadas por score. ' +
      'Usar para preguntas tipo "señales más graves", "alertas críticas".',
    input_schema: {
      type: 'object',
      properties: {
        limit: { type: 'number', description: 'Cantidad (default 10, max 30)' },
      },
      required: [],
    },
  },
]

// ─── Tool implementations ─────────────────────────────────────────────────────

function fmtMonto(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

function mapSeñal(s: SeñalCacheRow) {
  return {
    id: s.id,
    municipio: s.municipio,
    tipologia: s.tipologia,
    titulo: s.titulo,
    resumen: s.resumen,
    score: s.score,
    severidad: s.severidad,
    evidencia: JSON.parse(s.evidencia_json),
    legal: JSON.parse(s.legal_json),
  }
}

async function execTool(
  name: string,
  input: Record<string, unknown>
): Promise<string> {
  try {
    switch (name) {
      case 'get_dashboard': {
        const [municipios, top, señales] = await Promise.all([
          getDashboardMunicipios(),
          getTopEntidades(15),
          getSeñalesCache(),
        ])
        const señalesGraves = señales.filter((s) => s.severidad === 'grave').length
        return JSON.stringify({
          municipios: municipios.map((m) => ({
            id: m.municipio,
            contratos: m.total_contratos,
            monto: m.monto_total,
            montoFormateado: fmtMonto(m.monto_total),
            señales: m.total_señales,
          })),
          topEntidades: top.map((e) => ({
            proveedor: e.proveedor,
            municipio: e.municipio,
            monto: e.monto_total,
            montoFormateado: fmtMonto(e.monto_total),
            contratos: e.total_contratos,
            señales: e.señales,
          })),
          totalSeñales: señales.length,
          señalesGraves,
        })
      }

      case 'search_entidad': {
        const q = String(input.query ?? '').trim()
        if (q.length < 2) return JSON.stringify({ error: 'Query muy corto' })
        const ents = await searchEntidades(q, 30)
        return JSON.stringify({
          count: ents.length,
          entidades: ents.map((e) => ({
            proveedor: e.proveedor,
            municipio: e.municipio,
            monto: e.monto_total,
            montoFormateado: fmtMonto(e.monto_total),
            contratos: e.total_contratos,
            señales: e.señales,
          })),
        })
      }

      case 'get_entidad': {
        const nombre = String(input.nombre ?? '').toUpperCase()
        const contratos = await getContratosPorProveedor(nombre)
        if (contratos.length === 0) {
          return JSON.stringify({ encontrado: false, nombre })
        }

        const montoTotal = contratos.reduce((s, c) => s + c.monto, 0)
        const anios = [...new Set(contratos.map((c) => c.anio))].sort()

        const porAnio = new Map<number, { cantidad: number; monto: number }>()
        for (const c of contratos) {
          const prev = porAnio.get(c.anio) ?? { cantidad: 0, monto: 0 }
          porAnio.set(c.anio, { cantidad: prev.cantidad + 1, monto: prev.monto + c.monto })
        }
        const timeline = Array.from(porAnio.entries())
          .map(([anio, data]) => ({ anio, ...data }))
          .sort((a, b) => a.anio - b.anio)

        const empresaRows = await dbAll<{
          cuit: string
          es_empleador: boolean
          inicio_actividades: string | null
          estado: string | null
          actividad_principal: string | null
        }>(`SELECT * FROM empresas WHERE UPPER(nombre) = ? LIMIT 1`, [nombre])
        const afip = empresaRows[0] ?? null

        const señales = afip?.cuit ? (await getSeñalesPorCuit(afip.cuit)).map(mapSeñal) : []

        return JSON.stringify({
          encontrado: true,
          nombre,
          montoTotal,
          montoFormateado: fmtMonto(montoTotal),
          totalContratos: contratos.length,
          anios,
          municipios: [...new Set(contratos.map((c) => c.municipio))],
          afip: afip ? {
            cuit: afip.cuit,
            esEmpleador: afip.es_empleador,
            inicioActividades: afip.inicio_actividades,
            estado: afip.estado,
            actividadPrincipal: afip.actividad_principal,
          } : null,
          timeline,
          señales: señales.map((s) => ({
            id: s.id,
            titulo: s.titulo,
            resumen: s.resumen,
            severidad: s.severidad,
            score: s.score,
            tipologia: s.tipologia,
          })),
        })
      }

      case 'get_señales_municipio': {
        const muni = String(input.municipio ?? '')
        const señales = await getSeñalesCache(muni)
        return JSON.stringify({
          municipio: muni,
          count: señales.length,
          señales: señales.map(mapSeñal),
        })
      }

      case 'get_señales_graves': {
        const limit = Math.min(Number(input.limit) || 10, 30)
        const todas = await getSeñalesCache()
        const graves = todas
          .filter((s) => s.severidad === 'grave')
          .sort((a, b) => b.score - a.score)
          .slice(0, limit)
          .map(mapSeñal)
        return JSON.stringify({ count: graves.length, señales: graves })
      }

      default:
        return JSON.stringify({ error: `Tool desconocida: ${name}` })
    }
  } catch (err) {
    return JSON.stringify({ error: `Error ejecutando ${name}: ${String(err)}` })
  }
}

// ─── System prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos ARGOS, un asistente de investigación de gasto público argentino.

PRINCIPIO INVIOLABLE: cero alucinaciones. Solo respondés desde resultados de tools.
Si no tenés un dato concreto, decís "no tengo ese dato registrado" — NUNCA lo inventés.

ESTILO:
- Español argentino (vos, no tú).
- Respuestas concisas: 1 a 3 párrafos máximo.
- Markdown limitado: **negrita** para nombres y montos clave.
- Montos en ARS con separadores (ej: $1.234.567).
- Numerá listas si tiene sentido.

PROCESO:
1. Si el usuario menciona una empresa, primero llamá search_entidad para confirmar que existe.
2. Para datos específicos, llamá get_entidad con el nombre EXACTO devuelto por search.
3. Para "panorama general" o "qué hay", get_dashboard.
4. Para señales globales, get_señales_graves. Para municipales, get_señales_municipio.
5. Cita la severidad (grave/moderada/leve) y score cuando hables de señales.
6. Si la tool devuelve {encontrado: false}, decí que no tenés ese dato.

CONTEXTO INICIAL: el usuario puede estar viendo un nodo enfocado del grafo —
el frontend te lo pasa en el mensaje del sistema. Respondé en ese contexto si aplica.`

// ─── SSE helpers ──────────────────────────────────────────────────────────────

function sse(res: Response, payload: Record<string, unknown>) {
  res.write(`data: ${JSON.stringify(payload)}\n\n`)
}

// ─── Endpoint ─────────────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const ip = req.ip ?? req.socket.remoteAddress ?? 'unknown'
  if (!checkRateLimit(ip)) {
    return res.status(429).json({ ok: false, error: 'Rate limit excedido (10/min). Esperá un minuto.' })
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return res.status(503).json({ ok: false, error: 'ANTHROPIC_API_KEY no configurada en el servidor' })
  }

  const { message, focusNodeId } = req.body as { message?: string; focusNodeId?: string | null }
  if (!message || typeof message !== 'string' || message.trim().length === 0) {
    return res.status(400).json({ ok: false, error: 'Falta "message" en el body' })
  }

  // SSE headers
  res.setHeader('Content-Type', 'text/event-stream')
  res.setHeader('Cache-Control', 'no-cache')
  res.setHeader('Connection', 'keep-alive')
  res.setHeader('X-Accel-Buffering', 'no') // disable nginx buffering
  res.flushHeaders?.()

  const userMessage = focusNodeId
    ? `[Contexto: el usuario está viendo el nodo "${focusNodeId}" en el grafo]\n\n${message.trim()}`
    : message.trim()

  const conversation: Anthropic.MessageParam[] = [{ role: 'user', content: userMessage }]

  try {
    // Loop: ejecutar turn hasta que el modelo deje de pedir tools
    let turn = 0
    const MAX_TURNS = 5

    while (turn < MAX_TURNS) {
      turn++

      const response = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 1024,
        system: SYSTEM_PROMPT,
        tools: TOOLS,
        messages: conversation,
        stream: true,
      })

      let currentText = ''
      const toolUses: { id: string; name: string; input: string }[] = []
      let currentToolUse: { id: string; name: string; input: string } | null = null
      const assistantContent: Anthropic.ContentBlock[] = []
      let stopReason: string | null = null

      for await (const event of response) {
        if (event.type === 'content_block_start') {
          if (event.content_block.type === 'tool_use') {
            currentToolUse = {
              id: event.content_block.id,
              name: event.content_block.name,
              input: '',
            }
          } else if (event.content_block.type === 'text') {
            currentText = ''
          }
        } else if (event.type === 'content_block_delta') {
          if (event.delta.type === 'text_delta') {
            const delta = event.delta.text
            currentText += delta
            sse(res, { delta })
          } else if (event.delta.type === 'input_json_delta' && currentToolUse) {
            currentToolUse.input += event.delta.partial_json
          }
        } else if (event.type === 'content_block_stop') {
          if (currentToolUse) {
            toolUses.push(currentToolUse)
            assistantContent.push({
              type: 'tool_use',
              id: currentToolUse.id,
              name: currentToolUse.name,
              input: JSON.parse(currentToolUse.input || '{}'),
            } as Anthropic.ContentBlock)
            currentToolUse = null
          } else if (currentText) {
            assistantContent.push({ type: 'text', text: currentText, citations: null } as Anthropic.ContentBlock)
            currentText = ''
          }
        } else if (event.type === 'message_delta') {
          if (event.delta.stop_reason) stopReason = event.delta.stop_reason
        }
      }

      // Si no llamó tools, terminamos
      if (toolUses.length === 0 || stopReason !== 'tool_use') {
        break
      }

      // Append assistant turn + tool results
      conversation.push({ role: 'assistant', content: assistantContent })

      const toolResults: Anthropic.ToolResultBlockParam[] = []
      for (const tu of toolUses) {
        const result = await execTool(tu.name, JSON.parse(tu.input || '{}'))
        toolResults.push({
          type: 'tool_result',
          tool_use_id: tu.id,
          content: result,
        })
      }
      conversation.push({ role: 'user', content: toolResults })
    }

    sse(res, { done: true })
    res.end()
  } catch (err) {
    console.error('[chat] Error:', err)
    sse(res, { error: String(err), done: true })
    res.end()
  }
})

export default router
