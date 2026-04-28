// soundex-es.ts — Soundex fonético para español (Argentina).
//
// Soundex inglés clásico no maneja:
//   - Ñ (debe ir como N+I)
//   - Acentos (Á → A, etc.)
//   - Dígrafos LL/CH/RR (suenan como una unidad)
//   - Ortografía variable: GUITARRA / GUI vs G+E (GENERO vs JENERO)
//
// Esta implementación apunta a "matching por sonido" para apellidos hispanos.
// Casos clásicos que debe agrupar:
//   FERNANDEZ, FERNANDES, HERNANDEZ → mismo código (F → reduced inicial)
//   GONZALES, GONZALEZ → mismo código
//   PEREZ, PERES → mismo código
//   GUTIERREZ, GUTIERRES → mismo código
//   MUÑOZ, MUNIOZ → mismo código (Ñ = NI)
//
// El código de salida es: 1 letra inicial + 4 dígitos (formato Soundex
// estándar pero con tabla de codificación adaptada al castellano).
//
// Use case en ARGOS:
//   - identity-resolver: candidatos Tier 3 fuzzy ahora también pueden
//     matchear por soundex cuando la similitud literal está bajo umbral.
//   - Detector M4.1: filtro alternativo de "apellido raro" que tolere
//     variantes ortográficas (FERNANDES vs FERNANDEZ).

/**
 * Normaliza un texto removiendo acentos y caracteres no-alfa y devuelve
 * uppercase. Mantiene Ñ como caso especial (sustituye por NI).
 */
export function normalizarParaSoundex(s: string): string {
  if (!s) return ''
  // Ñ → NI ANTES de NFD/diacritic-strip (NFD descompone Ñ a N+tilde y luego
  // perdemos la información). Hacemos el replace con el carácter Unicode
  // explícito para no depender del orden de transformaciones.
  return s
    .replace(/[Ññ]/g, 'NI')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')      // borrar diacríticos restantes
    .toUpperCase()
    .replace(/[^A-Z]/g, ' ')              // colapsar todo lo no-letra a espacios
    .replace(/\s+/g, ' ')
    .trim()
}

/**
 * Aplica reducciones fonéticas comunes del castellano antes de tabular.
 * Devuelve siempre uppercase y sin acentos (ver normalizarParaSoundex).
 */
export function reducirFonemas(s: string): string {
  let r = s
  // Doble letra → simple (LL → L, RR → R, NN → N, CC → C, SS → S)
  r = r.replace(/L L|LL/g, 'L')
  r = r.replace(/R R|RR/g, 'R')
  r = r.replace(/N N|NN/g, 'N')
  r = r.replace(/C C|CC/g, 'C')
  r = r.replace(/S S|SS/g, 'S')

  // Dígrafos castellanos: CH suena como SH (lo mapeamos a X)
  r = r.replace(/CH/g, 'X')

  // QU → K, Q → K
  r = r.replace(/QU/g, 'K')
  r = r.replace(/Q/g, 'K')

  // GU + (E|I) → G (la U es muda); GU + (A|O) → GU.
  // Para soundex la diferencia es trivial — colapsamos a G.
  r = r.replace(/GU([EI])/g, 'G$1')

  // C + (E|I) → S (sonido suave); C + (A|O|U) → K.
  r = r.replace(/C([EI])/g, 'S$1')
  r = r.replace(/C([AOU])/g, 'K$1')
  // C seguida de consonante o final de palabra → K (sonido fuerte)
  r = r.replace(/C/g, 'K')

  // G + (E|I) → J (sonido fuerte); G + (A|O|U) → G.
  r = r.replace(/G([EI])/g, 'J$1')

  // H muda → eliminar (pero ya se manejó CH arriba)
  r = r.replace(/H/g, '')

  // Z → S (ceceo argentino)
  r = r.replace(/Z/g, 'S')

  // PH → F (raro en castellano pero apellidos extranjeros)
  r = r.replace(/PH/g, 'F')

  // V → B (mismo fonema en castellano americano)
  r = r.replace(/V/g, 'B')

  // K → K (estable)
  // X → X (estable, ya viene de CH)

  return r
}

/**
 * Tabla de codificación adaptada al castellano. Letras que NO suenan
 * (vocales después de la inicial, H, W, Y) se elide.
 *
 * Bases del Soundex original adaptadas:
 *   B, F, P, V → 1   (labiales, V ya está mapeada a B en reducirFonemas)
 *   K, G, J, X (CH→X) → 2  (guturales/palatales fuertes)
 *   D, T → 3   (dentales)
 *   L → 4
 *   M, N → 5   (nasales)
 *   R → 6
 *   S, Z → 7   (sibilantes; Z ya se mapeó a S)
 *
 * Vocales (A, E, I, O, U) → no se codifican (separadores).
 */
