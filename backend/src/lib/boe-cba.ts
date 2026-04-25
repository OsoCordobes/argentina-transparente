// lib/boe-cba.ts — Cliente del Boletín Oficial de la Provincia de Córdoba
// (boletinoficial.cba.gov.ar — WordPress + WP REST API + CloudFront).
//
// Hallazgo del agente investigación: 4,837 ediciones desde 2006-02-22, 40,539
// PDFs indexados. WP-JSON expone /wp/v2/media para enumerar todos los PDFs.
//
// Patrones de filename (3 épocas):
//   2006-2012: DDMMYY_seccion{1..4}.pdf
//   2013-2014: DDMMYY_BOCba_{1..4}s.pdf
//   2015-hoy:  {1..5}_Secc_DDMMYY[-N].pdf
//
// CloudFront bloquea User-Agent vacíos — usar UA de browser obligatorio.

const BASE = 'https://boletinoficial.cba.gov.ar'
const PER_PAGE = 100
const TIMEOUT_MS = 60_000
const PAUSA_MS = 250  // ~4 req/s

const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'

export interface MediaItem {
  id: number
  source_url: string
  date: string                 // upload date (no es la fecha de la edición)
  title: { rendered: string }
  mime_type: string
}

export interface BoletinIndexado {
  wpId: number
  url: string
  filenameTitulo: string
  fechaEdicion: string | null  // YYYY-MM-DD parseado del filename
  seccion: number | null       // 1-5 (Legislativa, Administrativa, Judicial, Anexo)
  fechaUpload: string
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json,*/*',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

// Lista TODOS los PDFs indexados via WP REST. Tarda ~2 min para 40K registros.
export async function listarTodosLosPDFs(opts: {
  desde?: string                 // ISO date — solo PDFs subidos después
  onProgress?: (pagina: number, totalPaginas: number, items: number) => void
} = {}): Promise<MediaItem[]> {
  const all: MediaItem[] = []

  // Probar primera página para conocer total
  const params = new URLSearchParams({
    mime_type: 'application/pdf',
    per_page: String(PER_PAGE),
    page: '1',
    _fields: 'id,source_url,date,title,mime_type',
  })
  if (opts.desde) params.set('after', opts.desde)

  let res = await fetchWithTimeout(`${BASE}/wp-json/wp/v2/media?${params}`)
  if (!res.ok) throw new Error(`WP-JSON HTTP ${res.status}`)
  const totalPaginas = parseInt(res.headers.get('X-WP-TotalPages') ?? '1')
  const totalItems = parseInt(res.headers.get('X-WP-Total') ?? '0')
  console.log(`[boe-cba] Total: ${totalItems} PDFs en ${totalPaginas} páginas`)

  let primeraPagina = await res.json() as MediaItem[]
  all.push(...primeraPagina)
  opts.onProgress?.(1, totalPaginas, all.length)

  for (let pag = 2; pag <= totalPaginas; pag++) {
    params.set('page', String(pag))
    await new Promise(r => setTimeout(r, PAUSA_MS))
    try {
      res = await fetchWithTimeout(`${BASE}/wp-json/wp/v2/media?${params}`)
      if (!res.ok) {
        console.warn(`[boe-cba] Página ${pag}: HTTP ${res.status}, saltando`)
        continue
      }
      const items = await res.json() as MediaItem[]
      all.push(...items)
      opts.onProgress?.(pag, totalPaginas, all.length)
    } catch (err) {
      console.warn(`[boe-cba] Página ${pag} falló: ${(err as Error).message.slice(0, 60)}`)
    }
  }
  return all
}

// Parsea fecha de edición y sección desde el filename.
const PATRONES_FILENAME = [
  // 2015-hoy: 1_Secc_240426.pdf  o 1_Secc_240426-1.pdf
  /^(\d)_Secc_(\d{2})(\d{2})(\d{2})/i,
  // 2013-2014: 120313_BOCba_1s.pdf
  /^(\d{2})(\d{2})(\d{2})_BOCba_(\d)s/i,
  // 2006-2012: 140306_seccion1.pdf
  /^(\d{2})(\d{2})(\d{2})_seccion(\d)/i,
]

export function parsearFilename(filename: string): { fechaEdicion: string | null; seccion: number | null } {
  // Patrón 1 (2015-hoy): seccion va primero
  let m = filename.match(PATRONES_FILENAME[0])
  if (m) {
    const [, sec, dd, mm, yy] = m
    const yyyy = parseInt(yy) < 50 ? 2000 + parseInt(yy) : 1900 + parseInt(yy)
    if (yyyy < 2000 || yyyy > 2030) return { fechaEdicion: null, seccion: null }
    return { fechaEdicion: `${yyyy}-${mm}-${dd}`, seccion: parseInt(sec) }
  }
  // Patrón 2 (2013-2014): fecha primero, sec al final
  m = filename.match(PATRONES_FILENAME[1])
  if (m) {
    const [, dd, mm, yy, sec] = m
    const yyyy = parseInt(yy) < 50 ? 2000 + parseInt(yy) : 1900 + parseInt(yy)
    if (yyyy < 2000 || yyyy > 2030) return { fechaEdicion: null, seccion: null }
    return { fechaEdicion: `${yyyy}-${mm}-${dd}`, seccion: parseInt(sec) }
  }
  // Patrón 3 (2006-2012): fecha primero, "seccionN" al final
  m = filename.match(PATRONES_FILENAME[2])
  if (m) {
    const [, dd, mm, yy, sec] = m
    const yyyy = parseInt(yy) < 50 ? 2000 + parseInt(yy) : 1900 + parseInt(yy)
    if (yyyy < 2000 || yyyy > 2030) return { fechaEdicion: null, seccion: null }
    return { fechaEdicion: `${yyyy}-${mm}-${dd}`, seccion: parseInt(sec) }
  }
  return { fechaEdicion: null, seccion: null }
}

// Filtra los PDFs que son boletines reales (matchean alguno de los 3 patrones)
// vs los anexos sueltos (`pdf24_*`, `77990_*`) que también están en el media.
export function filtrarBoletinesReales(items: MediaItem[]): BoletinIndexado[] {
  const out: BoletinIndexado[] = []
  for (const item of items) {
    const filename = item.source_url.split('/').pop() ?? ''
    const { fechaEdicion, seccion } = parsearFilename(filename)
    if (!fechaEdicion) continue
    out.push({
      wpId: item.id,
      url: item.source_url,
      filenameTitulo: filename,
      fechaEdicion,
      seccion,
      fechaUpload: item.date,
    })
  }
  return out
}
