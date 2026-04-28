// Tests para el pipeline OCR zero-cost.
//
// Estrategia:
//   - Test 1 valida que unpdf extrae texto de un PDF digital sintético creado
//     con pdf-lib. Confirma el path "fast" del decision tree (no necesita tesseract).
//   - Test 2 valida el parser regex sobre un texto crudo conocido — sin pasar
//     por PDF/OCR. Aisla la lógica de extracción de campos.
//   - Test 3 valida el pipeline end-to-end: PDF sintético → extraerBoletinZeroCost
//     → result con actos.length > 0 y metodoUsado definido.
//
// NOTA: tesseract NO se ejercita en tests automáticos. Crearlo requeriría
// renderizar un PNG con texto nítido y descargar el lenguaje 'spa' del CDN
// de tesseract.js — lento y frágil. El decision-tree se prueba con PDFs
// digitales (donde unpdf siempre resuelve, evitando el branch tesseract).

import { describe, expect, it } from 'vitest'
import { PDFDocument, StandardFonts } from 'pdf-lib'
import {
  extraerBoletinZeroCost,
  parsearActos,
  parseMontoARS,
  esTextoValido,
} from './ocr'

/**
 * Crea un PDF sintético con texto digital (no escaneado).
 * unpdf debe poder extraer texto de él sin necesidad de tesseract.
 */
async function crearPDFSintetico(textosPorPagina: string[]): Promise<Buffer> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const texto of textosPorPagina) {
    const page = doc.addPage([595, 842])  // A4
    const lineas = texto.split('\n')
    let y = 800
    for (const linea of lineas) {
      if (y < 50) break
      page.drawText(linea, { x: 50, y, size: 10, font })
      y -= 14
    }
  }
  const bytes = await doc.save()
  return Buffer.from(bytes)
}

describe('esTextoValido', () => {
  it('rechaza strings vacíos o demasiado cortos', () => {
    expect(esTextoValido('')).toBe(false)
    expect(esTextoValido('hola')).toBe(false)
  })

  it('rechaza texto con muchos chars raros (gibberish)', () => {
    // String de 200 chars donde ~70% son chars de control o glyphs raros
    const gibberish = '\x00\x01\x02\x03\x04\x05'.repeat(50) + 'word ' + 'x'.repeat(10)
    expect(esTextoValido(gibberish)).toBe(false)
  })

  it('acepta texto normal en español con acentos', () => {
    const txt = (
      'El Ministerio de Educación adjudicó la licitación pública número 123/2024 ' +
      'a la firma CONSTRUCCIONES DEL SUR S.R.L. por la suma de pesos un millón ' +
      'doscientos mil ($1.200.000,00). El expediente Nº EX-2024-001234 establece ' +
      'el plazo de ejecución y las condiciones contractuales. La presente resolución ' +
      'entrará en vigencia a partir de su publicación en el Boletín Oficial.'
    )
    expect(esTextoValido(txt)).toBe(true)
  })
})

describe('parseMontoARS', () => {
  it('parsea formato AR estándar', () => {
    expect(parseMontoARS('1.234.567,89')).toBeCloseTo(1234567.89)
    expect(parseMontoARS('500,00')).toBeCloseTo(500)
    expect(parseMontoARS('1.000')).toBeCloseTo(1000)
  })

  it('parsea formato US', () => {
    expect(parseMontoARS('1,234,567.89')).toBeCloseTo(1234567.89)
  })

  it('parsea sin separadores', () => {
    expect(parseMontoARS('1234567')).toBe(1234567)
  })

  it('retorna null para input inválido', () => {
    expect(parseMontoARS('abc')).toBeNull()
    expect(parseMontoARS('')).toBeNull()
  })

  it('limpia prefijos', () => {
    expect(parseMontoARS('$ 1.234,50')).toBeCloseTo(1234.5)
    expect(parseMontoARS('USD 1.000')).toBeCloseTo(1000)
  })
})

