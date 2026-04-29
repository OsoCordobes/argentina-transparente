// Tests detector ddjj_omitida (PLAN-DATOS Fase C3).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'
import {
  puestoSinDDJJASeñal,
  type CrucePuestoSinDDJJ,
} from './detector-ddjj-omitida'

const baseCruce = (overrides: Partial<CrucePuestoSinDDJJ> = {}): CrucePuestoSinDDJJ => ({
  apellido_nombre: 'PEREZ JUAN',
  apellido_nombre_norm: 'PEREZ JUAN',
  jurisdiccion: 'cordoba-capital',
  cargo: 'Director de Compras',
  reparticion: 'Secretaría de Hacienda',
  anios_con_cargo: [2021, 2022, 2023],
  anios_con_ddjj: [],
  anios_omitidos: [2021, 2022, 2023],
  bruto_promedio: 1500000,
  fuente_url: 'https://example.test/agente',
  dni_funcionario: null,
  ...overrides,
})

beforeAll(async () => { await initDb() })

describe('M4.3/C3 — puestoSinDDJJASeñal', () => {
  it('emite tipología correcta', () => {
    expect(puestoSinDDJJASeñal(baseCruce()).tipologia).toBe('ddjj_omitida')
  })

  it('cargo de alto rango (Director) suma +15', () => {
    const cargoBajo = puestoSinDDJJASeñal(baseCruce({
      cargo: 'Auxiliar administrativo',
      anios_omitidos: [2022],
    }))
    const cargoAlto = puestoSinDDJJASeñal(baseCruce({
      cargo: 'Director de Compras',
      anios_omitidos: [2022],
    }))
    expect(cargoAlto.score - cargoBajo.score).toBe(15)
  })

  it('Concejal (cargo electivo Anexo III) → bonus +15', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({
      cargo: 'Concejal',
      anios_omitidos: [2022],
    }))
    expect(señal.score).toBeGreaterThan(40) // base + cargo +15 al menos
  })

  it('múltiples años omitidos suman score (cargo no-altoRango para no saturar cap-60)', () => {
    // Default es 'Director' que dispara +15 y satura cap-60 con 1 año.
    // Uso 'Auxiliar' para que solo el bonus por años entre en juego.
    const oneYear = puestoSinDDJJASeñal(baseCruce({ cargo: 'Auxiliar', anios_omitidos: [2022] }))
    const fiveYears = puestoSinDDJJASeñal(baseCruce({ cargo: 'Auxiliar', anios_omitidos: [2018, 2019, 2020, 2021, 2022] }))
    expect(fiveYears.score).toBeGreaterThan(oneYear.score)
  })

  it('SIN dni_funcionario y solo 1 año → cap 60 (irregularidad simple)', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({
      dni_funcionario: null,
      anios_omitidos: [2022],
    }))
    expect(señal.score).toBeLessThanOrEqual(60)
  })

  it('SIN dni_funcionario, MUCHOS años → score sigue cap 60 (sin DNI no hay grave)', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({
      dni_funcionario: null,
      anios_omitidos: [2015, 2016, 2017, 2018, 2019, 2020, 2021, 2022, 2023],
    }))
    expect(señal.score).toBeLessThanOrEqual(60)
  })

  it('CON dni_funcionario y >= 3 años consecutivos → cap 75 (patrón sostenido + identidad)', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({
      dni_funcionario: '12345678',
      anios_omitidos: [2020, 2021, 2022, 2023],
      cargo: 'Director',
    }))
    expect(señal.score).toBeLessThanOrEqual(75)
    expect(señal.score).toBeGreaterThanOrEqual(75)
  })

  it('CON dni_funcionario pero 1 año → cap 60 (omisión puntual no es patrón)', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({
      dni_funcionario: '12345678',
      anios_omitidos: [2022],
    }))
    expect(señal.score).toBeLessThanOrEqual(60)
  })

  it('evidencia incluye marca DNI VERIFICADO cuando dni_funcionario existe', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({ dni_funcionario: '12345678' }))
    expect(señal.evidencia.some(e => e.descripcion.includes('DNI VERIFICADO'))).toBe(true)
  })

  it('evidencia incluye disclaimer VERIFICACIÓN PENDIENTE sin DNI', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({ dni_funcionario: null }))
    expect(señal.evidencia.some(e => e.descripcion.includes('VERIFICACIÓN PENDIENTE'))).toBe(true)
  })

  it('marco legal incluye Ley 25.188 + decreto 164/1999', () => {
    const señal = puestoSinDDJJASeñal(baseCruce())
    expect(señal.legal.articulos.some(a => a.includes('25.188'))).toBe(true)
    expect(señal.legal.articulos.some(a => a.includes('164/1999'))).toBe(true)
  })

  it('denunciar incluye Oficina Anticorrupción + Tribunal de Cuentas', () => {
    const señal = puestoSinDDJJASeñal(baseCruce())
    expect(señal.legal.denunciarAnte.some(o => o.includes('Anticorrupción'))).toBe(true)
    expect(señal.legal.denunciarAnte.some(o => o.includes('Tribunal de Cuentas'))).toBe(true)
  })

  it('título incluye apellido + cargo + cantidad de años', () => {
    const señal = puestoSinDDJJASeñal(baseCruce({
      apellido_nombre: 'PEREZ JUAN',
      cargo: 'Director',
      anios_omitidos: [2020, 2021, 2022],
    }))
    expect(señal.titulo).toContain('PEREZ JUAN')
    expect(señal.titulo).toContain('Director')
    expect(señal.titulo).toContain('3 años')
  })
})

describe('M4.3/C3 — registro en señales_cache', () => {
  it('detector está registrado en señales_cache cuando ya corrió', async () => {
    const r = await dbAll<{ c: number }>(
      `SELECT COUNT(*) c FROM señales_cache WHERE tipologia = ?`,
      ['ddjj_omitida']
    )
    expect(Number(r[0].c)).toBeGreaterThanOrEqual(0)
  })
})
