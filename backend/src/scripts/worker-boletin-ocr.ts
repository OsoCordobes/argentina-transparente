// worker-boletin-ocr.ts — Procesa PDFs catalogados en boe_cba_pdfs vía pipeline OCR zero-cost.
//
// Idempotente: marca cada PDF con ocr_procesado=true (éxito o fallo). Re-run procesa
// solo los nuevos pendientes. Errores van a quarantine — la corrida nunca aborta.
//
// Cero costo: usa extraerBoletinZeroCost (unpdf + tesseract). Anthropic API NUNCA.
//
// Uso:
//   npm run worker:boletin-ocr -- --limite 100 --concurrencia 2
//   npm run worker:boletin-ocr -- --limite 50 --anio 2020
//   npm run worker:boletin-ocr -- --limite 3 --dry-run
//
// Flags:
//   --limite N             max PDFs a procesar (default 50)
//   --jurisdiccion <id>    tag jurisdicción (default 'cordoba-provincia')
//   --anio <YYYY>          filtra a un año específico
//   --concurrencia <N>     PDFs en vuelo simultáneos vía p-queue (default 2)
//   --dry-run              descarga + OCR pero no persiste
//   --reset                marca todos los PDFs procesado=false antes (PELIGROSO)

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'
import { descargarPDF } from '../lib/pdf'
import { extraerBoletinZeroCost } from '../lib/ocr'
import { persistirExtractoBoletin } from '../lib/boletin-persistencia'
import { enquarantine } from '../lib/quarantine'
import { crearSnapshot } from '../lib/snapshots'

interface Args {
  limite: number
  jurisdiccion: string
  anio?: number
  concurrencia: number
  dryRun: boolean
  reset: boolean
}

function parseArgs(): Args {
  const argv = process.argv.slice(2)
  const out: Args = {
    limite: 50,
    jurisdiccion: 'cordoba-provincia',
    concurrencia: 2,
    dryRun: false,
    reset: false,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    const next = argv[i + 1]
    if (a === '--limite')             { out.limite = parseInt(next, 10); i++ }
    else if (a === '--jurisdiccion')  { out.jurisdiccion = next; i++ }
    else if (a === '--anio')          { out.anio = parseInt(next, 10); i++ }
    else if (a === '--concurrencia')  { out.concurrencia = parseInt(next, 10); i++ }
    else if (a === '--dry-run')       { out.dryRun = true }
    else if (a === '--reset')         { out.reset = true }
  }
  if (!Number.isFinite(out.limite) || out.limite <= 0) out.limite = 50
  if (!Number.isFinite(out.concurrencia) || out.concurrencia <= 0) out.concurrencia = 2
  return out
}

interface PendingPDF {
  wp_id: number | bigint
  url: string
  filename: string | null
  fecha_edicion: string | null
  anio: number | bigint | null
}

interface ActoSummary {
  cuit: string
  monto: number
  pdfId: number
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS — Worker OCR Boletín (zero-cost) ===')
  console.log(`Args: ${JSON.stringify(args)}\n`)

  await initDb()

  if (args.reset) {
    console.log('⚠ --reset: marcando TODOS los PDFs como ocr_procesado=false...')
    await dbRun(`UPDATE boe_cba_pdfs SET ocr_procesado = false`)
  }

  // Query pendientes. Filtro opcional por año. ORDER BY fecha_edicion DESC para
  // procesar primero los más recientes (más relevantes para alertas operativas).
  const whereParts: string[] = ['ocr_procesado = false']
  const params: unknown[] = []
  if (args.anio !== undefined && Number.isFinite(args.anio)) {
    whereParts.push('anio = ?')
    params.push(args.anio)
  }
  params.push(args.limite)

  const sql = `
    SELECT wp_id, url, filename, fecha_edicion, anio
    FROM boe_cba_pdfs
    WHERE ${whereParts.join(' AND ')}
    ORDER BY fecha_edicion DESC NULLS LAST
    LIMIT ?
  `
  const pdfs = await dbAll<PendingPDF>(sql, params)
  const totalPdfs = pdfs.length
  console.log(`PDFs pendientes a procesar: ${totalPdfs}`)
  if (totalPdfs === 0) {
    console.log('\nNada que procesar. Saliendo limpio.')
    console.log('Costo Anthropic:    $0 (zero-cost pipeline)')
    process.exit(0)
  }
  console.log('')

  // Snapshot para esta corrida (trazabilidad CLAUDE.md §4).
  const snap = await crearSnapshot({
    seedId: 'worker:boletin-ocr',
    fuenteUrl: `boe_cba_pdfs[${args.jurisdiccion}]`,
    hashArchivo: `batch-${new Date().toISOString().slice(0, 19)}`,
    filasLeidas: totalPdfs,
    notas: `limite=${args.limite} concurrencia=${args.concurrencia} anio=${args.anio ?? 'todos'} dry=${args.dryRun}`,
  })
  console.log(`Snapshot id: ${snap.id}\n`)

