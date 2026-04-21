import { Router, Request, Response, IRouter } from 'express'
import { z }                                   from 'zod'
import type { Database }                       from 'duckdb'
import { v4 as uuid }                          from 'uuid'
import { apiErr }                              from '../lib/api-error'

const router: IRouter = Router()

// ─── Types ────────────────────────────────────────────────────────────────────

interface CasoRow {
  id:          string
  titulo:      string
  descripcion: string | null
  owner_email: string | null
  state_json:  string | null
  created_at:  string
  updated_at:  string
  deleted_at:  string | null
}

interface ArchivoRow {
  id:           string
  caso_id:      string
  filename:     string
  mime_type:    string | null
  size_bytes:   number | null
  sha256:       string
  archive_path: string
  ocr_status:   string | null
  uploaded_at:  string
}

interface NotaRow {
  id:         string
  caso_id:    string
  texto:      string
  anclada_a:  string | null
  created_at: string
}

// ─── Schemas ──────────────────────────────────────────────────────────────────

const CreateCaso = z.object({
  titulo:      z.string().min(1).max(200),
  descripcion: z.string().max(5000).optional(),
})

// state_json is opaque to the API — frontend sends an object patch.
// Merge semantics: objects recursively merged; arrays/primitives replaced;
// null at a key deletes the key (JSON Merge Patch, RFC 7396).
const UpdateCaso = z.object({
  titulo:      z.string().min(1).max(200).optional(),
  descripcion: z.string().max(5000).optional(),
  state_json:  z.record(z.unknown()).optional(),
})

const CreateNota = z.object({
  texto:     z.string().min(1).max(10_000),
  anclada_a: z.string().max(200).optional(),
})

const IdParams = z.object({ id: z.string().min(1).max(100) })

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDb(req: Request): Database {
  return (req.app.locals as { db: Database }).db
}

function ownerFromReq(req: Request): string | null {
  const locals = (req as Request & { locals?: { userEmail?: string } }).locals
  return locals?.userEmail ?? null
}

function all<T>(db: Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err: Error | null, rows: unknown[]) => {
      if (err) reject(err)
      else resolve(rows as T[])
    })
  })
}

function run(db: Database, sql: string, ...params: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, ...params, (err: Error | null) => (err ? reject(err) : resolve()))
  })
}

// Deep-merge for state_json (RFC 7396 JSON Merge Patch semantics).
// - Plain objects: recursively merged key-by-key
// - Arrays: replaced (not concat) — e.g. pinnedEntityIds: [...] is authoritative
// - null: deletes the key from the target
// - Other primitives: replaced
function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && (v.constructor === Object || v.constructor === undefined)
}

function deepMerge(
  target: Record<string, unknown>,
  patch:  Record<string, unknown>,
): Record<string, unknown> {
  const out: Record<string, unknown> = { ...target }
  for (const [k, v] of Object.entries(patch)) {
    if (v === null) {
      delete out[k]
    } else if (isPlainObject(v) && isPlainObject(out[k])) {
      out[k] = deepMerge(out[k] as Record<string, unknown>, v)
    } else {
      out[k] = v
    }
  }
  return out
}

