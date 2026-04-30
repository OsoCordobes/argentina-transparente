// seed-caba.ts — Carga contratos de CABA en DuckDB
//
// Fuente: data.buenosaires.gob.ar (CKAN — descarga CSV automática)
// El fetcher descubre el dataset de compras en el portal CKAN y lo descarga.
//
// Uso:
//   npm run seed:caba                 # Año actual
//   npm run seed:caba -- 2022         # Solo 2022
//   npm run seed:caba -- 2020 2023    # Rango
//   npm run seed:caba -- --force      # Recargar

import 'dotenv/config'
import { initDb, getContratosCount, clearContratos, insertContratoBatch } from '../lib/db'
import { fetchRawRows } from '../connectors/caba/fetcher'
import { parseRows } from '../connectors/caba/parser'

const MUNICIPIO = 'caba'
const PRIMER_ANIO = 2018

function parseArgs(): { anioDesde: number; anioHasta: number; force: boolean } {
  const args = process.argv.slice(2).filter(a => a !== '--force')
  const force = process.argv.includes('--force')
  const ahora = new Date().getFullYear()

  if (args.length === 0) return { anioDesde: ahora, anioHasta: ahora, force }
  if (args.length === 1) {
    const a = parseInt(args[0])
    return { anioDesde: a, anioHasta: a, force }
  }
  return { anioDesde: parseInt(args[0]), anioHasta: parseInt(args[1]), force }
}

async function main() {
  console.log('=== ARGOS — Seed CABA ===\n')

  const { anioDesde, anioHasta, force } = parseArgs()

  if (isNaN(anioDesde) || isNaN(anioHasta) || anioDesde < PRIMER_ANIO) {
    console.error(`Año inválido. Mínimo: ${PRIMER_ANIO}`)
    process.exit(1)
  }

  await initDb()

  const existing = await getContratosCount(MUNICIPIO)
  if (existing > 0 && !force) {
    console.log(`Ya hay ${existing.toLocaleString()} contratos para ${MUNICIPIO}.`)
    console.log('Use --force para recargar.\n')
    process.exit(0)
  }
  if (existing > 0 && force) {
    await clearContratos(MUNICIPIO)
  }

  let totalInserted = 0
  const seenKeys = new Set<string>()

  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    console.log(`\n[${anio}] Descargando desde data.buenosaires.gob.ar...`)
    try {
      const rows = await fetchRawRows(anio)
      console.log(`[${anio}] ${rows.length} filas`)
      const contratos = parseRows(rows, anio)
      console.log(`[${anio}] ${contratos.length} contratos parseados`)

      const nuevos = contratos.filter(c => {
        const k = `${c.proveedor}|${c.anio}|${c.monto}`
        if (seenKeys.has(k)) return false
        seenKeys.add(k)
        return true
      })

      const inserted = await insertContratoBatch(MUNICIPIO, nuevos)
      totalInserted += inserted
      console.log(`[${anio}] ✓ ${inserted} contratos insertados`)
    } catch (err) {
      console.warn(`[${anio}] ✗ ${(err as Error).message}`)
      console.warn(`       Tip: npm run ckan:explore -- caba compras`)
    }
  }

  const finalCount = await getContratosCount(MUNICIPIO)
  console.log(`\n=== Resultado ===`)
  console.log(`Total contratos en DB: ${finalCount.toLocaleString()}`)
  console.log(`Insertados ahora: ${totalInserted.toLocaleString()}`)
  console.log(`\n✓ Seed CABA completado.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error:', err)
  process.exit(1)
})
