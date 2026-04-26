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
  detectarRotacionCoordinada,
  detectarAdendaPostAdjudicacion,
  detectarRedDeEmpresas,
  detectarAparicionOffshore,
  normalizarProveedor,
} from './signals'
import type { Contrato, EmpresaEnriquecida, OSMatch } from '../types'

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

  // B7 fix: detección robusta a typos comunes y variantes ortográficas
  it('B7 — captura typos en descripcion: LIMPEZA (sin I), SECURIDAD', () => {
    const contratos = [
      c({ proveedor: 'PROVEEDOR X', descripcion: 'Servicio LIMPEZA en escuelas', monto: 60_000_000 }),
      c({ proveedor: 'PROVEEDOR Y', descripcion: 'Personal de SECURIDAD', monto: 70_000_000 }),
    ]
    expect(detectarServiciosSinHistorial(contratos)).not.toBeNull()
  })

  it('B7 — captura raíces extras: CATERING, IMPRENTA, INFORMATICA', () => {
    const cases = [
      'Provisión CATERING evento aniversario',
      'IMPRENTA volantes campaña',
      'Servicios INFORMATICA y soporte sistemas',
    ]
    for (const desc of cases) {
      const contratos = [c({ proveedor: 'X SA', descripcion: desc, monto: 60_000_000 })]
      expect(
        detectarServiciosSinHistorial(contratos),
        `Falló para descripcion="${desc}"`,
      ).not.toBeNull()
    }
  })

  it('B7 — busca también en tipo y area, no solo descripcion', () => {
    const contratos = [
      c({
        proveedor: 'INDETERMINADO SA',
        descripcion: 'expediente N° 1234 — adjudicación',  // ← descripcion sin keywords
        tipo: 'CONTRATACION OBRA PUBLICA',                  // ← OBRA en tipo
        area: 'Secretaría Limpieza Urbana',                 // ← LIMP en area
        monto: 60_000_000,
      }),
    ]
    expect(detectarServiciosSinHistorial(contratos)).not.toBeNull()
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

  it('returns null when no year exceeds 30% nor has ≥3 ampliaciones (multi-year)', () => {
    const contratos = [
      // Año 2022: 0% prórrogas, 0 ampliaciones → no dispara
      c({ anio: 2022, proveedor: 'A', monto: 40_000_000 }),
      c({ anio: 2022, proveedor: 'B', monto: 40_000_000 }),
      // Año 2023: 0% prórrogas, 0 ampliaciones → no dispara
      c({ anio: 2023, proveedor: 'C', monto: 40_000_000 }),
      c({ anio: 2023, proveedor: 'D', monto: 40_000_000 }),
    ]
    expect(detectarConcentracionTemporal(contratos)).toBeNull()
  })

  it('fires for multi-year dataset on the worst year', () => {
    const contratos = [
      // Año 2022: 0% prórrogas → no dispara solo
      c({ anio: 2022, proveedor: 'A', monto: 100_000_000 }),
      // Año 2023: 50% prórrogas → dispara y debe ser elegido
      c({ anio: 2023, proveedor: 'B', monto: 50_000_000 }),
      c({ tipo: 'PRÓRROGA', anio: 2023, proveedor: 'C', monto: 50_000_000 }),
    ]
    const señal = detectarConcentracionTemporal(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('gasto_fin_ejercicio')
    // Debe mencionar el año peor en evidencia/título
    expect(señal!.titulo).toContain('2023')
    expect(señal!.evidencia[0].descripcion).toContain('2023')
  })

  it('picks worst year when multiple exceed threshold', () => {
    const contratos = [
      // 2022: 35% prórrogas
      c({ anio: 2022, proveedor: 'A', monto: 65_000_000 }),
      c({ tipo: 'PRÓRROGA', anio: 2022, proveedor: 'B', monto: 35_000_000 }),
      // 2023: 60% prórrogas (peor)
      c({ anio: 2023, proveedor: 'C', monto: 40_000_000 }),
      c({ tipo: 'PRÓRROGA', anio: 2023, proveedor: 'D', monto: 60_000_000 }),
    ]
    const señal = detectarConcentracionTemporal(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.titulo).toContain('2023')
    expect(señal!.legal.severidad).toBe('grave') // ≥40%
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

// ─── detectarRotacionCoordinada ──────────────────────────────────────────────

describe('detectarRotacionCoordinada', () => {
  it('returns null for empty array', () => {
    expect(detectarRotacionCoordinada([])).toBeNull()
  })

  it('returns null when only one provider per area', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', area: 'OBRAS', proveedor: 'ROGGIO SA', anio: 2021, monto: 20_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'OBRAS', proveedor: 'ROGGIO SA', anio: 2022, monto: 20_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'OBRAS', proveedor: 'ROGGIO SA', anio: 2023, monto: 20_000_000 }),
    ]
    expect(detectarRotacionCoordinada(contratos)).toBeNull()
  })

  it('returns null when providers share years (competition exists)', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', area: 'OBRAS', proveedor: 'EMPRESA A', anio: 2021, monto: 15_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'OBRAS', proveedor: 'EMPRESA B', anio: 2021, monto: 15_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'OBRAS', proveedor: 'EMPRESA A', anio: 2022, monto: 15_000_000 }),
    ]
    expect(detectarRotacionCoordinada(contratos)).toBeNull()
  })

  it('returns null when total monto < 10M', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', area: 'COMPRAS', proveedor: 'A SA', anio: 2021, monto: 1_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'COMPRAS', proveedor: 'B SA', anio: 2022, monto: 1_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'COMPRAS', proveedor: 'A SA', anio: 2023, monto: 1_000_000 }),
    ]
    expect(detectarRotacionCoordinada(contratos)).toBeNull()
  })

  it('fires when two providers alternate across 3+ years with no overlap', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', area: 'LIMPIEZA', proveedor: 'CLEAN SA', anio: 2019, monto: 20_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'LIMPIEZA', proveedor: 'ASEO SRL', anio: 2020, monto: 20_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'LIMPIEZA', proveedor: 'CLEAN SA', anio: 2021, monto: 20_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'LIMPIEZA', proveedor: 'ASEO SRL', anio: 2022, monto: 20_000_000 }),
      c({ tipo: 'LICITACION PUBLICA', area: 'LIMPIEZA', proveedor: 'CLEAN SA', anio: 2023, monto: 20_000_000 }),
    ]
    const señal = detectarRotacionCoordinada(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('rotacion_coordinada')
    expect(señal!.legal.severidad).toBe('grave')
  })

  it('ignores extension/amendment tipos', () => {
    // Only prórrogas — no base contracts → should not fire
    const contratos = [
      c({ tipo: 'PRÓRROGA', area: 'LIMPIEZA', proveedor: 'CLEAN SA', anio: 2021, monto: 20_000_000 }),
      c({ tipo: 'PRÓRROGA', area: 'LIMPIEZA', proveedor: 'ASEO SRL', anio: 2022, monto: 20_000_000 }),
      c({ tipo: 'PRÓRROGA', area: 'LIMPIEZA', proveedor: 'CLEAN SA', anio: 2023, monto: 20_000_000 }),
    ]
    expect(detectarRotacionCoordinada(contratos)).toBeNull()
  })
})

