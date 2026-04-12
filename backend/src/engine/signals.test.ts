import { describe, it, expect } from 'vitest'
import {
  calcularSeñales,
  detectarProrrogas,
  detectarConcentracion,
  detectarContratacionesDirectas,
  detectarMonopolioRubro,
  detectarServiciosSinHistorial,
  detectarFraccionamientoAvanzado,
  detectarConcentracionTemporal,
  detectarProveedorCronico,
  detectarEmpresaNueva,
  detectarEmpresaSinEmpleados,
  detectarDirectoresCompartidos,
} from './signals'
import type { Contrato, EmpresaEnriquecida } from '../types'

// ─── Fixture helpers ────────────────────────────────────────────────────────

const URL = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2/version-dato/6467/recurso'

function c(overrides: Partial<Contrato> & { proveedor: string; monto: number }): Contrato {
  return {
    tipo: 'LICITACION PUBLICA',
    area: 'SECRETARIA DE OBRAS',
    descripcion: 'Servicio general',
    anio: 2023,
    fuenteUrl: URL,
    ...overrides,
  }
}

// ─── calcularSeñales — orchestration ────────────────────────────────────────

describe('calcularSeñales', () => {
  it('returns empty array for empty input', async () => {
    expect(await calcularSeñales([])).toEqual([])
  })

  it('does not throw on empty array', async () => {
    await expect(calcularSeñales([])).resolves.not.toThrow()
  })

  it('does not throw on single contract', async () => {
    await expect(calcularSeñales([c({ proveedor: 'EMPRESA SA', monto: 1_000_000 })])).resolves.toBeDefined()
  })

  it('returns array sorted by score descending', async () => {
    const contratos: Contrato[] = [
      ...Array.from({ length: 10 }, (_, i) =>
        c({ tipo: 'CONTRATACION DIRECTA', proveedor: `PROV_${i}`, monto: 5_000_000 })
      ),
      c({ proveedor: 'MONOPOLIO SA', monto: 60_000_000 }),
    ]
    const señales = await calcularSeñales(contratos)
    for (let i = 0; i < señales.length - 1; i++) {
      expect(señales[i].score).toBeGreaterThanOrEqual(señales[i + 1].score)
    }
  })

  it('each returned signal has required fields', async () => {
    const contratos = [
      c({ proveedor: 'GIGANTE SRL', monto: 80_000_000 }),
      c({ proveedor: 'PEQUENA SA', monto: 10_000_000 }),
    ]
    const señales = await calcularSeñales(contratos)
    for (const s of señales) {
      expect(typeof s.tipologia).toBe('string')
      expect(typeof s.score).toBe('number')
      expect(typeof s.titulo).toBe('string')
      expect(typeof s.resumen).toBe('string')
      expect(Array.isArray(s.evidencia)).toBe(true)
      expect(s.evidencia.length).toBeGreaterThan(0)
      expect(['grave', 'moderada', 'leve']).toContain(s.legal.severidad)
      expect(Array.isArray(s.legal.articulos)).toBe(true)
      expect(Array.isArray(s.legal.denunciarAnte)).toBe(true)
    }
  })
})

// ─── detectarProrrogas ───────────────────────────────────────────────────────

describe('detectarProrrogas', () => {
  it('returns null for empty array', () => {
    expect(detectarProrrogas([])).toBeNull()
  })

  it('returns null when no prórrogas exist', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 50_000_000 }),
      c({ proveedor: 'EMPRESA B', monto: 50_000_000 }),
    ]
    expect(detectarProrrogas(contratos)).toBeNull()
  })

  it('returns null when prórrogas < 20% of spend', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 90_000_000 }),
      c({ tipo: 'PRÓRROGA', proveedor: 'EMPRESA B', monto: 10_000_000 }), // 10%
    ]
    expect(detectarProrrogas(contratos)).toBeNull()
  })

  it('fires when prórrogas ≥ 20% of spend', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 75_000_000 }),
      c({ tipo: 'PRÓRROGA', proveedor: 'EMPRESA B', monto: 25_000_000 }), // 25%
    ]
    const señal = detectarProrrogas(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('prorrogas_excesivas')
    expect(señal!.score).toBeGreaterThan(0)
  })

  it('fires for COMPLEMENTARIOS type', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 70_000_000 }),
      c({ tipo: 'COMPLEMENTARIOS', proveedor: 'EMPRESA B', monto: 30_000_000 }), // 30%
    ]
    expect(detectarProrrogas(contratos)).not.toBeNull()
  })

  it('marks as grave when ≥ 40%', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 55_000_000 }),
      c({ tipo: 'PRÓRROGA', proveedor: 'EMPRESA B', monto: 45_000_000 }), // 45%
    ]
    const señal = detectarProrrogas(contratos)!
    expect(señal.legal.severidad).toBe('grave')
  })

  it('marks as moderada when between 20% and 40%', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 75_000_000 }),
      c({ tipo: 'PRORROGA', proveedor: 'EMPRESA B', monto: 25_000_000 }), // 25%
    ]
    const señal = detectarProrrogas(contratos)!
    expect(señal.legal.severidad).toBe('moderada')
  })
})

