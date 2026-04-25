/**
 * graphFromData.ts
 *
 * Construye un ArgosGraph a partir de los datos del backend.
 * Entrada: respuesta de /api/dashboard (DashboardResponse).
 * Salida: ArgosGraph con nodos y aristas listos para d3-force.
 *
 * NO hace fetch — recibe los datos ya resueltos por React Query.
 */

import type {
  ArgosGraph,
  ArgosNode,
  ArgosEdge,
} from './types'
import type { DashboardResponse, EntidadDetalle, SeñalDashboard } from '../queries'

// ─── Normalización ────────────────────────────────────────────────────────────

/** Normaliza nombre para usar como ID estable (lowercase, sin dobles espacios). */
export function normalizeId(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, ' ')
}

function clamp(v: number, min: number, max: number) {
  return Math.max(min, Math.min(max, v))
}

// ─── Desde Dashboard ─────────────────────────────────────────────────────────

/**
 * Construye el grafo inicial desde la respuesta del Dashboard.
 * Nodos: municipios (jurisdiccion) + top entidades (proveedor) + señales graves.
 * Aristas: proveedor→jurisdiccion (opera_en), proveedor→señal (señalado_por).
 */
export function graphFromDashboard(data: DashboardResponse): ArgosGraph {
  const nodes: ArgosNode[] = []
  const edges: ArgosEdge[] = []
  const nodeSet = new Set<string>()

  const maxMonto = Math.max(...data.municipios.map((m) => m.monto_total), 1)
  const maxContratos = Math.max(...data.municipios.map((m) => m.total_contratos), 1)

  // Municipios → nodos jurisdiccion
  for (const muni of data.municipios) {
    const id = normalizeId(muni.municipio)
    if (nodeSet.has(id)) continue
    nodeSet.add(id)
    nodes.push({
      id,
      type: 'jurisdiccion',
      label: muni.municipio,
      weight: clamp(muni.monto_total / maxMonto, 0.15, 1),
      data: muni,
    })
  }

  const maxMontoEnt = Math.max(
    ...data.topEntidades.map((e) => e.monto_total),
    1
  )

  // Top entidades → nodos proveedor
  for (const ent of data.topEntidades) {
    const id = normalizeId(ent.proveedor)
    if (nodeSet.has(id)) continue
    nodeSet.add(id)
    nodes.push({
      id,
      type: 'proveedor',
      label: ent.proveedor,
      subtitle: ent.municipio,
      weight: clamp(ent.monto_total / maxMontoEnt, 0.1, 1),
      data: ent,
    })

    // Arista proveedor → municipio
    const muniId = normalizeId(ent.municipio)
    if (nodeSet.has(muniId)) {
      edges.push({ source: id, target: muniId, kind: 'opera_en', weight: clamp(ent.monto_total / maxMontoEnt, 0.05, 1) })
    }
  }

  // Señales → nodos señal + aristas señalado_por
  for (const señal of data.señales) {
    const señalId = señal.id
    if (!nodeSet.has(señalId)) {
      nodeSet.add(señalId)
      nodes.push({
        id: señalId,
        type: 'señal',
        label: señal.titulo,
        subtitle: señal.municipio,
        weight: clamp(señal.score / 100, 0.1, 1),
        flags: { severidad: señal.severidad },
        data: señal,
      })
    }

    // Conectar señal con entidades mencionadas en el resumen (best-effort por nombre)
    for (const ent of data.topEntidades) {
      const entId = normalizeId(ent.proveedor)
      if (
        nodeSet.has(entId) &&
        señal.municipio === ent.municipio &&
        !edges.some((e) => e.source === entId && e.target === señalId)
      ) {
        edges.push({ source: entId, target: señalId, kind: 'señalado_por', weight: 0.5 })
        break // una arista por señal es suficiente para el grafo inicial
      }
    }
  }

  return { nodes, edges }
}

// ─── Desde EntidadDetalle ─────────────────────────────────────────────────────

/**
 * Expande el grafo con los detalles de una entidad.
 * Agrega: directores, contratos recientes, señales por CUIT.
 * Merge: reutiliza nodos existentes (por id) sin duplicar.
 */
