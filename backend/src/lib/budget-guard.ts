// budget-guard.ts — Hard cap sobre saldo Anthropic
//
// Política:
// - El user recarga €50 (~$53) cada viernes. Budget operativo ~$45/sem (15% margen).
// - ANTHROPIC_BUDGET_USD env var define el cap (default 45.00, hard limit 50.00).
// - Cada call a Anthropic se registra en `llm_usage` (timestamp + costo_usd).
// - Antes de cada call se proyecta el costo (worst case) y se compara contra
//   `ANTHROPIC_BUDGET_USD - costoAcumuladoEnVentana`. Si excede → throw con
//   code='BUDGET_EXCEEDED' y la ruta retorna 429.
//
// Si en algún punto el codigo recibe error 'credit_balance_too_low' del backend
// Anthropic, registramos la falla en `llm_usage` con status='no_credits' y
// retornamos 503 al cliente.

import crypto from 'crypto'
import { dbRun, dbAll } from './db'

// ─── Precios Anthropic (USD per Mtok) ────────────────────────────────────────
// Fuente: https://www.anthropic.com/pricing (April 2026)
// Cache reads cuestan 10% del input price. Cache writes cuestan 25% más.
export const PRECIOS_USD_PER_MTOK = {
  'claude-sonnet-4-6':            { input: 3.00, output: 15.00 },
  'claude-opus-4-7':              { input: 15.00, output: 75.00 },
  'claude-haiku-4-5-20251001':    { input: 0.80, output: 4.00 },
  // Modelos legacy (compat con código existente que aún los referencia)
  'claude-sonnet-4-20250514':     { input: 3.00, output: 15.00 },
} as const

export type ModeloSoportado = keyof typeof PRECIOS_USD_PER_MTOK

// ─── Configuración runtime ───────────────────────────────────────────────────

export const ANTHROPIC_BUDGET_USD: number = parseFloat(
  process.env.ANTHROPIC_BUDGET_USD ?? '45.00'
)
const HARD_LIMIT_USD = 50.00
const SAFETY_MARGIN_PCT = 0.15  // reservar 15% para errores de estimación

/** Ventana semanal — cada viernes el user recarga, reseteamos efectivamente */
function weekWindowStart(): Date {
  const now = new Date()
  // Viernes pasado a las 00:00 UTC. JS: getUTCDay() devuelve 0=domingo..6=sábado
  // Viernes = 5. Restamos días hasta el último viernes.
  const day = now.getUTCDay()
  const daysSinceFriday = (day - 5 + 7) % 7
  const friday = new Date(Date.UTC(
    now.getUTCFullYear(), now.getUTCMonth(),
    now.getUTCDate() - daysSinceFriday, 0, 0, 0, 0
  ))
  return friday
}

// ─── Estimación de costo ──────────────────────────────────────────────────────

export function estimarCostoCall(
  modelo: ModeloSoportado,
  inputTokens: number,
  outputTokens: number,
  cacheReadTokens: number = 0,
  cacheCreationTokens: number = 0,
): number {
  const p = PRECIOS_USD_PER_MTOK[modelo]
  if (!p) throw new Error(`Modelo no soportado: ${modelo}`)
  const freshInput = Math.max(0, inputTokens - cacheReadTokens - cacheCreationTokens)
  const cost =
    (freshInput * p.input) / 1_000_000 +
    (cacheReadTokens * p.input * 0.10) / 1_000_000 +
    (cacheCreationTokens * p.input * 1.25) / 1_000_000 +
    (outputTokens * p.output) / 1_000_000
  return Math.round(cost * 1_000_000) / 1_000_000  // 6 decimales
}

// ─── Tracking ─────────────────────────────────────────────────────────────────

export interface LlmCallRecord {
  endpoint: string
  modelo: ModeloSoportado | string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheCreationTokens: number
  costoUsd: number
  status: 'success' | 'error' | 'budget_exceeded' | 'no_credits'
  errorMessage?: string
}

