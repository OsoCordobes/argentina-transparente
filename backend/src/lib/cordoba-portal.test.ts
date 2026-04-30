/**
 * Tests para parsearTablaConHeaderDetectable.
 * Genera buffers XLSX en memoria con xlsx library para verificar que el
 * header detector encuentra la fila correcta con título antes.
 */
import { describe, expect, it } from 'vitest'
import * as XLSX from 'xlsx'
import {
  parsearTabla,
  parsearTablaConHeaderDetectable,
  inferirAnioMesDesdeTitulo,
  inferirAnioDesdeTitulo,
} from './cordoba-portal'

/**
 * Construye un buffer XLSX desde array of arrays (cada item = una fila).
 * Útil para simular XLSX con diferentes estructuras de header.
 */
function makeXlsxBuffer(rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet(rows)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Hoja1')
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer
}

describe('parsearTablaConHeaderDetectable', () => {
  it('header en row 0 — comportamiento estándar', () => {
    const buf = makeXlsxBuffer([
      ['Concepto', 'Codigo', 'Recaudacion'],
      ['Ingresos generales', 'A1', 100000],
      ['Tasas municipales', 'A2', 50000],
    ])
    const filas = parsearTablaConHeaderDetectable(
      buf,
      ['concepto', 'codigo', 'recaudacion'],
      { minMatches: 2 },
    )
    expect(filas.length).toBe(2)
    expect(filas[0]).toMatchObject({
      Concepto: 'Ingresos generales',
      Codigo: 'A1',
      Recaudacion: 100000,
    })
  })

  it('header en row 1 — salta título de row 0', () => {
    const buf = makeXlsxBuffer([
      ['CÁLCULO DE RECURSOS PARA EL EJERCICIO 2024'],  // título en row 0
      ['Concepto', 'Codigo', 'Recaudacion'],            // header real en row 1
      ['Ingresos generales', 'A1', 100000],
    ])
    const filas = parsearTablaConHeaderDetectable(
      buf,
      ['concepto', 'codigo'],
      { minMatches: 2 },
    )
    expect(filas.length).toBe(1)
    expect(filas[0]).toMatchObject({
      Concepto: 'Ingresos generales',
      Codigo: 'A1',
      Recaudacion: 100000,
    })
  })

  it('header en row 2 — salta 2 filas título', () => {
    const buf = makeXlsxBuffer([
      ['MUNICIPALIDAD DE CÓRDOBA'],
      ['Ejecución Presupuestaria 2024 — Anexo I'],
      ['Partida', 'Programa', 'Credito Vigente', 'Devengado'],
      ['1.1.1', 'Educación', 50000000, 45000000],
    ])
    const filas = parsearTablaConHeaderDetectable(
      buf,
      ['partida', 'programa', 'credito'],
      { minMatches: 2 },
    )
    expect(filas.length).toBe(1)
    expect(filas[0]).toMatchObject({
      Partida: '1.1.1',
      Programa: 'Educación',
      'Credito Vigente': 50000000,
      Devengado: 45000000,
    })
  })

  it('no encuentra header con keywords — fallback a parser estándar', () => {
    const buf = makeXlsxBuffer([
      ['Foo', 'Bar', 'Baz'],
      ['x', 'y', 'z'],
    ])
    const filas = parsearTablaConHeaderDetectable(
      buf,
      ['concepto', 'partida'],  // keywords que NO matchean
      { minMatches: 1 },
    )
    // Fallback: usa row 0 como header
    expect(filas.length).toBe(1)
    expect(filas[0]).toMatchObject({ Foo: 'x', Bar: 'y', Baz: 'z' })
  })

  it('respeta minMatches — exige N keywords mínimo', () => {
    const buf = makeXlsxBuffer([
      ['CALCULO DE RECURSOS'],         // 0 matches contra ['concepto', 'partida']
      ['concepto'],                     // 1 match — pero minMatches=2 lo rechaza
      ['partida', 'concepto', 'monto'], // 2 matches — válido
      ['1.1.1', 'Educación', 50000000],
    ])
    const filas = parsearTablaConHeaderDetectable(
      buf,
      ['concepto', 'partida'],
      { minMatches: 2 },
    )
    expect(filas.length).toBe(1)
    expect(filas[0]).toMatchObject({
      partida: '1.1.1',
      concepto: 'Educación',
      monto: 50000000,
    })
  })

  it('case-insensitive: keywords lowercase matchean headers UPPER/Mixed', () => {
    const buf = makeXlsxBuffer([
      ['INGRESOS TOTALES'],
      ['CONCEPTO', 'COD.', 'RECAUDACION'],
      ['x', 'y', 'z'],
    ])
    const filas = parsearTablaConHeaderDetectable(
      buf,
      ['concepto', 'recaudacion'],
      { minMatches: 2 },
    )
    expect(filas.length).toBe(1)
    expect(Object.keys(filas[0])).toContain('CONCEPTO')
  })

  it('XLSX vacío retorna array vacío sin crashear', () => {
    const buf = makeXlsxBuffer([])
    const filas = parsearTablaConHeaderDetectable(buf, ['x'], { minMatches: 1 })
    expect(filas).toEqual([])
  })
})

describe('parsearTabla — comportamiento base preservado', () => {
  it('lee XLSX simple con header en row 0', () => {
    const buf = makeXlsxBuffer([
      ['Concepto', 'Monto'],
      ['Personal', 100],
      ['Bienes', 50],
    ])
    const filas = parsearTabla(buf)
    expect(filas.length).toBe(2)
    expect(filas[0]).toMatchObject({ Concepto: 'Personal', Monto: 100 })
  })
})

describe('inferirAnioDesdeTitulo', () => {
  it('extrae 2024 de "Presupuesto - 2024"', () => {
    expect(inferirAnioDesdeTitulo('Presupuesto - 2024')).toBe(2024)
  })

  it('extrae 2018 de "Sueldos 2018-04"', () => {
    expect(inferirAnioDesdeTitulo('Sueldos 2018-04')).toBe(2018)
  })

  it('rechaza años fuera de rango razonable', () => {
    expect(inferirAnioDesdeTitulo('Documento 1850')).toBeNull()
    expect(inferirAnioDesdeTitulo('Sin fecha')).toBeNull()
  })
})

describe('inferirAnioMesDesdeTitulo', () => {
  it('extrae anio + mes de "Sueldos 2023-04"', () => {
    const r = inferirAnioMesDesdeTitulo('Sueldos 2023-04')
    expect(r).toEqual({ anio: 2023, mes: 4 })
  })

  it('extrae mes en español: "Boletín de abril 2022"', () => {
    const r = inferirAnioMesDesdeTitulo('Boletín de abril 2022')
    expect(r.anio).toBe(2022)
    expect(r.mes).toBe(4)
  })

  it('mes null si no encuentra', () => {
    const r = inferirAnioMesDesdeTitulo('Presupuesto 2025')
    expect(r).toEqual({ anio: 2025, mes: null })
  })
})
