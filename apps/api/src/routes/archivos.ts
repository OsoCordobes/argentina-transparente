import { Router, Request, Response, IRouter } from 'express'
import type { Database }                       from 'duckdb'
import multer                                  from 'multer'
import { v4 as uuid }                          from 'uuid'
import path                                    from 'path'
import fs                                      from 'fs'
import { z }                                   from 'zod'

import { createSnapshotService } from '@argos/ingestion'
import { enqueueOcr }            from '../lib/ocr'
import { apiErr }               from '../lib/api-error'

const router: IRouter = Router()

// ─── Config ───────────────────────────────────────────────────────────────────

const SNAPSHOTS_DIR = process.env.SNAPSHOTS_DIR
  ?? path.join(process.cwd(), '../../data/snapshots')
const USER_UPLOADS_CONNECTOR = 'user-uploads'

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024 // 25 MB — generous enough for scanned PDFs

// Keep files fully in memory before writing — simpler, and we need the buffer for hashing anyway
const upload = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: MAX_UPLOAD_BYTES },
})

// Ensure snapshots dir exists at boot (snapshot.save also does this per-connector, but we want the top-level)
if (!fs.existsSync(SNAPSHOTS_DIR)) {
  fs.mkdirSync(SNAPSHOTS_DIR, { recursive: true })
}

const snapshotService = createSnapshotService(SNAPSHOTS_DIR)

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDb(req: Request): Database {
  return (req.app.locals as { db: Database }).db
}

function ownerFromReq(req: Request): string | null {
  const locals = (req as Request & { locals?: { userEmail?: string } }).locals
  return locals?.userEmail ?? null
}

function run(db: Database, sql: string, ...params: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, ...params, (err: Error | null) => (err ? reject(err) : resolve()))
  })
}

function all<T>(db: Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err: Error | null, rows: unknown[]) => {
      if (err) reject(err)
      else resolve(rows as T[])
    })
  })
}

function extFromFilename(filename: string): string {
  const ext = path.extname(filename).toLowerCase().replace(/^\./, '')
  return ext || 'bin'
}

const IdParams = z.object({ id: z.string().min(1).max(100) })

// ─── POST /api/casos/:id/archivos ─────────────────────────────────────────────
// multipart/form-data with a single `file` field
// Mounted at /api/casos in index.ts, so this route registers at
// '/api/casos/:id/archivos'. We nest it here for locality, and also expose
// the plain /archivos/:id endpoints for download / ocr.

