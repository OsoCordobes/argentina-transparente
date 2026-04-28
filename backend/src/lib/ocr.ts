// lib/ocr.ts — Pipeline OCR zero-cost para Boletines Oficiales argentinos.
//
// Pipeline (decision-tree):
//   1. unpdf.extractText() — texto nativo de PDFs digitales (la mayoría).
//   2. Si texto vacío o gibberish (>30% non-printable, <50 palabras) →
//      pdf-to-png-converter por página + tesseract.js (lang='spa').
//   3. NLP regex local (compromise + patrones argentinos) extrae:
//        CUIT, DNI, monto, expediente, resolución, razón social, repartición.
//   4. Si falta CUIT/DNI obligatorio → quarantine + alerta humana (NO inventar).
//      [En Task A solo se devuelve el resultado; persistencia + quarantine en Task B.]
//
// Cumple project memory feedback_ocr_zero_cost.md: NUNCA Anthropic API en
// camino crítico. Sonnet solo activable explícitamente vía lib/ocr-llm.ts
// para casos edge donde el operador opta-in.
//
// Cumple CLAUDE.md §2 (Cero alucinaciones): valores ausentes son explícitos,
// nunca completados con guesses.

import crypto from 'crypto'

// Polyfill: pdfjs-dist (vendored por unpdf) usa Promise.try, agregado en
// Node 22.9+. ARGOS corre con Node 22.16 pero no todas las builds tienen el
// método (parece estar tras flag en algunas distros). Polyfill mínimo.
// Sin esto, unpdf falla con "Promise.try is not a function".
if (typeof (Promise as unknown as { try?: unknown }).try !== 'function') {
  ;(Promise as unknown as { try: (fn: (...args: unknown[]) => unknown, ...args: unknown[]) => Promise<unknown> }).try =
    function tryPolyfill<T>(fn: (...args: unknown[]) => T | Promise<T>, ...args: unknown[]): Promise<T> {
      return new Promise<T>(resolve => resolve(fn(...args)))
    } as never
}

import { extractText, getDocumentProxy } from 'unpdf'
import { pdfToPng } from 'pdf-to-png-converter'
import { createWorker, type Worker } from 'tesseract.js'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface BoletinExtractoZC {
  /** Texto raw extraído (de unpdf o tesseract). */
  texto: string
  metodoExtraccion: 'pdf-text' | 'pdf-ocr-tesseract'
  /** 0-100. Para pdf-text es 100; para tesseract usa el confidence promedio. */
  confidence: number
  /** Página 1-indexed. -1 si la herramienta no separó por páginas. */
  pagina: number
  /** Hash sha256 del PDF (para versionado). */
  hashPdf: string
}

export interface ActoAdministrativoExtraido {
  pagina: number
  /** "Resolucion", "Decreto", "Disposicion", "Adjudicacion" — heurístico. null si no detectado. */
  tipoActo: string | null
  numeroActo: string | null
  numeroExpediente: string | null
  fechaActo: string | null   // YYYY-MM-DD si parseable
  cuit: string | null
  dni: string | null
  proveedorRazonSocial: string | null
  reparticion: string | null
  monto: number | null      // ARS, parseado al estilo argentino
  /** Snippet original (10 líneas máx) — trazabilidad CLAUDE.md §4. */
  textoCrudo: string
  metodoExtraccion: 'pdf-text' | 'pdf-ocr-tesseract'
  confidence: number
}

export interface OCRBoletinResultZC {
  hashPdf: string
  totalPaginas: number
  metodoUsado: 'pdf-text' | 'pdf-ocr-tesseract' | 'mixed'
  textoCompleto: string
  actos: ActoAdministrativoExtraido[]
  /** Páginas donde la extracción falló o quedó muy ruidosa. */
  paginasProblemAticas: number[]
  duracionMs: number
  /** En zero-cost siempre es 0. Conservado por compatibilidad con interfaz LLM. */
  costoEstimadoUSD: 0
}

