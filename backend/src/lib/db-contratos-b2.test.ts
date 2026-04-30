// Schema test para B2: cadena del dinero en contratos.
// PLAN-DATOS Fase B2.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'

beforeAll(async () => { await initDb() })

describe('B2 — contratos cadena de pago', () => {
  it('tiene las 5 columnas nuevas de B2', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'contratos'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'partida_presupuestaria',
      'programa_presupuestario',
      'proveedor_cuit',
      'proveedor_cuit_inferido',
      'numero_orden_compra',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('proveedor_cuit y proveedor_cuit_inferido son columnas separadas', async () => {
    // Verificamos explícitamente que NO se colapsaron en una sola — esa
    // separación es la barrera que mantiene los Tier 4-5 fuera de detectores
    // publicables (W4 hallazgo: NIETO→OTERO, Córdoba→La Rioja).
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'contratos' AND column_name IN ('proveedor_cuit', 'proveedor_cuit_inferido')"
    )
    expect(cols).toHaveLength(2)
  })

  it('todas las columnas B2 son TEXT y nullable', async () => {
    const cols = await dbAll<{ name: string; type: string; nullable: string }>(
      `SELECT column_name AS name, data_type AS type, is_nullable AS nullable
       FROM information_schema.columns
       WHERE table_name = 'contratos'
         AND column_name IN ('partida_presupuestaria', 'programa_presupuestario', 'proveedor_cuit', 'proveedor_cuit_inferido', 'numero_orden_compra')`
    )
    expect(cols.length).toBe(5)
    for (const c of cols) {
      expect(c.type.toUpperCase()).toBe('VARCHAR')
      expect(c.nullable).toBe('YES')
    }
  })

  it('tiene índices en proveedor_cuit y partida (para joins de cadena de pago)', async () => {
    const idx = await dbAll<{ index_name: string }>(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'contratos'"
    )
    const names = idx.map(i => i.index_name)
    expect(names.some(n => n.includes('proveedor_cuit'))).toBe(true)
    expect(names.some(n => n.includes('partida'))).toBe(true)
  })
})
