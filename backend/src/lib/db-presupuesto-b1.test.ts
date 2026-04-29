// Schema test para B1: columna compromiso en presupuesto_ejecucion.
// PLAN-DATOS Fase B1.
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb, dbAll } from './db'

beforeAll(async () => { await initDb() })

describe('B1 — presupuesto_ejecucion compromiso', () => {
  it('tiene la columna compromiso (etapa 3 del ciclo presupuestario)', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'presupuesto_ejecucion'"
    )
    const names = cols.map(c => c.name)
    expect(names).toContain('compromiso')
  })

  it('tiene las 5 etapas del ciclo presupuestario (Ley 24.156)', async () => {
    const cols = await dbAll<{ name: string }>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_name = 'presupuesto_ejecucion'"
    )
    const names = cols.map(c => c.name)
    // Las 5 etapas del ciclo: crédito inicial → vigente → compromiso → devengado → pagado
    for (const etapa of ['credito_inicial', 'credito_vigente', 'compromiso', 'devengado', 'pagado']) {
      expect(names).toContain(etapa)
    }
  })

  it('compromiso es nullable (no toda fila viene con esa etapa)', async () => {
    const cols = await dbAll<{ name: string; nullable: string }>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_name = 'presupuesto_ejecucion' AND column_name = 'compromiso'"
    )
    expect(cols).toHaveLength(1)
    expect(cols[0].nullable).toBe('YES')
  })

  it('compromiso es DOUBLE (mismo tipo que las otras etapas monetarias)', async () => {
    const cols = await dbAll<{ name: string; type: string }>(
      "SELECT column_name AS name, data_type AS type FROM information_schema.columns WHERE table_name = 'presupuesto_ejecucion' AND column_name IN ('credito_inicial', 'credito_vigente', 'compromiso', 'devengado', 'pagado')"
    )
    expect(cols.length).toBe(5)
    const tipos = new Set(cols.map(c => c.type.toUpperCase()))
    // Todas las etapas deben tener el mismo tipo monetario (DOUBLE)
    expect(tipos.size).toBe(1)
    expect(tipos.has('DOUBLE')).toBe(true)
  })
})
