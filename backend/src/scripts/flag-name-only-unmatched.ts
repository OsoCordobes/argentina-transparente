// flag-name-only-unmatched.ts (CLI) — PLAN-DATOS A5
//
// Marca como `name_only_unmatched=TRUE` las filas con identidad NULL en:
//   - agentes_publicos (post-A4 backfill)
//   - contratos        (post-resolve-identities)
//   - transferencias   (sin resolver de momento → mejor flagear que ignorar)
//
// Este script es post-resolución: corrérlo DESPUÉS de los seeds + A4 + resolve.
//
// Uso:
//   npm run flag:name-only                          # global, todas las tablas
//   npm run flag:name-only -- --jurisdiccion cordoba-capital
//   npm run flag:name-only -- --municipio cordoba-capital --solo contratos

import 'dotenv/config'
import { initDb } from '../lib/db'
import {
  flagAgentesNameOnly,
  flagContratosNameOnly,
  flagTransferenciasNameOnly,
} from '../lib/name-only-unmatched'

interface Args {
  jurisdiccion?: string
  municipio?: string
  solo?: 'agentes' | 'contratos' | 'transferencias'
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const j = a.indexOf('--jurisdiccion')
  const m = a.indexOf('--municipio')
  const s = a.indexOf('--solo')
  const solo = s >= 0 ? a[s + 1] as Args['solo'] : undefined
  return {
    jurisdiccion: j >= 0 ? a[j + 1] : undefined,
    municipio: m >= 0 ? a[m + 1] : undefined,
    solo,
  }
}

function pct(matched: number, total: number) {
  return total > 0 ? `${((matched / total) * 100).toFixed(1)}%` : '—'
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS A5 — Flag name_only_unmatched ===\n')
  await initDb()

  if (!args.solo || args.solo === 'agentes') {
    const r = await flagAgentesNameOnly({ jurisdiccion: args.jurisdiccion })
    console.log(`agentes_publicos     : marcadas=${r.marcadas}  ya marcadas=${r.yaMarcadas}  total NULL=${r.totalNull} (${pct(r.totalNull, r.totalNull)})`)
  }
  if (!args.solo || args.solo === 'contratos') {
    const r = await flagContratosNameOnly({ municipio: args.municipio })
    console.log(`contratos            : marcadas=${r.marcadas}  ya marcadas=${r.yaMarcadas}  total NULL=${r.totalNull}`)
  }
  if (!args.solo || args.solo === 'transferencias') {
    const r = await flagTransferenciasNameOnly({ jurisdiccion: args.jurisdiccion })
    console.log(`transferencias       : marcadas=${r.marcadas}  ya marcadas=${r.yaMarcadas}  total NULL=${r.totalNull}`)
  }
  console.log('\n✓ Flagging completado.')
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
