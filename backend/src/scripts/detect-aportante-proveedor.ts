// detect-aportante-proveedor.ts (PLAN-DATOS Fase C2)
// CLI ejecutable del detector aportante↔proveedor.
//
// Uso:
//   npm run detect:aportante-proveedor                    # corrida default
//   npm run detect:aportante-proveedor -- --reemplazar    # borra señales previas
//   npm run detect:aportante-proveedor -- --min-contrato 1000000
//   npm run detect:aportante-proveedor -- --jurisdiccion cordoba-capital
import 'dotenv/config'
import { initDb } from '../lib/db'
import { ejecutarDetectorAportanteProveedor } from '../lib/detector-aportante-proveedor'

interface Args {
  reemplazar: boolean
  minMontoContrato: number
  minMontoAporte: number
  jurisdicciones: string[] | undefined
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const out: Args = {
    reemplazar: false,
    minMontoContrato: 0,
    minMontoAporte: 0,
    jurisdicciones: undefined,
  }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--reemplazar') out.reemplazar = true
    else if (a[i] === '--min-contrato') { out.minMontoContrato = parseFloat(a[i + 1]); i++ }
    else if (a[i] === '--min-aporte') { out.minMontoAporte = parseFloat(a[i + 1]); i++ }
    else if (a[i] === '--jurisdiccion') {
      out.jurisdicciones ??= []
      out.jurisdicciones.push(a[i + 1]); i++
    }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Detector C2: Aportante de campaña ↔ Proveedor del estado ===\n')
  const args = parseArgs()
  await initDb()

  console.log('Configuración:')
  console.log(`  reemplazar:        ${args.reemplazar}`)
  console.log(`  min monto contrato: $${args.minMontoContrato.toLocaleString('es-AR')}`)
  console.log(`  min monto aporte:  $${args.minMontoAporte.toLocaleString('es-AR')}`)
  console.log(`  jurisdicciones:    ${args.jurisdicciones?.join(', ') ?? '(todas)'}\n`)

  const start = Date.now()
  const result = await ejecutarDetectorAportanteProveedor({
    jurisdicciones: args.jurisdicciones,
    minMontoContrato: args.minMontoContrato,
    minMontoAporte: args.minMontoAporte,
    reemplazarExistentes: args.reemplazar,
  })
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Snapshot ID:        ${result.snapshotId}`)
  console.log(`Candidatos:         ${result.candidatos}`)
  console.log(`Señales insertadas: ${result.insertadas}`)
  console.log(`Duración:           ${elapsed}s`)

  if (result.insertadas === 0) {
    console.log('\n⚠ Cero señales emitidas. Posibles causas:')
    console.log('  - aportantes_campanas sin filas con CUIT NOT NULL (esperar W3 OCR)')
    console.log('  - identity_matches sin Tier 1-3 cubriendo aportantes (correr identity-resolver)')
    console.log('  - ningún aportante también es proveedor post-aporte')
    process.exit(0)
  }

  console.log('\n✓ Señales C2 publicables — Tier 1 con CUIT verificado en ambos lados.')
  console.log('  Listas para revisión humana + denuncia (Ley 26.215 + Ley 25.188).')
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
