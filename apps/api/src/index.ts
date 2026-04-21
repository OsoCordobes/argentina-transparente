import express       from 'express'
import 'dotenv/config'
import path          from 'path'
import { Database }  from 'duckdb'

import entidadesRouter from './routes/entidades'
import entitiesRouter  from './routes/entities'
import aiRouter        from './routes/ai'
import casosRouter     from './routes/casos'
import archivosRouter  from './routes/archivos'
import feedbackRouter  from './routes/feedback'
import dossierRouter   from './routes/dossier'

import { devAuth } from './middleware/auth'

const app  = express()
const PORT = process.env.PORT ?? 3002

// ─── DuckDB ───────────────────────────────────────────────────────────────────
// Canonical DB lives in backend/data/ — holds contratos (Córdoba Capital 2020-2023),
// IGJ entities/authorities (420k + 2.29M rows), plus Phase A casos/archivos/notas.
// DB_PATH env overrides for tests.
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), '../../backend/data/argos.duckdb')
const db = new Database(DB_PATH)
app.locals.db = db

// ─── Middleware ───────────────────────────────────────────────────────────────
// JSON body cap large enough for dossier state + base64 screenshots in feedback.
app.use(express.json({ limit: '5mb' }))

app.use((_req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-User-Email')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, DELETE, OPTIONS')
  next()
})

app.options('*', (_req, res) => res.sendStatus(204))

app.use(devAuth)

// ─── Routes ───────────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.json({ ok: true, version: '3.0.0', ts: new Date().toISOString() })
})

app.use('/api/entidad',  entidadesRouter)  // legacy Spanish, DuckDB-shaped
app.use('/api/entities', entitiesRouter)   // HANDOFF contract, plural English
app.use('/api/ai',       aiRouter)
app.use('/api/casos',    casosRouter)

// archivosRouter defines routes under /casos/:id/archivos AND /archivos/:id,
// so we mount it at /api (not /api/archivos) to cover both prefixes.
app.use('/api',          archivosRouter)

app.use('/api/feedback', feedbackRouter)
app.use('/api/dossier',  dossierRouter)

// ─── 404 handler ─────────────────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'not_found' })
})

// ─── Start ────────────────────────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`[argos-api] v3.0.0 listening on :${PORT}`)
  console.log(`[argos-api] DuckDB: ${DB_PATH}`)
})
