import path         from 'path'
import fs           from 'fs'
import { Database } from 'duckdb'
import 'dotenv/config'

// ─── Migration: casos / caso_archivos / caso_notas ────────────────────────────
// Idempotent. Run standalone: `pnpm --filter @argos/api exec ts-node src/scripts/migrate-casos.ts`

// Canonical DB — co-locates casos with the existing contratos + IGJ tables.
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), '../../backend/data/argos.duckdb')

// Ensure parent dir exists so DuckDB can create the file on first run
const parentDir = path.dirname(DB_PATH)
if (!fs.existsSync(parentDir)) {
  fs.mkdirSync(parentDir, { recursive: true })
}

const STATEMENTS: string[] = [
  `CREATE TABLE IF NOT EXISTS casos (
     id           TEXT PRIMARY KEY,
     titulo       TEXT NOT NULL,
     descripcion  TEXT,
     owner_email  TEXT,
     state_json   TEXT,
     created_at   TIMESTAMP,
     updated_at   TIMESTAMP,
     deleted_at   TIMESTAMP
   )`,

  `CREATE TABLE IF NOT EXISTS caso_archivos (
     id           TEXT PRIMARY KEY,
     caso_id      TEXT NOT NULL,
     filename     TEXT NOT NULL,
     mime_type    TEXT,
     size_bytes   BIGINT,
     sha256       TEXT NOT NULL,
     archive_path TEXT NOT NULL,
     ocr_text     TEXT,
     ocr_status   TEXT,
     ocr_error    TEXT,
     uploaded_at  TIMESTAMP,
     uploaded_by  TEXT
   )`,

  `CREATE TABLE IF NOT EXISTS caso_notas (
     id         TEXT PRIMARY KEY,
     caso_id    TEXT NOT NULL,
     texto      TEXT NOT NULL,
     anclada_a  TEXT,
     created_at TIMESTAMP
   )`,

  `CREATE INDEX IF NOT EXISTS idx_caso_archivos_caso ON caso_archivos(caso_id)`,
  `CREATE INDEX IF NOT EXISTS idx_caso_notas_caso    ON caso_notas(caso_id)`,
  `CREATE INDEX IF NOT EXISTS idx_casos_owner        ON casos(owner_email) WHERE deleted_at IS NULL`,
]

function run(db: Database, sql: string): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, (err: Error | null) => (err ? reject(err) : resolve()))
  })
}

async function openDb(dbPath: string): Promise<Database> {
  return new Promise((resolve, reject) => {
    const db = new Database(dbPath, (err: Error | null) => {
      if (err) reject(err)
      else resolve(db)
    })
  })
}

async function main(): Promise<void> {
  console.log(`[migrate-casos] DB: ${DB_PATH}`)
  const db = await openDb(DB_PATH)

  for (const sql of STATEMENTS) {
    const preview = sql.trim().split('\n')[0].slice(0, 80)
    try {
      await run(db, sql)
      console.log(`  ✓ ${preview}`)
    } catch (err) {
      // DuckDB may not support partial-index WHERE clause on all builds — tolerate and continue
      const msg = (err as Error).message
      const isPartialIndexUnsupported = sql.includes('WHERE') && (msg.includes('partial') || msg.includes('WHERE'))
      if (isPartialIndexUnsupported) {
        // Retry without the partial predicate
        const fallback = sql.replace(/ WHERE .*$/, '')
        try {
          await run(db, fallback)
          console.log(`  ✓ ${preview} (without partial predicate)`)
        } catch (err2) {
          console.error(`  ✗ ${preview}:`, (err2 as Error).message)
          throw err2
        }
      } else {
        console.error(`  ✗ ${preview}:`, msg)
        throw err
      }
    }
  }

  await new Promise<void>((resolve) => db.close(() => resolve()))
  console.log('[migrate-casos] done')
}

main().catch((err) => {
  console.error('[migrate-casos] failed:', err)
  process.exit(1)
})