export interface OCRBoletinOptionsZC {
  /** Forzar OCR (saltar unpdf). Útil para PDFs escaneados conocidos. */
  forzarOCR?: boolean
  /** Concurrency en el render PNG + tesseract. Default 2 (CPU local). */
  concurrencia?: number
  /** Callback para progreso por página. */
  onProgress?: (info: { pagina: number; total: number; metodo: string }) => void
}

// ─── Pipeline principal ───────────────────────────────────────────────────────

export async function extraerBoletinZeroCost(
  pdfBuffer: Buffer,
  opts: OCRBoletinOptionsZC = {},
): Promise<OCRBoletinResultZC> {
  const t0 = Date.now()
  const hashPdf = crypto.createHash('sha256').update(pdfBuffer).digest('hex')

  let paginas: string[] = []
  let confidences: number[] = []
  let metodoUsado: 'pdf-text' | 'pdf-ocr-tesseract' | 'mixed' = 'pdf-text'

  // Step 1: intentar unpdf (texto nativo). Si forzarOCR, saltar directo a tesseract.
  if (!opts.forzarOCR) {
    const nativo = await extraerTextoNativo(pdfBuffer)
    // Validar página por página. Si TODAS las páginas son válidas → 'pdf-text'.
    // Si TODAS son inválidas → fallback total a OCR. Si mezcla → 'mixed' (pero
    // por ahora simplificamos: si >50% inválidas, OCR completo).
    const validas = nativo.paginas.filter(esTextoValido).length
    const total = nativo.paginas.length
    if (nativo.ok && total > 0 && validas / total >= 0.5) {
      paginas = nativo.paginas
      confidences = nativo.paginas.map(() => 100)
      metodoUsado = 'pdf-text'
      // Si al menos 1 página fue inválida → marcar como 'mixed' después de
      // procesarlas. Por simplicidad de Task A, mantenemos 'pdf-text' mientras
      // la mayoría sean válidas.
      for (let i = 0; i < total; i++) {
        opts.onProgress?.({ pagina: i + 1, total, metodo: 'pdf-text' })
      }
    }
  }

  // Step 2: si unpdf falló o no entregó texto válido → tesseract sobre todas las páginas.
  if (paginas.length === 0) {
    const ocr = await extraerOCRTesseract(pdfBuffer, opts.concurrencia ?? 2, opts.onProgress)
    paginas = ocr.paginas
    confidences = ocr.confidences
    metodoUsado = 'pdf-ocr-tesseract'
  }

  // Step 3: parsear cada página y consolidar actos.
  const actos: ActoAdministrativoExtraido[] = []
  const paginasProblemAticas: number[] = []
  for (let i = 0; i < paginas.length; i++) {
    const pagina = i + 1
    const texto = paginas[i]
    const conf = confidences[i] ?? 0
    if (!esTextoValido(texto)) {
      paginasProblemAticas.push(pagina)
      continue
    }
    // metodoUsado en este punto solo puede ser 'pdf-text' o 'pdf-ocr-tesseract'
    // (el branch 'mixed' no se asigna en Task A). El cast es defensivo.
    const metodoActual: 'pdf-text' | 'pdf-ocr-tesseract' =
      metodoUsado === 'pdf-ocr-tesseract' ? 'pdf-ocr-tesseract' : 'pdf-text'
    const actosPagina = parsearActos(texto, pagina, metodoActual, conf)
    actos.push(...actosPagina)
  }

  return {
    hashPdf,
    totalPaginas: paginas.length,
    metodoUsado,
    textoCompleto: paginas.join('\n\n--- PAGE BREAK ---\n\n'),
    actos,
    paginasProblemAticas,
    duracionMs: Date.now() - t0,
    costoEstimadoUSD: 0,
  }
}

// ─── Internal: extracción nativa unpdf ────────────────────────────────────────

