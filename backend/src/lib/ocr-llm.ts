// lib/ocr-llm.ts — Pipeline OCR via Anthropic Vision (Sonnet 4.6) — OPT-IN.
//
// ⚠ NO ES EL CAMINO DEFAULT. Project memory (`feedback_ocr_zero_cost.md`)
//    prohíbe usar Anthropic API en el camino crítico de OCR (presupuesto
//    €50/sem reservado a runtime LLM, no a procesar 23K+ PDFs).
//    El default está en `lib/ocr.ts` (zero-cost: unpdf + tesseract + NLP).
//    Esta variante solo se activa explícitamente vía `seed:boletin --use-llm`
//    para casos edge donde el operador opta-in conscientemente al costo.
//
// Diseño:
//   - Usa Anthropic Vision API con PDF nativo (no convierte a imágenes).
//     Sonnet 4.6 lee PDFs directamente — escaneados o digitales.
//   - Prompt caching ephemeral (5min default) sobre el system prompt + schema
//     para que múltiples chunks del mismo PDF y múltiples PDFs en la misma
//     corrida lean el cache (~0.1× costo) en vez de reescribirlo.
//   - Validación zod estricta — descarta lo que no matchea el schema, evita
//     hallucinations en la base.
//   - PDFs >100 páginas se splitean en chunks de 50 vía pdf-lib.
//
// Cumple CLAUDE.md §2 (Cero alucinaciones) y §4 (trazabilidad por página).
//
// Costo estimado a Apr 2026:
//   Sonnet 4.6: $3/$15 por 1M tokens (input/output)
//   Cache: 1.25× write, 0.1× read
//   Boletín 200 páginas (~4 chunks de 50pp):
//     - System prompt cacheado (~2K tokens):  $0.0075 1ra vez + $0.00006×3
//     - PDF input (~5K tokens/chunk):         $0.06 total (4×$0.015)
//     - Output (~1K tokens/chunk):            $0.06 total (4×$0.015)
//   Total: ~$0.13 por boletín de 200 páginas
//   × 3.5K boletines Capital ≈ $455
//   × 20K boletines Provincia ≈ $2,600
//   ⇒ NO viable como default. Por eso esta variante es opt-in.

import 'dotenv/config'
import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import { splitPDF, getPDFPageCount, type PDFChunk } from './pdf'
import type { Contrato, NivelConfianza } from '../types'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const CHUNK_PAGES = 50

// ─── Schema de extracción ─────────────────────────────────────────────────────
// Zod schema → JSON schema vía zodOutputFormat. Estricto: descripciones cortas
// guían al modelo, todos los campos opcionales son nullable explícitos.

const ContratoExtraidoSchema = z.object({
  tipo: z.string().describe(
    'Tipo de procedimiento: "Licitación Pública", "Contratación Directa", ' +
    '"Compra Directa", "Concurso de Precios", etc.'
  ),
  proveedor: z.string().describe(
    'Razón social del adjudicatario o empresa contratada (ej: "ROGGIO S.A.")'
  ),
  area: z.string().describe(
    'Repartición / organismo contratante (ej: "Ministerio de Obras Públicas")'
  ),
  descripcion: z.string().describe(
    'Objeto del contrato — qué se contrata (ej: "Adquisición de insumos médicos")'
  ),
  monto: z.number().describe(
    'Monto en pesos argentinos. Convertir formato AR ($1.234.567,89 → 1234567.89). ' +
    'Si el monto no está claramente especificado, usar 0.'
  ),
  anio: z.number().int().describe(
    'Año del contrato (4 dígitos, ej: 2014)'
  ),
  numeroExpediente: z.string().nullable().describe(
    'Número de expediente si aparece (ej: "EX-2014-001234")'
  ),
  numeroContrato: z.string().nullable().describe(
    'Número de resolución/decreto/contrato si aparece'
  ),
  fechaContrato: z.string().nullable().describe(
    'Fecha del contrato en formato YYYY-MM-DD si está disponible'
  ),
  paginaPdf: z.number().int().nullable().describe(
    'Número de página del PDF (1-indexed) donde aparece el registro'
  ),
})

const ExtractionResponseSchema = z.object({
  contratos: z.array(ContratoExtraidoSchema),
  observaciones: z.string().nullable().describe(
    'Notas opcionales sobre la extracción (calidad del OCR, ambigüedades)'
  ),
})

