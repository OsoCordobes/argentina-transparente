import { describe, expect, it } from 'vitest'
import { mapearAPublicacion } from './boletin-cordoba-csv'

describe('mapearAPublicacion — descarte de fechas inválidas', () => {
  const baseFila = {
    'Nº de Boletín': 3000,
    'Tipo de Instrumento': 'Decreto',
    'Número': '123',
    'Expediente': '456',
    'Asunto': 'Adjudicación de obra',
    'Ámbito': 'Departamento Ejecutivo',
    'Impresión': 'Completo',
  } as const

  it('serial Excel válido (2017-12-30) se convierte correctamente', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': 43099,  // 2017-12-24
      'Fecha de Aprobación': 43099,
    }, 1)
    expect(p).not.toBeNull()
    expect(p!.FechaPublicacion.slice(0, 4)).toBe('2017')
  })

  it('serial 0 (vacío en Excel) descarta la fila', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': 0,
      'Fecha de Aprobación': 0,
    }, 1)
    expect(p).toBeNull()
  })

  it('serial 1 (representaría 1899-12-31) descarta la fila', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': 1,
      'Fecha de Aprobación': 1,
    }, 1)
    expect(p).toBeNull()
  })

  it('null en ambas fechas descarta la fila', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': null as unknown as number,
      'Fecha de Aprobación': null as unknown as number,
    }, 1)
    expect(p).toBeNull()
  })

  it('formato DD/MM/YYYY se acepta', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': '15/06/2018',
      'Fecha de Aprobación': '15/06/2018',
    }, 1)
    expect(p).not.toBeNull()
    expect(p!.FechaPublicacion.slice(0, 10)).toBe('2018-06-15')
  })

  it('formato ISO YYYY-MM-DD se acepta', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': '2018-06-15',
      'Fecha de Aprobación': '2018-06-15',
    }, 1)
    expect(p).not.toBeNull()
    expect(p!.FechaPublicacion.slice(0, 10)).toBe('2018-06-15')
  })

  it('fecha de aprobación inválida pero publicación válida → usa publicación', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': 43099,
      'Fecha de Aprobación': 0,
    }, 1)
    expect(p).not.toBeNull()
    expect(p!.FechaPublicacion.slice(0, 4)).toBe('2017')
    expect(p!.FechaSancion.slice(0, 4)).toBe('2017')
  })

  it('año fuera de rango (1989) descarta', () => {
    const p = mapearAPublicacion({
      ...baseFila,
      'Fecha de Publicación': '15/06/1989',
      'Fecha de Aprobación': '15/06/1989',
    }, 1)
    expect(p).toBeNull()
  })
})