export function mergeEntidadIntoGraph(
  graph: ArgosGraph,
  entidad: EntidadDetalle
): ArgosGraph {
  const nodes = [...graph.nodes]
  const edges = [...graph.edges]
  const nodeIds = new Set(nodes.map((n) => n.id))
  const edgeKeys = new Set(edges.map((e) => `${e.source}|${e.target}|${e.kind}`))

  const entId = normalizeId(entidad.nombre)

  function addEdge(source: string, target: string, kind: ArgosEdge['kind'], weight = 0.5) {
    const key = `${source}|${target}|${kind}`
    if (!edgeKeys.has(key)) {
      edgeKeys.add(key)
      edges.push({ source, target, kind, weight })
    }
  }

  // Asegurarse que el nodo proveedor principal existe
  if (!nodeIds.has(entId)) {
    nodeIds.add(entId)
    nodes.push({
      id: entId,
      type: 'proveedor',
      label: entidad.nombre,
      weight: 0.8,
      flags: { verificadoAfip: !!entidad.afip },
      data: entidad,
    })
  } else {
    // Actualizar data con el detalle completo
    const idx = nodes.findIndex((n) => n.id === entId)
    if (idx >= 0) {
      nodes[idx] = {
        ...nodes[idx],
        data: entidad,
        flags: { ...nodes[idx].flags, verificadoAfip: !!entidad.afip },
      }
    }
  }

  // Señales
  for (const señal of entidad.señales ?? []) {
    if (!nodeIds.has(señal.id)) {
      nodeIds.add(señal.id)
      nodes.push({
        id: señal.id,
        type: 'señal',
        label: señal.titulo,
        weight: clamp(señal.score / 100, 0.1, 1),
        flags: { severidad: señal.severidad },
        data: señal,
      })
    }
    addEdge(entId, señal.id, 'señalado_por', señal.score / 100)
  }

  // Municipios donde opera
  for (const muni of entidad.municipios) {
    const muniId = normalizeId(muni)
    if (!nodeIds.has(muniId)) {
      nodeIds.add(muniId)
      nodes.push({
        id: muniId,
        type: 'jurisdiccion',
        label: muni,
        weight: 0.4,
        data: { municipio: muni },
      })
    }
    addEdge(entId, muniId, 'opera_en', 0.6)
  }

  return { nodes, edges }
}

// ─── Utilidades ──────────────────────────────────────────────────────────────

/** Retorna los nodos vecinos directos de un nodo. */
export function getNeighbors(graph: ArgosGraph, nodeId: string): ArgosNode[] {
  const ids = new Set<string>()
  for (const e of graph.edges) {
    const src = typeof e.source === 'string' ? e.source : e.source.id
    const tgt = typeof e.target === 'string' ? e.target : e.target.id
    if (src === nodeId) ids.add(tgt)
    if (tgt === nodeId) ids.add(src)
  }
  return graph.nodes.filter((n) => ids.has(n.id))
}

/** Retorna las aristas conectadas a un nodo. */
export function getNodeEdges(graph: ArgosGraph, nodeId: string): ArgosEdge[] {
  return graph.edges.filter((e) => {
    const src = typeof e.source === 'string' ? e.source : e.source.id
    const tgt = typeof e.target === 'string' ? e.target : e.target.id
    return src === nodeId || tgt === nodeId
  })
}

/** Construye un NodeDetail sintético para el panel desde un ArgosNode. */
import type { NodeDetail, KPI, Relacion } from './types'

export function nodeDetailFromNode(
  node: ArgosNode,
  graph: ArgosGraph
): NodeDetail {
  const kpis: KPI[] = buildKPIs(node)
  const relaciones: Relacion[] = buildRelaciones(node, graph)
  const señales = buildSeñales(node, graph)

  return {
    node,
    kpis,
    relaciones,
    señales,
    fuentes: [],
  }
}