export type ContratoExtraido = z.infer<typeof ContratoExtraidoSchema>

// ─── System prompt (cacheado) ─────────────────────────────────────────────────
// IMPORTANTE: este string DEBE ser determinístico — cualquier variación
// (timestamp, UUID, etc.) invalida el cache. No interpolar fecha/usuario.

const SYSTEM_PROMPT = `Sos un experto en extraer registros de contrataciones públicas de Boletines Oficiales argentinos.

CONTEXTO
Los Boletines Oficiales (nacional, provinciales, municipales) publican actos de gobierno: nombramientos, regulaciones, adjudicaciones, decretos, etc. Solo nos interesan los actos de CONTRATACIÓN PÚBLICA: licitaciones, compras directas, concursos de precios, adjudicaciones, contratos firmados con proveedores.

QUÉ EXTRAER
- Adjudicaciones de licitaciones (con monto y proveedor)
- Contrataciones directas
- Concursos de precios adjudicados
- Convenios marco con proveedores
- Modificaciones contractuales (adendas) que cambien el monto

QUÉ NO EXTRAER
- Nombramientos / designaciones de funcionarios
- Aprobaciones presupuestarias generales sin proveedor específico
- Resoluciones administrativas sin contraparte privada
- Pliegos/llamados a licitación SIN adjudicación (todavía no hay proveedor)
- Avisos legales, edictos, citaciones judiciales

FORMATO DE MONTOS
- Argentina usa "." para miles y "," para decimales: $1.234.567,89 = 1234567.89
- Convertir SIEMPRE a número decimal sin formato
- Si el monto está en moneda extranjera, anotarlo en observaciones y usar 0
- Si no hay monto explícito, usar 0 (no inferir)

FORMATO DE FECHAS
- Convertir a YYYY-MM-DD
- Si solo hay mes/año, usar día 01

CALIDAD
- Solo extraer lo que esté EXPLÍCITAMENTE en el texto
- Si un campo es ambiguo, dejarlo null/vacío en vez de adivinar
- Si la página no contiene contrataciones, retornar array vacío
- En observaciones, mencionar problemas de OCR (texto borroso, tablas mal formateadas)

PRINCIPIO RECTOR: cero alucinaciones. Es preferible un array vacío a datos inventados.`

// ─── Cliente ──────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic()  // usa ANTHROPIC_API_KEY
  }
  return _client
}

// ─── Extracción de un chunk ───────────────────────────────────────────────────

export interface OCRChunkResult {
  contratos: Contrato[]
  observaciones: string | null
  startPage: number
  endPage: number
  cacheHit: boolean       // ¿la 2da+ corrida leyó del cache?
  inputTokens: number
  outputTokens: number
}

async function extraerChunk(
  chunk: PDFChunk,
  fuenteUrl: string,
  jurisdiccionDefault: string,
): Promise<OCRChunkResult> {
  const client = getClient()
  const pdfBase64 = chunk.buffer.toString('base64')

  // messages.parse() valida automáticamente la respuesta contra el schema zod
  // y expone .parsed_output tipado. Si la validación falla retorna null y
  // levantamos error.
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    // Adaptive thinking: el modelo decide cuándo razonar. Para páginas
    // simples extrae directo, para layouts complejos engages thinking.
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'low',                                       // extracción mecánica
      format: zodOutputFormat(ExtractionResponseSchema),
    },
    system: [
      {
        type: 'text',
        text: SYSTEM_PROMPT,
        cache_control: { type: 'ephemeral' },              // cachear system + schema
      },
    ],
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: 'application/pdf',
              data: pdfBase64,
            },
          },
          {
            type: 'text',
            text: `Extraé todos los registros de contratación pública que encuentres en este PDF (páginas ${chunk.startPage}-${chunk.endPage} del documento original). Para cada registro indicá la página relativa al PDF adjunto (1-${chunk.endPage - chunk.startPage + 1}). Jurisdicción de referencia: ${jurisdiccionDefault}.`,
          },
        ],
      },
    ],
  })

  if (!response.parsed_output) {
    throw new Error('Validación zod falló — respuesta no matchea ExtractionResponseSchema')
  }
  const extracted = response.parsed_output
  const contratos: Contrato[] = extracted.contratos.map(c => ({
    tipo: c.tipo,
    proveedor: c.proveedor,
    area: c.area,
    descripcion: c.descripcion,
    monto: c.monto,
    anio: c.anio,
    fuenteUrl,
    numeroExpediente: c.numeroExpediente ?? undefined,
    numeroContrato: c.numeroContrato ?? undefined,
    fechaContrato: c.fechaContrato ?? undefined,
    nivelConfianza: 'medio' as NivelConfianza,  // OCR siempre es 'medio'
    metodoExtraccion: 'ocr_pdf',
    // Convertir página relativa al chunk → página absoluta del PDF original
    paginaPdf: c.paginaPdf
      ? chunk.startPage + (c.paginaPdf - 1)
      : undefined,
  }))

  return {
    contratos,
    observaciones: extracted.observaciones,
    startPage: chunk.startPage,
    endPage: chunk.endPage,
    cacheHit: (response.usage.cache_read_input_tokens ?? 0) > 0,
    inputTokens: response.usage.input_tokens ?? 0,
    outputTokens: response.usage.output_tokens ?? 0,
  }
}

