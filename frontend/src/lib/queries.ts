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

export interface ScraperHealth {
  id: string
  ejecutadoEn: string
  ok: boolean
  contratosCount: number | null
  duracionMs: number | null
  errorMsg: string | null
  urlChequeada: string | null
  status: 'ok' | 'warning' | 'error'
}

export interface ScrapersHealthResponse {
  ok: true
  resumen: { total: number; ok: number; warning: number; error: number }
  scrapers: ScraperHealth[]
}

export function useScrapersHealth() {
  return useQuery({
    queryKey: ['scrapers', 'health'],
    queryFn: () => fetchJSON<ScrapersHealthResponse>('/api/scrapers/health'),
    staleTime: 60_000,
    retry: 0,
  })
}

// ─── Alertas (post-MVP round 6) ───────────────────────────────────────────────

export type AlertaTipo = 'scraper_roto' | 'fuente_desactualizada' | 'datos_nuevos'
export type AlertaSeveridad = 'info' | 'warning' | 'critical'

export interface Alerta {
  id: string
  tipo: AlertaTipo
  severidad: AlertaSeveridad
  titulo: string
  detalle: string | null
  fuenteId: string | null
  detectadoEn: string
  leida: boolean
  leidaEn: string | null
}

export interface AlertasResponse {
  ok: true
  count: { total: number; critical: number }
  alertas: Alerta[]
}

export interface AlertasCountResponse {
  ok: true
  total: number
  critical: number
}

export function useAlertas(soloNoLeidas = true) {
  return useQuery({
    queryKey: ['alertas', soloNoLeidas],
    queryFn: () =>
      fetchJSON<AlertasResponse>(
        `/api/alertas?soloNoLeidas=${soloNoLeidas}&limit=100`
      ),
    staleTime: 30_000,
    retry: 0,
  })
}

export function useAlertasCount() {
  return useQuery({
    queryKey: ['alertas', 'count'],
    queryFn: () => fetchJSON<AlertasCountResponse>('/api/alertas/count'),
    staleTime: 60_000,
    retry: 0,
    refetchInterval: 5 * 60_000, // poll cada 5 min
  })
}

export async function marcarAlertaLeida(id: string): Promise<void> {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
  await fetch(`${API_URL}/api/alertas/${encodeURIComponent(id)}/leer`, { method: 'POST' })
}

export async function marcarTodasAlertasLeidas(): Promise<number> {
  const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
  const res = await fetch(`${API_URL}/api/alertas/leer-todas`, { method: 'POST' })
  const data = await res.json()
  return data.marcadas ?? 0
}

// ─── Actores (mapa del poder) ───────────────────────────────────────────────
// Consume /api/actores/* — la primera capa de exposición de los 2.7M filas
// dormidas (igj_autoridades, igj_entidades, rns_personas_juridicas,
// agentes_publicos). Permite buscar funcionarios + directores + empresas en
// un solo input y abrir un perfil unificado.

export type ActorTipo = 'funcionario' | 'director' | 'empresa' | 'proveedor'

export interface ActorSearchHit {
  tipo: ActorTipo
  nombre: string
  identificador: string | null
  jurisdiccion: string | null
  detalle: string | null
  fuente: 'agentes_publicos' | 'igj_autoridades' | 'igj_entidades' | 'rns_personas_juridicas' | 'empresas' | 'contratos'
  href: string
  score: number
}

export interface ActorSearchResponse {
  hits: ActorSearchHit[]
  total: number
}

export interface ActorPersonaCargo {
  jurisdiccion: string
  anio: number
  mes: number | null
  categoria: string
  reparticion: string | null
  cargo: string | null
  bruto: number | null
  neto: number | null
  fuente_url: string
}

export interface ActorPersonaEntidad {
  cuit: string | null
  razon_social: string
  tipo_societario: string | null
  tipo_administrador: string
  activa: boolean | null
}

export interface ActorPersonaContrato {
  hash: string
  municipio: string
  anio: number
  proveedor: string
  monto: number
  fuente_url: string
}

