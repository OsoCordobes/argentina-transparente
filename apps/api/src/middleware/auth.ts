import type { Request, Response, NextFunction } from 'express'

// ─── Placeholder auth middleware ──────────────────────────────────────────────
// Fase A: en dev, leemos `X-User-Email` del header y lo dejamos en `req.locals.userEmail`.
// Esto permite que los endpoints (casos, archivos, feedback, dossier) asocien
// recursos a un "owner" antes de que Clerk esté activo.
//
// Cuando se active Clerk:
//  - Reemplazar este middleware por el validador JWT de Clerk
//  - Resolver el email desde el token verificado, no desde un header cliente-controlado
//  - Mantener la misma forma: `req.locals.userEmail = string | null`

export interface RequestLocals {
  userEmail?: string | null
}

export type AuthedRequest = Request & { locals?: RequestLocals }

const HEADER_NAME = 'x-user-email'

function isValidEmail(value: string): boolean {
  // Chequeo mínimo — el middleware real (Clerk) validará contra un proveedor de identidad.
  if (value.length > 254) return false
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)
}

export function devAuth(req: Request, _res: Response, next: NextFunction): void {
  const raw = req.header(HEADER_NAME)
  const email = typeof raw === 'string' && isValidEmail(raw.trim()) ? raw.trim().toLowerCase() : null

  const authedReq = req as AuthedRequest
  authedReq.locals = { ...(authedReq.locals ?? {}), userEmail: email }

  next()
}

export default devAuth
