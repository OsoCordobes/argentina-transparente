import type { Response } from 'express'

// ─── Unified API error shape ───────────────────────────────────────────────────
// HANDOFF §3.4: { error: { code, message, details? } }
// HTTP status code is the source of truth; the body is for display / debugging.

export function apiErr(
  res: Response,
  status: number,
  code: string,
  message: string,
  details?: unknown,
) {
  return res.status(status).json({
    error: {
      code,
      message,
      ...(details !== undefined ? { details } : {}),
    },
  })
}
