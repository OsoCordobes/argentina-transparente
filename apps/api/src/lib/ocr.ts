import Anthropic          from '@anthropic-ai/sdk'
import type { Database }  from 'duckdb'
import fs                 from 'fs'
import path               from 'path'

// ─── OCR via Claude Vision ─────────────────────────────────────────────────────
// Extracts text from uploaded PDFs and images using Claude's document/image
// content blocks. Async "queue" is setImmediate for MVP — good enough for
// manual periodist workflow. Migrate to BullMQ when concurrent traffic matters.

const client = new Anthropic()

const OCR_MODEL = process.env.OCR_MODEL ?? 'claude-haiku-4-5-20251001'
const MAX_OUTPUT_TOKENS = 8192

const OCR_PROMPT = `Extraé todo el texto legible de este documento. Devolvé sólo el texto, sin comentarios ni resúmenes. Si hay tablas, convertilas a texto tabulado. Si hay sellos, firmas o elementos no textuales relevantes, describlos entre corchetes (ej: [SELLO: Municipalidad de Córdoba]). Si el documento es ilegible o está vacío, devolvé exactamente: [ILEGIBLE].`

function isImage(mime: string | null): boolean {
  if (!mime) return false
  return mime.startsWith('image/')
}

function isPdf(mime: string | null): boolean {
  return mime === 'application/pdf'
}

function imageMediaType(mime: string): 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp' {
  const normalized = mime.toLowerCase()
  if (normalized === 'image/jpg' || normalized === 'image/jpeg') return 'image/jpeg'
  if (normalized === 'image/png')  return 'image/png'
  if (normalized === 'image/gif')  return 'image/gif'
  if (normalized === 'image/webp') return 'image/webp'
  // Fallback — Claude will reject unsupported types
  return 'image/jpeg'
}

export async function extractText(
  filePath: string,
  mimeType: string | null,
): Promise<string> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`file_not_found: ${filePath}`)
  }

  const buf = fs.readFileSync(filePath)
  const b64 = buf.toString('base64')

  let contentBlock: Anthropic.ContentBlockParam
  if (isPdf(mimeType)) {
    contentBlock = {
      type:   'document',
      source: { type: 'base64', media_type: 'application/pdf', data: b64 },
    }
  } else if (isImage(mimeType)) {
    contentBlock = {
      type:   'image',
      source: { type: 'base64', media_type: imageMediaType(mimeType!), data: b64 },
    }
  } else {
    // Plain text / unknown — treat as already-extracted text
    if (buf.length > 1_000_000) {
      throw new Error(`unsupported_mime_or_file_too_large: ${mimeType ?? 'unknown'}`)
    }
    return buf.toString('utf8')
  }

  const response = await client.messages.create({
    model:      OCR_MODEL,
    max_tokens: MAX_OUTPUT_TOKENS,
    messages: [
      {
        role:    'user',
        content: [contentBlock, { type: 'text', text: OCR_PROMPT }],
      },
    ],
  })

  const text = response.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n')
    .trim()

  return text || '[ILEGIBLE]'
}

// ─── Async enqueue ────────────────────────────────────────────────────────────
// Updates `caso_archivos.ocr_status` from 'pending' → 'done' | 'failed'.
// Uses setImmediate so the HTTP handler returns immediately.

function run(db: Database, sql: string, ...params: unknown[]): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, ...params, (err: Error | null) => (err ? reject(err) : resolve()))
  })
}

export interface OcrJob {
  archivoId:   string
  absolutePath: string
  mimeType:    string | null
}

/**
 * Fire-and-forget OCR job. Resolves as soon as the job is enqueued, NOT when OCR completes.
 * The background task updates the DB row when done.
 */
export function enqueueOcr(db: Database, job: OcrJob): void {
  setImmediate(async () => {
    try {
      const text = await extractText(job.absolutePath, job.mimeType)
      await run(
        db,
        `UPDATE caso_archivos SET ocr_text = ?, ocr_status = 'done', ocr_error = NULL WHERE id = ?`,
        text, job.archivoId,
      )
      console.log(`[ocr] done: ${job.archivoId} (${text.length} chars)`)
    } catch (err) {
      const msg = (err as Error).message
      console.error(`[ocr] failed: ${job.archivoId}`, msg)
      try {
        await run(
          db,
          `UPDATE caso_archivos SET ocr_status = 'failed', ocr_error = ? WHERE id = ?`,
          msg.slice(0, 1000), job.archivoId,
        )
      } catch (dbErr) {
        console.error(`[ocr] could not update failure state for ${job.archivoId}:`, dbErr)
      }
    }
  })
}

// Convenience helper for testing/CLI — resolves to text without DB writes
export async function extractTextFromAbsolutePath(absolutePath: string): Promise<string> {
  const ext = path.extname(absolutePath).toLowerCase().replace(/^\./, '')
  const mime =
    ext === 'pdf' ? 'application/pdf'
    : ext === 'jpg' || ext === 'jpeg' ? 'image/jpeg'
    : ext === 'png'  ? 'image/png'
    : ext === 'gif'  ? 'image/gif'
    : ext === 'webp' ? 'image/webp'
    : null
  return extractText(absolutePath, mime)
}