export async function recordLlmCall(record: LlmCallRecord): Promise<void> {
  const id = crypto.randomBytes(8).toString('hex')
  await dbRun(
    `INSERT INTO llm_usage (
      id, timestamp, endpoint, modelo, input_tokens, output_tokens,
      cache_read_tokens, cache_creation_tokens, costo_usd, status, error_message
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      new Date().toISOString(),
      record.endpoint,
      record.modelo,
      record.inputTokens,
      record.outputTokens,
      record.cacheReadTokens,
      record.cacheCreationTokens,
      record.costoUsd,
      record.status,
      record.errorMessage ?? null,
    ]
  )
}

export async function getCostoAcumulado(desde?: Date): Promise<number> {
  const since = (desde ?? weekWindowStart()).toISOString()
  const rows = await dbAll<{ total: number | null }>(
    `SELECT SUM(costo_usd) as total FROM llm_usage
     WHERE timestamp >= ? AND status = 'success'`,
    [since]
  )
  return Number(rows[0]?.total ?? 0)
}

export async function getCostoPorRoute(
  endpoint: string,
  desde?: Date,
): Promise<number> {
  const since = (desde ?? weekWindowStart()).toISOString()
  const rows = await dbAll<{ total: number | null }>(
    `SELECT SUM(costo_usd) as total FROM llm_usage
     WHERE endpoint = ? AND timestamp >= ? AND status = 'success'`,
    [endpoint, since]
  )
  return Number(rows[0]?.total ?? 0)
}

// ─── Asserts ─────────────────────────────────────────────────────────────────

export class BudgetExceededError extends Error {
  code = 'BUDGET_EXCEEDED'
  remaining: number
  costoAcumulado: number
  costoProyectado: number
  constructor(message: string, costoAcumulado: number, costoProyectado: number) {
    super(message)
    this.costoAcumulado = costoAcumulado
    this.costoProyectado = costoProyectado
    this.remaining = Math.max(0, ANTHROPIC_BUDGET_USD - costoAcumulado)
  }
}

/**
 * Verifica que el call proyectado quepa dentro del budget operativo de la semana.
 * Lanza BudgetExceededError si no. La ruta debe atrapar y devolver 429.
 */
export async function assertBudget(
  modelo: ModeloSoportado,
  maxInputTokens: number,
  maxOutputTokens: number,
): Promise<void> {
  const costoAcum = await getCostoAcumulado()
  // Worst case: sin cache reads
  const costoProy = estimarCostoCall(modelo, maxInputTokens, maxOutputTokens, 0, 0)
  const budgetEfectivo = ANTHROPIC_BUDGET_USD * (1 - SAFETY_MARGIN_PCT)

  if (costoAcum + costoProy > budgetEfectivo) {
    throw new BudgetExceededError(
      `Budget semanal excedido: $${(costoAcum + costoProy).toFixed(4)} > $${budgetEfectivo.toFixed(4)} (cap operativo, hard limit $${HARD_LIMIT_USD})`,
      costoAcum,
      costoProy,
    )
  }
  if (costoAcum + costoProy > HARD_LIMIT_USD) {
    throw new BudgetExceededError(
      `Hard limit USD ${HARD_LIMIT_USD} sería excedido — abort`,
      costoAcum,
      costoProy,
    )
  }
}

/** Detector explícito del error de saldo agotado de Anthropic.
 * Cubre variantes observadas + plausibles:
 *  - "credit balance is too low" (Anthropic estándar)
 *  - "credit balance too low" (sin "is", paraphrased)
 *  - "insufficient credit"
 *  - "quota exceeded"
 *  - "out of credits"
 */
export function isOutOfCreditsError(err: unknown): boolean {
  if (err == null) return false
  const msg = err instanceof Error ? err.message : String(err)
  return /credit\s*balance(\s+is)?\s+too\s+low|insufficient\s+credit|quota\s+exceeded|out\s+of\s+credits/i
    .test(msg)
}
