/**
 * chatResolver.ts
 *
 * Resuelve mensajes del usuario contra el grafo en memoria.
 * No llama a ningún LLM — responde desde datos reales del backend.
 * Genera ChatChunk[] sincrónicamente (el streaming se simula en ChatThread).
 *
 * Cuando el backend implemente POST /api/chat streaming, esta función
 * se reemplaza por un fetch() SSE y los chunks vienen del servidor.
 * Ver: frontend/PENDIENTES-BACKEND.md
 */

import type { ChatChunk, ArgosGraph, ArgosNode, ChatContext } from './types'
import { fmtARS } from '../format'
import { getNeighbors } from './graphFromData'

// ─── Tipos de intención ───────────────────────────────────────────────────────

type Intent =
  | 'señales_riesgo'
  | 'directores'
  | 'facturacion'
  | 'comparacion'
  | 'contratos'
  | 'navegar_nodo'
  | 'ayuda'
  | 'desconocido'

// ─── Detección de intención ───────────────────────────────────────────────────

const PATTERNS: { pattern: RegExp; intent: Intent }[] = [
  { pattern: /\b(señal|señales|riesgo|alerta|irregular|sospech|fraude|corrup)/i, intent: 'señales_riesgo' },
  { pattern: /\b(director|directores|socio|socios|igj|autoridad)/i, intent: 'directores' },
  { pattern: /\b(cuánto|cuanto|factur|monto|gast|contrat|pag[oó]|millones?|pesos)/i, intent: 'facturacion' },
  { pattern: /\b(compar|versus|vs\.?|otro|más alto|más bajo|ranking|top)/i, intent: 'comparacion' },
  { pattern: /\b(contrato|licitaci|compra|adjudic|tipo)/i, intent: 'contratos' },
  { pattern: /\b(ayuda|qué puedo|que puedo|cómo|como usar|instruc)/i, intent: 'ayuda' },
]

function detectIntent(msg: string): Intent {
  // Detectar si piden navegar a una entidad ("mostrame X", "ir a X", "buscar X")
  if (/\b(mostrame|mostrá|busca|ir a|ver|abri|vamos a|focalizá|focaliza)\b/i.test(msg)) {
    return 'navegar_nodo'
  }
  for (const { pattern, intent } of PATTERNS) {
    if (pattern.test(msg)) return intent
  }
  return 'desconocido'
}

// ─── Resolvers por intención ──────────────────────────────────────────────────

function resolveSeñalesRiesgo(ctx: ChatContext): ChatChunk[] {
  const { graph, focusNodeId } = ctx

  // Si hay un nodo enfocado, hablar de sus señales
  if (focusNodeId) {
    const node = graph.nodes.find((n) => n.id === focusNodeId)
    if (!node) return [{ delta: 'No encontré el nodo seleccionado.', done: true }]

    const señalesNeighbors = getNeighbors(graph, focusNodeId).filter((n) => n.type === 'señal')

    if (señalesNeighbors.length === 0) {
      return [
        { delta: `**${node.label}** no tiene señales de riesgo registradas en el grafo actual.` },
        { delta: ' Podés ver más detalles haciendo clic en el nodo.', done: true },
      ]
    }

    const graves = señalesNeighbors.filter((s) => s.flags?.severidad === 'grave')
    const mod = señalesNeighbors.filter((s) => s.flags?.severidad === 'moderada')

    const chunks: ChatChunk[] = [
      { delta: `**${node.label}** tiene ${señalesNeighbors.length} señal${señalesNeighbors.length > 1 ? 'es' : ''} de riesgo:\n\n` },
    ]

    for (const s of señalesNeighbors) {
      const sev = s.flags?.severidad ?? 'leve'
      const emoji = sev === 'grave' ? '🔴' : sev === 'moderada' ? '🟠' : '🟡'
      chunks.push({ delta: `${emoji} **${s.label}**\n`, entidades: [{ id: s.id, type: s.type, label: s.label }] })
    }

    if (graves.length > 0) {
      chunks.push({ delta: `\nTiene ${graves.length} señal${graves.length > 1 ? 'es' : ''} **grave${graves.length > 1 ? 's' : ''}** — recomiendo revisar el panel de detalle.` })
    }

    chunks.push({ done: true })
    return chunks
  }

  // Sin foco: resumen global de señales graves en el grafo
  const señalesGraves = graph.nodes.filter(
    (n) => n.type === 'señal' && n.flags?.severidad === 'grave'
  )

  if (señalesGraves.length === 0) {
    return [
      { delta: 'No hay señales graves en el grafo actual. Buscá una entidad o jurisdicción para analizar.' },
      { done: true },
    ]
  }

  const chunks: ChatChunk[] = [
    { delta: `Hay **${señalesGraves.length} señal${señalesGraves.length > 1 ? 'es' : ''} grave${señalesGraves.length > 1 ? 's' : ''}** en el grafo:\n\n` },
  ]

  for (const s of señalesGraves.slice(0, 5)) {
    const d = s.data as { municipio?: string; resumen?: string }
    chunks.push({
      delta: `🔴 **${s.label}**${d.municipio ? ` (${d.municipio})` : ''}\n`,
      entidades: [{ id: s.id, type: s.type, label: s.label }],
    })
  }

  if (señalesGraves.length > 5) {
    chunks.push({ delta: `\n… y ${señalesGraves.length - 5} más. Seleccioná una entidad para profundizar.` })
  }

  chunks.push({ done: true })
  return chunks
}

