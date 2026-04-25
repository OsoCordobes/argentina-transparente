// seed-santafe.ts — Carga contratos de Santa Fe en DuckDB
//
// Fuente: datosabiertos.santafe.gob.ar (CKAN)
// Descubre el dataset CSV de compras automáticamente.
//
// Uso:
//   npm run seed:santafe               # Año actual
//   npm run seed:santafe -- 2022       # Solo 2022
//   npm run seed:santafe -- --force    # Recargar

import 'dotenv/config'
import { initDb, getContratosCount, clearContratos, insertContratoBatch } from '../lib/db'
import { santaFeConnector } from '../connectors/santa-fe'

const MUNICIPIO = 'santa-fe'

function parseArgs() {
  const args = process.argv.slice(2).filter(a => !a.startsWith('--'))
  const force = process.argv.includes('--force')
  const ahora = new Date().getFullYear()
  if (args.length === 0) return { anioDesde: ahora, anioHasta: ahora, force }
  if (args.length === 1) { const a = parseInt(args[0]); return { anioDesde: a, anioHasta: a, force } }
  return { anioDesde: parseInt(args[0]), anioHasta: parseInt(args[1]), force }
}

async function main() {
  console.log('=== ARGOS — Seed Santa Fe ===\n')
  const { anioDesde, anioHasta, force } = parseArgs()

  await initDb()
  const existing = await getContratosCount(MUNICIPIO)
  if (existing > 0 && !force) {
    console.log(`Ya hay ${existing.toLocaleString()} contratos para ${MUNICIPIO}. Use --force.\n`)
    process.exit(0)
  }
  if (existing > 0 && force) await clearContratos(MUNICIPIO)

  const contratos = await santaFeConnector.getContratos(anioDesde, anioHasta)
  const inserted = await insertContratoBatch(MUNICIPIO, contratos)

  console.log(`\n✓ ${inserted} contratos insertados para ${MUNICIPIO}`)
  process.exit(0)
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
