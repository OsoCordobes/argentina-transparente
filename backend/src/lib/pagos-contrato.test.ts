// Tests para pagos_contrato (PLAN-DATOS Fase B3).
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, dbAll, dbRun } from './db'
import {
  pagoId,
  upsertPagoContrato,
  getPagosPorContrato,
  getTotalPagadoPorContrato,
} from './pagos-contrato'

const TEST_CONTRATO_HASH = '__test_b3_contrato_hash__'

beforeAll(async () => { await initDb() })
afterAll(async () => {
  try {
    await dbRun(`DELETE FROM pagos_contrato WHERE contrato_hash = ?`, [TEST_CONTRATO_HASH])
  } catch { /* idempotente */ }
})

describe('B3 — schema pagos_contrato', () => {
  it('tiene columnas core B3', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'pagos_contrato'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'id', 'contrato_hash', 'fecha_pago', 'monto', 'moneda',
      'concepto', 'fuente_url', 'cargado_en',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('tiene columnas bitemporal W1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'pagos_contrato'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['t_efectivo', 't_publicado', 'snapshot_id', 'superseded_by_id']) {
      expect(names).toContain(required)
    }
  })

  it('contrato_hash, fecha_pago y monto son NOT NULL', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      `SELECT column_name AS name, is_nullable AS nullable
       FROM information_schema.columns
       WHERE table_name = 'pagos_contrato'
         AND column_name IN ('contrato_hash', 'fecha_pago', 'monto', 'fuente_url')`
    )
    expect(cols.length).toBe(4)
    for (const c of cols) {
      expect(c.nullable).toBe('NO')
    }
  })

  it('tiene índices en contrato_hash y fecha_pago', async () => {
    const idx = await dbAll<{ index_name: string }>(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'pagos_contrato'"
    )
    const names = idx.map(i => i.index_name)
    expect(names.some(n => n.includes('contrato'))).toBe(true)
    expect(names.some(n => n.includes('fecha'))).toBe(true)
  })
})

describe('B3 — pagoId determinístico', () => {
  it('mismo input produce mismo id', () => {
    const a = pagoId('hash-x', '2024-01-15', 100000)
    const b = pagoId('hash-x', '2024-01-15', 100000)
    expect(a).toBe(b)
  })

  it('inputs diferentes producen ids diferentes', () => {
    const a = pagoId('hash-x', '2024-01-15', 100000)
    const b = pagoId('hash-y', '2024-01-15', 100000)
    const c = pagoId('hash-x', '2024-01-16', 100000)
    const d = pagoId('hash-x', '2024-01-15', 100001)
    expect(new Set([a, b, c, d]).size).toBe(4) // todos distintos
  })
})

describe('B3 — upsert + queries', () => {
  it('upsert + getPagosPorContrato devuelve la fila ordenada', async () => {
    await upsertPagoContrato({
      contratoHash: TEST_CONTRATO_HASH,
      fechaPago: '2024-03-15',
      monto: 250000,
      moneda: 'ARS',
      concepto: 'pago parcial',
      fuenteUrl: 'https://example.test/pago1',
    })
    await upsertPagoContrato({
      contratoHash: TEST_CONTRATO_HASH,
      fechaPago: '2024-01-10',
      monto: 100000,
      moneda: 'ARS',
      concepto: 'anticipo',
      fuenteUrl: 'https://example.test/pago2',
    })
    const pagos = await getPagosPorContrato(TEST_CONTRATO_HASH)
    expect(pagos).toHaveLength(2)
    // Orden ASC por fecha
    expect(pagos[0].fechaPago).toBe('2024-01-10')
    expect(pagos[1].fechaPago).toBe('2024-03-15')
    expect(pagos[0].concepto).toBe('anticipo')
    expect(pagos[1].monto).toBe(250000)
  })

  it('upsert es idempotente — re-insertar mismo (hash, fecha, monto) sobrescribe', async () => {
    await upsertPagoContrato({
      contratoHash: TEST_CONTRATO_HASH,
      fechaPago: '2024-06-01',
      monto: 500000,
      moneda: 'ARS',
      concepto: 'concepto original',
      fuenteUrl: 'https://example.test/v1',
    })
    await upsertPagoContrato({
      contratoHash: TEST_CONTRATO_HASH,
      fechaPago: '2024-06-01',
      monto: 500000,
      moneda: 'ARS',
      concepto: 'concepto actualizado',
      fuenteUrl: 'https://example.test/v2',
    })
    const pagos = await getPagosPorContrato(TEST_CONTRATO_HASH)
    const pago = pagos.find(p => p.fechaPago === '2024-06-01' && p.monto === 500000)
    expect(pago).toBeDefined()
    expect(pago?.concepto).toBe('concepto actualizado')
    expect(pago?.fuenteUrl).toBe('https://example.test/v2')
    // Y solo hay UNA fila para este (hash, fecha, monto), no duplicada
    const duplicados = pagos.filter(p => p.fechaPago === '2024-06-01' && p.monto === 500000)
    expect(duplicados).toHaveLength(1)
  })

  it('getTotalPagadoPorContrato suma todos los pagos', async () => {
    const total = await getTotalPagadoPorContrato(TEST_CONTRATO_HASH)
    // 100k + 250k + 500k = 850k
    expect(total).toBe(850000)
  })

  it('getTotalPagadoPorContrato devuelve 0 para hash sin pagos', async () => {
    const total = await getTotalPagadoPorContrato('__contrato_inexistente__')
    expect(total).toBe(0)
  })
})
