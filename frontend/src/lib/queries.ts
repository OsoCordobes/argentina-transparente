import { useQuery } from '@tanstack/react-query'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`)
  const data = await res.json()
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    throw new Error(data.error ?? `Backend respondió ok:false en ${path}`)
  }
  return data as T
}

export type Severidad = 'grave' | 'moderada' | 'leve'

export interface SeñalDashboard {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: Severidad
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: { articulos: string[]; severidad: string; denunciarAnte: string[] }
  computadoEn: string
}

export interface MunicipioStats {
  municipio: string
  total_contratos: number
  monto_total: number
  anio_min: number
  anio_max: number
  total_señales: number
}

export interface EntidadResumen {
  proveedor: string
  municipio: string
  total_contratos: number
  monto_total: number
  señales: number
  anio_min: number
  anio_max: number
}

export interface DashboardResponse {
  ok: true
  totalContratos: number
  totalSeñales: number
  municipios: MunicipioStats[]
  topEntidades: EntidadResumen[]
  señales: SeñalDashboard[]
}

export interface EntidadSearchResponse {
  ok: true
  entidades: EntidadResumen[]
}

export interface ContratoDetalle {
  hash?: string
  tipo: string
  proveedor: string
  area: string
  descripcion: string
  monto: number
  anio: number
  municipio?: string
  fuenteUrl: string
  numeroExpediente?: string
  numeroContrato?: string
  fechaContrato?: string
}

export interface SeñalAsociada {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: Severidad
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: { articulos: string[]; severidad: string; denunciarAnte: string[] }
  cuits: string[]
  computadoEn: string
}

export interface AfipInfo {
  cuit: string
  esEmpleador: boolean
  inicioActividades: string | null
  estado: string | null
  actividadPrincipal: string | null
}

export interface EntidadDetalle {
  nombre: string
  montoTotal: number
  totalContratos: number
  anios: number[]
  municipios: string[]
  areas: string[]
  afip: AfipInfo | null
  timeline: { anio: number; cantidad: number; monto: number }[]
  tipos: { tipo: string; cantidad: number; monto: number }[]
  contratos: ContratoDetalle[]
  señales?: SeñalAsociada[]
}

export interface EntidadResponse {
  ok: true
  entidad: EntidadDetalle
}

export interface ContratoResponse {
  ok: true
  contrato: ContratoDetalle
  afip: AfipInfo | null
  señales: SeñalAsociada[]
  cadenaCustodia: { fuenteUrl: string; hashContrato: string }
}

export interface CytoNode {
  data: {
    id: string
    label: string
    type: 'empresa' | 'director'
    cuit?: string
    municipio?: string
  }
}

export interface CytoEdge {
  data: {
    id: string
    source: string
    target: string
    label?: string
    weight?: number
    sharedDirectors?: string[]
  }
}

export interface RedResponse {
  ok: true
  municipio: string
  elements: { nodes: CytoNode[]; edges: CytoEdge[] }
  stats: { nodes: number; edges: number }
}

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: () => fetchJSON<DashboardResponse>('/api/dashboard'),
    staleTime: 60_000,
  })
}

export function useEntidadSearch(query: string) {
  return useQuery({
    queryKey: ['entidad', 'search', query],
    queryFn: () =>
      fetchJSON<EntidadSearchResponse>(
        `/api/entidad/search?q=${encodeURIComponent(query)}`
      ),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })
}

export function useEntidad(nombre: string | undefined) {
  return useQuery({
    queryKey: ['entidad', nombre],
    queryFn: () =>
      fetchJSON<EntidadResponse>(
        `/api/entidad/${encodeURIComponent(nombre ?? '')}`
      ),
    enabled: !!nombre && nombre.length > 0,
    staleTime: 60_000,
  })
}

export function useContrato(hash: string | undefined) {
  return useQuery({
    queryKey: ['contrato', hash],
    queryFn: () => fetchJSON<ContratoResponse>(`/api/contrato/${hash}`),
    enabled: !!hash && hash.length >= 8,
    staleTime: 5 * 60_000, // contrato individual cambia poco
  })
}

export function useRed(municipio: string | undefined) {
  return useQuery({
    queryKey: ['red', municipio],
    queryFn: () =>
      fetchJSON<RedResponse>(
        `/api/red/${encodeURIComponent(municipio ?? '')}`
      ),
    enabled: !!municipio && municipio.length > 0,
    staleTime: 5 * 60_000,
    retry: 0, // si Neo4j no está disponible, no retry repetidos
  })
}

// Sprint 4 — Data Foundation
export interface FuenteDatos {
  id: string
  jurisdiccion: string
  tipo: string
  url: string
  formato: string
  oficial: boolean
  licencia: string | null
  frecuencia: string | null
  nivel_confianza: 'alto' | 'medio' | 'bajo'
  notas: string | null
  registrado_en: string
  ultimo_crawl: string | null
}

export interface FuentesResponse {
  ok: true
  fuentes: FuenteDatos[]
}

export function useFuentes() {
  return useQuery({
    queryKey: ['fuentes'],
    queryFn: () => fetchJSON<FuentesResponse>('/api/cruce/fuentes'),
    staleTime: 5 * 60_000,
  })
}
