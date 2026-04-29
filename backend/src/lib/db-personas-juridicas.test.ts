// Schema-only tests para personas_juridicas (PLAN-DATOS Fase A2).
// Read-only — sigue el patrón W1.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'

beforeAll(async () => { await initDb() })

describe('A2 — personas_juridicas schema', () => {
  it('tiene columnas core A2', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'personas_juridicas'"
    )
    const names = cols.map(c => c.name)
    for (const required of [
      'cuit', 'razon_social', 'razon_social_norm', 'alias_json',
      'tipo_societario', 'fecha_constitucion',
      'dom_fiscal_provincia', 'dom_fiscal_localidad',
      'dom_legal_provincia', 'dom_legal_localidad',
      'estado', 'es_empleador', 'actividad_principal',
      'fuentes_url_json', 'primer_visto', 'ultimo_visto',
    ]) {
      expect(names).toContain(required)
    }
  })

  it('tiene columnas bitemporal W1', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'personas_juridicas'"
    )
    const names = cols.map(c => c.name)
    for (const required of ['t_efectivo', 't_publicado', 'snapshot_id', 'superseded_by_id']) {
      expect(names).toContain(required)
    }
  })

  it('tiene cuit como primary key (NOT NULL)', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'personas_juridicas' AND column_name = 'cuit'"
    )
    expect(cols).toHaveLength(1)
    expect(cols[0].nullable).toBe('NO')
  })

  it('razon_social y razon_social_norm son NOT NULL', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'personas_juridicas' AND column_name IN ('razon_social', 'razon_social_norm')"
    )
    expect(cols).toHaveLength(2)
    for (const c of cols) {
      expect(c.nullable).toBe('NO')
    }
  })

  it('alias_json y fuentes_url_json tienen default \'[]\' (JSON array vacío)', async () => {
    const cols = await dbAll<{ name: string; default_val: string | null }>(
      "SELECT column_name AS name, column_default AS default_val FROM information_schema.columns WHERE table_name = 'personas_juridicas' AND column_name IN ('alias_json', 'fuentes_url_json')"
    )
    expect(cols).toHaveLength(2)
    for (const c of cols) {
      expect(c.default_val).toContain('[]')
    }
  })

  it('campos de domicilio son nullable (no siempre conocidos en seeds)', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      `SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns
       WHERE table_name = 'personas_juridicas'
         AND column_name IN ('dom_fiscal_provincia', 'dom_fiscal_localidad', 'dom_legal_provincia', 'dom_legal_localidad', 'tipo_societario', 'fecha_constitucion', 'estado', 'es_empleador', 'actividad_principal')`
    )
    expect(cols.length).toBeGreaterThan(0)
    for (const c of cols) {
      expect(c.nullable).toBe('YES')
    }
  })

  it('tiene índices en razon_social_norm + dom_fiscal_provincia', async () => {
    const idx = await dbAll<{ index_name: string }>(
      "SELECT index_name FROM duckdb_indexes() WHERE table_name = 'personas_juridicas'"
    )
    const names = idx.map(i => i.index_name)
    expect(names.some(n => n.includes('razon_norm'))).toBe(true)
    expect(names.some(n => n.includes('dom_fiscal_prov'))).toBe(true)
  })
})
