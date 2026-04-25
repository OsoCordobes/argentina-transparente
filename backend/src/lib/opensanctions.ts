// Cliente OpenSanctions — Sprint 4 (Data Foundation, dataset internacional)
//
// API pública: https://api.opensanctions.org
// Docs: https://www.opensanctions.org/docs/api/
//
// Uso típico para ARGOS:
//   - Buscar PEPs (Politically Exposed Persons) que coincidan con directores
//     extraídos de IGJ
//   - Detectar empresas / individuos sancionados internacionalmente
//   - Cruzar contra Panama Papers / Pandora Papers (dataset icij_offshore_leaks)
//
// El plan habla de descargas bulk para escalar; este cliente cubre el modo
// query-on-demand para integrar primero con el flujo de señales sin requerir
// pipeline ETL.

import type { FuenteMetadata } from '../types'

const API = 'https://api.opensanctions.org'
const TIMEOUT_MS = 10_000

export const fuenteOpenSanctions: FuenteMetadata = {
  id: 'opensanctions',
  jurisdiccion: 'Internacional',
  url: 'https://www.opensanctions.org/',
  formato: 'JSON (REST)',
  oficial: false,
  licencia: 'CC-BY-NC-4.0 (uso no comercial libre)',
  frecuenciaActualizacion: 'diaria',
  nivelConfianza: 'alto',
  notas: 'Agrega sanciones, PEPs y entidades de interés desde fuentes oficiales globales (UN, OFAC, EU, etc.) e ICIJ Offshore Leaks.',
}

export interface OSEntidad {
  id: string
  caption: string                      // nombre legible
  schema: string                       // 'Person', 'Company', 'Organization', etc.
  datasets: string[]                   // ['un_sc_sanctions', 'icij_offshore_leaks', ...]
  countries?: string[]
  topics?: string[]                    // ['sanction', 'pep', 'crime.fin', ...]
  score?: number                       // 0-1 cuando viene de /match
  features?: Record<string, string[]>  // datos adicionales (cuit, nacimiento, etc.)
}

interface SearchResponse {
  total?: { value: number }
  results: OSEntidad[]
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal })
  } finally {
    clearTimeout(timer)
  }
}

// Búsqueda full-text contra todos los datasets ("default" agrega sanciones + PEPs).
// Retorna las entidades cuyo nombre coincide con `q`. Usa para chequear si un
// director de IGJ aparece en alguna lista internacional.
export async function searchOpenSanctions(
  q: string,
  opts: { schema?: string; limit?: number } = {}
): Promise<OSEntidad[]> {
  const params = new URLSearchParams({
    q,
    limit: String(opts.limit ?? 5),
  })
  if (opts.schema) params.set('schema', opts.schema)

  const url = `${API}/search/default?${params.toString()}`
  try {
    const res = await fetchWithTimeout(url, {
      headers: { Accept: 'application/json' },
    })
    if (!res.ok) {
      console.warn(`[opensanctions] HTTP ${res.status} en search`)
      return []
    }
    const data = (await res.json()) as SearchResponse
    return data.results ?? []
  } catch (err) {
    console.warn('[opensanctions] Error:', String(err).split('\n')[0])
    return []
  }
}

// /match/default — endpoint con scoring estructurado (mejor signal/noise).
// Recomendado cuando ya tenés campos estructurados como nombre + DNI + CUIT.
export async function matchOpenSanctions(query: {
  schema: 'Person' | 'Company' | 'Organization'
  name: string
  birthDate?: string
  registrationNumber?: string
  country?: string
}): Promise<OSEntidad[]> {
  const url = `${API}/match/default`
  try {
    const res = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        queries: {
          q1: {
            schema: query.schema,
            properties: {
              name: [query.name],
              ...(query.birthDate ? { birthDate: [query.birthDate] } : {}),
              ...(query.registrationNumber
                ? { registrationNumber: [query.registrationNumber] }
                : {}),
              ...(query.country ? { country: [query.country] } : {}),
            },
          },
        },
      }),
    })
    if (!res.ok) {
      console.warn(`[opensanctions] HTTP ${res.status} en match`)
      return []
    }
    const data = (await res.json()) as { responses: { q1: SearchResponse } }
    return data.responses?.q1?.results ?? []
  } catch (err) {
    console.warn('[opensanctions] Error en match:', String(err).split('\n')[0])
    return []
  }
}

// Helper: ¿esta entidad aparece en datasets sensibles?
export function esRiesgoAlto(entidad: OSEntidad): {
  riesgo: 'sancionado' | 'pep' | 'offshore' | 'crimen' | null
  detalle: string
} {
  const ds = new Set(entidad.datasets)
  const topics = new Set(entidad.topics ?? [])

  if (topics.has('sanction')) {
    return { riesgo: 'sancionado', detalle: 'Sujeto a sanciones internacionales' }
  }
  if (
    ds.has('icij_offshore_leaks') ||
    ds.has('icij_panama_papers') ||
    ds.has('icij_paradise_papers') ||
    ds.has('icij_pandora_papers')
  ) {
    return {
      riesgo: 'offshore',
      detalle: `Aparece en ${[...ds]
        .filter((d) => d.startsWith('icij_'))
        .join(', ')}`,
    }
  }
  if (topics.has('pep')) {
    return { riesgo: 'pep', detalle: 'Persona políticamente expuesta (PEP)' }
  }
  if (topics.has('crime') || topics.has('crime.fin')) {
    return { riesgo: 'crimen', detalle: 'Vinculado a investigación criminal' }
  }
  return { riesgo: null, detalle: '' }
}
