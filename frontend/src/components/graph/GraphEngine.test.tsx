// frontend/src/components/graph/GraphEngine.test.tsx
import { describe, it, expect, beforeAll } from 'vitest'
import { render } from '@testing-library/react'
import { GraphEngine } from './GraphEngine'
import type { GraphSnapshot } from './types'

// jsdom no provee ResizeObserver — polyfill noop antes de cualquier render
beforeAll(() => {
  if (!('ResizeObserver' in globalThis)) {
    ;(globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
  }
})

const snapshot: GraphSnapshot = {
  nodes: [
    { id: 'root', type: 'estado', label: 'Provincia', weight: 1, depth: 0, data: {} },
    { id: 'a', type: 'estado', label: 'Min A', weight: 0.8, depth: 1, data: {} },
    { id: 'b', type: 'empresa', label: 'Emp B', weight: 0.5, depth: 2, data: {} },
  ],
  edges: [
    { source: 'a', target: 'root', kind: 'pertenece_a', weight: 1 },
    { source: 'b', target: 'a', kind: 'contrata', weight: 0.6 },
  ],
}

describe('GraphEngine', () => {
  it('renders nodes and edges', () => {
    const { container } = render(<GraphEngine snapshot={snapshot} layout="radial-cluster" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(3)
    const paths = container.querySelectorAll('path.edge-path')
    expect(paths.length).toBe(2)
  })

  it('applies radial gradient background', () => {
    const { container } = render(<GraphEngine snapshot={snapshot} layout="radial-cluster" />)
    expect(container.querySelector('rect[fill*="argos-radial-bg"]')).toBeTruthy()
  })
})