// ─── detectarAdendaPostAdjudicacion ─────────────────────────────────────────

describe('detectarAdendaPostAdjudicacion', () => {
  it('returns null for empty array', () => {
    expect(detectarAdendaPostAdjudicacion([])).toBeNull()
  })

  it('returns null when no amendments present', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', proveedor: 'ROGGIO SA', area: 'OBRAS', anio: 2022, monto: 50_000_000 }),
    ]
    expect(detectarAdendaPostAdjudicacion(contratos)).toBeNull()
  })

  it('returns null when amendment < 50% of base', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', proveedor: 'ROGGIO SA', area: 'OBRAS', anio: 2022, monto: 50_000_000 }),
      c({ tipo: 'AMPLIACIÓN DE LA CONTRATACIÓN', proveedor: 'ROGGIO SA', area: 'OBRAS', anio: 2022, monto: 20_000_000 }), // 40%
    ]
    expect(detectarAdendaPostAdjudicacion(contratos)).toBeNull()
  })

  it('returns null when base monto < 5M', () => {
    const contratos = [
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'MINI SA', area: 'TI', anio: 2022, monto: 2_000_000 }),
      c({ tipo: 'AMPLIACI', proveedor: 'MINI SA', area: 'TI', anio: 2022, monto: 2_000_000 }),
    ]
    expect(detectarAdendaPostAdjudicacion(contratos)).toBeNull()
  })

  it('fires when amendment ≥ 50% of base', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', proveedor: 'OMEGA SA', area: 'OBRAS', anio: 2022, monto: 40_000_000 }),
      c({ tipo: 'AMPLIACIÓN DE LA CONTRATACIÓN', proveedor: 'OMEGA SA', area: 'OBRAS', anio: 2022, monto: 25_000_000 }), // 62.5%
    ]
    const señal = detectarAdendaPostAdjudicacion(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('adenda_postajudicacion')
    expect(señal!.resumen).toContain('OMEGA SA')
  })

  it('marks as grave when amendment ≥ 100% (doubling)', () => {
    const contratos = [
      c({ tipo: 'CONCURSO DE PRECIOS', proveedor: 'DOBLE SA', area: 'SUMINISTROS', anio: 2022, monto: 20_000_000 }),
      c({ tipo: 'COMPLEMENTARIOS', proveedor: 'DOBLE SA', area: 'SUMINISTROS', anio: 2022, monto: 25_000_000 }), // 125%
    ]
    expect(detectarAdendaPostAdjudicacion(contratos)!.legal.severidad).toBe('grave')
  })

  it('marks as moderada when amendment between 50-99%', () => {
    const contratos = [
      c({ tipo: 'LICITACION PUBLICA', proveedor: 'MEDIO SA', area: 'OBRAS', anio: 2022, monto: 30_000_000 }),
      c({ tipo: 'AMPLIACIÓN DE LA CONTRATACIÓN', proveedor: 'MEDIO SA', area: 'OBRAS', anio: 2022, monto: 20_000_000 }), // 67%
    ]
    expect(detectarAdendaPostAdjudicacion(contratos)!.legal.severidad).toBe('moderada')
  })
})

