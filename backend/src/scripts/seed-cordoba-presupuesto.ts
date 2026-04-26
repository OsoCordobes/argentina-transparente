// seed-cordoba-presupuesto.ts — Carga ejecución presupuestaria + presupuesto
// + recursos de Córdoba Capital desde gobiernoabierto.cordoba.gob.ar.
//
// Datasets:
//   - 14:  Presupuesto anual (20 versiones 2007-2026, XLSX) — partidas asignadas
//   - 65:  Ejecución de erogaciones (41 versiones 2018-2025, XLSX) — gasto real mensual
//   - 12:  Ejecución de recursos (63 versiones 2018-2025, XLSX) — recaudación mensual
//   - 187: Cuenta General del Ejercicio (12 versiones 2014-2022). Solo v6461
//          (Cuenta Ahorro-Inversión-Financiamiento 2022) tiene XLS — el resto
//          son PDF y se procesan en M2 (OCR pipeline). Catalogamos las 12.
//
// Cada fila → tabla `presupuesto_ejecucion`.

import 'dotenv/config'
import crypto from 'crypto'
import {
  initDb, dbRun, registrarFuente, registrarFuenteCatalogo,
} from '../lib/db'
import {
  listarVersionesDataset, descargarRecursoDeVersion,
  parsearTablaConHeaderDetectable,
  inferirAnioMesDesdeTitulo, parseMontoAR,
} from '../lib/cordoba-portal'
import type { FuenteMetadata } from '../types'

const JURISDICCION = 'cordoba-capital'

interface DatasetPresup {
  datasetId: string
  tipo: 'presupuesto' | 'erogaciones' | 'recursos'
  nombre: string
  /** Keywords del header tabular real (no del título). minMatches: 1. */
  headerKeywords: string[]
}

const DATASETS: DatasetPresup[] = [
  {
    datasetId: '14', tipo: 'presupuesto', nombre: 'Presupuesto anual',
    headerKeywords: ['partida', 'programa', 'jurisdic', 'credito', 'devengado', 'pagado', 'denomina', 'codigo'],
  },
  {
    datasetId: '65', tipo: 'erogaciones', nombre: 'Ejecución de erogaciones',
    headerKeywords: ['partida', 'comprometido', 'devengado', 'vigente', 'pagado', 'denomina', 'codigo'],
  },
  {
    datasetId: '12', tipo: 'recursos', nombre: 'Ejecución de recursos',
    headerKeywords: ['concepto', 'recaudacion', 'recaudado', 'calculo', 'calculado', 'estimado', 'cod'],
  },
  // Dataset 187 — Cuenta General del Ejercicio NO se incluye aquí: 11 de 12
  // versiones son PDF (requieren OCR M2) y el formato XLS de v6461 es un
  // resumen ahorro-inversión-financiamiento, no encaja en presupuesto_ejecucion.
  // Se cataloga abajo como 'pendiente' para que la UI Fuentes lo muestre.
]

const DATASET_187_ID = '187'
const DATASET_187_NOMBRE = 'Cuenta General del Ejercicio'

function pickColumnaTexto(row: Record<string, unknown>, regexes: RegExp[]): string | null {
  for (const k of Object.keys(row)) {
    for (const re of regexes) {
      if (re.test(k)) {
        const v = row[k]
        if (v !== null && v !== undefined && String(v).trim()) return String(v).trim()
      }
    }
  }
  return null
}

function pickMonto(row: Record<string, unknown>, regexes: RegExp[]): number | null {
  for (const k of Object.keys(row)) {
    for (const re of regexes) {
      if (re.test(k)) {
        const v = parseMontoAR(row[k])
        if (v !== null) return v
      }
    }
  }
  return null
}

