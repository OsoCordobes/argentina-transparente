// Tests para verificacion-senales (PLAN-DATOS Fase A7).
// Mezcla schema-only (columnas) con tests funcionales sobre filas insertadas.
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { initDb, dbAll, dbRun, insertSeñalCache } from './db'
import {
  ESTADOS_VERIFICACION,
  esEstadoVerificacionValido,
  actualizarEstadoSeñal,
  marcarSeñalVerificada,
  marcarSeñalDescartada,
  marcarSeñalBloqueada,
  reseteEstadoSeñal,
  contarSeñalesPorEstado,
  // review #1
  getSeñalesParaVerificar,
  contarSeñalesPorEstadoYSeveridad,
} from './verificacion-senales'

const TEST_MUNICIPIO = '__test_a7_verificacion__'

beforeAll(async () => { await initDb() })
afterAll(async () => {
  // Limpiar señales de test creadas por este suite
  try {
    await dbRun(`DELETE FROM señales_cache WHERE municipio = ?`, [TEST_MUNICIPIO])
  } catch { /* idempotente */ }
})

async function insertarSeñalDeTest(): Promise<string> {
  await insertSeñalCache(TEST_MUNICIPIO, {
    tipologia: 'test_a7',
    score: 50,
    titulo: 'Señal de test A7',
    resumen: 'Solo para verificación de helpers, no es señal real',
    evidencia: [{ descripcion: 'test', fuenteUrl: 'https://example.test/' }],
    legal: { articulos: [], severidad: 'leve', denunciarAnte: [] },
  })
  const rows = await dbAll<{ id: string }>(
    `SELECT id FROM señales_cache WHERE municipio = ? AND tipologia = 'test_a7' ORDER BY computado_en DESC LIMIT 1`,
    [TEST_MUNICIPIO],
  )
  if (rows.length === 0) throw new Error('No se pudo insertar señal de test')
  return rows[0].id
}

describe('A7 — schema señales_cache', () => {
  it('tiene las 3 columnas nuevas', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'señales_cache'"
    )
    const names = cols.map(c => c.name)
    expect(names).toContain('estado_verificacion')
    expect(names).toContain('verificado_por')
    expect(names).toContain('verificado_en')
  })

  // NOTA: NO testeamos column_default == 'sin_verificar' porque DuckDB en esta
  // versión no soporta ALTER TABLE ADD COLUMN con constraints, por lo que la
  // columna en DBs pre-existentes a A7 NO tiene DEFAULT a nivel DDL. El default
  // se materializa en cambio via insertSeñalCache (que pasa 'sin_verificar'
  // explícito) y backfill UPDATE en initDb. El comportamiento end-to-end queda
  // cubierto por los tests funcionales más abajo ("señal recién insertada
  // tiene estado_verificacion = sin_verificar").
})

describe('A7 — enum y validación', () => {
  it('ESTADOS_VERIFICACION tiene exactamente 4 valores', () => {
    expect(ESTADOS_VERIFICACION).toEqual(['sin_verificar', 'verificada', 'descartada', 'bloqueada'])
  })

  it('esEstadoVerificacionValido acepta los 4 estados', () => {
    for (const e of ESTADOS_VERIFICACION) {
      expect(esEstadoVerificacionValido(e)).toBe(true)
    }
  })

  it('esEstadoVerificacionValido rechaza valores fuera del enum', () => {
    expect(esEstadoVerificacionValido('pendiente')).toBe(false)
    expect(esEstadoVerificacionValido('VERIFICADA')).toBe(false) // case-sensitive
    expect(esEstadoVerificacionValido('')).toBe(false)
    expect(esEstadoVerificacionValido('null')).toBe(false)
  })

  it('actualizarEstadoSeñal lanza con estado inválido', async () => {
    await expect(
      actualizarEstadoSeñal('id-fake', 'pendiente' as never, 'tester'),
    ).rejects.toThrow(/estado inválido/)
  })

  it('actualizarEstadoSeñal exige "por" para verificada/descartada/bloqueada', async () => {
    await expect(
      actualizarEstadoSeñal('id-fake', 'verificada'),
    ).rejects.toThrow(/requiere argumento "por"/)
    await expect(
      actualizarEstadoSeñal('id-fake', 'descartada', '   '),
    ).rejects.toThrow(/requiere argumento "por"/)
  })
})

