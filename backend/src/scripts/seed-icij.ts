// seed-icij.ts — Carga la base de datos ICIJ Offshore Leaks en DuckDB
//
// Pre-requisito: descargar los CSVs de https://offshoreleaks.icij.org/pages/database
// y extraer el ZIP a un directorio local.
//
// Uso:
//   npm run seed:icij -- /ruta/al/directorio-extraido
//   npm run seed:icij -- /ruta/al/directorio --force
//   npm run seed:icij -- /ruta/al/directorio --solo-ar  # Solo entidades con país AR
//
// Al finalizar, cruza los registros contra la tabla `empresas` (proveedores con CUIT)
// y actualiza `opensanctions_matches` para que `npm run analyze` detecte riesgo offshore
// sin requerir llamadas API.
//
// Métricas típicas del dataset completo:
//   Entities.csv  ~830K registros
//   Officers.csv  ~780K registros
//   Total carga: ~5-10 min según hardware

import 'dotenv/config'
import path from 'path'
import {
  initDb, dbAll,
  insertICIJBatch, getICIJCount,
  upsertOSMatch,
} from '../lib/db'
import { parsearEntidades, parsearOfficers, encontrarArchivosICIJ } from '../lib/icij'

const BATCH_SIZE = 1_000

function parseArgs() {
  const args = process.argv.slice(2)
  const dirArg = args.find(a => !a.startsWith('--'))
  return {
    dirPath: dirArg ? path.resolve(dirArg) : null,
    force: args.includes('--force'),
    soloAR: args.includes('--solo-ar'),
  }
}

async function main() {
  console.log('=== ARGOS — Seed ICIJ Offshore Leaks ===\n')

  const { dirPath, force, soloAR } = parseArgs()

  if (!dirPath) {
    console.error('Falta el directorio con los CSVs de ICIJ.')
    console.error('')
    console.error('Pasos:')
    console.error('  1. Descargar: https://offshoreleaks.icij.org/pages/database')
    console.error('  2. Extraer el ZIP a un directorio local')
    console.error('  3. Ejecutar: npm run seed:icij -- /ruta/al/directorio')
    console.error('')
    console.error('Opciones:')
    console.error('  --force    Recargar aunque ya haya datos cargados')
    console.error('  --solo-ar  Solo cargar entidades con country_codes=ARG (más rápido)')
    process.exit(1)
  }

  await initDb()

  const existente = await getICIJCount()
  if (existente.total > 0 && !force) {
    console.log(`Ya hay ${existente.total.toLocaleString()} entidades ICIJ en la base.`)
    console.log('Use --force para recargar.\n')
    console.log('Fuentes cargadas:')
    for (const [fuente, cnt] of Object.entries(existente.fuentes)) {
      console.log(`  ${fuente}: ${cnt.toLocaleString()}`)
    }

    // Igual cruzamos contra empresas por si se agregaron nuevas desde la última carga
    console.log('\nActualizando cruces contra empresas con CUIT...')
    await cruzarConEmpresas()
    process.exit(0)
  }

  // ─── Descubrir archivos ────────────────────────────────────────────────────
  console.log(`Buscando CSVs en: ${dirPath}`)
  let archivos: { entities: string | null; officers: string | null }
  try {
    archivos = encontrarArchivosICIJ(dirPath)
  } catch (err) {
    console.error(`Error: ${(err as Error).message}`)
    process.exit(1)
  }

  if (!archivos.entities && !archivos.officers) {
    console.error('No se encontraron Entities.csv ni Officers.csv en el directorio.')
    console.error('Verificar que el ZIP fue extraído correctamente.')
    process.exit(1)
  }

  // ─── Cargar Entities.csv ───────────────────────────────────────────────────
  if (archivos.entities) {
    console.log(`\nCargando Entities.csv...`)
    let totalEntidades = 0
    let insertadas = 0
    let batch: Parameters<typeof insertICIJBatch>[0] = []

    const entidades = await parsearEntidades(archivos.entities, n => {
      process.stdout.write(`\r  Procesando: ${n.toLocaleString()} entidades...`)
    })
    process.stdout.write('\n')

    const filtradas = soloAR
      ? entidades.filter(e => e.countryCodes?.includes('ARG') || e.countries?.includes('Argentina'))
      : entidades

    console.log(`  Total en CSV: ${entidades.length.toLocaleString()}`)
    if (soloAR) console.log(`  Filtradas a AR: ${filtradas.length.toLocaleString()}`)

    for (const e of filtradas) {
      batch.push(e)
      if (batch.length >= BATCH_SIZE) {
        insertadas += await insertICIJBatch(batch)
        batch = []
        totalEntidades = insertadas
        process.stdout.write(`\r  Insertadas: ${insertadas.toLocaleString()}`)
      }
    }
    if (batch.length > 0) {
      insertadas += await insertICIJBatch(batch)
    }
    console.log(`\n  ✓ ${insertadas.toLocaleString()} entidades insertadas`)
  }

  // ─── Cargar Officers.csv ───────────────────────────────────────────────────
  if (archivos.officers) {
    console.log(`\nCargando Officers.csv (personas y representantes)...`)
    let insertadas = 0
    let batch: Parameters<typeof insertICIJBatch>[0] = []

    const officers = await parsearOfficers(archivos.officers, n => {
      process.stdout.write(`\r  Procesando: ${n.toLocaleString()} officers...`)
    })
    process.stdout.write('\n')

    const filtrados = soloAR
      ? officers.filter(o => o.countryCodes?.includes('ARG') || o.countries?.includes('Argentina'))
      : officers

    console.log(`  Total en CSV: ${officers.length.toLocaleString()}`)
    if (soloAR) console.log(`  Filtrados a AR: ${filtrados.length.toLocaleString()}`)

    for (const o of filtrados) {
      batch.push(o)
      if (batch.length >= BATCH_SIZE) {
        insertadas += await insertICIJBatch(batch)
        batch = []
        process.stdout.write(`\r  Insertadas: ${insertadas.toLocaleString()}`)
      }
    }
    if (batch.length > 0) {
      insertadas += await insertICIJBatch(batch)
    }
    console.log(`\n  ✓ ${insertadas.toLocaleString()} officers insertados`)
  }

  // ─── Cruzar contra empresas ARGOS ─────────────────────────────────────────
  console.log('\nCruzando contra empresas con CUIT (para señal aparicion_offshore)...')
  const cruzadas = await cruzarConEmpresas()

  // ─── Resumen ───────────────────────────────────────────────────────────────
  const final = await getICIJCount()
  console.log('\n=== Resultado ===')
  console.log(`Total entidades ICIJ en DB: ${final.total.toLocaleString()}`)
  for (const [fuente, cnt] of Object.entries(final.fuentes)) {
    console.log(`  ${fuente}: ${cnt.toLocaleString()}`)
  }
  console.log(`Empresas ARGOS cruzadas con ICIJ: ${cruzadas}`)
  console.log('\n✓ Seed ICIJ completado.')
  console.log('  Próximo paso: npm run analyze --force')
  console.log('  La señal aparicion_offshore ahora consulta ICIJ local (sin API).')
  process.exit(0)
}