describe('parsearActos detecta CUIT, monto, expediente', () => {
  it('extrae campos de una resolución típica de Boletín', () => {
    const texto = (
      'RESOLUCIÓN N° 1234/2024\n' +
      'Expediente N° EX-2024-005678\n' +
      'VISTO la necesidad del MINISTERIO DE OBRAS PUBLICAS de contratar servicios ' +
      'de mantenimiento, ADJUDICAR a la firma CONSTRUCCIONES DEL SUR S.R.L. ' +
      '(CUIT 30-12345678-9) por la suma de $ 1.500.000,00.\n' +
      'Buenos Aires, 15/03/2024.'
    )
    const actos = parsearActos(texto, 1, 'pdf-text', 100)
    expect(actos.length).toBeGreaterThan(0)
    const a = actos[0]
    expect(a.tipoActo).toBe('Resolucion')
    expect(a.numeroActo).toBe('1234/2024')
    expect(a.numeroExpediente).toBe('EX-2024-005678')
    expect(a.cuit).toBe('30-12345678-9')
    expect(a.monto).toBeCloseTo(1500000)
    expect(a.fechaActo).toBe('2024-03-15')
    expect(a.proveedorRazonSocial).toMatch(/CONSTRUCCIONES DEL SUR/)
    expect(a.reparticion).toMatch(/MINISTERIO DE OBRAS/)
    expect(a.metodoExtraccion).toBe('pdf-text')
    expect(a.confidence).toBe(100)
    expect(a.pagina).toBe(1)
  })

  it('extrae DNI sin puntos', () => {
    const texto = (
      'DECRETO N° 567/2024\n' +
      'DESÍGNASE al señor Juan Pérez DNI 25123456 en el cargo de Director.\n'
    )
    const actos = parsearActos(texto, 5, 'pdf-text', 100)
    expect(actos.length).toBeGreaterThan(0)
    expect(actos[0].dni).toBe('25123456')
    expect(actos[0].tipoActo).toBe('Decreto')
    expect(actos[0].numeroActo).toBe('567/2024')
  })

  it('retorna array vacío para texto sin actos administrativos', () => {
    const texto = 'Lorem ipsum dolor sit amet, sin nada relevante para parsear.'
    const actos = parsearActos(texto, 1, 'pdf-text', 100)
    expect(actos.length).toBe(0)
  })

  it('crea acto sintético si hay CUIT pero ningún tipo de acto detectado', () => {
    const texto = 'Texto suelto con CUIT 20-87654321-3 y monto $500.000 pero sin tipo de acto.'
    const actos = parsearActos(texto, 1, 'pdf-text', 100)
    expect(actos.length).toBe(1)
    expect(actos[0].tipoActo).toBeNull()
    expect(actos[0].cuit).toBe('20-87654321-3')
  })
})

describe('extraerBoletinZeroCost end-to-end', () => {
  it('extrae texto de un PDF digital sintético y detecta actos', async () => {
    const pdfBuffer = await crearPDFSintetico([
      // Página 1
      'BOLETIN OFICIAL DE LA PROVINCIA DE CORDOBA\n' +
      'Edicion del 15/03/2024\n' +
      'RESOLUCION N° 1234/2024\n' +
      'Expediente N° EX-2024-005678\n' +
      'VISTO la necesidad del MINISTERIO DE OBRAS PUBLICAS\n' +
      'ADJUDICAR a la firma CONSTRUCCIONES DEL SUR S.R.L.\n' +
      '(CUIT 30-12345678-9) por la suma de $ 1.500.000,00.\n' +
      'Cordoba, 15/03/2024.\n' +
      'El presente acto entrara en vigencia a partir de su publicacion.\n' +
      'Firma: Director General.\n' +
      'Sello del Ministerio.\n' +
      // padding para superar 50 palabras
      'Adicional: la presente resolucion forma parte integrante del expediente y ' +
      'queda registrada en el libro correspondiente bajo el numero indicado para ' +
      'su consulta publica conforme a la normativa vigente en la materia.',
    ])

    const result = await extraerBoletinZeroCost(pdfBuffer)

    expect(result.totalPaginas).toBe(1)
    expect(result.metodoUsado).toBeDefined()
    // unpdf debe haber resuelto este PDF digital sin tesseract
    expect(result.metodoUsado).toBe('pdf-text')
    expect(result.hashPdf).toMatch(/^[a-f0-9]{64}$/)
    expect(result.costoEstimadoUSD).toBe(0)
    expect(result.duracionMs).toBeGreaterThan(0)

    // Debe haber detectado al menos 1 acto
    expect(result.actos.length).toBeGreaterThan(0)
    const acto = result.actos[0]
    expect(acto.tipoActo).toBe('Resolucion')
    expect(acto.cuit).toBe('30-12345678-9')
    expect(acto.metodoExtraccion).toBe('pdf-text')
  }, 30000)
})
