import fs from 'fs'
import path from 'path'
import crypto from 'crypto'
import type { SnapshotService, RawPayload } from './connector'

// ─── File-based SnapshotService ───────────────────────────────────────────────
// Stores every fetched payload as an immutable file.
// Path: {baseDir}/{connectorId}/{ISO_timestamp}_{sha256}.{ext}
// Guarantees:
//   - Two fetches of identical content produce only ONE file (content-addressed)
//   - Files are never overwritten
//   - sha256 is always verifiable by re-hashing the stored file

export function createSnapshotService(baseDir: string): SnapshotService {
  return {
    async save(
      connectorId: string,
      raw: Buffer | string,
      ext: string,
      sourceUrl: string,
    ): Promise<RawPayload> {
      const buf = typeof raw === 'string' ? Buffer.from(raw, 'utf8') : raw
      const sha256 = crypto.createHash('sha256').update(buf).digest('hex')

      const dir = path.join(baseDir, connectorId)
      fs.mkdirSync(dir, { recursive: true })

      // Content-addressed: if same sha256 already exists anywhere under this connector, skip write
      const existingFiles = fs.readdirSync(dir)
      const existingFile = existingFiles.find((f) => f.includes(sha256))

      let archivePath: string
      if (existingFile) {
        archivePath = path.join(connectorId, existingFile)
      } else {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-')
        const filename = `${timestamp}_${sha256}.${ext}`
        const fullPath = path.join(dir, filename)
        fs.writeFileSync(fullPath, buf)
        archivePath = path.join(connectorId, filename)
      }

      return {
        data: buf,
        content_type: extToMime(ext),
        source_url: sourceUrl,
        fetched_at: new Date(),
        sha256,
        archive_path: archivePath,
      }
    },

    async exists(sha256: string): Promise<boolean> {
      if (!fs.existsSync(baseDir)) return false
      // Walk one level deep (connector dirs)
      for (const connDir of fs.readdirSync(baseDir)) {
        const full = path.join(baseDir, connDir)
        if (!fs.statSync(full).isDirectory()) continue
        const files = fs.readdirSync(full)
        if (files.some((f) => f.includes(sha256))) return true
      }
      return false
    },

    async load(archivePath: string): Promise<Buffer> {
      const full = path.join(baseDir, archivePath)
      if (!fs.existsSync(full)) {
        throw new Error(`Snapshot not found: ${archivePath}`)
      }
      return fs.readFileSync(full)
    },
  }
}

function extToMime(ext: string): string {
  const map: Record<string, string> = {
    json: 'application/json',
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    csv:  'text/csv',
    zip:  'application/zip',
    pdf:  'application/pdf',
    html: 'text/html',
    xml:  'application/xml',
    txt:  'text/plain',
  }
  return map[ext.toLowerCase()] ?? 'application/octet-stream'
}
