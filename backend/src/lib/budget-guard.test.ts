/**
 * Tests para budget-guard.ts.
 *
 * Cubre las funciones puras (estimación de costo, detección de errores).
 * NO cubre las que tocan DB (recordLlmCall, getCostoAcumulado, assertBudget)
 * porque requerirían setup de DuckDB en memoria.
 */

import { describe, expect, it } from 'vitest'
import {
  estimarCostoCall,
  isOutOfCreditsError,
  PRECIOS_USD_PER_MTOK,
} from './budget-guard'

describe('estimarCostoCall', () => {
  it('Sonnet 4.6: 1Mtok input + 1Mtok output = $18 ($3 + $15)', () => {
    const c = estimarCostoCall('claude-sonnet-4-6', 1_000_000, 1_000_000)
    expect(c).toBeCloseTo(18, 4)
  })

  it('Haiku 4.5: 1Mtok input + 1Mtok output = $4.80 ($0.80 + $4)', () => {
    const c = estimarCostoCall('claude-haiku-4-5-20251001', 1_000_000, 1_000_000)
    expect(c).toBeCloseTo(4.80, 4)
  })

  it('cache reads cuestan 10% del input price', () => {
    // Sonnet: 1Mtok input ALL cached → $0.30 (10% de $3)
    const c = estimarCostoCall('claude-sonnet-4-6', 1_000_000, 0, 1_000_000, 0)
    expect(c).toBeCloseTo(0.30, 4)
  })

  it('cache creation cuesta 125% del input price', () => {
    // Sonnet: 1Mtok input ALL cache_creation → $3.75 (125% de $3)
    const c = estimarCostoCall('claude-sonnet-4-6', 1_000_000, 0, 0, 1_000_000)
    expect(c).toBeCloseTo(3.75, 4)
  })

  it('mixto: 100K input fresh + 50K cached + 200K output (Sonnet)', () => {
    // fresh = 100_000 - 50_000 (cached) = 50_000
    // cost = (50K * 3 + 50K * 0.3 + 200K * 15) / 1M
    //      = (150_000 + 15_000 + 3_000_000) / 1M
    //      = 3.165
    const c = estimarCostoCall('claude-sonnet-4-6', 100_000, 200_000, 50_000, 0)
    expect(c).toBeCloseTo(3.165, 4)
  })

  it('rounding: 6 decimales máximo', () => {
    const c = estimarCostoCall('claude-haiku-4-5-20251001', 1234, 5678)
    // 1234 * 0.80 / 1M + 5678 * 4 / 1M = 0.0009872 + 0.022712 = 0.0236992
    expect(String(c).split('.')[1]?.length ?? 0).toBeLessThanOrEqual(6)
  })

  it('input/output 0 → costo 0', () => {
    expect(estimarCostoCall('claude-sonnet-4-6', 0, 0)).toBe(0)
  })

  it('rechaza modelo no soportado', () => {
    expect(() =>
      // @ts-expect-error: modelo no en union — verificación runtime
      estimarCostoCall('claude-x-9000', 1000, 1000),
    ).toThrow(/no soportado/i)
  })

  it('Opus 4.7 más caro que Sonnet 4.6 ($15/$75 vs $3/$15)', () => {
    const opus = estimarCostoCall('claude-opus-4-7', 1_000_000, 1_000_000)
    const sonnet = estimarCostoCall('claude-sonnet-4-6', 1_000_000, 1_000_000)
    expect(opus).toBeGreaterThan(sonnet)
    expect(opus).toBeCloseTo(90, 4) // 15 + 75
  })
})

describe('isOutOfCreditsError', () => {
  it('detecta variantes de "credit balance is too low"', () => {
    expect(isOutOfCreditsError(new Error('Your credit balance is too low'))).toBe(true)
    expect(isOutOfCreditsError(new Error('credit balance too low'))).toBe(true)
    expect(isOutOfCreditsError(new Error('CREDIT  BALANCE  IS  TOO  LOW'))).toBe(true)
  })

  it('detecta "insufficient credit"', () => {
    expect(isOutOfCreditsError(new Error('insufficient credit on account'))).toBe(true)
  })

  it('detecta "quota exceeded"', () => {
    expect(isOutOfCreditsError(new Error('Monthly quota exceeded'))).toBe(true)
  })

  it('rechaza errores que NO son de saldo', () => {
    expect(isOutOfCreditsError(new Error('Network timeout'))).toBe(false)
    expect(isOutOfCreditsError(new Error('Invalid request'))).toBe(false)
    expect(isOutOfCreditsError(new Error('Rate limit hit'))).toBe(false)
  })

  it('acepta string además de Error', () => {
    expect(isOutOfCreditsError('credit balance is too low')).toBe(true)
    expect(isOutOfCreditsError('all good')).toBe(false)
  })

  it('null/undefined no rompen', () => {
    expect(isOutOfCreditsError(null)).toBe(false)
    expect(isOutOfCreditsError(undefined)).toBe(false)
  })
})

describe('PRECIOS_USD_PER_MTOK — sanity', () => {
  it('Sonnet output cuesta 5x el input', () => {
    const p = PRECIOS_USD_PER_MTOK['claude-sonnet-4-6']
    expect(p.output / p.input).toBe(5)
  })

  it('Haiku output cuesta 5x el input', () => {
    const p = PRECIOS_USD_PER_MTOK['claude-haiku-4-5-20251001']
    expect(p.output / p.input).toBe(5)
  })

  it('Opus es 5x más caro que Sonnet en input', () => {
    expect(
      PRECIOS_USD_PER_MTOK['claude-opus-4-7'].input /
      PRECIOS_USD_PER_MTOK['claude-sonnet-4-6'].input
    ).toBe(5)
  })
})
