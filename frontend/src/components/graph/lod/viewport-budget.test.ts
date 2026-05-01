import { describe, it, expect } from 'vitest'
import { calcViewportBudget } from './viewport-budget'

describe('calcViewportBudget', () => {
  it('returns more nodes for wider viewport', () => {
    const small = calcViewportBudget({ width: 1366, height: 768 }, 1.0)
    const wide = calcViewportBudget({ width: 3840, height: 1600 }, 1.0)
    expect(wide.maxVisibleNodes).toBeGreaterThan(small.maxVisibleNodes)
  })

  it('returns more nodes at higher zoom', () => {
    // viewport pequeño para que MAX_RENDERED no sature el resultado en ambos casos
    const vp = { width: 800, height: 600 }
    const z1 = calcViewportBudget(vp, 1.0)
    const z2 = calcViewportBudget(vp, 2.5)
    expect(z2.maxVisibleNodes).toBeGreaterThan(z1.maxVisibleNodes)
  })

  it('clamps to MAX_RENDERED constant', () => {
    const vp = { width: 8000, height: 5000 }
    const result = calcViewportBudget(vp, 5.0)
    expect(result.maxVisibleNodes).toBeLessThanOrEqual(300)
  })
})
