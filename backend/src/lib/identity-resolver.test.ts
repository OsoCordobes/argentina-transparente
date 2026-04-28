/**
 * Tests para identity-resolver.ts.
 *
 * Cubre los 5 tiers + cache hit. Usa la DB real de DuckDB con CUITs/
 * nombres prefijados por un sufijo único de test para no colisionar
 * con los datos reales (~2.4K contratos cargados).
 *
 * Limpieza: cada test borra sus filas con DELETE WHERE prefix.
 */

import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { initDb, dbRun, dbAll, upsertEmpresa, normProveedor } from './db'
import {
  resolverEmpresa,
  _setLlmInvokerForTests,
  _resetLlmInvokerForTests,
  type IdentityMatch,
} from './identity-resolver'

// Sufijo único para esta corrida → aísla tests del dataset productivo.
const TEST_SUFFIX = `__TEST_F3_${Date.now()}`

// CUITs sintéticos: 11 dígitos, todos empiezan con '99' (no asignado real).
const CUIT_A = '99100000001'
const CUIT_B = '99100000002'
const CUIT_C = '99100000003'

const NOMBRE_A = `ACME PROVIDER SRL${TEST_SUFFIX}`
const NOMBRE_B = `BETA SOLUTIONS SA${TEST_SUFFIX}`
const NOMBRE_C = `GAMMA SERVICIOS${TEST_SUFFIX}`

async function cleanup(): Promise<void> {
  // Borrar TODA pollution test, no solo la de esta corrida — corridas previas
  // dejaban filas huérfanas. CUITs canónicos de fixture: 991* (Tier 1-3) +
  // 99999999999 (cache hit test). Patrón de nombre: cualquier __TEST_F*.
  await dbRun(`DELETE FROM empresas WHERE cuit LIKE '991%' OR cuit LIKE '999%'`)
  await dbRun(`DELETE FROM identity_matches WHERE proveedor_norm LIKE '%__TEST_F%' OR cuit_resuelto LIKE '991%' OR cuit_resuelto LIKE '999%'`)
}

beforeAll(async () => {
  await initDb()
  await cleanup()
  // Seed empresas conocidas — el resolver las usa como universo de candidatos.
  for (const [cuit, nombre] of [
    [CUIT_A, NOMBRE_A],
    [CUIT_B, NOMBRE_B],
    [CUIT_C, NOMBRE_C],
  ] as const) {
    await upsertEmpresa({
      cuit,
      nombre,
      esEmpleador: true,
      inicioActividades: null,
      estado: 'ACTIVO',
      actividadPrincipal: null,
      fuenteUrl: 'https://test.local/identity',
    })
  }
})

afterAll(async () => {
  _resetLlmInvokerForTests()
  await cleanup()
})

describe('resolverEmpresa — Tier 1 (cuit_exact)', () => {
  it('resuelve a tier=1 score=100 cuando el CUIT existe en empresas', async () => {
    const r: IdentityMatch = await resolverEmpresa(NOMBRE_A, CUIT_A)
    expect(r.tier).toBe(1)
    expect(r.score).toBe(100)
    expect(r.metodo).toBe('cuit_exact')
    expect(r.cuit).toBe(CUIT_A)
  })

  it('cachea el resultado en identity_matches', async () => {
    const norm = normProveedor(NOMBRE_A)
    const rows = await dbAll<{ cuit_resuelto: string; tier: number }>(
      `SELECT cuit_resuelto, tier FROM identity_matches WHERE proveedor_norm = ?`,
      [norm]
    )
    expect(rows.length).toBeGreaterThan(0)
    expect(rows[0].cuit_resuelto).toBe(CUIT_A)
    expect(rows[0].tier).toBe(1)
  })
})

describe('resolverEmpresa — Tier 2 (name_normalized)', () => {
  it('resuelve a tier=2 score=85 sin CUIT cuando el nombre normalizado matchea', async () => {
    const r = await resolverEmpresa(NOMBRE_B)
    expect(r.tier).toBe(2)
    expect(r.score).toBe(85)
    expect(r.metodo).toBe('name_normalized')
    expect(r.cuit).toBe(CUIT_B)
  })
})

describe('resolverEmpresa — Tier 3 (name_fuzzy_high)', () => {
  it('resuelve a tier=3 con typo leve en nombre (>=85% similitud)', async () => {
    // 'GAMMA SERVICIO' (sin S final) vs 'GAMMA SERVICIOS' → ~93% similitud
    const r = await resolverEmpresa(`GAMMA SERVICIO${TEST_SUFFIX}`)
    expect(r.tier).toBe(3)
    expect(r.score).toBeGreaterThanOrEqual(70)
    expect(r.metodo).toBe('name_fuzzy_high')
    expect(r.cuit).toBe(CUIT_C)
  })
})

