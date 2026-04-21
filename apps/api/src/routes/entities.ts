import { Router, Request, Response, IRouter } from 'express'
import { z }                                  from 'zod'
import type { Database }                      from 'duckdb'
import type { Hallazgo }                      from '@argos/model'

import { createGraphContext }        from '../engine/graph-context'
import { ALL_DETECTORS, runEngine }  from '@argos/engine'
import { apiErr }                    from '../lib/api-error'

// ─── HANDOFF-shaped public entities API ──────────────────────────────────────
// The frontend contract lives in apps/design-handoff/argos-design-system/project/HANDOFF.md.
// Always top-level-keyed JSON (`{ entities: [...] }`, not bare arrays).
// Error shape: { error: { code, message, details? } } — HTTP status is source of truth.
// Entity id conventions match /api/entidad (CUIT, `doc:<documento>`, `per:<slug>`, `prov:<norm>`, 16-hex hash).

const router: IRouter = Router()

type EntityType = 'Empresa' | 'Persona' | 'Proveedor' | 'Contrato'

// ─── Validation ──────────────────────────────────────────────────────────────

const SearchQuery = z.object({
  q:     z.string().min(1).max(200),
  types: z.string().optional(), // comma-separated: "Empresa,Persona"
  limit: z.coerce.number().int().min(1).max(100).default(20),
})