function resolveFacturacion(ctx: ChatContext): ChatChunk[] {
  const { graph, focusNodeId } = ctx

  if (focusNodeId) {
    const node = graph.nodes.find((n) => n.id === focusNodeId)
    if (!node) return [{ delta: 'Nodo no encontrado.', done: true }]

    const d = node.data as Record<string, unknown>
    const monto = (d.monto_total ?? d.montoTotal) as number | undefined
    const contratos = (d.total_contratos ?? d.totalContratos) as number | undefined

    if (monto != null) {
      const chunks: ChatChunk[] = [
        { delta: `**${node.label}** facturó ` },
        { delta: `**${fmtARS(monto)}**` },
      ]
      if (contratos != null) {
        chunks.push({ delta: ` en **${contratos} contrato${contratos > 1 ? 's' : ''}**` })
      }
      const years = (d.anio_max as number) - (d.anio_min as number)
      if (!isNaN(years) && years > 0) {
        chunks.push({ delta: ` (activa por ${years + 1} años)` })
      }
      chunks.push({ delta: '.', done: true })
      return chunks
    }

    return [
      { delta: `No tengo datos de facturación para **${node.label}** en el grafo actual.`, done: true },
    ]
  }

  // Top proveedores por monto
  const proveedores = graph.nodes
    .filter((n) => n.type === 'proveedor')
    .map((n) => {
      const d = n.data as Record<string, unknown>
      return { node: n, monto: ((d.monto_total ?? d.montoTotal) as number) ?? 0 }
    })
    .filter((x) => x.monto > 0)
    .sort((a, b) => b.monto - a.monto)
    .slice(0, 5)

  if (proveedores.length === 0) {
    return [{ delta: 'Buscá una entidad para ver su facturación.', done: true }]
  }

  const chunks: ChatChunk[] = [
    { delta: `Los **${proveedores.length} proveedores con mayor gasto** en el grafo:\n\n` },
  ]

  for (let i = 0; i < proveedores.length; i++) {
    const { node, monto } = proveedores[i]
    chunks.push({
      delta: `**${i + 1}. ${node.label}** — ${fmtARS(monto)}\n`,
      entidades: [{ id: node.id, type: node.type, label: node.label }],
    })
  }

  chunks.push({ done: true })
  return chunks
}

function resolveDirectores(ctx: ChatContext): ChatChunk[] {
  const { graph, focusNodeId } = ctx

  if (focusNodeId) {
    const node = graph.nodes.find((n) => n.id === focusNodeId)
    const directores = getNeighbors(graph, focusNodeId).filter((n) => n.type === 'director')

    if (directores.length === 0) {
      return [
        {
          delta: node
            ? `No hay directores en el grafo para **${node.label}**. Los datos de IGJ pueden no estar disponibles.`
            : 'Sin datos de directores.',
        },
        { done: true },
      ]
    }

    const chunks: ChatChunk[] = [
      { delta: `**${node?.label}** tiene ${directores.length} director${directores.length > 1 ? 'es' : ''} registrado${directores.length > 1 ? 's' : ''}:\n\n` },
    ]
    for (const d of directores) {
      chunks.push({ delta: `👤 **${d.label}**\n`, entidades: [{ id: d.id, type: d.type, label: d.label }] })
    }
    chunks.push({ done: true })
    return chunks
  }

  const directores = graph.nodes.filter((n) => n.type === 'director')
  if (directores.length === 0) {
    return [
      { delta: 'No hay datos de directores en el grafo actual. Buscá una empresa para cargar su red IGJ.', done: true },
    ]
  }

  return [
    { delta: `Hay **${directores.length} director${directores.length > 1 ? 'es' : ''}** en el grafo. Seleccioná una empresa para ver sus directores.`, done: true },
  ]
}

