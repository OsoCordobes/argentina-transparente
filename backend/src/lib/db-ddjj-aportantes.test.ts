// Tests for tables added in M1.5/M1.6: declaraciones_juradas + aportantes_campanas.
// Verifica creación, idempotencia INSERT OR REPLACE, índices, constraints.
//
// NOTA: tests acoplados a DB productiva (Hallazgo 1 W1). Mitigamos con prefijos
// _test_/_TEST_ + afterAll cleanup para no dejar residuos.
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest'
import { initDb, dbAll, dbRun } from './db'
import crypto from 'crypto'

beforeAll(async () => { await initDb() })
afterAll(async () => {
  // Cleanup global: borra cualquier residuo de los inserts de los tests.
  await dbRun('DELETE FROM declaraciones_juradas WHERE jurisdiccion = ?', ['_test_'])
  await dbRun('DELETE FROM aportantes_campanas WHERE distrito = ?', ['_TEST_'])
})

describe('M1.5 — declaraciones_juradas table', () => {
  beforeEach(async () => { await dbRun('DELETE FROM declaraciones_juradas WHERE jurisdiccion = ?', ['_test_']) })

  it('crea la tabla con columnas esperadas', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'declaraciones_juradas' ORDER BY ordinal_position"
    )
    const names = cols.map(c => c.name)
    expect(names).toContain('id')
    expect(names).toContain('jurisdiccion')
    expect(names).toContain('dato_id')
    expect(names).toContain('version_id')
    expect(names).toContain('apellido_nombre')
    expect(names).toContain('anio_declarado')
    expect(names).toContain('pdf_url')
    expect(names).toContain('ocr_procesado')
  })

  it('inserta y dedupea por id (sha256 dato+version) — idempotente', async () => {
    const id = crypto.createHash('sha256').update('_test_|D1|V1').digest('hex').slice(0, 32)
    const insertSQL = `
      INSERT OR REPLACE INTO declaraciones_juradas
      (id, jurisdiccion, dato_id, version_id, gestion, apellido_nombre,
       anio_declarado, pdf_url, xls_url, csv_url, ocr_procesado,
       cuit, dni, monto_declarado, fuente_url, cargado_en)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    const params = [
      id, '_test_', 'D1', 'V1', '2016-2019', 'Test User', 2018,
      'https://x/pdf.pdf', null, null, false, null, null, null,
      'https://x/source', new Date().toISOString(),
    ]
    await dbRun(insertSQL, params)
    await dbRun(insertSQL, params)  // duplicate — should NOT error
    const r = await dbAll<{ c: number }>(`SELECT COUNT(*) c FROM declaraciones_juradas WHERE id = ?`, [id])
    expect(Number(r[0].c)).toBe(1)
  })

  it('OCR fields default a NULL/false', async () => {
    const id = crypto.createHash('sha256').update('_test_|D2|V2').digest('hex').slice(0, 32)
    await dbRun(
      `INSERT OR REPLACE INTO declaraciones_juradas
       (id, jurisdiccion, dato_id, version_id, gestion, apellido_nombre,
        anio_declarado, pdf_url, xls_url, csv_url, ocr_procesado,
        cuit, dni, monto_declarado, fuente_url, cargado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, '_test_', 'D2', 'V2', '2020-2023', 'Pre OCR', 2022,
       'https://x/2.pdf', null, null, false, null, null, null,
       'https://x/source2', new Date().toISOString()]
    )
    const r = await dbAll<any>(`SELECT cuit, dni, monto_declarado, ocr_procesado FROM declaraciones_juradas WHERE id = ?`, [id])
    expect(r[0].cuit).toBeNull()
    expect(r[0].dni).toBeNull()
    expect(r[0].monto_declarado).toBeNull()
    expect(r[0].ocr_procesado).toBe(false)
  })
})

describe('M1.6 — aportantes_campanas table', () => {
  beforeEach(async () => { await dbRun('DELETE FROM aportantes_campanas WHERE distrito = ?', ['_TEST_']) })

  it('crea la tabla con columnas esperadas', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'aportantes_campanas' ORDER BY ordinal_position"
    )
    const names = cols.map(c => c.name)
    for (const required of ['id', 'distrito', 'anio_electoral', 'cuit', 'dni',
      'apellido_nombre', 'razon_social', 'partido', 'monto', 'fuente_url']) {
      expect(names).toContain(required)
    }
  })

  it('inserta aportante PJ via CUIT', async () => {
    const id = crypto.createHash('sha256').update('_TEST_|2023|30-71234567-8|PJ-TEST').digest('hex').slice(0, 32)
    await dbRun(
      `INSERT OR REPLACE INTO aportantes_campanas
       (id, distrito, anio_electoral, cuit, dni, apellido_nombre, razon_social,
        partido, alianza, categoria, tipo_aporte, monto, fecha_aporte,
        fuente_url, cargado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, '_TEST_', 2023, '30-71234567-8', null, null, 'Empresa Test SA',
       'PJ-TEST', 'Alianza Test', 'Diputado Nacional', 'monetario',
       100000, '2023-09-15', 'https://x/aportes', new Date().toISOString()]
    )
    const r = await dbAll<any>(`SELECT * FROM aportantes_campanas WHERE id = ?`, [id])
    expect(r[0].razon_social).toBe('Empresa Test SA')
    expect(r[0].monto).toBe(100000)
  })

  it('inserta aportante PF via DNI', async () => {
    const id = crypto.createHash('sha256').update('_TEST_|2023|22333444|PF-TEST').digest('hex').slice(0, 32)
    await dbRun(
      `INSERT OR REPLACE INTO aportantes_campanas
       (id, distrito, anio_electoral, cuit, dni, apellido_nombre, razon_social,
        partido, alianza, categoria, tipo_aporte, monto, fecha_aporte,
        fuente_url, cargado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [id, '_TEST_', 2023, null, '22333444', 'Pérez Juan', null,
       'PF-TEST', null, 'Senador', 'monetario', 5000, '2023-09-10',
       'https://x/aportes', new Date().toISOString()]
    )
    const r = await dbAll<any>(`SELECT * FROM aportantes_campanas WHERE id = ?`, [id])
    expect(r[0].dni).toBe('22333444')
    expect(r[0].cuit).toBeNull()
  })
})