  // Acumuladores (capturados por closures dentro de la queue).
  let processed = 0      // PDFs con OCR exitoso
  let failed = 0         // PDFs que tiraron error
  let inserted = 0       // total actos insertados
  let quarantined = 0    // total actos quarantined (sin CUIT/DNI o errores)
  const topActos: ActoSummary[] = []

  // p-queue es ESM-only (v9). Cargarlo via dynamic import en CommonJS.
  const { default: PQueue } = await import('p-queue')
  const queue = new PQueue({ concurrency: args.concurrencia })

  for (const pdf of pdfs) {
    queue.add(async () => {
      const pdfId = Number(pdf.wp_id)
      const idx = processed + failed + 1
      try {
        const buffer = await descargarPDF(pdf.url)
        // Concurrencia OCR=1 cuando el worker ya paraleliza PDFs — evita
        // saturar CPU con tesseract dentro de cada PDF.
        const resultado = await extraerBoletinZeroCost(buffer, { concurrencia: 1 })

        let actosIns = 0
        let actosCuar = 0
        if (!args.dryRun) {
          const r = await persistirExtractoBoletin(resultado, {
            jurisdiccion: args.jurisdiccion,
            fuenteUrl: pdf.url,
            fechaPublicacion: pdf.fecha_edicion,
            snapshotId: snap.id,
          })
          actosIns = r.actosInsertados
          actosCuar = r.actosQuarantined
          await dbRun(
            `UPDATE boe_cba_pdfs SET ocr_procesado = true WHERE wp_id = ?`,
            [pdfId],
          )
        }

        // Recolectar top actos (por monto) para reporte final.
        for (const a of resultado.actos) {
          if (a.cuit && typeof a.monto === 'number' && a.monto > 0) {
            topActos.push({ cuit: a.cuit, monto: a.monto, pdfId })
          }
        }

        processed++
        inserted += actosIns
        quarantined += actosCuar
        console.log(
          `  [${idx}/${totalPdfs}] OK   pdf=${pdfId} (${pdf.fecha_edicion ?? '?'}) ` +
          `pp=${resultado.totalPaginas} actos=${resultado.actos.length} ` +
          `metodo=${resultado.metodoUsado} ` +
          `${args.dryRun ? '(DRY)' : `ins=${actosIns} cuar=${actosCuar}`}`,
        )
      } catch (err) {
        const msg = (err as Error).message ?? String(err)
        try {
          await enquarantine({
            snapshotId: snap.id,
            tablaDestino: 'boletin_extractos',
            motivo: 'download_or_ocr_failure',
            detalle: { pdf_id: pdfId, url: pdf.url, error: msg },
            filaJson: pdf,
          })
        } catch {
          // si quarantine falla seguimos — el log ya queda en consola.
        }
        // Marcar procesado=true igual para no reintentar en bucle infinito.
        // Si el operador quiere reintentar usa --reset o resuelve el quarantine
        // entry manualmente.
        if (!args.dryRun) {
          await dbRun(
            `UPDATE boe_cba_pdfs SET ocr_procesado = true WHERE wp_id = ?`,
            [pdfId],
          )
        }
        failed++
        console.warn(
          `  [${idx}/${totalPdfs}] FAIL pdf=${pdfId} → ${msg.slice(0, 100)}`,
        )
      }
    })
  }

  await queue.onIdle()

  // Top 5 actos por monto (criterio: alta visibilidad — cuál es el gasto más
  // grande detectado en esta corrida).
  topActos.sort((a, b) => b.monto - a.monto)
  const top5 = topActos.slice(0, 5)

  console.log('\n=== Resumen ===')
  console.log(`PDFs procesados:    ${processed} (OCR exitoso)`)
  console.log(`PDFs fallaron:      ${failed} (en quarantine, marcados procesado=true)`)
  console.log(`Actos insertados:   ${inserted}`)
  console.log(`Actos quarantined:  ${quarantined}`)
  console.log(`Costo Anthropic:    $0 (zero-cost pipeline)`)
  console.log(`Snapshot id:        ${snap.id}`)
  if (top5.length > 0) {
    console.log('\nTop 5 actos por monto:')
    for (const a of top5) {
      console.log(`  CUIT ${a.cuit}  $${a.monto.toLocaleString('es-AR')}  (pdf=${a.pdfId})`)
    }
  }

  process.exit(0)
}

main().catch(err => {
  console.error('\nError fatal:', err)
  process.exit(1)
})
