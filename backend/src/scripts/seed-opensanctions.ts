// seed-opensanctions.ts — Cachea matches de OpenSanctions/ICIJ por CUIT
//
// Para cada empresa cargada en DuckDB.empresas (con CUIT verificado vía AFIP),
// consulta opensanctions.org y cachea el resultado en opensanctions_matches.
// Si encuentra match en datasets de riesgo (offshore/sanción/PEP/crimen),
// ese CUIT podrá disparar la señal `aparicion_offshore` en el próximo
// `npm run analyze`.
//
// Pre-requisitos: npm run seed:cordoba && npm run seed:afip (para tener empresas)
//
// Uso:
//   npm run seed:opensanctions          # Solo CUITs sin match cacheado
//   npm run seed:opensanctions -- --force   # Refrescar todo (ignora cache)
//
// Rate limit: ~3 req/seg para no saturar el free tier de opensanctions.org

import 'dotenv/config'
import {
  initDb, dbAll, getOSMatch, upsertOSMatch, getOSMatchesCount,
} from '../lib/db'
import { matchOpenSanctions, esRiesgoAlto } from '../lib/opensanctions'

const PAUSE_MS = 350 // ~3 req/seg
const TTL_DIAS = 30

interface EmpresaRow {
  cuit: string
  nombre: string
}

async function sleep(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms))
}

function diasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
}

async function main() {
  console.log('=== ARGOS — Seed OpenSanctions ===\n')

  await initDb()
  const force = process.argv.includes('--force')

  const empresas = await dbAll<EmpresaRow>(
    `SELECT cuit, nombre FROM empresas WHERE cuit IS NOT NULL AND cuit != ''`
  )

  if (empresas.length === 0) {
    console.error('Sin empresas en DuckDB. Ejecutá primero: npm run seed:afip')
    process.exit(1)
  }

  console.log(`${empresas.length} empresas con CUIT a verificar\n`)

  let consultadas = 0
  let cacheadas = 0
  let matched = 0
  let omitidas = 0

  for (const emp of empresas) {
    const cached = await getOSMatch(emp.cuit)
    if (cached && !force && diasDesde(cached.consultadoEn) < TTL_DIAS) {
      omitidas++
      continue
    }

    consultadas++
    process.stdout.write(`[${consultadas}/${empresas.length}] ${emp.nombre.slice(0, 40).padEnd(40)} … `)

    try {
      const results = await matchOpenSanctions({
        schema: 'Company',
        name: emp.nombre,
        country: 'AR',
      })

      const top = results[0]
      const riesgo = top ? esRiesgoAlto(top) : { riesgo: null, detalle: '' }

      await upsertOSMatch({
        cuit: emp.cuit,
        nombre: emp.nombre,
        matched: !!top,
        riesgo: riesgo.riesgo,
        datasetPrincipal: top?.datasets?.[0] ?? null,
        entidadId: top?.id ?? null,
        entidadCaption: top?.caption ?? null,
        entidadUrl: top
          ? `https://www.opensanctions.org/entities/${top.id}/`
          : null,
        consultadoEn: new Date().toISOString(),
      })

      cacheadas++
      if (top) {
        matched++
        const flag = riesgo.riesgo ? `⚠ ${riesgo.riesgo.toUpperCase()}` : 'match'
        console.log(`${flag} — ${top.caption}`)
      } else {
        console.log('sin match')
      }
    } catch (err) {
      console.log(`ERROR: ${String(err).split('\n')[0]}`)
    }

    await sleep(PAUSE_MS)
  }

  const totales = await getOSMatchesCount()
  console.log(`\n=== Resultado ===`)
  console.log(`Consultadas en esta corrida: ${consultadas}`)
  console.log(`Cacheadas: ${cacheadas}`)
  console.log(`Con match: ${matched}`)
  console.log(`Omitidas (cache vigente): ${omitidas}`)
  console.log(`\nTotal en cache: ${totales.total} (${totales.matched} con match)`)
  console.log(`\n✓ Próximo paso: npm run analyze --force`)
  console.log(`  Esto recalculará señales incluyendo aparicion_offshore`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
