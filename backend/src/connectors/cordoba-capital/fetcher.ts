import * as XLSX from 'xlsx'

const API_BASE = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos'

// Dataset IDs por año — verificados contra la API real
// Para agregar un año nuevo: verificar que el endpoint devuelva HTTP 200 y Content-Type XLSX
// antes de hardcodear el ID.
const DATASET_VERSION_IDS: Record<number, string> = {
  2023: '6467',
  2022: '6466',
  2021: '5978',
  2020: '5977',
  2019: '2',
  // 2024: no publicado en gobiernoabierto.cordoba.gob.ar al 2026-04-09.
  //   IDs probados (6468, 6469, 6470) devuelven HTTP 400.
  //   Fuente alternativa cuando esté disponible: compras.cordoba.gob.ar
}

interface RecursoAPI {
  id: string
  titulo: string
  url: string
  icono: string
}

async function fetchWithTimeout(url: string, timeoutMs = 30000): Promise<Response> {
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, { signal: controller.signal })
    return res
  } finally {
    clearTimeout(timeout)
  }
}

export async function fetchXLSXUrl(anio: number): Promise<string> {
  const versionId = DATASET_VERSION_IDS[anio]

  if (versionId) {
    const url = `${API_BASE}/dato/2/version-dato/${versionId}/recurso`
    const res = await fetchWithTimeout(url)
    if (!res.ok) throw new Error(`API Córdoba error ${res.status}: ${url}`)

    const data = await res.json() as { results: RecursoAPI[] }
    const recurso = data.results?.[0]
    if (!recurso?.url) throw new Error(`No se encontró recurso para año ${anio}`)

    return recurso.url
  }

  // Si el año no está en el mapa estático, buscar en la API
  const searchUrl = `${API_BASE}/dato/2/version-dato`
  const res = await fetchWithTimeout(searchUrl)
  const data = await res.json() as { results: { id: string; titulo: string }[] }
  const match = data.results?.find(r => r.titulo.includes(String(anio)))
  if (match) {
    const recursoUrl = `${API_BASE}/dato/2/version-dato/${match.id}/recurso`
    const rRes = await fetchWithTimeout(recursoUrl)
    const rData = await rRes.json() as { results: RecursoAPI[] }
    const recurso = rData.results?.[0]
    if (recurso?.url) return recurso.url
  }
  throw new Error(`Año ${anio} no disponible en el portal de Córdoba Capital. El portal publica con aproximadamente 1 año de retraso.`)
}

export async function downloadXLSX(url: string): Promise<Buffer> {
  const res = await fetchWithTimeout(url, 60000) // 60s para archivos grandes
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
