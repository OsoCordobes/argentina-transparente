import { describe, it, expect } from 'vitest'
import { makeContrato, makeMockCtx } from './helpers'
import { directoresCompartidos } from '../signals/directores_compartidos'
import { redDeEmpresas }         from '../signals/red_de_empresas'
import { rotacionCoordinada }    from '../signals/rotacion_coordinada'

// ─── directores_compartidos ───────────────────────────────────────────────────

describe('directores_compartidos', () => {
  it('fires when a director appears in ≥2 companies', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato({ monto: 10_000_000 })],
      directoresCompartidos: [{
        director:    'JUAN PÉREZ',
        empresas:    ['ALFA SA', 'BETA SRL'],
        contratos:   4,
        monto_total: 50_000_000,
      }],
    })
    const result = await directoresCompartidos.detect(ctx)
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('directores_compartidos')
  })

  it('fires with multiple directors', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato({ monto: 5_000_000 })],
      directoresCompartidos: [
        { director: 'PÉREZ', empresas: ['A SA', 'B SRL'], contratos: 2, monto_total: 20_000_000 },
        { director: 'GARCÍA', empresas: ['C SA', 'D SRL', 'E SA'], contratos: 5, monto_total: 30_000_000 },
      ],
    })
    const result = await directoresCompartidos.detect(ctx)
    expect(result).toHaveLength(1)
    expect(result[0].titulo).toContain('2')
  })

  it('does NOT fire with no shared directors', async () => {
    const ctx = makeMockCtx({ contratos: [makeContrato()], directoresCompartidos: [] })
    const result = await directoresCompartidos.detect(ctx)
    expect(result).toHaveLength(0)
  })

  it('severity is grave', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato()],
      directoresCompartidos: [{ director: 'X', empresas: ['A', 'B'], contratos: 2, monto_total: 1_000_000 }],
    })
    const result = await directoresCompartidos.detect(ctx)
    expect(result[0].severidad).toBe('grave')
  })

  it('score is 85', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato()],
      directoresCompartidos: [{ director: 'X', empresas: ['A', 'B'], contratos: 1, monto_total: 1_000_000 }],
    })
    const result = await directoresCompartidos.detect(ctx)
    expect(result[0].score).toBe(85)
  })

  it('includes empresa entities in hallazgo', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato()],
      directoresCompartidos: [{ director: 'PÉREZ', empresas: ['ALFA SA', 'BETA SRL'], contratos: 3, monto_total: 10_000_000 }],
    })
    const result = await directoresCompartidos.detect(ctx)
    const nombres = result[0].entidades_afectadas.map(e => e.nombre)
    expect(nombres).toContain('ALFA SA')
    expect(nombres).toContain('BETA SRL')
  })
})

// ─── red_de_empresas ──────────────────────────────────────────────────────────

describe('red_de_empresas', () => {
  it('fires when pair shares ≥2 directors', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato({ monto: 5_000_000 })],
      directoresCompartidos: [
        { director: 'PÉREZ', empresas: ['ALFA SA', 'BETA SRL'], contratos: 2, monto_total: 20_000_000 },
        { director: 'GARCÍA', empresas: ['ALFA SA', 'BETA SRL'], contratos: 3, monto_total: 30_000_000 },
      ],
    })
    const result = await redDeEmpresas.detect(ctx)
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('red_de_empresas')
  })

  it('does NOT fire when pair shares only 1 director', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato()],
      directoresCompartidos: [
        { director: 'PÉREZ', empresas: ['ALFA SA', 'BETA SRL'], contratos: 2, monto_total: 10_000_000 },
      ],
    })
    const result = await redDeEmpresas.detect(ctx)
    expect(result).toHaveLength(0)
  })

  it('does NOT fire with empty shared directors list', async () => {
    const ctx = makeMockCtx({ contratos: [makeContrato()], directoresCompartidos: [] })
    const result = await redDeEmpresas.detect(ctx)
    expect(result).toHaveLength(0)
  })

  it('severity is grave', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato()],
      directoresCompartidos: [
        { director: 'P', empresas: ['A SA', 'B SA'], contratos: 1, monto_total: 1_000_000 },
        { director: 'Q', empresas: ['A SA', 'B SA'], contratos: 1, monto_total: 1_000_000 },
      ],
    })
    const result = await redDeEmpresas.detect(ctx)
    expect(result[0].severidad).toBe('grave')
  })

  it('score is 88', async () => {
    const ctx = makeMockCtx({
      contratos: [makeContrato()],
      directoresCompartidos: [
        { director: 'P', empresas: ['A', 'B'], contratos: 1, monto_total: 100_000 },
        { director: 'Q', empresas: ['A', 'B'], contratos: 1, monto_total: 100_000 },
      ],
    })
    const result = await redDeEmpresas.detect(ctx)
    expect(result[0].score).toBe(88)
  })
})

