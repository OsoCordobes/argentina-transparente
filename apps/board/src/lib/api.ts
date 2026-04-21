// API client for ARGOS v3 backend (/api/entidad/*)
// Falls back to legacy backend at /analizar for full analysis runs.

const BASE = '/api'

export interface SearchResult {
  tipo:   string
  id:     string
  nombre: string
  score:  number
}

export interface EntidadProfile {
  tipo:      string
  id:        string
  nombre:    string
  estado?:   string
  directores?: string[]
  empresas?:   string[]
  fuente_url?: string
}

export interface TimelineEvent {
  tipo:        'contrato'
  fecha:       number
  titulo:      string
  descripcion: string | null
  fuente_url:  string
  id:          string
}

export interface GrafRed {
  nodos:   { id: string; tipo: string; nombre: string }[]
  aristas: { desde: string; hasta: string; relacion: string }[]
}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(path)
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }))
    throw new Error((err as { error: string }).error ?? res.statusText)
  }
  return res.json() as Promise<T>
}

export const api = {
  search: (q: string, type = 'all') =>
    get<{ results: SearchResult[]; total: number }>(
      `${BASE}/entidad/search?q=${encodeURIComponent(q)}&type=${type}`
    ),

  entidad: (id: string) =>
    get<EntidadProfile>(`${BASE}/entidad/${encodeURIComponent(id)}`),

  relaciones: (id: string) =>
    get<GrafRed>(`${BASE}/entidad/${encodeURIComponent(id)}/relaciones`),

  senales: (id: string, desde: number, hasta: number, municipio: string) =>
    get<{ hallazgos: unknown[]; total: number }>(
      `${BASE}/entidad/${encodeURIComponent(id)}/senales?desde=${desde}&hasta=${hasta}&municipio=${municipio}`
    ),

  timeline: (id: string) =>
    get<{ events: TimelineEvent[]; total: number }>(
      `${BASE}/entidad/${encodeURIComponent(id)}/timeline`
    ),
}
