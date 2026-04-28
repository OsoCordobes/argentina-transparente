// detect-conflictos.ts — Ejecuta el detector de conflicto funcionario↔proveedor
// e inserta las señales detectadas en señales_cache.
//
// Pre-requisito: tablas agentes_publicos + igj_autoridades + igj_entidades +
// contratos pobladas (M1 cierre).
//
// Uso:
//   npm run detect:conflictos                    # corrida default
//   npm run detect:conflictos -- --reemplazar    # borra señales previas de esta tipologia
//   npm run detect:conflictos -- --max-dnis 5    # más permisivo (más false positives)
//   npm run detect:conflictos -- --min-monto 1000000  # solo contratos > $1M
//   npm run detect:conflictos -- --municipio cordoba-capital

import 'dotenv/config'
import { initDb } from '../lib/db'
import { ejecutarDetector } from '../lib/detector-conflicto-funcionario-proveedor'

interface Args {
  reemplazar: boolean
  maxDnis: number
  minMonto: number
  municipios: string[] | undefined
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const out: Args = { reemplazar: false, maxDnis: 3, minMonto: 0, municipios: undefined }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--reemplazar') out.reemplazar = true
    else if (a[i] === '--max-dnis') { out.maxDnis = parseInt(a[i + 1]); i++ }
    else if (a[i] === '--min-monto') { out.minMonto = parseFloat(a[i + 1]); i++ }
    else if (a[i] === '--municipio') {
      out.municipios ??= []
      out.municipios.push(a[i + 1]); i++
    }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Detector M4.1: Conflicto Funcionario ↔ Proveedor ===\n')
  const args = parseArgs()
  await initDb()

  console.log(`Configuración:`)
  console.log(`  reemplazarExistentes: ${args.reemplazar}`)
  console.log(`  maxDnisIGJ:           ${args.maxDnis}  (apellidos con > N DNIs IGJ se descartan por homonimia)`)
  console.log(`  minMonto:             $${args.minMonto.toLocaleString('es-AR')}`)
  console.log(`  municipios:           ${args.municipios?.join(', ') ?? '(todos)'}\n`)

  const result = await ejecutarDetector({
    municipios: args.municipios,
    maxDnisIGJ: args.maxDnis,
    minMonto: args.minMonto,
    reemplazarExistentes: args.reemplazar,
  })

  console.log(`\n=== Resultado ===`)
  console.log(`Snapshot ID:        ${result.snapshotId}`)
  console.log(`Candidatos hallados: ${result.candidatos}`)
  console.log(`Señales insertadas:  ${result.insertadas} (en señales_cache, tipologia=conflicto_funcionario_proveedor)`)
  console.log(`\nSiguiente: \`npx ts-node src/scripts/inspect-db.ts\` o consultar señales_cache directamente.`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