// Cruza la tabla `empresas` (proveedores con CUIT) contra icij_entidades por
// nombre normalizado. Para cada empresa que matchea, actualiza opensanctions_matches
// con riesgo='offshore' y dataset=ICIJ. Usa nombres normalizados — no es match
// exacto, pero ICIJ tiene transliteraciones y variantes que el LIKE captura bien.
async function cruzarConEmpresas(): Promise<number> {
  const empresas = await dbAll<{ cuit: string; nombre: string }>(
    `SELECT cuit, nombre FROM empresas WHERE cuit IS NOT NULL AND cuit != ''`
  )
  if (empresas.length === 0) {
    console.log('  Sin empresas en DB. Ejecutar seed:afip primero.')
    return 0
  }

  let cruzadas = 0
  const now = new Date().toISOString()

  for (const emp of empresas) {
    const norm = emp.nombre
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9 ]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()

    if (norm.length < 4) continue

    const matches = await dbAll<{ nombre: string; fuente: string; node_id: string }>(
      `SELECT nombre, fuente, node_id FROM icij_entidades
       WHERE nombre_norm LIKE ? LIMIT 3`,
      [`%${norm}%`]
    )

    if (matches.length > 0) {
      const top = matches[0]
      await upsertOSMatch({
        cuit: emp.cuit,
        nombre: emp.nombre,
        matched: true,
        riesgo: 'offshore',
        datasetPrincipal: top.fuente,
        entidadId: top.node_id,
        entidadCaption: top.nombre,
        entidadUrl: `https://offshoreleaks.icij.org/nodes/${top.node_id}`,
        consultadoEn: now,
      })
      cruzadas++
    }
  }

  return cruzadas
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
