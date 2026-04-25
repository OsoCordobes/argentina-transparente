// lib/extractor-norma.ts — Extracción de Contratos desde texto estructurado
// (campo "Asunto" + metadata) usando Claude Sonnet 4.6 texto-only.
//
// Mucho más barato que OCR de PDFs:
//   - Vision API (PDF): ~$0.04 por página
//   - Texto only:        ~$0.0001 por norma con cache hit
//
// Diseño: batch de hasta N normas por request para amortizar costo del
// system prompt cacheado. El system prompt + schema cachean en cada request
// (cache_control ephemeral 5min), lectura ~0.1× costo en requests subsiguientes.

import Anthropic from '@anthropic-ai/sdk'
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod'
import { z } from 'zod'
import type { Contrato, NivelConfianza } from '../types'
import type { PublicacionPlana } from './boletin-cordoba-api'

const MODEL = 'claude-sonnet-4-6'
const MAX_TOKENS = 8192
const NORMAS_POR_REQUEST = 20  // batch para amortizar costo

// ─── Schema (zod, mismo shape que ContratoExtraidoSchema de OCR) ─────────────

// Schema reducido — solo los campos donde es inevitable usar el LLM.
// Todo lo demás (descripcion, area, fechas, expediente, fuente) se toma
// VERBATIM del API para evitar hallucinations.
const ContratoEnNormaSchema = z.object({
  indice: z.number().int().describe('Índice (0-based) de la norma en la lista de entrada'),
  esContrato: z.boolean().describe(
    'true SOLO si el Asunto contiene LITERALMENTE: (a) un proveedor identificable y (b) un objeto contractual claro. ' +
    'false en cualquier caso de duda.'
  ),
  tipo: z.string().describe(
    'Clasificación del procedimiento. Valores: "Licitación Pública" | "Licitación Privada" | ' +
    '"Contratación Directa" | "Concurso de Precios" | "Compra Directa" | "Adjudicación" | ' +
    '"Convenio" | "Ampliación de contrato" | "Prórroga" | "Rescisión" | "Sin clasificar"'
  ),
  proveedor: z.string().describe(
    'Razón social/nombre del contratista TEXTUAL del Asunto. ' +
    'NO normalizar siglas ni nombres. Vacío si no aparece literalmente.'
  ),
  monto: z.number().describe(
    'Monto en pesos argentinos. DEBE aparecer como cifra explícita en el Asunto. ' +
    'Formato AR: "$1.234.567,89" → 1234567.89. Si no aparece cifra explícita: 0.'
  ),
  fechaContrato: z.string().nullable().describe('YYYY-MM-DD usando FechaSancion como default'),
})

const ResponseSchema = z.object({
  resultados: z.array(ContratoEnNormaSchema),
})

// ─── System prompt (cacheado) ─────────────────────────────────────────────────
// IMPORTANTE: determinístico (cualquier variación invalida el cache).

