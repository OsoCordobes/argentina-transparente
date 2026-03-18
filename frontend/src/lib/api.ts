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
}

export async function analizarMunicipio(
  municipioId: string,
  anioDesde: number,
  anioHasta: number
): Promise<Expediente> {
  const res = await fetch(`${API_URL}/analizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ municipioId, anioDesde, anioHasta }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(data.error ?? 'Error desconocido')
  return data.expediente as Expediente
}

export async function getMunicipios(): Promise<{
  id: string
  nombre: string
  aniosDisponibles: number[]
}[]> {
  const res = await fetch(`${API_URL}/municipios`)
  return res.json()
}
