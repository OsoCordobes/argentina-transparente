/**
 * Loader y schema de validación para `detectors-config.json`.
 *
 * Cada detector del motor de señales (`signals.ts`) lee desde aquí su
 * tier legal, norma sustentadora, umbrales y caveat (cuando aplica).
 * Esto saca los números mágicos y citas legales del código y permite
 * que un asesor jurídico revise umbrales y normas sin tocar TypeScript.
 *
 * Tiers (basado en auditoría legal 2026-04-26):
 *   1 = Primario: norma clara, conducta desalentada o prohibida explícitamente
 *   2 = Indicio: defendible como insumo investigativo pero NO infracción directa
 *       (debe llevar `caveat` claro para mostrar en UI)
 *   3 = (Reservado) — eliminar; no debería aparecer en producción
 */

import { z } from 'zod'

/**
 * Schema base con campos extra permitidos vía passthrough().
 * - tier: 1 | 2 | 3
 * - norma: requerida y no vacía para Tier 1 y Tier 2
 * - caveat: opcional pero recomendado para Tier 2
 * - umbral_minimo / umbral_grave / fuente_umbral: passthrough libre
 */
const detectorConfigSchema = z
  .object({
    tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
    norma: z.string().min(1).optional(),
    caveat: z.string().min(1).optional(),
    fuente_umbral: z.string().optional(),
    umbral_minimo: z.number().optional(),
    umbral_grave: z.number().optional(),
  })
  .passthrough()
  .superRefine((val, ctx) => {
    // Tier 1 y Tier 2 requieren norma no vacía. Tier 3 (eliminar) no
    // debería usarse en producción pero técnicamente queda permitido.
    if ((val.tier === 1 || val.tier === 2) && !val.norma) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `Detector tier ${val.tier} requiere campo "norma" no vacío.`,
        path: ['norma'],
      })
    }
  })

export type DetectorConfig = z.infer<typeof detectorConfigSchema>

const detectorRecordSchema = z.record(z.string(), detectorConfigSchema)

export type DetectorConfigRecord = Record<string, DetectorConfig>

/**
 * Valida y devuelve UN detector (usado por tests).
 * Lanza ZodError si la entrada es inválida.
 */
export function parseSingleDetectorConfig(input: unknown): DetectorConfig {
  return detectorConfigSchema.parse(input)
}

/**
 * Valida y devuelve el record completo (lo que vive en detectors-config.json).
 * Lanza ZodError si alguna entrada es inválida.
 */
export function parseDetectorConfig(input: unknown): DetectorConfigRecord {
  return detectorRecordSchema.parse(input) as DetectorConfigRecord
}
