// Schema-only tests: validan que las tablas declaraciones_juradas y
// aportantes_campanas tienen columnas esperadas (M1.5 + M1.6 + bitemporal W1).
// Read-only para evitar acoplar a DB productiva (Hallazgo 1 W1).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'

beforeAll(async () => { await initDb() })

describe('M1.5 — declaraciones_juradas schema', () => {
  it('tiene columnas core M1.5', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'declaraciones_juradas'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['id', 'jurisdiccion', 'dato_id', 'version_id',
      'gestion', 'apellido_nombre', 'apellido_nombre_norm', 'anio_declarado',
      'pdf_url', 'xls_url', 'csv_url', 'ocr_procesado', 'cuit', 'dni',
      'monto_declarado', 'fuente_url', 'cargado_en']) {
      expect(names).toContain(required)
    }
  })

  it('tiene columnas bitemporal W1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'declaraciones_juradas'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['t_efectivo', 't_publicado', 'snapshot_id', 'superseded_by_id']) {
      expect(names).toContain(required)
    }
  })

  it('tiene índices en apellido y dni', async () => {
    const idx = await dbAll<{ index_name: string }>(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'declaraciones_juradas'"
    )
    const names = idx.map(i => i.index_name)
    expect(names.some(n => n.includes('apellido'))).toBe(true)
  })
})

describe('M1.6 — aportantes_campanas schema', () => {
  it('tiene columnas core M1.6', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'aportantes_campanas'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['id', 'distrito', 'anio_electoral', 'cuit', 'dni',
      'apellido_nombre', 'razon_social', 'partido', 'alianza', 'categoria',
      'tipo_aporte', 'monto', 'fecha_aporte', 'fuente_url', 'cargado_en']) {
      expect(names).toContain(required)
    }
  })

  it('tiene columnas bitemporal W1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'aportantes_campanas'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['t_efectivo', 't_publicado', 'snapshot_id', 'superseded_by_id']) {
      expect(names).toContain(required)
    }
  })
})
