// Tests del detector M4.1 con refactor C1 (filtro geográfico + cap-60).
// Read-only para evitar acoplar a DB productiva.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'
import {
  candidatoASeñal,
  aggregarPatronesSistemicos,
  patronASeñal,
  factorBaseRate,
  capScoreSegunVerificacion,
  coincideProvinciaFuncionario,
  type CruceCandidato,
} from './detector-conflicto-funcionario-proveedor'

const baseC = (overrides: Partial<CruceCandidato> = {}): CruceCandidato => ({
  funcionario: 'PEREZ JUAN',
  funcionario_norm: 'PEREZ JUAN',
  jurisdiccion: 'cordoba-capital',
  reparticiones: ['SECRETARIA OBRAS'],
  cargos: ['Director'],
  unique_dnis_igj: 1,
  apellido_freq_agentes: 3,  // raro por default (factor 1.25)
  empresa: 'X SA',
  cuit_empresa: '30-1-1',
  dni_director: '1',
  contratos_count: 1,
  monto_total: 1_000_000,
  fuente_url_contratos: ['https://x/c1.xls'],
  anios_funcionario: [2022],
  anios_contrato: [2022],
  overlap_temporal: true,
  // Defaults C1: provincia desconocida (RNS sin data) y DNI sin verificar
  dom_fiscal_provincia: null,
  coincide_provincia: 'desconocido',
  dni_funcionario_confirmado: null,
  ...overrides,
})

beforeAll(async () => { await initDb() })

describe('M4.1/C1 — coincideProvinciaFuncionario', () => {
  it('cordoba-capital + CORDOBA → si', () => {
    expect(coincideProvinciaFuncionario('cordoba-capital', 'CORDOBA')).toBe('si')
  })
  it('cordoba-provincia + CORDOBA → si', () => {
    expect(coincideProvinciaFuncionario('cordoba-provincia', 'CORDOBA')).toBe('si')
  })
  it('cordoba-capital + CIUDAD AUTONOMA DE BUENOS AIRES → no (mata Renault FP)', () => {
    expect(coincideProvinciaFuncionario('cordoba-capital', 'CIUDAD AUTONOMA DE BUENOS AIRES')).toBe('no')
    expect(coincideProvinciaFuncionario('cordoba-capital', 'BUENOS AIRES')).toBe('no')
  })
  it('cordoba-capital + null → desconocido (RNS sin data, no rechaza)', () => {
    expect(coincideProvinciaFuncionario('cordoba-capital', null)).toBe('desconocido')
  })
  it('jurisdicción no mapeada (nacion) → desconocido (no se filtra)', () => {
    expect(coincideProvinciaFuncionario('nacion', 'CORDOBA')).toBe('desconocido')
    expect(coincideProvinciaFuncionario('nacion', 'BUENOS AIRES')).toBe('desconocido')
  })
  it('tolera tildes / variantes en provincia', () => {
    expect(coincideProvinciaFuncionario('cordoba-capital', 'CÓRDOBA')).toBe('si')
    expect(coincideProvinciaFuncionario('cordoba-capital', 'cordoba')).toBe('si')
    expect(coincideProvinciaFuncionario('cordoba-capital', 'Córdoba')).toBe('si')
  })
})

describe('M4.1/C1 — capScoreSegunVerificacion', () => {
  it('sin DNI confirmado → 60', () => {
    expect(capScoreSegunVerificacion({ dni_director: '12345678', dni_funcionario_confirmado: null })).toBe(60)
  })
  it('DNI confirmado coincide con director → 95', () => {
    expect(capScoreSegunVerificacion({ dni_director: '12345678', dni_funcionario_confirmado: '12345678' })).toBe(95)
  })
  it('DNI confirmado pero no coincide (homonimia) → 60', () => {
    expect(capScoreSegunVerificacion({ dni_director: '12345678', dni_funcionario_confirmado: '99999999' })).toBe(60)
  })
})