const SYSTEM_PROMPT = `Sos un experto en extraer contrataciones públicas del Boletín Oficial de la Municipalidad de Córdoba (Argentina).

REGLA SUPREMA — TRAZABILIDAD ABSOLUTA
Toda información extraída DEBE aparecer LITERALMENTE en el campo Asunto de la norma. PROHIBIDO:
- Inferir o adivinar datos no presentes
- Completar siglas (ej: "S.A." si en el texto solo dice "S")
- Normalizar nombres ("ROGGIO SA" → "Roggio S.A.")
- Calcular montos no escritos (ej: si dice "$5000 c/u por 10 unidades", NO devolver $50000)
- Inventar tipos de contratación cuando no están claros

Si tenés CUALQUIER duda, marcá esContrato: false. Es preferible omitir que inventar.

CONTEXTO
Recibís un batch de normas (decretos, resoluciones, ordenanzas) ya parcialmente estructuradas. Cada norma tiene: TipoNorma, Reparticion, NormaNumero, FechaSancion, FechaPublicacion, ExpedienteNumero, Asunto. El Asunto es texto libre.

QUÉ EXTRAER
Solo cuando la norma describa una CONTRATACIÓN PÚBLICA con TODOS estos elementos LITERALES en el Asunto:
- Un proveedor/contratista identificable (razón social, persona física, o cooperativa) mencionado por nombre
- Un objeto de contratación claro

Tipos válidos:
- Licitaciones (públicas o privadas) adjudicadas
- Contrataciones directas
- Concursos de precios adjudicados
- Compras directas
- Convenios marco con proveedores específicos
- Convenios urbanísticos / fideicomisos con privados nombrados
- Ampliaciones / prórrogas / rescisiones donde se nombre al contratista

QUÉ NO EXTRAER (esContrato: false)
- Convocatorias a licitación SIN adjudicación (no hay proveedor todavía)
- Reglamentaciones generales sin contraparte privada
- Designaciones de funcionarios
- Aprobaciones presupuestarias generales
- Resoluciones administrativas internas
- Normas que mencionen contratos pero sin nombre de proveedor

CAMPOS A EXTRAER

proveedor: copiar TEXTUAL del Asunto. Si el Asunto dice "se adjudica a la empresa CONSTRUCCIONES DEL SUR S.R.L.", devolver "CONSTRUCCIONES DEL SUR S.R.L." (no completar siglas, no normalizar). Si aparecen varias empresas, usar la primera adjudicataria.

monto: número en pesos argentinos.
- "." separa miles, "," separa decimales: $1.234.567,89 = 1234567.89
- DEBE aparecer literalmente como cifra en el Asunto
- Si el Asunto NO contiene una cifra explícita, devolver 0 (no inferir)
- Si el monto es en moneda extranjera (USD, EUR), devolver 0 y mencionar en observación

tipo: clasificación del procedimiento. Valores recomendados:
- "Licitación Pública" / "Licitación Privada"
- "Contratación Directa"
- "Concurso de Precios"
- "Compra Directa"
- "Adjudicación" (genérico cuando no se especifica)
- "Convenio" (urbanístico, marco, etc.)
- "Ampliación de contrato" / "Prórroga" / "Rescisión"
Si el tipo no está claro en el Asunto ni en TipoNorma, usar "Sin clasificar".

INDICE
- Devolver el índice 0-based correspondiente a la posición de la norma en la lista de entrada
- Si una norma describe múltiples contratos diferenciados, devolver múltiples entradas con el mismo índice

CAMPOS QUE NO EXTRAÉS (vienen verbatim del API)
- area = Reparticion (no la modifiques)
- descripcion = Asunto verbatim (lo agrega el orquestador, no lo devuelvas)
- numeroContrato, expediente, fechas (verbatim del API)
- fuenteUrl = RutaDocFinal (verbatim)`

// ─── Cliente ──────────────────────────────────────────────────────────────────

let _client: Anthropic | null = null
function getClient(): Anthropic {
  if (!_client) _client = new Anthropic()
  return _client
}

// ─── Guardrails de traceability ──────────────────────────────────────────────

