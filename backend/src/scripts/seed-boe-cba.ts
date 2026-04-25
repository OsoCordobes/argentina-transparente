// seed-boe-cba.ts — Indexa TODOS los PDFs del Boletín Oficial de la Provincia
// de Córdoba via WP REST API (16+ años de cobertura, ~16K boletines reales).
//
// Este script SOLO indexa metadata (URL, fecha edición, sección). El OCR del
// contenido es opcional posterior — usa seed:boletin sobre cada PDF individual.
//
// Uso:
//   npm run seed:boe-cba                         # full crawl (40K PDFs, ~2-5 min)
//   npm run seed:boe-cba -- --desde 2024-01-01   # solo PDFs subidos desde fecha
//   npm run seed:boe-cba -- --solo-validos       # solo los que matchean filename pattern

import 'dotenv/config'
import {
  initDb, dbRun, dbAll, registrarFuente,
} from '../lib/db'
import {
  listarTodosLosPDFs, filtrarBoletinesReales,
} from '../lib/boe-cba'
import type { FuenteMetadata } from '../types'

interface Args {
  desde: string | null
  soloValidos: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = { desde: null, soloValidos: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--desde')             { out.desde = args[i + 1]; i++ }
    else if (args[i] === '--solo-validos') { out.soloValidos = true }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Seed Boletín Oficial Provincia Córdoba ===\n')
  const args = parseArgs()
  await initDb()

  await registrarFuente({
    id: 'cordoba-provincia-boletin-oficial',
    jurisdiccion: 'Provincia de Córdoba',
    url: 'https://boletinoficial.cba.gov.ar',
    formato: 'PDF (WP REST API)',
    oficial: true,
    nivelConfianza: 'alto',
    notas: 'Boletín Oficial provincial. Cobertura desde 2006-02-22. ~40K PDFs indexados via WP-JSON, ~16K boletines reales (resto: anexos). PDFs tienen text layer (no scan puro).',
  } as FuenteMetadata)

  console.log('Listando todos los PDFs via WP-JSON (puede tardar ~2-5 min)...')
  const items = await listarTodosLosPDFs({
    desde: args.desde ?? undefined,
    onProgress: (pag, total, n) => {
      if (pag % 20 === 0 || pag === total) {
        process.stdout.write(`  página ${pag}/${total} — ${n.toLocaleString()} items\r`)
      }
    },
  })
  process.stdout.write('\n')
  console.log(`✓ ${items.length.toLocaleString()} items obtenidos`)

  // Parsear y filtrar a boletines reales
  const boletinesReales = filtrarBoletinesReales(items)
  console.log(`✓ ${boletinesReales.length.toLocaleString()} boletines reales detectados (filename matchea patrón)`)
  console.log(`  ${(items.length - boletinesReales.length).toLocaleString()} descartados (anexos sueltos sin patrón)`)

  // Distribución por año
  const porAnio = new Map<number, number>()
  for (const b of boletinesReales) {
    const y = parseInt(b.fechaEdicion!.slice(0, 4))
    porAnio.set(y, (porAnio.get(y) ?? 0) + 1)
  }
  console.log('\nDistribución por año:')
  for (const [y, c] of [...porAnio.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${y}: ${c.toString().padStart(5)} PDFs`)
  }

  // Insertar en boe_cba_pdfs
  console.log('\nInsertando en DuckDB...')
  let inserted = 0
  const now = new Date().toISOString()
  const aProcesar = args.soloValidos ? boletinesReales : boletinesReales  // ya filtrados arriba

  for (const b of aProcesar) {
    const anio = b.fechaEdicion ? parseInt(b.fechaEdicion.slice(0, 4)) : null
    try {
      await dbRun(
        `INSERT OR IGNORE INTO boe_cba_pdfs VALUES (?, ?, ?, ?, ?, ?, ?, NULL, false, ?)`,
        [b.wpId, b.url, b.filenameTitulo, b.fechaEdicion, anio, b.seccion, b.fechaUpload, now]
      )
      inserted++
    } catch { /* dup */ }
  }
  console.log(`✓ ${inserted.toLocaleString()} PDFs insertados (${aProcesar.length - inserted} ya estaban indexados)`)

  // Resumen
  const total = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM boe_cba_pdfs`)
  const minMax = await dbAll<{ min_a: number; max_a: number }>(
    `SELECT MIN(anio) as min_a, MAX(anio) as max_a FROM boe_cba_pdfs WHERE anio IS NOT NULL`
  )
  console.log(`\n=== Resumen ===`)
  console.log(`Total PDFs en índice: ${(total[0]?.cnt ?? 0).toLocaleString()}`)
  console.log(`Cobertura: ${minMax[0]?.min_a ?? '?'} → ${minMax[0]?.max_a ?? '?'}`)
  console.log(`\nPróximo paso (opcional): OCR de PDFs específicos:`)
  console.log(`  npm run seed:boletin -- --url <URL_DEL_PDF> --jurisdiccion-nombre "Córdoba Provincia"`)

  process.exit(0)
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
