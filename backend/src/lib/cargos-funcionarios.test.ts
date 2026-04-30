// Tests para cargos_funcionarios (PLAN-DATOS Fase A6).
// Mezcla schema-only con tests funcionales sobre upsert/get + migración.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, dbAll, dbRun } from './db'
import {
  cargoId,
  upsertCargoFuncionario,
  getCargosPorDNI,
  getCargosPorApellidoNombre,
  derivarCargosFuncionariosDesdeAgentes,
  // review #1
  cargoVigenteEnFecha,
  cargosVigentesEnFecha,
} from './cargos-funcionarios'

const TEST_JURISDICCION = '__test_a6_cargos__'

beforeAll(async () => { await initDb() })
afterAll(async () => {
  try {
    await dbRun(`DELETE FROM cargos_funcionarios WHERE jurisdiccion = ?`, [TEST_JURISDICCION])
  } catch { /* idempotente */ }
})

describe('A6 — schema cargos_funcionarios', () => {
  it('tiene columnas core A6', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'cargos_funcionarios'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'id', 'dni', 'apellido_nombre', 'apellido_nombre_norm',
      'jurisdiccion', 'reparticion', 'cargo',
      'vigente_desde', 'vigente_hasta', 'facultades_json',
      'fuente_url', 'cargado_en',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('tiene columnas bitemporal W1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'cargos_funcionarios'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['t_efectivo', 't_publicado', 'snapshot_id', 'superseded_by_id']) {
      expect(names).toContain(required)
    }
  })

  it('apellido_nombre_norm + jurisdiccion + cargo son NOT NULL', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      `SELECT column_name AS name, is_nullable AS nullable
       FROM information_schema.columns
       WHERE table_name = 'cargos_funcionarios'
         AND column_name IN ('apellido_nombre_norm', 'jurisdiccion', 'cargo', 'apellido_nombre', 'fuente_url')`
    )
    expect(cols.length).toBeGreaterThanOrEqual(5)
    for (const c of cols) {
      expect(c.nullable).toBe('NO')
    }
  })

  it('dni es nullable (FK opcional hasta backfill A4-A5)', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'cargos_funcionarios' AND column_name = 'dni'"
    )
    expect(cols).toHaveLength(1)
    expect(cols[0].nullable).toBe('YES')
  })
})

describe('A6 — cargoId determinístico', () => {
  it('mismo input produce mismo id', () => {
    const a = cargoId('cordoba-capital', 'PEREZ JUAN', 'Director', 'Secretaría X')
    const b = cargoId('cordoba-capital', 'PEREZ JUAN', 'Director', 'Secretaría X')
    expect(a).toBe(b)
  })

  it('inputs diferentes producen ids diferentes', () => {
    const a = cargoId('cordoba-capital', 'PEREZ JUAN', 'Director', 'Secretaría X')
    const b = cargoId('cordoba-provincia', 'PEREZ JUAN', 'Director', 'Secretaría X')
    const c = cargoId('cordoba-capital', 'PEREZ JUAN', 'Subdirector', 'Secretaría X')
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
  })

  it('reparticion null vs string difieren', () => {
    const a = cargoId('cordoba-capital', 'PEREZ JUAN', 'Director', null)
    const b = cargoId('cordoba-capital', 'PEREZ JUAN', 'Director', 'Sec. X')
    expect(a).not.toBe(b)
  })
})

describe('A6 — upsert + get', () => {
  it('upsert + getCargosPorApellidoNombre devuelve la fila', async () => {
    await upsertCargoFuncionario({
      dni: null,
      apellidoNombre: 'TEST APELLIDO, Nombre',
      apellidoNombreNorm: 'TEST APELLIDO NOMBRE',
      jurisdiccion: TEST_JURISDICCION,
      reparticion: 'Test Reparticion',
      cargo: 'Test Cargo',
      vigenteDesde: '2020-01-01',
      vigenteHasta: null,
      facultades: ['poder_adjudicacion'],
      fuenteUrl: 'https://example.test/',
    })
    const cargos = await getCargosPorApellidoNombre('TEST APELLIDO NOMBRE', TEST_JURISDICCION)
    expect(cargos).toHaveLength(1)
    expect(cargos[0].cargo).toBe('Test Cargo')
    expect(cargos[0].facultades).toEqual(['poder_adjudicacion'])
    expect(cargos[0].vigenteHasta).toBeNull()
  })

  it('upsert es idempotente (re-insert no duplica, sobrescribe)', async () => {
    await upsertCargoFuncionario({
      dni: null,
      apellidoNombre: 'IDEMPOTENT TEST',
      apellidoNombreNorm: 'IDEMPOTENT TEST',
      jurisdiccion: TEST_JURISDICCION,
      reparticion: null,
      cargo: 'Cargo Original',
      vigenteDesde: '2020-01-01',
      vigenteHasta: null,
      facultades: [],
      fuenteUrl: 'https://example.test/v1',
    })
    // Re-upsert con mismo (jurisdiccion, apellido_norm, cargo, reparticion) → mismo id
    await upsertCargoFuncionario({
      dni: '12345678',
      apellidoNombre: 'IDEMPOTENT TEST',
      apellidoNombreNorm: 'IDEMPOTENT TEST',
      jurisdiccion: TEST_JURISDICCION,
      reparticion: null,
      cargo: 'Cargo Original',
      vigenteDesde: '2020-01-01',
      vigenteHasta: '2024-12-31',
      facultades: ['nueva_facultad'],
      fuenteUrl: 'https://example.test/v2',
    })
    const cargos = await getCargosPorApellidoNombre('IDEMPOTENT TEST', TEST_JURISDICCION)
    expect(cargos).toHaveLength(1) // NO duplicado
    expect(cargos[0].dni).toBe('12345678') // Re-write
    expect(cargos[0].vigenteHasta).toBe('2024-12-31')
    expect(cargos[0].facultades).toEqual(['nueva_facultad'])
    expect(cargos[0].fuenteUrl).toBe('https://example.test/v2')
  })

  it('getCargosPorDNI funciona cuando el dni está populado', async () => {
    await upsertCargoFuncionario({
      dni: '99887766',
      apellidoNombre: 'DNI TEST',
      apellidoNombreNorm: 'DNI TEST',
      jurisdiccion: TEST_JURISDICCION,
      reparticion: null,
      cargo: 'Cargo con DNI',
      vigenteDesde: '2021-01-01',
      vigenteHasta: null,
      facultades: [],
      fuenteUrl: 'https://example.test/dni',
    })
    const cargos = await getCargosPorDNI('99887766')
    expect(cargos.length).toBeGreaterThanOrEqual(1)
    expect(cargos.some(c => c.cargo === 'Cargo con DNI')).toBe(true)
  })
})

