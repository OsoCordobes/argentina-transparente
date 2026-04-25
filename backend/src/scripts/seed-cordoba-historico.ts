// seed-cordoba-historico.ts — Pipeline completo de carga histórica del
// Boletín Municipal de Córdoba 2013 → presente.
//
// Combina dos fuentes en un solo flujo:
//   1. Dataset CSV 5493 (2013-2018) — 32,895 filas estructuradas
//   2. API REST /apibridge/ciudadano/boletin (2020-05-22 → presente) — 856 boletines
//
// Gap conocido: 2019 + ene-may 2020 (~1.5 años sin dataset estructurado).
// Para esos años se necesita OCR de PDFs (script separado: seed:boletin).
//
// Uso:
//   npm run seed:cordoba-historico                         # corrida completa
//   npm run seed:cordoba-historico -- --solo-csv           # solo 2013-2018
//   npm run seed:cordoba-historico -- --solo-api           # solo 2020+
//   npm run seed:cordoba-historico -- --max-cost-usd 5     # corte por costo
//   npm run seed:cordoba-historico -- --dry-run            # estimación sin gasto
//
// Pre-requisitos:
//   - ANTHROPIC_API_KEY en .env (para el extractor)
//   - Conexión a gobiernoabierto.cordoba.gob.ar y boletinmunicipal.cordoba.gob.ar
//
// El extractor aplica HARD GUARDRAILS de traceability — todo proveedor o monto
// que no aparezca literalmente en el Asunto se descarta. Cada Contrato apunta
// a su norma fuente vía numeroContrato + numeroExpediente + fuenteUrl.

import 'dotenv/config'
import {
  initDb, insertContratoBatch, registrarFuente, getContratosCount,
} from '../lib/db'
import {
  listarBoletines, aplanarPublicaciones, filtrarRelevantes,
  type PublicacionPlana,
} from '../lib/boletin-cordoba-api'
import { cargarHistorico } from '../lib/boletin-cordoba-csv'
import { extraerContratosDeNormas } from '../lib/extractor-norma'
import type { FuenteMetadata } from '../types'

const MUNICIPIO = 'cordoba-capital'

interface Args {
  soloApi: boolean
  soloCsv: boolean
  maxCostUSD: number | null
  maxNormas: number | null
  dryRun: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = {
    soloApi: false, soloCsv: false, maxCostUSD: null, maxNormas: null, dryRun: false,
  }
  for (let i = 0; i < args.length; i++) {
    const a = args[i], n = args[i + 1]
    if (a === '--solo-api')           out.soloApi = true
    else if (a === '--solo-csv')      out.soloCsv = true
    else if (a === '--max-cost-usd') { out.maxCostUSD = parseFloat(n); i++ }
    else if (a === '--max-normas')   { out.maxNormas = parseInt(n); i++ }
    else if (a === '--dry-run')       out.dryRun = true
  }
  return out
}

async function recolectar(args: Args): Promise<{
  desdeApi: PublicacionPlana[]
  desdeCsv: PublicacionPlana[]
}> {
  let desdeApi: PublicacionPlana[] = []
  let desdeCsv: PublicacionPlana[] = []

  if (!args.soloCsv) {
    console.log('\n━━━ Fase 1: API REST (2020-05-22 → presente) ━━━')
    const boletines = await listarBoletines()
    console.log(`✓ ${boletines.length} boletines descargados`)
    const todas = aplanarPublicaciones(boletines)
    desdeApi = filtrarRelevantes(todas)
    console.log(`✓ ${todas.length.toLocaleString()} normas aplanadas → ${desdeApi.length} relevantes (${((desdeApi.length / todas.length) * 100).toFixed(1)}%)`)
  }

  if (!args.soloApi) {
    console.log('\n━━━ Fase 2: CSV histórico (2013-2018) ━━━')
    try {
      const todasCsv = await cargarHistorico()
      desdeCsv = filtrarRelevantes(todasCsv)
      console.log(`✓ ${todasCsv.length.toLocaleString()} normas históricas → ${desdeCsv.length} relevantes (${((desdeCsv.length / todasCsv.length) * 100).toFixed(1)}%)`)
    } catch (err) {
      console.warn(`✗ Error cargando CSV histórico: ${(err as Error).message}`)
      console.warn('  Continuando sin datos 2013-2018')
    }
  }

  return { desdeApi, desdeCsv }
}

