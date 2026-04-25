// seed-boletin-ocr.ts — Procesa Boletines Oficiales con Claude Vision API.
//
// Pre-requisitos:
//   - ANTHROPIC_API_KEY en .env
//   - PDF accesible vía URL pública o archivo local
//
// Uso:
//   npm run seed:boletin -- --url https://boletinoficial.gob.ar/.../boletin.pdf [opts]
//   npm run seed:boletin -- --file ./boletin.pdf [opts]
//
// Opciones:
//   --jurisdiccion <id>     Identificador de municipio/provincia (default 'boletin-nacional')
//   --jurisdiccion-nombre   Nombre legible (ej: "Nación", "Córdoba")
//   --max-chunks <N>        Tope de chunks a procesar (control de costo, default sin tope)
//   --chunk-size <N>        Páginas por chunk (default 50, max 100 por límite API)
//   --dry-run               Procesa pero NO inserta en DuckDB (útil para preview)
//
// Ejemplo:
//   npm run seed:boletin -- \
//     --url https://www.boletinoficial.gob.ar/edicion/124/000/2014/12/15/primera \
//     --jurisdiccion boletin-nacional \
//     --jurisdiccion-nombre "Nación" \
//     --max-chunks 2

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import {
  initDb, insertContratoBatch, registrarFuente, getContratosCount,
} from '../lib/db'
import { descargarPDF } from '../lib/pdf'
import { extraerBoletin } from '../lib/ocr'
import type { FuenteMetadata } from '../types'

interface Args {
  url?: string
  file?: string
  jurisdiccion: string
  jurisdiccionNombre: string
  maxChunks?: number
  chunkSize?: number
  dryRun: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = {
    jurisdiccion: 'boletin-nacional',
    jurisdiccionNombre: 'Nación',
    dryRun: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i]
    const next = args[i + 1]
    if (a === '--url')                    { out.url = next; i++ }
    else if (a === '--file')              { out.file = next; i++ }
    else if (a === '--jurisdiccion')      { out.jurisdiccion = next; i++ }
    else if (a === '--jurisdiccion-nombre') { out.jurisdiccionNombre = next; i++ }
    else if (a === '--max-chunks')        { out.maxChunks = parseInt(next); i++ }
    else if (a === '--chunk-size')        { out.chunkSize = parseInt(next); i++ }
    else if (a === '--dry-run')           { out.dryRun = true }
  }
  return out
}

function imprimirAyuda() {
  console.error(`
Uso:
  npm run seed:boletin -- --url <URL> [opts]
  npm run seed:boletin -- --file <PATH> [opts]

Opciones:
  --jurisdiccion <id>          ID municipio/provincia (default 'boletin-nacional')
  --jurisdiccion-nombre <str>  Nombre legible (default 'Nación')
  --max-chunks <N>             Tope de chunks (control de costo)
  --chunk-size <N>             Páginas por chunk (default 50)
  --dry-run                    Procesa pero no inserta en DB

Ejemplo:
  npm run seed:boletin -- \\
    --file ./boletin.pdf \\
    --jurisdiccion-nombre "Córdoba" \\
    --max-chunks 1
`)
}

async function main() {
  console.log('=== ARGOS — Seed Boletín OCR ===\n')

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Falta ANTHROPIC_API_KEY en .env')
    process.exit(1)
  }

  const args = parseArgs()
  if (!args.url && !args.file) {
    console.error('Falta --url o --file')
    imprimirAyuda()
    process.exit(1)
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
    formato: 'PDF (OCR)',
    oficial: true,
    nivelConfianza: 'medio',
    notas: 'Extraído vía Claude Vision API. Verificar montos/proveedores manualmente antes de denuncia formal.',
  }
  if (!args.dryRun) {
    await registrarFuente(fuente)
  }

  // ─── 3. Procesar con OCR ────────────────────────────────────────────────────
  console.log(`Iniciando extracción (jurisdicción: ${args.jurisdiccionNombre})...`)
  if (args.maxChunks) {
    console.log(`⚠ Limitado a ${args.maxChunks} chunks (control de costo)\n`)
  }

  const t0 = Date.now()
  const result = await extraerBoletin(pdfBuffer, {
    fuenteUrl,
    jurisdiccion: args.jurisdiccionNombre,
    chunkSize: args.chunkSize,
    maxChunks: args.maxChunks,
    onProgress: ({ chunk, totalChunks, contratosExtraidos, cacheHit }) => {
      const cacheTag = cacheHit ? '✓ cache' : '✗ fresh'
      console.log(
        `  Chunk ${chunk}/${totalChunks}: ${contratosExtraidos} contratos [${cacheTag}]`
      )
    },
  })
  const durMs = Date.now() - t0

  // ─── 4. Insertar en DuckDB ──────────────────────────────────────────────────
  let insertados = 0
  if (!args.dryRun && result.contratos.length > 0) {
    insertados = await insertContratoBatch(args.jurisdiccion, result.contratos)
  }

  // ─── 5. Resumen ─────────────────────────────────────────────────────────────
  const totalEnDb = args.dryRun ? null : await getContratosCount(args.jurisdiccion)

  console.log('\n=== Resultado ===')
  console.log(`Páginas totales:      ${result.totalPaginas}`)
  console.log(`Chunks procesados:    ${result.chunksProcesados}`)
  console.log(`Contratos extraídos:  ${result.contratos.length}`)
  if (!args.dryRun) {
    console.log(`Insertados en DB:     ${insertados} (total ${args.jurisdiccion}: ${totalEnDb})`)
  } else {
    console.log(`Modo --dry-run: NO se insertó en DB`)
  }
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
    if (result.observaciones.length > 10) {
      console.log(`  ... (${result.observaciones.length - 10} más)`)
    }
  }

  if (!args.dryRun && result.contratos.length > 0) {
    console.log('\n✓ Próximos pasos:')
    console.log(`  npm run analyze --force   # recalcular señales con los nuevos datos`)
    console.log(`  Contratos marcados con nivel_confianza='medio' — verificar antes de denuncia formal`)
  }

  process.exit(0)
}

main().catch(err => {
  console.error('\nError fatal:', err)
  process.exit(1)
})
