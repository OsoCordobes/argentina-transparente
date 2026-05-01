// frontend/src/components/graph/layouts/radial-cluster.ts
import { hierarchy, cluster, type HierarchyNode } from 'd3-hierarchy'
import type { GraphNode, GraphEdge } from '../types'
import type { LayoutInput, LayoutResult, NodeAnchor } from './shared'

interface TreeData {
  id: string
  children?: TreeData[]
}

/**
 * Construye un árbol de TreeData desde los edges.
 * Asume que las aristas van child→parent (target = padre).
 * Si hay múltiples roots (depth 0 disjuntos), los anida bajo un virtual root.
 */
function buildTree(nodes: GraphNode[], edges: GraphEdge[]): TreeData {
  const byId = new Map<string, TreeData>()
  for (const n of nodes) byId.set(n.id, { id: n.id, children: [] })

  // child → parent (target = parent)
  const parentOf = new Map<string, string>()
  for (const e of edges) {
    parentOf.set(e.source, e.target)
  }

  // Depth 0 nodes are roots
  const roots: TreeData[] = []
  for (const n of nodes) {
    if (n.depth === 0) {
      roots.push(byId.get(n.id)!)
    } else {
      const parentId = parentOf.get(n.id)
      const parent = parentId ? byId.get(parentId) : undefined
      if (parent) {
        parent.children!.push(byId.get(n.id)!)
      }
      // orphan — dropped from tree, will be scattered fallback
    }
  }

  if (roots.length === 1) return roots[0]
  return { id: '__virtual_root__', children: roots }
}

/**
 * Calcula posiciones radiales con d3.cluster (polar) y devuelve anchors cartesianos.
 * Orphans (sin edges) se distribuyen en círculo determinístico fuera del árbol.
 */
export function computeRadialLayout(input: LayoutInput): LayoutResult {
  const { nodes, edges, centerX, centerY, maxRadius } = input
  const anchors = new Map<string, NodeAnchor>()

  if (nodes.length === 0) return { anchors }

  if (nodes.length === 1) {
    anchors.set(nodes[0].id, { id: nodes[0].id, fx0: centerX, fy0: centerY })
    return { anchors }
  }

  const tree = buildTree(nodes, edges)
  const root: HierarchyNode<TreeData> = hierarchy(tree)

  // Cluster leaves land en `size[1]`. Lo dejamos al 90% de maxRadius
  // para que el árbol completo quede dentro de la circunferencia, dejando
  // headroom (orphans van a maxRadius * 1.05, fuera del árbol).
  cluster<TreeData>().size([2 * Math.PI, maxRadius * 0.9])(root)

  const inTree = new Set<string>()
  root.each(n => inTree.add((n.data as TreeData).id))

  root.each(n => {
    const d = n.data as TreeData
    if (d.id === '__virtual_root__') return
    const angle = (n as unknown as { x: number }).x - Math.PI / 2
    const radius = (n as unknown as { y: number }).y
    const fx0 = centerX + radius * Math.cos(angle)
    const fy0 = centerY + radius * Math.sin(angle)
    anchors.set(d.id, { id: d.id, fx0, fy0 })
  })

  // Patch root al centro si no es virtual
  for (const n of nodes) {
    if (n.depth === 0 && anchors.has(n.id)) {
      anchors.set(n.id, { id: n.id, fx0: centerX, fy0: centerY })
    }
  }

  // Orphans: scatter en círculo externo determinístico
  const orphans = nodes.filter(n => !inTree.has(n.id))
  orphans.forEach((o, i) => {
    const angle = (i / Math.max(orphans.length, 1)) * 2 * Math.PI
    const r = maxRadius * 1.05
    anchors.set(o.id, {
      id: o.id,
      fx0: centerX + r * Math.cos(angle),
      fy0: centerY + r * Math.sin(angle),
    })
  })

  return { anchors }
}
