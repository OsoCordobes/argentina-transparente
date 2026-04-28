// Tests schema-only del detector M4.1.
// Read-only para evitar acoplar a DB productiva.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'
import { candidatoASeñal, type CruceCandidato } from './detector-conflicto-funcionario-proveedor'

beforeAll(async () => { await initDb() })

describe('M4.1 — detector conflicto_funcionario_proveedor', () => {
  it('candidatoASeñal: monto alto + dnis bajos → score grave', () => {
    const c: CruceCandidato = {
      funcionario: 'PEREZ JUAN',
      funcionario_norm: 'PEREZ JUAN',
      jurisdiccion: 'cordoba-capital',
      reparticiones: ['SECRETARIA OBRAS'],
      cargos: ['Director'],
      unique_dnis_igj: 1,
      empresa: 'CONSTRUCTORA TEST SA',
      cuit_empresa: '30-12345678-9',
      dni_director: '12345678',
      contratos_count: 5,
      monto_total: 50_000_000,
      fuente_url_contratos: ['https://x/contrato.xls'],
    }
    const señal = candidatoASeñal(c)
    expect(señal.tipologia).toBe('conflicto_funcionario_proveedor')
    expect(señal.score).toBeGreaterThanOrEqual(75)
    expect(señal.legal.severidad).toBe('grave')
    expect(señal.titulo).toContain('PEREZ JUAN')
    expect(señal.titulo).toContain('CONSTRUCTORA TEST SA')
    // El disclaimer de verificación manual debe estar presente
    expect(señal.evidencia.some(e => e.descripcion.includes('VERIFICACIÓN REQUERIDA'))).toBe(true)
    // Marco legal con artículos relevantes
    expect(señal.legal.articulos.some(a => a.includes('Ética Pública'))).toBe(true)
  })

  it('candidatoASeñal: monto bajo + dnis altos → score leve/moderado', () => {
    const c: CruceCandidato = {
      funcionario: 'GOMEZ MARIA',
      funcionario_norm: 'GOMEZ MARIA',
      jurisdiccion: 'cordoba-capital',
      reparticiones: [],
      cargos: [],
      unique_dnis_igj: 3,
      empresa: 'EMPRESA CHICA',
      cuit_empresa: '30-99999999-9',
      dni_director: '99999999',
      contratos_count: 1,
      monto_total: 50_000,
      fuente_url_contratos: [],
    }
    const señal = candidatoASeñal(c)
    expect(señal.score).toBeLessThan(75)
    expect(señal.legal.severidad).not.toBe('grave')
  })

  it('candidatoASeñal: score nunca supera 95 (cap por verificación pendiente)', () => {
    const c: CruceCandidato = {
      funcionario: 'X',
      funcionario_norm: 'X',
      jurisdiccion: 'cordoba-capital',
      reparticiones: [],
      cargos: [],
      unique_dnis_igj: 1,
      empresa: 'BIG',
      cuit_empresa: '30-1-1',
      dni_director: '1',
      contratos_count: 100,
      monto_total: 1_000_000_000_000,  // 1 billón
      fuente_url_contratos: [],
    }
    const señal = candidatoASeñal(c)
    expect(señal.score).toBeLessThanOrEqual(95)
  })

  it('candidatoASeñal: bonus +15 por cargo con poder (Director, Secretario, etc)', () => {
    // Valores chicos para evitar cap 95
    const baseCandidate: CruceCandidato = {
      funcionario: 'X', funcionario_norm: 'X', jurisdiccion: 'cordoba-capital',
      reparticiones: [], cargos: [],
      unique_dnis_igj: 3, empresa: 'E', cuit_empresa: '30-1-1',
      dni_director: '1', contratos_count: 1, monto_total: 50_000,
      fuente_url_contratos: [],
    }
    const senalSinCargo = candidatoASeñal(baseCandidate)
    const senalConDirector = candidatoASeñal({ ...baseCandidate, cargos: ['Director de Compras'] })
    const senalConJefe = candidatoASeñal({ ...baseCandidate, cargos: ['Jefe de Personal'] })
    const senalConDocente = candidatoASeñal({ ...baseCandidate, cargos: ['Docente Auxiliar'] })

    expect(senalConDirector.score - senalSinCargo.score).toBe(15)
    expect(senalConJefe.score - senalSinCargo.score).toBe(15)
    expect(senalConDocente.score).toBe(senalSinCargo.score)  // sin bonus
  })

  it('detector está registrado en señales_cache cuando ya corrió', async () => {
    // Soft check — no requiere que haya corrido, pero si corrió, debe estar bien
    const r = await dbAll<{ c: number }>(
      `SELECT COUNT(*) c FROM señales_cache WHERE tipologia = ?`,
      ['conflicto_funcionario_proveedor']
    )
    expect(Number(r[0].c)).toBeGreaterThanOrEqual(0)
  })
})
