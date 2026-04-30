// llm-validator.ts — Validador post-LLM "blindado" de hechos sin cita.
//
// Política dura (CLAUDE.md §2 "cero alucinaciones"):
//   Todo "hecho" (monto, fecha, CUIT, razón social) emitido por el modelo
//   debe ir acompañado de una cita inline `[[node:<id>]]` dentro de una
//   ventana de PROXIMITY_CHARS caracteres. Si no, el chunk se bloquea.
//
// Uso: invocar `validarChunk(buffer)` antes de hacer flush al cliente SSE.
// Si retorna `{ valid: false }`, abortar el stream y avisar al usuario.

export interface ValidationResult {
  valid: boolean
  reason?: string
  position?: number
  matchedText?: string
}

/** Patrones que detectan un "hecho" verificable en texto LLM. */
const PATRONES_HECHO: Array<{ name: string; re: RegExp }> = [
  // Monto: $100, $100M, $100 millones, $1.234.567,89
  { name: 'monto', re: /\$\s*[\d.,]+(?:\s*(?:millones?|millón|M|MM|mil))?/gi },
  // Fecha numérica: 12/05/2022, 12-05-22, 12.05.2022
  { name: 'fecha', re: /\b\d{1,2}([-/.])\d{1,2}\1\d{2,4}\b/g },
  // CUIT: 30-12345678-9 o 30123456789
  { name: 'cuit', re: /\b\d{2}-?\d{8}-?\d\b/g },
  // Razón social: token mayúscula + sufijo societario (S.A., S.R.L., UTE, …)
  {
    name: 'razon_social',
    re: /\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}\s+(?:S\.?A\.?|S\.?R\.?L\.?|UTE|SAIIC[FA]?A?|SACICI|SAIC|COOP)\b/g,
  },
]

const NODE_REF_RE = /\[\[node:[^\]]+\]\]/g
const PROXIMITY_CHARS = 80 // distancia máxima entre hecho y cita

/** True si hay al menos una `[[node:...]]` cita dentro de la ventana
 *  ±PROXIMITY_CHARS alrededor de `position` en `texto`. */
function hayCitaCerca(texto: string, position: number): boolean {
  const ventanaInicio = Math.max(0, position - PROXIMITY_CHARS)
  const ventanaFin = Math.min(texto.length, position + PROXIMITY_CHARS)
  const ventana = texto.slice(ventanaInicio, ventanaFin)
  // Reset del lastIndex de la regex stateful (g flag) antes de cada `.test()`
  NODE_REF_RE.lastIndex = 0
  return NODE_REF_RE.test(ventana)
}

/**
 * Valida un chunk de texto emitido por el LLM.
 * Retorna `{ valid: false, reason, position, matchedText }` ante el primer
 * "hecho" detectado sin una cita `[[node:id]]` cercana.
 */
export function validarChunk(texto: string): ValidationResult {
  for (const { name, re } of PATRONES_HECHO) {
    const matches = texto.matchAll(re)
    for (const m of matches) {
      if (m.index === undefined) continue
      if (!hayCitaCerca(texto, m.index)) {
        return {
          valid: false,
          reason: `hecho sin cita (${name})`,
          position: m.index,
          matchedText: m[0],
        }
      }
    }
  }
  return { valid: true }
}
