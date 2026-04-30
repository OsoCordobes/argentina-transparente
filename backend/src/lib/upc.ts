// lib/upc.ts — Cliente WP REST API de la Universidad Provincial de Córdoba (UPC)
//
// Fuente: https://www.upc.edu.ar/wp-json/wp/v2/posts
// La UPC publica sus licitaciones y contrataciones como posts de WordPress.
// El WP JSON API v2 expone todos los posts con búsqueda por keyword.
//
// Hallazgos de discovery (2026-04-25):
//   - search=licitacion: 82 posts, 17 páginas
//   - search=compra: 32 posts (incluye falsos positivos — se filtra por título)
//   - La categoría 2665 (UPC) es demasiado amplia (1030 posts)
//   - Tags: "licitacion" (1 post) — inutilizable como filtro
//   - Proveedor y monto suelen estar en PDFs de adjudicación, no en el HTML
//   - Algunos posts SÍ mencionan montos como cifra explícita en el cuerpo
//
// Limitación declarada: la mayoría de posts no incluyen proveedor ni monto
// en el HTML — estos quedan como "" y 0 respectivamente. Solo se inserta lo
// que está LITERALMENTE en el HTML del post. Ver CLAUDE.md §2 y §4.

const BASE_URL = 'https://www.upc.edu.ar/wp-json/wp/v2'
const PER_PAGE = 100
const TIMEOUT_MS = 30_000
const PAUSA_MS = 300  // ~3 req/s

const UA = 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0'

export interface UPCPost {
  id: number
  date: string           // ISO 8601
  title: { rendered: string }
  content: { rendered: string }
  link: string
}

export interface LicitacionUPC {
  postId: number
  url: string
  fecha: string          // YYYY-MM-DD
  tipo: string           // "Licitación Pública" | "Licitación Privada" | etc.
  numero: string | null  // "5/2025" si se puede extraer del título
  objeto: string         // descripción del objeto
  monto: number          // 0 si no está literalmente en el HTML
  proveedor: string      // "" si no está literalmente en el HTML
}

// ─── Keywords que indican una licitación en el TÍTULO ─────────────────────────
export const TITULO_RE = /licitaci[oó]n|compra directa|concurso de precio|contrataci[oó]n directa|adjudicaci[oó]n/i

// ─── Extrae el tipo de proceso desde el título ─────────────────────────────────
export function extraerTipo(titulo: string): string {
  const t = titulo.toLowerCase()
  if (t.includes('licitación pública') || t.includes('licitacion publica')) return 'Licitación Pública'
  if (t.includes('licitación privada') || t.includes('licitacion privada')) return 'Licitación Privada'
  if (t.includes('compra directa')) return 'Compra Directa'
  if (t.includes('concurso de precio')) return 'Concurso de Precios'
  if (t.includes('contratación directa') || t.includes('contratacion directa')) return 'Contratación Directa'
  if (t.includes('adjudicación') || t.includes('adjudicacion')) return 'Adjudicación'
  return 'Sin clasificar'
}

// ─── Extrae número de licitación desde el título ──────────────────────────────
// Patrones: "N° 5/2025", "Nro. 2/2024", "Nro 2/2024", "N.° 001/2023", "N° 3/2024"
export function extraerNumero(titulo: string): string | null {
  // Cubre: N°, Nº, N.°, Nro., Nro, Nro°
  const m = titulo.match(/n(?:ro?\.?\s*|[°º.]{1,2}\s*)(\d+\s*\/\s*\d{4})/i)
  return m ? m[1].replace(/\s/g, '') : null
}

// ─── Extrae monto ARS solo de cifras EXPLÍCITAS en el HTML ────────────────────
// Solo acepta: "$1.234.567" o "$ 1.234.567" o "1.234.567 pesos"
// NO acepta estimaciones del tipo "superior a X" o "aproximadamente X".
export function extraerMonto(html: string): number {
  const texto = html.replace(/<[^>]+>/g, ' ')

  // Patrón 1: "$" seguido de número con puntos/comas (formato ARS)
  const re1 = /\$\s*([\d]{1,3}(?:[.,]\d{3})*(?:[.,]\d{1,2})?)/g
  let match
  let maxMonto = 0
  while ((match = re1.exec(texto)) !== null) {
    // Normalizar: "1.234.567,89" → 1234567.89 (puntos=miles, coma=decimal AR)
    const raw = match[1]
    // Si contiene coma AL FINAL es decimal AR: "1.234,56" → 1234.56
    const arDecimal = /^\d{1,3}(?:\.\d{3})*,\d{1,2}$/.test(raw)
    let valor: number
    if (arDecimal) {
      valor = parseFloat(raw.replace(/\./g, '').replace(',', '.'))
    } else {
      // Solo puntos como separadores de miles: "1.234.567"
      valor = parseFloat(raw.replace(/\./g, ''))
    }
    if (!isNaN(valor) && valor > maxMonto) maxMonto = valor
  }
  return maxMonto
}

