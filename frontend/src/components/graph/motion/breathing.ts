// frontend/src/components/graph/motion/breathing.ts
import {
  forceSimulation,
  forceX,
  forceY,
  forceCollide,
  forceManyBody,
  type Simulation,
} from 'd3-force'
import type { GraphNode } from '../types'
import type { NodeAnchor } from '../layouts/shared'

interface NodeDatum extends GraphNode {
  index?: number
}

/**
 * Crea una sim que ancla cada nodo a su (fx0, fy0) con strength fuerte
 * + leve charge para "respiración" sutil (oscilación 1-2px ciclos 3-4s).
 *
 * IMPORTANTE: alphaTarget bajo (0.0015) mantiene la sim viva sin hacer
 * que los nodos viajen lejos. Si el usuario tiene prefers-reduced-motion,
 * alphaTarget = 0 y los nodos quedan estáticos en el ancla.
 */
export function createBreathingSim(
  nodes: GraphNode[],
  anchors: Map<string, NodeAnchor>,
  reduceMotion: boolean
): Simulation<NodeDatum, undefined> {
  const data: NodeDatum[] = nodes.map(n => {
    const a = anchors.get(n.id)
    return {
      ...n,
      x: a?.fx0,
      y: a?.fy0,
      fx0: a?.fx0,
      fy0: a?.fy0,
    }
  })

  const sim = forceSimulation<NodeDatum>(data)
    .force(
      'x',
      forceX<NodeDatum>(d => d.fx0 ?? 0).strength(0.85)
    )
    .force(
      'y',
      forceY<NodeDatum>(d => d.fy0 ?? 0).strength(0.85)
    )
    .force(
      'charge',
      forceManyBody<NodeDatum>().strength(reduceMotion ? 0 : -15)
    )
    .force(
      'collide',
      forceCollide<NodeDatum>(d => 8 + 6 * d.weight).strength(0.7)
    )
    .alphaDecay(0.04)
    .alphaMin(reduceMotion ? 0.001 : 0)
    .alphaTarget(reduceMotion ? 0 : 0.0015)

  return sim
}