// ─── detectarConcentracion ───────────────────────────────────────────────────

describe('detectarConcentracion', () => {
  it('returns null for empty array', () => {
    expect(detectarConcentracion([])).toBeNull()
  })

  it('returns null when top provider < 35% of spend', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 30_000_000 }),
      c({ proveedor: 'EMPRESA B', monto: 30_000_000 }),  // 30% — below threshold
      c({ proveedor: 'EMPRESA C', monto: 40_000_000 }),  // 40% — wait, this is ≥35%
    ]
    // Build a truly clean case: 4 providers each with 25%
    const balanced = [
      c({ proveedor: 'P1', monto: 25_000_000 }),
      c({ proveedor: 'P2', monto: 25_000_000 }),
      c({ proveedor: 'P3', monto: 25_000_000 }),
      c({ proveedor: 'P4', monto: 25_000_000 }),
    ]
    expect(detectarConcentracion(balanced)).toBeNull()
  })

  it('fires when top provider ≥ 35% of spend', () => {
    const contratos = [
      c({ proveedor: 'GIGANTE SA', monto: 40_000_000 }),
      c({ proveedor: 'EMPRESA B', monto: 30_000_000 }),
      c({ proveedor: 'EMPRESA C', monto: 30_000_000 }),
    ]
    const señal = detectarConcentracion(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('concentracion_proveedor')
    expect(señal!.titulo).toContain('GIGANTE SA')
  })

  it('marks as grave when top provider ≥ 60%', () => {
    const contratos = [
      c({ proveedor: 'MONOPOLIO SRL', monto: 70_000_000 }),
      c({ proveedor: 'OTRO', monto: 30_000_000 }),
    ]
    expect(detectarConcentracion(contratos)!.legal.severidad).toBe('grave')
  })

  it('marks as moderada when 35%-60%', () => {
    const contratos = [
      c({ proveedor: 'EMPRESA A', monto: 40_000_000 }),
      c({ proveedor: 'EMPRESA B', monto: 35_000_000 }),
      c({ proveedor: 'EMPRESA C', monto: 25_000_000 }),
    ]
    expect(detectarConcentracion(contratos)!.legal.severidad).toBe('moderada')
  })

  it('normalizes provider names (case-insensitive)', () => {
    const contratos = [
      c({ proveedor: 'empresa sa', monto: 40_000_000 }),
      c({ proveedor: 'EMPRESA SA', monto: 20_000_000 }),  // same provider, different case
      c({ proveedor: 'OTRO', monto: 20_000_000 }),
    ]
    const señal = detectarConcentracion(contratos)
    // EMPRESA SA has 60M of 80M = 75% → should fire as grave
    expect(señal).not.toBeNull()
    expect(señal!.legal.severidad).toBe('grave')
  })
})

// ─── detectarContratacionesDirectas ─────────────────────────────────────────

