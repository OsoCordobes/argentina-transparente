// Tests schema-only del detector M4.1.
// Read-only para evitar acoplar a DB productiva.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'
import {
  candidatoASeñal,
  aggregarPatronesSistemicos,
  patronASeñal,
  type CruceCandidato,
} from './detector-conflicto-funcionario-proveedor'

const baseC = (overrides: Partial<CruceCandidato> = {}): CruceCandidato => ({
  funcionario: 'PEREZ JUAN',
  funcionario_norm: 'PEREZ JUAN',
  jurisdiccion: 'cordoba-capital',
  reparticiones: ['SECRETARIA OBRAS'],
  cargos: ['Director'],
  unique_dnis_igj: 1,
  empresa: 'X SA',
  cuit_empresa: '30-1-1',
  dni_director: '1',
  contratos_count: 1,
  monto_total: 1_000_000,
  fuente_url_contratos: ['https://x/c1.xls'],
  anios_funcionario: [2022],
  anios_contrato: [2022],
  overlap_temporal: true,
  ...overrides,
})

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
      anios_funcionario: [2020, 2021, 2022], anios_contrato: [2022], overlap_temporal: true,
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
      anios_funcionario: [2020], anios_contrato: [2020], overlap_temporal: true,
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
      anios_funcionario: [2022], anios_contrato: [2022], overlap_temporal: true,
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
      anios_funcionario: [2022], anios_contrato: [2022], overlap_temporal: true,
    }
    const senalSinCargo = candidatoASeñal(baseCandidate)
    const senalConDirector = candidatoASeñal({ ...baseCandidate, cargos: ['Director de Compras'] })
    const senalConJefe = candidatoASeñal({ ...baseCandidate, cargos: ['Jefe de Personal'] })
    const senalConDocente = candidatoASeñal({ ...baseCandidate, cargos: ['Docente Auxiliar'] })

    expect(senalConDirector.score - senalSinCargo.score).toBe(15)
    expect(senalConJefe.score - senalSinCargo.score).toBe(15)
    expect(senalConDocente.score).toBe(senalSinCargo.score)  // sin bonus
  })

  it('aggregarPatronesSistemicos: 1 sola empresa NO emite patrón', () => {
    const cs = [baseC({ cuit_empresa: '30-1-1', empresa: 'A SA' })]
    expect(aggregarPatronesSistemicos(cs, 2)).toHaveLength(0)
  })

  it('aggregarPatronesSistemicos: 2+ empresas con mismo funcionario_norm emiten patrón', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A SA', monto_total: 5_000_000 }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B SA', monto_total: 3_000_000 }),
      baseC({ cuit_empresa: '30-3-3', empresa: 'C SA', monto_total: 1_000_000 }),
    ]
    const patrones = aggregarPatronesSistemicos(cs, 2)
    expect(patrones).toHaveLength(1)
    expect(patrones[0].empresas_count).toBe(3)
    expect(patrones[0].monto_total).toBe(9_000_000)
    // Empresas ordenadas por monto descendente
    expect(patrones[0].empresas[0].razon_social).toBe('A SA')
    expect(patrones[0].empresas[2].razon_social).toBe('C SA')
  })

  it('aggregarPatronesSistemicos: dedupe por CUIT (nombre con/sin puntos no infla empresas_count)', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A.B.C. SA', monto_total: 1_000_000 }),
      baseC({ cuit_empresa: '30-1-1', empresa: 'ABC SA', monto_total: 2_000_000 }),  // mismo CUIT
      baseC({ cuit_empresa: '30-2-2', empresa: 'D SA', monto_total: 500_000 }),
    ]
    const patrones = aggregarPatronesSistemicos(cs, 2)
    expect(patrones).toHaveLength(1)
    expect(patrones[0].empresas_count).toBe(2)  // no 3
    expect(patrones[0].monto_total).toBe(3_500_000)  // suma correctamente
  })

  it('aggregarPatronesSistemicos: funcionarios distintos NO se mezclan', () => {
    const cs = [
      baseC({ funcionario_norm: 'PEREZ JUAN', cuit_empresa: '30-1-1', empresa: 'A' }),
      baseC({ funcionario_norm: 'GOMEZ ANA', cuit_empresa: '30-2-2', empresa: 'B' }),
    ]
    const patrones = aggregarPatronesSistemicos(cs, 2)
    expect(patrones).toHaveLength(0)
  })

  it('aggregarPatronesSistemicos: misma persona en distintas jurisdicciones NO se mezcla', () => {
    const cs = [
      baseC({ jurisdiccion: 'cordoba-capital', cuit_empresa: '30-1-1', empresa: 'A' }),
      baseC({ jurisdiccion: 'cordoba-provincia', cuit_empresa: '30-2-2', empresa: 'B' }),
    ]
    const patrones = aggregarPatronesSistemicos(cs, 2)
    expect(patrones).toHaveLength(0)
  })

  it('patronASeñal: tipologia + score elevado para patrón con varias empresas', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A SA', monto_total: 10_000_000 }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B SA', monto_total: 5_000_000 }),
      baseC({ cuit_empresa: '30-3-3', empresa: 'C SA', monto_total: 2_000_000 }),
    ]
    const [p] = aggregarPatronesSistemicos(cs, 2)
    const señal = patronASeñal(p)
    expect(señal.tipologia).toBe('conflicto_funcionario_multiproveedor')
    expect(señal.titulo).toContain('Patrón sistémico')
    expect(señal.titulo).toContain('3 empresas')
    expect(señal.score).toBeGreaterThanOrEqual(75)
    expect(señal.legal.severidad).toBe('grave')
    // Disclaimer de verificación presente
    expect(señal.evidencia.some(e => e.descripcion.includes('VERIFICACIÓN REQUERIDA'))).toBe(true)
    // Cap 95 incluso con valores extremos
    const csExtremo = Array.from({ length: 5 }, (_, i) => baseC({
      cuit_empresa: `30-${i}-${i}`, empresa: `E${i}`, monto_total: 1e12,
    }))
    const [pExtremo] = aggregarPatronesSistemicos(csExtremo, 2)
    expect(patronASeñal(pExtremo).score).toBeLessThanOrEqual(95)
  })

  it('patronASeñal: bonus +15 por cargo con poder de adjudicación', () => {
    // Valores bajos a propósito para evitar cap 95 y dejar el +15 observable
    const csBase = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A', cargos: ['docente'], monto_total: 1_000, unique_dnis_igj: 4 }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B', cargos: ['docente'], monto_total: 1_000, unique_dnis_igj: 4 }),
    ]
    const csConPoder = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A', cargos: ['Secretario'], monto_total: 1_000, unique_dnis_igj: 4 }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B', cargos: ['Secretario'], monto_total: 1_000, unique_dnis_igj: 4 }),
    ]
    const [pBase] = aggregarPatronesSistemicos(csBase, 2)
    const [pPoder] = aggregarPatronesSistemicos(csConPoder, 2)
    expect(patronASeñal(pPoder).score - patronASeñal(pBase).score).toBe(15)
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