const IdParams = z.object({
  id: z.string().min(1).max(200),
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

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

function parseTypes(raw: string | undefined): Set<EntityType> | null {
  if (!raw) return null
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean)
  const valid: EntityType[] = ['Empresa', 'Persona', 'Proveedor', 'Contrato']
  const out = new Set<EntityType>()
  for (const p of parts) {
    const match = valid.find(v => v.toLowerCase() === p.toLowerCase())
    if (match) out.add(match)
  }
  return out.size > 0 ? out : null
}

function slugPersona(nombre: string): string {
  return nombre.trim().toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

// Map a Hallazgo → HANDOFF Signal shape
function toSignal(h: Hallazgo) {
  const firstEvidence = h.evidencia[0]
  return {
    id:        h.id,
    severity:  h.severidad,
    score:     h.score,
    tipologia: h.tipologia,
    title:     h.titulo,
    subject:   h.entidades_afectadas[0]?.id ?? '',
    desc:      h.resumen,
    evidence:  h.evidencia.map(e => e.descripcion),
    source:    firstEvidence?.fuente_url ?? '',
    norma:     h.legal.articulos.join('; '),
    date:      (h.generado_en instanceof Date ? h.generado_en : new Date(h.generado_en)).toISOString(),
  }
}

// ─── GET /api/entities/search ────────────────────────────────────────────────
// Returns { entities: [{ id, type, label, cuit?, subtitle? }] }
// `types` is an optional comma-separated whitelist; omitted = all.

router.get('/search', async (req: Request, res: Response) => {
  const parse = SearchQuery.safeParse(req.query)
  if (!parse.success) {
    return apiErr(res, 400, 'invalid_query', 'Invalid search query', parse.error.flatten())
  }
  const { q, limit } = parse.data
  const types = parseTypes(parse.data.types)
  const wants = (t: EntityType) => types === null || types.has(t)

  const db = getDb(req)

  type Entity = { id: string; type: EntityType; label: string; cuit?: string; subtitle?: string; score: number }

  try {
    const entities: Entity[] = []
    const like = `%${q}%`
    const exact = q.toUpperCase()

    if (wants('Empresa')) {
      const rows = await dbAll<{
        cuit:            string
        razon_social:    string
        tipo_societario: string | null
      }>(
        db,
        `SELECT cuit, razon_social, tipo_societario
         FROM igj_entidades
         WHERE razon_social ILIKE ? OR cuit = ?
         ORDER BY
           CASE WHEN UPPER(razon_social) = ? THEN 0
                WHEN UPPER(razon_social) LIKE ? THEN 1
                ELSE 2 END,
           razon_social
         LIMIT ?`,
        like, q, exact, `${exact}%`, limit,
      )
      for (const r of rows) {
        const score = r.razon_social.toUpperCase() === exact ? 3 : r.razon_social.toUpperCase().startsWith(exact) ? 2 : 1
        entities.push({
          id:       r.cuit,
          type:     'Empresa',
          label:    r.razon_social,
          cuit:     r.cuit,
          subtitle: r.tipo_societario ?? undefined,
          score,
        })
      }
    }

    if (wants('Persona')) {
      const rows = await dbAll<{
        apellido_nombre:  string
        numero_documento: string | null
        roles:            bigint
      }>(
        db,
        `SELECT apellido_nombre,
                numero_documento,
                COUNT(*)::BIGINT AS roles
         FROM igj_autoridades
         WHERE apellido_nombre ILIKE ?
         GROUP BY apellido_nombre, numero_documento
         ORDER BY
           CASE WHEN UPPER(apellido_nombre) = ? THEN 0
                WHEN UPPER(apellido_nombre) LIKE ? THEN 1
                ELSE 2 END,
           roles DESC
         LIMIT ?`,
        like, exact, `${exact}%`, limit,
      )
      for (const r of rows) {
        const id = r.numero_documento ? `doc:${r.numero_documento}` : `per:${slugPersona(r.apellido_nombre)}`
        const roles = Number(r.roles)
        const score = r.apellido_nombre.toUpperCase() === exact ? 3 : r.apellido_nombre.toUpperCase().startsWith(exact) ? 2 : 1
        entities.push({
          id,
          type:     'Persona',
          label:    r.apellido_nombre,
          subtitle: `${roles} rol${roles === 1 ? '' : 'es'} societario${roles === 1 ? '' : 's'}`,
          score,
        })
      }
    }

    if (wants('Proveedor')) {
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
           CASE WHEN UPPER(proveedor_norm) = ? THEN 0
                WHEN UPPER(proveedor_norm) LIKE ? THEN 1
                ELSE 2 END,
           total_monto DESC NULLS LAST
         LIMIT ?`,
        like, exact, `${exact}%`, limit,
      )
      for (const r of rows) {
        const contratos = Number(r.contratos)
        const monto = r.total_monto ?? 0
        const montoFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(monto)
        const score = r.proveedor_norm.toUpperCase() === exact ? 3 : r.proveedor_norm.toUpperCase().startsWith(exact) ? 2 : 1
        entities.push({
          id:       `prov:${r.proveedor_norm}`,
          type:     'Proveedor',
          label:    r.proveedor_norm,
          subtitle: `${contratos} contrato${contratos === 1 ? '' : 's'} · ${montoFmt}`,
          score,
        })
      }
    }

    if (wants('Contrato')) {
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
        const montoFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(r.monto)
        entities.push({
          id:       r.hash,
          type:     'Contrato',
          label:    `${r.proveedor}${r.descripcion ? ` — ${r.descripcion.slice(0, 80)}` : ''}`,
          subtitle: `${r.anio} · ${montoFmt}`,
          score:    1,
        })
      }
    }

    // Global ranking
    entities.sort((a, b) => b.score - a.score || a.label.localeCompare(b.label))

    // Strip internal `score` from output
    const publicEntities = entities.map(({ score: _score, ...e }) => e)
    return res.json({ entities: publicEntities, total: publicEntities.length })
  } catch (err) {
    console.error('[entities/search]', err)
    return apiErr(res, 500, 'database_error', 'Search failed')
  }
})

// ─── GET /api/entities/:id ───────────────────────────────────────────────────
// Returns { entity, signals, contracts, relations }

router.get('/:id', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Entity id is required')

  const { id } = parse.data
  const db = getDb(req)

  try {
    type Entity = { id: string; type: EntityType; label: string; cuit?: string; subtitle?: string; meta?: Record<string, unknown> }
    type Contract = {
      id:          string
      anio:        number
      monto:       number
      proveedor:   string
      area:        string | null
      descripcion: string | null
      tipo:        string
      fuente_url:  string
    }
    type Edge = { source: string; target: string; kind: string; label?: string }

    let entity:    Entity | null = null
    let contracts: Contract[] = []
    let relations: Edge[] = []
    let hallazgos: Hallazgo[] = []

    // 1. Persona (doc:) ──────────────────────────────────────────────────────
    if (id.startsWith('doc:')) {
      const documento = id.slice(4)
      const rows = await dbAll<{
        apellido_nombre:    string
        tipo_administrador: string | null
        razon_social:       string | null
        cuit:               string | null
      }>(
        db,
        `SELECT a.apellido_nombre, a.tipo_administrador, e.razon_social, e.cuit
         FROM igj_autoridades a
         LEFT JOIN igj_entidades e USING (numero_correlativo)
         WHERE a.numero_documento = ?
         LIMIT 500`,
        documento,
      )
      if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Persona no encontrada')
      entity = {
        id,
        type:     'Persona',
        label:    rows[0].apellido_nombre,
        subtitle: `${rows.length} rol${rows.length === 1 ? '' : 'es'} societario${rows.length === 1 ? '' : 's'}`,
        meta:     { documento },
      }
      relations = rows
        .filter(r => r.cuit)
        .map(r => ({
          source: id,
          target: r.cuit!,
          kind:   'director',
          label:  r.tipo_administrador ?? undefined,
        }))
    }

    // 2. Persona (per:) ──────────────────────────────────────────────────────
    else if (id.startsWith('per:')) {
      const slug = id.slice(4)
      const rows = await dbAll<{
        apellido_nombre:    string
        tipo_administrador: string | null
        razon_social:       string | null
        cuit:               string | null
      }>(
        db,
        `SELECT a.apellido_nombre, a.tipo_administrador, e.razon_social, e.cuit
         FROM igj_autoridades a
         LEFT JOIN igj_entidades e USING (numero_correlativo)
         WHERE REGEXP_REPLACE(UPPER(a.apellido_nombre), '[^A-Z0-9]+', '-', 'g') = ?
           AND a.numero_documento IS NULL
         LIMIT 500`,
        slug,
      )
      if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Persona no encontrada')
      entity = {
        id,
        type:     'Persona',
        label:    rows[0].apellido_nombre,
        subtitle: `${rows.length} rol${rows.length === 1 ? '' : 'es'} societario${rows.length === 1 ? '' : 's'}`,
      }
      relations = rows
        .filter(r => r.cuit)
        .map(r => ({
          source: id,
          target: r.cuit!,
          kind:   'director',
          label:  r.tipo_administrador ?? undefined,
        }))
    }

    // 3. Proveedor (prov:) ───────────────────────────────────────────────────
    else if (id.startsWith('prov:')) {
      const proveedor = id.slice(5)
      const rows = await dbAll<{
        hash:        string
        anio:        number
        monto:       number
        tipo:        string
        area:        string | null
        descripcion: string | null
        fuente_url:  string
      }>(
        db,
        `SELECT hash, anio, monto, tipo, area, descripcion, fuente_url
         FROM contratos
         WHERE proveedor_norm = ?
         ORDER BY anio ASC, monto DESC`,
        proveedor,
      )
      if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Proveedor no encontrado')

      const total = rows.reduce((s, r) => s + (r.monto ?? 0), 0)
      const totalFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(total)
      entity = {
        id,
        type:     'Proveedor',
        label:    proveedor,
        subtitle: `${rows.length} contrato${rows.length === 1 ? '' : 's'} · ${totalFmt}`,
        meta:     { total_monto: total, contratos: rows.length },
      }
      contracts = rows.map(r => ({
        id:          r.hash,
        anio:        r.anio,
        monto:       r.monto,
        proveedor,
        area:        r.area,
        descripcion: r.descripcion,
        tipo:        r.tipo,
        fuente_url:  r.fuente_url,
      }))

      // Filter engine hallazgos where this proveedor is the subject
      const ctx = createGraphContext(
        db as unknown as Parameters<typeof createGraphContext>[0],
        'cordoba-capital', 2019, 2023,
      )
      const all = await runEngine(ctx, { detectors: ALL_DETECTORS })
      const normUpper = proveedor.toUpperCase()
      hallazgos = all.filter(h =>
        h.entidades_afectadas.some(ent => ent.nombre.toUpperCase() === normUpper || ent.id === id),
      )
    }

    // 4. Contrato (16 hex hash) ──────────────────────────────────────────────
    else if (/^[a-f0-9]{16}$/i.test(id)) {
      const rows = await dbAll<{
        hash:        string
        municipio:   string
        anio:        number
        tipo:        string
        proveedor:   string
        area:        string | null
        descripcion: string | null
        monto:       number
        fuente_url:  string
      }>(
        db,
        `SELECT hash, municipio, anio, tipo, proveedor, area, descripcion, monto, fuente_url
         FROM contratos
         WHERE hash = ?
         LIMIT 1`,
        id,
      )
      if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Contrato no encontrado')
      const c = rows[0]
      const montoFmt = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(c.monto)
      entity = {
        id,
        type:     'Contrato',
        label:    `${c.proveedor}${c.descripcion ? ` — ${c.descripcion.slice(0, 80)}` : ''}`,
        subtitle: `${c.anio} · ${montoFmt}`,
        meta:     { area: c.area, tipo_contratacion: c.tipo, fuente_url: c.fuente_url },
      }
      contracts = [{
        id:          c.hash,
        anio:        c.anio,
        monto:       c.monto,
        proveedor:   c.proveedor,
        area:        c.area,
        descripcion: c.descripcion,
        tipo:        c.tipo,
        fuente_url:  c.fuente_url,
      }]
    }

    // 5. Empresa (11-digit CUIT) ─────────────────────────────────────────────
    else if (/^\d{11}$/.test(id)) {
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
      if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Empresa no encontrada')
      const e = rows[0]
      entity = {
        id:       e.cuit,
        type:     'Empresa',
        label:    e.razon_social,
        cuit:     e.cuit,
        subtitle: e.tipo_societario ?? (e.activa ? 'Activa' : 'Inactiva'),
        meta:     { activa: e.activa, tipo_societario: e.tipo_societario },
      }
      const autoridades = await dbAll<{
        apellido_nombre:    string
        tipo_administrador: string | null
        numero_documento:   string | null
      }>(
        db,
        `SELECT a.apellido_nombre, a.tipo_administrador, a.numero_documento
         FROM igj_autoridades a
         JOIN igj_entidades   en USING (numero_correlativo)
         WHERE en.cuit = ?
         LIMIT 500`,
        id,
      )
      relations = autoridades.map(a => ({
        source: a.numero_documento ? `doc:${a.numero_documento}` : `per:${slugPersona(a.apellido_nombre)}`,
        target: e.cuit,
        kind:   'director',
        label:  a.tipo_administrador ?? undefined,
      }))
    }

    if (!entity) {
      return apiErr(res, 404, 'not_found', 'Entity id not recognized')
    }

    return res.json({
      entity,
      signals:   hallazgos.map(toSignal),
      contracts,
      relations,
    })
  } catch (err) {
    console.error('[entities/:id]', err)
    return apiErr(res, 500, 'database_error', 'Failed to load entity')
  }
})

export default router
