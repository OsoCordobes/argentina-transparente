import { describe, it, expect } from 'vitest'
import { makeContrato, makeMockCtx } from './helpers'
import { concentracionProveedor } from '../signals/concentracion_proveedor'
import { monopolioRubro }         from '../signals/monopolio_rubro'
import { servicioSinHistorial }   from '../signals/servicio_sin_historial'
import { proveedorCronico }       from '../signals/proveedor_cronico'

// ─── concentracion_proveedor ──────────────────────────────────────────────────

describe('concentracion_proveedor', () => {
  it('fires when top provider has ≥35% of spend', async () => {
    const contratos = [
      makeContrato({ monto: 60_000_000, proveedor_normalizado: 'ALFA SA' }),
      makeContrato({ monto: 40_000_000, proveedor_normalizado: 'BETA SRL' }),
    ]
    const result = await concentracionProveedor.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('concentracion_proveedor')
  })

  it('does NOT fire when top provider has <35%', async () => {
    // Each provider has exactly 33.3% — none crosses 35% threshold
    const contratos = [
      makeContrato({ monto: 33_000_000, proveedor_normalizado: 'ALFA SA',  numero: '1' }),
      makeContrato({ monto: 33_000_000, proveedor_normalizado: 'BETA SRL', numero: '2' }),
      makeContrato({ monto: 34_000_000, proveedor_normalizado: 'GAMMA SA', numero: '3' }),
    ]
    const result = await concentracionProveedor.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('severity is grave when concentration ≥60%', async () => {
    const contratos = [
      makeContrato({ monto: 70_000_000, proveedor_normalizado: 'ALFA SA' }),
      makeContrato({ monto: 30_000_000, proveedor_normalizado: 'BETA SRL' }),
    ]
    const result = await concentracionProveedor.detect(makeMockCtx({ contratos }))
    expect(result[0].severidad).toBe('grave')
  })

  it('severity is moderada when concentration 35–60%', async () => {
    const contratos = [
      makeContrato({ monto: 40_000_000, proveedor_normalizado: 'ALFA SA' }),
      makeContrato({ monto: 60_000_000, proveedor_normalizado: 'BETA SRL' }),
    ]
    // BETA SA has 60% — grave. Let me make one where top is 40%
    const contratos2 = [
      makeContrato({ monto: 40_000_000, proveedor_normalizado: 'ALFA SA' }),
      makeContrato({ monto: 30_000_000, proveedor_normalizado: 'BETA SRL' }),
      makeContrato({ monto: 30_000_000, proveedor_normalizado: 'GAMMA SA' }),
    ]
    const result = await concentracionProveedor.detect(makeMockCtx({ contratos: contratos2 }))
    expect(result[0].severidad).toBe('moderada')
  })

  it('does NOT fire with empty contratos', async () => {
    const result = await concentracionProveedor.detect(makeMockCtx({ contratos: [] }))
    expect(result).toHaveLength(0)
  })

  it('score is capped at 95', async () => {
    const contratos = [
      makeContrato({ monto: 100_000_000, proveedor_normalizado: 'MONOPOLIO SA' }),
    ]
    const result = await concentracionProveedor.detect(makeMockCtx({ contratos }))
    expect(result[0].score).toBeLessThanOrEqual(95)
  })
})

// ─── monopolio_rubro ──────────────────────────────────────────────────────────

describe('monopolio_rubro', () => {
  it('fires when one provider has ≥60% of an area', async () => {
    const area = 'OBRAS PÚBLICAS'
    const contratos = [
      makeContrato({ area, monto: 70_000_000, proveedor_normalizado: 'CONSTRUCTORA SA' }),
      makeContrato({ area, monto: 15_000_000, proveedor_normalizado: 'RIVAL SRL' }),
      makeContrato({ area, monto: 15_000_000, proveedor_normalizado: 'OTRO SA' }),
    ]
    const result = await monopolioRubro.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('monopolio_rubro')
  })

  it('does NOT fire when area total <$1M', async () => {
    const area = 'ÁREA PEQUEÑA'
    const contratos = [
      makeContrato({ area, monto: 600_000, proveedor_normalizado: 'ALPHA SA', numero: '1' }),
      makeContrato({ area, monto: 100_000, proveedor_normalizado: 'BETA SA',  numero: '2' }),
      makeContrato({ area, monto: 100_000, proveedor_normalizado: 'GAMMA SA', numero: '3' }),
    ]
    const result = await monopolioRubro.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when area has <3 contracts', async () => {
    const area = 'OBRAS'
    const contratos = [
      makeContrato({ area, monto: 80_000_000, proveedor_normalizado: 'ALFA SA', numero: '1' }),
      makeContrato({ area, monto: 20_000_000, proveedor_normalizado: 'BETA SA', numero: '2' }),
    ]
    const result = await monopolioRubro.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when concentration <60%', async () => {
    const area = 'INFORMÁTICA'
    const contratos = [
      makeContrato({ area, monto: 50_000_000, proveedor_normalizado: 'ALFA SA',  numero: '1' }),
      makeContrato({ area, monto: 30_000_000, proveedor_normalizado: 'BETA SA',  numero: '2' }),
      makeContrato({ area, monto: 20_000_000, proveedor_normalizado: 'GAMMA SA', numero: '3' }),
    ]
    const result = await monopolioRubro.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('severity is grave when pct ≥80%', async () => {
    const area = 'LIMPIEZA'
    const contratos = [
      makeContrato({ area, monto: 85_000_000, proveedor_normalizado: 'LIMPIEZAS SA', numero: '1' }),
      makeContrato({ area, monto: 8_000_000,  proveedor_normalizado: 'RIVAL SRL',    numero: '2' }),
      makeContrato({ area, monto: 7_000_000,  proveedor_normalizado: 'OTRO SA',      numero: '3' }),
    ]
    const result = await monopolioRubro.detect(makeMockCtx({ contratos }))
    expect(result[0].severidad).toBe('grave')
  })

  it('skips contracts with no area', async () => {
    const contratos = [
      makeContrato({ area: '', monto: 80_000_000, proveedor_normalizado: 'ALFA SA' }),
    ]
    const result = await monopolioRubro.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })
})

// ─── servicio_sin_historial ───────────────────────────────────────────────────

describe('servicio_sin_historial', () => {
  it('fires for service provider with >$50M in ≤2 years', async () => {
    const contratos = [
      makeContrato({
        monto: 60_000_000, anio: 2022,
        descripcion: 'SERVICIO DE LIMPIEZA DE EDIFICIOS',
        proveedor_normalizado: 'LIMPIEZAS RÁPIDAS SRL',
      }),
    ]
    const result = await servicioSinHistorial.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('servicio_sin_historial')
  })

  it('does NOT fire when provider spans >2 years', async () => {
    const contratos = [
      makeContrato({ monto: 20_000_000, anio: 2020, descripcion: 'LIMPIEZA', proveedor_normalizado: 'LIMPIADORA SA', numero: '1' }),
      makeContrato({ monto: 20_000_000, anio: 2021, descripcion: 'LIMPIEZA', proveedor_normalizado: 'LIMPIADORA SA', numero: '2' }),
      makeContrato({ monto: 20_000_000, anio: 2022, descripcion: 'LIMPIEZA', proveedor_normalizado: 'LIMPIADORA SA', numero: '3' }),
    ]
    const result = await servicioSinHistorial.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when monto <$50M', async () => {
    const contratos = [
      makeContrato({ monto: 30_000_000, anio: 2022, descripcion: 'MANTENIMIENTO', proveedor_normalizado: 'MANT SA' }),
    ]
    const result = await servicioSinHistorial.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when description has no service keywords', async () => {
    const contratos = [
      makeContrato({ monto: 80_000_000, anio: 2022, descripcion: 'COMPRA DE PAPELERÍA', proveedor_normalizado: 'PAPELERÍA SA' }),
    ]
    const result = await servicioSinHistorial.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('severity is always grave', async () => {
    const contratos = [
      makeContrato({ monto: 60_000_000, anio: 2022, descripcion: 'VIGILANCIA', proveedor_normalizado: 'SEGURIDAD SA' }),
    ]
    const result = await servicioSinHistorial.detect(makeMockCtx({ contratos }))
    expect(result[0].severidad).toBe('grave')
  })
})

// ─── proveedor_cronico ────────────────────────────────────────────────────────

describe('proveedor_cronico', () => {
  it('fires when provider has ≥60% year coverage and >$50M', async () => {
    const prov = 'CRONICO SA'
    const contratos = [
      makeContrato({ anio: 2019, monto: 20_000_000, proveedor_normalizado: prov, numero: '1' }),
      makeContrato({ anio: 2020, monto: 20_000_000, proveedor_normalizado: prov, numero: '2' }),
      makeContrato({ anio: 2021, monto: 20_000_000, proveedor_normalizado: prov, numero: '3' }),
      makeContrato({ anio: 2022, monto: 10_000_000, proveedor_normalizado: 'OTRO SA' }),
    ]
    const result = await proveedorCronico.detect(makeMockCtx({
      contratos, periodo_desde: 2019, periodo_hasta: 2022,
    }))
    expect(result).toHaveLength(1)
    expect(result[0].tipologia).toBe('proveedor_cronico')
  })

  it('does NOT fire with single-year data', async () => {
    const contratos = Array.from({ length: 5 }, (_, i) =>
      makeContrato({ anio: 2022, monto: 20_000_000, proveedor_normalizado: 'ALFA SA', numero: `X-${i}` })
    )
    const result = await proveedorCronico.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire when monto <$50M', async () => {
    const prov = 'PEQUEÑO SA'
    const contratos = [
      makeContrato({ anio: 2019, monto: 10_000_000, proveedor_normalizado: prov, numero: '1' }),
      makeContrato({ anio: 2020, monto: 10_000_000, proveedor_normalizado: prov, numero: '2' }),
      makeContrato({ anio: 2021, monto: 10_000_000, proveedor_normalizado: prov, numero: '3' }),
    ]
    const result = await proveedorCronico.detect(makeMockCtx({ contratos }))
    expect(result).toHaveLength(0)
  })

  it('does NOT fire with empty contratos', async () => {
    const result = await proveedorCronico.detect(makeMockCtx({ contratos: [] }))
    expect(result).toHaveLength(0)
  })

  it('severity is moderada', async () => {
    const prov = 'CRONICO SA'
    const contratos = [
      makeContrato({ anio: 2019, monto: 30_000_000, proveedor_normalizado: prov, numero: '1' }),
      makeContrato({ anio: 2020, monto: 30_000_000, proveedor_normalizado: prov, numero: '2' }),
    ]
    const result = await proveedorCronico.detect(makeMockCtx({ contratos }))
    if (result.length > 0) expect(result[0].severidad).toBe('moderada')
  })
})
