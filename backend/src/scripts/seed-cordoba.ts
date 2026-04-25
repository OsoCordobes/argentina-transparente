// seed-cordoba.ts — Carga TODOS los contratos de Córdoba Capital en DuckDB
//
// Descarga XLSX de gobiernoabierto.cordoba.gob.ar (2019 → año actual).
// Años posteriores al último publicado son intentados con discovery dinámico
// (fetcher.ts L52-63); si la API responde 400, el seed continúa con los demás.
// Deduplica por hash y almacena permanentemente.
//
// Ejecutar: npm run seed:cordoba
// Con --force: recarga desde cero

import 'dotenv/config'
import { initDb, getContratosCount, clearContratos, insertContratoBatch } from '../lib/db'
import { fetchRawRows } from '../connectors/cordoba-capital/fetcher'
import { parseRows } from '../connectors/cordoba-capital/parser'
import { cordobaCapitalConnector } from '../connectors/cordoba-capital'

const MUNICIPIO = 'cordoba-capital'

async function main() {
  console.log('=== ARGOS — Seed Córdoba Capital ===\n')

  await initDb()

  const existing = await getContratosCount(MUNICIPIO)
  const force = process.argv.includes('--force')

  if (existing > 0 && !force) {
    console.log(`Ya hay ${existing.toLocaleString()} contratos cargados para ${MUNICIPIO}.`)
    console.log('Use --force para recargar.\n')
    process.exit(0)
  }

  if (existing > 0 && force) {
    console.log(`Limpiando ${existing.toLocaleString()} contratos existentes...`)
    await clearContratos(MUNICIPIO)
  }

  let totalInserted = 0
  const seenHashes = new Set<string>()

  const aniosDisponibles = cordobaCapitalConnector.aniosDisponibles
  console.log(`Años a descargar: ${aniosDisponibles.join(', ')}`)
  console.log(`(Años no publicados aún en el portal serán saltados con warning.)\n`)

  for (const anio of aniosDisponibles) {
    try {
      console.log(`[${anio}] Descargando XLSX...`)
      const rawRows = await fetchRawRows(anio)
      console.log(`[${anio}] ${rawRows.length} filas crudas`)

      const contratos = parseRows(rawRows, anio)
      console.log(`[${anio}] ${contratos.length} contratos parseados`)

      // Dedup: los XLSX del portal son cumulativos — filtrar duplicados
      const nuevos = contratos.filter(c => {
        const key = `${MUNICIPIO}|${c.anio}|${c.tipo}|${c.proveedor}|${c.area}|${c.monto}`
        if (seenHashes.has(key)) return false
        seenHashes.add(key)
        return true
      })

      if (nuevos.length < contratos.length) {
        console.log(`[${anio}] ${contratos.length - nuevos.length} duplicados filtrados`)
      }

      const inserted = await insertContratoBatch(MUNICIPIO, nuevos)
      totalInserted += inserted
      console.log(`[${anio}] ✓ ${inserted} contratos insertados\n`)
    } catch (err) {
      console.warn(`[${anio}] ✗ Error: ${(err as Error).message}\n`)
    }
  }

  const finalCount = await getContratosCount(MUNICIPIO)
  console.log(`=== Resultado ===`)
  console.log(`Total contratos en DB: ${finalCount.toLocaleString()}`)
  console.log(`Insertados en esta ejecución: ${totalInserted.toLocaleString()}`)
  console.log(`\n✓ Seed completado. Los datos están listos para análisis.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
