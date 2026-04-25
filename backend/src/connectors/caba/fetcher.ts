// Fetcher para CABA (Ciudad Autónoma de Buenos Aires).
// Portal: data.buenosaires.gob.ar (CKAN)
// Dataset oficial de compras y contrataciones: CSV descargable directamente.
//
// Estrategia: el portal CKAN de CABA expone los datasets de compras como
// recursos CSV descargables. Usamos CKANClient para discovery y luego
// descargamos los CSVs directamente.
//
// Dataset IDs verificados (actualizados manualmente si el portal cambia):
//   "buenos-aires-compras-contratos" — contratos adjudicados CABA
//   "compras-contrataciones-gobierno-de-la-ciudad" — alternativa

import { CKANClient, CKANDataset, CKANResource } from '../../lib/ckan'

const CABA_BASE = 'https://data.buenosaires.gob.ar'
const TIMEOUT_MS = 60_000

// Queries de búsqueda en orden de preferencia
const QUERIES_FALLBACK = [
  'buenos aires compras contratos adjudicados',
  'compras contrataciones licitaciones',
  'contrataciones publicas',
]

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: 'text/csv,application/json' },
    })
  } finally {
    clearTimeout(timer)
  }
}

export interface CABARow {
  [key: string]: string | undefined
}

// Descubre datasets de compras en el portal CKAN de CABA y retorna el mejor recurso CSV.
async function discoverCABAContratosResource(): Promise<CKANResource | null> {
  const client = new CKANClient({ baseUrl: CABA_BASE })

  for (const q of QUERIES_FALLBACK) {
    const datasets = await client.searchDatasets(q, 10)
    for (const ds of datasets) {
      const resource = CKANClient.pickStructuredResource(ds, ['CSV', 'XLSX', 'JSON'])
      if (resource) {
        console.log(`[caba] Dataset encontrado: "${ds.title}"`)
        console.log(`[caba] Recurso: ${resource.name} (${resource.format}) — ${resource.url.slice(0, 80)}`)
        return resource
      }
    }
  }
  return null
}

export async function fetchRawRows(anio: number): Promise<CABARow[]> {
  const resource = await discoverCABAContratosResource()
  if (!resource) {
    throw new Error(
      '[caba] No se encontró un dataset CSV de compras en data.buenosaires.gob.ar. ' +
      'Verificar con: npm run ckan:explore -- caba "compras"'
    )
  }

  console.log(`[caba] Descargando ${resource.format} para año ${anio}...`)
  const res = await fetchWithTimeout(resource.url)
  if (!res.ok) {
    throw new Error(`[caba] HTTP ${res.status} descargando recurso: ${resource.url.slice(0, 80)}`)
  }

  const text = await res.text()
  return parseCSVText(text, anio)
}

function parseCSVText(csvText: string, anio: number): CABARow[] {
  const lines = csvText.split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = lines[0].split(',').map(h => h.trim().replace(/^"|"$/g, ''))
  const rows: CABARow[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue

    const values = splitCSVLine(line)
    const row: CABARow = {}
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').replace(/^"|"$/g, '').trim()
    })

    // Filtrar por año si hay columna de fecha
    const anioRow = extractAnioFromRow(row)
    if (anioRow !== null && anioRow !== anio) continue

    rows.push(row)
  }

  return rows
}

// Divisor básico de CSV que respeta comillas
function splitCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      inQuote = !inQuote
    } else if (c === ',' && !inQuote) {
      result.push(current)
      current = ''
    } else {
      current += c
    }
  }
  result.push(current)
  return result
}

function extractAnioFromRow(row: CABARow): number | null {
  const fechaCols = ['fecha_inicio', 'fecha_contrato', 'anio', 'año', 'ejercicio', 'fecha_publicacion']
  for (const col of fechaCols) {
    const val = row[col]
    if (!val) continue
    const m = val.match(/\b(20\d{2})\b/)
    if (m) return parseInt(m[1])
  }
  return null
}