function resolveContratos(ctx: ChatContext): ChatChunk[] {
  const { graph, focusNodeId } = ctx

  if (focusNodeId) {
    const node = graph.nodes.find((n) => n.id === focusNodeId)
    const contratosNeighbors = getNeighbors(graph, focusNodeId).filter((n) => n.type === 'contrato')

    if (contratosNeighbors.length > 0) {
      const chunks: ChatChunk[] = [
        { delta: `**${node?.label}** tiene ${contratosNeighbors.length} contrato${contratosNeighbors.length > 1 ? 's' : ''} en el grafo:\n\n` },
      ]
      for (const c of contratosNeighbors.slice(0, 5)) {
        const d = c.data as Record<string, unknown>
        chunks.push({
          delta: `📄 ${d.tipo ?? 'Contrato'} — ${d.monto != null ? fmtARS(d.monto as number) : 'S/M'} (${d.anio ?? ''})\n`,
          entidades: [{ id: c.id, type: c.type, label: c.label }],
        })
      }
      chunks.push({ done: true })
      return chunks
    }

    const d = node?.data as Record<string, unknown> | undefined
    if (d?.totalContratos || d?.total_contratos) {
      const total = (d.totalContratos ?? d.total_contratos) as number
      return [
        { delta: `**${node?.label}** tiene **${total} contrato${total > 1 ? 's' : ''}** registrados. Abrí la ficha completa para verlos en detalle.`, done: true },
      ]
    }
  }

  const totalContratos = graph.nodes
    .filter((n) => n.type === 'jurisdiccion')
    .reduce((sum, n) => {
      const d = n.data as Record<string, unknown>
      return sum + ((d.total_contratos as number) ?? 0)
    }, 0)

  if (totalContratos > 0) {
    return [
      { delta: `El grafo cubre **${totalContratos.toLocaleString('es-AR')} contratos**. Seleccioná una entidad o jurisdicción para ver detalles.`, done: true },
    ]
  }

  return [{ delta: 'Buscá una entidad para ver sus contratos.', done: true }]
}

function resolveComparacion(ctx: ChatContext): ChatChunk[] {
  const { graph } = ctx

  const municipios = graph.nodes.filter((n) => n.type === 'jurisdiccion')
  if (municipios.length < 2) {
    return [
      { delta: 'Necesito al menos dos jurisdicciones en el grafo para comparar. Buscá más municipios o usá el panel /municipios.', done: true },
    ]
  }

  const conMonto = municipios
    .map((n) => {
      const d = n.data as Record<string, unknown>
      return { node: n, monto: (d.monto_total as number) ?? 0 }
    })
    .filter((x) => x.monto > 0)
    .sort((a, b) => b.monto - a.monto)

  if (conMonto.length === 0) {
    return [{ delta: 'No tengo datos de monto para comparar las jurisdicciones.', done: true }]
  }

  const chunks: ChatChunk[] = [
    { delta: `Comparación por gasto (mayor a menor):\n\n` },
  ]
  for (let i = 0; i < conMonto.length; i++) {
    const { node, monto } = conMonto[i]
    chunks.push({
      delta: `**${i + 1}. ${node.label}** — ${fmtARS(monto)}\n`,
      entidades: [{ id: node.id, type: node.type, label: node.label }],
    })
  }
  chunks.push({ done: true })
  return chunks
}

function resolveNavegar(msg: string, ctx: ChatContext): ChatChunk[] {
  const { graph } = ctx

  // Extraer nombre candidato: todo lo que viene después del verbo
  const match = msg.match(
    /(?:mostrame|mostrá|busca|ir a|ver|abri|vamos a|focalizá|focaliza)\s+(?:la?|los?|una?|el)?\s*(.+)/i
  )
  const query = match?.[1]?.trim().toLowerCase() ?? ''

  if (!query) {
    return [{ delta: 'Decime el nombre de la entidad que querés ver.', done: true }]
  }

  const candidates = graph.nodes
    .filter((n) => n.label.toLowerCase().includes(query) || n.id.includes(query))
    .slice(0, 3)

  if (candidates.length === 0) {
    return [
      { delta: `No encontré "${query}" en el grafo actual. Probá buscar en la barra de búsqueda (⌘K).`, done: true },
    ]
  }

  if (candidates.length === 1) {
    return [
      { delta: `Mostrando **${candidates[0].label}**…`, entidades: [{ id: candidates[0].id, type: candidates[0].type, label: candidates[0].label }] },
      { focus: { nodeId: candidates[0].id }, done: true },
    ]
  }

  const chunks: ChatChunk[] = [
    { delta: `Encontré ${candidates.length} opciones:\n\n` },
  ]
  for (const c of candidates) {
    chunks.push({ delta: `• **${c.label}** (${c.type})\n`, entidades: [{ id: c.id, type: c.type, label: c.label }] })
  }
  chunks.push({ delta: '\nHacé clic en el que buscás.', done: true })
  return chunks
}

