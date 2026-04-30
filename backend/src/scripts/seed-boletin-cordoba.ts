// seed-boletin-cordoba.ts — Crawler resumible de Boletines Oficiales
// Municipalidad de Córdoba 2010-presente.
//
// Pipeline:
//   1. Discovery: lista PDFs disponibles en gobiernoabierto.cordoba.gob.ar
//      dataset 2781 (boletines municipales).
//   2. Filtra por rango de años + skip de URLs ya procesadas (tabla ocr_jobs).
//   3. Para cada PDF: descarga → extraerBoletin (Vision API) → insertar
//      contratos con nivel_confianza='medio' → registrar OCR job.
//   4. Rate-limited (3s entre PDFs) y con cost cap configurable.
//
// Uso:
//   npm run seed:boletin-cordoba                         # rango default 2010-presente
//   npm run seed:boletin-cordoba -- --discover           # solo lista PDFs disponibles
//   npm run seed:boletin-cordoba -- --desde 2018 --hasta 2020
//   npm run seed:boletin-cordoba -- --max-cost-usd 5     # aborta si excede $5
//   npm run seed:boletin-cordoba -- --dry-run            # discovery + estimación sin OCR
//   npm run seed:boletin-cordoba -- --max-jobs 3         # tope para test
//
// Resumibilidad: re-correr el script salta automáticamente PDFs ya en ocr_jobs.
// Para re-procesar: limpiar la tabla manualmente o usar --force-pdf <url>.

import 'dotenv/config'
import {
  initDb, insertContratoBatch, registrarFuente,
  registrarOCRJob, ocrJobYaProcesado, getOCRJobsResumen,
} from '../lib/db'
import { descargarPDF } from '../lib/pdf'
// NOTA: este script bulk usa el pipeline LLM (Sonnet 4.6). Se mantiene como
// path opt-in legacy. El default zero-cost vive en lib/ocr.ts y se invoca via
// scripts/seed-boletin-ocr.ts.
import { extraerBoletinViaLLM as extraerBoletin } from '../lib/ocr-llm'
import { descubrirBoletines, type BoletinDisponible } from '../lib/boletin-cordoba'
import type { FuenteMetadata } from '../types'

const MUNICIPIO_ID = 'cordoba-capital'   // mismo connector — los contratos OCR se mergean
const JURISDICCION_NOMBRE = 'Córdoba Capital'
const PAUSA_ENTRE_PDFS_MS = 3_000        // ~20 PDFs/min máximo
const ANIO_DEFAULT_DESDE = 2010