describe('detectarContratacionesDirectas', () => {
  it('returns null for empty array', () => {
    expect(detectarContratacionesDirectas([])).toBeNull()
  })

  it('returns null when fewer than 5 direct contracts', () => {
    const contratos = Array.from({ length: 4 }, (_, i) =>
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: `P${i}`, monto: 10_000_000 })
    )
    expect(detectarContratacionesDirectas(contratos)).toBeNull()
  })

  it('returns null when 5+ direct contracts but < 8% spend and < 15 contracts', () => {
    // 5 direct contracts but only 5% of total spend
    const contratos = [
      ...Array.from({ length: 5 }, (_, i) =>
        c({ tipo: 'CONTRATACION DIRECTA', proveedor: `D${i}`, monto: 1_000_000 })
      ),
      c({ proveedor: 'BIG SA', monto: 95_000_000 }),
    ]
    expect(detectarContratacionesDirectas(contratos)).toBeNull()
  })

  it('fires when ≥ 5 direct contracts and ≥ 8% spend', () => {
    const contratos = [
      ...Array.from({ length: 8 }, (_, i) =>
        c({ tipo: 'CONTRATACION DIRECTA', proveedor: `D${i}`, monto: 5_000_000 })
      ),
      c({ proveedor: 'BIG SA', monto: 60_000_000 }),
    ]
    const señal = detectarContratacionesDirectas(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('contrataciones_directas')
  })

  it('marks as grave when > 20 direct contracts', () => {
    const contratos = Array.from({ length: 25 }, (_, i) =>
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: `D${i}`, monto: 4_000_000 })
    )
    expect(detectarContratacionesDirectas(contratos)!.legal.severidad).toBe('grave')
  })
})

// ─── detectarMonopolioRubro ──────────────────────────────────────────────────

