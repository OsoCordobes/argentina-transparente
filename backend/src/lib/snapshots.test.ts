import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, dbRun, dbAll } from './db'
import { crearSnapshot, getSnapshot, listSnapshots, marcarSupersededBy } from './snapshots'

describe('snapshots', () => {
  // initDb() abre conexión DuckDB; reabrirla por test rompe el handle.
  // Patrón ya usado por identity-resolver.test.ts.
  beforeAll(async () => {
    await initDb()
  })

  beforeEach(async () => {
    await dbRun(`DELETE FROM snapshots`)
  })

  it('crearSnapshot persiste un row con id estable', async () => {
    const snap = await crearSnapshot({
      seedId: 'test:dummy',
      fuenteUrl: 'https://ejemplo/dato.xlsx',
      hashArchivo: 'a'.repeat(64),
      filasLeidas: 100,
    })
    expect(snap.id).toBeDefined()
    expect(snap.id.length).toBeGreaterThan(8)

    const fetched = await getSnapshot(snap.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.fuenteUrl).toBe('https://ejemplo/dato.xlsx')
    expect(fetched!.filasLeidas).toBe(100)
  })

  it('listSnapshots devuelve por seedId ordenado por fechaCorrida desc', async () => {
    await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u1', hashArchivo: 'h1', filasLeidas: 1 })
    await new Promise(r => setTimeout(r, 10))
    const second = await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u2', hashArchivo: 'h2', filasLeidas: 2 })

    const list = await listSnapshots('test:a')
    expect(list.length).toBe(2)
    expect(list[0].id).toBe(second.id)  // más reciente primero
  })

  it('marcarSupersededBy linkea uno con el otro', async () => {
    const old = await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u', hashArchivo: 'h1', filasLeidas: 1 })
    const next = await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u', hashArchivo: 'h2', filasLeidas: 1 })

    await marcarSupersededBy(old.id, next.id)
    const refreshed = await getSnapshot(old.id)
    expect(refreshed!.supersededBy).toBe(next.id)
  })
})
