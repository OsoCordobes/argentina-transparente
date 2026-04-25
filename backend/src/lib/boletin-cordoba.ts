// lib/boletin-cordoba.ts — Discovery + descarga de Boletines Oficiales
// Municipalidad de Córdoba via gobiernoabierto.cordoba.gob.ar (mismo portal
// CKAN del connector cordoba-capital).
//
// Dataset 2781: "Boletines Municipales". Una versión por año típicamente,
// cada versión expone múltiples PDFs como recursos.
//
// Si el patrón cambia, ajustar DATASET_ID o usar el fallback de URL directa
// `https://static01.cordoba.gob.ar/boe/boletines/boletin_<anio>_<id>.pdf`.

const API_BASE = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos'
const DATASET_ID = 2781
const TIMEOUT_MS = 30_000

interface VersionAPI {
  id: string
  titulo: string
  descripcion?: string
  fechaInicio?: string
  fechaFin?: string
}

interface RecursoAPI {
  id: string
  titulo: string
  url: string
  icono?: string
  formato?: string
  tamano?: number
}

async function fetchWithTimeout(url: string, timeoutMs = TIMEOUT_MS): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), timeoutMs)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        Accept: 'application/json',
        'User-Agent': 'ARGOS/3.0 (investigación anticorrupción)',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

export interface BoletinDisponible {
  versionId: string
  versionTitulo: string
  recursoId: string
  recursoTitulo: string
  recursoUrl: string
  formato: string
  // Año extraído heurísticamente del título de la versión o el recurso
  anioInferido: number | null
}

// Lista todas las versiones disponibles del dataset.
export async function listarVersiones(): Promise<VersionAPI[]> {
  const url = `${API_BASE}/dato/${DATASET_ID}/version-dato`
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    throw new Error(`API Córdoba HTTP ${res.status} listando versiones — verificar dataset ID ${DATASET_ID}`)
  }
  const data = await res.json() as { results: VersionAPI[] }
  return data.results ?? []
}

// Lista los recursos (PDFs) de una versión específica.
export async function listarRecursos(versionId: string): Promise<RecursoAPI[]> {
  const url = `${API_BASE}/dato/${DATASET_ID}/version-dato/${versionId}/recurso`
  const res = await fetchWithTimeout(url)
  if (!res.ok) {
    throw new Error(`API Córdoba HTTP ${res.status} listando recursos de versión ${versionId}`)
  }
  const data = await res.json() as { results: RecursoAPI[] }
  return data.results ?? []
}

// Heurística para extraer año del título: busca un 4-dígito 19xx/20xx.
function extraerAnio(...textos: (string | undefined)[]): number | null {
  for (const t of textos) {
    if (!t) continue
    const m = t.match(/\b(19|20)\d{2}\b/)
    if (m) {
      const a = parseInt(m[0])
      if (a >= 2000 && a <= 2030) return a
    }
  }
  return null
}

// Descubre todos los boletines en un rango de años. Intenta filtrar por
// año inferido del título. Si no se puede inferir, retorna el recurso de todas
// formas y deja que el caller decida.
export async function descubrirBoletines(opts: {
  anioDesde: number
  anioHasta: number
  formatoPreferido?: string
} = { anioDesde: 2010, anioHasta: new Date().getFullYear() }): Promise<BoletinDisponible[]> {
  const formato = opts.formatoPreferido ?? 'PDF'

  console.log(`[boletin-cordoba] Listando versiones del dataset ${DATASET_ID}...`)
  const versiones = await listarVersiones()
  console.log(`[boletin-cordoba] ${versiones.length} versiones encontradas`)

  const disponibles: BoletinDisponible[] = []

  for (const v of versiones) {
    const anioVersion = extraerAnio(v.titulo, v.descripcion, v.fechaInicio, v.fechaFin)

    // Filtrar por rango si se pudo inferir el año
    if (anioVersion !== null && (anioVersion < opts.anioDesde || anioVersion > opts.anioHasta)) {
      continue
    }

    let recursos: RecursoAPI[]
    try {
      recursos = await listarRecursos(v.id)
    } catch (err) {
      console.warn(`[boletin-cordoba] Error listando recursos de v${v.id}: ${(err as Error).message}`)
      continue
    }

    for (const r of recursos) {
      const fmt = (r.formato ?? r.icono ?? '').toUpperCase()
      if (fmt && !fmt.includes(formato)) continue
      if (!r.url) continue

      disponibles.push({
        versionId: v.id,
        versionTitulo: v.titulo,
        recursoId: r.id,
        recursoTitulo: r.titulo,
        recursoUrl: r.url,
        formato: fmt || 'PDF',
        anioInferido: anioVersion ?? extraerAnio(r.titulo),
      })
    }

    // pequeña pausa para no saturar el portal
    await new Promise(r => setTimeout(r, 200))
  }

  return disponibles
}
