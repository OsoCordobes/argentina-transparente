// frontend/src/components/graph/primitives/EntityNode.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EntityNode } from './EntityNode'
import type { GraphNode } from '../types'

const node: GraphNode = {
  id: 'min-salud',
  type: 'estado',
  label: 'Ministerio de Salud',
  weight: 0.9,
  depth: 1,
  data: {},
}

describe('EntityNode', () => {
  it('renders a circle with entity color', () => {
    const { container } = render(
      <svg><EntityNode node={node} cx={100} cy={100} zoomLevel="medium" /></svg>
    )
    const circle = container.querySelector('circle')
    expect(circle).toBeTruthy()
  })

  it('shows icon when zoom is medium or close', () => {
    const { container } = render(
      <svg><EntityNode node={node} cx={0} cy={0} zoomLevel="medium" /></svg>
    )
    expect(container.querySelector('svg svg')).toBeTruthy()
  })

  it('does not show icon at far zoom', () => {
    const { container } = render(
      <svg><EntityNode node={node} cx={0} cy={0} zoomLevel="far" /></svg>
    )
    const innerSvgs = container.querySelectorAll('svg svg')
    expect(innerSvgs.length).toBe(0)
  })
})