// ─── detectarRedDeEmpresas ───────────────────────────────────────────────────

describe('detectarRedDeEmpresas', () => {
  it('returns null for empty pares', () => {
    expect(detectarRedDeEmpresas([])).toBeNull()
  })

  it('fires when there are pairs with shared directors', () => {
    const pares = [{
      empresa1: 'NORTE SA',
      empresa2: 'SUR SRL',
      cuit1: '30111111111',
      cuit2: '30222222222',
      directoresCompartidos: ['GARCIA MARIO', 'LOPEZ ANA'],
    }]
    const señal = detectarRedDeEmpresas(pares)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('red_de_empresas')
    expect(señal!.legal.severidad).toBe('grave')
  })

  it('includes director count in evidence', () => {
    const pares = [{
      empresa1: 'ALPHA SA',
      empresa2: 'BETA SRL',
      cuit1: '30111',
      cuit2: '30222',
      directoresCompartidos: ['PEREZ CARLOS', 'GOMEZ JUAN', 'RAMIREZ MARIA'],
    }]
    const señal = detectarRedDeEmpresas(pares)!
    expect(señal.evidencia[0].descripcion).toContain('3 directores')
    expect(señal.evidencia[0].descripcion).toContain('PEREZ CARLOS')
  })

  it('has score of 88', () => {
    const pares = [{ empresa1: 'A', empresa2: 'B', cuit1: '1', cuit2: '2', directoresCompartidos: ['X', 'Y'] }]
    expect(detectarRedDeEmpresas(pares)!.score).toBe(88)
  })
})

// ─── detectarAparicionOffshore ───────────────────────────────────────────────

function osMatch(overrides: Partial<OSMatch> & Pick<OSMatch, 'cuit'>): OSMatch {
  return {
    cuit: overrides.cuit,
    nombre: overrides.nombre ?? 'TEST EMPRESA',
    matched: overrides.matched ?? true,
    riesgo: overrides.riesgo ?? 'offshore',
    datasetPrincipal: overrides.datasetPrincipal ?? 'icij_offshore_leaks',
    entidadId: overrides.entidadId ?? 'test-id',
    entidadCaption: overrides.entidadCaption ?? 'TEST EMPRESA OFFSHORE',
    entidadUrl: overrides.entidadUrl ?? 'https://www.opensanctions.org/entities/test-id/',
    consultadoEn: overrides.consultadoEn ?? '2026-04-25T12:00:00Z',
  }
}

