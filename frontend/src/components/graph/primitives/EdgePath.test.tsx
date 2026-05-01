// frontend/src/components/graph/primitives/EdgePath.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EdgePath } from './EdgePath'

describe('EdgePath', () => {
  it('renders solid line for pertenece_a', () => {
    const { container } = render(
      <svg><EdgePath x1={0} y1={0} x2={100} y2={0} kind="pertenece_a" weight={0.5} /></svg>
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke-dasharray')).toBeFalsy()
  })

  it('renders dashed line for dirige', () => {
    const { container } = render(
      <svg><EdgePath x1={0} y1={0} x2={100} y2={0} kind="dirige" weight={0.5} /></svg>
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke-dasharray')).toBeTruthy()
  })

  it('renders curved bezier for contrata', () => {
    const { container } = render(
      <svg><EdgePath x1={0} y1={0} x2={100} y2={0} kind="contrata" weight={0.7} /></svg>
    )
    const path = container.querySelector('path')
    const d = path?.getAttribute('d') ?? ''
    expect(d).toMatch(/Q/)
  })
})