describe('A7 — flujos de verificación', () => {
  it('señal recién insertada tiene estado_verificacion = sin_verificar (default)', async () => {
    const id = await insertarSeñalDeTest()
    const rows = await dbAll<{ estado_verificacion: string; verificado_por: string | null; verificado_en: string | null }>(
      `SELECT estado_verificacion, verificado_por, verificado_en FROM señales_cache WHERE id = ?`,
      [id],
    )
    expect(rows[0].estado_verificacion).toBe('sin_verificar')
    expect(rows[0].verificado_por).toBeNull()
    expect(rows[0].verificado_en).toBeNull()
  })

  it('marcarSeñalVerificada actualiza estado + por + en', async () => {
    const id = await insertarSeñalDeTest()
    await marcarSeñalVerificada(id, 'auditor@test.com')
    const rows = await dbAll<{ estado_verificacion: string; verificado_por: string | null; verificado_en: string | null }>(
      `SELECT estado_verificacion, verificado_por, verificado_en FROM señales_cache WHERE id = ?`,
      [id],
    )
    expect(rows[0].estado_verificacion).toBe('verificada')
    expect(rows[0].verificado_por).toBe('auditor@test.com')
    expect(rows[0].verificado_en).toBeTruthy()
  })

  it('marcarSeñalDescartada y marcarSeñalBloqueada funcionan', async () => {
    const id1 = await insertarSeñalDeTest()
    const id2 = await insertarSeñalDeTest()
    await marcarSeñalDescartada(id1, 'auditor@test.com')
    await marcarSeñalBloqueada(id2, 'auditor@test.com')
    const r1 = await dbAll<{ estado: string }>(
      `SELECT estado_verificacion AS estado FROM señales_cache WHERE id = ?`, [id1],
    )
    const r2 = await dbAll<{ estado: string }>(
      `SELECT estado_verificacion AS estado FROM señales_cache WHERE id = ?`, [id2],
    )
    expect(r1[0].estado).toBe('descartada')
    expect(r2[0].estado).toBe('bloqueada')
  })

  it('reseteEstadoSeñal vuelve a sin_verificar y limpia auditoría', async () => {
    const id = await insertarSeñalDeTest()
    await marcarSeñalVerificada(id, 'auditor@test.com')
    await reseteEstadoSeñal(id)
    const rows = await dbAll<{ estado_verificacion: string; verificado_por: string | null; verificado_en: string | null }>(
      `SELECT estado_verificacion, verificado_por, verificado_en FROM señales_cache WHERE id = ?`,
      [id],
    )
    expect(rows[0].estado_verificacion).toBe('sin_verificar')
    expect(rows[0].verificado_por).toBeNull()
    expect(rows[0].verificado_en).toBeNull()
  })

  it('getSeñalesParaVerificar devuelve solo sin_verificar, ordenado por score DESC', async () => {
    // Insertar serialmente — Promise.all causa race con lookup `latest by computado_en`
    // (los 3 lookups pueden retornar el mismo row si ocurren en el mismo segundo).
    const ids: string[] = []
    for (let i = 0; i < 3; i++) ids.push(await insertarSeñalDeTest())
    // Marcar una como verificada — esa NO debería aparecer en cola
    await marcarSeñalVerificada(ids[0], 'auditor@test')

    const cola = await getSeñalesParaVerificar({ jurisdiccion: TEST_MUNICIPIO })
    const idsCola = cola.map(s => s.id)
    expect(idsCola).not.toContain(ids[0]) // verificada excluida
    expect(idsCola).toContain(ids[1])
    expect(idsCola).toContain(ids[2])
    // Orden por score DESC + computado_en ASC
    for (let i = 1; i < cola.length; i++) {
      expect(cola[i].score).toBeLessThanOrEqual(cola[i - 1].score)
    }
  })

  it('getSeñalesParaVerificar respeta filtro de severidad', async () => {
    const cola = await getSeñalesParaVerificar({ jurisdiccion: TEST_MUNICIPIO, severidad: 'grave' })
    for (const s of cola) {
      expect(s.severidad).toBe('grave')
    }
  })

  it('getSeñalesParaVerificar respeta minScore', async () => {
    const cola = await getSeñalesParaVerificar({ jurisdiccion: TEST_MUNICIPIO, minScore: 999 })
    expect(cola).toEqual([])
  })

  it('contarSeñalesPorEstadoYSeveridad expone breakdown 4×3', async () => {
    const r = await contarSeñalesPorEstadoYSeveridad(TEST_MUNICIPIO)
    // Estructura siempre presente con los 4 estados × 3 severidades
    expect(r.porEstadoYSeveridad.sin_verificar).toBeDefined()
    expect(r.porEstadoYSeveridad.sin_verificar.grave).toBeGreaterThanOrEqual(0)
    expect(r.porEstadoYSeveridad.verificada.grave).toBeGreaterThanOrEqual(0)
    expect(r.porEstadoYSeveridad.descartada.moderada).toBeGreaterThanOrEqual(0)
    expect(r.porEstadoYSeveridad.bloqueada.leve).toBeGreaterThanOrEqual(0)
    // Totales coherentes: por estado debe sumar a totalesPorEstado
    for (const estado of ESTADOS_VERIFICACION) {
      const sumPorSeveridad = r.porEstadoYSeveridad[estado].grave +
                              r.porEstadoYSeveridad[estado].moderada +
                              r.porEstadoYSeveridad[estado].leve
      expect(sumPorSeveridad).toBe(r.totalesPorEstado[estado])
    }
    // Total general coherente
    const sumTotalEstados = ESTADOS_VERIFICACION.reduce((s, e) => s + r.totalesPorEstado[e], 0)
    expect(sumTotalEstados).toBe(r.total)
  })

  it('contarSeñalesPorEstado devuelve registry con los 4 estados', async () => {
    // Crear señales en cada estado
    const ids = await Promise.all([
      insertarSeñalDeTest(),
      insertarSeñalDeTest(),
      insertarSeñalDeTest(),
      insertarSeñalDeTest(),
    ])
    await marcarSeñalVerificada(ids[0], 'auditor@test.com')
    await marcarSeñalDescartada(ids[1], 'auditor@test.com')
    await marcarSeñalBloqueada(ids[2], 'auditor@test.com')
    // ids[3] queda en sin_verificar

    const conteo = await contarSeñalesPorEstado(TEST_MUNICIPIO)
    expect(conteo.sin_verificar).toBeGreaterThanOrEqual(1)
    expect(conteo.verificada).toBeGreaterThanOrEqual(1)
    expect(conteo.descartada).toBeGreaterThanOrEqual(1)
    expect(conteo.bloqueada).toBeGreaterThanOrEqual(1)
  })
})