function imprimirDistribucion(label: string, pubs: PublicacionPlana[]) {
  if (pubs.length === 0) return
  const porAnio = new Map<number, number>()
  for (const p of pubs) {
    const a = parseInt(p.FechaSancion?.slice(0, 4) ?? p.FechaPublicacion?.slice(0, 4) ?? '0')
    if (a > 0) porAnio.set(a, (porAnio.get(a) ?? 0) + 1)
  }
  console.log(`\n${label}:`)
  for (const [anio, cnt] of [...porAnio.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${anio}: ${cnt}`)
  }
}

async function procesarFuente(
  publicaciones: PublicacionPlana[],
  fuenteId: string,
  fuenteNombre: string,
  args: Args,
  costoAcumuladoInicial: number,
): Promise<{ contratosInsertados: number; costoEstaCorrida: number }> {
  if (publicaciones.length === 0) return { contratosInsertados: 0, costoEstaCorrida: 0 }

  let aProcesar = publicaciones
  if (args.maxNormas) {
    aProcesar = aProcesar.slice(0, Math.max(0, args.maxNormas))
    console.log(`Limitado a ${aProcesar.length} normas (--max-normas)`)
  }

  console.log(`\nExtrayendo contratos de ${fuenteNombre} (${aProcesar.length} normas)...`)

  const resultado = await extraerContratosDeNormas(aProcesar, {
    maxCostUSD: args.maxCostUSD ?? undefined,
    costoAcumInicial: costoAcumuladoInicial,
    onProgress: (procesadas, total, contratos, costo) => {
      const costoTotal = costoAcumuladoInicial + costo
      const pct = ((procesadas / total) * 100).toFixed(0)
      process.stdout.write(
        `\r  [${procesadas}/${total}] ${pct}% | ${contratos} contratos | $${costoTotal.toFixed(4)} acum`
      )
    },
  })
  process.stdout.write('\n')

  console.log(`  ✓ ${resultado.contratos.length} contratos válidos (${resultado.erroresTotal} descartados por guardrails)`)
  console.log(`  Cache hit: ${(resultado.cacheReadFraction * 100).toFixed(0)}% | costo: $${resultado.costoTotalUSD.toFixed(4)}`)

  let inserted = 0
  if (resultado.contratos.length > 0) {
    inserted = await insertContratoBatch(MUNICIPIO, resultado.contratos)
    console.log(`  ✓ ${inserted} contratos insertados (${resultado.contratos.length - inserted} duplicados omitidos)`)
  }

  return { contratosInsertados: inserted, costoEstaCorrida: resultado.costoTotalUSD }
}

async function main() {
  console.log('=== ARGOS — Pipeline Histórico Córdoba (2013 → presente) ===')
  const args = parseArgs()

  if (!process.env.ANTHROPIC_API_KEY && !args.dryRun) {
    console.error('\nFalta ANTHROPIC_API_KEY. Configurar:')
    console.error('  export ANTHROPIC_API_KEY=sk-ant-...')
    console.error('  o agregar a backend/.env')
    process.exit(1)
  }

  await initDb()

  // Recolectar publicaciones de ambas fuentes
  const { desdeApi, desdeCsv } = await recolectar(args)
  const totalRelevantes = desdeApi.length + desdeCsv.length

  imprimirDistribucion('Distribución por año (todas las fuentes)', [...desdeApi, ...desdeCsv])

  // Estimación de costo
  // ~150 input tokens/norma + ~50 output tokens/norma → ~$0.0007/norma con cache
  const costoEstimado = totalRelevantes * 0.0007
  console.log(`\nCosto estimado total: ~$${costoEstimado.toFixed(2)} USD para ${totalRelevantes.toLocaleString()} normas`)

  if (args.maxCostUSD && costoEstimado > args.maxCostUSD) {
    console.log(`⚠ Excede --max-cost-usd ($${args.maxCostUSD}). Habrá corte automático.`)
  }

  if (args.dryRun) {
    console.log('\n--dry-run: terminando sin extraer.')
    process.exit(0)
  }

  // Registrar fuentes una vez
  const fuenteApi: FuenteMetadata = {
    id: 'cordoba-capital-boletin-api',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://boletinmunicipal.cordoba.gob.ar/apibridge/ciudadano/boletin',
    formato: 'JSON (API REST)',
    oficial: true,
    nivelConfianza: 'medio',
    notas: 'API oficial. Cobertura 2020-05-22+. proveedor/monto extraídos del Asunto vía Sonnet 4.6 con guardrails de traceability literal.',
  }
  const fuenteCsv: FuenteMetadata = {
    id: 'cordoba-capital-boletin-historico',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/administracion-publica/boletines-municipales/2781',
    formato: 'XLSX (Dataset CKAN)',
    oficial: true,
    nivelConfianza: 'medio',
    notas: 'Dataset histórico 2013-2018 (32,895 normas). Mismos guardrails que la fuente API.',
  }
  await registrarFuente(fuenteApi)
  await registrarFuente(fuenteCsv)

  // Procesar (CSV primero porque es más volumen — el cache del system prompt
  // se calienta con CSV y se reusa en API)
  let costoTotal = 0
  let totalInsertados = 0

  if (desdeCsv.length > 0) {
    const r = await procesarFuente(desdeCsv, fuenteCsv.id, 'CSV 2013-2018', args, costoTotal)
    costoTotal += r.costoEstaCorrida
    totalInsertados += r.contratosInsertados

    if (args.maxCostUSD && costoTotal >= args.maxCostUSD) {
      console.log(`\n⚠ Alcanzado max-cost-usd, omitiendo fase API.`)
    } else if (desdeApi.length > 0) {
      const r2 = await procesarFuente(desdeApi, fuenteApi.id, 'API REST 2020+', args, costoTotal)
      costoTotal += r2.costoEstaCorrida
      totalInsertados += r2.contratosInsertados
    }
  } else if (desdeApi.length > 0) {
    const r = await procesarFuente(desdeApi, fuenteApi.id, 'API REST 2020+', args, costoTotal)
    costoTotal += r.costoEstaCorrida
    totalInsertados += r.contratosInsertados
  }

  // Resumen
  const totalCordoba = await getContratosCount(MUNICIPIO)
  console.log(`\n━━━ Resumen final ━━━`)
  console.log(`Contratos insertados esta corrida: ${totalInsertados.toLocaleString()}`)
  console.log(`Total ${MUNICIPIO} en DB:           ${totalCordoba.toLocaleString()}`)
  console.log(`Costo total:                       $${costoTotal.toFixed(4)} USD`)
  console.log(`\n✓ Próximo paso: npm run analyze --force`)

  process.exit(0)
}

main().catch(err => { console.error('\nError fatal:', err); process.exit(1) })