const TABLA_CASTELLANA: Record<string, string> = {
  B: '1', F: '1', P: '1',
  K: '2', G: '2', J: '2', X: '2',
  D: '3', T: '3',
  L: '4',
  M: '5', N: '5',
  R: '6',
  S: '7',
}

function codificarLetra(c: string): string {
  return TABLA_CASTELLANA[c] ?? ''
}

/**
 * Calcula el Soundex castellano de un solo token (apellido).
 * Devuelve un código de 5 chars: 1 letra + 4 dígitos.
 *
 * Ejemplos:
 *   soundexEs('FERNANDEZ')  → 'F6537'
 *   soundexEs('FERNANDES')  → 'F6537'   (mismo código)
 *   soundexEs('HERNANDEZ')  → 'E6537'   (H muda → arranca con E)
 *   soundexEs('GONZALES')   → 'G5247'   (Z → S)
 *   soundexEs('GONZALEZ')   → 'G5247'   (mismo)
 *   soundexEs('MUÑOZ')      → 'M5527'   (Ñ → NI)
 */
export function soundexEs(token: string): string {
  if (!token) return ''
  const norm = normalizarParaSoundex(token)
  if (!norm) return ''
  const reducido = reducirFonemas(norm)
  if (!reducido) return ''

  // Tomar primer caracter alfa como letra inicial (especial: H muda → tomar siguiente)
  let primera = reducido[0]
  let resto = reducido.slice(1)
  if (primera === 'H') {
    // ya lo borró reducirFonemas, pero por defensiva
    primera = resto[0] ?? ''
    resto = resto.slice(1)
  }
  if (!primera) return ''

  // Codificar el resto, eliminar duplicados consecutivos, eliminar vocales y separadores vacíos.
  const codigos: string[] = []
  // Para evitar que la primera letra colisione con su propio código (ej. F → 1):
  // miramos su código y, si la siguiente letra del resto codifica igual, la fusionamos.
  const codigoPrimera = codificarLetra(primera)
  let prev = codigoPrimera

  for (const ch of resto) {
    const code = codificarLetra(ch)
    if (!code) {
      // Vocal o letra sin código → resetea prev (permite repeticiones legítimas)
      prev = ''
      continue
    }
    if (code === prev) continue  // colapsa duplicados consecutivos
    codigos.push(code)
    prev = code
  }

  const numeros = codigos.join('').slice(0, 4).padEnd(4, '0')
  return primera + numeros
}

/**
 * Apellido completo "DE LA TORRE" → procesa cada token relevante y devuelve
 * el código del último apellido principal. Esto refleja el orden hispano
 * "PEREZ DE LA TORRE" donde el primer apellido es el dominante,
 * pero la práctica argentina usa el último apellido (paterno) como key.
 *
 * Soporta prefijos comunes ("DE", "DEL", "DE LA", "LA", "Y") que se ignoran
 * a la hora de elegir el token a codificar.
 */
const PREFIJOS_HISPANOS = new Set([
  'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y',
  // Variantes europeas
  'VAN', 'VON', 'DI', 'DO', 'DA', 'DOS', 'DAS',
])

export function soundexApellido(apellidoCompleto: string): string {
  const norm = normalizarParaSoundex(apellidoCompleto)
  const tokens = norm.split(/\s+/).filter(t => t.length >= 2 && !PREFIJOS_HISPANOS.has(t))
  if (tokens.length === 0) return ''
  // En Argentina el primer token suele ser el apellido principal (paterno).
  // Ejemplo: "FERNANDEZ DE LA RUA" → 'FERNANDEZ'.
  // Ejemplo: "DE LA TORRE" → tras filtrar prefijos queda 'TORRE'.
  return soundexEs(tokens[0])
}

/**
 * Compara dos apellidos (o nombres completos) y devuelve true si suenan
 * igual según Soundex castellano.
 *
 * Útil para fuzzy matching cuando la distancia de Levenshtein es engañosa
 * (FERNANDES vs FERNANDEZ tienen distancia 1, pero MAUSER vs MAUSEN también
 * distancia 1 y NO suenan igual).
 */
export function suenanIgual(a: string, b: string): boolean {
  const ca = soundexApellido(a)
  const cb = soundexApellido(b)
  return !!ca && ca === cb
}
