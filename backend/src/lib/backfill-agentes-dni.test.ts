// Tests para backfill-agentes-dni (PLAN-DATOS A4).
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest'
import { initDb, dbAll, dbRun } from './db'
import { backfillAgentesDni } from './backfill-agentes-dni'

const TEST_JUR = '__test_a4_backfill__'

beforeAll(async () => { await initDb() })

afterAll(async () => {
  try {
    await dbRun(`DELETE FROM agentes_publicos WHERE jurisdiccion = ?`, [TEST_JUR])
    await dbRun(`DELETE FROM declaraciones_juradas WHERE jurisdiccion = ?`, [TEST_JUR])
  } catch { /* idempotente */ }
})

beforeEach(async () => {
  await dbRun(`DELETE FROM agentes_publicos WHERE jurisdiccion = ?`, [TEST_JUR])
  await dbRun(`DELETE FROM declaraciones_juradas WHERE jurisdiccion = ?`, [TEST_JUR])
})

async function insAgente(id: string, apellido: string, dni: string | null = null) {
  await dbRun(
    `INSERT INTO agentes_publicos
       (id, jurisdiccion, anio, categoria, reparticion, cargo, apellido_nombre, fuente_url, cargado_en, dni)
     VALUES (?, ?, 2024, 'funcionario', 'X', 'Y', ?, 'http://test/', '2024-01-01', ?)`,
    [id, TEST_JUR, apellido, dni],
  )
}

async function insDDJJ(id: string, apellido_norm: string, dni: string | null, pdf: string | null = null) {
  await dbRun(
    `INSERT INTO declaraciones_juradas
       (id, jurisdiccion, dato_id, version_id, gestion, apellido_nombre, apellido_nombre_norm,
        anio_declarado, pdf_url, dni, fuente_url, cargado_en)
     VALUES (?, ?, ?, ?, '2020-2023', ?, ?, 2024, ?, ?, 'http://ddjj/', '2024-01-01')`,
    [id, TEST_JUR, id, id, apellido_norm, apellido_norm, pdf, dni],
  )
}

describe('A4 — backfillAgentesDni', () => {
  it('matchea agente con DDJJ por nombre normalizado y devuelve update', async () => {
    await insAgente('a1', 'Pérez Juan')
    await insDDJJ('d1', 'PEREZ JUAN', '12345678', 'http://test/d1.pdf')

    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.matched).toBe(1)
    expect(r.ambiguos).toBe(0)
    expect(r.updates).toHaveLength(1)
    expect(r.updates[0].id).toBe('a1')
    expect(r.updates[0].dni).toBe('12345678')
    expect(r.updates[0].fuente).toBe('http://test/d1.pdf')
  })

  it('descarta agente con DNI ambiguo (varios DDJJ con DNIs distintos)', async () => {
    await insAgente('a1', 'Gomez Maria')
    await insDDJJ('d1', 'GOMEZ MARIA', '11111111')
    await insDDJJ('d2', 'GOMEZ MARIA', '22222222')

    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.matched).toBe(0)
    expect(r.ambiguos).toBe(1)
    expect(r.updates).toHaveLength(0)
  })

  it('ignora DDJJ con DNI inválido módulo-11', async () => {
    await insAgente('a1', 'Lopez Ana')
    await insDDJJ('d1', 'LOPEZ ANA', '12345')           // 5 dígitos < 6
    await insDDJJ('d2', 'LOPEZ ANA', '12345abc')        // letras → inválido
    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.matched).toBe(0)
    expect(r.ambiguos).toBe(0)
  })

  it('no toca agentes que ya tienen dni', async () => {
    await insAgente('a1', 'Suarez Pablo', '99999999')
    await insDDJJ('d1', 'SUAREZ PABLO', '12345678')
    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.matched).toBe(0)
  })

  it('apply=true escribe el dni en la fila y la fuente', async () => {
    await insAgente('a1', 'Diaz Luis')
    await insDDJJ('d1', 'DIAZ LUIS', '20123456', 'http://x/pdf')
    await backfillAgentesDni({ jurisdiccion: TEST_JUR, apply: true })

    const rows = await dbAll<{ dni: string; fuente_dni_url: string }>(
      `SELECT dni, fuente_dni_url FROM agentes_publicos WHERE id = ?`, ['a1'],
    )
    expect(rows[0].dni).toBe('20123456')
    expect(rows[0].fuente_dni_url).toBe('http://x/pdf')
  })

  it('apply=false (default) no escribe nada', async () => {
    await insAgente('a1', 'Diaz Luis')
    await insDDJJ('d1', 'DIAZ LUIS', '20123456')
    await backfillAgentesDni({ jurisdiccion: TEST_JUR })

    const rows = await dbAll<{ dni: string | null }>(
      `SELECT dni FROM agentes_publicos WHERE id = ?`, ['a1'],
    )
    expect(rows[0].dni).toBeNull()
  })

  it('totalNull cuenta solo agentes con dni NULL en la jurisdicción', async () => {
    await insAgente('a1', 'Uno')
    await insAgente('a2', 'Dos')
    await insAgente('a3', 'Tres', '40000000')
    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.totalNull).toBe(2)
  })

  it('respeta el filtro de jurisdicción (no cruza con otra)', async () => {
    await insAgente('a1', 'Pérez Juan')
    // DDJJ en otra jurisdicción no debería ser candidato
    await dbRun(
      `INSERT INTO declaraciones_juradas
         (id, jurisdiccion, dato_id, version_id, gestion, apellido_nombre, apellido_nombre_norm,
          anio_declarado, pdf_url, dni, fuente_url, cargado_en)
       VALUES ('d-otra', 'otra-jurisdiccion', 'x', 'x', '2020-2023',
               'PEREZ JUAN', 'PEREZ JUAN', 2024, 'http://x/', '12345678', 'http://x/', '2024-01-01')`,
    )
    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.matched).toBe(0)

    await dbRun(`DELETE FROM declaraciones_juradas WHERE id = 'd-otra'`)
  })

  it('normaliza tildes inline (Pérez ↔ PEREZ, Núñez ↔ NUNEZ)', async () => {
    await insAgente('a1', 'Núñez José')
    await insDDJJ('d1', 'NUNEZ JOSE', '30123456')
    const r = await backfillAgentesDni({ jurisdiccion: TEST_JUR })
    expect(r.matched).toBe(1)
    expect(r.updates[0].dni).toBe('30123456')
  })
})