function buildKPIs(node: ArgosNode): KPI[] {
  if (node.type === 'proveedor') {
    const d = node.data as Record<string, unknown>
    const kpis: KPI[] = []

    if (typeof d.monto_total === 'number') {
      kpis.push({
        label: 'Facturación total',
        format: 'currency',
        amount: d.monto_total as number,
      })
    }
    if (typeof d.montoTotal === 'number') {
      kpis.push({
        label: 'Facturación total',
        format: 'currency',
        amount: d.montoTotal as number,
      })
    }
    if (typeof d.total_contratos === 'number' || typeof d.totalContratos === 'number') {
      kpis.push({
        label: 'Contratos',
        format: 'count',
        value: String((d.total_contratos ?? d.totalContratos) as number),
      })
    }
    if (typeof d.señales === 'number') {
      kpis.push({
        label: 'Señales',
        format: 'count',
        value: String(d.señales as number),
      })
    }

    // Timeline → trend KPI
    const timeline = d.timeline as { anio: number; monto: number }[] | undefined
    if (timeline && timeline.length >= 2) {
      kpis.push({
        label: 'Gasto anual',
        format: 'trend',
        trend: timeline.map((t) => t.monto),
        trendYears: timeline.map((t) => t.anio),
        trendFormat: 'currency',
      })
    }

    return kpis
  }

  if (node.type === 'jurisdiccion') {
    const d = node.data as Record<string, unknown>
    return [
      d.monto_total != null
        ? { label: 'Monto total', format: 'currency' as const, amount: d.monto_total as number }
        : null,
      d.total_contratos != null
        ? { label: 'Contratos', format: 'count' as const, value: String(d.total_contratos) }
        : null,
      d.total_señales != null
        ? { label: 'Señales', format: 'count' as const, value: String(d.total_señales) }
        : null,
    ].filter(Boolean) as KPI[]
  }

  if (node.type === 'señal') {
    const d = node.data as Record<string, unknown>
    return [
      { label: 'Score', format: 'count', value: String(d.score ?? 0) },
      { label: 'Severidad', format: 'text', value: String(d.severidad ?? '') },
    ]
  }

  if (node.type === 'contrato') {
    const d = node.data as Record<string, unknown>
    return [
      d.monto != null
        ? { label: 'Monto', format: 'currency' as const, amount: d.monto as number }
        : null,
      d.anio != null
        ? { label: 'Año', format: 'date' as const, value: String(d.anio) }
        : null,
      d.tipo != null
        ? { label: 'Tipo', format: 'text' as const, value: String(d.tipo) }
        : null,
    ].filter(Boolean) as KPI[]
  }

  return []
}

function buildRelaciones(node: ArgosNode, graph: ArgosGraph): Relacion[] {
  const neighbors = getNeighbors(graph, node.id)
  const edges = getNodeEdges(graph, node.id)

  return neighbors.map((neighbor) => {
    const edge = edges.find((e) => {
      const src = typeof e.source === 'string' ? e.source : e.source.id
      const tgt = typeof e.target === 'string' ? e.target : e.target.id
      return src === neighbor.id || tgt === neighbor.id
    })
    return {
      node: neighbor,
      via: edge?.kind ?? 'opera_en',
      weight: edge?.weight ?? 0.5,
      severidad: neighbor.flags?.severidad,
    } as Relacion
  }).sort((a, b) => b.weight - a.weight)
}

function buildSeñales(node: ArgosNode, graph: ArgosGraph): NodeDetail['señales'] {
  if (node.type === 'señal') {
    const d = node.data as {
      id: string
      titulo: string
      resumen: string
      severidad: string
      score: number
      evidencia?: { descripcion: string; fuenteUrl: string }[]
      legal?: { articulos: string[]; denunciarAnte: string[] }
    }
    return [{
      id: node.id,
      titulo: d.titulo,
      resumen: d.resumen,
      severidad: d.severidad as 'grave' | 'moderada' | 'leve',
      score: d.score,
      evidencia: d.evidencia ?? [],
      legal: { articulos: d.legal?.articulos ?? [], denunciarAnte: d.legal?.denunciarAnte ?? [] },
    }]
  }

  // Para proveedores: buscar señales vecinas en el grafo
  const señalNodes = getNeighbors(graph, node.id).filter((n) => n.type === 'señal')
  return señalNodes.map((sn) => {
    const d = sn.data as {
      id: string
      titulo: string
      resumen: string
      severidad: string
      score: number
      evidencia?: { descripcion: string; fuenteUrl: string }[]
      legal?: { articulos: string[]; denunciarAnte: string[] }
    }
    return {
      id: sn.id,
      titulo: d.titulo ?? sn.label,
      resumen: d.resumen ?? '',
      severidad: (d.severidad ?? 'leve') as 'grave' | 'moderada' | 'leve',
      score: d.score ?? 0,
      evidencia: d.evidencia ?? [],
      legal: { articulos: d.legal?.articulos ?? [], denunciarAnte: d.legal?.denunciarAnte ?? [] },
    }
  })
}
