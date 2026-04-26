/**
 * Tipos del modo Explorar (chat-first).
 *
 * Estos tipos son INTERNOS al frontend — viven en memoria mientras el usuario
 * navega `/explorar`. Se construyen a partir de los datos del backend
 * (queries.ts) por `graphFromData.ts`.
 *
 * Los nodos no son "documentos" del backend, son nodos visuales que apuntan
 * a entidades reales (proveedor por nombre, contrato por hash, etc.).
 */

export type ArgosNodeType =
  | 'jurisdiccion'
  | 'proveedor'
  | 'director'
  | 'contrato'
  | 'señal'

export type ArgosSeveridad = 'grave' | 'moderada' | 'leve'

export interface ArgosNode {
  /** ID estable. Para proveedor: nombre normalizado. Para señal: id de señal. Etc. */
  id: string
  type: ArgosNodeType
  label: string
  /** Subtítulo opcional — CUIT, descripción, etc. */
  subtitle?: string
  /** Peso visual (0..1) — usado para tamaño y fuerza de simulación. */
  weight: number
  /** Flags visuales — verificación AFIP, severidad de señal, etc. */
  flags?: {
    verificadoAfip?: boolean
    severidad?: ArgosSeveridad
  }
  /** Datos crudos de la entidad para que el panel los muestre sin re-fetch. */
  data: Record<string, unknown>
  /** Posición en la simulación d3 — la mutamos en place. NO usar en JSX. */
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export type ArgosEdgeKind =
  | 'opera_en'
  | 'gano'
  | 'tiene_director'
  | 'señalado_por'
  | 'comparte_director'

export interface ArgosEdge {
  source: string | ArgosNode
  target: string | ArgosNode
  kind: ArgosEdgeKind
  weight: number
}

export interface ArgosGraph {
  nodes: ArgosNode[]
  edges: ArgosEdge[]
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  ts: number
}

export interface ChatChunk {
  /** Texto del próximo trozo del stream. */
  delta?: string
  /** Entidades a resaltar en el grafo. */
  entidades?: { id: string; type: ArgosNodeType; label: string }[]
  /** Nodo a enfocar (centra cámara). */
  focus?: { nodeId: string }
  /** Última señal: stream terminó. */
  done?: boolean
}

/**
 * Niveles de "fade" del chat según interacción del usuario:
 * - 'typing': mensaje en streaming, opacidad alta
 * - 'idle': chat inactivo, opacidad media
 * - 'hover-graph': el cursor está sobre el grafo, chat se atenúa
 */
export type ChatFadeLevel = 'typing' | 'idle' | 'hover-graph'

export type ChatThreadMode = 'collapsed' | 'expanded' | 'minimized'

export interface ChatContext {
  /** Nodo enfocado actual — el chat responde en su contexto si aplica. */
  focusNodeId: string | null
  /** Snapshot del grafo — fuente de verdad para resolver entidades. */
  graph: ArgosGraph
}

// ─── Detail Panel ───────────────────────────────────────────────────────────

export interface KPI {
  label: string
  /** Valor formateado o crudo. Si es trend, no usar value. */
  value?: string
  /** Subtítulo bajo el valor (ej. "11 años activo"). Acepta HTML simple. */
  sub?: string
  format: 'currency' | 'count' | 'date' | 'text' | 'trend'
  /** Para format=currency: valor crudo en pesos para formateo coherente. */
  amount?: number
  /** Para format=trend: serie temporal. */
  trend?: number[]
  trendYears?: number[]
  trendFormat?: 'currency' | 'count'
}

export interface Relacion {
  node: ArgosNode
  via: ArgosEdgeKind
  weight: number
  /** Severidad heredada si la relación toca una señal. */
  severidad?: ArgosSeveridad
}

export interface Fuente {
  url: string
  descripcion: string
  fechaAcceso: string
  nivelConfianza?: 'alto' | 'medio' | 'bajo'
}

export interface NodeDetail {
  node: ArgosNode
  kpis: KPI[]
  relaciones: Relacion[]
  /** Señales asociadas a este nodo (vacío si no aplica). */
  señales: {
    id: string
    titulo: string
    resumen: string
    severidad: ArgosSeveridad
    score: number
    evidencia: { descripcion: string; fuenteUrl: string }[]
    legal: { articulos: string[]; denunciarAnte: string[] }
  }[]
  fuentes: Fuente[]
}