function normalizar(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')   // strip diacritics
    .replace(/[.,;:'"`´]/g, '')        // strip puntuación común
    .replace(/\s+/g, ' ')
    .trim()
}

// ¿Aparece el proveedor literalmente en el Asunto?
// Tolera: case + diacríticos + puntuación + espacios extra.
// NO tolera: completar siglas, traducir, parafrasear.
export function apareceLiteralmente(proveedor: string, asunto: string): boolean {
  if (!proveedor || !asunto) return false
  const provNorm = normalizar(proveedor)
  const asuntoNorm = normalizar(asunto)
  if (provNorm.length < 3) return false  // protección contra strings basura
  if (asuntoNorm.includes(provNorm)) return true

  // Fallback: el proveedor puede aparecer SIN el sufijo legal (S.A., S.R.L.)
  // si Claude lo agregó por su cuenta. Hacemos un match más laxo: todas las
  // palabras significativas del proveedor (≥3 chars) deben aparecer.
  const palabras = provNorm.split(/\s+/).filter(w => w.length >= 3
    && !['sociedad', 'anonima', 'limitada', 'cooperativa', 'srl', 'sas', 'sa'].includes(w))
  if (palabras.length === 0) return false
  return palabras.every(w => asuntoNorm.includes(w))
}

// ¿Aparece el monto en el Asunto? Buscamos los dígitos significativos del
// número (sin separadores) en el texto. Tolera formato AR ($1.234.567,89) o
// formato simple (1234567).
export function montoApareceEnAsunto(monto: number, asunto: string): boolean {
  if (monto <= 0) return true  // monto=0 es válido (caso "sin monto")
  const enteros = Math.floor(monto).toString()
  // Remover separadores del Asunto y buscar el número entero
  const asuntoSinSep = asunto.replace(/[.,]/g, '')
  if (asuntoSinSep.includes(enteros)) return true
  // Match parcial: para montos millonarios, buscar al menos los primeros 4 dígitos
  if (enteros.length >= 4) {
    const significativos = enteros.slice(0, Math.min(6, enteros.length - 2))
    if (asuntoSinSep.includes(significativos)) return true
  }
  return false
}

// ─── Extracción por batch ─────────────────────────────────────────────────────

export interface ExtraerBatchResult {
  contratos: Contrato[]
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  costoEstimadoUSD: number
  errores: number
}

function formatearNormaParaPrompt(p: PublicacionPlana, idx: number): string {
  return `[${idx}] TipoNorma: ${p.TipoNorma}
Reparticion: ${p.Reparticion}
NormaNumero: ${p.NormaNumero}${p.Letra ? p.Letra : ''}
FechaSancion: ${p.FechaSancion?.slice(0, 10) ?? 'N/A'}
FechaPublicacion: ${p.FechaPublicacion?.slice(0, 10) ?? 'N/A'}
ExpedienteNumero: ${p.ExpedienteNumero || 'N/A'}
Asunto: ${p.Asunto}`
}

// Costo Sonnet 4.6 (Apr 2026): $3 / $15 por 1M (input/output). Cache 0.1× / 1.25×.
function estimarCosto(input: number, output: number, cacheRead: number): number {
  const fresh = input - cacheRead
  return (fresh * 3 + cacheRead * 0.3 + output * 15) / 1_000_000
}

async function extraerBatch(
  publicaciones: PublicacionPlana[],
  fuenteUrlPorPublicacion: (p: PublicacionPlana) => string,
): Promise<ExtraerBatchResult> {
  const client = getClient()
  const userText = publicaciones.map((p, i) => formatearNormaParaPrompt(p, i)).join('\n\n---\n\n')

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: MAX_TOKENS,
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'low',
      format: zodOutputFormat(ResponseSchema),
    },
    system: [
      { type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
    ],
    messages: [
      {
        role: 'user',
        content: `Procesá las siguientes ${publicaciones.length} normas y devolvé los contratos extraíbles (esContrato:true) o marcá esContrato:false para las que no son contrataciones.\n\n${userText}`,
      },
    ],
  })

  const contratos: Contrato[] = []
  let errores = 0

  if (!response.parsed_output) {
    return {
      contratos: [],
      inputTokens: response.usage.input_tokens ?? 0,
      outputTokens: response.usage.output_tokens ?? 0,
      cacheReadTokens: response.usage.cache_read_input_tokens ?? 0,
      costoEstimadoUSD: 0,
      errores: publicaciones.length,
    }
  }

  for (const r of response.parsed_output.resultados) {
    if (!r.esContrato) continue
    if (r.indice < 0 || r.indice >= publicaciones.length) {
      errores++
      continue
    }
    const p = publicaciones[r.indice]
    const proveedorLimpio = (r.proveedor ?? '').trim()
    if (!proveedorLimpio) { errores++; continue }

    // ─── HARD GUARDRAIL: traceability de proveedor ──────────────────────────
    // El proveedor extraído DEBE aparecer literalmente en el Asunto.
    // Si no aparece, se descarta (anti-hallucination).
    if (!apareceLiteralmente(proveedorLimpio, p.Asunto)) {
      errores++
      continue
    }

    // ─── HARD GUARDRAIL: traceability de monto ──────────────────────────────
    // Si el LLM devolvió monto > 0, ese número (o sus dígitos significativos)
    // DEBE aparecer en el Asunto. Si no, lo bajamos a 0.
    let montoFinal = r.monto
    if (montoFinal > 0 && !montoApareceEnAsunto(montoFinal, p.Asunto)) {
      montoFinal = 0  // no descartamos el contrato, solo el monto sospechoso
    }

    const anio = parseInt(p.FechaSancion?.slice(0, 4) ?? p.FechaPublicacion?.slice(0, 4) ?? '0')
    if (!anio || anio < 2010 || anio > 2030) { errores++; continue }

    contratos.push({
      tipo: r.tipo,
      proveedor: proveedorLimpio,
      area: p.Reparticion,                          // VERBATIM del API
      descripcion: p.Asunto,                        // VERBATIM del API (no LLM)
      monto: montoFinal,
      anio,
      fuenteUrl: fuenteUrlPorPublicacion(p),
      numeroExpediente: p.ExpedienteNumero || undefined,
      numeroContrato: `${p.TipoNorma} ${p.NormaNumero}${p.Letra ?? ''}`,
      fechaContrato: r.fechaContrato ?? p.FechaSancion?.slice(0, 10),
      // confianza 'medio' si hay monto verificado; 'bajo' si es contratación sin monto
      nivelConfianza: (montoFinal > 0 ? 'medio' : 'bajo') as NivelConfianza,
      metodoExtraccion: 'api_estructurada',
    })
  }

  const input = response.usage.input_tokens ?? 0
  const output = response.usage.output_tokens ?? 0
  const cacheRead = response.usage.cache_read_input_tokens ?? 0

  return {
    contratos,
    inputTokens: input,
    outputTokens: output,
    cacheReadTokens: cacheRead,
    costoEstimadoUSD: estimarCosto(input, output, cacheRead),
    errores,
  }
}

