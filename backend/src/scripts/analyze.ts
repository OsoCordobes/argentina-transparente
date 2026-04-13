// analyze.ts — Corre todas las señales contra la base completa y cachea resultados
//
// Pre-requisito: npm run seed:cordoba (datos cargados en DuckDB)
//
// Ejecutar: npm run analyze
// Con --force: recalcula aunque ya haya señales cacheadas

import 'dotenv/config'
import {
  initDb, getAllContratos, getContratosCount, dbAll,
  clearSeñalesCache, insertSeñalCache, getSeñalesCacheCount,
} from '../lib/db'
import { initGraph } from '../lib/graph'
import { calcularSeñales } from '../engine/signals'
import type { EmpresaEnriquecida } from '../types'

const MUNICIPIOS = ['cordoba-capital']

async function main() {
  console.log('=== ARGOS — Analyze ===\n')

  await initDb()
  await initGraph()

  const totalContratos = await getContratosCount()
  if (totalContratos === 0) {
    console.error('No hay contratos en la base de datos.')
    console.error('Ejecutar primero: npm run seed:cordoba')
    process.exit(1)
  }

  const existingSeñales = await getSeñalesCacheCount()
  const force = process.argv.includes('--force')

  if (existingSeñales > 0 && !force) {
    console.log(`Ya hay ${existingSeñales} señales cacheadas. Use --force para recalcular.`)
    process.exit(0)
  }

  if (existingSeñales > 0) {
    console.log('Limpiando señales anteriores...')
    await clearSeñalesCache()
  }

  let totalSeñales = 0

  for (const municipio of MUNICIPIOS) {
    const count = await getContratosCount(municipio)
    console.log(`\n[${municipio}] ${count.toLocaleString()} contratos`)

    if (count === 0) {
      console.log(`[${municipio}] Sin datos, saltando`)
      continue
    }

    const contratos = await getAllContratos(municipio)
    console.log(`[${municipio}] Calculando señales...`)

    // Load AFIP enrichment data from empresas table
    const empresasRows = await dbAll<any>(`SELECT * FROM empresas`)
    const empresas = new Map<string, EmpresaEnriquecida>()
    for (const row of empresasRows) {
      empresas.set(row.nombre.trim().toUpperCase(), {
        cuit: row.cuit,
        razonSocial: row.nombre,
        esEmpleador: row.es_empleador,
        inicioActividades: row.inicio_actividades,
        estado: row.estado,
        actividadPrincipal: row.actividad_principal,
        directores: [],
        encontrado: true,
        fuenteUrl: row.fuente_url ?? '',
      })
    }
    if (empresas.size > 0) {
      console.log(`[${municipio}] ${empresas.size} empresas con enriquecimiento AFIP`)
    }

    const señales = await calcularSeñales(contratos, empresas, municipio)

    for (const s of señales) {
      await insertSeñalCache(municipio, s)
    }

    totalSeñales += señales.length
    console.log(`[${municipio}] ✓ ${señales.length} señales detectadas:`)
    for (const s of señales) {
      console.log(`  [${s.score}] [${s.legal.severidad}] ${s.tipologia}: ${s.titulo.slice(0, 80)}`)
    }
  }

  console.log(`\n=== Resultado ===`)
  console.log(`Total señales cacheadas: ${totalSeñales}`)
  console.log(`\n✓ Análisis completo. Dashboard listo.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
