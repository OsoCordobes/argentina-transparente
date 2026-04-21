// Enriquecimiento de entidades via cuitonline.com (fuente no oficial — dato orientativo)
// AFIP/ARCA oficial requiere registro institucional (Padrón Alcance 4)
// Todo dato de esta fuente debe presentarse como "fuente no oficial, no verificado por ARCA"

import type { EmpresaEnriquecida } from '../types/index'

const cache = new Map<string, EmpresaEnriquecida>()

export async function verificarCUIT(nombreEmpresa: string): Promise<EmpresaEnriquecida> {
  const key = nombreEmpresa.trim().toUpperCase()
  if (cache.has(key)) return cache.get(key)!

  const query = encodeURIComponent(nombreEmpresa.trim())
  const fuenteUrl = `https://www.cuitonline.com/search.php?q=${query}`

  try {
    const res = await fetch(fuenteUrl, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; ARGOSBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const cuitMatch = html.match(/CUIT[:\s]+([\d]{2}-[\d]{8}-[\d]{1})/)
    const cuit = cuitMatch ? cuitMatch[1].replace(/-/g, '') : null

    const esEmpleador = /empleador/i.test(html)

    // Inicio de actividades: busca "DD/MM/YYYY" cerca de "inicio" o "actividades"
    const inicioMatch = html.match(/inicio\s+de\s+actividades[^0-9]*(\d{2}\/\d{2}\/\d{4})/i)
      ?? html.match(/(\d{2}\/\d{2}\/\d{4})[^0-9]*inicio/i)
    const inicioActividades = inicioMatch ? inicioMatch[1] : null

    // Estado fiscal
    const estadoMatch = html.match(/estado[:\s]+(ACTIVO|INACTIVO|SUSPENDIDO|NO\s+INSCRIPTO)/i)
    const estado = estadoMatch ? estadoMatch[1].toUpperCase() : null

    // Actividad principal (CLAE)
    const actividadMatch = html.match(/actividad\s+principal[:\s]+([^\n<]{5,60})/i)
    const actividadPrincipal = actividadMatch ? actividadMatch[1].trim() : null

    const result: EmpresaEnriquecida = {
      cuit,
      razonSocial: nombreEmpresa,
      esEmpleador,
      inicioActividades,
      estado,
      actividadPrincipal,
      directores: [],  // IGJ — Sprint 3 en curso
      encontrado: !!cuit,
      fuenteUrl,
    }

    cache.set(key, result)
    return result
  } catch {
    const result: EmpresaEnriquecida = {
      cuit: null, razonSocial: nombreEmpresa, esEmpleador: false,
      inicioActividades: null, estado: null, actividadPrincipal: null,
      directores: [], encontrado: false, fuenteUrl,
    }
    cache.set(key, result)
    return result
  }
}

export async function enriquecerProveedores(
  topProveedores: { nombre: string; monto: number; porcentaje: number }[]
): Promise<({ nombre: string; monto: number; porcentaje: number; afip?: EmpresaEnriquecida })[]> {
  const top5 = topProveedores.slice(0, 5)
  const resultados = await Promise.allSettled(top5.map(p => verificarCUIT(p.nombre)))
  return top5.map((p, i) => ({
    ...p,
    afip: resultados[i].status === 'fulfilled' ? resultados[i].value : undefined,
  }))
}
