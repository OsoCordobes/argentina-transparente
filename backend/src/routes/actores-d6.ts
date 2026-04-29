// routes/actores-d6.ts — endpoint para /actores (PLAN-UI D6).
//
// Distinto del routes/actores.ts (legacy chat-first). Este es el directorio
// fuzzy con métricas combinadas:
//   - $ total: contratos como proveedor (PJ) o agregado de aportes (PF)
//   - # señales activas: del actor en señales_cache
//   - ✓ verificación: badge ON si tiene fuente_dni_url o validación módulo-11
//
// Devuelve PF y PJ unificados con `kind` discriminator.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const actoresD6Router = Router()
export default actoresD6Router

interface ActorRow {
  kind: 'pf' | 'pj'
  id: string             // dni o cuit
  label: string
  identityValue: string
  jurisdiccion: string | null
  montoTotal: number
  senalesActivas: number
  verificada: boolean
}

actoresD6Router.get('/', async (req: Request, res: Response) => {
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : ''
  // Audit fix SEC-W2: validar tipo contra allowlist; default 'todos' en caso
  // de string desconocido (antes lo tomaba pero ningún branch matcheaba y
  // el endpoint devolvía [] silenciosamente).
  const tipoRaw = req.query.tipo ? String(req.query.tipo) : 'todos'
  const tipo: 'todos' | 'pf' | 'pj' = (tipoRaw === 'pf' || tipoRaw === 'pj') ? tipoRaw : 'todos'
  const conSenales = req.query.conSenales === '1'
  const minMonto = req.query.minMonto ? Number(req.query.minMonto) : 0
  const limitRaw = Number(req.query.limit ?? 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
  const offsetRaw = Number(req.query.offset ?? 0)
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

  try {
    const items: ActorRow[] = []

    if (tipo === 'todos' || tipo === 'pj') {
      // PJ: razón social + cuit + dom_fiscal_provincia + total contratado + señales
      const pjWhere: string[] = []
      const pjParams: unknown[] = []
      if (q) {
        pjWhere.push('(LOWER(pj.razon_social) LIKE ? OR pj.cuit LIKE ?)')
        pjParams.push(`%${q}%`, `%${q}%`)
      }
      const pjWhereSql = pjWhere.length ? `WHERE ${pjWhere.join(' AND ')}` : ''
      const pjRows = await dbAll<{
        cuit: string; razon_social: string; dom_fiscal_provincia: string | null;
        monto_total: number | null; senales_activas: number; verificada: boolean;
      }>(
        `SELECT pj.cuit, pj.razon_social, pj.dom_fiscal_provincia,
                COALESCE((
                  SELECT SUM(monto) FROM contratos c
                   WHERE c.proveedor_cuit = pj.cuit
                ), 0) AS monto_total,
                COALESCE((
                  SELECT COUNT(*) FROM señales_cache s
                   WHERE s.entidades_cuit LIKE '%' || pj.cuit || '%'
                     AND s.estado_verificacion != 'descartada'
                ), 0) AS senales_activas,
                TRUE AS verificada -- PJ pasó validarCUIT al insertar (A2)
           FROM personas_juridicas pj
           ${pjWhereSql}
          ORDER BY monto_total DESC
          LIMIT ${limit} OFFSET ${offset}`,
        pjParams,
      )
      for (const r of pjRows) {
        const monto = Number(r.monto_total ?? 0)
        const sen = Number(r.senales_activas ?? 0)
        if (conSenales && sen === 0) continue
        if (monto < minMonto) continue
        items.push({
          kind: 'pj',
          id: r.cuit,
          label: r.razon_social,
          identityValue: r.cuit,
          jurisdiccion: r.dom_fiscal_provincia,
          montoTotal: monto,
          senalesActivas: sen,
          verificada: !!r.verificada,
        })
      }
    }

    if (tipo === 'todos' || tipo === 'pf') {
      const pfWhere: string[] = []
      const pfParams: unknown[] = []
      if (q) {
        pfWhere.push('(LOWER(pf.apellido_nombre) LIKE ? OR pf.dni LIKE ? OR pf.cuit LIKE ?)')
        pfParams.push(`%${q}%`, `%${q}%`, `%${q}%`)
      }
      const pfWhereSql = pfWhere.length ? `WHERE ${pfWhere.join(' AND ')}` : ''
      const pfRows = await dbAll<{
        dni: string; cuit: string | null; apellido_nombre: string;
        senales_activas: number; verificada: boolean;
      }>(
        `SELECT pf.dni, pf.cuit, pf.apellido_nombre,
                COALESCE((
                  SELECT COUNT(*) FROM señales_cache s
                   WHERE s.estado_verificacion != 'descartada'
                     AND (
                       s.entidades_cuit LIKE '%' || COALESCE(pf.cuit, '___invalid___') || '%'
                       OR s.titulo LIKE '%' || pf.apellido_nombre || '%'
                     )
                ), 0) AS senales_activas,
                CASE WHEN pf.fuente_dni_url IS NOT NULL THEN TRUE ELSE FALSE END AS verificada
           FROM personas_fisicas pf
           ${pfWhereSql}
          LIMIT ${limit} OFFSET ${offset}`,
        pfParams,
      )
      for (const r of pfRows) {
        const sen = Number(r.senales_activas ?? 0)
        if (conSenales && sen === 0) continue
        if (minMonto > 0) continue // PF sin monto recibido
        items.push({
          kind: 'pf',
          id: r.dni,
          label: r.apellido_nombre,
          identityValue: r.dni,
          jurisdiccion: null,
          montoTotal: 0,
          senalesActivas: sen,
          verificada: !!r.verificada,
        })
      }
    }

    items.sort((a, b) => {
      if (a.montoTotal !== b.montoTotal) return b.montoTotal - a.montoTotal
      return b.senalesActivas - a.senalesActivas
    })

    return res.json({
      items: items.slice(0, limit),
      paginacion: { total: items.length, limit, offset },
    })
  } catch (err) {
    // Audit fix SEC-3: log completo en server, mensaje genérico al cliente.
    console.error('[actores-d6]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})
