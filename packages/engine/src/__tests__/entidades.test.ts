import { describe, it, expect } from 'vitest'
import { makeContrato, makeEmpresa, makeMockCtx } from './helpers'
import { empresaNueva }        from '../signals/empresa_nueva'
import { empresaSinEmpleados } from '../signals/empresa_sin_empleados'

// ─── empresa_nueva ────────────────────────────────────────────────────────────

describe('empresa_nueva', () => {
  it('fires when company constituted same year as first contract', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado:  'NUEVA SA',
      fecha_constitucion:  new Date('2021-06-01'),
    })
    const contratos = [
      makeContrato({ anio: 2022, monto: 10_000_000, proveedor_normalizado: 'NUEVA SA' }),
    ]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('empresa_nueva')
  })

  it('fires when constituted 1 year before first contract', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado: 'NUEVA SRL',
      fecha_constitucion: new Date('2020-01-01'),
    })
    const contratos = [
      makeContrato({ anio: 2021, monto: 8_000_000, proveedor_normalizado: 'NUEVA SRL' }),
    ]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(1)
  })

  it('does NOT fire when company is 3 years old before first contract', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado: 'VETERANA SA',
      fecha_constitucion: new Date('2015-01-01'),
    })
    const contratos = [
      makeContrato({ anio: 2022, monto: 20_000_000, proveedor_normalizado: 'VETERANA SA' }),
    ]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when monto <$5M', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado: 'NUEVA SA',
      fecha_constitucion: new Date('2021-01-01'),
    })
    const contratos = [
      makeContrato({ anio: 2022, monto: 2_000_000, proveedor_normalizado: 'NUEVA SA' }),
    ]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire with no empresas data', async () => {
    const contratos = [
      makeContrato({ anio: 2022, monto: 20_000_000, proveedor_normalizado: 'NUEVA SA' }),
    ]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [] }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when empresa has no fecha_constitucion', async () => {
    const empresa = makeEmpresa({ nombre_normalizado: 'NUEVA SA', fecha_constitucion: undefined })
    const contratos = [
      makeContrato({ anio: 2022, monto: 20_000_000, proveedor_normalizado: 'NUEVA SA' }),
    ]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(0)
  })

  it('severity is moderada', async () => {
    const empresa = makeEmpresa({ nombre_normalizado: 'NUEVA SA', fecha_constitucion: new Date('2022-01-01') })
    const contratos = [makeContrato({ anio: 2022, monto: 10_000_000, proveedor_normalizado: 'NUEVA SA' })]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result[0].severidad).toBe('moderada')
  })

  it('includes entity in hallazgo', async () => {
    const empresa = makeEmpresa({ nombre_normalizado: 'NUEVA SA', fecha_constitucion: new Date('2021-01-01') })
    const contratos = [makeContrato({ anio: 2022, monto: 10_000_000, proveedor_normalizado: 'NUEVA SA' })]
    const result = await empresaNueva.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result[0].entidades_afectadas.some(e => e.nombre === 'NUEVA SA')).toBe(true)
  })
})

// ─── empresa_sin_empleados ────────────────────────────────────────────────────

describe('empresa_sin_empleados', () => {
  it('fires for company with 0 employees and >$10M in contracts', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado:  'FANTASMA SRL',
      empleados_estimados: 0,
    })
    const contratos = [
      makeContrato({ monto: 15_000_000, proveedor_normalizado: 'FANTASMA SRL' }),
    ]
    const result = await empresaSinEmpleados.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('empresa_sin_empleados')
  })

  it('does NOT fire for company with >0 employees', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado:  'CON EMPLEADOS SA',
      empleados_estimados: 50,
    })
    const contratos = [
      makeContrato({ monto: 20_000_000, proveedor_normalizado: 'CON EMPLEADOS SA' }),
    ]
    const result = await empresaSinEmpleados.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when empleados_estimados is undefined', async () => {
    const empresa = makeEmpresa({
      nombre_normalizado:  'SIN DATOS SA',
      empleados_estimados: undefined,
    })
    const contratos = [
      makeContrato({ monto: 20_000_000, proveedor_normalizado: 'SIN DATOS SA' }),
    ]
    const result = await empresaSinEmpleados.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when monto <$10M', async () => {
    const empresa = makeEmpresa({ nombre_normalizado: 'FANTASMA SRL', empleados_estimados: 0 })
    const contratos = [
      makeContrato({ monto: 5_000_000, proveedor_normalizado: 'FANTASMA SRL' }),
    ]
    const result = await empresaSinEmpleados.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire with no empresas', async () => {
    const contratos = [makeContrato({ monto: 20_000_000, proveedor_normalizado: 'X SA' })]
    const result = await empresaSinEmpleados.detect(makeMockCtx({ contratos, empresas: [] }))
    expect(result).toHaveLength(0)
  })

  it('severity is grave', async () => {
    const empresa = makeEmpresa({ nombre_normalizado: 'FANTASMA SA', empleados_estimados: 0 })
    const contratos = [makeContrato({ monto: 15_000_000, proveedor_normalizado: 'FANTASMA SA' })]
    const result = await empresaSinEmpleados.detect(makeMockCtx({ contratos, empresas: [empresa] }))
    expect(result[0].severidad).toBe('grave')
  })
})