async function extraerTextoNativo(pdfBuffer: Buffer): Promise<{ paginas: string[]; ok: boolean }> {
  try {
    // unpdf necesita Uint8Array, no Buffer. Buffer ES Uint8Array en Node, pero
    // para tipado limpio convertimos explícitamente.
    const u8 = new Uint8Array(pdfBuffer)
    const proxy = await getDocumentProxy(u8)
    const result = await extractText(proxy, { mergePages: false })
    // result.text es string[] con mergePages: false
    const paginas = Array.isArray(result.text) ? result.text : [result.text]
    return { paginas, ok: true }
  } catch {
    return { paginas: [], ok: false }
  }
}

// ─── Internal: tesseract OCR ──────────────────────────────────────────────────

async function extraerOCRTesseract(
  pdfBuffer: Buffer,
  concurrencia: number,
  onProgress?: OCRBoletinOptionsZC['onProgress'],
): Promise<{ paginas: string[]; confidences: number[] }> {
  // 1. Render PDF → PNGs en memoria.
  // pdf-to-png-converter acepta ArrayBufferLike o Uint8Array. Pasamos como Uint8Array.
  const u8 = new Uint8Array(pdfBuffer)
  const pngs = await pdfToPng(u8, {
    viewportScale: 2.0,    // 2x para legibilidad OCR
    disableFontFace: true,
    returnPageContent: true,
    processPagesInParallel: false,  // tesseract worker maneja su propia concurrency
  })

  // 2. Crear pool de workers tesseract con lang='spa'.
  // Tesseract maneja idiomas via downloadable traineddata. 'spa' = español.
  const numWorkers = Math.max(1, Math.min(concurrencia, pngs.length))
  const workers: Worker[] = []
  for (let i = 0; i < numWorkers; i++) {
    workers.push(await createWorker('spa'))
  }

  const paginas: string[] = new Array(pngs.length).fill('')
  const confidences: number[] = new Array(pngs.length).fill(0)

  try {
    // Procesar páginas con round-robin sobre los workers (concurrency manual).
    let workerIdx = 0
    const tasks: Promise<void>[] = []
    for (let i = 0; i < pngs.length; i++) {
      const png = pngs[i]
      const idx = i
      const wid = workerIdx % numWorkers
      workerIdx++
      const worker = workers[wid]
      tasks.push(
        (async () => {
          if (!png.content) {
            paginas[idx] = ''
            confidences[idx] = 0
            return
          }
          try {
            const { data } = await worker.recognize(png.content)
            paginas[idx] = data.text ?? ''
            confidences[idx] = typeof data.confidence === 'number' ? data.confidence : 0
          } catch {
            paginas[idx] = ''
            confidences[idx] = 0
          }
          onProgress?.({ pagina: idx + 1, total: pngs.length, metodo: 'pdf-ocr-tesseract' })
        })(),
      )
      // Si llenamos un batch de tamaño numWorkers, esperarlo antes de seguir.
      if (tasks.length >= numWorkers) {
        await Promise.all(tasks)
        tasks.length = 0
      }
    }
    if (tasks.length > 0) await Promise.all(tasks)
  } finally {
    await Promise.all(workers.map(w => w.terminate()))
  }

  return { paginas, confidences }
}

// ─── Internal: heurística de validez de texto ─────────────────────────────────

/**
 * Valida si un string parece texto real (no garbage de un PDF escaneado).
 * Criterios:
 *   - ≥50 palabras (o ≥200 caracteres si no hay separadores)
 *   - ≤30% caracteres non-printable / no-ASCII-extendido
 */
export function esTextoValido(texto: string): boolean {
  if (!texto || typeof texto !== 'string') return false
  const trimmed = texto.trim()
  if (trimmed.length < 50) return false

  // Contar palabras (separadas por whitespace).
  const palabras = trimmed.split(/\s+/).filter(w => w.length > 0)
  if (palabras.length < 50 && trimmed.length < 200) return false

  // Contar caracteres "raros": fuera de ASCII imprimible + español + dígitos + puntuación común.
  // Tolera acentos, ñ, símbolos €$/-(),."'+; etc. Rechaza chars de control, glyphs raros.
  let raros = 0
  for (const ch of trimmed) {
    const code = ch.charCodeAt(0)
    // Control chars (0-31, 127), excepto \n \r \t
    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
      raros++
      continue
    }
    if (code === 127) {
      raros++
      continue
    }
    // ASCII imprimible normal
    if (code >= 32 && code <= 126) continue
    // Latin-1 supplement + Latin Extended A (acentos español, símbolos comunes)
    if (code >= 160 && code <= 383) continue
    // Otros (CJK, glyphs raros) → cuenta como raro.
    raros++
  }
  const ratio = raros / trimmed.length
  return ratio <= 0.3
}

