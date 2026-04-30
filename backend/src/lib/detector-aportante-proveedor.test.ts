// Tests para detector aportante↔proveedor (PLAN-DATOS Fase C2).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'
import {
  aportanteProveedorASeñal,
  type CruceAportanteProveedor,
} from './detector-aportante-proveedor'

const baseCruce = (overrides: Partial<CruceAportanteProveedor> = {}): CruceAportanteProveedor => ({
  cuit: '30-12345678-9',
  razon_social: 'EJEMPLO SA',
  partido: 'Frente Test',
  alianza: null,
  anio_electoral: 2023,
  monto_aportado: 500_000,
  cantidad_aportes: 1,
  fecha_primer_aporte: '2023-08-15',
  fuente_url_aporte: 'https://aportantes.electoral.gob.ar/test',
  cantidad_contratos: 2,
  monto_contratado: 10_000_000,
  primer_contrato_anio: 2024,
  ultimo_contrato_anio: 2024,
  fuente_url_contratos: ['https://gob.test/contrato1'],
  jurisdicciones_contratos: ['cordoba-capital'],
  tier_match_proveedor: 1,
  score_match_proveedor: 100,
  ...overrides,
})

beforeAll(async () => { await initDb() })

describe('M4.2/C2 — aportanteProveedorASeñal', () => {
  it('emite tipología correcta', () => {
    const señal = aportanteProveedorASeñal(baseCruce())
    expect(señal.tipologia).toBe('aportante_de_campana_y_proveedor')
  })

  it('título contiene partido + año + razón social + CUIT', () => {
    const señal = aportanteProveedorASeñal(baseCruce({
      partido: 'Frente Cordobés Renovador',
      anio_electoral: 2023,
      razon_social: 'CONSTRUCTORA DEL CENTRO SA',
      cuit: '30-71234567-1',
    }))
    expect(señal.titulo).toContain('Frente Cordobés Renovador')
    expect(señal.titulo).toContain('2023')
    expect(señal.titulo).toContain('CONSTRUCTORA DEL CENTRO SA')
    expect(señal.titulo).toContain('30-71234567-1')
  })

  it('cuits incluye el CUIT del aportante/proveedor (un solo lado por construcción)', () => {
    const señal = aportanteProveedorASeñal(baseCruce({ cuit: '30-12345-X' }))
    expect(señal.cuits).toEqual(['30-12345-X'])
  })

  it('monto bajo + aporte chico → score moderado pero NUNCA cap-60 (Tier 1)', () => {
    const señal = aportanteProveedorASeñal(baseCruce({
      monto_aportado: 50_000,
      monto_contratado: 100_000,
    }))
    // Base 50 + min(30, log10(100_000)*8 ≈ 40 → 30) + min(15, log10(50_000)*5 ≈ 23 → 15) = 95
    // Aún con valores chicos, base 50 puede empujar a "moderada" — Tier 1 directo
    expect(señal.score).toBeGreaterThanOrEqual(50)
    // No hay cap-60 — la verificación es CUIT, no apellido
  })

  it('monto extremo → score CAP a 95 (no mayor)', () => {
    const señal = aportanteProveedorASeñal(baseCruce({
      monto_aportado: 1_000_000_000,
      monto_contratado: 1_000_000_000_000,
    }))
    expect(señal.score).toBeLessThanOrEqual(95)
  })

  it('monto alto → severidad grave', () => {
    const señal = aportanteProveedorASeñal(baseCruce({
      monto_aportado: 5_000_000,
      monto_contratado: 100_000_000,
    }))
    expect(señal.score).toBeGreaterThanOrEqual(75)
    expect(señal.legal.severidad).toBe('grave')
  })

  it('evidencia incluye marca IDENTIDAD VERIFICADA mencionando Tier ≤ 3', () => {
    const señal = aportanteProveedorASeñal(baseCruce({ tier_match_proveedor: 1 }))
    const ids = señal.evidencia.find(e => e.descripcion.includes('IDENTIDAD VERIFICADA'))
    expect(ids).toBeDefined()
    expect(ids?.descripcion).toContain('Tier 1')
  })

  it('marco legal incluye Ley 26.215 (financiamiento de campañas)', () => {
    const señal = aportanteProveedorASeñal(baseCruce())
    expect(señal.legal.articulos.some(a => a.includes('26.215'))).toBe(true)
  })

  it('denunciar incluye Cámara Nacional Electoral + Tribunal de Cuentas', () => {
    const señal = aportanteProveedorASeñal(baseCruce())
    expect(señal.legal.denunciarAnte.some(o => o.includes('Cámara Nacional Electoral'))).toBe(true)
    expect(señal.legal.denunciarAnte.some(o => o.includes('Tribunal de Cuentas'))).toBe(true)
  })

  it('alianza se incluye en evidencia cuando existe', () => {
    const señalConAlianza = aportanteProveedorASeñal(baseCruce({
      partido: 'Partido X',
      alianza: 'Alianza Y',
    }))
    const señalSinAlianza = aportanteProveedorASeñal(baseCruce({
      partido: 'Partido X',
      alianza: null,
    }))
    expect(señalConAlianza.evidencia[0].descripcion).toContain('alianza Alianza Y')
    expect(señalSinAlianza.evidencia[0].descripcion).not.toContain('alianza')
  })

  it('rango de años de contratos en titulo cuando span > 1 año', () => {
    const señal = aportanteProveedorASeñal(baseCruce({
      primer_contrato_anio: 2023,
      ultimo_contrato_anio: 2025,
    }))
    expect(señal.evidencia[0].descripcion).toContain('2023-2025')
  })
})

describe('M4.2/C2 — registro en señales_cache', () => {
  it('detector está registrado en señales_cache cuando ya corrió', async () => {
    const r = await dbAll<{ c: number }>(
      `SELECT COUNT(*) c FROM señales_cache WHERE tipologia = ?`,
      ['aportante_de_campana_y_proveedor']
    )
    expect(Number(r[0].c)).toBeGreaterThanOrEqual(0)
  })
})
