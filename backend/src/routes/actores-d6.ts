// routes/actores-d6.ts — endpoint para /actores (PLAN-UI D6).
//
// Refactor R1: con 763k PF + 496k PJ poblados, el patrón "dos queries
// + dedup en JS + slice" no escala. Ahora usamos UNION ALL en SQL puro
// con paginación real (LIMIT/OFFSET sobre el universo combinado) +
// COUNT total separado. Las métricas ($ contratado, # señales, ✓ verif)
// se calculan vía LEFT JOIN a tablas precomputadas o subqueries
// correlacionadas según convenga.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const actoresD6Router = Router()
export default actoresD6Router

interface ActorRow {
  kind: 'pf' | 'pj'
  id: string
  label: string
  jurisdiccion: string | null
  monto_total: number
  senales_activas: number
  verificada: number  // duckdb returns boolean as 0/1 in some drivers
}

actoresD6Router.get('/', async (req: Request, res: Response) => {
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : ''
  const tipoRaw = req.query.tipo ? String(req.query.tipo) : 'todos'
  const tipo: 'todos' | 'pf' | 'pj' = (tipoRaw === 'pf' || tipoRaw === 'pj') ? tipoRaw : 'todos'
  const conSenales = req.query.conSenales === '1'
  const minMonto = req.query.minMonto ? Number(req.query.minMonto) : 0
  const limitRaw = Number(req.query.limit ?? 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
  const offsetRaw = Number(req.query.offset ?? 0)
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

  // Construir condiciones por tipo. q se aplica en el lado del UNION
  // que matchea ese tipo (PF: apellido_nombre/dni, PJ: razon_social/cuit).
  const params: unknown[] = []
  const pjWhere: string[] = []
  const pfWhere: string[] = []

  if (q) {
    pjWhere.push('(LOWER(pj.razon_social) LIKE ? OR pj.cuit LIKE ?)')
    pfWhere.push('(LOWER(pf.apellido_nombre) LIKE ? OR pf.dni LIKE ? OR pf.cuit LIKE ?)')
  }
  // ConSenales filter: aplicado en el SELECT vía HAVING en lugar de WHERE
  // porque depende de un agregado.

  const pjEnabled = tipo === 'todos' || tipo === 'pj'
  const pfEnabled = tipo === 'todos' || tipo === 'pf'

  // Construyo el universo unioneado en una CTE. Una sola query.
  const sqlParts: string[] = []
  if (pjEnabled) {
    sqlParts.push(`
      SELECT
        'pj' AS kind,
        pj.cuit AS id,
        pj.razon_social AS label,
        pj.dom_fiscal_provincia AS jurisdiccion,
        COALESCE((
          SELECT SUM(monto) FROM contratos c WHERE c.proveedor_cuit = pj.cuit
        ), 0) AS monto_total,
        COALESCE((
          SELECT COUNT(*) FROM señales_cache s
           WHERE s.entidades_cuit LIKE '%' || pj.cuit || '%'
             AND s.estado_verificacion != 'descartada'
        ), 0) AS senales_activas,
        TRUE AS verificada
      FROM personas_juridicas pj
      ${pjWhere.length ? 'WHERE ' + pjWhere.join(' AND ') : ''}
    `)
  }
  if (pfEnabled) {
    sqlParts.push(`
      SELECT
        'pf' AS kind,
        pf.dni AS id,
        pf.apellido_nombre AS label,
        NULL AS jurisdiccion,
        0 AS monto_total,
        COALESCE((
          SELECT COUNT(*) FROM señales_cache s
           WHERE s.estado_verificacion != 'descartada'
             AND (
               s.entidades_cuit LIKE '%' || COALESCE(pf.cuit, '___none___') || '%'
               OR s.titulo LIKE '%' || pf.apellido_nombre || '%'
             )
        ), 0) AS senales_activas,
        CASE WHEN pf.fuente_dni_url IS NOT NULL THEN TRUE ELSE FALSE END AS verificada
      FROM personas_fisicas pf
      ${pfWhere.length ? 'WHERE ' + pfWhere.join(' AND ') : ''}
    `)
  }

  if (sqlParts.length === 0) return res.json({ items: [], paginacion: { total: 0, limit, offset } })

  // Filter conSenales / minMonto se aplican en outer query
  const havingConditions: string[] = []
  if (conSenales) havingConditions.push('senales_activas > 0')
  if (minMonto > 0) havingConditions.push(`monto_total >= ${minMonto}`)
  const havingSql = havingConditions.length
    ? `WHERE ${havingConditions.join(' AND ')}`
    : ''

  const innerUnion = sqlParts.join(' UNION ALL ')
  const fullSql = `
    WITH unioned AS (
      ${innerUnion}
    ),
    filtered AS (
      SELECT * FROM unioned ${havingSql}
    )
    SELECT * FROM filtered
    ORDER BY monto_total DESC, senales_activas DESC, label ASC
    LIMIT ${limit} OFFSET ${offset}
  `

  // params para todos los `q` repetidos: PJ usa 2 (razon, cuit), PF usa 3 (apellido, dni, cuit)
  const qParams: unknown[] = []
  if (pjEnabled && q) qParams.push(`%${q}%`, `%${q}%`)
  if (pfEnabled && q) qParams.push(`%${q}%`, `%${q}%`, `%${q}%`)

  const countSql = `
    WITH unioned AS (
      ${innerUnion}
    )
    SELECT COUNT(*) AS n FROM unioned ${havingSql}
  `

  try {
    const [rows, countRows] = await Promise.all([
      dbAll<ActorRow>(fullSql, qParams),
      dbAll<{ n: number }>(countSql, qParams),
    ])
    const items = rows.map(r => ({
      kind: r.kind,
      id: r.id,
      label: r.label,
      identityValue: r.id,
      jurisdiccion: r.jurisdiccion,
      montoTotal: Number(r.monto_total),
      senalesActivas: Number(r.senales_activas),
      verificada: !!r.verificada,
    }))
    return res.json({
      items,
      paginacion: {
        total: Number(countRows[0]?.n ?? 0),
        limit, offset,
      },
    })
  } catch (err) {
    console.error('[actores-d6]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})
