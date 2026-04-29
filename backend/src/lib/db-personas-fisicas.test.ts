// Schema-only tests: validan que la tabla personas_fisicas tiene columnas e
// índices esperados (PLAN-DATOS Fase A1). Read-only para evitar acoplar a DB
// productiva (Hallazgo 1 W1).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'

beforeAll(async () => { await initDb() })

describe('A1 — personas_fisicas schema', () => {
  it('tiene columnas core A1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'personas_fisicas'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'dni', 'cuit', 'apellido_nombre', 'apellido_nombre_norm',
      'fuentes_url_json', 'fuente_dni_url',
      'primer_visto', 'ultimo_visto',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('tiene columnas bitemporal W1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'personas_fisicas'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['t_efectivo', 't_publicado', 'snapshot_id', 'superseded_by_id']) {
      expect(names).toContain(required)
    }
  })

  it('tiene dni como primary key', async () => {
    // information_schema.columns exposes is_nullable; PK debe ser NOT NULL
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'personas_fisicas' AND column_name = 'dni'"
    )
    expect(cols).toHaveLength(1)
    expect(cols[0].nullable).toBe('NO')
  })

  it('tiene índices en cuit y apellido_nombre_norm', async () => {
    const idx = await dbAll<{ index_name: string }>(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'personas_fisicas'"
    )
    const names = idx.map(i => i.index_name)
    expect(names.some(n => n.includes('cuit'))).toBe(true)
    expect(names.some(n => n.includes('apellido_norm'))).toBe(true)
  })

  it('apellido_nombre y apellido_nombre_norm son NOT NULL', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'personas_fisicas' AND column_name IN ('apellido_nombre', 'apellido_nombre_norm')"
    )
    expect(cols).toHaveLength(2)
    for (const c of cols) {
      expect(c.nullable).toBe('NO')
    }
  })

  it('fuentes_url_json tiene default \'[]\' (JSON array vacío)', async () => {
    const cols = await dbAll<{ name: string; default_val: string | null }>(
      "SELECT column_name AS name, column_default AS default_val FROM information_schema.columns WHERE table_name = 'personas_fisicas' AND column_name = 'fuentes_url_json'"
    )
    expect(cols).toHaveLength(1)
    // DuckDB devuelve el default como string SQL — debe contener el array literal
    expect(cols[0].default_val).toContain('[]')
  })

  it('cuit es nullable (puede no haberse calculado todavía)', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'personas_fisicas' AND column_name = 'cuit'"
    )
    expect(cols).toHaveLength(1)
    expect(cols[0].nullable).toBe('YES')
  })
})
