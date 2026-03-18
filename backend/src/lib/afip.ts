// Verifica CUITs contra el padrón público de AFIP via cuitonline.com
// No requiere autenticación. Resultado se cachea en memoria por sesión.

const cache = new Map<string, AfipResult>()

export interface AfipResult {
  cuit: string
  razonSocial: string | null
  esEmpleador: boolean
  tieneIncumplimiento: boolean
  encontrado: boolean
  fuenteUrl: string
}

export async function verificarCUIT(nombreEmpresa: string): Promise<AfipResult> {
  const key = nombreEmpresa.trim().toUpperCase()
  if (cache.has(key)) return cache.get(key)!

  try {
    const query = encodeURIComponent(nombreEmpresa.trim())
    const url = `https://www.cuitonline.com/search.php?q=${query}`

    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; LaBestaBot/1.0)' },
      signal: AbortSignal.timeout(8000),
    })

    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    const html = await res.text()

    const cuitMatch = html.match(/CUIT:\s*([\d]{2}-[\d]{8}-[\d]{1})/)
    const cuit = cuitMatch ? cuitMatch[1].replace(/-/g, '') : null
    const esEmpleador = html.toLowerCase().includes('empleador')

    const result: AfipResult = {
      cuit: cuit ?? 'no encontrado',
      razonSocial: nombreEmpresa,
      esEmpleador,
      tieneIncumplimiento: false,
      encontrado: !!cuit,
      fuenteUrl: url,
    }

    cache.set(key, result)
    return result
  } catch {
    const result: AfipResult = {
      cuit: 'error',
      razonSocial: nombreEmpresa,
      esEmpleador: false,
      tieneIncumplimiento: false,
      encontrado: false,
      fuenteUrl: `https://www.cuitonline.com/search.php?q=${encodeURIComponent(nombreEmpresa)}`,
    }
    cache.set(key, result)
    return result
  }
}

export async function enriquecerProveedores(
  topProveedores: { nombre: string; monto: number; porcentaje: number }[]
): Promise<({ nombre: string; monto: number; porcentaje: number; afip?: AfipResult })[]> {
  const top5 = topProveedores.slice(0, 5)
  const resultados = await Promise.allSettled(
    top5.map(p => verificarCUIT(p.nombre))
  )

  return top5.map((p, i) => ({
    ...p,
    afip: resultados[i].status === 'fulfilled' ? resultados[i].value : undefined,
  }))
}