// ─── rotacion_coordinada ──────────────────────────────────────────────────────

describe('rotacion_coordinada', () => {
  it('fires when two providers alternate in an area across ≥3 years', async () => {
    const area = 'LIMPIEZA'
    const contratos = [
      makeContrato({ area, anio: 2019, monto: 10_000_000, proveedor_normalizado: 'ALFA SA', tipo: 'licitacion_publica', numero: '1' }),
      makeContrato({ area, anio: 2020, monto: 10_000_000, proveedor_normalizado: 'ALFA SA', tipo: 'licitacion_publica', numero: '2' }),
      makeContrato({ area, anio: 2021, monto: 10_000_000, proveedor_normalizado: 'BETA SRL', tipo: 'licitacion_publica', numero: '3' }),
      makeContrato({ area, anio: 2022, monto: 10_000_000, proveedor_normalizado: 'BETA SRL', tipo: 'licitacion_publica', numero: '4' }),
    ]
    const result = await rotacionCoordinada.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('rotacion_coordinada')
  })

  it('does NOT fire when providers overlap in same years', async () => {
    const area = 'INFORMÁTICA'
    const contratos = [
      makeContrato({ area, anio: 2020, monto: 10_000_000, proveedor_normalizado: 'ALFA SA',  tipo: 'licitacion_publica', numero: '1' }),
      makeContrato({ area, anio: 2020, monto: 10_000_000, proveedor_normalizado: 'BETA SRL', tipo: 'licitacion_publica', numero: '2' }),
      makeContrato({ area, anio: 2021, monto: 10_000_000, proveedor_normalizado: 'ALFA SA',  tipo: 'licitacion_publica', numero: '3' }),
    ]
    const result = await rotacionCoordinada.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when area has <3 distinct years', async () => {
    const area = 'OBRAS'
    const contratos = [
      makeContrato({ area, anio: 2021, monto: 20_000_000, proveedor_normalizado: 'ALFA SA',  tipo: 'licitacion_publica', numero: '1' }),
      makeContrato({ area, anio: 2022, monto: 20_000_000, proveedor_normalizado: 'BETA SRL', tipo: 'licitacion_publica', numero: '2' }),
    ]
    const result = await rotacionCoordinada.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when area total <$10M', async () => {
    const area = 'MICRO'
    const contratos = [
      makeContrato({ area, anio: 2019, monto: 3_000_000, proveedor_normalizado: 'A', tipo: 'licitacion_publica', numero: '1' }),
      makeContrato({ area, anio: 2020, monto: 3_000_000, proveedor_normalizado: 'B', tipo: 'licitacion_publica', numero: '2' }),
      makeContrato({ area, anio: 2021, monto: 3_000_000, proveedor_normalizado: 'A', tipo: 'licitacion_publica', numero: '3' }),
    ]
    const result = await rotacionCoordinada.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire with empty contratos', async () => {
    const result = await rotacionCoordinada.detect(makeMockCtx({ contratos: [] }))
    expect(result).toHaveLength(0)
  })

  it('severity is grave', async () => {
    const area = 'SEGURIDAD'
    const contratos = [
      makeContrato({ area, anio: 2019, monto: 15_000_000, proveedor_normalizado: 'ALFA SA',  tipo: 'licitacion_publica', numero: '1' }),
      makeContrato({ area, anio: 2020, monto: 15_000_000, proveedor_normalizado: 'ALFA SA',  tipo: 'licitacion_publica', numero: '2' }),
      makeContrato({ area, anio: 2021, monto: 15_000_000, proveedor_normalizado: 'BETA SRL', tipo: 'licitacion_publica', numero: '3' }),
    ]
    const result = await rotacionCoordinada.detect(makeMockCtx({ contratos }))
    expect(result[0].severidad).toBe('grave')
  })
})
