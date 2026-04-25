// Fetcher para Argentina Compra / ContratAR (sistema nacional de compras).
// API REST con formato OCDS (Open Contracting Data Standard).
// Documentación: https://api.contrataciones.argentina.gob.ar/
//
// Nota de cobertura: la API publica datos desde 2016 (Resolución ONC 59/2016
// que establece el sistema electrónico de contrataciones del Estado nacional).
// Para datos pre-2016 se requiere OCR de boletines oficiales (post-MVP).

const API_BASE = 'https://api.contrataciones.argentina.gob.ar/v1'
const PAGE_SIZE = 100
const MAX_RECORDS_PER_YEAR = 50_000
const TIMEOUT_MS = 45_000
const PAUSE_MS = 250  // ~4 req/seg para respetar rate limit

// Tipos mínimos del API OCDS que usamos
export interface OCDSRelease {
  ocid?: string
  id?: string
  date?: string
  tender?: {
    id?: string
    title?: string
    procurementMethod?: string
    procurementMethodDetails?: string
    mainProcurementCategory?: string
    value?: { amount?: number; currency?: string }
    tenderPeriod?: { startDate?: string; endDate?: string }
    status?: string
  }
  buyer?: {
    name?: string
    id?: string
  }
  awards?: Array<{
    id?: string
    title?: string
    date?: string
    status?: string
    suppliers?: Array<{
      name?: string
      identifier?: { id?: string; legalName?: string }
    }>
    value?: { amount?: number; currency?: string }
  }>
  contracts?: Array<{
    id?: string
    dateSigned?: string
    value?: { amount?: number; currency?: string }
  }>
}

interface SearchResponse {
  total?: number
  data?: OCDSRelease[]
  // Alternativa de envelope que usan algunos endpoints OCDS
  releases?: OCDSRelease[]
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: { Accept: 'application/json' },
    })
    return res
  } finally {
    clearTimeout(timer)
  }
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms))
}

export async function fetchReleasesForYear(anio: number): Promise<OCDSRelease[]> {
  const fechaDesde = `${anio}-01-01`
  const fechaHasta = `${anio}-12-31`

  const allReleases: OCDSRelease[] = []
  let offset = 0

  while (allReleases.length < MAX_RECORDS_PER_YEAR) {
    const url = `${API_BASE}/search/expedientes?fechaDesde=${fechaDesde}&fechaHasta=${fechaHasta}&limit=${PAGE_SIZE}&offset=${offset}`

    let res: Response
    try {
      res = await fetchWithTimeout(url)
    } catch (err) {
      if (offset === 0) {
        throw new Error(`[argentina-compra] No se pudo conectar con la API: ${String(err).split('\n')[0]}`)
      }
      console.warn(`[argentina-compra] Timeout en página offset=${offset}, deteniendo`)
      break
    }

    if (!res.ok) {
      if (offset === 0) {
        throw new Error(`[argentina-compra] API respondió HTTP ${res.status} para ${anio}`)
      }
      break
    }

    const data = await res.json() as SearchResponse
    const releases = data.data ?? data.releases ?? []

    if (releases.length === 0) break

    allReleases.push(...releases)

    const total = data.total ?? releases.length
    if (allReleases.length >= total) break
    if (releases.length < PAGE_SIZE) break

    offset += PAGE_SIZE

    const progress = Math.round((allReleases.length / total) * 100)
    process.stdout.write(`\r[argentina-compra] ${anio}: ${allReleases.length}/${total} (${progress}%)`)

    await sleep(PAUSE_MS)
  }

  if (allReleases.length > 0) {
    process.stdout.write('\n')
  }

  return allReleases
}
