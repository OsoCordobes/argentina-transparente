// identidad-validator.ts — Validación y normalización de DNI/CUIT/CUIL.
// PLAN-DATOS Fase A3.
//
// Reglas duras (PLAN-DATOS §2):
//   - Persona Física (PF): DNI 7-8 dígitos. CUIT con prefijo {20, 23, 24, 27}
//     formateado como XX-DDDDDDDD-V. CUIL == CUIT cuando coexisten.
//   - Persona Jurídica (PJ): CUIT con prefijo {30, 33, 34}. NO tiene DNI.
//   - El dígito verificador del CUIT es el módulo-11 con pesos
//     [5,4,3,2,7,6,5,4,3,2] aplicados a los primeros 10 dígitos.
//
// Seeds que populan personas_fisicas / personas_juridicas DEBEN llamar
// a `validarCUIT()` y rechazar (o quarantinear) toda fila con DV inválido.

const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const

const PREFIJOS_PF = new Set(['20', '23', '24', '27'])
const PREFIJOS_PJ = new Set(['30', '33', '34'])

/**
 * Quita todo lo que no sea dígito y devuelve la forma canónica.
 * Acepta "12.345.678", "12-345-678", "12 345 678" → "12345678".
 * Devuelve null si no quedan dígitos o si se exceden los esperados.
 */
export function normalizarDNI(s: string | null | undefined, opts: { maxLen?: number } = {}): string | null {
  if (s == null) return null
  const soloDigitos = String(s).replace(/\D/g, '')
  if (soloDigitos.length === 0) return null
  // DNI argentino: 7-8 dígitos típicamente. DNIs muy antiguos pueden tener
  // 6 (raros, anteriores a 1968). Sobre 8 = error de captura/OCR.
  const max = opts.maxLen ?? 8
  if (soloDigitos.length > max) return null
  if (soloDigitos.length < 6) return null
  return soloDigitos
}

/**
 * Forma canónica del CUIT: 11 dígitos sin separadores.
 * Acepta "20-12345678-6", "20 12345678 6", "20.12345678.6", "20123456786".
 * Devuelve null si no son exactamente 11 dígitos.
 */
export function normalizarCUIT(s: string | null | undefined): string | null {
  if (s == null) return null
  const soloDigitos = String(s).replace(/\D/g, '')
  if (soloDigitos.length !== 11) return null
  return soloDigitos
}

/**
 * Calcula el dígito verificador esperado para los primeros 10 dígitos
 * de un CUIT. Devuelve un número 0-10 (10 = CUIT no asignable, inválido).
 */
export function dvCuitEsperado(primeros10: string): number {
  if (primeros10.length !== 10 || !/^\d{10}$/.test(primeros10)) {
    throw new Error(`dvCuitEsperado: input debe ser 10 dígitos exactos, got "${primeros10}"`)
  }
  let suma = 0
  for (let i = 0; i < 10; i++) {
    suma += Number(primeros10[i]) * PESOS_CUIT[i]
  }
  const resto = suma % 11
  const dv = 11 - resto
  if (dv === 11) return 0
  return dv  // puede ser 10 (CUIT inválido por convención AFIP)
}

/**
 * Valida un CUIT por algoritmo módulo-11. Acepta forma con o sin separadores.
 * Devuelve false si:
 *   - No son 11 dígitos
 *   - El prefijo no está en los conocidos (20, 23, 24, 27, 30, 33, 34)
 *   - El dígito verificador no coincide
 *   - El DV calculado es 10 (CUIT no asignable)
 */
export function validarCUIT(s: string | null | undefined): boolean {
  const norm = normalizarCUIT(s)
  if (!norm) return false
  const prefijo = norm.slice(0, 2)
  if (!PREFIJOS_PF.has(prefijo) && !PREFIJOS_PJ.has(prefijo)) return false
  const esperado = dvCuitEsperado(norm.slice(0, 10))
  if (esperado === 10) return false
  return esperado === Number(norm[10])
}

/**
 * Valida un DNI: dígitos numéricos, longitud razonable. NO valida que el DNI
 * exista (eso requiere consulta al RENAPER). Solo descarta basura obvia.
 */
export function validarDNI(s: string | null | undefined): boolean {
  return normalizarDNI(s) !== null
}

/**
 * ¿El CUIT corresponde a Persona Física (prefijos 20/23/24/27)?
 * Asume CUIT ya validado — usar después de `validarCUIT`.
 */
export function esCuitPersonaFisica(cuit: string): boolean {
  const norm = normalizarCUIT(cuit)
  if (!norm) return false
  return PREFIJOS_PF.has(norm.slice(0, 2))
}

/**
 * ¿El CUIT corresponde a Persona Jurídica (prefijos 30/33/34)?
 */
export function esCuitPersonaJuridica(cuit: string): boolean {
  const norm = normalizarCUIT(cuit)
  if (!norm) return false
  return PREFIJOS_PJ.has(norm.slice(0, 2))
}

/**
 * Formatea CUIT con guiones: 20123456786 → 20-12345678-6.
 * Si el input no es válido, devuelve null.
 */
export function formatCUIT(s: string | null | undefined): string | null {
  const norm = normalizarCUIT(s)
  if (!norm) return null
  return `${norm.slice(0, 2)}-${norm.slice(2, 10)}-${norm.slice(10)}`
}

/**
 * Devuelve los CUITs candidatos para una persona física dado su DNI.
 * Prueba los 4 prefijos PF y devuelve los que producen un dígito verificador
 * válido (no 10). Generalmente 2 candidatos (uno masculino 20/23, uno
 * femenino 27/24), pero a veces solo uno es válido por la matemática del DV.
 *
 * Uso típico: si tenemos solo el DNI y queremos sugerir candidatos para
 * el campo `personas_fisicas.cuit`, esta función los enumera. La elección
 * final requiere fuente externa (DDJJ, padrón electoral con sexo).
 */
export function derivarCUITsCandidatos(dni: string): string[] {
  const dniNorm = normalizarDNI(dni)
  if (!dniNorm) return []
  // Pad a 8 dígitos para que el algoritmo de pesos funcione consistente.
  const dni8 = dniNorm.padStart(8, '0')
  const candidatos: string[] = []
  for (const prefijo of ['20', '23', '24', '27']) {
    const primeros10 = prefijo + dni8
    const dv = dvCuitEsperado(primeros10)
    if (dv !== 10) {
      candidatos.push(primeros10 + dv)
    }
  }
  return candidatos
}

/**
 * Extrae el DNI de un CUIT de Persona Física (prefijos 20/23/24/27).
 * Devuelve null si el CUIT es inválido, de PJ, o si no tiene 11 dígitos.
 * Útil para queries que joinean tablas con CUIT contra tablas con DNI.
 */
export function extraerDNIdeCUIT(cuit: string | null | undefined): string | null {
  const norm = normalizarCUIT(cuit)
  if (!norm) return null
  if (!PREFIJOS_PF.has(norm.slice(0, 2))) return null
  // Quita ceros a la izquierda del DNI extraído (era padded a 8).
  const dni = norm.slice(2, 10).replace(/^0+/, '')
  return dni.length >= 6 ? dni : null
}