interface Args {
  desde: number
  hasta: number
  maxCostUSD: number | null
  maxJobs: number | null
  discover: boolean
  dryRun: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const ahora = new Date().getFullYear()
  const out: Args = {
    desde: ANIO_DEFAULT_DESDE,
    hasta: ahora,
    maxCostUSD: null,
    maxJobs: null,
    discover: false,
    dryRun: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const next = args[i + 1]
    if (a === '--desde')              { out.desde = parseInt(next); i++ }
    else if (a === '--hasta')         { out.hasta = parseInt(next); i++ }
    else if (a === '--max-cost-usd')  { out.maxCostUSD = parseFloat(next); i++ }
    else if (a === '--max-jobs')      { out.maxJobs = parseInt(next); i++ }
    else if (a === '--discover')      { out.discover = true }
    else if (a === '--dry-run')       { out.dryRun = true }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Crawler Boletines Córdoba ===\n')

  if (!process.env.ANTHROPIC_API_KEY && !parseArgs().discover && !parseArgs().dryRun) {
    console.error('Falta ANTHROPIC_API_KEY (no necesario para --discover ni --dry-run)')
    process.exit(1)
  }

  const args = parseArgs()
  await initDb()

  // ─── 1. Discovery ────────────────────────────────────────────────────────────
  console.log(`Rango solicitado: ${args.desde}–${args.hasta}`)
  console.log(`Descubriendo PDFs en gobiernoabierto.cordoba.gob.ar...\n`)

  let disponibles: BoletinDisponible[]
  try {
    disponibles = await descubrirBoletines({
      anioDesde: args.desde,
      anioHasta: args.hasta,
    })
  } catch (err) {
    console.error(`Error en discovery: ${(err as Error).message}`)
    console.error('El portal puede haber cambiado el dataset ID o estar caído.')
    process.exit(1)
  }

  console.log(`✓ ${disponibles.length} PDFs disponibles en el rango\n`)

  if (disponibles.length > 0) {
    // Distribución por año
    const porAnio = new Map<number | null, number>()
    for (const d of disponibles) {
      porAnio.set(d.anioInferido, (porAnio.get(d.anioInferido) ?? 0) + 1)
    }
    console.log('Distribución por año (inferida del título):')
    for (const [anio, cnt] of [...porAnio.entries()].sort((a, b) => (a[0] ?? 0) - (b[0] ?? 0))) {
      console.log(`  ${anio ?? 'sin determinar'}: ${cnt} PDFs`)
    }
    console.log()
  }

  if (args.discover) {
    console.log('--discover: terminando sin procesar.')
    if (disponibles.length > 0) {
      console.log('\nMuestra (primeros 5):')
      for (const d of disponibles.slice(0, 5)) {
        console.log(`  • [${d.anioInferido ?? '?'}] ${d.recursoTitulo.slice(0, 60)}`)
        console.log(`    ${d.recursoUrl.slice(0, 100)}`)
      }
    }
    process.exit(0)
  }

  // ─── 2. Filtrar PDFs ya procesados ───────────────────────────────────────────
  const aProcesar: BoletinDisponible[] = []
  for (const d of disponibles) {
    if (await ocrJobYaProcesado(d.recursoUrl)) continue
    aProcesar.push(d)
  }

  const yaProcesados = disponibles.length - aProcesar.length
  console.log(`Ya procesados (skip): ${yaProcesados}`)
  console.log(`Pendientes:           ${aProcesar.length}`)

  if (args.maxJobs && aProcesar.length > args.maxJobs) {
    console.log(`Limitando a ${args.maxJobs} jobs (--max-jobs)`)
    aProcesar.splice(args.maxJobs)
  }

  if (aProcesar.length === 0) {
    console.log('\nNada nuevo para procesar.')
    process.exit(0)
  }

  // ─── 3. Estimación de costo ──────────────────────────────────────────────────
  // Asumimos ~50 páginas/PDF promedio para Córdoba (heurística; el primer PDF
  // ajusta esta estimación). $0.04 por chunk de 50 pp con cache hit.
  const costoEstimadoTotal = aProcesar.length * 0.04
  console.log(`\nCosto estimado total: ~$${costoEstimadoTotal.toFixed(2)} USD`)
  console.log(`(asume ~50pp por PDF, cache hit en system prompt)`)

  if (args.maxCostUSD && costoEstimadoTotal > args.maxCostUSD) {
    console.warn(`⚠ Excede max-cost-usd (${args.maxCostUSD}). Habrá corte automático al alcanzar el tope.`)
  }

  if (args.dryRun) {
    console.log('\n--dry-run: terminando sin OCR.')
    process.exit(0)
  }

  // Registrar fuente una vez
  const fuente: FuenteMetadata = {
    id: 'cordoba-capital-boletin-ocr',
    jurisdiccion: JURISDICCION_NOMBRE,
    url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/administracion-publica/boletines-municipales/2781',
    formato: 'PDF (OCR via Claude Vision)',
    oficial: true,
    nivelConfianza: 'medio',
    notas: 'Boletines Oficiales Municipalidad de Córdoba 2010-presente, procesados con Claude Sonnet 4.6. Verificar montos/proveedores manualmente antes de denuncia formal.',
  }
  await registrarFuente(fuente)

  // ─── 4. Procesar PDFs ────────────────────────────────────────────────────────
  console.log(`\nProcesando ${aProcesar.length} PDFs...`)
  console.log(`(Pausa ${PAUSA_ENTRE_PDFS_MS}ms entre PDFs para no saturar el portal)\n`)

  let costoAcumulado = 0
  let contratosTotales = 0
  let pdfsExitosos = 0
  let pdfsFallidos = 0

  for (let i = 0; i < aProcesar.length; i++) {
    const b = aProcesar[i]
    const tag = `[${i + 1}/${aProcesar.length}]`
    console.log(`\n${tag} ${b.anioInferido ?? '?'}: ${b.recursoTitulo.slice(0, 60)}`)
    console.log(`     ${b.recursoUrl.slice(0, 100)}`)

    if (args.maxCostUSD && costoAcumulado >= args.maxCostUSD) {
      console.log(`\n⚠ Alcanzado max-cost-usd ($${args.maxCostUSD.toFixed(2)}). Abortando.`)
      break
    }

    try {
      const pdfBuffer = await descargarPDF(b.recursoUrl)
      console.log(`     Descargado: ${(pdfBuffer.length / 1024 / 1024).toFixed(1)} MB`)

      const result = await extraerBoletin(pdfBuffer, {
        fuenteUrl: b.recursoUrl,
        jurisdiccion: JURISDICCION_NOMBRE,
        onProgress: ({ chunk, totalChunks, contratosExtraidos, cacheHit }) => {
          process.stdout.write(`     chunk ${chunk}/${totalChunks}: ${contratosExtraidos} [${cacheHit ? '✓' : '✗'} cache]\n`)
        },
      })

      const inserted = result.contratos.length > 0
        ? await insertContratoBatch(MUNICIPIO_ID, result.contratos)
        : 0

      await registrarOCRJob({
        url: b.recursoUrl,
        municipio: MUNICIPIO_ID,
        procesadoEn: new Date().toISOString(),
        contratosCount: inserted,
        paginas: result.totalPaginas,
        costoUSD: result.costoEstimadoUSD,
        observaciones: result.observaciones.length > 0
          ? result.observaciones.slice(0, 3).join(' | ')
          : null,
      })

      costoAcumulado += result.costoEstimadoUSD
      contratosTotales += inserted
      pdfsExitosos++

      console.log(`     ✓ ${inserted} contratos insertados | ${result.totalPaginas}pp | $${result.costoEstimadoUSD.toFixed(4)} | acum $${costoAcumulado.toFixed(2)}`)
    } catch (err) {
      pdfsFallidos++
      console.error(`     ✗ Error: ${(err as Error).message.slice(0, 200)}`)
      // Registrar el job como "fallido" para no reintentar infinitamente
      await registrarOCRJob({
        url: b.recursoUrl,
        municipio: MUNICIPIO_ID,
        procesadoEn: new Date().toISOString(),
        contratosCount: 0,
        paginas: null,
        costoUSD: 0,
        observaciones: `ERROR: ${(err as Error).message.slice(0, 200)}`,
      })
    }

    // Rate limiting
    if (i < aProcesar.length - 1) {
      await new Promise(r => setTimeout(r, PAUSA_ENTRE_PDFS_MS))
    }
  }

  // ─── 5. Resumen ──────────────────────────────────────────────────────────────
  const resumenGlobal = await getOCRJobsResumen(MUNICIPIO_ID)
  console.log('\n=== Resumen de esta corrida ===')
  console.log(`PDFs procesados OK:   ${pdfsExitosos}`)
  console.log(`PDFs fallidos:        ${pdfsFallidos}`)
  console.log(`Contratos insertados: ${contratosTotales}`)
  console.log(`Costo de esta run:    $${costoAcumulado.toFixed(4)} USD`)
  console.log()
  console.log('=== Total acumulado (todas las corridas) ===')
  console.log(`OCR jobs registrados: ${resumenGlobal.totalJobs}`)
  console.log(`Contratos OCR total:  ${resumenGlobal.totalContratos.toLocaleString()}`)
  console.log(`Páginas procesadas:   ${resumenGlobal.totalPaginas.toLocaleString()}`)
  console.log(`Costo total:          $${resumenGlobal.totalCostoUSD.toFixed(2)} USD`)

  if (contratosTotales > 0) {
    console.log('\n✓ Próximo paso: npm run analyze --force')
  }

  process.exit(0)
}

main().catch(err => {
  console.error('\nError fatal:', err)
  process.exit(1)
})
