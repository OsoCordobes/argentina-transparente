import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, dbRun } from './db'
import {
  insertarCandidato, listarCandidatos, verificarManualmente,
  contarCandidatosPorTier, autoPromoverPorConsenso,
} from './identidad-candidates'

describe('identidad_candidates', () => {
  beforeAll(async () => {
    await initDb()
  })

  beforeEach(async () => {
    await dbRun(`DELETE FROM identidad_candidates`)
  })

  it('insertarCandidato persiste con tier 1/2/3', async () => {
    const id = await insertarCandidato({
      tipo: 'persona',
      fuenteA: 'sueldos:2024:1234',
      identificadorA: '12345678',
      fuenteB: 'igj:dni_12345678',
      identificadorB: '12345678',
      tier: 1,
      metodo: 'dni_exact',
      score: 1.0,
    })
    expect(id).toBeDefined()

    const items = await listarCandidatos({ tier: 1 })
    expect(items.length).toBe(1)
    expect(items[0].verificadoPorHumano).toBe(false)
  })

  it('verificarManualmente promueve a verified=true', async () => {
    const id = await insertarCandidato({
      tipo: 'persona', fuenteA: 'a', identificadorA: 'X', fuenteB: 'b', identificadorB: 'Y',
      tier: 2, metodo: 'nombre_norm', score: 0.7,
    })
    await verificarManualmente(id, true, 'amiunelautaro@gmail.com', 'mismo Pereyra')
    const all = await listarCandidatos({})
    expect(all[0].verificadoPorHumano).toBe(true)
  })

  it('contarCandidatosPorTier separa tier 1/2/3', async () => {
    await insertarCandidato({ tipo: 'persona', fuenteA: 'a1', identificadorA: 'X', fuenteB: 'b1', identificadorB: 'X', tier: 1, metodo: 'dni_exact', score: 1 })
    await insertarCandidato({ tipo: 'persona', fuenteA: 'a2', identificadorA: 'X', fuenteB: 'b2', identificadorB: 'Y', tier: 2, metodo: 'nombre_norm', score: 0.7 })
    await insertarCandidato({ tipo: 'persona', fuenteA: 'a3', identificadorA: 'X', fuenteB: 'b3', identificadorB: 'Z', tier: 3, metodo: 'levenshtein', score: 0.5 })
    const counts = await contarCandidatosPorTier()
    expect(counts.t1).toBe(1)
    expect(counts.t2).toBe(1)
    expect(counts.t3).toBe(1)
  })

  it('autoPromoverPorConsenso promueve T2 a T1 si dos fuentes >0.85', async () => {
    await insertarCandidato({ tipo: 'persona', fuenteA: 'sueldos:1', identificadorA: 'PEREZ JUAN', fuenteB: 'igj:1', identificadorB: 'PEREZ JUAN', tier: 2, metodo: 'nombre_norm', score: 0.9 })
    await insertarCandidato({ tipo: 'persona', fuenteA: 'boletin:1', identificadorA: 'PEREZ JUAN', fuenteB: 'igj:1', identificadorB: 'PEREZ JUAN', tier: 2, metodo: 'nombre_norm', score: 0.88 })

    const promoted = await autoPromoverPorConsenso(0.85)
    expect(promoted).toBeGreaterThanOrEqual(1)
    const counts = await contarCandidatosPorTier()
    expect(counts.t1).toBeGreaterThan(0)
  })
})
