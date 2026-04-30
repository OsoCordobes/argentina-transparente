// Schema test para cadena_de_pago view (PLAN-DATOS Fase B4).
// Verifica que la vista existe, tiene las columnas esperadas y es queryable
// (aunque devuelva 0 filas en una DB recién creada).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'

beforeAll(async () => { await initDb() })

describe('B4 — cadena_de_pago view', () => {
  it('la vista existe', async () => {
    const views = await dbAll<{ table_name: string }>(
      "SELECT table_name FROM information_schema.tables WHERE table_name = 'cadena_de_pago'"
    )
    expect(views.length).toBe(1)
  })

  it('expone las 5 etapas del ciclo presupuestario', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'cadena_de_pago'"
    )
    const names = cols.map(c => c.name)
    for (const etapa of [
      'credito_inicial', 'credito_vigente', 'compromiso',
      'devengado', 'pagado_partida',
    ]) {
      expect(names).toContain(etapa)
    }
  })

  it('expone identidad del contrato + proveedor (con separación cuit/cuit_inferido)', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'cadena_de_pago'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'contrato_hash', 'proveedor', 'proveedor_cuit',
      'proveedor_cuit_inferido', 'contrato_monto_adjudicado',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('expone agregaciones de pagos atomizados', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'cadena_de_pago'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'contrato_total_pagado', 'contrato_cantidad_pagos',
      'contrato_primer_pago', 'contrato_ultimo_pago',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('la vista es queryable (puede tener 0 filas, pero no debe fallar)', async () => {
    const rows = await dbAll<{ partida_jurisdiccion: string }>(
      `SELECT partida_jurisdiccion FROM cadena_de_pago LIMIT 1`,
    )
    expect(Array.isArray(rows)).toBe(true)
  })

  it('para partidas sin contrato vinculado, contrato_total_pagado = 0 (LEFT JOIN respeta el lado izquierdo)', async () => {
    // Buscar partidas sin contrato vinculado (contrato_hash IS NULL)
    const rows = await dbAll<{ contrato_total_pagado: number }>(
      `SELECT contrato_total_pagado FROM cadena_de_pago
       WHERE contrato_hash IS NULL LIMIT 5`,
    )
    for (const r of rows) {
      expect(Number(r.contrato_total_pagado)).toBe(0)
    }
  })
})