// ─── Internal: parser NLP regex ───────────────────────────────────────────────

/**
 * Parsea párrafos de una página y extrae actos administrativos.
 * Usa heurística: cada bloque que matchea un patrón "Resolución/Decreto/etc N°"
 * se considera un acto candidato. Después aplica regex sobre el contexto
 * (~10 líneas alrededor) para extraer CUIT, DNI, monto, etc.
 */
export function parsearActos(
  texto: string,
  pagina: number,
  metodo: 'pdf-text' | 'pdf-ocr-tesseract',
  confidence: number,
): ActoAdministrativoExtraido[] {
  if (!texto) return []

  const actos: ActoAdministrativoExtraido[] = []

  // Regex para detectar inicio de un acto administrativo.
  // Captura el tipo (Resolución/Decreto/Disposición/Adjudicación) y el número.
  // Tolera variantes mayúsculas, abreviaciones, números con barras (123/2024).
  const RE_ACTO = /\b(Resoluci[oó]n|Decreto|Disposici[oó]n|Adjudicaci[oó]n|Resol\.?|Dto\.?|Disp\.?)\s*N?[°ºo]?\s*([\d/.-]+)/gi

  // Splitear el texto en párrafos primero. Si no hay separadores claros,
  // fallback a "ventanas" alrededor de cada match de RE_ACTO.
  const lineas = texto.split(/\n/)

  // Encontramos índices de línea de cada match — luego tomamos ±5 líneas como contexto.
  const matchesAct: Array<{ lineaIdx: number; tipo: string; numero: string }> = []
  for (let i = 0; i < lineas.length; i++) {
    const linea = lineas[i]
    RE_ACTO.lastIndex = 0
    const m = RE_ACTO.exec(linea)
    if (m) {
      matchesAct.push({ lineaIdx: i, tipo: normalizarTipoActo(m[1]), numero: m[2] })
    }
  }

  // Si no hay actos detectados pero el texto tiene CUIT o monto → emitir
  // 1 acto sintético "sin tipo" para no descartar info útil.
  if (matchesAct.length === 0) {
    const cuitFound = (texto.match(/\d{2}[-\s]?\d{8}[-\s]?\d/) ?? [])[0]
    const montoFound = (texto.match(/\$\s?[\d.,]+/) ?? [])[0]
    if (cuitFound || montoFound) {
      matchesAct.push({ lineaIdx: 0, tipo: '', numero: '' })
    }
  }

  for (const ma of matchesAct) {
    const start = Math.max(0, ma.lineaIdx - 2)
    const end = Math.min(lineas.length, ma.lineaIdx + 8)
    const ctx = lineas.slice(start, end).join('\n')

    actos.push({
      pagina,
      tipoActo: ma.tipo || null,
      numeroActo: ma.numero || null,
      numeroExpediente: extraerExpediente(ctx),
      fechaActo: extraerFecha(ctx),
      cuit: extraerCUIT(ctx),
      dni: extraerDNI(ctx),
      proveedorRazonSocial: extraerProveedor(ctx),
      reparticion: extraerReparticion(ctx),
      monto: extraerMonto(ctx),
      textoCrudo: ctx.slice(0, 2000),
      metodoExtraccion: metodo,
      confidence,
    })
  }

  return actos
}

function normalizarTipoActo(s: string): string {
  const norm = s.toUpperCase().replace(/\.$/, '')
  if (norm.startsWith('RESOL')) return 'Resolucion'
  if (norm.startsWith('DECRETO') || norm === 'DTO') return 'Decreto'
  if (norm.startsWith('DISP')) return 'Disposicion'
  if (norm.startsWith('ADJUDIC')) return 'Adjudicacion'
  return s
}

