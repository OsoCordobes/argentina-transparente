// seed-cordoba-sueldos.ts — Sueldos y nómina de funcionarios + agentes
// municipales de Córdoba Capital.
//
// Datasets fuente (gobiernoabierto.cordoba.gob.ar):
//   - 131: Sueldos de funcionarios (81 versiones mensuales 2022-2023)
//   - 201: Nómina de Agentes Municipales (9 versiones 2017-2025)
//   - 5:   Escala Salarial (26 versiones 2017-2025)
//   - 3292: Sueldos Concejales (17 versiones 2022-2023)
//
// Datos verbatim del XLSX. Cada fila → tabla `agentes_publicos`.

import 'dotenv/config'
import crypto from 'crypto'
import {
  initDb, dbRun, registrarFuente, registrarFuenteCatalogo,
} from '../lib/db'
import {
  listarVersionesDataset, descargarRecursoDeVersion, parsearTabla,
  parsearTablaConHeaderDetectable,
  inferirAnioDesdeTitulo, inferirAnioMesDesdeTitulo, parseMontoAR,
} from '../lib/cordoba-portal'
import type { FuenteMetadata } from '../types'

const JURISDICCION = 'cordoba-capital'

interface DatasetSueldos {
  datasetId: string
  categoria: string
  nombre: string
}

const DATASETS: DatasetSueldos[] = [
  { datasetId: '131',  categoria: 'funcionario', nombre: 'Sueldos de Funcionarios' },
  { datasetId: '201',  categoria: 'agente',      nombre: 'Nómina de Agentes Municipales' },
  { datasetId: '3292', categoria: 'concejal',    nombre: 'Sueldos Concejales' },
  { datasetId: '5',    categoria: 'escala',      nombre: 'Escala Salarial' },
]

