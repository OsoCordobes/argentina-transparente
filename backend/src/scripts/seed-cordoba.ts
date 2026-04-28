// seed-cordoba.ts — Wrapper sobre ingestCordobaCapital con CLI args.
//
// Ejecutar: npm run seed:cordoba [-- --force] [-- --dry-run] [-- --desde 2015 --hasta 2026]
//
// Comportamiento (W1 Task 8):
//   - Sin --force: si el hash del payload coincide con el último snapshot, salta
//   - Con --force: re-procesa, marca el snapshot anterior como superseded
//   - Con --dry-run: cuenta filas pero no inserta

import 'dotenv/config'
import { ingestCordobaCapital } from '../connectors/cordoba-capital'
import { listSnapshots } from '../lib/snapshots'

function parseArgs(): { force: boolean; dryRun: boolean; desde?: number; hasta?: number } {
  const a = process.argv.slice(2)
  const out: { force: boolean; dryRun: boolean; desde?: number; hasta?: number } = {
    force: a.includes('--force'),
    dryRun: a.includes('--dry-run'),
  }
  const desdeIdx = a.indexOf('--desde')
  if (desdeIdx >= 0 && a[desdeIdx + 1]) out.desde = Number(a[desdeIdx + 1])
  const hastaIdx = a.indexOf('--hasta')
  if (hastaIdx >= 0 && a[hastaIdx + 1]) out.hasta = Number(a[hastaIdx + 1])
  return out
}

async function main() {
  console.log('=== ARGOS — Seed Córdoba Capital (W1 IngestReport) ===\n')
  const opts = parseArgs()
  console.log(`Opciones: ${JSON.stringify(opts)}\n`)

  const report = await ingestCordobaCapital(opts)

  console.log(`\n=== Reporte ===`)
  console.log(`  Snapshot ID:         ${report.snapshotId}`)
  console.log(`  Status:              ${report.status}`)
  console.log(`  Filas leídas:        ${report.filasLeidas.toLocaleString()}`)
  console.log(`  Filas insertadas:    ${report.filasInsertadas.toLocaleString()}`)
  console.log(`  Filas quarantined:   ${report.filasQuarantined}`)
  console.log(`  Hash archivo:        ${report.hashArchivo.slice(0, 16)}...`)
  console.log(`  Duración:            ${report.duracionMs}ms`)
  if (report.errores.length > 0) {
    console.log(`\n  Errores (${report.errores.length}):`)
    for (const e of report.errores.slice(0, 5)) {
      console.log(`    - ${e.motivo}`)
    }
  }

  // Mostrar últimos 5 snapshots de este seed
  const snaps = await listSnapshots('seed:cordoba', 5)
  console.log(`\n=== Últimas corridas (top 5) ===`)
  for (const s of snaps) {
    console.log(`  ${s.fechaCorrida}  ${s.status.padEnd(20)}  ins=${s.filasInsertadas}  ${s.id.slice(0, 8)}`)
  }
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
