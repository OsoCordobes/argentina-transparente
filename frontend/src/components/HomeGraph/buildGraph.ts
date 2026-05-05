// frontend/src/components/HomeGraph/buildGraph.ts
//
// Pure adapter: response de /api/grafo/jerarquia/v2 → instancia Graphology.
//
// Responsabilidades:
//   1. Aplanar los 4 niveles de depth en un único Graph.
//   2. Calcular encoding visual a partir de los datos REALES (monto,
//      contratos, weight, señales) — esto es lo que hace que el grafo
//      "respire" la base de datos en lugar de ser geometría hardcodeada.
//   3. Asignar posiciones iniciales (ForceAtlas2 las refina).
//
// Sin react, sin sigma — testeable como función pura.

import Graph from 'graphology'
import type { GrafoJerarquiaV2Response } from '@/lib/queries'

// Tokens canónicos resueltos en JS para que sigma los reciba como strings
// hex. Si tocás --entity-* en tokens.css, también tocá acá.
export const ENTITY_COLORS = {
  jurisdiccion: '#4A9EFF',  // Estado / Provincia
  reparticion: '#22D3EE',   // Ministerios / Secretarías
  empresa: '#F59E0B',       // Empresas / Proveedores
  persona: '#A78BFA',       // Personas / Funcionarios / Directores
  documento: '#94A3B8',     // Contratos / Documentos
} as const

export const EDGE_COLORS = {
  pertenece_a: '#1E3A8A',   // estructural, sutil
  gano: '#F59E0B',          // contrato — color empresa
  contrata: '#F59E0B',
  dirige: '#A78BFA',        // dirección — color persona
  conflicto_con: '#EF4444', // alarma
  emite: '#22D3EE',         // emisión documental
  default: '#475569',
} as const

export type EntityType = keyof typeof ENTITY_COLORS
export type EdgeKind = keyof typeof EDGE_COLORS

// Atributos que sigma lee directamente de los nodos
export interface GraphNodeAttrs {
  // requeridos por sigma
  x: number
  y: number
  size: number
  color: string
  label: string
  // sigma image program
  type?: string
  image?: string
  // metadata propia (sigma la ignora pero la usamos en hover/click)
  entityType: EntityType
  rawType: string
  subtitle: string
  weight: number
  depth: number
  monto: number
  contratos: number
  hasGrave: boolean
  hasModerada: boolean
  cuitVerificado: boolean
  // visibility (filtros)
  hidden?: boolean
  // borde (señal grave)
  borderColor?: string
  borderSize?: number
}

export interface GraphEdgeAttrs {
  size: number
  color: string
  type?: string  // 'curve' para multi-edge
  kind: EdgeKind
  weight: number
  hidden?: boolean
}

/**
 * Construye un Graphology Graph a partir de la respuesta del backend.
 * El layout final lo aplica ForceAtlas2 — acá sólo damos posiciones
 * iniciales sensatas (depth0 al centro, resto en anillo) para que la
 * simulación arranque desde un estado no degenerado.
 */