describe('M4.1/C1 — candidatoASeñal con cap dinámico', () => {
  it('sin DNI confirmado, monto extremo → score CAP a 60 (NUNCA grave)', () => {
    const c: CruceCandidato = baseC({
      monto_total: 1_000_000_000_000, // 1 billón
      contratos_count: 100,
      unique_dnis_igj: 1,
      cargos: ['Director'],
      apellido_freq_agentes: 1,
      dni_funcionario_confirmado: null, // explícitamente sin verificar
    })
    const señal = candidatoASeñal(c)
    expect(señal.score).toBeLessThanOrEqual(60)
    expect(señal.legal.severidad).not.toBe('grave')
  })

  it('CON DNI confirmado coincidente, monto alto → score puede llegar ≥ 75 (grave)', () => {
    const c: CruceCandidato = baseC({
      dni_director: '12345678',
      dni_funcionario_confirmado: '12345678', // verificado
      monto_total: 50_000_000,
      unique_dnis_igj: 1,
      cargos: ['Director'],
      apellido_freq_agentes: 3,
    })
    const señal = candidatoASeñal(c)
    expect(señal.score).toBeGreaterThanOrEqual(75)
    expect(señal.legal.severidad).toBe('grave')
  })

  it('CON DNI confirmado, score nunca supera 95', () => {
    const c: CruceCandidato = baseC({
      dni_director: '12345678',
      dni_funcionario_confirmado: '12345678',
      monto_total: 1_000_000_000_000,
      contratos_count: 100,
      unique_dnis_igj: 1,
      cargos: ['Director'],
      apellido_freq_agentes: 1,
    })
    expect(candidatoASeñal(c).score).toBeLessThanOrEqual(95)
  })

  it('DNI confirmado pero NO coincide con director → cap 60 (homonimia descartada)', () => {
    const c: CruceCandidato = baseC({
      dni_director: '12345678',
      dni_funcionario_confirmado: '99999999', // distinto → homonimia
      monto_total: 50_000_000,
      cargos: ['Director'],
      unique_dnis_igj: 1,
      apellido_freq_agentes: 3,
    })
    expect(candidatoASeñal(c).score).toBeLessThanOrEqual(60)
  })

  it('señal incluye texto de filtro geográfico en evidencia', () => {
    const c = baseC({ coincide_provincia: 'si', dom_fiscal_provincia: 'CORDOBA' })
    const señal = candidatoASeñal(c)
    expect(señal.evidencia.some(e => e.descripcion.includes('Filtro geográfico OK'))).toBe(true)
  })

  it('señal incluye disclaimer cap-60 cuando no hay DNI confirmado', () => {
    const señal = candidatoASeñal(baseC())
    expect(señal.evidencia.some(e => e.descripcion.includes('Cap-60'))).toBe(true)
  })

  it('señal incluye marca DNI VERIFICADO cuando dni_funcionario_confirmado coincide', () => {
    const c = baseC({ dni_director: '12345678', dni_funcionario_confirmado: '12345678' })
    const señal = candidatoASeñal(c)
    expect(señal.evidencia.some(e => e.descripcion.includes('DNI VERIFICADO'))).toBe(true)
  })

  it('título y resumen incluyen funcionario y empresa', () => {
    const c = baseC({ funcionario: 'PEREZ JUAN', empresa: 'CONSTRUCTORA TEST SA' })
    const señal = candidatoASeñal(c)
    expect(señal.titulo).toContain('PEREZ JUAN')
    expect(señal.titulo).toContain('CONSTRUCTORA TEST SA')
    expect(señal.legal.articulos.some(a => a.includes('Ética Pública'))).toBe(true)
  })

  it('candidatoASeñal: monto bajo + dnis altos → score leve/moderado', () => {
    const c: CruceCandidato = baseC({
      funcionario: 'GOMEZ MARIA', funcionario_norm: 'GOMEZ MARIA',
      reparticiones: [], cargos: [],
      unique_dnis_igj: 3,
      empresa: 'EMPRESA CHICA', cuit_empresa: '30-99999999-9',
      dni_director: '99999999', contratos_count: 1, monto_total: 50_000,
      apellido_freq_agentes: 50, // común (factor 0.85)
    })
    const señal = candidatoASeñal(c)
    expect(señal.score).toBeLessThan(75)
    expect(señal.legal.severidad).not.toBe('grave')
  })

  it('candidatoASeñal: bonus +15 por cargo con poder (Director, Secretario)', () => {
    // DNI verificado para escapar cap-60 y poder observar el +15.
    const baseCandidate = baseC({
      reparticiones: [], cargos: [],
      unique_dnis_igj: 3, empresa: 'E', cuit_empresa: '30-1-1',
      dni_director: '12345678', dni_funcionario_confirmado: '12345678',
      contratos_count: 1, monto_total: 50_000,
      fuente_url_contratos: [],
      anios_funcionario: [2022], anios_contrato: [2022], overlap_temporal: true,
      apellido_freq_agentes: 3,
    })
    const senalSinCargo = candidatoASeñal(baseCandidate)
    const senalConDirector = candidatoASeñal({ ...baseCandidate, cargos: ['Director de Compras'] })
    const senalConJefe = candidatoASeñal({ ...baseCandidate, cargos: ['Jefe de Personal'] })
    const senalConDocente = candidatoASeñal({ ...baseCandidate, cargos: ['Docente Auxiliar'] })

    expect(senalConDirector.score - senalSinCargo.score).toBe(15)
    expect(senalConJefe.score - senalSinCargo.score).toBe(15)
    expect(senalConDocente.score).toBe(senalSinCargo.score) // sin bonus
  })
})

