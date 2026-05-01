// frontend/src/components/graph/layouts/shared.ts
import type { GraphNode, GraphEdge } from '../types'

export interface NodeAnchor {
  id: string
  /** ancla x en world-coords */
  fx0: number
  /** ancla y en world-coords */
  fy0: number
}

export interface LayoutResult {
  anchors: Map<string, NodeAnchor>
}

export interface LayoutInput {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** centro del canvas en world-coords */
  centerX: number
  centerY: number
  /** radio máximo del layout (anillo más externo) */
  maxRadius: number
}
