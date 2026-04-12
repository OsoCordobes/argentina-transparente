// IGJ — Inspección General de Justicia (directores y socios de sociedades)
//
// Estado: STUB — fuente de datos pendiente de identificación
//
// Opciones a evaluar (requiere WebFetch para mapear estructura):
//   1. igj.gob.ar — portal IGJ nacional (CABA + sociedades nacionales)
//   2. Dirección de Personas Jurídicas Córdoba — para empresas provinciales
//   3. datosabiertos.minjus.gob.ar — Ministerio de Justicia
//   4. APIs de terceros (OpenCorporates, etc.) — costo, requiere evaluación
//
// Cuando se implemente, esta función debe retornar:
//   - directores: string[]  (apellido nombre del director)
//   - socios: string[]
//   - fechaConstitucion: string | null
//   - domicilioRegistrado: string | null
//
// El CUIT es el identificador canónico para el lookup.

export interface IGJResult {
  cuit: string
  directores: string[]
  socios: string[]
  fechaConstitucion: string | null
  domicilioRegistrado: string | null
  encontrado: boolean
  fuenteUrl: string
}

export async function consultarIGJ(_cuit: string): Promise<IGJResult> {
  // TODO: implementar cuando se identifique la fuente de datos
  // Ver comentario arriba para opciones disponibles
  return {
    cuit: _cuit,
    directores: [],
    socios: [],
    fechaConstitucion: null,
    domicilioRegistrado: null,
    encontrado: false,
    fuenteUrl: 'pendiente',
  }
}
