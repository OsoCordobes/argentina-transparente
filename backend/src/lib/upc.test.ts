// Tests para los parsers del conector UPC (Universidad Provincial de Córdoba).
// Cero HTTP calls — todas las funciones son puras sobre strings.

import { describe, expect, it } from 'vitest'
import {
  TITULO_RE,
  extraerTipo,
  extraerNumero,
  extraerMonto,
  extraerProveedor,
} from './upc'

describe('TITULO_RE — filtro de relevancia en título', () => {
  it('detecta "Licitación" (con tilde)', () => {
    expect(TITULO_RE.test('Licitación Pública N° 5/2025 destinada a equipamiento')).toBe(true)
  })

  it('detecta "Licitacion" (sin tilde)', () => {
    expect(TITULO_RE.test('Licitacion Privada Nro. 2/2024')).toBe(true)
  })

  it('detecta "Compra Directa"', () => {
    expect(TITULO_RE.test('Compra Directa para adquisición de insumos')).toBe(true)
  })

  it('detecta "Concurso de Precios"', () => {
    expect(TITULO_RE.test('Concurso de Precios N° 1/2023')).toBe(true)
  })

  it('detecta "Contratación Directa"', () => {
    expect(TITULO_RE.test('Contratación Directa servicio de limpieza')).toBe(true)
  })

  it('NO detecta posts de eventos institucionales', () => {
    expect(TITULO_RE.test('Acto de colación 2025 de la UPC')).toBe(false)
  })

  it('NO detecta posts de becas', () => {
    expect(TITULO_RE.test('Se lanzan las Becas Raíces para estudiantes UPC')).toBe(false)
  })

  it('NO detecta posts de noticias generales', () => {
    expect(TITULO_RE.test('La UPC firma convenio con el Ministerio de Educación')).toBe(false)
  })
})

describe('extraerTipo — clasifica tipo de proceso desde título', () => {
  it('licitación pública con tilde', () => {
    expect(extraerTipo('Licitación Pública N° 5/2025 equipamiento mobiliario')).toBe('Licitación Pública')
  })

  it('licitación pública sin tilde', () => {
    expect(extraerTipo('Licitacion Publica N° 3/2024 servicio de limpieza')).toBe('Licitación Pública')
  })

  it('licitación privada', () => {
    expect(extraerTipo('Licitación Privada Nro. 1/2025 para mantenimiento')).toBe('Licitación Privada')
  })

  it('compra directa', () => {
    expect(extraerTipo('Compra Directa para adquisición de insumos informáticos')).toBe('Compra Directa')
  })

  it('concurso de precios', () => {
    expect(extraerTipo('Concurso de Precios N° 2/2024 impresión de materiales')).toBe('Concurso de Precios')
  })

  it('contratación directa con tilde', () => {
    expect(extraerTipo('Contratación Directa servicio de fumigación 2023')).toBe('Contratación Directa')
  })

  it('adjudicación en título que también menciona licitación → prioriza licitación pública', () => {
    // "Adjudicación Licitación Pública 6/2025" → el tipo de proceso es LP, no la acción
    expect(extraerTipo('Adjudicación Licitación Pública 6/2025')).toBe('Licitación Pública')
  })

  it('adjudicación sin otro tipo → tipo Adjudicación', () => {
    expect(extraerTipo('Adjudicación contrato servicio de seguridad')).toBe('Adjudicación')
  })

  it('sin clasificar cuando no hay keyword reconocido', () => {
    expect(extraerTipo('Resolución Rectoral sobre convenio marco')).toBe('Sin clasificar')
  })
})

