// detect-ddjj-omitida.ts (PLAN-DATOS Fase C3) — CLI
import 'dotenv/config'
import { initDb } from '../lib/db'
import { ejecutarDetectorDDJJOmitida } from '../lib/detector-ddjj-omitida'

interface Args {
  reemplazar: boolean
  minAnios: number
  jurisdicciones: string[] | undefined
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const out: Args = { reemplazar: false, minAnios: 1, jurisdicciones: undefined }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--reemplazar') out.reemplazar = true
    else if (a[i] === '--min-anios') { out.minAnios = parseInt(a[i + 1]); i++ }
    else if (a[i] === '--jurisdiccion') {
      out.jurisdicciones ??= []
      out.jurisdicciones.push(a[i + 1]); i++
    }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Detector C3: DDJJ Omitida (Anexo III Ley 25.188) ===\n')
  const args = parseArgs()
  await initDb()

  console.log(`Configuración:`)
  console.log(`  reemplazar:     ${args.reemplazar}`)
  console.log(`  min años:       ${args.minAnios}`)
  console.log(`  jurisdicciones: ${args.jurisdicciones?.join(', ') ?? '(todas)'}\n`)

  const start = Date.now()
  const result = await ejecutarDetectorDDJJOmitida({
    jurisdicciones: args.jurisdicciones,
    minAniosOmitidos: args.minAnios,
    reemplazarExistentes: args.reemplazar,
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Snapshot ID:        ${result.snapshotId}`)
  console.log(`Candidatos:         ${result.candidatos}`)
  console.log(`Señales insertadas: ${result.insertadas}`)
  console.log(`Duración:           ${elapsed}s`)

  if (result.insertadas === 0) {
    console.log('\n⚠ Cero señales emitidas. Posibles causas:')
    console.log('  - declaraciones_juradas vacío o sin matches por nombre (W3 OCR pendiente)')
    console.log('  - todos los funcionarios obligados declararon (escenario ideal)')
    console.log('  - agentes_publicos sin filas con cargo de Anexo III')
    process.exit(0)
  }
  console.log('\n✓ Señales C3 — irregularidades administrativas. Verificar DNI antes de denunciar.')
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
