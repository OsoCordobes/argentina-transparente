// jurisdicciones.ts — Mapeo canónico de jurisdicciones argentinas a provincias.
// Review iteración #1 C1: extracción del JURISDICCION_PROVINCIA hardcoded
// inline en detector-conflicto-funcionario-proveedor. Otros detectores (C3,
// C5, futuros) consumen la misma fuente de verdad.

/**
 * Mapeo `jurisdiccion` (string usado en agentes_publicos.jurisdiccion y
 * contratos.municipio) → provincia argentina canónica.
 *
 * Provincia se refiere al nivel federal (24 jurisdicciones argentinas:
 * 23 provincias + CABA). Cuando una jurisdicción NO es nivel provincial
 * (ej. 'nacion'), no hay mapeo — el detector decide si filtra o no según
 * el caso.
 */
const JURISDICCION_PROVINCIA: Record<string, string> = {
  'cordoba-capital': 'CORDOBA',
  'cordoba-provincia': 'CORDOBA',
  // Otras municipalidades cordobesas — agregar a medida que se cubran
  'cordoba-villa-carlos-paz': 'CORDOBA',
  'cordoba-rio-cuarto': 'CORDOBA',
  'cordoba-villa-maria': 'CORDOBA',
  // Otras provincias / municipios cubiertos
  'caba': 'CIUDAD AUTONOMA DE BUENOS AIRES',
  'caba-provincia': 'CIUDAD AUTONOMA DE BUENOS AIRES',
  'santa-fe': 'SANTA FE',
  'santa-fe-provincia': 'SANTA FE',
  'santa-fe-rosario': 'SANTA FE',
  'buenos-aires': 'BUENOS AIRES',
  'buenos-aires-provincia': 'BUENOS AIRES',
  // 'nacion' deliberadamente NO mapeado — funcionario nacional puede tener
  // contraparte en cualquier provincia, no se filtra geográficamente.
}

/** Lista canónica de provincias argentinas (24). Útil para validaciones. */
export const PROVINCIAS_ARGENTINAS = [
  'BUENOS AIRES',
  'CIUDAD AUTONOMA DE BUENOS AIRES',
  'CATAMARCA',
  'CHACO',
  'CHUBUT',
  'CORDOBA',
  'CORRIENTES',
  'ENTRE RIOS',
  'FORMOSA',
  'JUJUY',
  'LA PAMPA',
  'LA RIOJA',
  'MENDOZA',
  'MISIONES',
  'NEUQUEN',
  'RIO NEGRO',
  'SALTA',
  'SAN JUAN',
  'SAN LUIS',
  'SANTA CRUZ',
  'SANTA FE',
  'SANTIAGO DEL ESTERO',
  'TIERRA DEL FUEGO',
  'TUCUMAN',
] as const

export type ProvinciaArgentina = typeof PROVINCIAS_ARGENTINAS[number]

/**
 * Devuelve la provincia esperada para una jurisdicción dada, o null si
 * la jurisdicción es nacional o desconocida.
 */
export function provinciaDeJurisdiccion(jurisdiccion: string): string | null {
  return JURISDICCION_PROVINCIA[jurisdiccion] ?? null
}

/**
 * Normaliza una provincia (UPPER + sin tildes) para comparación lexical.
 * Ej. "Córdoba" → "CORDOBA", "córdoba" → "CORDOBA".
 */
export function normalizarProvincia(p: string | null | undefined): string | null {
  if (!p) return null
  return p
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Decide si la provincia del domicilio fiscal de la empresa es compatible
 * con la jurisdicción del funcionario.
 *
 *   'si'          → match estricto, conflicto plausible
 *   'no'          → mismatch confirmado (ej. funcionario Córdoba ↔ empresa CABA)
 *   'desconocido' → no se conoce la provincia (PJ no en RNS) o no se mapea
 *                   la jurisdicción del funcionario (ej. nacionales)
 *
 * Esta es la fuente única de verdad — antes estaba duplicada inline en
 * detector-conflicto-funcionario-proveedor.ts.
 */
export function coincideProvinciaJurisdiccion(
  jurisdiccion: string,
  domFiscalProvincia: string | null,
): 'si' | 'no' | 'desconocido' {
  const provinciaEsperada = provinciaDeJurisdiccion(jurisdiccion)
  if (!provinciaEsperada) return 'desconocido'
  const norm = normalizarProvincia(domFiscalProvincia)
  if (!norm) return 'desconocido'
  return norm === provinciaEsperada ? 'si' : 'no'
}

/**
 * Mapea código de jurisdicción a nombre humano (Spanish).
 * Espejo del helper humanJurisdiccion del frontend (ProfileShared.tsx).
 * Aquí en backend para que los detectores generen títulos legibles.
 */
export function humanizarJurisdiccion(j: string): string {
  const map: Record<string, string> = {
    'cordoba-capital': 'Córdoba Capital',
    'cordoba-provincia': 'Provincia de Córdoba',
    'cordoba-villa-carlos-paz': 'Villa Carlos Paz',
    'cordoba-rio-cuarto': 'Río Cuarto',
    'cordoba-villa-maria': 'Villa María',
    'caba': 'Ciudad Autónoma de Buenos Aires',
    'caba-provincia': 'CABA',
    'santa-fe': 'Santa Fe',
    'santa-fe-provincia': 'Provincia de Santa Fe',
    'santa-fe-rosario': 'Rosario',
    'buenos-aires': 'Buenos Aires',
    'buenos-aires-provincia': 'Provincia de Buenos Aires',
    'nacion': 'Gobierno Nacional',
  }
  return map[j] ?? j
}
