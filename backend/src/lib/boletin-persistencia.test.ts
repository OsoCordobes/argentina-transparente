import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { initDb, dbRun } from './db'
import {
  persistirExtractoBoletin,
  getActosPorPDF,
  countBoletinExtractos,
} from './boletin-persistencia'
import type { OCRBoletinResultZC } from './ocr'

describe('boletin-persistencia', () => {
  beforeAll(async () => {
    await initDb()
  })

  beforeEach(async () => {
    await dbRun(`DELETE FROM boletin_actos`)
    await dbRun(`DELETE FROM boletin_extractos`)
    await dbRun(`DELETE FROM quarantine`)
    await dbRun(`DELETE FROM snapshots`)
  })

  const sampleResultado = (overrides?: Partial<OCRBoletinResultZC>): OCRBoletinResultZC => ({
    hashPdf: 'a'.repeat(64),
    totalPaginas: 5,
    metodoUsado: 'pdf-text',
    textoCompleto: 'Texto del boletín completo...',
    actos: [
      {
        pagina: 1,
        tipoActo: 'Resol',
        numeroActo: '123/2024',
        numeroExpediente: 'EX-2024-001234',
        fechaActo: '2024-03-15',
        cuit: '30-12345678-9',
        dni: null,
        proveedorRazonSocial: 'ROGGIO S.A.',
        reparticion: 'MIN. SALUD',
        monto: 1500000,
        textoCrudo: 'Adjudicar a Roggio...',
        metodoExtraccion: 'pdf-text',
        confidence: 100,
      },
    ],
    paginasProblemAticas: [],
    duracionMs: 100,
    costoEstimadoUSD: 0,
    ...overrides,
  })

  it('persistirExtractoBoletin inserta extracto y actos', async () => {
    const r = await persistirExtractoBoletin(sampleResultado(), {
      jurisdiccion: 'cordoba-capital',
      fuenteUrl: 'https://ex/1.pdf',
    })
    expect(r.hashPdf).toBeDefined()
    expect(r.actosInsertados).toBe(1)
    expect(r.actosQuarantined).toBe(0)
    expect(await countBoletinExtractos()).toBe(1)
    const actos = await getActosPorPDF('a'.repeat(64))
    expect(actos.length).toBe(1)
    expect(actos[0].cuit).toBe('30-12345678-9')
  })

  it('actos sin CUIT NI DNI van a quarantine (default)', async () => {
    const r = await persistirExtractoBoletin(
      sampleResultado({
        actos: [{
          pagina: 1,
          tipoActo: 'Resol',
          numeroActo: '999',
          numeroExpediente: null,
          fechaActo: null,
          cuit: null,
          dni: null,
          proveedorRazonSocial: null,
          reparticion: null,
          monto: null,
          textoCrudo: 'malformed',
          metodoExtraccion: 'pdf-text',
          confidence: 80,
        }],
      }),
      { jurisdiccion: 'cordoba-capital', fuenteUrl: 'https://ex/2.pdf' },
    )
    expect(r.actosInsertados).toBe(0)
    expect(r.actosQuarantined).toBe(1)
    const actos = await getActosPorPDF('a'.repeat(64))
    expect(actos.length).toBe(0)
  })

  it('Decreto sin CUIT/DNI NO va a quarantine (es normativo)', async () => {
    const r = await persistirExtractoBoletin(
      sampleResultado({
        actos: [{
          pagina: 1,
          tipoActo: 'Decreto',
          numeroActo: '500/2024',
          numeroExpediente: null,
          fechaActo: '2024-04-01',
          cuit: null,
          dni: null,
          proveedorRazonSocial: null,
          reparticion: 'PODER EJECUTIVO',
          monto: null,
          textoCrudo: 'DECRETO Nº 500/2024 — Apruébase...',
          metodoExtraccion: 'pdf-text',
          confidence: 100,
        }],
      }),
      { jurisdiccion: 'cordoba-capital', fuenteUrl: 'https://ex/3.pdf' },
    )
    expect(r.actosInsertados).toBe(1)
    expect(r.actosQuarantined).toBe(0)
  })

  it('re-correr con mismo hash actualiza pero no duplica (UPSERT extracto, IGNORE actos dup)', async () => {
    await persistirExtractoBoletin(sampleResultado(), {
      jurisdiccion: 'cordoba-capital',
      fuenteUrl: 'https://ex/1.pdf',
    })
    const r2 = await persistirExtractoBoletin(sampleResultado(), {
      jurisdiccion: 'cordoba-capital',
      fuenteUrl: 'https://ex/1.pdf',
    })
    expect(r2.actosInsertados).toBe(0) // todos dup
    expect(r2.actosDuplicados).toBe(1)
    expect(await countBoletinExtractos()).toBe(1)
  })
})