// Heurísticas para extraer nombres de columnas que pueden variar
function pickColumna(row: Record<string, unknown>, regexes: RegExp[]): string | null {
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

interface AgenteRow {
  jurisdiccion: string
  anio: number
  mes: number | null
  categoria: string
  reparticion: string | null
  cargo: string | null
  apellidoNombre: string | null
  cuit: string | null
  bruto: number | null
  neto: number | null
  categoriaEscala: string | null
  fuenteUrl: string
}

async function insertAgente(a: AgenteRow): Promise<boolean> {
  const id = crypto.createHash('sha256')
    .update([
      a.jurisdiccion, a.anio, a.mes ?? '', a.categoria,
      a.reparticion ?? '', a.cargo ?? '', a.apellidoNombre ?? '', a.cuit ?? '',
      a.bruto ?? '', a.neto ?? '', a.categoriaEscala ?? '',
    ].join('|'))
    .digest('hex').slice(0, 16)
  try {
    await dbRun(
      `INSERT OR IGNORE INTO agentes_publicos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id, a.jurisdiccion, a.anio, a.mes, a.categoria,
        a.reparticion, a.cargo, a.apellidoNombre, a.cuit,
        a.bruto, a.neto, a.categoriaEscala,
        a.fuenteUrl, new Date().toISOString(),
      ]
    )
    return true
  } catch {
    return false
  }
}

async function procesarDataset(d: DatasetSueldos): Promise<{ inserted: number; versiones: number }> {
  console.log(`\n=== Dataset ${d.datasetId} (${d.nombre}) ===`)
  let versiones: Awaited<ReturnType<typeof listarVersionesDataset>>
  try {
    versiones = await listarVersionesDataset(d.datasetId)
  } catch (err) {
    console.warn(`  ✗ Error listando versiones: ${(err as Error).message}`)
    return { inserted: 0, versiones: 0 }
  }
  console.log(`  ${versiones.length} versiones disponibles`)

  let totalInserted = 0
  for (const v of versiones) {
    const { anio, mes } = inferirAnioMesDesdeTitulo(v.titulo)
    const anioFinal = anio ?? inferirAnioDesdeTitulo(v.descripcion ?? '')
    if (!anioFinal) continue

    let descarga: Awaited<ReturnType<typeof descargarRecursoDeVersion>>
    try {
      descarga = await descargarRecursoDeVersion(d.datasetId, v.id, ['xls', 'csv'])
    } catch {
      continue
    }
    if (!descarga) continue

    // Algunos datasets (ej. 131 Funcionarios) tienen 6 filas-título antes
    // del header tabular. Usamos detección de header con keywords del schema
    // típico de sueldos. Fallback automático a parsearTabla() si no detecta.
    const filas = parsearTablaConHeaderDetectable(
      descarga.buffer,
      ['apellido', 'nombre', 'cargo', 'secretaria', 'agente', 'funcionario',
       'cuit', 'reparticion', 'denominacion', 'categoria', 'escala',
       'bruto', 'neto', 'devengado', 'remuneracion', 'empleado'],
      { minMatches: 3, maxScanRows: 12 }
    )
    let nuevos = 0
    for (const row of filas) {
      const apellidoNombre = pickColumna(row, [/apellido/i, /nombre/i, /agente/i, /funcionario/i])
      const cargo = pickColumna(row, [/cargo/i, /denominaci[óo]n/i, /puesto/i])
      const reparticion = pickColumna(row, [/repartici[óo]n/i, /secretar[íi]a/i, /dependencia/i, /\bárea\b/i])
      const categoriaEscala = pickColumna(row, [/escala/i, /categor[íi]a/i, /clase/i, /agrupamiento/i])
      const cuit = pickColumna(row, [/cuit/i, /cuil/i])
      const bruto = pickMonto(row, [/bruto/i, /haber.+bruto/i, /remunera/i])
      const neto = pickMonto(row, [/neto/i, /haber.+neto/i, /bolsillo/i])

      // Saltamos filas vacías (sin nombre y sin escala salarial)
      if (!apellidoNombre && !categoriaEscala && bruto === null && neto === null) continue

      const ok = await insertAgente({
        jurisdiccion: JURISDICCION,
        anio: anioFinal,
        mes,
        categoria: d.categoria,
        reparticion,
        cargo,
        apellidoNombre,
        cuit,
        bruto,
        neto,
        categoriaEscala,
        fuenteUrl: descarga.recurso.url.split('?')[0],  // sin signed-URL params
      })
      if (ok) nuevos++
    }

    if (nuevos > 0) {
      console.log(`  v${v.id} (${anioFinal}${mes ? '-' + String(mes).padStart(2, '0') : ''}): ${nuevos}/${filas.length} insertados`)
    }
    totalInserted += nuevos
  }

  return { inserted: totalInserted, versiones: versiones.length }
}

async function main() {
  console.log('=== ARGOS — Seed Sueldos Córdoba Capital ===\n')
  const dryRun = process.argv.includes('--dry-run')
  await initDb()

  // Registrar fuente y catálogo
  if (!dryRun) {
    await registrarFuente({
      id: 'cordoba-capital-sueldos',
      jurisdiccion: 'Córdoba Capital',
      url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/agentes-municipales/39',
      formato: 'XLSX (CKAN)',
      oficial: true,
      nivelConfianza: 'alto',
      notas: 'Sueldos + nómina + escala salarial. Datasets 131, 201, 5, 3292 del portal CKAN.',
    } as FuenteMetadata)

    for (const d of DATASETS) {
      // Dataset 5 (Escala Salarial) es 100% PDF — no procesable hasta M2 OCR.
      const esPdfOnly = d.datasetId === '5'
      await registrarFuenteCatalogo({
        id: `cordoba-capital-dataset-${d.datasetId}`,
        jurisdiccion: 'cordoba-capital',
        organismo: 'Municipalidad de Córdoba',
        dimension: 'salarios',
        nombre: d.nombre,
        descripcion: esPdfOnly
          ? `Dataset ${d.datasetId} — Escala Salarial mensual. 26 versiones PDF (requiere OCR M2).`
          : `Dataset ${d.datasetId} en gobiernoabierto.cordoba.gob.ar`,
        urlOficial: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/dato/${d.datasetId}`,
        formato: esPdfOnly ? 'PDF' : 'XLSX',
        coberturaDesde: 2017,
        coberturaHasta: 2025,
        volumenEstimado: 'multi-versión',
        estadoImplementacion: esPdfOnly ? 'pendiente' : 'implementado',
        razonBloqueo: esPdfOnly ? '26 versiones son PDF — pipeline OCR pendiente (M2)' : null,
        conectorId: 'seed:cordoba-sueldos',
      })
    }
  }

  let totalGlobal = 0
  for (const d of DATASETS) {
    const { inserted } = await procesarDataset(d)
    totalGlobal += inserted
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Filas insertadas en agentes_publicos: ${totalGlobal.toLocaleString()}`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