describe('resolverEmpresa — Tier 5 (no_match)', () => {
  it('retorna tier=5 cuit=null cuando no hay candidatos similares', async () => {
    // Mockear LLM para que NO matchee — sino podría caer a Tier 4.
    _setLlmInvokerForTests(async () => '{"match": false}')
    const r = await resolverEmpresa(`COMPLETELY DIFFERENT XYZQQQ${TEST_SUFFIX}`)
    expect(r.tier).toBe(5)
    expect(r.score).toBe(0)
    expect(r.cuit).toBeNull()
    expect(r.metodo).toBe('no_match')
    _resetLlmInvokerForTests()
  })
})

describe('resolverEmpresa — Tier 4 (llm_ambiguous)', () => {
  // Para Tier 4 necesitamos candidatos en rango 60-84% similitud.
  // Seedeamos empresas con nombre suficientemente parecido pero no idéntico.
  const TIER4_NOMBRE_REAL = `KAPPA INDUSTRIAS${TEST_SUFFIX}`
  const TIER4_CUIT = '99100000004'
  // Query: "KAPPA YNDU SRL" → ~70% similar a "KAPPA INDUSTRIAS" (rango ambiguo).

  beforeAll(async () => {
    await upsertEmpresa({
      cuit: TIER4_CUIT,
      nombre: TIER4_NOMBRE_REAL,
      esEmpleador: true,
      inicioActividades: null,
      estado: 'ACTIVO',
      actividadPrincipal: null,
      fuenteUrl: 'https://test.local/identity',
    })
  })

  it('LLM dice match=true score=85 → tier=4 con CUIT del candidato elegido', async () => {
    _setLlmInvokerForTests(async () =>
      JSON.stringify({
        match: true,
        candidato_index: 1,
        score: 85,
        reason: 'Razón social muy parecida, mismo rubro plausible.',
      })
    )
    const r = await resolverEmpresa(`KAPPA YNDU SRL${TEST_SUFFIX}_t4a`)
    expect(r.tier).toBe(4)
    expect(r.metodo).toBe('llm_ambiguous')
    expect(r.cuit).toBe(TIER4_CUIT)
    expect(r.score).toBeGreaterThanOrEqual(70)
    _resetLlmInvokerForTests()
  })

  it('LLM dice match=false → cae a tier=5', async () => {
    _setLlmInvokerForTests(async () => JSON.stringify({ match: false }))
    const r = await resolverEmpresa(`KAPPA YNDU SRL${TEST_SUFFIX}_t4b`)
    expect(r.tier).toBe(5)
    expect(r.metodo).toBe('no_match')
    expect(r.cuit).toBeNull()
    _resetLlmInvokerForTests()
  })

  it('LLM tira error → cae graceful a tier=5 (no propaga)', async () => {
    _setLlmInvokerForTests(async () => { throw new Error('LLM down') })
    const r = await resolverEmpresa(`KAPPA YNDU SRL${TEST_SUFFIX}_t4c`)
    expect(r.tier).toBe(5)
    expect(r.cuit).toBeNull()
    _resetLlmInvokerForTests()
  })

  it('LLM responde score < 70 → cae a tier=5 (no es match seguro)', async () => {
    _setLlmInvokerForTests(async () =>
      JSON.stringify({ match: true, candidato_index: 1, score: 50, reason: 'dudoso' })
    )
    const r = await resolverEmpresa(`KAPPA YNDU SRL${TEST_SUFFIX}_t4d`)
    expect(r.tier).toBe(5)
    _resetLlmInvokerForTests()
  })

  it('LLM responde candidato_index inválido → cae a tier=5', async () => {
    _setLlmInvokerForTests(async () =>
      JSON.stringify({ match: true, candidato_index: 99, score: 90 })
    )
    const r = await resolverEmpresa(`KAPPA YNDU SRL${TEST_SUFFIX}_t4e`)
    expect(r.tier).toBe(5)
    _resetLlmInvokerForTests()
  })

  it('LLM responde JSON malformado → cae a tier=5', async () => {
    _setLlmInvokerForTests(async () => 'esto no es json')
    const r = await resolverEmpresa(`KAPPA YNDU SRL${TEST_SUFFIX}_t4f`)
    expect(r.tier).toBe(5)
    _resetLlmInvokerForTests()
  })
})

describe('resolverEmpresa — cache hit', () => {
  it('la 2da llamada no re-ejecuta la resolución (timestamp inmutable)', async () => {
    const nombre = `CACHED COMPANY${TEST_SUFFIX}`
    // Pre-poblamos el cache con un timestamp conocido.
    const norm = normProveedor(nombre)
    const fakeTs = '2020-01-01T00:00:00.000Z'
    await dbRun(
      `INSERT OR REPLACE INTO identity_matches VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [norm, '99999999999', 1, 100, 'cuit_exact', null, fakeTs]
    )

    const r = await resolverEmpresa(nombre, '99999999999')
    expect(r.cuit).toBe('99999999999')
    expect(r.tier).toBe(1)

    // Verificar que el timestamp NO se actualizó (cache hit no escribe).
    const rows = await dbAll<{ resuelto_en: string }>(
      `SELECT resuelto_en FROM identity_matches WHERE proveedor_norm = ?`,
      [norm]
    )
    expect(rows[0].resuelto_en).toBe(fakeTs)
  })
})