async function procesarDataset(d: DatasetPresup): Promise<number> {
  console.log(`\n=== Dataset ${d.datasetId} (${d.nombre}) ===`)
  let versiones: Awaited<ReturnType<typeof listarVersionesDataset>>
  try {
    versiones = await listarVersionesDataset(d.datasetId)
  } catch (err) {
    console.warn(`  ✗ Error: ${(err as Error).message}`)
    return 0
  }
  console.log(`  ${versiones.length} versiones`)

  let totalInserted = 0
  const now = new Date().toISOString()

  let skipSinAnio = 0
  let skipSinXls = 0
  let procesadas = 0

  for (const v of versiones) {
    const { anio, mes } = inferirAnioMesDesdeTitulo(v.titulo)
    if (!anio) {
      skipSinAnio++
      continue
    }

    let descarga: Awaited<ReturnType<typeof descargarRecursoDeVersion>>
    try {
      descarga = await descargarRecursoDeVersion(d.datasetId, v.id, ['xls', 'csv'])
    } catch {
      skipSinXls++
      continue
    }
    if (!descarga) {
      skipSinXls++
      continue
    }
    procesadas++

    // Los XLSX de presupuesto tienen 1-2 filas título antes del header
    // tabular real. Buscamos la primera fila con keywords específicas
    // del dataset (presupuesto vs erogaciones vs recursos).
    const filas = parsearTablaConHeaderDetectable(
      descarga.buffer,
      d.headerKeywords,
      { minMatches: 1, maxScanRows: 15 },
    )
    let nuevos = 0

    for (const row of filas) {
      // Regex amplias que cubren los 3 vocabularios:
      // - Presupuesto: programa, partida, codigo, denomina, credito, devengado, pagado
      // - Erogaciones: ídem + comprometido, vigente
      // - Recursos: concepto, cod, recaudacion, calculado, estimado
      const programa = pickColumnaTexto(row, [/programa/i, /actividad/i, /concepto/i, /clase/i, /objeto/i, /^p\.pr/i])
      const partida = pickColumnaTexto(row, [/partida.+codigo/i, /\bpartida$/i, /\bcodigo\b/i, /^cod\b/i, /^cod\./i, /^p\.pr/i])
      const partidaNombre = pickColumnaTexto(row, [/partida.+nombre/i, /partida.+denomina/i, /denomina/i, /^descrip/i, /^concepto$/i])
      const jurisdiccionCodigo = pickColumnaTexto(row, [/jurisdic.+codigo/i, /jurisdic.+nro/i])
      const jurisdiccionNombre = pickColumnaTexto(row, [/jurisdic.+nombre/i, /jurisdic.+denomina/i, /^jurisdic/i])

      // Montos: incluye recursos (recaudacion, calculado) además de presupuesto.
      // Nota: aceptamos formas singular/plural y variantes ("compromiso" vs
      // "comprometido", "devengado" vs "devengamiento") porque los XLSX viejos
      // de Córdoba (2010-2018) usan inconsistencia de género/número.
      const creditoInicial = pickMonto(row, [/credito.+inicial/i, /asignado/i, /presup.+inicial/i, /sancion/i, /calculado/i, /estimado/i])
      const creditoVigente = pickMonto(row, [/credito.+vigente/i, /vigente/i, /actual/i, /definitivo/i])
      const devengado = pickMonto(row, [/deveng/i, /compromis/i, /ejecutad/i])
      const pagado = pickMonto(row, [/pagad/i, /\bpag\b/i, /recaudad/i, /recaudaci/i, /abonad/i])

      // Saltar filas vacías
      if (creditoInicial === null && creditoVigente === null && devengado === null && pagado === null) continue
      if (!programa && !partida && !partidaNombre) continue

      const id = crypto.createHash('sha256').update([
        JURISDICCION, anio, mes ?? '',
        jurisdiccionCodigo ?? '', programa ?? '', partida ?? '', partidaNombre ?? '',
        creditoInicial ?? '', creditoVigente ?? '', devengado ?? '', pagado ?? '',
      ].join('|')).digest('hex').slice(0, 16)

      try {
        await dbRun(
          `INSERT OR IGNORE INTO presupuesto_ejecucion VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, JURISDICCION, anio,
            mes ? Math.ceil(mes / 3) : null,  // trimestre
            jurisdiccionCodigo, jurisdiccionNombre, programa, partida, partidaNombre,
            creditoInicial, creditoVigente, devengado, pagado,
            descarga.recurso.url.split('?')[0], now,
          ].slice(0, 14)
        )
        nuevos++
      } catch { /* dup */ }
    }
    if (nuevos > 0) {
      console.log(`  v${v.id} (${anio}${mes ? '-' + String(mes).padStart(2, '0') : ''}): ${nuevos} filas (${filas.length} parseadas)`)
    } else if (filas.length > 0) {
      // Versión con filas pero todas descartadas → log para diagnosticar
      const sample = filas[0] ? Object.keys(filas[0]).slice(0, 6).join(', ') : '∅'
      console.log(`  v${v.id} (${anio}): 0 insertadas de ${filas.length} filas. Cols sample: ${sample}`)
      // Dump un row con valores para ver formato real (solo el primero del ds)
      if (procesadas === 1 && filas.length > 0) {
        const dataRow = filas.find(r => Object.values(r).some(v => v !== null && v !== ''))
        if (dataRow) {
          console.log(`    sample row: ${JSON.stringify(dataRow).slice(0, 220)}`)
        }
      }
    }
    totalInserted += nuevos
  }

  console.log(`  → procesadas ${procesadas}, sin año ${skipSinAnio}, sin xls/csv ${skipSinXls}`)
  return totalInserted
}

async function main() {
  console.log('=== ARGOS — Seed Presupuesto Córdoba Capital ===\n')
  await initDb()

  await registrarFuente({
    id: 'cordoba-capital-presupuesto',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/economia-y-finanzas/14',
    formato: 'XLSX (CKAN)',
    oficial: true,
    nivelConfianza: 'alto',
    notas: 'Datasets 14 (presupuesto anual 2007-2026), 65 (ejecución erogaciones mensual 2018-2025), 12 (ejecución recursos mensual 2018-2025). Datos verbatim — base de detección de partidas anómalas.',
  } as FuenteMetadata)

  for (const d of DATASETS) {
    await registrarFuenteCatalogo({
      id: `cordoba-capital-presupuesto-${d.datasetId}`,
      jurisdiccion: 'cordoba-capital',
      organismo: 'Municipalidad de Córdoba',
      dimension: 'presupuesto',
      nombre: d.nombre,
      descripcion: `Dataset ${d.datasetId} — ${d.tipo}`,
      urlOficial: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/dato/${d.datasetId}`,
      formato: 'XLSX',
      coberturaDesde: d.datasetId === '14' ? 2007 : 2018,
      coberturaHasta: 2026,
      volumenEstimado: 'mensual o anual según dataset',
      estadoImplementacion: 'implementado',
      razonBloqueo: null,
      conectorId: 'seed:cordoba-presupuesto',
    })
  }

  // Dataset 187 — catalogado como pendiente (PDF + format mismatch)
  await registrarFuenteCatalogo({
    id: `cordoba-capital-presupuesto-${DATASET_187_ID}`,
    jurisdiccion: 'cordoba-capital',
    organismo: 'Municipalidad de Córdoba',
    dimension: 'presupuesto',
    nombre: DATASET_187_NOMBRE,
    descripcion: 'Dataset 187 — Cuenta General Ejercicio anual auditada. 11 de 12 versiones son PDF (requiere OCR M2). v6461 (2022) tiene XLS pero formato resumen ahorro-inversión, requiere tabla dedicada.',
    urlOficial: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/dato/${DATASET_187_ID}`,
    formato: 'PDF (mayor) + XLS (1 versión)',
    coberturaDesde: 2014,
    coberturaHasta: 2022,
    volumenEstimado: '12 versiones (1 XLS + 11 PDF)',
    estadoImplementacion: 'pendiente',
    razonBloqueo: '11/12 versiones son PDF — pipeline OCR pendiente (M2). XLS único requiere tabla dedicada cuenta_general_resumen.',
    conectorId: null,
  })

  let totalGlobal = 0
  for (const d of DATASETS) {
    totalGlobal += await procesarDataset(d)
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Filas en presupuesto_ejecucion: ${totalGlobal.toLocaleString()}`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
