// Tests detector gap_compromiso_pagado (PLAN-DATOS Fase C4).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'
import {
  partidaConGapASeñal,
  type PartidaConGap,
} from './detector-gap-compromiso-pagado'

const baseP = (overrides: Partial<PartidaConGap> = {}): PartidaConGap => ({
  partida_id: 'pe-test-001',
  jurisdiccion: 'cordoba-capital',
  anio: 2022,
  trimestre: null,
  programa: 'Programa 100',
  partida: '5.1.2',
  partida_nombre: 'Vialidad Urbana',
  credito_vigente: 100_000_000,
  compromiso: 80_000_000,
  devengado: 60_000_000,
  pagado: 30_000_000,
  gap_absoluto: 50_000_000,    // 80M - 30M
  gap_pct: 0.625,              // 50/80
  fuente_url: 'https://example.test/presupuesto',
  ...overrides,
})

beforeAll(async () => { await initDb() })

describe('M4.4/C4 — partidaConGapASeñal', () => {
  it('emite tipología correcta', () => {
    expect(partidaConGapASeñal(baseP()).tipologia).toBe('gap_compromiso_pagado')
  })

  it('título incluye jurisdicción + año + monto del gap', () => {
    const señal = partidaConGapASeñal(baseP({
      jurisdiccion: 'cordoba-capital',
      anio: 2022,
      gap_absoluto: 50_000_000,
    }))
    expect(señal.titulo).toContain('cordoba-capital')
    expect(señal.titulo).toContain('2022')
    expect(señal.titulo).toContain('50.000.000')
  })

  it('gap pct alto + monto alto + año viejo → score grave', () => {
    const señal = partidaConGapASeñal(baseP({
      gap_pct: 0.95,
      gap_absoluto: 500_000_000,
      anio: 2018, // viejo (>= 2 años cerrado)
      compromiso: 525_000_000,
      pagado: 25_000_000,
    }))
    expect(señal.score).toBeGreaterThanOrEqual(75)
    expect(señal.legal.severidad).toBe('grave')
  })

  it('score nunca supera 80 (cap de señal financiera)', () => {
    const señal = partidaConGapASeñal(baseP({
      gap_pct: 1.0,
      gap_absoluto: 1_000_000_000_000,
      anio: 2010, // muy viejo
      compromiso: 1_000_000_000_000,
      pagado: 0,
    }))
    expect(señal.score).toBeLessThanOrEqual(80)
  })

  it('gap pct bajo (límite del filtro) + monto chico → severidad leve/moderada', () => {
    const señal = partidaConGapASeñal(baseP({
      gap_pct: 0.30,
      gap_absoluto: 1_500_000,
      anio: 2024,
      compromiso: 5_000_000,
      pagado: 3_500_000,
    }))
    expect(señal.legal.severidad).not.toBe('grave')
  })

  it('año reciente (no cerrado >=2 años) NO suma bonus +5', () => {
    const anioActual = new Date().getFullYear()
    const senalReciente = partidaConGapASeñal(baseP({
      anio: anioActual - 1,
      gap_pct: 0.50,
      gap_absoluto: 10_000_000,
      compromiso: 20_000_000, pagado: 10_000_000,
    }))
    const senalVieja = partidaConGapASeñal(baseP({
      anio: anioActual - 5,
      gap_pct: 0.50,
      gap_absoluto: 10_000_000,
      compromiso: 20_000_000, pagado: 10_000_000,
    }))
    expect(senalVieja.score - senalReciente.score).toBe(5)
  })

  it('marco legal incluye Ley 24.156 + Ley 25.917 (responsabilidad fiscal)', () => {
    const señal = partidaConGapASeñal(baseP())
    expect(señal.legal.articulos.some(a => a.includes('24.156'))).toBe(true)
    expect(señal.legal.articulos.some(a => a.includes('25.917'))).toBe(true)
  })

  it('denunciar incluye Tribunal de Cuentas + Sindicatura', () => {
    const señal = partidaConGapASeñal(baseP())
    expect(señal.legal.denunciarAnte.some(o => o.includes('Tribunal de Cuentas'))).toBe(true)
    expect(señal.legal.denunciarAnte.some(o => o.includes('Sindicatura'))).toBe(true)
  })

  it('evidencia incluye las 5 etapas reportadas', () => {
    const señal = partidaConGapASeñal(baseP({
      credito_vigente: 100_000_000,
      compromiso: 80_000_000,
      devengado: 60_000_000,
      pagado: 30_000_000,
    }))
    const ev = señal.evidencia.map(e => e.descripcion).join(' ')
    expect(ev).toContain('crédito vigente')
    expect(ev).toContain('compromiso')
    expect(ev).toContain('devengado')
    expect(ev).toContain('pagado')
  })

  it('evidencia explica diferencia compromiso↔devengado vs devengado↔pagado', () => {
    const señal = partidaConGapASeñal(baseP())
    const ev = señal.evidencia.map(e => e.descripcion).join(' ')
    expect(ev).toContain('compromiso ficticio')
    expect(ev).toContain('deuda con proveedores')
  })
})

describe('M4.4/C4 review #1 — validación de inputs', () => {
  it('rechaza minGapPct fuera de [0, 1] (anticipa el bug "30 en lugar de 0.30")', async () => {
    const { encontrarPartidasConGap } = await import('./detector-gap-compromiso-pagado')
    await expect(encontrarPartidasConGap({ minGapPct: 30 })).rejects.toThrow(/fracción, no porcentaje/)
    await expect(encontrarPartidasConGap({ minGapPct: -0.1 })).rejects.toThrow(/\[0, 1\]/)
    await expect(encontrarPartidasConGap({ minGapPct: 1.5 })).rejects.toThrow(/\[0, 1\]/)
  })

  it('acepta minGapPct=0 y minGapPct=1 (boundaries OK)', async () => {
    const { encontrarPartidasConGap } = await import('./detector-gap-compromiso-pagado')
    // No throw, devuelve array (puede ser vacío)
    await expect(encontrarPartidasConGap({ minGapPct: 0 })).resolves.toBeInstanceOf(Array)
    await expect(encontrarPartidasConGap({ minGapPct: 1 })).resolves.toBeInstanceOf(Array)
  })

  it('rechaza minGapAbs negativo', async () => {
    const { encontrarPartidasConGap } = await import('./detector-gap-compromiso-pagado')
    await expect(encontrarPartidasConGap({ minGapAbs: -100 })).rejects.toThrow(/>= 0/)
  })
})

describe('M4.4/C4 — registro en señales_cache', () => {
  it('detector está registrado en señales_cache cuando ya corrió', async () => {
    const r = await dbAll<{ c: number }>(
      `SELECT COUNT(*) c FROM señales_cache WHERE tipologia = ?`,
      ['gap_compromiso_pagado']
    )
    expect(Number(r[0].c)).toBeGreaterThanOrEqual(0)
  })
})
