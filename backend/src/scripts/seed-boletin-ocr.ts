// seed-boletin-ocr.ts — Procesa Boletines Oficiales con pipeline OCR.
//
// Modo default (W2): zero-cost (unpdf + tesseract + NLP regex).
// Modo opt-in: --use-llm activa el pipeline Anthropic Vision (Sonnet 4.6),
//   que cuesta dinero y NO es el camino crítico (CLAUDE.md / project memory
//   feedback_ocr_zero_cost.md). Solo usar para casos edge.
//
// Pre-requisitos:
//   - PDF accesible vía URL pública o archivo local
//   - Solo si --use-llm: ANTHROPIC_API_KEY en .env
//
// Uso:
//   npm run seed:boletin -- --url https://boletinoficial.gob.ar/.../boletin.pdf [opts]
//   npm run seed:boletin -- --file ./boletin.pdf [opts]
//
// Opciones:
//   --jurisdiccion <id>      Identificador de municipio/provincia (default 'boletin-nacional')
//   --jurisdiccion-nombre    Nombre legible (ej: "Nación", "Córdoba")
//   --use-llm                Activa pipeline Sonnet (OPT-IN, costo $$$)
//   --max-chunks <N>         (Solo --use-llm) tope de chunks (control de costo)
//   --chunk-size <N>         (Solo --use-llm) páginas por chunk (default 50)
//   --forzar-ocr             (Default zero-cost) saltar unpdf, ir directo a tesseract
//   --concurrencia <N>       (Default zero-cost) workers tesseract simultáneos (default 2)
//   --dry-run                Procesa pero NO inserta en DuckDB

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { initDb, registrarFuente } from '../lib/db'
import { descargarPDF } from '../lib/pdf'
import { extraerBoletinZeroCost } from '../lib/ocr'
import { extraerBoletinViaLLM } from '../lib/ocr-llm'
import type { FuenteMetadata } from '../types'

interface Args {
  url?: string
  file?: string
  jurisdiccion: string
  jurisdiccionNombre: string
  useLLM: boolean
  maxChunks?: number
  chunkSize?: number
  forzarOCR: boolean
  concurrencia?: number
  dryRun: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = {
    jurisdiccion: 'boletin-nacional',
    jurisdiccionNombre: 'Nación',
    useLLM: false,
    forzarOCR: false,
    dryRun: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const next = args[i + 1]
    if (a === '--url')                      { out.url = next; i++ }
    else if (a === '--file')                { out.file = next; i++ }
    else if (a === '--jurisdiccion')        { out.jurisdiccion = next; i++ }
    else if (a === '--jurisdiccion-nombre') { out.jurisdiccionNombre = next; i++ }
    else if (a === '--use-llm')             { out.useLLM = true }
    else if (a === '--max-chunks')          { out.maxChunks = parseInt(next); i++ }
    else if (a === '--chunk-size')          { out.chunkSize = parseInt(next); i++ }
    else if (a === '--forzar-ocr')          { out.forzarOCR = true }
    else if (a === '--concurrencia')        { out.concurrencia = parseInt(next); i++ }
    else if (a === '--dry-run')             { out.dryRun = true }
  }
  return out
}

function imprimirAyuda() {
  console.error(`
Uso:
  npm run seed:boletin -- --url <URL> [opts]
  npm run seed:boletin -- --file <PATH> [opts]

Opciones default (zero-cost: unpdf + tesseract + NLP):
  --jurisdiccion <id>          ID municipio/provincia (default 'boletin-nacional')
  --jurisdiccion-nombre <str>  Nombre legible (default 'Nación')
  --forzar-ocr                 Saltar unpdf, ir directo a tesseract (PDFs escaneados)
  --concurrencia <N>           Workers tesseract simultáneos (default 2)
  --dry-run                    Procesa pero no inserta en DB

Opciones opt-in LLM (--use-llm activa pipeline Sonnet 4.6):
  ⚠ Costo $$$ — solo para casos edge donde el pipeline default falla.
  --use-llm                    Activa el path Anthropic Vision
  --max-chunks <N>             Tope de chunks (control de costo)
  --chunk-size <N>             Páginas por chunk (default 50)

Ejemplo (default zero-cost):
  npm run seed:boletin -- --file ./boletin.pdf --jurisdiccion-nombre "Córdoba"

Ejemplo (opt-in LLM):
  npm run seed:boletin -- --file ./boletin.pdf --use-llm --max-chunks 1
`)
}