describe('extraerNumero — número de licitación desde título', () => {
  it('formato N° X/YYYY', () => {
    expect(extraerNumero('Licitación Pública N° 5/2025 equipamiento mobiliario')).toBe('5/2025')
  })

  it('formato Nro. X/YYYY', () => {
    expect(extraerNumero('Licitación Pública Nro. 2/2024 servicio')).toBe('2/2024')
  })

  it('formato N° XX/YYYY (dos dígitos)', () => {
    expect(extraerNumero('Licitación Privada N° 10/2023')).toBe('10/2023')
  })

  it('formato N.° X/YYYY (punto antes de grado)', () => {
    expect(extraerNumero('Concurso de Precios N.° 001/2025')).toBe('001/2025')
  })

  it('devuelve null cuando no hay número', () => {
    expect(extraerNumero('Licitación Pública para equipamiento de sedes')).toBeNull()
  })

  it('devuelve null para posts sin licitación numerada', () => {
    expect(extraerNumero('Becas Raíces 2025 convocatoria')).toBeNull()
  })
})

describe('extraerMonto — solo cifras explícitas en HTML', () => {
  it('extrae monto con $ y puntos como separador de miles (formato AR)', () => {
    const html = '<p>La propuesta deberá ser por un monto de $4.500.000 pesos.</p>'
    expect(extraerMonto(html)).toBe(4500000)
  })

  it('extrae monto con $ y espacio', () => {
    const html = '<p>El contrato es por $ 1.200.000</p>'
    expect(extraerMonto(html)).toBe(1200000)
  })

  it('extrae monto con formato decimal AR (coma=decimal)', () => {
    const html = '<p>Monto total: $2.345.678,90 pesos argentinos</p>'
    expect(extraerMonto(html)).toBe(2345678.90)
  })

  it('NO extrae estimaciones vagas (no hay cifra explícita)', () => {
    // "inversión superior a los 4 mil millones" — no hay $ con número exacto
    const html = '<p>inversión inicial superior a los 4 mil millones de pesos</p>'
    expect(extraerMonto(html)).toBe(0)
  })

  it('devuelve 0 cuando no hay montos en el HTML', () => {
    const html = '<p>La UPC llama a licitación para equipamiento de sedes universitarias.</p>'
    expect(extraerMonto(html)).toBe(0)
  })

  it('devuelve el monto más grande cuando hay múltiples cifras (presupuesto oficial)', () => {
    const html = '<p>Monto base $100.000. Monto total $2.000.000.</p>'
    expect(extraerMonto(html)).toBe(2000000)
  })

  it('ignora HTML tags y extrae del texto limpio', () => {
    const html = '<strong>Precio: $<span>3.456.789</span></strong>'
    expect(extraerMonto(html)).toBe(3456789)
  })
})

describe('extraerProveedor — solo cuando está en contexto de adjudicación', () => {
  it('extrae proveedor con "se adjudica a"', () => {
    const html = '<p>Se adjudica a CONSTRUCTORA DEL NORTE S.A. la obra según resolución.</p>'
    const resultado = extraerProveedor(html)
    expect(resultado).toContain('CONSTRUCTORA DEL NORTE S.A.')
    expect(resultado).not.toBe('')
  })

  it('extrae proveedor con "adjudicado a"', () => {
    const html = '<p>El contrato fue adjudicado a ROGGIO S.A. conforme al pliego.</p>'
    const resultado = extraerProveedor(html)
    expect(resultado).toContain('ROGGIO')
    expect(resultado.length).toBeGreaterThan(0)
  })

  it('devuelve string vacío cuando no hay contexto de adjudicación', () => {
    const html = '<p>La UPC llama a licitación pública para equipamiento mobiliario.</p>'
    expect(extraerProveedor(html)).toBe('')
  })

  it('devuelve string vacío para posts solo de anuncio de apertura', () => {
    const html = '<p>Las ofertas deberán presentarse el día 12 de diciembre de 2025.</p>'
    expect(extraerProveedor(html)).toBe('')
  })

  it('limita la longitud del proveedor a 120 chars', () => {
    const nombreLargo = 'A'.repeat(200)
    const html = `<p>Se adjudica a ${nombreLargo} según decreto.</p>`
    const resultado = extraerProveedor(html)
    expect(resultado.length).toBeLessThanOrEqual(120)
  })
})