function extraerCUIT(s: string): string | null {
  // CUIT: 2 dígitos + 8 + 1, separados opcionalmente por - o espacio.
  const m = s.match(/(\d{2})[-\s]?(\d{8})[-\s]?(\d)/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}`
}

function extraerDNI(s: string): string | null {
  const m = s.match(/DNI[^\d]{0,5}(\d{7,8})/i)
  if (!m) return null
  return m[1]
}

export function parseMontoARS(s: string): number | null {
  // Limpiar prefijos como $, USD, ARS, "pesos" y puntuación final de oración
  let trimmed = s.trim().replace(/^(USD|ARS|\$|pesos?)\s*/i, '').trim()
  // Quitar trailing punctuation de fin-de-oración (ej "1.500,00." → "1.500,00").
  // [.,;:]+$ solo matchea símbolos de puntuación al final, no dígitos, así que
  // "1.500,00" (que termina en dígito) queda intacto.
  trimmed = trimmed.replace(/[.,;:]+$/, '')
  if (!trimmed) return null

  // Detectar formato AR (1.234.567,89) vs US (1,234,567.89) por la última separación.
  // En AR: la coma es decimal y el punto es miles. En US: al revés.
  // Heurística: si hay coma y punto → la coma es decimal si está después del último punto.
  const tieneComa = trimmed.includes(',')
  const tienePunto = trimmed.includes('.')
  let normalized = trimmed
  if (tieneComa && tienePunto) {
    if (trimmed.lastIndexOf(',') > trimmed.lastIndexOf('.')) {
      // formato AR: puntos miles, coma decimal
      normalized = trimmed.replace(/\./g, '').replace(',', '.')
    } else {
      // formato US: comas miles, punto decimal
      normalized = trimmed.replace(/,/g, '')
    }
  } else if (tieneComa) {
    // Solo coma — asumimos decimal AR si tiene 1-2 dígitos después
    const parts = trimmed.split(',')
    if (parts.length === 2 && parts[1].length <= 2) {
      normalized = trimmed.replace(',', '.')
    } else {
      normalized = trimmed.replace(/,/g, '')
    }
  } else if (tienePunto) {
    // Solo punto — podría ser miles AR (ej "1.234.567") o decimal US (ej "1234.56")
    // Si hay >=2 puntos o el último grupo tiene !=2 dígitos → miles.
    const parts = trimmed.split('.')
    if (parts.length > 2 || (parts.length === 2 && parts[1].length === 3)) {
      normalized = trimmed.replace(/\./g, '')
    }
  }

  const n = Number(normalized)
  if (!Number.isFinite(n)) return null
  return n
}

function extraerMonto(s: string): number | null {
  // Patrones: "$ 1.234.567,89" / "PESOS UN MILLON..." / "monto: 1234567"
  // Por simplicidad: busca primer "$" + número o "PESOS" + número.
  const m1 = s.match(/\$\s?([\d.,]+)/)
  if (m1) {
    const v = parseMontoARS(m1[1])
    if (v !== null) return v
  }
  // "monto" / "importe" / "por la suma de" seguido de número
  const m2 = s.match(/(?:monto|importe|suma de|por la suma de)[^\d$]{0,20}\$?\s?([\d.,]+)/i)
  if (m2) {
    const v = parseMontoARS(m2[1])
    if (v !== null && v >= 100) return v   // filtro ruido (números chicos sueltos)
  }
  return null
}

function extraerExpediente(s: string): string | null {
  // Expedientes argentinos pueden ser:
  //   - 100% numéricos: "12345/2024"
  //   - prefijo alfa: "EX-2024-005678", "EXP-1234/2024", "GDE EX-2024..."
  // Tolera letras + números + - . / al inicio del código del expediente.
  const m = s.match(/(?:Exp(?:ediente)?\.?\s*N?[°ºo]?\s*)([A-Z]{0,4}[-./]?[\d./-]{4,})/i)
  if (!m) return null
  return m[1].replace(/[,;]$/, '')
}

function extraerFecha(s: string): string | null {
  // dd/mm/yyyy o dd-mm-yyyy
  const m1 = s.match(/(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m1) {
    const dd = m1[1].padStart(2, '0')
    const mm = m1[2].padStart(2, '0')
    return `${m1[3]}-${mm}-${dd}`
  }
  // "15 de diciembre de 2024"
  const meses: Record<string, string> = {
    enero: '01', febrero: '02', marzo: '03', abril: '04',
    mayo: '05', junio: '06', julio: '07', agosto: '08',
    septiembre: '09', setiembre: '09', octubre: '10',
    noviembre: '11', diciembre: '12',
  }
  const m2 = s.match(/(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/i)
  if (m2) {
    const mm = meses[m2[2].toLowerCase()]
    if (mm) {
      const dd = m2[1].padStart(2, '0')
      return `${m2[3]}-${mm}-${dd}`
    }
  }
  return null
}

function extraerProveedor(s: string): string | null {
  // Heurísticas: "ADJUDICAR a [NOMBRE]" / "CONTRATAR con [NOMBRE]" / "FAVOR DE [NOMBRE]"
  // Captura hasta encontrar coma, punto, "por", "con", o newline.
  const patterns = [
    /(?:ADJUDIC(?:AR|ASE|ADO)|CONTRATAR(?:SE)?)\s+(?:a|con|al?)\s+(?:la\s+(?:firma|empresa|sociedad)\s+)?([A-ZÑÁÉÍÓÚÜ][A-ZÑÁÉÍÓÚÜ0-9 .&,'-]{3,80}(?:S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|SACI(?:F)?|S\.?C\.?A\.?))/i,
    /\bFAVOR\s+DE\s+([A-ZÑÁÉÍÓÚÜ][A-ZÑÁÉÍÓÚÜ0-9 .&,'-]{3,80}(?:S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?))/i,
    /(?:la\s+)?(?:firma|empresa|sociedad)\s+([A-ZÑÁÉÍÓÚÜ][A-ZÑÁÉÍÓÚÜ0-9 .&,'-]{3,80}(?:S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?))/i,
  ]
  for (const re of patterns) {
    const m = s.match(re)
    if (m && m[1]) {
      return m[1].trim().replace(/[,.]+$/, '')
    }
  }
  return null
}

function extraerReparticion(s: string): string | null {
  // "MINISTERIO DE X", "SECRETARIA DE X", "DIRECCION DE X", "MUNICIPALIDAD DE X"
  // Captura grupo 1 = la frase completa incluyendo el conector ("DE", "DEL", "DE LA")
  // para no perder "DE" en el output (relevante para evitar "MINISTERIO OBRAS").
  const re = /\b((?:MINISTERIO|SECRETAR[IÍ]A|DIRECCI[OÓ]N|SUBSECRETAR[IÍ]A|MUNICIPALIDAD|GOBERNACI[OÓ]N|AGENCIA)\s+(?:DE\s+(?:LA\s+)?|DEL\s+)?[A-ZÑÁÉÍÓÚÜ][A-ZÑÁÉÍÓÚÜ0-9 ,.\-]{3,80})/i
  const m = s.match(re)
  if (!m) return null
  let full = m[1].trim().replace(/[,;]+$/, '')
  // Truncar en el primer indicador de fin (newline literal — ya filtrado por contexto
  // de líneas — o palabras de cierre comunes).
  const stop = full.search(/\s+(?:—|–|\.\s|de\s+CORDOBA|de\s+LA\s+PROVINCIA)/i)
  if (stop > 0 && stop < full.length) {
    full = full.slice(0, stop).trim()
  }
  // Truncar en el inicio del próximo "verb-like" common keyword (de\s+contratar, etc.)
  const stop2 = full.search(/\s+(?:de\s+contratar|de\s+adjudic|de\s+aprobar|para\s+|por\s+|conforme)/i)
  if (stop2 > 0 && stop2 < full.length) {
    full = full.slice(0, stop2).trim()
  }
  return full.slice(0, 100)
}