async function main() {
  console.log('=== ARGOS — Seed Boletín OCR ===\n')

  const args = parseArgs()
  if (!args.url && !args.file) {
    console.error('Falta --url o --file')
    imprimirAyuda()
    process.exit(1)
  }

  if (args.useLLM) {
    if (!process.env.ANTHROPIC_API_KEY) {
      console.error('--use-llm requiere ANTHROPIC_API_KEY en .env')
      process.exit(1)
    }
    console.log('⚠ Modo --use-llm activo. Pipeline Sonnet 4.6 — costo estimado ~$0.13/200pp.')
    console.log('  CLAUDE.md / feedback_ocr_zero_cost.md: este modo es OPT-IN, no default.\n')
  } else {
    console.log('Modo zero-cost: unpdf → tesseract (lang=spa) → NLP regex.')
    console.log('  Costo: $0. Sin llamadas a Anthropic API.\n')
  }

  // ─── 1. Cargar PDF ──────────────────────────────────────────────────────────
  let pdfBuffer: Buffer
  let fuenteUrl: string
  if (args.url) {
    console.log(`Descargando PDF desde ${args.url.slice(0, 80)}...`)
    pdfBuffer = await descargarPDF(args.url)
    fuenteUrl = args.url
  } else {
    const filePath = path.resolve(args.file!)
    console.log(`Leyendo PDF local: ${filePath}`)
    pdfBuffer = fs.readFileSync(filePath)
    fuenteUrl = `file://${filePath}`
  }
  console.log(`PDF cargado: ${(pdfBuffer.length / 1024 / 1024).toFixed(2)} MB\n`)

  // ─── 2. Inicializar DB + registrar fuente ───────────────────────────────────
  await initDb()

  const fuente: FuenteMetadata = {
    id: `${args.jurisdiccion}-ocr`,
    jurisdiccion: args.jurisdiccionNombre,
    url: fuenteUrl,
    formato: args.useLLM ? 'PDF (OCR-LLM)' : 'PDF (OCR-zero-cost)',
    oficial: true,
    nivelConfianza: 'medio',
    notas: args.useLLM
      ? 'Extraído vía Claude Vision API (opt-in). Verificar montos/proveedores manualmente antes de denuncia formal.'
      : 'Extraído vía pipeline zero-cost (unpdf+tesseract+NLP). Verificar montos/proveedores manualmente antes de denuncia formal.',
  }
  if (!args.dryRun) {
    await registrarFuente(fuente)
  }

  // ─── 3. Procesar OCR ────────────────────────────────────────────────────────
  console.log(`Iniciando extracción (jurisdicción: ${args.jurisdiccionNombre})...`)

  const t0 = Date.now()

  if (args.useLLM) {
    if (args.maxChunks) {
      console.log(`⚠ Limitado a ${args.maxChunks} chunks (control de costo)\n`)
    }
    const result = await extraerBoletinViaLLM(pdfBuffer, {
      fuenteUrl,
      jurisdiccion: args.jurisdiccionNombre,
      chunkSize: args.chunkSize,
      maxChunks: args.maxChunks,
      onProgress: ({ chunk, totalChunks, contratosExtraidos, cacheHit }) => {
        const cacheTag = cacheHit ? '✓ cache' : '✗ fresh'
        console.log(
          `  Chunk ${chunk}/${totalChunks}: ${contratosExtraidos} contratos [${cacheTag}]`,
        )
      },
    })
    const durMs = Date.now() - t0

    console.log('\n=== Resultado (LLM) ===')
    console.log(`Páginas totales:      ${result.totalPaginas}`)
    console.log(`Chunks procesados:    ${result.chunksProcesados}`)
    console.log(`Contratos extraídos:  ${result.contratos.length}`)
    console.log(`Cache hit rate:       ${(result.cacheHitsRate * 100).toFixed(0)}%`)
    console.log(`Input tokens:         ${result.inputTokensTotal.toLocaleString()}`)
    console.log(`Output tokens:        ${result.outputTokensTotal.toLocaleString()}`)
    console.log(`Costo estimado:       USD $${result.costoEstimadoUSD.toFixed(4)}`)
    console.log(`Duración:             ${(durMs / 1000).toFixed(1)}s`)
    if (result.observaciones.length > 0) {
      console.log('\nObservaciones del extractor:')
      for (const o of result.observaciones.slice(0, 10)) {
        console.log(`  • ${o.slice(0, 150)}`)
      }
    }
    console.log('\nNOTA: persistencia de contratos LLM mantiene flujo legacy. Ver lib/ocr-llm.ts.')
  } else {
    const result = await extraerBoletinZeroCost(pdfBuffer, {
      forzarOCR: args.forzarOCR,
      concurrencia: args.concurrencia,
      onProgress: ({ pagina, total, metodo }) => {
        if (pagina === 1 || pagina === total || pagina % 10 === 0) {
          console.log(`  Página ${pagina}/${total} [${metodo}]`)
        }
      },
    })
    const durMs = Date.now() - t0

    console.log('\n=== Resultado (zero-cost) ===')
    console.log(`Hash PDF:             ${result.hashPdf.slice(0, 16)}...`)
    console.log(`Páginas totales:      ${result.totalPaginas}`)
    console.log(`Método usado:         ${result.metodoUsado}`)
    console.log(`Actos detectados:     ${result.actos.length}`)
    if (result.paginasProblemAticas.length > 0) {
      console.log(`Páginas problemáticas: ${result.paginasProblemAticas.length} (${result.paginasProblemAticas.slice(0, 10).join(',')}${result.paginasProblemAticas.length > 10 ? '...' : ''})`)
    }
    console.log(`Costo:                $0 (zero-cost)`)
    console.log(`Duración:             ${(durMs / 1000).toFixed(1)}s`)

    // Sample de actos (primeros 5)
    if (result.actos.length > 0) {
      console.log('\nMuestra de actos extraídos (primeros 5):')
      for (const a of result.actos.slice(0, 5)) {
        const partes: string[] = []
        if (a.tipoActo) partes.push(`${a.tipoActo} N°${a.numeroActo ?? '?'}`)
        if (a.proveedorRazonSocial) partes.push(`prov: ${a.proveedorRazonSocial}`)
        if (a.cuit) partes.push(`CUIT ${a.cuit}`)
        if (a.monto) partes.push(`$${a.monto.toLocaleString('es-AR')}`)
        if (a.fechaActo) partes.push(a.fechaActo)
        console.log(`  [pp ${a.pagina}] ${partes.join(' | ')}`)
      }
    }

    console.log('\nNOTA: persistencia (boletin_extractos / actos_administrativos) llega en Task B.')
    console.log('      Por ahora resultado solo se imprime en consola.')
  }

  process.exit(0)
}

main().catch(err => {
  console.error('\nError fatal:', err)
  process.exit(1)
})
