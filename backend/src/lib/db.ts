import DuckDB from 'duckdb'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import type { Expediente } from '../types/index'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'argos.duckdb')

let _conn: DuckDB.Connection | null = null

function getConn(): DuckDB.Connection {
  if (!_conn) throw new Error('Base de datos no inicializada — llamar initDb() primero')
  return _conn
}

// duckdb uses variadic params + trailing callback; TypeScript doesn't model this perfectly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null) => { if (err) reject(err); else resolve() }
    ;(getConn() as any).run(sql, ...params, cb)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, rows: T[]) => { if (err) reject(err); else resolve(rows) }
    ;(getConn() as any).all(sql, ...params, cb)
  })
}

export async function initDb(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  const db = new DuckDB.Database(DB_PATH)
  _conn = db.connect()

  await dbRun(`
    CREATE TABLE IF NOT EXISTS empresas (
      cuit              TEXT PRIMARY KEY,
      nombre            TEXT NOT NULL,
      es_empleador      BOOLEAN,
      inicio_actividades TEXT,
      estado            TEXT,
      actividad_principal TEXT,
      fuente_url        TEXT,
      actualizado_en    TEXT NOT NULL
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS directores (
      id               TEXT PRIMARY KEY,
      cuit_empresa     TEXT NOT NULL,
      nombre_director  TEXT NOT NULL,
      fuente_url       TEXT,
      actualizado_en   TEXT NOT NULL
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS reportes (
      id              TEXT    PRIMARY KEY,
      municipio       TEXT    NOT NULL,
      anio_desde      INTEGER NOT NULL,
      anio_hasta      INTEGER NOT NULL,
      generado_en     TEXT    NOT NULL,
      resumen_ejecutivo TEXT,
      total_contratos INTEGER NOT NULL DEFAULT 0,
      total_señales   INTEGER NOT NULL DEFAULT 0,
      expediente_json TEXT    NOT NULL
    )
  `)
}

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface HistorialEntry {
  id: string
  municipio: string
  anio_desde: number
  anio_hasta: number
  generado_en: string
  resumen_ejecutivo: string | null
  total_contratos: number
  total_señales: number
}

export interface ReporteCompleto {
  id: string
  municipio: string
  anio_desde: number
  anio_hasta: number
  generado_en: string
  expediente: Expediente
}

// ─── Operaciones ──────────────────────────────────────────────────────────────

export async function upsertEmpresa(data: {
  cuit: string
  nombre: string
  esEmpleador: boolean
  inicioActividades: string | null
  estado: string | null
  actividadPrincipal: string | null
  fuenteUrl: string
}): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO empresas VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [data.cuit, data.nombre, data.esEmpleador, data.inicioActividades,
     data.estado, data.actividadPrincipal, data.fuenteUrl, new Date().toISOString()]
  )
}

export async function upsertDirectores(cuitEmpresa: string, directores: string[], fuenteUrl: string): Promise<void> {
  for (const nombre of directores) {
    const id = `${cuitEmpresa}_${nombre.trim().toUpperCase()}`
    await dbRun(
      `INSERT OR REPLACE INTO directores VALUES (?, ?, ?, ?, ?)`,
      [id, cuitEmpresa, nombre.trim(), fuenteUrl, new Date().toISOString()]
    )
  }
}

export async function getDirectoresPorEmpresa(cuit: string): Promise<string[]> {
  const rows = await dbAll<{ nombre_director: string }>(
    `SELECT nombre_director FROM directores WHERE cuit_empresa = ?`, [cuit]
  )
  return rows.map(r => r.nombre_director)
}

export async function insertReporte(
  expediente: Expediente,
  municipio: string,
  anioDesde: number,
  anioHasta: number
): Promise<string> {
  const id = crypto.randomUUID()
  await dbRun(
    `INSERT INTO reportes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      municipio,
      anioDesde,
      anioHasta,
      new Date().toISOString(),
      expediente.resumenEjecutivo ?? null,
      expediente.datosBase.totalContratos,
      expediente.señales.length,
      JSON.stringify(expediente),
    ]
  )
  return id
}

export async function getHistorial(limit = 20): Promise<HistorialEntry[]> {
  return dbAll<HistorialEntry>(
    `SELECT id, municipio, anio_desde, anio_hasta, generado_en,
            resumen_ejecutivo, total_contratos, total_señales
     FROM reportes
     ORDER BY generado_en DESC
     LIMIT ?`,
    [limit]
  )
}

export async function getReporte(id: string): Promise<ReporteCompleto | null> {
  const rows = await dbAll<{ id: string; municipio: string; anio_desde: number; anio_hasta: number; generado_en: string; expediente_json: string }>(
    `SELECT id, municipio, anio_desde, anio_hasta, generado_en, expediente_json
     FROM reportes WHERE id = ?`,
    [id]
  )
  if (!rows[0]) return null
  const r = rows[0]
  return {
    id: r.id,
    municipio: r.municipio,
    anio_desde: r.anio_desde,
    anio_hasta: r.anio_hasta,
    generado_en: r.generado_en,
    expediente: JSON.parse(r.expediente_json) as Expediente,
  }
}
