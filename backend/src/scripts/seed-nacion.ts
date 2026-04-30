// seed-nacion.ts — Carga contratos del Estado nacional en DuckDB
//
// Fuente: Argentina Compra (ONC) vía API REST OCDS
// Cobertura: 2016–presente (Resolución ONC 59/2016)
// API: https://api.contrataciones.argentina.gob.ar/v1
//
// Uso:
//   npm run seed:nacion                  # Año actual y anterior (por defecto)
//   npm run seed:nacion -- 2022          # Solo 2022
//   npm run seed:nacion -- 2020 2022     # 2020, 2021 y 2022
//   npm run seed:nacion -- 2016 2025     # Histórico completo (puede tardar horas)
//   npm run seed:nacion -- --force       # Recargar aunque ya haya datos

import 'dotenv/config'
import { initDb, getContratosCount, clearContratos, insertContratoBatch } from '../lib/db'
import { fetchReleasesForYear } from '../connectors/argentina-compra/fetcher'
import { parseReleases } from '../connectors/argentina-compra/parser'

const MUNICIPIO = 'argentina-compra'
const PRIMER_ANIO = 2016

function parseArgs(): { anioDesde: number; anioHasta: number; force: boolean } {
  const args = process.argv.slice(2).filter(a => a !== '--force')
  const force = process.argv.includes('--force')
  const ahora = new Date().getFullYear()

  if (args.length === 0) {
    return { anioDesde: ahora - 1, anioHasta: ahora, force }
  }
  if (args.length === 1) {
    const a = parseInt(args[0])
    return { anioDesde: a, anioHasta: a, force }
  }
  return { anioDesde: parseInt(args[0]), anioHasta: parseInt(args[1]), force }
}

async function main() {
  console.log('=== ARGOS — Seed Nación (Argentina Compra) ===\n')

  const { anioDesde, anioHasta, force } = parseArgs()

  if (isNaN(anioDesde) || isNaN(anioHasta) || anioDesde < PRIMER_ANIO) {
    console.error(`Año inválido. Rango soportado: ${PRIMER_ANIO}–presente`)
    console.error('Uso: npm run seed:nacion [anioDesde] [anioHasta] [--force]')
    process.exit(1)
  }

  await initDb()

  const existing = await getContratosCount(MUNICIPIO)

  if (existing > 0 && !force) {
    console.log(`Ya hay ${existing.toLocaleString()} contratos cargados para ${MUNICIPIO}.`)
    console.log('Use --force para recargar desde cero.\n')
    process.exit(0)
  }

  if (existing > 0 && force) {
    console.log(`Limpiando ${existing.toLocaleString()} contratos existentes...`)
    await clearContratos(MUNICIPIO)
  }

  console.log(`Rango a cargar: ${anioDesde}–${anioHasta}`)
  console.log(`Fuente: Argentina Compra API (OCDS)`)
  console.log(`Aviso: el Estado nacional tiene decenas de miles de contratos por año.`)
  console.log(`       Con el rango completo (2016–presente) esta operación puede tardar`)
  console.log(`       varias horas. Comenzando...\n`)

  let totalInserted = 0
  const seenOcids = new Set<string>()

  for (let anio = anioDesde; anio <= anioHasta; anio++) {
    console.log(`\n[${anio}] Iniciando descarga...`)

    try {
      const releases = await fetchReleasesForYear(anio)
      console.log(`[${anio}] ${releases.length} releases descargados`)

      const contratos = parseReleases(releases, anio)
      console.log(`[${anio}] ${contratos.length} contratos parseados`)

      // Dedup por OCID (identificador único OCDS)
      const nuevos = contratos.filter(c => {
        const key = c.numeroExpediente
          ? `ocid:${c.numeroExpediente}`
          : `${MUNICIPIO}|${c.anio}|${c.proveedor}|${c.monto}`
        if (seenOcids.has(key)) return false
        seenOcids.add(key)
        return true
      })

      if (nuevos.length < contratos.length) {
        console.log(`[${anio}] ${contratos.length - nuevos.length} duplicados filtrados`)
      }

      const inserted = await insertContratoBatch(MUNICIPIO, nuevos)
      totalInserted += inserted
      console.log(`[${anio}] ✓ ${inserted} contratos insertados`)
    } catch (err) {
      const msg = (err as Error).message
      console.warn(`[${anio}] ✗ Error: ${msg}`)

      if (msg.includes('No se pudo conectar') || msg.includes('HTTP 4')) {
        console.warn(`       Este año se saltará. Verificar API: https://api.contrataciones.argentina.gob.ar/`)
      }
    }
  }

  const finalCount = await getContratosCount(MUNICIPIO)
  console.log(`\n=== Resultado ===`)
  console.log(`Contratos en DB (${MUNICIPIO}): ${finalCount.toLocaleString()}`)
  console.log(`Insertados en esta corrida: ${totalInserted.toLocaleString()}`)
  console.log(`\n✓ Seed completado.`)
  console.log(`  Próximos pasos:`)
  console.log(`    npm run seed:afip    # Enriquecer proveedores con CUIT`)
  console.log(`    npm run analyze      # Detectar señales de riesgo`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