describe('detectarMonopolioRubro', () => {
  it('returns null for empty array', () => {
    expect(detectarMonopolioRubro([])).toBeNull()
  })

  it('returns null when no area has ≥ 60% concentration', () => {
    const contratos = [
      c({ area: 'SALUD', proveedor: 'A', monto: 5_000_000 }),
      c({ area: 'SALUD', proveedor: 'B', monto: 5_000_000 }),
      c({ area: 'SALUD', proveedor: 'C', monto: 5_000_000 }),
    ]
    expect(detectarMonopolioRubro(contratos)).toBeNull()
  })

  it('returns null when area has < 3 contracts', () => {
    const contratos = [
      c({ area: 'SALUD', proveedor: 'MONO SA', monto: 5_000_000 }),
      c({ area: 'SALUD', proveedor: 'MONO SA', monto: 5_000_000 }),
    ]
    expect(detectarMonopolioRubro(contratos)).toBeNull()
  })

  it('returns null when area total < 1M', () => {
    const contratos = [
      c({ area: 'SALUD', proveedor: 'MONO SA', monto: 200_000 }),
      c({ area: 'SALUD', proveedor: 'MONO SA', monto: 200_000 }),
      c({ area: 'SALUD', proveedor: 'OTRO', monto: 100_000 }),
    ]
    expect(detectarMonopolioRubro(contratos)).toBeNull()
  })

  it('fires when single provider ≥ 60% of area spend', () => {
    const contratos = [
      c({ area: 'OBRAS PUBLICAS', proveedor: 'MONO SA', monto: 7_000_000 }),
      c({ area: 'OBRAS PUBLICAS', proveedor: 'MONO SA', monto: 7_000_000 }),
      c({ area: 'OBRAS PUBLICAS', proveedor: 'MONO SA', monto: 7_000_000 }),
      c({ area: 'OBRAS PUBLICAS', proveedor: 'OTRO SRL', monto: 3_000_000 }),
    ]
    const señal = detectarMonopolioRubro(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('monopolio_rubro')
    expect(señal!.titulo).toContain('MONO SA')
  })

  it('marks as grave when ≥ 80% concentration', () => {
    const contratos = [
      c({ area: 'EDUCACION', proveedor: 'DOM SA', monto: 9_000_000 }),
      c({ area: 'EDUCACION', proveedor: 'DOM SA', monto: 9_000_000 }),
      c({ area: 'EDUCACION', proveedor: 'DOM SA', monto: 9_000_000 }),
      c({ area: 'EDUCACION', proveedor: 'OTRO', monto: 3_000_000 }),
    ]
    // DOM SA: 27M / 30M = 90% → grave
    expect(detectarMonopolioRubro(contratos)!.legal.severidad).toBe('grave')
  })
})

// ─── detectarServiciosSinHistorial ───────────────────────────────────────────

describe('detectarServiciosSinHistorial', () => {
  it('returns null for empty array', () => {
    expect(detectarServiciosSinHistorial([])).toBeNull()
  })

  it('returns null when service provider monto < 50M', () => {
    const contratos = [
      c({ proveedor: 'LIMPIEZA SA', descripcion: 'Servicio LIMPIEZA', monto: 40_000_000 }),
    ]
    expect(detectarServiciosSinHistorial(contratos)).toBeNull()
  })

  it('returns null when service provider appears in > 2 years', () => {
    const contratos = [
      c({ proveedor: 'LIMPIEZA SA', descripcion: 'LIMPIEZA general', monto: 20_000_000, anio: 2021 }),
      c({ proveedor: 'LIMPIEZA SA', descripcion: 'LIMPIEZA general', monto: 20_000_000, anio: 2022 }),
      c({ proveedor: 'LIMPIEZA SA', descripcion: 'LIMPIEZA general', monto: 20_000_000, anio: 2023 }),
    ]
    expect(detectarServiciosSinHistorial(contratos)).toBeNull()
  })

  it('fires for large service provider with ≤ 2 years of history', () => {
    const contratos = [
      c({ proveedor: 'CONSTRUCTORA NUEVA SA', descripcion: 'CONSTRUCCION edificio', monto: 60_000_000 }),
      c({ proveedor: 'OTRO', monto: 10_000_000 }),
    ]
    const señal = detectarServiciosSinHistorial(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('servicio_sin_historial')
  })

  it('fires for SEGURIDAD keyword', () => {
    const contratos = [
      c({ proveedor: 'SEGUR SA', descripcion: 'Prestación SEGURIDAD privada', monto: 55_000_000 }),
    ]
    expect(detectarServiciosSinHistorial(contratos)).not.toBeNull()
  })

  it('always marks as grave', () => {
    const contratos = [
      c({ proveedor: 'OBRA SRL', descripcion: 'OBRA vial urbana', monto: 80_000_000 }),
    ]
    expect(detectarServiciosSinHistorial(contratos)!.legal.severidad).toBe('grave')
  })
})

// ─── detectarFraccionamientoAvanzado ────────────────────────────────────────

describe('detectarFraccionamientoAvanzado', () => {
  it('returns null for empty array', () => {
    expect(detectarFraccionamientoAvanzado([])).toBeNull()
  })

  it('returns null when provider has < 3 direct/concurso contracts', () => {
    const contratos = [
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'EMPRESA SA', monto: 8_000_000 }),
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'EMPRESA SA', monto: 8_000_000 }),
    ]
    expect(detectarFraccionamientoAvanzado(contratos)).toBeNull()
  })

  it('returns null when total ≤ 20M', () => {
    const contratos = Array.from({ length: 4 }, () =>
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'EMPRESA SA', monto: 4_000_000 })
    ) // total = 16M < 20M
    expect(detectarFraccionamientoAvanzado(contratos)).toBeNull()
  })

  it('returns null when a single contract > 40% of total (not split pattern)', () => {
    const contratos = [
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'EMPRESA SA', monto: 15_000_000 }), // 50% of 30M
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'EMPRESA SA', monto: 8_000_000 }),
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'EMPRESA SA', monto: 7_000_000 }),
    ]
    expect(detectarFraccionamientoAvanzado(contratos)).toBeNull()
  })

  it('fires when ≥ 3 direct contracts, total > 20M, max < 40% of total', () => {
    const contratos = Array.from({ length: 4 }, () =>
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'FRACCIONADOR SRL', monto: 7_000_000 })
    ) // total = 28M, max = 7M = 25% < 40%
    const señal = detectarFraccionamientoAvanzado(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('fraccionamiento_avanzado')
  })

  it('marks as moderada', () => {
    const contratos = Array.from({ length: 4 }, () =>
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'FRAC SA', monto: 8_000_000 })
    )
    expect(detectarFraccionamientoAvanzado(contratos)!.legal.severidad).toBe('moderada')
  })
})

// ─── detectarConcentracionTemporal ───────────────────────────────────────────

