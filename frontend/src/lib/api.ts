const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export interface Señal {
  tipologia: string
  score: number
  titulo: string
  resumen: string
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: {
    articulos: string[]
    severidad: 'grave' | 'moderada' | 'leve'
    denunciarAnte: string[]
  }
}

export interface ComoVerificar {
  instrucciones: string[]
  expedientesSugeridos: string[]
  plazosLegales: string[]
}

export interface Expediente {
  municipio: string
  periodo: string
  generadoEn: string
  resumenEjecutivo: string
  señales: Señal[]
  datosBase: {
    totalContratos: number
    montoTotal: number
    topProveedores: { nombre: string; monto: number; porcentaje: number }[]
    tiposProceso: { tipo: string; cantidad: number; monto: number }[]
  }
  fuentes: { url: string; descripcion: string; fechaAcceso: string }[]
  guiaDenuncia?: {
    organismos: string[]
    marcoLegal: string[]
    pasos: string[]
  }
  comoVerificar?: ComoVerificar
}

export interface AnalisisResult {
  id: string
  expediente: Expediente
}

export async function analizarMunicipio(
  municipioId: string,
  anioDesde: number,
  anioHasta: number
): Promise<AnalisisResult> {
  const res = await fetch(`${API_URL}/analizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ municipioId, anioDesde, anioHasta }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'Error desconocido')
  return { id: data.id as string, expediente: data.expediente as Expediente }
}

export async function getMunicipios(): Promise<{
  id: string
  nombre: string
  aniosDisponibles: number[]
}[]> {
  const res = await fetch(`${API_URL}/municipios`)
  return res.json()
}

export interface HistorialItem {
  id: string
  municipio: string
  anio_desde: number
  anio_hasta: number
  generado_en: string
  resumen_ejecutivo: string | null
  total_contratos: number
  total_señales: number
}

export async function getHistorial(): Promise<HistorialItem[]> {
  try {
    const res = await fetch(`${API_URL}/historial`)
    if (!res.ok) return []
    return res.json()
  } catch {
    return []
  }
}

export async function getReporte(id: string): Promise<Expediente | null> {
  try {
    const res = await fetch(`${API_URL}/reporte/${id}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.expediente as Expediente
  } catch {
    return null
  }
}

export interface EntidadContrato {
  anio: number
  tipo: string
  area: string
  descripcion: string
  monto: number
  municipio: string
  fuente_url: string
}

export interface EntidadAfip {
  cuit: string
  esEmpleador: boolean
  inicioActividades: string | null
  estado: string | null
  actividadPrincipal: string | null
}

export interface EntidadTimeline {
  anio: number
  cantidad: number
  monto: number
}

export interface Entidad {
  nombre: string
  montoTotal: number
  totalContratos: number
  anios: number[]
  municipios: string[]
  areas: string[]
  afip: EntidadAfip | null
  timeline: EntidadTimeline[]
  tipos: { tipo: string; cantidad: number; monto: number }[]
  contratos: EntidadContrato[]
}

export async function getEntidad(nombre: string): Promise<Entidad | null> {
  try {
    const res = await fetch(`${API_URL}/api/entidad/${encodeURIComponent(nombre)}`)
    if (!res.ok) return null
    const data = await res.json()
    return data.ok ? data.entidad as Entidad : null
  } catch {
    return null
  }
}
