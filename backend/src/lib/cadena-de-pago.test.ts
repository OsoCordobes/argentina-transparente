// Tests para helpers de cadena_de_pago (review iteración #1 B).
import { describe, it, expect, beforeAll } from 'vitest'
import { initDb } from './db'
import {
  getCadenaDePagoPorPartida,
  getCadenaDePagoPorProveedor,
  getCadenaDePagoPorPrograma,
  getResumenCicloPresupuestario,
} from './cadena-de-pago'

beforeAll(async () => { await initDb() })

describe('B review #1 — cadena_de_pago helpers', () => {
  it('getCadenaDePagoPorPartida con partida_id inexistente → []', async () => {
    const r = await getCadenaDePagoPorPartida('partida-id-inexistente')
    expect(r).toEqual([])
  })

  it('getCadenaDePagoPorProveedor con CUIT inexistente → []', async () => {
    const r = await getCadenaDePagoPorProveedor('30-99999999-9')
    expect(r).toEqual([])
  })

  it('getCadenaDePagoPorPrograma con programa inexistente → []', async () => {
    const r = await getCadenaDePagoPorPrograma('programa-test-inexistente')
    expect(r).toEqual([])
  })

  it('getResumenCicloPresupuestario devuelve estructura con las 5 etapas (todas 0 si no hay data)', async () => {
    const r = await getResumenCicloPresupuestario('jurisdiccion-test-inexistente', 1900)
    expect(r.jurisdiccion).toBe('jurisdiccion-test-inexistente')
    expect(r.anio).toBe(1900)
    // Todas las etapas presentes y numéricas
    expect(typeof r.creditoInicial).toBe('number')
    expect(typeof r.creditoVigente).toBe('number')
    expect(typeof r.compromiso).toBe('number')
    expect(typeof r.devengado).toBe('number')
    expect(typeof r.pagado).toBe('number')
  })
})
