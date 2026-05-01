// frontend/src/components/graph/types.ts

export type EntityType = 'estado' | 'persona' | 'empresa' | 'documento'

export type EdgeKind =
  | 'pertenece_a'
  | 'contrata'
  | 'dirige'
  | 'conflicto_con'
  | 'emite'

export interface GraphNode {
  id: string
  type: EntityType
  /** label visible (Inter sans para institucional, JetBrains Mono para CUITs) */
  label: string
  /** subtitle opcional (CUIT, "X contratos", etc.) */
  subtitle?: string
  /** 0..1 — size scaling + LOD priority */
  weight: number
  /** profundidad jerárquica (0 = raíz, 1 = categoría, 2 = entidad, 3 = empresa/persona leaf) */
  depth: number
  /** datos crudos para tooltip/sidebar */
  data: Record<string, unknown>
  /** flags visuales */
  flags?: {
    /** badge ⓘ visible si nivel_confianza ≠ 'alto' */
    confianzaBaja?: boolean
    /** ej. T1 verificada, T2 inferida */
    tier?: 1 | 2 | 3
    /** halo pulsante rojo */
    senalGrave?: boolean
    /** halo pulsante naranja */
    senalModerada?: boolean
    /** count para badge SE corner */
    senalesCount?: number
  }
  /** posición en canvas (mutada por sim) */
  x?: number
  y?: number
  /** posición ancla (calculada por layout) */
  fx0?: number
  fy0?: number
}

export interface GraphEdge {
  source: string  // node id
  target: string  // node id
  kind: EdgeKind
  /** 0..1 — grosor relativo */
  weight: number
  /** monto para 'contrata', score para 'conflicto_con', etc. */
  data?: Record<string, unknown>
}

export interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ZoomState {
  /** zoom level (1.0 = default) */
  k: number
  /** translate X */
  x: number
  /** translate Y */
  y: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface GraphEngineProps {
  snapshot: GraphSnapshot
  layout: 'radial-cluster' | 'vertical-tree'
  /** id del nodo seleccionado (sticky hasta Esc) */
  selectedId?: string | null
  /** id del nodo hovereado (transitorio) */
  hoveredId?: string | null
  /** ids de nodos resaltados (búsqueda, filtro, etc.) */
  highlighted?: Set<string>
  /** callbacks */
  onSelect?: (id: string | null) => void
  onHover?: (id: string | null) => void
  onZoom?: (state: ZoomState) => void
}