// ─── Pipeline público ─────────────────────────────────────────────────────────

export interface ExtraerNormasOptions {
  fuenteUrlPorPublicacion?: (p: PublicacionPlana) => string  // default: RutaDocFinal o boletinPdfUrl
  batchSize?: number                                          // default 20
  onProgress?: (i: number, total: number, contratosCount: number, costoAcum: number) => void
  // Costo máximo acumulado (incluyendo costoAcumInicial). Si el costo supera este
  // valor al terminar un batch, el loop se corta y se retorna lo procesado hasta ahora.
  maxCostUSD?: number
  costoAcumInicial?: number  // costo ya gastado en fases anteriores (p.ej. CSV antes de API)
}

export async function extraerContratosDeNormas(
  publicaciones: PublicacionPlana[],
  opts: ExtraerNormasOptions = {},
): Promise<{
  contratos: Contrato[]
  costoTotalUSD: number
  inputTokensTotal: number
  outputTokensTotal: number
  cacheReadFraction: number
  erroresTotal: number
}> {
  const fuenteUrlFn = opts.fuenteUrlPorPublicacion ?? (p =>
    p.RutaDocFinal || p.boletinPdfUrl || 'https://boletinmunicipal.cordoba.gob.ar/'
  )
  const batchSize = opts.batchSize ?? NORMAS_POR_REQUEST

  const todos: Contrato[] = []
  let costoTotal = 0
  let inputTotal = 0
  let outputTotal = 0
  let cacheReadTotal = 0
  let erroresTotal = 0
  let cortadoPorCosto = false

  for (let i = 0; i < publicaciones.length; i += batchSize) {
    // Corte por costo: verificar antes de cada batch si ya superamos el límite.
    if (opts.maxCostUSD != null) {
      const costoAcum = (opts.costoAcumInicial ?? 0) + costoTotal
      if (costoAcum >= opts.maxCostUSD) {
        console.warn(`\n⚠ [extractor-norma] Límite de costo alcanzado ($${costoAcum.toFixed(4)} >= $${opts.maxCostUSD}). Cortando a norma ${i}/${publicaciones.length}.`)
        cortadoPorCosto = true
        break
      }
    }

    const batch = publicaciones.slice(i, i + batchSize)
    try {
      const r = await extraerBatch(batch, fuenteUrlFn)
      todos.push(...r.contratos)
      costoTotal += r.costoEstimadoUSD
      inputTotal += r.inputTokens
      outputTotal += r.outputTokens
      cacheReadTotal += r.cacheReadTokens
      erroresTotal += r.errores

      opts.onProgress?.(
        Math.min(i + batchSize, publicaciones.length),
        publicaciones.length,
        todos.length,
        costoTotal,
      )
    } catch (err) {
      console.warn(`[extractor-norma] Batch ${i}-${i + batchSize} falló: ${(err as Error).message.slice(0, 100)}`)
      erroresTotal += batch.length
    }
  }
  if (cortadoPorCosto) {
    console.warn(`  (${todos.length} contratos extraídos de la porción procesada)`)
  }

  return {
    contratos: todos,
    costoTotalUSD: costoTotal,
    inputTokensTotal: inputTotal,
    outputTokensTotal: outputTotal,
    cacheReadFraction: inputTotal > 0 ? cacheReadTotal / inputTotal : 0,
    erroresTotal,
  }
}
