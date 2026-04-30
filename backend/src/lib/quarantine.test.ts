import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, dbRun } from './db'
import { crearSnapshot } from './snapshots'
import { enquarantine, getQuarantine, resolverQuarantine, countQuarantine } from './quarantine'

describe('quarantine', () => {
  // initDb() abre conexión DuckDB; reabrirla por test rompe el handle.
  // Patrón ya usado por snapshots.test.ts e identity-resolver.test.ts.
  beforeAll(async () => {
    await initDb()
  })

  beforeEach(async () => {
    await dbRun(`DELETE FROM quarantine`)
    await dbRun(`DELETE FROM snapshots`)
  })

  it('enquarantine inserta una fila vinculada a snapshot', async () => {
    const snap = await crearSnapshot({ seedId: 'test', fuenteUrl: 'u', hashArchivo: 'h', filasLeidas: 0 })
    const id = await enquarantine({
      snapshotId: snap.id,
      tablaDestino: 'contratos',
      motivo: 'schema_validation',
      detalle: { campo: 'monto', error: 'expected number got string' },
      filaJson: { proveedor: 'X', monto: '$1.000' },
    })
    expect(id).toBeDefined()

    const all = await getQuarantine({ tablaDestino: 'contratos' })
    expect(all.length).toBe(1)
    expect(all[0].motivo).toBe('schema_validation')
    expect(all[0].resolucion).toBe('pending')
  })

  it('resolverQuarantine actualiza estado', async () => {
    const snap = await crearSnapshot({ seedId: 'test', fuenteUrl: 'u', hashArchivo: 'h', filasLeidas: 0 })
    const id = await enquarantine({
      snapshotId: snap.id,
      tablaDestino: 'contratos',
      motivo: 'sanity_check',
      detalle: { drop: 0.9 },
      filaJson: {},
    })

    await resolverQuarantine(id, 'discarded', 'manual review — falso positivo')
    const all = await getQuarantine({})
    expect(all[0].resolucion).toBe('discarded')
    expect(all[0].resueltoEn).toBeDefined()
  })

  it('countQuarantine filtra por estado', async () => {
    const snap = await crearSnapshot({ seedId: 'test', fuenteUrl: 'u', hashArchivo: 'h', filasLeidas: 0 })
    await enquarantine({ snapshotId: snap.id, tablaDestino: 't1', motivo: 'm', detalle: {}, filaJson: {} })
    await enquarantine({ snapshotId: snap.id, tablaDestino: 't1', motivo: 'm', detalle: {}, filaJson: {} })
    expect(await countQuarantine({ resolucion: 'pending' })).toBe(2)
    expect(await countQuarantine({ resolucion: 'discarded' })).toBe(0)
  })
})
