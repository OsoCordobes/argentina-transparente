import { describe, it, expect } from 'vitest'
import { parseDetectorConfig, parseSingleDetectorConfig } from './detectors-loader'

describe('detectors-loader / parseSingleDetectorConfig', () => {
  it('valida una entrada Tier 1 mínima (norma + tier=1)', () => {
    const ok = parseSingleDetectorConfig({
      tier: 1,
      norma: 'Ley 10.155 art. 3',
    })
    expect(ok.tier).toBe(1)
    expect(ok.norma).toBe('Ley 10.155 art. 3')
  })

  it('valida una entrada Tier 1 con umbrales y fuente_umbral', () => {
    const ok = parseSingleDetectorConfig({
      tier: 1,
      norma: 'Ley 10.155 art. 3',
      umbral_minimo: 20,
      umbral_grave: 40,
      fuente_umbral: 'umbral conservador, sin jurisprudencia accesible',
    })
    expect(ok.umbral_minimo).toBe(20)
    expect(ok.umbral_grave).toBe(40)
    expect(ok.fuente_umbral).toBe('umbral conservador, sin jurisprudencia accesible')
  })

  it('rechaza tier fuera de [1,2,3]', () => {
    expect(() =>
      parseSingleDetectorConfig({ tier: 4, norma: 'X' }),
    ).toThrow()
    expect(() =>
      parseSingleDetectorConfig({ tier: 0, norma: 'X' }),
    ).toThrow()
  })

  it('exige norma no vacía en Tier 1', () => {
    expect(() => parseSingleDetectorConfig({ tier: 1 })).toThrow()
    expect(() => parseSingleDetectorConfig({ tier: 1, norma: '' })).toThrow()
  })

  it('exige norma no vacía en Tier 2', () => {
    expect(() => parseSingleDetectorConfig({ tier: 2 })).toThrow()
    expect(() => parseSingleDetectorConfig({ tier: 2, norma: '' })).toThrow()
  })

  it('valida Tier 2 con caveat presente', () => {
    const ok = parseSingleDetectorConfig({
      tier: 2,
      norma: 'Ley 10.155 art. 3',
      caveat: 'La concentración no es ilegal por sí misma.',
    })
    expect(ok.tier).toBe(2)
    expect(ok.caveat).toContain('no es ilegal')
  })

  it('permite Tier 2 sin caveat (es opcional)', () => {
    const ok = parseSingleDetectorConfig({
      tier: 2,
      norma: 'Ley 10.155 art. 3',
    })
    expect(ok.tier).toBe(2)
    expect(ok.caveat).toBeUndefined()
  })

  it('passthrough de campos extra (umbrales custom, etc.)', () => {
    const ok = parseSingleDetectorConfig({
      tier: 1,
      norma: 'Ley X',
      umbral_minimo: 10,
      umbral_grave: 50,
      umbral_monto_pesos: 50_000_000,
      severidad_default: 'grave',
    })
    expect(ok.umbral_monto_pesos).toBe(50_000_000)
    expect(ok.severidad_default).toBe('grave')
  })

  it('rechaza objeto sin tier', () => {
    expect(() => parseSingleDetectorConfig({ norma: 'X' })).toThrow()
  })
})

describe('detectors-loader / parseDetectorConfig (record completo)', () => {
  it('valida un record con varios detectores', () => {
    const record = parseDetectorConfig({
      detectarA: { tier: 1, norma: 'Ley 10.155 art. 3' },
      detectarB: {
        tier: 2,
        norma: 'Ley 10.155 art. 3',
        caveat: 'No es ilegal por sí solo',
      },
    })
    expect(Object.keys(record)).toHaveLength(2)
    expect(record.detectarA.tier).toBe(1)
    expect(record.detectarB.tier).toBe(2)
    expect(record.detectarB.caveat).toBeDefined()
  })

  it('rechaza un record con una entrada inválida', () => {
    expect(() =>
      parseDetectorConfig({
        detectarA: { tier: 1, norma: 'OK' },
        detectarB: { tier: 99 } as unknown,
      }),
    ).toThrow()
  })

  it('rechaza input no-objeto', () => {
    expect(() => parseDetectorConfig(null as unknown)).toThrow()
    expect(() => parseDetectorConfig('string' as unknown)).toThrow()
  })
})
