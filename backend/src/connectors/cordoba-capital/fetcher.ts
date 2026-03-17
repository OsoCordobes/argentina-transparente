import * as XLSX from 'xlsx'

const API_BASE = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos'

// Dataset IDs por año — verificados contra la API real
const DATASET_VERSION_IDS: Record<number, string> = {
  2023: '6467',
  2022: '6466',
  2021: '5978',
  2020: '5977',
  2019: '2',
}

interface RecursoAPI {
  id: string
  titulo: string
  url: string
  icono: string
}

export async function fetchXLSXUrl(anio: number): Promise<string> {
  const versionId = DATASET_VERSION_IDS[anio]
  if (!versionId) {
    throw new Error(`Año ${anio} no disponible. Años soportados: ${Object.keys(DATASET_VERSION_IDS).join(', ')}`)
  }

  const url = `${API_BASE}/dato/2/version-dato/${versionId}/recurso`
  const res = await fetch(url)
  if (!res.ok) throw new Error(`API Córdoba error ${res.status}: ${url}`)

  const data = await res.json() as { results: RecursoAPI[] }
  const recurso = data.results?.[0]
  if (!recurso?.url) throw new Error(`No se encontró recurso para año ${anio}`)

  return recurso.url
}

export async function downloadXLSX(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Error descargando XLSX: ${res.status}`)
  const arrayBuffer = await res.arrayBuffer()
  return Buffer.from(arrayBuffer)
}

export async function fetchRawRows(anio: number): Promise<Record<string, unknown>[]> {
  const xlsxUrl = await fetchXLSXUrl(anio)
  const buffer = await downloadXLSX(xlsxUrl)

  const workbook = XLSX.read(buffer, { type: 'buffer' })
  const sheetName = workbook.SheetNames[0]
  const sheet = workbook.Sheets[sheetName]

  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    raw: false
  })

  return rows
}
