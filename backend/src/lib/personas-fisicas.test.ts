// Tests para helpers de personas_fisicas (PLAN-DATOS Fase A1, review iteración #1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, dbRun } from './db'
import {
  normalizarApellidoNombre,
  upsertPersonaFisica,
  getPersonaFisicaPorDNI,
  getPersonaFisicaPorCUIT,
  buscarPersonasPorApellidoNombre,
} from './personas-fisicas'

const TEST_DNIS = ['11111111', '12345678', '24563128']

beforeAll(async () => { await initDb() })
afterAll(async () => {
  for (const d of TEST_DNIS) {
    try { await dbRun(`DELETE FROM personas_fisicas WHERE dni = ?`, [d]) } catch { /* idempotente */ }
  }
})

describe('A1 review #1 — normalizarApellidoNombre', () => {
  it('UPPER + sin tildes', () => {
    expect(normalizarApellidoNombre('Pérez, María')).toBe('PEREZ MARIA')
    expect(normalizarApellidoNombre('FERNÁNDEZ ALEJANDRA')).toBe('FERNANDEZ ALEJANDRA')
  })
  it('colapsa espacios múltiples', () => {
    expect(normalizarApellidoNombre('  PEREZ   JUAN   PABLO  ')).toBe('PEREZ JUAN PABLO')
  })
  it('quita puntuación', () => {
    expect(normalizarApellidoNombre('PEREZ, JUAN.')).toBe('PEREZ JUAN')
  })
})

describe('A1 review #1 — upsertPersonaFisica', () => {
  it('rechaza DNI inválido', async () => {
    await expect(upsertPersonaFisica({
      dni: 'abc', apellidoNombre: 'X',
    })).rejects.toThrow(/DNI inválido/)
  })

  it('rechaza CUIT con dígito verificador erróneo', async () => {
    await expect(upsertPersonaFisica({
      dni: '12345678',
      cuit: '20-12345678-7', // DV correcto sería 6
      apellidoNombre: 'Test',
    })).rejects.toThrow(/CUIT inválido/)
  })

  it('rechaza CUIT con prefijo de PJ (30/33/34) para una PF', async () => {
    await expect(upsertPersonaFisica({
      dni: '12345678',
      cuit: '30-12345678-1', // prefijo PJ
      apellidoNombre: 'Test',
    })).rejects.toThrow(/no es de Persona Física/)
  })

  it('inserta PF nueva con DNI válido — cuit queda null si caller no lo pasa (review #2)', async () => {
    const dni = await upsertPersonaFisica({
      dni: '12345678',
      apellidoNombre: 'Pérez, Juan',
      fuentesUrl: ['https://example.test/source-1'],
    })
    expect(dni).toBe('12345678')
    const pf = await getPersonaFisicaPorDNI('12345678')
    expect(pf).not.toBeNull()
    expect(pf!.apellidoNombreNorm).toBe('PEREZ JUAN')
    // Review #2 A1: ya no auto-derivamos CUIT con prefijo 20 — eso asignaba
    // género masculino por default. Sin confirmación externa, cuit queda null.
    expect(pf!.cuit).toBeNull()
    expect(pf!.fuentesUrl).toContain('https://example.test/source-1')
  })

  it('inserta PF con CUIT explícito (caller lo pasa) y lo guarda formateado', async () => {
    await upsertPersonaFisica({
      dni: '14289301',
      cuit: '20-14289301-1', // CUIT válido módulo-11
      apellidoNombre: 'Test Caller',
    })
    const pf = await getPersonaFisicaPorDNI('14289301')
    expect(pf!.cuit).toBe('20-14289301-1')
  })

  it('upsert preserva primer_visto al actualizar', async () => {
    await upsertPersonaFisica({
      dni: '11111111', apellidoNombre: 'Original', fuentesUrl: ['https://a.test'],
    })
    const v1 = await getPersonaFisicaPorDNI('11111111')
    // DuckDB devuelve TIMESTAMP como Date — castear a string para comparación estable
    const primerVistoOriginal = String(v1!.primerVisto)
    // Delay >1s para que ultimo_visto cambie a nivel segundos (DuckDB TIMESTAMP
    // tiene resolución a segundos cuando viene de ISO string vía .toISOString()).
    await new Promise(r => setTimeout(r, 1100))
    await upsertPersonaFisica({
      dni: '11111111', apellidoNombre: 'Actualizado', fuentesUrl: ['https://b.test'],
    })
    const v2 = await getPersonaFisicaPorDNI('11111111')
    expect(String(v2!.primerVisto)).toBe(primerVistoOriginal) // preservado
    expect(String(v2!.ultimoVisto)).not.toBe(primerVistoOriginal) // actualizado
  })

  it('upsert acumula fuentes_url sin duplicar', async () => {
    await upsertPersonaFisica({
      dni: '24563128', apellidoNombre: 'Maria',
      fuentesUrl: ['https://a.test', 'https://b.test'],
    })
    await upsertPersonaFisica({
      dni: '24563128', apellidoNombre: 'Maria',
      fuentesUrl: ['https://b.test', 'https://c.test'], // b.test duplicado
    })
    const pf = await getPersonaFisicaPorDNI('24563128')
    expect(pf!.fuentesUrl.sort()).toEqual(['https://a.test', 'https://b.test', 'https://c.test'])
  })

  it('upsert tolera DNI con puntos/guiones (normaliza)', async () => {
    await upsertPersonaFisica({
      dni: '12.345.678', apellidoNombre: 'Test',
    })
    const pf = await getPersonaFisicaPorDNI('12345678')
    expect(pf).not.toBeNull()
  })
})

describe('A1 review #1 — lookups', () => {
  it('getPersonaFisicaPorCUIT recupera PF insertada', async () => {
    await upsertPersonaFisica({
      dni: '24563128',
      cuit: '27-24563128-1', // verificado válido
      apellidoNombre: 'Maria Test',
    })
    const pf = await getPersonaFisicaPorCUIT('27-24563128-1')
    expect(pf).not.toBeNull()
    expect(pf!.dni).toBe('24563128')
  })

  it('getPersonaFisicaPorCUIT acepta CUIT sin separadores', async () => {
    const pf = await getPersonaFisicaPorCUIT('27245631281')
    expect(pf).not.toBeNull()
    expect(pf!.dni).toBe('24563128')
  })

  it('buscarPersonasPorApellidoNombre devuelve match por apellido_nombre_norm', async () => {
    await upsertPersonaFisica({ dni: '12345678', apellidoNombre: 'Pérez Juan' })
    const matches = await buscarPersonasPorApellidoNombre('PEREZ JUAN')
    expect(matches.length).toBeGreaterThanOrEqual(1)
    expect(matches.some(p => p.dni === '12345678')).toBe(true)
  })

  it('buscarPersonasPorApellidoNombre normaliza el query', async () => {
    const matches = await buscarPersonasPorApellidoNombre('Pérez, Juan')
    expect(matches.some(p => p.dni === '12345678')).toBe(true)
  })

  it('lookup con DNI inexistente devuelve null', async () => {
    // Audit fix R1.1: 99999999 colisionaba con DNIs reales cargados desde
    // IGJ. Usamos un DNI con padding extremo (>8 dígitos válidos) que el
    // normalizer reduce a longitud no-DNI y por ende nunca se popula.
    const dniInexistente = '999999999999'  // 12 dígitos → fuera de rango DNI
    expect(await getPersonaFisicaPorDNI(dniInexistente)).toBeNull()
    expect(await getPersonaFisicaPorCUIT('20-99999999-9')).toBeNull()
  })
})
