// Tests para helpers de personas_juridicas (PLAN-DATOS Fase A2, review iteración #1).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, dbRun } from './db'
import {
  normalizarRazonSocial,
  upsertPersonaJuridica,
  getPersonaJuridicaPorCUIT,
  buscarPersonasJuridicasPorRazon,
  buscarPersonasJuridicasPorProvincia,
} from './personas-juridicas'

const TEST_CUITS = [
  '30-12345678-1',
  '33-69345023-9',
  '30-71234567-1',
  '30-68923451-4',
]

beforeAll(async () => { await initDb() })
afterAll(async () => {
  for (const c of TEST_CUITS) {
    try { await dbRun(`DELETE FROM personas_juridicas WHERE cuit = ?`, [c]) } catch { /* idempotente */ }
  }
})

describe('A2 review #1 — normalizarRazonSocial', () => {
  it('UPPER + sin tildes', () => {
    expect(normalizarRazonSocial('Construcción Águila SA')).toBe('CONSTRUCCION AGUILA')
  })
  it('quita sufijo SA / SRL / SAS', () => {
    expect(normalizarRazonSocial('ACME SA')).toBe('ACME')
    expect(normalizarRazonSocial('ACME S.A.')).toBe('ACME')
    expect(normalizarRazonSocial('ACME SRL')).toBe('ACME')
    expect(normalizarRazonSocial('Acme S.R.L.')).toBe('ACME')
    expect(normalizarRazonSocial('ACME SAS')).toBe('ACME')
  })
  it('mantiene nombres sin sufijo', () => {
    expect(normalizarRazonSocial('FUNDACION X')).toBe('FUNDACION X')
  })
  it('alias colapsan al mismo bucket', () => {
    expect(normalizarRazonSocial('CONSTRUCTORA DEL CENTRO SA'))
      .toBe(normalizarRazonSocial('Constructora del Centro S.A.'))
  })
})

describe('A2 review #1 — upsertPersonaJuridica', () => {
  it('rechaza CUIT con prefijo PF (20/23/24/27)', async () => {
    await expect(upsertPersonaJuridica({
      cuit: '20-12345678-6', // prefijo PF
      razonSocial: 'X',
    })).rejects.toThrow(/no es de Persona Jurídica/)
  })

  it('rechaza CUIT con DV erróneo', async () => {
    await expect(upsertPersonaJuridica({
      cuit: '30-12345678-9', // DV correcto sería 1
      razonSocial: 'X',
    })).rejects.toThrow(/CUIT inválido/)
  })

  it('inserta PJ válida y formatea CUIT canónicamente', async () => {
    const cuit = await upsertPersonaJuridica({
      cuit: '30123456781', // sin guiones
      razonSocial: 'Test SA',
      tipoSocietario: 'SA',
      domFiscalProvincia: 'CORDOBA',
    })
    expect(cuit).toBe('30-12345678-1')
    const pj = await getPersonaJuridicaPorCUIT('30-12345678-1')
    expect(pj).not.toBeNull()
    expect(pj!.razonSocial).toBe('Test SA')
    expect(pj!.razonSocialNorm).toBe('TEST') // sufijo SA stripped
    expect(pj!.domFiscalProvincia).toBe('CORDOBA')
  })

  it('al cambiar razonSocial agrega la anterior a alias automáticamente', async () => {
    await upsertPersonaJuridica({
      cuit: '33-69345023-9',
      razonSocial: 'AFIP Original',
    })
    await upsertPersonaJuridica({
      cuit: '33-69345023-9',
      razonSocial: 'AFIP Renombrada',
    })
    const pj = await getPersonaJuridicaPorCUIT('33-69345023-9')
    expect(pj!.razonSocial).toBe('AFIP Renombrada')
    expect(pj!.alias).toContain('AFIP Original')
  })

  it('acumula fuentes_url incrementalmente sin duplicar', async () => {
    await upsertPersonaJuridica({
      cuit: '30-71234567-1', razonSocial: 'X',
      fuentesUrl: ['https://a.test', 'https://b.test'],
    })
    await upsertPersonaJuridica({
      cuit: '30-71234567-1', razonSocial: 'X',
      fuentesUrl: ['https://b.test', 'https://c.test'],
    })
    const pj = await getPersonaJuridicaPorCUIT('30-71234567-1')
    expect(pj!.fuentesUrl.sort()).toEqual(['https://a.test', 'https://b.test', 'https://c.test'])
  })

  it('preserva campos opcionales no-pasados al actualizar (no los nullea)', async () => {
    await upsertPersonaJuridica({
      cuit: '30-68923451-4',
      razonSocial: 'X',
      tipoSocietario: 'SRL',
      domFiscalProvincia: 'CORDOBA',
      esEmpleador: true,
    })
    // Update solo cambia razonSocial — los otros deben preservarse
    await upsertPersonaJuridica({
      cuit: '30-68923451-4',
      razonSocial: 'Y',
    })
    const pj = await getPersonaJuridicaPorCUIT('30-68923451-4')
    expect(pj!.tipoSocietario).toBe('SRL')
    expect(pj!.domFiscalProvincia).toBe('CORDOBA')
    expect(pj!.esEmpleador).toBe(true)
    expect(pj!.razonSocial).toBe('Y') // este sí cambia
  })
})

describe('A2 review #1 — lookups', () => {
  it('getPersonaJuridicaPorCUIT acepta CUIT con o sin guiones', async () => {
    await upsertPersonaJuridica({ cuit: '30-12345678-1', razonSocial: 'X' })
    expect(await getPersonaJuridicaPorCUIT('30-12345678-1')).not.toBeNull()
    expect(await getPersonaJuridicaPorCUIT('30123456781')).not.toBeNull()
  })

  it('buscarPersonasJuridicasPorRazon alias colapsan al mismo bucket', async () => {
    await upsertPersonaJuridica({ cuit: '30-71234567-1', razonSocial: 'CONSTRUCTORA DEL CENTRO SA' })
    // Buscar con alias diferente — debería matchear el mismo bucket
    const matches1 = await buscarPersonasJuridicasPorRazon('Constructora del Centro S.A.')
    const matches2 = await buscarPersonasJuridicasPorRazon('CONSTRUCTORA DEL CENTRO SA')
    expect(matches1.some(p => p.cuit === '30-71234567-1')).toBe(true)
    expect(matches2.some(p => p.cuit === '30-71234567-1')).toBe(true)
  })

  it('buscarPersonasJuridicasPorProvincia recupera por dom_fiscal o dom_legal', async () => {
    await upsertPersonaJuridica({
      cuit: '30-12345678-1', razonSocial: 'X',
      domFiscalProvincia: 'CORDOBA',
    })
    const matches = await buscarPersonasJuridicasPorProvincia('CORDOBA')
    expect(matches.some(p => p.cuit === '30-12345678-1')).toBe(true)
  })
})
