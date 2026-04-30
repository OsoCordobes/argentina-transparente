// seed-cordoba-normas.ts — Carga normas de contratación pública de Córdoba
// Capital usando la API REST oficial del boletín municipal (estructurada,
// sin OCR).
//
// Cobertura: 2020-05-22 → presente (actualmente ~856 boletines hasta 2026-04-21).
// Para 2013-2018 ver seed-cordoba-csv-historico.ts (a implementar — usa el
// dataset 5493 de gobiernoabierto.cordoba.gob.ar).
//
// Pipeline:
//   1. GET /apibridge/ciudadano/boletin → 856 boletines con normas anidadas
//   2. Aplanar a lista de Publicaciones individuales
//   3. Filtrar por keywords de contratación (~3-5% pasa)
//   4. Extraer Contrato structured con Claude texto-only + prompt caching
//   5. Insertar con nivel_confianza='medio' (extracción semántica)
//
// Costo esperado: ~$2-5 USD para todo el período, vs ~$200+ con Vision API.
//
// Uso:
//   npm run seed:cordoba-normas                       # rango completo
//   npm run seed:cordoba-normas -- --discover         # solo cuenta normas relevantes, no extrae
//   npm run seed:cordoba-normas -- --max-normas 100   # tope para test
//   npm run seed:cordoba-normas -- --max-cost-usd 1   # corte por costo

import 'dotenv/config'
import {
  initDb, insertContratoBatch, registrarFuente, getContratosCount,
} from '../lib/db'
import {
  listarBoletines, aplanarPublicaciones, filtrarRelevantes,
} from '../lib/boletin-cordoba-api'
import { extraerContratosDeNormas } from '../lib/extractor-norma'
import type { FuenteMetadata } from '../types'

const MUNICIPIO = 'cordoba-capital'