export interface ActorPersonaResponse {
  nombre: string
  identificadores: { dnis: string[]; cuits: string[] }
  cargos_publicos: ActorPersonaCargo[]
  entidades_dirigidas: ActorPersonaEntidad[]
  contratos_como_proveedor: ActorPersonaContrato[]
  cruces: {
    es_funcionario: boolean
    es_director: boolean
    es_proveedor: boolean
    conflicto_potencial: boolean
  }
}

export interface ActorEmpresaAutoridad {
  apellido_nombre: string
  tipo_administrador: string
  numero_documento: string | null
}

export interface ActorEmpresaResponse {
  cuit: string
  canonico: {
    nombre: string
    tipo_societario: string | null
    activa: boolean | null
  }
  empresas: {
    cuit: string
    nombre: string
    es_empleador: boolean | null
    fuente_padron: string | null
  } | null
  rns: {
    razon_social: string
    tipo_societario: string | null
    fecha_contrato_social: string | null
    numero_inscripcion: string | null
    dom_fiscal_provincia: string | null
    dom_fiscal_localidad: string | null
    dom_legal_provincia: string | null
    dom_legal_localidad: string | null
  } | null
  igj: { numero_correlativo: number; razon_social: string; tipo_societario: string | null; activa: boolean | null }[]
  autoridades: ActorEmpresaAutoridad[]
  contratos: ActorPersonaContrato[]
  cruce_externo: { matched: boolean; riesgo: string | null; dataset_principal: string | null; entidad_url: string | null } | null
}

export function useActoresSearch(query: string, tipo: ActorTipo | 'todos' = 'todos') {
  return useQuery({
    queryKey: ['actores', 'search', query, tipo],
    queryFn: () =>
      fetchJSON<ActorSearchResponse>(
        `/api/actores/search?q=${encodeURIComponent(query)}&tipo=${tipo}&limit=30`
      ),
    enabled: query.trim().length >= 2,
    staleTime: 30_000,
  })
}

export function useActorPersona(nombre: string | undefined) {
  return useQuery({
    queryKey: ['actor', 'persona', nombre],
    queryFn: () =>
      fetchJSON<ActorPersonaResponse>(
        `/api/actores/persona/${encodeURIComponent(nombre ?? '')}`
      ),
    enabled: !!nombre && nombre.length > 0,
    staleTime: 60_000,
  })
}

// ─── Grafo Neo4j (mapa-neural cordobés) ─────────────────────────────────────
// Reemplaza graphFromDashboard. Consume /api/grafo desde Neo4j: nodos
// (Empresa, PersonaFisica, Funcionario, Reparticion) + aristas reales.

export interface GrafoNeo4jNode {
  id: string
  type: 'empresa' | 'persona' | 'funcionario' | 'reparticion' | 'contrato' | 'señal'
  label: string
  subtitle?: string
  weight: number
  data: Record<string, unknown>
}

export interface GrafoNeo4jEdge {
  source: string
  target: string
  kind: 'dirige' | 'trabaja_en' | 'gano' | 'opera_en' | 'es_la_misma_persona' | 'comparte_director' | 'conflicto_con' | 'señalada_por' | 'tiene_director'
  weight: number
  data?: Record<string, unknown>
}

export interface GrafoNeo4jResponse {
  nodes: GrafoNeo4jNode[]
  edges: GrafoNeo4jEdge[]
  graphAvailable: boolean
}

export function useGrafoNucleo(limite = 200) {
  return useQuery({
    queryKey: ['grafo', 'nucleo', limite],
    queryFn: () => fetchJSON<GrafoNeo4jResponse>(`/api/grafo/nucleo?limite=${limite}`),
    staleTime: 5 * 60_000,
  })
}

export async function expandirNodoGrafo(nodeId: string): Promise<GrafoNeo4jResponse> {
  return fetchJSON<GrafoNeo4jResponse>(`/api/grafo/expand/${encodeURIComponent(nodeId)}`)
}

export function useActorEmpresa(cuit: string | undefined) {
  return useQuery({
    queryKey: ['actor', 'empresa', cuit],
    queryFn: () =>
      fetchJSON<ActorEmpresaResponse>(
        `/api/actores/empresa/${encodeURIComponent(cuit ?? '')}`
      ),
    enabled: !!cuit && /^\d{11}$/.test((cuit ?? '').replace(/\D/g, '')),
    staleTime: 60_000,
  })
}