// ─── Review iteración #1: filtros temporales ────────────────────────────────

describe('A6 review #1 — cargoVigenteEnFecha', () => {
  const c = (desde: string | null, hasta: string | null) => ({
    vigenteDesde: desde,
    vigenteHasta: hasta,
  })

  it('vigente cuando fecha está en rango', () => {
    expect(cargoVigenteEnFecha(c('2020-01-01', '2024-12-31'), '2022-06-15')).toBe(true)
    expect(cargoVigenteEnFecha(c('2020-01-01', '2024-12-31'), '2020-01-01')).toBe(true) // boundary
    expect(cargoVigenteEnFecha(c('2020-01-01', '2024-12-31'), '2024-12-31')).toBe(true) // boundary
  })

  it('NO vigente cuando fecha es anterior al desde', () => {
    expect(cargoVigenteEnFecha(c('2020-01-01', '2024-12-31'), '2019-12-31')).toBe(false)
  })

  it('NO vigente cuando fecha es posterior al hasta', () => {
    expect(cargoVigenteEnFecha(c('2020-01-01', '2024-12-31'), '2025-01-01')).toBe(false)
  })

  it('vigenteHasta null = vigente actualmente (sin tope superior)', () => {
    expect(cargoVigenteEnFecha(c('2020-01-01', null), '2099-01-01')).toBe(true)
  })

  it('vigenteDesde null = sin tope inferior (data incompleta no descarta)', () => {
    expect(cargoVigenteEnFecha(c(null, '2024-12-31'), '1990-01-01')).toBe(true)
  })

  it('ambos null = vigente para cualquier fecha (data totalmente faltante)', () => {
    expect(cargoVigenteEnFecha(c(null, null), '2050-06-15')).toBe(true)
  })

  it('tolera timestamps completos en cualquier campo', () => {
    expect(cargoVigenteEnFecha(c('2020-01-01T00:00:00Z', '2024-12-31T23:59:59Z'), '2022-06-15T10:00:00Z')).toBe(true)
  })
})

describe('A6 review #1 — cargosVigentesEnFecha (integration)', () => {
  it('SQL retorna estructura iterable (puede ser vacía si DB no tiene cargos)', async () => {
    const cargos = await cargosVigentesEnFecha('cordoba-capital', '2022-06-15')
    expect(Array.isArray(cargos)).toBe(true)
    // Cada uno debe respetar la regla de vigencia en el momento del query
    for (const c of cargos) {
      expect(cargoVigenteEnFecha(c, '2022-06-15')).toBe(true)
    }
  })

  it('respeta filtro de jurisdicción', async () => {
    const cargos = await cargosVigentesEnFecha('jurisdiccion-inexistente-test', '2022-06-15')
    expect(cargos).toEqual([])
  })
})

describe('A6 — derivarCargosFuncionariosDesdeAgentes', () => {
  // Timeout extendido: con 178K filas en agentes_publicos la migración tarda
  // ~30s en DBs realistas. El test confirma que corre y devuelve la estructura
  // esperada, no que sea rápida — la performance se evalúa por separado.
  it('corre sin error y devuelve estructura {insertados, gruposEvaluados}', async () => {
    const r = await derivarCargosFuncionariosDesdeAgentes()
    expect(typeof r.insertados).toBe('number')
    expect(typeof r.gruposEvaluados).toBe('number')
    expect(r.insertados).toBe(r.gruposEvaluados) // 1:1 grupos → filas
  }, 120_000)

  it('todos los cargos derivados tienen apellido_nombre_norm en MAYÚSCULAS y sin tildes', async () => {
    const cargos = await dbAll<{ norm: string }>(
      `SELECT apellido_nombre_norm AS norm FROM cargos_funcionarios LIMIT 50`
    )
    for (const c of cargos) {
      expect(c.norm).toBe(c.norm.toUpperCase())
      // No debe haber tildes en ASCII básico
      expect(/[áéíóúÁÉÍÓÚñÑ]/.test(c.norm)).toBe(false)
    }
  })

  it('vigente_desde tiene formato YYYY-01-01 cuando viene de derivación', async () => {
    const cargos = await dbAll<{ desde: string | null }>(
      `SELECT vigente_desde AS desde FROM cargos_funcionarios
       WHERE jurisdiccion != ? AND vigente_desde IS NOT NULL LIMIT 20`,
      [TEST_JURISDICCION],
    )
    for (const c of cargos) {
      if (c.desde) {
        expect(/^\d{4}-01-01$/.test(c.desde)).toBe(true)
      }
    }
  })
})