describe('detectarConcentracionTemporal', () => {
  it('returns null for empty array', () => {
    expect(detectarConcentracionTemporal([])).toBeNull()
  })

  it('returns null when data spans multiple years', () => {
    const contratos = [
      c({ anio: 2022, proveedor: 'A', monto: 40_000_000 }),
      c({ tipo: 'PRÓRROGA', anio: 2023, proveedor: 'B', monto: 40_000_000 }),
    ]
    expect(detectarConcentracionTemporal(contratos)).toBeNull()
  })

  it('returns null for single year with < 30% prórrogas and < 3 ampliaciones', () => {
    const contratos = [
      c({ anio: 2023, proveedor: 'A', monto: 80_000_000 }),
      c({ tipo: 'PRÓRROGA', anio: 2023, proveedor: 'B', monto: 10_000_000 }), // 11%
    ]
    expect(detectarConcentracionTemporal(contratos)).toBeNull()
  })

  it('fires for single year with ≥ 30% prórrogas', () => {
    const contratos = [
      c({ anio: 2023, proveedor: 'A', monto: 65_000_000 }),
      c({ tipo: 'PRÓRROGA', anio: 2023, proveedor: 'B', monto: 35_000_000 }), // 35%
    ]
    const señal = detectarConcentracionTemporal(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('gasto_fin_ejercicio')
  })

  it('marks as grave when ≥ 40%', () => {
    const contratos = [
      c({ anio: 2023, proveedor: 'A', monto: 55_000_000 }),
      c({ tipo: 'PRORROGA', anio: 2023, proveedor: 'B', monto: 45_000_000 }), // 45%
    ]
    expect(detectarConcentracionTemporal(contratos)!.legal.severidad).toBe('grave')
  })

  it('fires for AMPLIACIÓN type even below 30% when ≥ 3 instances', () => {
    const contratos = [
      c({ anio: 2023, proveedor: 'A', monto: 80_000_000 }),
      c({ tipo: 'AMPLIACIÓN DE LA CONTRATACIÓN', anio: 2023, proveedor: 'B', monto: 5_000_000 }),
      c({ tipo: 'AMPLIACIÓN DE LA CONTRATACIÓN', anio: 2023, proveedor: 'C', monto: 5_000_000 }),
      c({ tipo: 'AMPLIACIÓN DE LA CONTRATACIÓN', anio: 2023, proveedor: 'D', monto: 5_000_000 }),
    ]
    // 15% prórrogas but 3 ampliaciones → should fire
    expect(detectarConcentracionTemporal(contratos)).not.toBeNull()
  })
})

// ─── detectarProveedorCronico ────────────────────────────────────────────────

describe('detectarProveedorCronico', () => {
  it('returns null for empty array', () => {
    expect(detectarProveedorCronico([])).toBeNull()
  })

  it('returns null for single year data', () => {
    const contratos = [
      c({ anio: 2023, proveedor: 'VETERANO SA', monto: 80_000_000 }),
    ]
    expect(detectarProveedorCronico(contratos)).toBeNull()
  })

  it('returns null when provider monto < 50M', () => {
    const contratos = [
      c({ anio: 2022, proveedor: 'PEQUEÑA SA', monto: 20_000_000 }),
      c({ anio: 2023, proveedor: 'PEQUEÑA SA', monto: 20_000_000 }),
    ]
    expect(detectarProveedorCronico(contratos)).toBeNull()
  })

  it('returns null when provider appears in < 60% of years', () => {
    // 3 years, provider only in 1 year = 33% < 60%
    const contratos = [
      c({ anio: 2021, proveedor: 'OTRO A', monto: 30_000_000 }),
      c({ anio: 2022, proveedor: 'OTRO B', monto: 30_000_000 }),
      c({ anio: 2023, proveedor: 'CRONICO SA', monto: 60_000_000 }),
    ]
    expect(detectarProveedorCronico(contratos)).toBeNull()
  })

  it('fires for provider present in ≥ 60% of years with ≥ 50M total', () => {
    const contratos = [
      c({ anio: 2021, proveedor: 'VETERANO SA', monto: 30_000_000 }),
      c({ anio: 2022, proveedor: 'VETERANO SA', monto: 30_000_000 }),
      c({ anio: 2023, proveedor: 'VETERANO SA', monto: 30_000_000 }),
      c({ anio: 2021, proveedor: 'OTRO', monto: 10_000_000 }),
    ]
    const señal = detectarProveedorCronico(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('proveedor_cronico')
    // título counts providers; resumen names the most significant one (signals.ts:335)
    expect(señal!.resumen).toContain('VETERANO SA')
  })

  it('marks as moderada', () => {
    const contratos = [
      c({ anio: 2021, proveedor: 'VET SA', monto: 30_000_000 }),
      c({ anio: 2022, proveedor: 'VET SA', monto: 30_000_000 }),
    ]
    const señal = detectarProveedorCronico(contratos)
    if (señal) expect(señal.legal.severidad).toBe('moderada')
  })

  it('fires for provider in 2 of 3 years (67%) with sufficient monto', () => {
    const contratos = [
      c({ anio: 2021, proveedor: 'PARCIAL SA', monto: 30_000_000 }),
      c({ anio: 2022, proveedor: 'OTRO', monto: 10_000_000 }),
      c({ anio: 2023, proveedor: 'PARCIAL SA', monto: 30_000_000 }),
    ]
    const señal = detectarProveedorCronico(contratos)
    expect(señal).not.toBeNull()
  })
})

// ─── detectarEmpresaNueva ────────────────────────────────────────────────────

function empresa(overrides: Partial<EmpresaEnriquecida> = {}): EmpresaEnriquecida {
  return {
    cuit: '30123456789',
    razonSocial: null,
    esEmpleador: true,
    inicioActividades: null,
    estado: 'ACTIVO',
    actividadPrincipal: null,
    directores: [],
    encontrado: true,
    fuenteUrl: 'https://www.cuitonline.com/search.php?q=test',
    ...overrides,
  }
}

describe('detectarEmpresaNueva', () => {
  it('returns null when empresas map is empty', () => {
    expect(detectarEmpresaNueva([c({ proveedor: 'EMPRESA SA', monto: 10_000_000 })], new Map())).toBeNull()
  })

  it('returns null when no empresa has inicioActividades', () => {
    const emp = new Map([['EMPRESA SA', empresa({ inicioActividades: null })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 20_000_000 })]
    expect(detectarEmpresaNueva(contratos, emp)).toBeNull()
  })

  it('returns null when monto < 5M', () => {
    const emp = new Map([['NUEVA SRL', empresa({ inicioActividades: '01/01/2023', encontrado: true })]])
    const contratos = [c({ proveedor: 'NUEVA SRL', anio: 2023, monto: 2_000_000 })]
    expect(detectarEmpresaNueva(contratos, emp)).toBeNull()
  })

  it('returns null when empresa started > 1 year before first contract', () => {
    const emp = new Map([['VIEJA SA', empresa({ inicioActividades: '01/01/2020', encontrado: true })]])
    const contratos = [c({ proveedor: 'VIEJA SA', anio: 2023, monto: 20_000_000 })]
    expect(detectarEmpresaNueva(contratos, emp)).toBeNull()
  })

  it('fires when empresa started same year as first contract with significant monto', () => {
    const emp = new Map([['NUEVA SRL', empresa({ inicioActividades: '15/06/2023', encontrado: true })]])
    const contratos = [c({ proveedor: 'NUEVA SRL', anio: 2023, monto: 15_000_000 })]
    const señal = detectarEmpresaNueva(contratos, emp)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('empresa_nueva')
  })

  it('fires when empresa started 1 year before first contract', () => {
    const emp = new Map([['RECIENTE SA', empresa({ inicioActividades: '01/01/2022', encontrado: true })]])
    const contratos = [c({ proveedor: 'RECIENTE SA', anio: 2023, monto: 10_000_000 })]
    expect(detectarEmpresaNueva(contratos, emp)).not.toBeNull()
  })

  it('marks as moderada', () => {
    const emp = new Map([['NUEVA SRL', empresa({ inicioActividades: '01/03/2023', encontrado: true })]])
    const contratos = [c({ proveedor: 'NUEVA SRL', anio: 2023, monto: 20_000_000 })]
    expect(detectarEmpresaNueva(contratos, emp)!.legal.severidad).toBe('moderada')
  })
})

// ─── detectarEmpresaSinEmpleados ─────────────────────────────────────────────

describe('detectarEmpresaSinEmpleados', () => {
  it('returns null when empresas map is empty', () => {
    expect(detectarEmpresaSinEmpleados([c({ proveedor: 'EMPRESA SA', monto: 20_000_000 })], new Map())).toBeNull()
  })

  it('returns null when empresa IS an employer', () => {
    const emp = new Map([['EMPLEADORA SA', empresa({ esEmpleador: true, encontrado: true })]])
    const contratos = [c({ proveedor: 'EMPLEADORA SA', monto: 50_000_000 })]
    expect(detectarEmpresaSinEmpleados(contratos, emp)).toBeNull()
  })

  it('returns null when monto < 10M even without employees', () => {
    const emp = new Map([['PEQUEÑA SRL', empresa({ esEmpleador: false, encontrado: true })]])
    const contratos = [c({ proveedor: 'PEQUEÑA SRL', monto: 5_000_000 })]
    expect(detectarEmpresaSinEmpleados(contratos, emp)).toBeNull()
  })

  it('returns null when empresa not found in AFIP', () => {
    const emp = new Map([['DESCONOCIDA', empresa({ encontrado: false, esEmpleador: false })]])
    const contratos = [c({ proveedor: 'DESCONOCIDA', monto: 50_000_000 })]
    expect(detectarEmpresaSinEmpleados(contratos, emp)).toBeNull()
  })

  it('fires when empresa has no employees and received ≥ 10M', () => {
    const emp = new Map([['FANTASMA SRL', empresa({ esEmpleador: false, encontrado: true })]])
    const contratos = [c({ proveedor: 'FANTASMA SRL', monto: 25_000_000 })]
    const señal = detectarEmpresaSinEmpleados(contratos, emp)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('empresa_sin_empleados')
  })

  it('marks as grave', () => {
    const emp = new Map([['PANTALLA SA', empresa({ esEmpleador: false, encontrado: true })]])
    const contratos = [c({ proveedor: 'PANTALLA SA', monto: 30_000_000 })]
    expect(detectarEmpresaSinEmpleados(contratos, emp)!.legal.severidad).toBe('grave')
  })

  it('aggregates multiple contracts from same provider', () => {
    const emp = new Map([['MULTI SRL', empresa({ esEmpleador: false, encontrado: true })]])
    // 3 contracts × 4M = 12M total — above threshold
    const contratos = [
      c({ proveedor: 'MULTI SRL', monto: 4_000_000 }),
      c({ proveedor: 'MULTI SRL', monto: 4_000_000 }),
      c({ proveedor: 'MULTI SRL', monto: 4_000_000 }),
    ]
    expect(detectarEmpresaSinEmpleados(contratos, emp)).not.toBeNull()
  })
})

// ─── detectarDirectoresCompartidos ───────────────────────────────────────────

describe('detectarDirectoresCompartidos', () => {
  it('returns null for empty pares array', () => {
    expect(detectarDirectoresCompartidos([])).toBeNull()
  })

  it('fires when there are shared directors', () => {
    const pares = [{
      empresa1: 'CONSTRUCTORA NORTE SA',
      empresa2: 'CONSTRUCTORA SUR SRL',
      cuit1: '30111111111',
      cuit2: '30222222222',
      directores: ['GARCIA MARIO RUBEN'],
    }]
    const señal = detectarDirectoresCompartidos(pares)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('directores_compartidos')
  })

  it('marks as grave', () => {
    const pares = [{
      empresa1: 'A SA', empresa2: 'B SRL',
      cuit1: '30111', cuit2: '30222',
      directores: ['LOPEZ JUAN'],
    }]
    expect(detectarDirectoresCompartidos(pares)!.legal.severidad).toBe('grave')
  })

  it('includes director names in evidence', () => {
    const pares = [{
      empresa1: 'ALPHA SA', empresa2: 'BETA SRL',
      cuit1: '30111', cuit2: '30222',
      directores: ['PEREZ CARLOS', 'GOMEZ ANA'],
    }]
    const señal = detectarDirectoresCompartidos(pares)!
    expect(señal.evidencia[0].descripcion).toContain('PEREZ CARLOS')
  })
})
