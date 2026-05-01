import { describe, it, expect } from 'vitest'
import { computeRadialLayout } from './radial-cluster'
import type { GraphNode, GraphEdge } from '../types'

const mkNode = (id: string, depth: number): GraphNode => ({
  id, type: 'estado', label: id, weight: 1, depth, data: {},
})

describe('computeRadialLayout', () => {
  it('places root at center', () => {
    const nodes = [mkNode('root', 0)]
    const result = computeRadialLayout({
      nodes,
      edges: [],
      centerX: 500,
      centerY: 300,
      maxRadius: 200,
    })
    const root = result.anchors.get('root')!
    expect(root.fx0).toBeCloseTo(500, 0)
    expect(root.fy0).toBeCloseTo(300, 0)
  })

  it('places children on ring around root', () => {
    const nodes = [mkNode('root', 0), mkNode('a', 1), mkNode('b', 1)]
    const edges: GraphEdge[] = [
      { source: 'a', target: 'root', kind: 'pertenece_a', weight: 1 },
      { source: 'b', target: 'root', kind: 'pertenece_a', weight: 1 },
    ]
    const result = computeRadialLayout({
      nodes,
      edges,
      centerX: 0,
      centerY: 0,
      maxRadius: 200,
    })
    const a = result.anchors.get('a')!
    const distA = Math.hypot(a.fx0, a.fy0)
    expect(distA).toBeGreaterThan(0)
    expect(distA).toBeLessThan(200)
  })

  it('orphans (no edges) get fallback radial scatter', () => {
    const nodes = [mkNode('orphan', 1)]
    const result = computeRadialLayout({
      nodes,
      edges: [],
      centerX: 0,
      centerY: 0,
      maxRadius: 200,
    })
    expect(result.anchors.has('orphan')).toBe(true)
  })
})
