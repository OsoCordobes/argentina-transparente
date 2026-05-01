// frontend/src/components/graph/lod/semantic-zoom.test.ts
import { describe, it, expect } from 'vitest'
import { selectVisibleNodes } from './semantic-zoom'
import type { GraphNode } from '../types'

const mkNode = (id: string, depth: number, weight: number): GraphNode => ({
  id, type: 'empresa', label: id, weight, depth, data: {},
})

describe('selectVisibleNodes', () => {
  it('always includes depth 0 and depth 1', () => {
    const nodes = [
      mkNode('root', 0, 1.0),
      mkNode('cat1', 1, 0.9),
      mkNode('cat2', 1, 0.8),
      mkNode('leaf1', 2, 0.1),
    ]
    const visible = selectVisibleNodes(nodes, { maxVisibleNodes: 3, pixelArea: 0 })
    expect(visible.map(n => n.id)).toContain('root')
    expect(visible.map(n => n.id)).toContain('cat1')
    expect(visible.map(n => n.id)).toContain('cat2')
  })

  it('drops lowest-weight leaves first when over budget', () => {
    const nodes = [
      mkNode('root', 0, 1.0),
      mkNode('cat1', 1, 0.9),
      mkNode('high', 2, 0.8),
      mkNode('low', 2, 0.1),
    ]
    const visible = selectVisibleNodes(nodes, { maxVisibleNodes: 3, pixelArea: 0 })
    expect(visible.map(n => n.id)).toContain('high')
    expect(visible.map(n => n.id)).not.toContain('low')
  })

  it('returns all nodes when budget is generous', () => {
    const nodes = [mkNode('a', 0, 1), mkNode('b', 1, 0.5), mkNode('c', 2, 0.1)]
    const visible = selectVisibleNodes(nodes, { maxVisibleNodes: 100, pixelArea: 0 })
    expect(visible.length).toBe(3)
  })
})