interface Args {
  maxNormas: number | null
  maxCostUSD: number | null
  discover: boolean
  dryRun: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = { maxNormas: null, maxCostUSD: null, discover: false, dryRun: false }
  for (let i = 0; i < args.length; i++) {
    const a = args[i], n = args[i + 1]
    if (a === '--max-normas')         { out.maxNormas = parseInt(n); i++ }
    else if (a === '--max-cost-usd')  { out.maxCostUSD = parseFloat(n); i++ }
    else if (a === '--discover')      { out.discover = true }
    else if (a === '--dry-run')       { out.dryRun = true }
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Seed Córdoba Normas (API Boletín Municipal) ===\n')
  const args = parseArgs()

  if (!process.env.ANTHROPIC_API_KEY && !args.discover && !args.dryRun) {
    console.error('Falta ANTHROPIC_API_KEY (no requerida con --discover ni --dry-run)')
    process.exit(1)
  }

  await initDb()

  // ─── 1. Descargar todos los boletines de la API ─────────────────────────────
  console.log('Descargando todos los boletines (puede tardar 10-30s, payload ~4MB)...')
  const t0 = Date.now()
  const boletines = await listarBoletines()
  console.log(`✓ ${boletines.length} boletines descargados en ${Date.now() - t0}ms`)

  if (boletines.length > 0) {
    const primero = boletines[0]
    const ultimo = boletines[boletines.length - 1]
    console.log(`  Primer boletín: #${primero.Numero} (${primero.Fecha?.slice(0, 10)})`)
    console.log(`  Último boletín: #${ultimo.Numero} (${ultimo.Fecha?.slice(0, 10)})`)
  }

  // ─── 2. Aplanar y filtrar ───────────────────────────────────────────────────
  const todasLasPubs = aplanarPublicaciones(boletines)
  console.log(`\nNormas totales (aplanadas): ${todasLasPubs.length.toLocaleString()}`)

  const relevantes = filtrarRelevantes(todasLasPubs)
  console.log(`Normas relevantes (matchean keywords contratación): ${relevantes.length.toLocaleString()} (${((relevantes.length / todasLasPubs.length) * 100).toFixed(1)}%)`)

  // Distribución por año
  const porAnio = new Map<number, number>()
  for (const p of relevantes) {
    const a = parseInt(p.FechaSancion?.slice(0, 4) ?? p.FechaPublicacion?.slice(0, 4) ?? '0')
    if (a > 0) porAnio.set(a, (porAnio.get(a) ?? 0) + 1)
  }
  console.log('\nDistribución por año (relevantes):')
  for (const [anio, cnt] of [...porAnio.entries()].sort((a, b) => a[0] - b[0])) {
    console.log(`  ${anio}: ${cnt}`)
  }

  if (args.discover) {
    console.log('\n--discover: terminando sin extraer.')
    console.log('\nMuestra (primeras 3 normas relevantes):')
    for (const p of relevantes.slice(0, 3)) {
      console.log(`  • [${p.TipoNorma} ${p.NormaNumero}] ${p.Asunto.slice(0, 120)}`)
    }
    process.exit(0)
  }

  // ─── 3. Aplicar tope ────────────────────────────────────────────────────────
  let aProcesar = relevantes
  if (args.maxNormas && aProcesar.length > args.maxNormas) {
    console.log(`\nLimitando a ${args.maxNormas} normas (--max-normas)`)
    aProcesar = aProcesar.slice(0, args.maxNormas)
  }

  // Estimación: ~150 input tokens/norma + ~50 output tokens/norma → ~$0.0007 por norma con cache
  const costoEstimado = aProcesar.length * 0.0007
  console.log(`\nCosto estimado: ~$${costoEstimado.toFixed(2)} USD para ${aProcesar.length} normas`)

  if (args.maxCostUSD && costoEstimado > args.maxCostUSD) {
    console.log(`⚠ Excede --max-cost-usd ($${args.maxCostUSD}). Habrá corte automático al alcanzar el tope.`)
  }

  if (args.dryRun) {
    console.log('--dry-run: terminando sin extraer.')
    process.exit(0)
  }

  // ─── 4. Registrar fuente ────────────────────────────────────────────────────
  const fuente: FuenteMetadata = {
    id: 'cordoba-capital-boletin-api',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://boletinmunicipal.cordoba.gob.ar/apibridge/ciudadano/boletin',
    formato: 'JSON (API REST)',
    oficial: true,
    nivelConfianza: 'medio',
    notas: 'API oficial del Boletín Municipal de Córdoba. Cubre desde 2020-05-22. ' +
           'Las normas incluyen Asunto en texto libre — el proveedor/monto se extrae via Claude Sonnet 4.6, por eso confianza="medio". ' +
           'Verificar contra fuente original (RutaDocFinal de cada Publicación) antes de denuncia formal.',
  }
  await registrarFuente(fuente)

  // ─── 5. Extraer ─────────────────────────────────────────────────────────────
  console.log(`\nExtrayendo contratos con Claude Sonnet 4.6 (texto-only + prompt caching)...`)

  let costoActual = 0
  const resultado = await extraerContratosDeNormas(aProcesar, {
    onProgress: (procesadas, total, contratos, costo) => {
      costoActual = costo
      const pct = ((procesadas / total) * 100).toFixed(0)
      process.stdout.write(
        `\r  [${procesadas}/${total}] ${pct}% | ${contratos} contratos | $${costo.toFixed(4)}`
      )
      // Corte por costo
      if (args.maxCostUSD && costo >= args.maxCostUSD) {
        process.stdout.write('\n  ⚠ Alcanzado max-cost-usd, próximos batches abortan\n')
      }
    },
  })
  process.stdout.write('\n')

  console.log(`\n✓ ${resultado.contratos.length} contratos extraídos`)
  console.log(`  Cache hit fraction: ${(resultado.cacheReadFraction * 100).toFixed(0)}%`)
  console.log(`  Input tokens:  ${resultado.inputTokensTotal.toLocaleString()}`)
  console.log(`  Output tokens: ${resultado.outputTokensTotal.toLocaleString()}`)
  console.log(`  Costo total:   $${resultado.costoTotalUSD.toFixed(4)} USD`)
  if (resultado.erroresTotal > 0) {
    console.log(`  Errores/skips: ${resultado.erroresTotal}`)
  }

  // ─── 6. Insertar ────────────────────────────────────────────────────────────
  if (resultado.contratos.length > 0) {
    const inserted = await insertContratoBatch(MUNICIPIO, resultado.contratos)
    const total = await getContratosCount(MUNICIPIO)
    console.log(`\n✓ ${inserted} contratos insertados (total ${MUNICIPIO}: ${total})`)
    console.log(`\nPróximo paso: npm run analyze --force`)
  }

  process.exit(0)
}

main().catch(err => { console.error('\nError fatal:', err); process.exit(1) })