// ─── Extrae proveedor desde texto del post ────────────────────────────────────
// Solo cuando está mencionado literalmente en el contexto de una adjudicación.
// Busca patrones como "adjudica a [EMPRESA]" o "adjudicado a [EMPRESA]".
export function extraerProveedor(html: string): string {
  const texto = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')
  // Captura tras "adjudica(do/r/ción) a" hasta el final de la cláusula.
  // Los nombres de empresas pueden contener puntos (S.A., S.R.L.) — no cortar en ".".
  const m = texto.match(/adjudica(?:do|r|ci[oó]n)?\s+a\s+([A-ZÁÉÍÓÚÜÑ][^;(<\n]{3,120})/i)
  if (!m) return ''
  let nombre = m[1]
  // Truncar en la primera preposición/artículo que indica inicio de objeto del contrato.
  nombre = nombre.replace(/\s+(?:la\s|el\s|los\s|las\s|para\s|según\s|conforme\s|por\s|mediante\s|con\s).*/i, '')
  // Quitar puntuación final
  nombre = nombre.replace(/[,;]\s*$/, '').trim()
  return nombre.slice(0, 120)
}

// ─── Parsea una fecha ISO-ish a YYYY-MM-DD ────────────────────────────────────
function parsearFecha(isoDate: string): string {
  return isoDate.slice(0, 10)
}

// ─── Fetch con timeout ────────────────────────────────────────────────────────
async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: { 'User-Agent': UA, Accept: 'application/json' },
    })
  } finally {
    clearTimeout(timer)
  }
}

// ─── Lista posts con un keyword de búsqueda ───────────────────────────────────
async function listarPostsBusqueda(
  keyword: string,
  opts: { onProgress?: (pagina: number, total: number) => void } = {},
): Promise<UPCPost[]> {
  const all: UPCPost[] = []
  const params = new URLSearchParams({
    search: keyword,
    per_page: String(PER_PAGE),
    page: '1',
    _fields: 'id,date,title,content,link',
  })

  let res = await fetchWithTimeout(`${BASE_URL}/posts?${params}`)
  if (!res.ok) throw new Error(`WP JSON HTTP ${res.status} buscando "${keyword}"`)

  const totalPaginas = parseInt(res.headers.get('X-WP-TotalPages') ?? '1')
  const totalPosts = parseInt(res.headers.get('X-WP-Total') ?? '0')
  if (totalPosts === 0) return []

  const primera = await res.json() as UPCPost[]
  all.push(...primera)
  opts.onProgress?.(1, totalPaginas)

  for (let pag = 2; pag <= totalPaginas; pag++) {
    params.set('page', String(pag))
    await new Promise(r => setTimeout(r, PAUSA_MS))
    try {
      res = await fetchWithTimeout(`${BASE_URL}/posts?${params}`)
      if (!res.ok) {
        console.warn(`[upc] Página ${pag} keyword "${keyword}": HTTP ${res.status}`)
        continue
      }
      all.push(...(await res.json() as UPCPost[]))
      opts.onProgress?.(pag, totalPaginas)
    } catch (err) {
      console.warn(`[upc] Página ${pag} falló: ${(err as Error).message.slice(0, 60)}`)
    }
  }
  return all
}

// ─── Descarga todos los posts de licitaciones UPC ─────────────────────────────
// Combina múltiples búsquedas y deduplica por post ID.
export async function listarLicitaciones(opts: {
  onProgress?: (texto: string) => void
} = {}): Promise<LicitacionUPC[]> {
  const keywords = ['licitacion', 'compra directa', 'concurso de precios', 'contratacion directa']
  const vistos = new Set<number>()
  const todos: UPCPost[] = []

  for (const kw of keywords) {
    opts.onProgress?.(`Buscando "${kw}"...`)
    try {
      const posts = await listarPostsBusqueda(kw, {
        onProgress: (pag, tot) => opts.onProgress?.(`  "${kw}" pág ${pag}/${tot}`),
      })
      let nuevos = 0
      for (const p of posts) {
        if (!vistos.has(p.id)) {
          vistos.add(p.id)
          todos.push(p)
          nuevos++
        }
      }
      opts.onProgress?.(`  ✓ ${posts.length} posts (${nuevos} nuevos, ${posts.length - nuevos} dup)`)
    } catch (err) {
      opts.onProgress?.(`  ✗ Error "${kw}": ${(err as Error).message}`)
    }
  }

  opts.onProgress?.(`\nTotal posts únicos: ${todos.length}`)

  // Filtrar y parsear
  const licitaciones: LicitacionUPC[] = []
  for (const post of todos) {
    const titulo = post.title.rendered.replace(/&#\d+;/g, '').replace(/&amp;/g, '&').trim()
    if (!TITULO_RE.test(titulo)) continue  // filtrar falsos positivos

    const tipo = extraerTipo(titulo)
    const numero = extraerNumero(titulo)
    const monto = extraerMonto(post.content.rendered)
    const proveedor = extraerProveedor(post.content.rendered)

    licitaciones.push({
      postId: post.id,
      url: post.link,
      fecha: parsearFecha(post.date),
      tipo,
      numero,
      objeto: titulo.slice(0, 300),
      monto,
      proveedor,
    })
  }

  return licitaciones.sort((a, b) => a.fecha.localeCompare(b.fecha))
}
