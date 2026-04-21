import { Router, Request, Response, IRouter } from 'express'
import { z }                         from 'zod'
import type { Database }             from 'duckdb'

import { createGraphContext }        from '../engine/graph-context'
import { ALL_DETECTORS, runEngine }  from '@argos/engine'
import { apiErr }                    from '../lib/api-error'

const router: IRouter = Router()

// ─── Param validation schemas ─────────────────────────────────────────────────

const SearchQuery = z.object({
  q:    z.string().min(1).max(200),
  type: z.enum(['empresa', 'persona', 'proveedor', 'contrato', 'all']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const EntidadParams = z.object({
  id: z.string().min(1).max(200),
})

const SeñalesQuery = z.object({
  desde: z.coerce.number().int().min(2000).max(2099).default(2019),
  hasta: z.coerce.number().int().min(2000).max(2099).default(2023),
  municipio: z.string().default('cordoba-capital'),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDb(req: Request): Database {
  return (req.app.locals as { db: Database }).db
}

function dbAll<T = Record<string, unknown>>(db: Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err: Error | null, rows: unknown[]) =>
      err ? reject(err) : resolve(rows as T[]),
    )
  })
}

// Slugify a persona apellido_nombre into a URL-safe fallback id
function slugPersona(nombre: string): string {
  return nombre.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// ─── GET /api/entidad/search?q=&type=&limit= ─────────────────────────────────
// Queries the IGJ corpus (empresas + personas) and Córdoba contratos.
// `empresas` / `directores` legacy tables are empty — not used here.

router.get('/search', async (req: Request, res: Response) => {
  const parse = SearchQuery.safeParse(req.query)
  if (!parse.success) {
    return apiErr(res, 400, 'invalid_query', 'Invalid query parameters', parse.error.flatten())
  }
  const { q, type, limit } = parse.data
  const db = getDb(req)

  type Result = {
    tipo:   'Empresa' | 'Persona' | 'Proveedor' | 'Contrato'
    id:     string
    nombre: string
    score:  number
    meta?:  Record<string, unknown>
  }

  try {
    const results: Result[] = []
    const like = `%${q}%`
    const exact = q.toUpperCase()

    // ── Empresas IGJ ─────────────────────────────────────────────────────────
    if (type === 'empresa' || type === 'all') {
      const rows = await dbAll<{
        cuit:            string
        razon_social:    string
        tipo_societario: string | null
        activa:          boolean
      }>(
        db,
        `SELECT cuit, razon_social, tipo_societario, activa
         FROM igj_entidades
         WHERE razon_social ILIKE ? OR cuit = ?
         ORDER BY
           CASE
             WHEN UPPER(razon_social) = ? THEN 0
             WHEN UPPER(razon_social) LIKE ? THEN 1
             ELSE 2
           END,
           razon_social
         LIMIT ?`,
        like, q, exact, `${exact}%`, limit,
      )
      for (const r of rows) {
        const score = r.razon_social.toUpperCase() === exact ? 3 : r.razon_social.toUpperCase().startsWith(exact) ? 2 : 1
        results.push({
          tipo:   'Empresa',
          id:     r.cuit,
          nombre: r.razon_social,
          score,
          meta:   { cuit: r.cuit, tipo_societario: r.tipo_societario, activa: r.activa },
        })
      }
    }

    // ── Personas IGJ (autoridades) ───────────────────────────────────────────
    // DISTINCT on apellido_nombre + numero_documento to collapse duplicate roles
    // across different empresas.
    if (type === 'persona' || type === 'all') {
      const rows = await dbAll<{
        apellido_nombre:   string
        numero_documento:  string | null
        roles:             bigint
      }>(
        db,
        `SELECT apellido_nombre,
                numero_documento,
                COUNT(*)::BIGINT AS roles
         FROM igj_autoridades
         WHERE apellido_nombre ILIKE ?
         GROUP BY apellido_nombre, numero_documento
         ORDER BY
           CASE
             WHEN UPPER(apellido_nombre) = ? THEN 0
             WHEN UPPER(apellido_nombre) LIKE ? THEN 1
             ELSE 2
           END,
           roles DESC
         LIMIT ?`,
        like, exact, `${exact}%`, limit,
      )
      for (const r of rows) {
        const id = r.numero_documento ? `doc:${r.numero_documento}` : `per:${slugPersona(r.apellido_nombre)}`
        const score = r.apellido_nombre.toUpperCase() === exact ? 3 : r.apellido_nombre.toUpperCase().startsWith(exact) ? 2 : 1
        results.push({
          tipo:   'Persona',
          id,
          nombre: r.apellido_nombre,
          score,
          meta:   { numero_documento: r.numero_documento, roles: Number(r.roles) },
        })
      }
    }

    // ── Proveedores (agregado de contratos) ──────────────────────────────────
    if (type === 'proveedor' || type === 'all') {
      const rows = await dbAll<{
        proveedor_norm: string
        contratos:      bigint
        total_monto:    number | null
      }>(
        db,
        `SELECT proveedor_norm,
                COUNT(*)::BIGINT AS contratos,
                SUM(monto)       AS total_monto
         FROM contratos
         WHERE proveedor_norm ILIKE ?
         GROUP BY proveedor_norm
         ORDER BY
           CASE
             WHEN UPPER(proveedor_norm) = ? THEN 0
             WHEN UPPER(proveedor_norm) LIKE ? THEN 1
             ELSE 2
           END,
           total_monto DESC NULLS LAST
         LIMIT ?`,
        like, exact, `${exact}%`, limit,
      )
      for (const r of rows) {
        const score = r.proveedor_norm.toUpperCase() === exact ? 3 : r.proveedor_norm.toUpperCase().startsWith(exact) ? 2 : 1
        results.push({
          tipo:   'Proveedor',
          id:     `prov:${r.proveedor_norm}`,
          nombre: r.proveedor_norm,
          score,
          meta:   { contratos: Number(r.contratos), total_monto: r.total_monto ?? 0 },
        })
      }
    }

    // ── Contratos individuales ───────────────────────────────────────────────
    if (type === 'contrato' || type === 'all') {
      const rows = await dbAll<{
        hash:        string
        proveedor:   string
        descripcion: string | null
        monto:       number
        anio:        number
      }>(
        db,
        `SELECT hash, proveedor, descripcion, monto, anio
         FROM contratos
         WHERE proveedor ILIKE ? OR descripcion ILIKE ?
         ORDER BY monto DESC NULLS LAST
         LIMIT ?`,
        like, like, limit,
      )
      for (const r of rows) {
        const descSnippet = r.descripcion ? ` — ${r.descripcion.slice(0, 80)}` : ''
        results.push({
          tipo:   'Contrato',
          id:     r.hash,
          nombre: `${r.proveedor}${descSnippet}`,
          score:  1,
          meta:   { anio: r.anio, monto: r.monto },
        })
      }
    }

    // Global ordering: higher score first, then alpha
    results.sort((a, b) => b.score - a.score || a.nombre.localeCompare(b.nombre))

    return res.json({ results, total: results.length })
  } catch (err) {
    console.error('[entidades/search]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── GET /api/entidad/:id ─────────────────────────────────────────────────────
// Resolves an id across:
//   · Empresa (CUIT from igj_entidades)
//   · Persona (`doc:<numero_documento>` or `per:<slug>` from igj_autoridades)
//   · Proveedor (`prov:<proveedor_norm>` aggregated from contratos)
//   · Contrato (hash from contratos)

router.get('/:id', async (req: Request, res: Response) => {
  const parse = EntidadParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const { id } = parse.data
  const db = getDb(req)

  try {
    // 1. Persona by `doc:` prefix
    if (id.startsWith('doc:')) {
      const documento = id.slice(4)
      const rows = await dbAll<{
        apellido_nombre:   string
        numero_correlativo: number
        tipo_administrador: string | null
        razon_social:      string | null
        cuit:              string | null
      }>(
        db,
        `SELECT a.apellido_nombre,
                a.numero_correlativo,
                a.tipo_administrador,
                e.razon_social,
                e.cuit
         FROM igj_autoridades a
         LEFT JOIN igj_entidades e USING (numero_correlativo)
         WHERE a.numero_documento = ?
         LIMIT 200`,
        documento,
      )
      if (rows.length > 0) {
        const nombres = Array.from(new Set(rows.map(r => r.apellido_nombre)))
        return res.json({
          tipo:     'Persona',
          id,
          nombre:   nombres[0],
          aliases:  nombres.slice(1),
          documento,
          empresas: rows
            .filter(r => r.cuit)
            .map(r => ({
              cuit:               r.cuit!,
              razon_social:       r.razon_social,
              tipo_administrador: r.tipo_administrador,
            })),
        })
      }
      return apiErr(res, 404, 'not_found', 'Resource not found')
    }

    // 2. Persona by `per:` slug prefix (when documento missing)
    if (id.startsWith('per:')) {
      const slug = id.slice(4)
      const rows = await dbAll<{
        apellido_nombre:   string
        numero_correlativo: number
        tipo_administrador: string | null
        razon_social:      string | null
        cuit:              string | null
      }>(
        db,
        `SELECT a.apellido_nombre,
                a.numero_correlativo,
                a.tipo_administrador,
                e.razon_social,
                e.cuit
         FROM igj_autoridades a
         LEFT JOIN igj_entidades e USING (numero_correlativo)
         WHERE REGEXP_REPLACE(UPPER(a.apellido_nombre), '[^A-Z0-9]+', '-', 'g') = ?
           AND a.numero_documento IS NULL
         LIMIT 200`,
        slug,
      )
      if (rows.length > 0) {
        return res.json({
          tipo:     'Persona',
          id,
          nombre:   rows[0].apellido_nombre,
          documento: null,
          empresas: rows
            .filter(r => r.cuit)
            .map(r => ({
              cuit:               r.cuit!,
              razon_social:       r.razon_social,
              tipo_administrador: r.tipo_administrador,
            })),
        })
      }
      return apiErr(res, 404, 'not_found', 'Resource not found')
    }

    // 3. Proveedor by `prov:` prefix
    if (id.startsWith('prov:')) {
      const proveedor = id.slice(5)
      const agg = await dbAll<{
        contratos:   bigint
        total_monto: number | null
        anio_min:    number | null
        anio_max:    number | null
      }>(
        db,
        `SELECT COUNT(*)::BIGINT AS contratos,
                SUM(monto)       AS total_monto,
                MIN(anio)        AS anio_min,
                MAX(anio)        AS anio_max
         FROM contratos
         WHERE proveedor_norm = ?`,
        proveedor,
      )
      if (Number(agg[0]?.contratos ?? 0n) === 0) {
        return res.status(404).json({ error: 'not_found' })
      }
      const areas = await dbAll<{ area: string; total: number }>(
        db,
        `SELECT area, SUM(monto) AS total
         FROM contratos
         WHERE proveedor_norm = ?
         GROUP BY area
         ORDER BY total DESC NULLS LAST
         LIMIT 10`,
        proveedor,
      )
      return res.json({
        tipo:         'Proveedor',
        id,
        nombre:       proveedor,
        contratos:    Number(agg[0].contratos),
        total_monto:  agg[0].total_monto ?? 0,
        anio_min:     agg[0].anio_min,
        anio_max:     agg[0].anio_max,
        areas,
      })
    }

    // 4. Contrato by hash (16 hex chars)
    if (/^[a-f0-9]{16}$/i.test(id)) {
      const rows = await dbAll<{
        hash:          string
        municipio:     string
        anio:          number
        tipo:          string
        proveedor:     string
        area:          string | null
        descripcion:   string | null
        monto:         number
        fuente_url:    string
      }>(
        db,
        `SELECT hash, municipio, anio, tipo, proveedor, area, descripcion, monto, fuente_url
         FROM contratos
         WHERE hash = ?
         LIMIT 1`,
        id,
      )
      if (rows.length > 0) {
        const c = rows[0]
        return res.json({
          tipo:              'Contrato',
          id:                c.hash,
          hash:              c.hash,
          municipio:         c.municipio,
          anio:              c.anio,
          tipo_contratacion: c.tipo,
          proveedor:         c.proveedor,
          area:              c.area,
          descripcion:       c.descripcion,
          monto:             c.monto,
          fuente_url:        c.fuente_url,
        })
      }
    }

    // 5. Empresa by CUIT (11 digits)
    if (/^\d{11}$/.test(id)) {
      const rows = await dbAll<{
        cuit:            string
        razon_social:    string
        tipo_societario: string | null
        activa:          boolean
      }>(
        db,
        `SELECT cuit, razon_social, tipo_societario, activa
         FROM igj_entidades
         WHERE cuit = ?
         LIMIT 1`,
        id,
      )
      if (rows.length > 0) {
        const e = rows[0]
        const autoridades = await dbAll<{
          apellido_nombre:    string
          tipo_administrador: string | null
          numero_documento:   string | null
        }>(
          db,
          `SELECT a.apellido_nombre, a.tipo_administrador, a.numero_documento
           FROM igj_autoridades a
           JOIN igj_entidades   e USING (numero_correlativo)
           WHERE e.cuit = ?
           LIMIT 200`,
          id,
        )
        return res.json({
          tipo:            'Empresa',
          id:              e.cuit,
          nombre:          e.razon_social,
          cuit:            e.cuit,
          tipo_societario: e.tipo_societario,
          activa:          e.activa,
          autoridades,
        })
      }
    }

    return apiErr(res, 404, 'not_found', 'Resource not found')
  } catch (err) {
    console.error('[entidades/:id]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── GET /api/entidad/:id/señales ─────────────────────────────────────────────

router.get('/:id/senales', async (req: Request, res: Response) => {
  const idParse    = EntidadParams.safeParse(req.params)
  const queryParse = SeñalesQuery.safeParse(req.query)

  if (!idParse.success)    return res.status(400).json({ error: 'invalid_id' })
  if (!queryParse.success) return res.status(400).json({ error: queryParse.error.flatten() })

  const { desde, hasta, municipio } = queryParse.data
  const db = getDb(req)

  try {
    const ctx      = createGraphContext(db as unknown as Parameters<typeof createGraphContext>[0], municipio, desde, hasta)
    const hallazgos = await runEngine(ctx, { detectors: ALL_DETECTORS })

    return res.json({ hallazgos, total: hallazgos.length })
  } catch (err) {
    console.error('[entidades/:id/senales]', err)
    return res.status(500).json({ error: 'engine_error' })
  }
})

// ─── GET /api/entidad/:id/relaciones ─────────────────────────────────────────

router.get('/:id/relaciones', async (req: Request, res: Response) => {
  const idParse = EntidadParams.safeParse(req.params)
  if (!idParse.success) return res.status(400).json({ error: 'invalid_id' })

  const { id } = idParse.data
  const db = getDb(req)

  try {
    const ctx = createGraphContext(
      db as unknown as Parameters<typeof createGraphContext>[0],
      'cordoba-capital',
      2019, 2023,
    )
    const red = await ctx.redDeEmpresas(id)
    return res.json(red)
  } catch (err) {
    console.error('[entidades/:id/relaciones]', err)
    return res.status(500).json({ error: 'graph_error' })
  }
})

// ─── GET /api/entidad/:id/timeline ───────────────────────────────────────────
// Accepts `prov:<proveedor_norm>` or a bare proveedor name for back-compat.

router.get('/:id/timeline', async (req: Request, res: Response) => {
  const idParse = EntidadParams.safeParse(req.params)
  if (!idParse.success) return res.status(400).json({ error: 'invalid_id' })

  const { id } = idParse.data
  const proveedor = id.startsWith('prov:') ? id.slice(5) : id
  const db = getDb(req)

  try {
    const contratos = await dbAll<{
      hash:        string
      anio:        number
      monto:       number
      tipo:        string
      descripcion: string | null
      fuente_url:  string
    }>(
      db,
      `SELECT hash, anio, monto, tipo, descripcion, fuente_url
       FROM contratos
       WHERE proveedor_norm = ? OR UPPER(proveedor) = ?
       ORDER BY anio ASC`,
      proveedor, proveedor.toUpperCase(),
    )

    const events = contratos.map(c => ({
      tipo:        'contrato' as const,
      fecha:       c.anio,
      titulo:      `Contrato ${c.tipo}: ${new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(c.monto)}`,
      descripcion: c.descripcion,
      fuente_url:  c.fuente_url,
      id:          c.hash,
    }))

    return res.json({ events, total: events.length })
  } catch (err) {
    console.error('[entidades/:id/timeline]', err)
    return res.status(500).json({ error: 'database_error' })
  }
})

export default router
