// Tests para los guardrails anti-hallucination del extractor.
// Crítico: cualquier proveedor/monto que pase debe ser TRACEABLE al Asunto.

import { describe, expect, it } from 'vitest'
import { apareceLiteralmente, montoApareceEnAsunto } from './extractor-norma'

describe('apareceLiteralmente — guardrail proveedor', () => {
  it('match exacto', () => {
    expect(apareceLiteralmente(
      'CONSTRUCCIONES DEL SUR S.R.L.',
      'Se adjudica a CONSTRUCCIONES DEL SUR S.R.L. la obra de pavimentación.'
    )).toBe(true)
  })

  it('case-insensitive', () => {
    expect(apareceLiteralmente(
      'Roggio S.A.',
      'Adjudicación a la firma ROGGIO S.A. para...'
    )).toBe(true)
  })

  it('tolera puntuación distinta', () => {
    expect(apareceLiteralmente(
      'Empresa SRL',
      'Adjudicación a la firma EMPRESA S.R.L. de...'
    )).toBe(true)  // "empresa srl" matchea palabra por palabra
  })

  it('tolera diacríticos', () => {
    expect(apareceLiteralmente(
      'PAVIMENTACIÓN ARGENTINA S.A.',
      'Se contrata a Pavimentacion Argentina SA para obras viales'
    )).toBe(true)
  })

  it('detecta hallucination — proveedor que NO está en el Asunto', () => {
    expect(apareceLiteralmente(
      'CONSTRUCTORA INVENTADA S.A.',
      'Adjudicación a la firma ROGGIO S.A. para obras de pavimentación.'
    )).toBe(false)
  })

  it('detecta hallucination — proveedor parcialmente correcto pero distinto', () => {
    expect(apareceLiteralmente(
      'BANCO SANTANDER',
      'Convenio con BANCO MACRO para acreditación de haberes'
    )).toBe(false)
  })

  it('rechaza strings demasiado cortos (false positive prevention)', () => {
    expect(apareceLiteralmente('SA', 'cualquier texto')).toBe(false)
  })

  it('rechaza string vacío o asunto vacío', () => {
    expect(apareceLiteralmente('', 'algo')).toBe(false)
    expect(apareceLiteralmente('Roggio S.A.', '')).toBe(false)
  })

  it('match laxo cuando Claude completa siglas', () => {
    // Claude devuelve "EMPRESA TRANSPORTES SA" pero Asunto dice "EMPRESA TRANSPORTES"
    expect(apareceLiteralmente(
      'EMPRESA TRANSPORTES SA',
      'Adjudicación a EMPRESA TRANSPORTES por servicios de logística'
    )).toBe(true)
  })

  it('múltiples palabras significativas — todas deben aparecer', () => {
    expect(apareceLiteralmente(
      'CONSTRUCTORA HORMIGON DEL SUR',
      'Decreto sobre HORMIGON estructural'  // falta CONSTRUCTORA y DEL SUR
    )).toBe(false)
  })
})

describe('montoApareceEnAsunto — guardrail monto', () => {
  it('match exacto sin separadores', () => {
    expect(montoApareceEnAsunto(1234567, 'por la suma de 1234567 pesos')).toBe(true)
  })

  it('match con formato AR (puntos como separadores)', () => {
    expect(montoApareceEnAsunto(1234567.89, 'por $ 1.234.567,89')).toBe(true)
  })

  it('match con formato AR sin decimales', () => {
    expect(montoApareceEnAsunto(50000, 'monto: $ 50.000.-')).toBe(true)
  })

  it('detecta hallucination — monto inventado', () => {
    expect(montoApareceEnAsunto(
      999999,
      'Adjudicación por $ 1.234.567,89'
    )).toBe(false)
  })

  it('match parcial para montos millonarios (primeros dígitos significativos)', () => {
    // Claude puede haber redondeado el último dígito
    expect(montoApareceEnAsunto(
      1234500,
      'por la suma de pesos un millón doscientos treinta y cuatro mil quinientos ($ 1.234.500)'
    )).toBe(true)
  })

  it('monto=0 siempre pasa (caso "sin monto")', () => {
    expect(montoApareceEnAsunto(0, 'cualquier texto')).toBe(true)
  })

  it('detecta cifras totalmente distintas', () => {
    expect(montoApareceEnAsunto(
      75000,
      'Adjudicación por $ 12.000 mensuales'
    )).toBe(false)
  })
})