describe('M4.1/C1 — patrón sistémico con cap dinámico', () => {
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
  })

  it('aggregarPatronesSistemicos: dedupe por CUIT', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A.B.C. SA', monto_total: 1_000_000 }),
      baseC({ cuit_empresa: '30-1-1', empresa: 'ABC SA', monto_total: 2_000_000 }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'D SA', monto_total: 500_000 }),
    ]
    const patrones = aggregarPatronesSistemicos(cs, 2)
    expect(patrones).toHaveLength(1)
    expect(patrones[0].empresas_count).toBe(2)
    expect(patrones[0].monto_total).toBe(3_500_000)
  })

  it('aggregarPatronesSistemicos: jurisdicciones distintas no se mezclan', () => {
    const cs = [
      baseC({ jurisdiccion: 'cordoba-capital', cuit_empresa: '30-1-1', empresa: 'A' }),
      baseC({ jurisdiccion: 'cordoba-provincia', cuit_empresa: '30-2-2', empresa: 'B' }),
    ]
    const patrones = aggregarPatronesSistemicos(cs, 2)
    expect(patrones).toHaveLength(0)
  })

  it('patronASeñal: SIN dni_funcionario_confirmado → cap 60 incluso con muchas empresas', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A SA', monto_total: 10_000_000 }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B SA', monto_total: 5_000_000 }),
      baseC({ cuit_empresa: '30-3-3', empresa: 'C SA', monto_total: 2_000_000 }),
    ]
    const [p] = aggregarPatronesSistemicos(cs, 2)
    expect(p.dni_funcionario_confirmado).toBeNull()
    expect(patronASeñal(p).score).toBeLessThanOrEqual(60)
    expect(patronASeñal(p).legal.severidad).not.toBe('grave')
  })

  it('patronASeñal: CON dni_funcionario_confirmado coincidente en TODAS las empresas → cap 95', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A SA', monto_total: 10_000_000, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B SA', monto_total: 5_000_000, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
      baseC({ cuit_empresa: '30-3-3', empresa: 'C SA', monto_total: 2_000_000, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
    ]
    const [p] = aggregarPatronesSistemicos(cs, 2)
    expect(p.dni_funcionario_confirmado).toBe('12345678')
    const señal = patronASeñal(p)
    expect(señal.tipologia).toBe('conflicto_funcionario_multiproveedor')
    expect(señal.score).toBeGreaterThanOrEqual(75)
    expect(señal.legal.severidad).toBe('grave')
    expect(señal.score).toBeLessThanOrEqual(95)
  })

  it('patronASeñal: DNI confirmado pero alguna empresa con director DISTINTO → cap 60 (no es el mismo)', () => {
    const cs = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A SA', dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B SA', dni_director: '99999999', dni_funcionario_confirmado: '12345678' }), // ¡otro director!
    ]
    const [p] = aggregarPatronesSistemicos(cs, 2)
    expect(p.dni_funcionario_confirmado).toBe('12345678')
    expect(patronASeñal(p).score).toBeLessThanOrEqual(60)
  })

  it('patronASeñal: bonus +15 por cargo con poder', () => {
    // DNI verificado en TODAS las empresas para escapar cap-60 y observar el +15.
    const csBase = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A', cargos: ['docente'], monto_total: 1_000, unique_dnis_igj: 4, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B', cargos: ['docente'], monto_total: 1_000, unique_dnis_igj: 4, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
    ]
    const csConPoder = [
      baseC({ cuit_empresa: '30-1-1', empresa: 'A', cargos: ['Secretario'], monto_total: 1_000, unique_dnis_igj: 4, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
      baseC({ cuit_empresa: '30-2-2', empresa: 'B', cargos: ['Secretario'], monto_total: 1_000, unique_dnis_igj: 4, dni_director: '12345678', dni_funcionario_confirmado: '12345678' }),
    ]
    const [pBase] = aggregarPatronesSistemicos(csBase, 2)
    const [pPoder] = aggregarPatronesSistemicos(csConPoder, 2)
    expect(patronASeñal(pPoder).score - patronASeñal(pBase).score).toBe(15)
  })
})

describe('M4.1/C1 — base rate', () => {
  it('factorBaseRate: ranges esperados', () => {
    expect(factorBaseRate(0)).toBe(1.25)
    expect(factorBaseRate(5)).toBe(1.25)
    expect(factorBaseRate(6)).toBe(1.0)
    expect(factorBaseRate(20)).toBe(1.0)
    expect(factorBaseRate(50)).toBe(0.85)
    expect(factorBaseRate(100)).toBe(0.85)
    expect(factorBaseRate(101)).toBe(0.65)
  })

  it('candidatoASeñal: apellido común reduce score vs apellido raro', () => {
    // DNI verificado para escapar cap-60 y observar la diferencia por base rate.
    const baseRare = baseC({ apellido_freq_agentes: 3, monto_total: 100_000, unique_dnis_igj: 2, cargos: ['docente'], dni_director: '12345678', dni_funcionario_confirmado: '12345678' })
    const baseCommon = baseC({ apellido_freq_agentes: 200, monto_total: 100_000, unique_dnis_igj: 2, cargos: ['docente'], dni_director: '12345678', dni_funcionario_confirmado: '12345678' })
    const sRare = candidatoASeñal(baseRare).score
    const sCommon = candidatoASeñal(baseCommon).score
    expect(sCommon).toBeLessThan(sRare)
  })
})

describe('M4.1 — registro en señales_cache', () => {
  it('detector está registrado en señales_cache cuando ya corrió', async () => {
    const r = await dbAll<{ c: number }>(
      `SELECT COUNT(*) c FROM señales_cache WHERE tipologia = ?`,
      ['conflicto_funcionario_proveedor']
    )
    expect(Number(r[0].c)).toBeGreaterThanOrEqual(0)
  })
})
