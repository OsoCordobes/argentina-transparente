// backfill-agentes-dni.ts (CLI) — PLAN-DATOS A4
//
// Cierra el agujero del 100% NULL en `agentes_publicos.dni` cruzando con
// `declaraciones_juradas` (post-OCR) por nombre normalizado. La lógica vive
// en `lib/backfill-agentes-dni.ts`; este archivo es el wrapper CLI.
//
// Uso:
//   npm run backfill:agentes-dni                             # dry-run (no escribe)
//   npm run backfill:agentes-dni -- --apply                  # ejecuta
//   npm run backfill:agentes-dni -- --apply --jurisdiccion cordoba-capital

import 'dotenv/config'
import { initDb } from '../lib/db'
import { backfillAgentesDni } from '../lib/backfill-agentes-dni'

interface Args { apply: boolean; jurisdiccion?: string }
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const j = a.indexOf('--jurisdiccion')
  return {
    apply: a.includes('--apply'),
    jurisdiccion: j >= 0 ? a[j + 1] : undefined,
  }
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS A4 — Backfill agentes_publicos.dni ===\n')
  await initDb()

  const r = await backfillAgentesDni({ apply: args.apply, jurisdiccion: args.jurisdiccion })

  console.log(`Total agentes_publicos con dni NULL: ${r.totalNull}`)
  console.log(`Match exacto (1 DNI):                ${r.matched}`)
  console.log(`Ambiguos (varios DNIs por nombre):   ${r.ambiguos}`)
  console.log(`Cobertura potencial:                 ${r.totalNull > 0 ? ((r.matched / r.totalNull) * 100).toFixed(1) : '0.0'}%`)

  if (!args.apply) {
    console.log('\n[dry-run] Ningún UPDATE ejecutado. Pasá --apply para confirmar.')
    return
  }
  console.log(`\n✓ Apply exitoso: ${r.updates.length} filas actualizadas.`)
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
