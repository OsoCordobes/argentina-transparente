// frontend/src/components/graph/lod/semantic-zoom.ts
import type { GraphNode } from '../types'
import type { ViewportBudget } from './viewport-budget'

/**
 * Filtra `nodes` a los visibles dado el budget.
 * Reglas:
 *  - depth 0 y 1 SIEMPRE visibles (jerarquía estructural)
 *  - depth 2+ se ordenan por weight desc y se toman top-N hasta llenar budget
 */
export function selectVisibleNodes(
  nodes: GraphNode[],
  budget: ViewportBudget
): GraphNode[] {
  const structural = nodes.filter(n => n.depth <= 1)
  const leaves = nodes.filter(n => n.depth >= 2)
  const remaining = Math.max(0, budget.maxVisibleNodes - structural.length)
  const sortedLeaves = [...leaves].sort((a, b) => b.weight - a.weight)
  return [...structural, ...sortedLeaves.slice(0, remaining)]
}