router.post(
  '/casos/:id/archivos',
  upload.single('file'),
  async (req: Request, res: Response) => {
    const parse = IdParams.safeParse(req.params)
    if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')
    if (!req.file)      return apiErr(res, 400, 'file_required', 'No file attached')

    const db    = getDb(req)
    const casoId = parse.data.id

    // Verify caso exists
    const exists = await all<{ c: number }>(
      db,
      `SELECT 1 as c FROM casos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      casoId,
    )
    if (exists.length === 0) return apiErr(res, 404, 'caso_not_found', 'Caso not found or deleted')

    const { originalname, mimetype, size, buffer } = req.file

    try {
      // Snapshot service handles SHA-256 + content-addressed dedupe
      const ext     = extFromFilename(originalname)
      const payload = await snapshotService.save(
        USER_UPLOADS_CONNECTOR,
        buffer,
        ext,
        `user-upload://${casoId}/${originalname}`,
      )

      const id        = uuid()
      const now       = new Date().toISOString()
      const owner     = ownerFromReq(req)
      const ocrStatus = 'pending'

      await run(
        db,
        `INSERT INTO caso_archivos
          (id, caso_id, filename, mime_type, size_bytes, sha256, archive_path, ocr_status, uploaded_at, uploaded_by)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        id, casoId, originalname, mimetype, size, payload.sha256, payload.archive_path,
        ocrStatus, now, owner,
      )

      // Fire-and-forget OCR
      const absolutePath = path.join(SNAPSHOTS_DIR, payload.archive_path)
      enqueueOcr(db, { archivoId: id, absolutePath, mimeType: mimetype })

      return res.status(201).json({
        id,
        caso_id:      casoId,
        filename:     originalname,
        mime_type:    mimetype,
        size_bytes:   size,
        sha256:       payload.sha256,
        archive_path: payload.archive_path,
        ocr_status:   ocrStatus,
        uploaded_at:  now,
      })
    } catch (err) {
      console.error('[archivos.upload]', err)
      return apiErr(res, 500, 'upload_failed', 'File upload failed', String(err))
    }
  },
)

// ─── GET /api/casos/:id/archivos ──────────────────────────────────────────────

// DuckDB returns BIGINT columns as native BigInt, which JSON.stringify rejects.
// Normalize size_bytes to number (safe — file sizes never exceed Number.MAX_SAFE_INTEGER in practice).
function normalizeArchivoRow(row: Record<string, unknown>): Record<string, unknown> {
  const size = row.size_bytes
  if (typeof size === 'bigint') {
    return { ...row, size_bytes: Number(size) }
  }
  return row
}

router.get('/casos/:id/archivos', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const db = getDb(req)
  try {
    const rows = await all<Record<string, unknown>>(
      db,
      `SELECT id, caso_id, filename, mime_type, size_bytes, sha256, archive_path, ocr_status, uploaded_at
       FROM caso_archivos WHERE caso_id = ? ORDER BY uploaded_at DESC`,
      parse.data.id,
    )
    return res.json({ archivos: rows.map(normalizeArchivoRow) })
  } catch (err) {
    console.error('[archivos.list]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

// ─── GET /api/archivos/:id ────────────────────────────────────────────────────
// Binary download

router.get('/archivos/:id', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const db = getDb(req)
  try {
    const rows = await all<{ filename: string; mime_type: string | null; archive_path: string }>(
      db,
      `SELECT filename, mime_type, archive_path FROM caso_archivos WHERE id = ? LIMIT 1`,
      parse.data.id,
    )
    if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Resource not found')

    const buf = await snapshotService.load(rows[0].archive_path)
    if (rows[0].mime_type) res.setHeader('Content-Type', rows[0].mime_type)
    res.setHeader('Content-Disposition', `attachment; filename="${rows[0].filename.replace(/"/g, '')}"`)
    return res.send(buf)
  } catch (err) {
    console.error('[archivos.download]', err)
    return apiErr(res, 500, 'download_failed', 'File download failed')
  }
})

// ─── GET /api/archivos/:id/ocr ────────────────────────────────────────────────
// Supports ETag / If-None-Match for cheap polling.
// ETag is derived from ocr_status — flips exactly once (pending → done|failed).
// Frontend polls every 4s; on 304 it skips JSON parse and DOM update entirely.

router.get('/archivos/:id/ocr', async (req: Request, res: Response) => {
  const parse = IdParams.safeParse(req.params)
  if (!parse.success) return apiErr(res, 400, 'invalid_id', 'Invalid id parameter')

  const db = getDb(req)
  try {
    const rows = await all<{
      ocr_status: string | null
      ocr_text:   string | null
      ocr_error:  string | null
      sha256:     string
    }>(
      db,
      `SELECT ocr_status, ocr_text, ocr_error, sha256 FROM caso_archivos WHERE id = ? LIMIT 1`,
      parse.data.id,
    )
    if (rows.length === 0) return apiErr(res, 404, 'not_found', 'Resource not found')

    const { ocr_status, ocr_text, ocr_error, sha256 } = rows[0]
    const status = ocr_status ?? 'pending'

    // ETag is stable for the lifetime of each status value.
    // Include sha256 so ETags are unique across different files at the same status.
    const etag = `"${sha256.slice(0, 12)}-${status}"`
    res.setHeader('ETag', etag)
    res.setHeader('Cache-Control', 'no-cache') // must revalidate each time

    if (req.headers['if-none-match'] === etag) {
      return res.status(304).end()
    }

    return res.json({ status, text: ocr_text, error: ocr_error })
  } catch (err) {
    console.error('[archivos.ocr]', err)
    return apiErr(res, 500, 'database_error', 'Database operation failed')
  }
})

export default router