// Parse a stored state_json string to an object, returning {} on null/invalid.
function parseState(raw: string | null): Record<string, unknown> {
  if (!raw) return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return isPlainObject(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

// Convert a CasoRow to the API shape — state_json deserialized to object or null.
function serializeCaso(row: CasoRow): Omit<CasoRow, 'state_json'> & { state_json: Record<string, unknown> | null } {
  return { ...row, state_json: row.state_json ? parseState(row.state_json) : null }
}

// ─── POST /api/casos ──────────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const parse = CreateCaso.safeParse(req.body)
  if (!parse.success) return apiErr(res, 400, 'validation_error', 'Invalid request body', parse.error.flatten())

  const db    = getDb(req)
  const id    = uuid()
  const now   = new Date().toISOString()
  const owner = ownerFromReq(req)

  try {
    await run(
      db,
      `INSERT INTO casos (id, titulo, descripcion, owner_email, state_json, created_at, updated_at)
       VALUES (?, ?, ?, ?, NULL, ?, ?)`,
      id, parse.data.titulo, parse.data.descripcion ?? null, owner, now, now,
    )
    return res.status(201).json({
      id,
      titulo:      parse.data.titulo,
      descripcion: parse.data.descripcion ?? null,
      owner_email: owner,
      state_json:  null,
      created_at:  now,
      updated_at:  now,
    })
  } catch (err) {
    console.error('[casos.create]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── GET /api/casos ───────────────────────────────────────────────────────────

router.get('/', async (req: Request, res: Response) => {
  const db    = getDb(req)
  const owner = ownerFromReq(req)

  try {
    const rows = owner
      ? await all<CasoRow>(
          db,
          `SELECT id, titulo, descripcion, owner_email, NULL as state_json, created_at, updated_at, deleted_at
           FROM casos WHERE deleted_at IS NULL AND owner_email = ?
           ORDER BY updated_at DESC`,
          owner,
        )
      : await all<CasoRow>(
          db,
          `SELECT id, titulo, descripcion, owner_email, NULL as state_json, created_at, updated_at, deleted_at
           FROM casos WHERE deleted_at IS NULL
           ORDER BY updated_at DESC`,
        )
    return res.json({ casos: rows, total: rows.length })
  } catch (err) {
    console.error('[casos.list]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── GET /api/casos/:id ───────────────────────────────────────────────────────

router.get('/:id', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const db = getDb(req)
  const { id } = parse.data

  try {
    const rows = await all<CasoRow>(
      db,
      `SELECT id, titulo, descripcion, owner_email, state_json, created_at, updated_at, deleted_at
       FROM casos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      id,
    )
    if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Resource not found')

    const caso = rows[0]
    const archivosRaw = await all<ArchivoRow & { size_bytes: number | bigint | null }>(
      db,
      `SELECT id, caso_id, filename, mime_type, size_bytes, sha256, archive_path, ocr_status, uploaded_at
       FROM caso_archivos WHERE caso_id = ? ORDER BY uploaded_at DESC`,
      id,
    )
    const archivos: ArchivoRow[] = archivosRaw.map((a) => ({
      ...a,
      size_bytes: typeof a.size_bytes === 'bigint' ? Number(a.size_bytes) : a.size_bytes,
    }))
    const notas = await all<NotaRow>(
      db,
      `SELECT id, caso_id, texto, anclada_a, created_at FROM caso_notas
       WHERE caso_id = ? ORDER BY created_at DESC`,
      id,
    )

    return res.json({ caso: serializeCaso(caso), archivos, notas })
  } catch (err) {
    console.error('[casos.get]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── PATCH /api/casos/:id ─────────────────────────────────────────────────────

router.patch('/:id', async (req: Request, res: Response) => {
  const idParse   = IdParams.safeParse(req.params)
  const bodyParse = UpdateCaso.safeParse(req.body)

  if (!idParse.success)   return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')
  if (!bodyParse.success) return apiErr(res, 400, 'validation_error', 'Invalid request body', bodyParse.error.flatten())

  const db  = getDb(req)
  const { id } = idParse.data
  const updates = bodyParse.data
  const now = new Date().toISOString()

  const sets: string[]   = []
  const params: unknown[] = []
  if (updates.titulo      !== undefined) { sets.push('titulo = ?');      params.push(updates.titulo) }
  if (updates.descripcion !== undefined) { sets.push('descripcion = ?'); params.push(updates.descripcion) }

  // state_json: deep-merge patch into existing state
  if (updates.state_json !== undefined) {
    const existingRows = await all<{ state_json: string | null }>(
      db,
      `SELECT state_json FROM casos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      id,
    )
    if (existingRows.length === 0) {
      return apiErr(res, 404, 'not_found', 'Resource not found')
    }
    const current = parseState(existingRows[0].state_json)
    const merged  = deepMerge(current, updates.state_json)
    sets.push('state_json = ?')
    params.push(JSON.stringify(merged))
  }

  if (sets.length === 0) {
    return apiErr(res, 400, 'no_fields', 'No fields to update')
  }

  sets.push('updated_at = ?')
  params.push(now)
  params.push(id)

  try {
    await run(
      db,
      `UPDATE casos SET ${sets.join(', ')} WHERE id = ? AND deleted_at IS NULL`,
      ...params,
    )
    const rows = await all<CasoRow>(
      db,
      `SELECT id, titulo, descripcion, owner_email, state_json, created_at, updated_at, deleted_at
       FROM casos WHERE id = ? LIMIT 1`,
      id,
    )
    if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Resource not found')
    return res.json(serializeCaso(rows[0]))
  } catch (err) {
    console.error('[casos.patch]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── DELETE /api/casos/:id (soft) ─────────────────────────────────────────────

router.delete('/:id', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const db = getDb(req)
  const now = new Date().toISOString()

  try {
    await run(
      db,
      `UPDATE casos SET deleted_at = ?, updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      now, now, parse.data.id,
    )
    return res.status(204).send()
  } catch (err) {
    console.error('[casos.delete]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── POST /api/casos/:id/notas ────────────────────────────────────────────────

router.post('/:id/notas', async (req: Request, res: Response) => {
  const idParse   = IdParams.safeParse(req.params)
  const bodyParse = CreateNota.safeParse(req.body)

  if (!idParse.success)   return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')
  if (!bodyParse.success) return apiErr(res, 400, 'validation_error', 'Invalid request body', bodyParse.error.flatten())

  const db  = getDb(req)
  const id  = uuid()
  const now = new Date().toISOString()

  try {
    // Verify caso exists and is not deleted
    const exists = await all<{ c: number }>(
      db,
      `SELECT 1 as c FROM casos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      idParse.data.id,
    )
    if (exists.length === 0) return apiErr(res, 404, 'caso_not_found', 'Caso not found or deleted')

    await run(
      db,
      `INSERT INTO caso_notas (id, caso_id, texto, anclada_a, created_at)
       VALUES (?, ?, ?, ?, ?)`,
      id, idParse.data.id, bodyParse.data.texto, bodyParse.data.anclada_a ?? null, now,
    )
    return res.status(201).json({
      id,
      caso_id:    idParse.data.id,
      texto:      bodyParse.data.texto,
      anclada_a:  bodyParse.data.anclada_a ?? null,
      created_at: now,
    })
  } catch (err) {
    console.error('[casos.notas.create]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── GET /api/casos/:id/notas ─────────────────────────────────────────────────

router.get('/:id/notas', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const db = getDb(req)
  try {
    const rows = await all<NotaRow>(
      db,
      `SELECT id, caso_id, texto, anclada_a, created_at FROM caso_notas
       WHERE caso_id = ? ORDER BY created_at DESC`,
      parse.data.id,
    )
    return res.json({ notas: rows })
  } catch (err) {
    console.error('[casos.notas.list]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

export default router
