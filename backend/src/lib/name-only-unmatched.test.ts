// Tests para name-only-unmatched (PLAN-DATOS A5).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDb, dbAll, dbRun } from './db'
import {
  flagAgentesNameOnly,
  flagContratosNameOnly,
  flagTransferenciasNameOnly,
} from './name-only-unmatched'

const TEST_JUR = '__test_a5_name_only__'
const TEST_MUN = '__test_a5_name_only__'

beforeAll(async () => { await initDb() })

afterAll(async () => {
  try {
    await dbRun(`DELETE FROM agentes_publicos WHERE jurisdiccion = ?`, [TEST_JUR])
    await dbRun(`DELETE FROM contratos WHERE municipio = ?`, [TEST_MUN])
    await dbRun(`DELETE FROM transferencias WHERE jurisdiccion = ?`, [TEST_JUR])
  } catch { /* idempotente */ }
})

beforeEach(async () => {
  await dbRun(`DELETE FROM agentes_publicos WHERE jurisdiccion = ?`, [TEST_JUR])
  await dbRun(`DELETE FROM contratos WHERE municipio = ?`, [TEST_MUN])
  await dbRun(`DELETE FROM transferencias WHERE jurisdiccion = ?`, [TEST_JUR])
})

describe('A5 — flagAgentesNameOnly', () => {
  it('marca agentes con dni NULL', async () => {
    await dbRun(
      `INSERT INTO agentes_publicos
         (id, jurisdiccion, anio, categoria, reparticion, cargo, apellido_nombre, fuente_url, cargado_en, dni)
       VALUES ('a1', ?, 2024, 'f', 'X', 'Y', 'X', 'http://x', '2024-01-01', NULL),
              ('a2', ?, 2024, 'f', 'X', 'Y', 'Y', 'http://x', '2024-01-01', '12345678')`,
      [TEST_JUR, TEST_JUR],
    )
    const r = await flagAgentesNameOnly({ jurisdiccion: TEST_JUR })
    expect(r.marcadas).toBe(1)
    expect(r.totalNull).toBe(1)
    const rows = await dbAll<{ id: string; flag: boolean }>(
      `SELECT id, name_only_unmatched AS flag FROM agentes_publicos
         WHERE jurisdiccion = ? ORDER BY id`, [TEST_JUR],
    )
    expect(rows.find(r => r.id === 'a1')?.flag).toBe(true)
    expect(rows.find(r => r.id === 'a2')?.flag).toBe(false)
  })

  it('idempotente: re-correr no incrementa marcadas', async () => {
    await dbRun(
      `INSERT INTO agentes_publicos
         (id, jurisdiccion, anio, categoria, reparticion, cargo, apellido_nombre, fuente_url, cargado_en, dni)
       VALUES ('a1', ?, 2024, 'f', 'X', 'Y', 'X', 'http://x', '2024-01-01', NULL)`,
      [TEST_JUR],
    )
    await flagAgentesNameOnly({ jurisdiccion: TEST_JUR })
    const r2 = await flagAgentesNameOnly({ jurisdiccion: TEST_JUR })
    expect(r2.marcadas).toBe(0)
    expect(r2.yaMarcadas).toBe(1)
  })

  it('respeta filtro de jurisdicción (no marca otras)', async () => {
    await dbRun(
      `INSERT INTO agentes_publicos
         (id, jurisdiccion, anio, categoria, reparticion, cargo, apellido_nombre, fuente_url, cargado_en, dni)
       VALUES ('a1', ?, 2024, 'f', 'X', 'Y', 'X', 'http://x', '2024-01-01', NULL),
              ('a2', 'otra', 2024, 'f', 'X', 'Y', 'X', 'http://x', '2024-01-01', NULL)`,
      [TEST_JUR],
    )
    const r = await flagAgentesNameOnly({ jurisdiccion: TEST_JUR })
    expect(r.marcadas).toBe(1)
    const otra = await dbAll<{ flag: boolean }>(
      `SELECT name_only_unmatched AS flag FROM agentes_publicos WHERE id = 'a2'`,
    )
    expect(otra[0].flag).toBe(false)
    await dbRun(`DELETE FROM agentes_publicos WHERE id = 'a2'`)
  })
})

describe('A5 — flagContratosNameOnly', () => {
  it('marca contratos con proveedor_cuit NULL', async () => {
    await dbRun(
      `INSERT INTO contratos
         (hash, municipio, anio, tipo, proveedor, proveedor_norm, area, monto, fuente_url, cargado_en, proveedor_cuit)
       VALUES ('h1', ?, 2024, 't', 'P1', 'p1', 'A', 100, 'http://x', '2024-01-01', NULL),
              ('h2', ?, 2024, 't', 'P2', 'p2', 'A', 200, 'http://x', '2024-01-01', '30-12345678-1')`,
      [TEST_MUN, TEST_MUN],
    )
    const r = await flagContratosNameOnly({ municipio: TEST_MUN })
    expect(r.marcadas).toBe(1)

    const rows = await dbAll<{ hash: string; flag: boolean }>(
      `SELECT hash, name_only_unmatched AS flag FROM contratos
         WHERE municipio = ? ORDER BY hash`, [TEST_MUN],
    )
    expect(rows.find(r => r.hash === 'h1')?.flag).toBe(true)
    expect(rows.find(r => r.hash === 'h2')?.flag).toBe(false)
  })

  it('idempotente para contratos', async () => {
    await dbRun(
      `INSERT INTO contratos
         (hash, municipio, anio, tipo, proveedor, proveedor_norm, area, monto, fuente_url, cargado_en, proveedor_cuit)
       VALUES ('h1', ?, 2024, 't', 'P', 'p', 'A', 100, 'http://x', '2024-01-01', NULL)`,
      [TEST_MUN],
    )
    await flagContratosNameOnly({ municipio: TEST_MUN })
    const r2 = await flagContratosNameOnly({ municipio: TEST_MUN })
    expect(r2.marcadas).toBe(0)
    expect(r2.yaMarcadas).toBe(1)
  })
})

describe('A5 — flagTransferenciasNameOnly', () => {
  it('marca transferencias con beneficiario_cuit NULL', async () => {
    await dbRun(
      `INSERT INTO transferencias
         (id, jurisdiccion, anio, tipo, monto, fuente_url, cargado_en, beneficiario, beneficiario_cuit)
       VALUES ('t1', ?, 2024, 'subsidio', 100, 'http://x', '2024-01-01', 'Asoc X', NULL),
              ('t2', ?, 2024, 'subsidio', 200, 'http://x', '2024-01-01', 'Asoc Y', '30-22222222-9')`,
      [TEST_JUR, TEST_JUR],
    )
    const r = await flagTransferenciasNameOnly({ jurisdiccion: TEST_JUR })
    expect(r.marcadas).toBe(1)
    const rows = await dbAll<{ id: string; flag: boolean }>(
      `SELECT id, name_only_unmatched AS flag FROM transferencias
         WHERE jurisdiccion = ? ORDER BY id`, [TEST_JUR],
    )
    expect(rows.find(r => r.id === 't1')?.flag).toBe(true)
    expect(rows.find(r => r.id === 't2')?.flag).toBe(false)
  })
})
