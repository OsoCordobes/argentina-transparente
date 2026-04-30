// detect-gap-compromiso.ts (PLAN-DATOS Fase C4) — CLI
import 'dotenv/config'
import { initDb } from '../lib/db'
import { ejecutarDetectorGapCompromiso } from '../lib/detector-gap-compromiso-pagado'

interface Args {
  reemplazar: boolean
  minGapPct: number
  minGapAbs: number
  jurisdicciones: string[] | undefined
  incluirAnioActual: boolean
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const out: Args = {
    reemplazar: false,
    minGapPct: 0.30,
    minGapAbs: 1_000_000,
    jurisdicciones: undefined,
    incluirAnioActual: false,
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--reemplazar') out.reemplazar = true
    else if (a[i] === '--min-gap-pct') { out.minGapPct = parseFloat(a[i + 1]); i++ }
    else if (a[i] === '--min-gap-abs') { out.minGapAbs = parseFloat(a[i + 1]); i++ }
    else if (a[i] === '--incluir-anio-actual') out.incluirAnioActual = true
    else if (a[i] === '--jurisdiccion') {
      out.jurisdicciones ??= []
      out.jurisdicciones.push(a[i + 1]); i++
    }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Detector C4: Gap Compromiso ↔ Pagado (deuda flotante) ===\n')
  const args = parseArgs()
  await initDb()

  console.log(`Configuración:`)
  console.log(`  reemplazar:           ${args.reemplazar}`)
  console.log(`  min gap pct:          ${(args.minGapPct * 100).toFixed(0)}%`)
  console.log(`  min gap absoluto:     $${args.minGapAbs.toLocaleString('es-AR')}`)
  console.log(`  incluir año actual:   ${args.incluirAnioActual}`)
  console.log(`  jurisdicciones:       ${args.jurisdicciones?.join(', ') ?? '(todas)'}\n`)

  const start = Date.now()
  const result = await ejecutarDetectorGapCompromiso({
    jurisdicciones: args.jurisdicciones,
    minGapPct: args.minGapPct,
    minGapAbs: args.minGapAbs,
    soloAniosCerrados: !args.incluirAnioActual,
    reemplazarExistentes: args.reemplazar,
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Snapshot ID:        ${result.snapshotId}`)
  console.log(`Candidatos:         ${result.candidatos}`)
  console.log(`Señales insertadas: ${result.insertadas}`)
  console.log(`Duración:           ${elapsed}s`)

  if (result.insertadas === 0) {
    console.log('\n⚠ Cero señales emitidas. Posibles causas:')
    console.log('  - presupuesto_ejecucion.compromiso NULL (B1 ALTER existe pero los seeds no')
    console.log('    populan el campo todavía — cuando llegue el dataset Cuenta General Provincia')
    console.log('    o equivalente, el detector arranca solo)')
    console.log('  - todas las partidas están al día (escenario ideal — improbable en práctica)')
    process.exit(0)
  }
  console.log('\n✓ Señales C4 — irregularidades financieras / deuda flotante.')
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