function resolveAyuda(): ChatChunk[] {
  return [
    { delta: 'Podés preguntarme:\n\n' },
    { delta: '• **Señales de riesgo** — "¿qué señales tiene esta empresa?"\n' },
    { delta: '• **Facturación** — "¿cuánto cobró?" / "top proveedores"\n' },
    { delta: '• **Directores** — "¿quiénes dirigen X?"\n' },
    { delta: '• **Contratos** — "contratos de Y en 2022"\n' },
    { delta: '• **Comparación** — "comparar municipios"\n' },
    { delta: '• **Navegar** — "mostrame Empresa ABC"\n\n' },
    { delta: 'O hacé clic directamente en cualquier nodo del grafo.', done: true },
  ]
}

function resolveDesconocido(msg: string, ctx: ChatContext): ChatChunk[] {
  // Intentar buscar por nombre directamente
  const lower = msg.toLowerCase()
  const candidates = ctx.graph.nodes.filter(
    (n) =>
      n.label.toLowerCase().includes(lower) ||
      (n.subtitle ?? '').toLowerCase().includes(lower)
  )

  if (candidates.length === 1) {
    return [
      { delta: `¿Te referís a **${candidates[0].label}**?`, entidades: [{ id: candidates[0].id, type: candidates[0].type, label: candidates[0].label }] },
      { focus: { nodeId: candidates[0].id }, done: true },
    ]
  }

  if (candidates.length > 1) {
    const chunks: ChatChunk[] = [
      { delta: `Encontré ${candidates.length} entidades relacionadas:\n\n` },
    ]
    for (const c of candidates.slice(0, 4)) {
      chunks.push({ delta: `• **${c.label}**\n`, entidades: [{ id: c.id, type: c.type, label: c.label }] })
    }
    chunks.push({ delta: '\nHacé clic para enfocar.', done: true })
    return chunks
  }

  return [
    { delta: 'No entendí bien la consulta. Podés preguntarme sobre señales, contratos, facturación o directores. Escribí **ayuda** para ver ejemplos.', done: true },
  ]
}

// ─── Entry point ──────────────────────────────────────────────────────────────

/**
 * Resuelve un mensaje del usuario contra el contexto del grafo.
 * Retorna un array de ChatChunk para simular streaming.
 */
export function resolveChat(msg: string, ctx: ChatContext): ChatChunk[] {
  const intent = detectIntent(msg)

  switch (intent) {
    case 'señales_riesgo': return resolveSeñalesRiesgo(ctx)
    case 'facturacion':    return resolveFacturacion(ctx)
    case 'directores':     return resolveDirectores(ctx)
    case 'contratos':      return resolveContratos(ctx)
    case 'comparacion':    return resolveComparacion(ctx)
    case 'navegar_nodo':   return resolveNavegar(msg, ctx)
    case 'ayuda':          return resolveAyuda()
    default:               return resolveDesconocido(msg, ctx)
  }
}

// ─── Chips contextuales ───────────────────────────────────────────────────────

/**
 * Genera sugerencias de chips según el nodo enfocado y el estado del grafo.
 * Se muestran sobre el input del chat.
 */
export function getContextChips(ctx: ChatContext): string[] {
  const { focusNodeId, graph } = ctx

  if (focusNodeId) {
    const node = graph.nodes.find((n) => n.id === focusNodeId)
    if (!node) return []

    const base: string[] = []
    if (node.type === 'proveedor' || node.type === 'jurisdiccion') {
      base.push('¿Qué señales tiene?', '¿Cuánto facturó?', '¿Quiénes son sus directores?')
    }
    if (node.type === 'señal') {
      base.push('¿Qué evidencia tiene?', '¿A qué empresas afecta?', '¿Dónde denunciar?')
    }
    if (node.type === 'contrato') {
      base.push('¿Qué tipo de contrato es?', '¿Hay señales asociadas?')
    }
    return base
  }

  const señalesGraves = graph.nodes.filter((n) => n.type === 'señal' && n.flags?.severidad === 'grave').length
  const chips = ['Top proveedores por monto', 'Señales más graves']
  if (señalesGraves > 0) chips.unshift(`${señalesGraves} señales graves`)
  return chips.slice(0, 3)
}
