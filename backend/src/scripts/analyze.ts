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
import type { EmpresaEnriquecida, Señal } from '../types'

// Extrae los CUITs de las entidades implicadas en una señal mirando título y
// evidencia para encontrar nombres de proveedores presentes en el Map de empresas.
// Esto desbloquea la asociación señal↔entidad sin string matching frágil en el
// frontend (Sprint 2 del plan ARGOS v3.0).
function extraerCuits(señal: Señal, empresas: Map<string, EmpresaEnriquecida>): string[] {
  if (empresas.size === 0) return []
  const cuits = new Set<string>()
  const haystack = (
    señal.titulo + ' ' +
    señal.evidencia.map(e => e.descripcion).join(' ')
  ).toUpperCase()
  for (const [nombre, emp] of empresas) {
    if (!emp.cuit) continue
    if (nombre.length < 4) continue // evita falsos positivos en siglas
    if (haystack.includes(nombre)) {
      cuits.add(emp.cuit)
    }
  }
  return Array.from(cuits)
}

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
      const cuits = extraerCuits(s, empresas)
      await insertSeñalCache(municipio, s, cuits)
    }

    totalSeñales += señales.length
    const conCuits = señales.filter(s => extraerCuits(s, empresas).length > 0).length
    console.log(`[${municipio}] ✓ ${señales.length} señales detectadas (${conCuits} con CUITs asociados):`)
    for (const s of señales) {
      const cuits = extraerCuits(s, empresas)
      const cuitsStr = cuits.length > 0 ? ` [cuits: ${cuits.length}]` : ''
      console.log(`  [${s.score}] [${s.legal.severidad}] ${s.tipologia}${cuitsStr}: ${s.titulo.slice(0, 80)}`)
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
