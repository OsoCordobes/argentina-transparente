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
  fuenteUrl: string
  numeroExpediente?: string
  numeroContrato?: string
  fechaContrato?: string
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
}

export interface EntidadResponse {
  ok: true
  entidad: EntidadDetalle
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