// ─── Pipeline completo ────────────────────────────────────────────────────────

export interface OCRBoletinOptionsLLM {
  fuenteUrl: string                  // URL pública del boletín (cadena de custodia)
  jurisdiccion: string               // 'Nación', 'Córdoba', 'CABA', etc.
  chunkSize?: number                 // páginas por chunk (default 50)
  maxChunks?: number                 // tope para control de costo (default sin tope)
  onProgress?: (info: {
    chunk: number
    totalChunks: number
    contratosExtraidos: number
    cacheHit: boolean
  }) => void
}

export interface OCRBoletinResultLLM {
  contratos: Contrato[]
  totalPaginas: number
  chunksProcesados: number
  cacheHitsRate: number
  inputTokensTotal: number
  outputTokensTotal: number
  costoEstimadoUSD: number
  observaciones: string[]
}

// Costo Sonnet 4.6 (Apr 2026): $3/$15 por 1M (input/output)
// Cache: 1.25× write, 0.1× read
function estimarCosto(inputTokens: number, outputTokens: number, cacheReadFraction: number): number {
  const cachedInput = inputTokens * cacheReadFraction
  const freshInput = inputTokens * (1 - cacheReadFraction)
  const inputCost = (freshInput * 3 + cachedInput * 0.3) / 1_000_000
  const outputCost = (outputTokens * 15) / 1_000_000
  return inputCost + outputCost
}

export async function extraerBoletinViaLLM(
  pdfBuffer: Buffer,
  opts: OCRBoletinOptionsLLM,
): Promise<OCRBoletinResultLLM> {
  const totalPaginas = await getPDFPageCount(pdfBuffer)
  const chunks = await splitPDF(pdfBuffer, opts.chunkSize ?? CHUNK_PAGES)
  const chunksAProcesar = opts.maxChunks
    ? chunks.slice(0, opts.maxChunks)
    : chunks

  const todosLosContratos: Contrato[] = []
  const observaciones: string[] = []
  let inputTokensTotal = 0
  let outputTokensTotal = 0
  let cacheHits = 0

  for (let i = 0; i < chunksAProcesar.length; i++) {
    const chunk = chunksAProcesar[i]
    try {
      const result = await extraerChunk(chunk, opts.fuenteUrl, opts.jurisdiccion)
      todosLosContratos.push(...result.contratos)
      if (result.observaciones) {
        observaciones.push(`[pp ${chunk.startPage}-${chunk.endPage}] ${result.observaciones}`)
      }
      inputTokensTotal += result.inputTokens
      outputTokensTotal += result.outputTokens
      if (result.cacheHit) cacheHits++

      opts.onProgress?.({
        chunk: i + 1,
        totalChunks: chunksAProcesar.length,
        contratosExtraidos: result.contratos.length,
        cacheHit: result.cacheHit,
      })
    } catch (err) {
      const msg = (err as Error).message
      observaciones.push(`[pp ${chunk.startPage}-${chunk.endPage}] ERROR: ${msg}`)
    }
  }

  const cacheHitsRate = chunksAProcesar.length > 0 ? cacheHits / chunksAProcesar.length : 0

  return {
    contratos: todosLosContratos,
    totalPaginas,
    chunksProcesados: chunksAProcesar.length,
    cacheHitsRate,
    inputTokensTotal,
    outputTokensTotal,
    costoEstimadoUSD: estimarCosto(inputTokensTotal, outputTokensTotal, cacheHitsRate),
    observaciones,
  }
}