export function buildGraph(data: GrafoJerarquiaV2Response): Graph<GraphNodeAttrs, GraphEdgeAttrs> {
  const graph = new Graph<GraphNodeAttrs, GraphEdgeAttrs>({ multi: true, type: 'directed' })

  // 1) Aplanar nodos + computar escalas globales sobre los datos reales
  const allNodes = [
    ...data.depth0.nodes,
    ...data.depth1.nodes,
    ...data.depth2.nodes,
    ...data.depth3.nodes,
  ]
  const allEdges = [
    ...data.depth0.edges,
    ...data.depth1.edges,
    ...data.depth2.edges,
    ...data.depth3.edges,
  ]

  // Escala de tamaño: √(monto) normalizado. Damos un piso para que
  // entidades sin monto (ej. estado raíz) sigan visibles.
  const maxMonto = Math.max(
    1,
    ...allNodes.map(n => Number((n.data as { monto?: number })?.monto ?? 0)),
  )
  const sizeFromMonto = (monto: number, depth: number): number => {
    const MIN = 4
    const MAX = depth === 0 ? 28 : depth === 1 ? 22 : 14
    if (monto <= 0) return depth === 0 ? 24 : MIN + 2
    const norm = Math.sqrt(monto / maxMonto)
    return MIN + (MAX - MIN) * norm
  }

  // 2) Insertar nodos con encoding completo
  const N = allNodes.length
  const RING_R = 6  // radio inicial en unidades de layout — FA2 escala después
  for (let i = 0; i < allNodes.length; i++) {
    const n = allNodes[i]
    const depth = (n.data as { depth?: number })?.depth ?? 0
    const monto = Number((n.data as { monto?: number })?.monto ?? 0)
    const contratos = Number((n.data as { contratos?: number })?.contratos ?? 0)
    const flags = (n.data as { flags?: { senalGrave?: boolean; senalModerada?: boolean } })?.flags ?? {}

    const entityType = mapBackendType(n.type)
    const color = ENTITY_COLORS[entityType] ?? ENTITY_COLORS.documento

    // Posición inicial: depth0 al centro, depth1 en anillo cercano,
    // depth2/3 en anillo más amplio. FA2 los va a re-organizar.
    let x: number, y: number
    if (depth === 0) { x = 0; y = 0 }
    else {
      const angle = (i / Math.max(1, N)) * 2 * Math.PI
      const r = depth === 1 ? RING_R : depth === 2 ? RING_R * 2.2 : RING_R * 3.4
      x = Math.cos(angle) * r
      y = Math.sin(angle) * r
    }

    const cuitVerificado = !/sin\s+cuit\s+verificado/i.test(n.subtitle ?? '')

    graph.addNode(n.id, {
      x, y,
      size: sizeFromMonto(monto, depth),
      color,
      label: n.label,
      type: 'circle',
      entityType,
      rawType: n.type,
      subtitle: n.subtitle ?? '',
      weight: n.weight ?? 0,
      depth,
      monto,
      contratos,
      hasGrave: !!flags.senalGrave,
      hasModerada: !!flags.senalModerada,
      cuitVerificado,
      // Borde rojo si tiene señal grave
      borderColor: flags.senalGrave ? '#EF4444' : flags.senalModerada ? '#F59E0B' : undefined,
      borderSize: flags.senalGrave || flags.senalModerada ? 2 : 0,
    })
  }

  // 3) Insertar aristas con encoding por kind y weight
  // Soporta multi-edges (mismo source/target pero distintos años/contratos).
  const maxEdgeWeight = Math.max(1, ...allEdges.map(e => Number(e.weight ?? 1)))
  const sizeFromWeight = (w: number) => 0.6 + Math.sqrt((w ?? 1) / maxEdgeWeight) * 3.2

  for (const e of allEdges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue
    const kind = (e.kind ?? 'pertenece_a') as EdgeKind
    const color = EDGE_COLORS[kind] ?? EDGE_COLORS.default

    try {
      graph.addEdge(e.source, e.target, {
        size: sizeFromWeight(Number(e.weight ?? 1)),
        color,
        type: 'curve',  // permite que el plugin edge-curve separe los multi-edges
        kind,
        weight: Number(e.weight ?? 1),
      })
    } catch {
      // duplicado exacto en multi=true es raro pero no fatal
    }
  }

  return graph
}

function mapBackendType(rawType: string): EntityType {
  if (rawType === 'jurisdiccion' || rawType === 'reparticion') {
    return rawType === 'jurisdiccion' ? 'jurisdiccion' : 'reparticion'
  }
  if (rawType === 'empresa' || rawType === 'proveedor') return 'empresa'
  if (rawType === 'persona' || rawType === 'funcionario' || rawType === 'director') return 'persona'
  if (rawType === 'contrato' || rawType === 'documento') return 'documento'
  // fallback razonable
  return 'documento'
}