describe('detectarAparicionOffshore', () => {
  it('returns null when osMatches is empty', () => {
    const emp = new Map([['EMPRESA SA', empresa()]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    expect(detectarAparicionOffshore(contratos, emp, new Map())).toBeNull()
  })

  it('returns null when empresas is empty', () => {
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789' })]])
    expect(detectarAparicionOffshore([c({ proveedor: 'X', monto: 1 })], new Map(), matches)).toBeNull()
  })

  it('returns null when contratos is empty', () => {
    expect(detectarAparicionOffshore([], new Map(), new Map())).toBeNull()
  })

  it('returns null when match.matched is false', () => {
    const emp = new Map([['EMPRESA SA', empresa({ cuit: '30123456789' })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789', matched: false, riesgo: null })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    expect(detectarAparicionOffshore(contratos, emp, matches)).toBeNull()
  })

  it('returns null when riesgo is solo PEP (no dispara solo)', () => {
    // PEP = información, no necesariamente delito. Solo dispara con
    // offshore/sancionado/crimen.
    const emp = new Map([['EMPRESA SA', empresa({ cuit: '30123456789' })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789', riesgo: 'pep' })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    expect(detectarAparicionOffshore(contratos, emp, matches)).toBeNull()
  })

  it('returns null when proveedor sin CUIT', () => {
    const emp = new Map([['EMPRESA SA', empresa({ cuit: null })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789' })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    expect(detectarAparicionOffshore(contratos, emp, matches)).toBeNull()
  })

  it('fires when proveedor matches offshore (ICIJ Offshore Leaks)', () => {
    const emp = new Map([['EMPRESA SA', empresa({ cuit: '30123456789' })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789', riesgo: 'offshore' })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    const señal = detectarAparicionOffshore(contratos, emp, matches)
    expect(señal).not.toBeNull()
    expect(señal!.tipologia).toBe('aparicion_offshore')
    expect(señal!.legal.severidad).toBe('grave')
  })

  it('fires when proveedor matches sancionado (score más alto que offshore)', () => {
    const emp = new Map([['SANCIONADA SA', empresa({ cuit: '30999999999' })]])
    const matches = new Map([['30999999999', osMatch({ cuit: '30999999999', riesgo: 'sancionado' })]])
    const contratos = [c({ proveedor: 'SANCIONADA SA', monto: 10_000_000 })]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    expect(señal.score).toBe(95)
  })

  it('fires when proveedor matches crimen', () => {
    const emp = new Map([['DELITO SA', empresa({ cuit: '30444444444' })]])
    const matches = new Map([['30444444444', osMatch({ cuit: '30444444444', riesgo: 'crimen' })]])
    const contratos = [c({ proveedor: 'DELITO SA', monto: 10_000_000 })]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    expect(señal.score).toBe(88)
    expect(señal.legal.severidad).toBe('grave')
  })

  it('lista todas las empresas matched (ordenadas por monto desc)', () => {
    const emp = new Map([
      ['CHICA SA', empresa({ cuit: '30111111111' })],
      ['GRANDE SRL', empresa({ cuit: '30222222222' })],
    ])
    const matches = new Map([
      ['30111111111', osMatch({ cuit: '30111111111', riesgo: 'offshore', entidadCaption: 'CHICA OFFSHORE' })],
      ['30222222222', osMatch({ cuit: '30222222222', riesgo: 'offshore', entidadCaption: 'GRANDE OFFSHORE' })],
    ])
    const contratos = [
      c({ proveedor: 'CHICA SA', monto: 5_000_000 }),
      c({ proveedor: 'GRANDE SRL', monto: 100_000_000 }),
    ]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    expect(señal.titulo).toContain('2 proveedor')
    // primero el de mayor monto
    expect(señal.evidencia[0].descripcion).toContain('GRANDE SRL')
    expect(señal.evidencia[0].descripcion).toContain('100')
  })

  it('incluye los CUITs implicados en la señal (cuits[])', () => {
    const emp = new Map([['EMPRESA SA', empresa({ cuit: '30123456789' })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789', riesgo: 'offshore' })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    expect(señal.cuits).toEqual(['30123456789'])
  })

  it('incluye organismos federales (UIF + Procuración) en denunciarAnte', () => {
    const emp = new Map([['EMPRESA SA', empresa({ cuit: '30123456789' })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789', riesgo: 'offshore' })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    const denunciar = señal.legal.denunciarAnte.join('\n')
    expect(denunciar).toContain('UIF')
    expect(denunciar).toContain('Procuración del Tesoro')
  })

  it('cita Ley 25.246 (lavado) y Ley 27.401 en marco legal', () => {
    const emp = new Map([['EMPRESA SA', empresa({ cuit: '30123456789' })]])
    const matches = new Map([['30123456789', osMatch({ cuit: '30123456789', riesgo: 'offshore' })]])
    const contratos = [c({ proveedor: 'EMPRESA SA', monto: 50_000_000 })]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    const articulos = señal.legal.articulos.join('\n')
    expect(articulos).toContain('25.246')
    expect(articulos).toContain('27.401')
  })

  it('ignora proveedores con match pero sin riesgo en RIESGOS_OFFSHORE', () => {
    const emp = new Map([
      ['SOSPECHOSA SA', empresa({ cuit: '30111111111' })],
      ['SOLO PEP SA', empresa({ cuit: '30222222222' })],
    ])
    const matches = new Map([
      ['30111111111', osMatch({ cuit: '30111111111', riesgo: 'offshore' })],
      ['30222222222', osMatch({ cuit: '30222222222', riesgo: 'pep' })],
    ])
    const contratos = [
      c({ proveedor: 'SOSPECHOSA SA', monto: 10_000_000 }),
      c({ proveedor: 'SOLO PEP SA', monto: 100_000_000 }),
    ]
    const señal = detectarAparicionOffshore(contratos, emp, matches)!
    expect(señal.titulo).toContain('1 proveedor')
    expect(señal.cuits).toEqual(['30111111111'])
  })
})

// ─── normalizarProveedor (B5) ────────────────────────────────────────────────

describe('normalizarProveedor', () => {
  it('strip variantes societarias triviales', () => {
    expect(normalizarProveedor('ACME S.A.')).toBe('ACME')
    expect(normalizarProveedor('ACME SA')).toBe('ACME')
    expect(normalizarProveedor('ACME S.R.L.')).toBe('ACME')
    expect(normalizarProveedor('ACME SRL')).toBe('ACME')
    expect(normalizarProveedor('ACME UTE')).toBe('ACME')
    expect(normalizarProveedor('ACME COOP')).toBe('ACME')
    expect(normalizarProveedor('ACME SAIIC')).toBe('ACME')
  })

  it('"ACME SA" y "ACME SRL" colapsan a la misma key (B5)', () => {
    expect(normalizarProveedor('ACME SA')).toBe(normalizarProveedor('ACME SRL'))
  })

  it('case-insensitive y trim de espacios', () => {
    expect(normalizarProveedor('  acme sa  ')).toBe('ACME')
    expect(normalizarProveedor('Acme  S.A.')).toBe('ACME')  // doble espacio
  })

  it('preserva nombres compuestos', () => {
    expect(normalizarProveedor('CONSTRUCTORA DEL CENTRO SA')).toBe('CONSTRUCTORA DEL CENTRO')
    expect(normalizarProveedor('OBRAS Y SERVICIOS NORTE S.A.')).toBe('OBRAS Y SERVICIOS NORTE')
  })

  it('UTEs y consorcios variantes', () => {
    expect(normalizarProveedor('ROGGIO HIJOS UTE')).toBe('ROGGIO HIJOS')
    expect(normalizarProveedor('ROGGIO HIJOS U.T.')).toBe('ROGGIO HIJOS')
    expect(normalizarProveedor('ROGGIO HIJOS U.T')).toBe('ROGGIO HIJOS')
  })

  it('no elimina si la palabra societaria está en el medio del nombre', () => {
    // "SOCIEDAD" en medio (no al final) no se debe strip
    expect(normalizarProveedor('SOCIEDAD ANONIMA EJEMPLO')).toBe('SOCIEDAD ANONIMA EJEMPLO')
  })

  it('idempotente: aplicar 2 veces da mismo resultado', () => {
    const once = normalizarProveedor('ACME S.A.')
    const twice = normalizarProveedor(once)
    expect(twice).toBe(once)
  })
})

// ─── F2.4: caveat en detectores Tier 2 ─────────────────────────────────────
// La auditoría legal 2026-04-26 marca 6 detectores como Tier 2 (indicio).
// Cada uno debe poblar señal.caveat con el texto del config para que la UI
// pueda mostrar el aviso "señal técnica, no acusación".

describe('F2.4 — caveat en detectores Tier 2', () => {
  it('detectarConcentracion (Tier 2): la señal lleva caveat', () => {
    const contratos = [
      c({ proveedor: 'GIGANTE SA', monto: 70_000_000 }),
      c({ proveedor: 'OTRO', monto: 30_000_000 }),
    ]
    const señal = detectarConcentracion(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeDefined()
    expect(señal!.caveat!.length).toBeGreaterThan(20)
  })

  it('detectarMonopolioRubro (Tier 2): la señal lleva caveat', () => {
    const contratos = [
      c({ area: 'OBRAS', proveedor: 'A', monto: 80_000_000 }),
      c({ area: 'OBRAS', proveedor: 'B', monto: 10_000_000 }),
      c({ area: 'OBRAS', proveedor: 'C', monto: 10_000_000 }),
    ]
    const señal = detectarMonopolioRubro(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeDefined()
  })

  it('detectarServiciosSinHistorial (Tier 2): la señal lleva caveat', () => {
    const contratos = [
      c({ proveedor: 'NUEVA LIMPIEZA SA', descripcion: 'Servicio LIMPIEZA general', monto: 60_000_000 }),
    ]
    const señal = detectarServiciosSinHistorial(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeDefined()
    expect(señal!.caveat!.toLowerCase()).toContain('novedad')
  })

  it('detectarConcentracionTemporal (Tier 2): la señal lleva caveat', () => {
    const contratos = [
      c({ tipo: 'PRORROGA', proveedor: 'A', monto: 60_000_000, anio: 2023 }),
      c({ tipo: 'LICITACION', proveedor: 'B', monto: 40_000_000, anio: 2023 }),
    ]
    const señal = detectarConcentracionTemporal(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeDefined()
  })

  it('detectarProveedorCronico (Tier 2): la señal lleva caveat', () => {
    const contratos = [
      c({ proveedor: 'CRONICO SA', monto: 30_000_000, anio: 2020 }),
      c({ proveedor: 'CRONICO SA', monto: 30_000_000, anio: 2021 }),
      c({ proveedor: 'CRONICO SA', monto: 30_000_000, anio: 2022 }),
    ]
    const señal = detectarProveedorCronico(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeDefined()
    expect(señal!.caveat!.toLowerCase()).toContain('no es')
  })

  it('detectarEmpresaNueva (Tier 2): la señal lleva caveat', () => {
    const emp = new Map([
      ['NUEVA SRL', { cuit: '30123456789', razonSocial: null, esEmpleador: true, inicioActividades: '15/06/2023', estado: 'ACTIVO', actividadPrincipal: null, directores: [], encontrado: true, fuenteUrl: 'https://x' }],
    ])
    const contratos = [c({ proveedor: 'NUEVA SRL', anio: 2023, monto: 15_000_000 })]
    const señal = detectarEmpresaNueva(contratos, emp)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeDefined()
  })

  // Verificación negativa: detectores Tier 1 NO llevan caveat (es opcional
  // y solo lo poblan los Tier 2).
  it('detectarProrrogas (Tier 1): la señal NO tiene caveat', () => {
    const contratos = [
      c({ tipo: 'PRORROGA', proveedor: 'A', monto: 50_000_000 }),
      c({ tipo: 'LICITACION', proveedor: 'B', monto: 50_000_000 }),
    ]
    const señal = detectarProrrogas(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeUndefined()
  })

  it('detectarFraccionamientoAvanzado (Tier 1): la señal NO tiene caveat', () => {
    const contratos = [
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'X SA', monto: 7_000_000 }),
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'X SA', monto: 8_000_000 }),
      c({ tipo: 'CONTRATACION DIRECTA', proveedor: 'X SA', monto: 8_000_000 }),
    ]
    const señal = detectarFraccionamientoAvanzado(contratos)
    expect(señal).not.toBeNull()
    expect(señal!.caveat).toBeUndefined()
  })
})
