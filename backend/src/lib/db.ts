import DuckDB from 'duckdb'
import crypto from 'crypto'
import path from 'path'
import fs from 'fs'
import type { Contrato, Señal, Expediente, FuenteMetadata, OSMatch } from '../types/index'

const DATA_DIR = path.join(process.cwd(), 'data')
const DB_PATH = path.join(DATA_DIR, 'argos.duckdb')

let _conn: DuckDB.Connection | null = null

function getConn(): DuckDB.Connection {
  if (!_conn) throw new Error('Base de datos no inicializada — llamar initDb() primero')
  return _conn
}

// duckdb uses variadic params + trailing callback; TypeScript doesn't model this perfectly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null) => { if (err) reject(err); else resolve() }
    ;(getConn() as any).run(sql, ...params, cb)
  })
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, rows: T[]) => { if (err) reject(err); else resolve(rows) }
    ;(getConn() as any).all(sql, ...params, cb)
  })
}

export async function initDb(): Promise<void> {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })

  const db = new DuckDB.Database(DB_PATH)
  _conn = db.connect()

  // ─── Permanent contratos table (loaded via seed scripts) ───────────────────
  await dbRun(`
    CREATE TABLE IF NOT EXISTS contratos (
      hash              TEXT PRIMARY KEY,
      municipio         TEXT NOT NULL,
      anio              INTEGER NOT NULL,
      tipo              TEXT NOT NULL,
      proveedor         TEXT NOT NULL,
      proveedor_norm    TEXT NOT NULL,
      area              TEXT NOT NULL,
      descripcion       TEXT,
      monto             DOUBLE NOT NULL,
      fuente_url        TEXT NOT NULL,
      cargado_en        TEXT NOT NULL
    )
  `)

  // ─── Pre-computed signals cache ────────────────────────────────────────────
  await dbRun(`
    CREATE TABLE IF NOT EXISTS señales_cache (
      id                TEXT PRIMARY KEY,
      municipio         TEXT,
      tipologia         TEXT NOT NULL,
      titulo            TEXT NOT NULL,
      resumen           TEXT NOT NULL,
      score             INTEGER NOT NULL,
      severidad         TEXT NOT NULL,
      evidencia_json    TEXT NOT NULL,
      legal_json        TEXT NOT NULL,
      entidades_cuit    TEXT,
      computado_en      TEXT NOT NULL
    )
  `)

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
    CREATE TABLE IF NOT EXISTS igj_entidades (
      numero_correlativo INTEGER,
      cuit               TEXT,
      razon_social       TEXT,
      tipo_societario    TEXT,
      activa             BOOLEAN
    )
  `)

  await dbRun(`
    CREATE TABLE IF NOT EXISTS igj_autoridades (
      numero_correlativo INTEGER,
      apellido_nombre    TEXT,
      tipo_administrador TEXT,
      numero_documento   TEXT
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

  // ─── Fuentes de datos — Sprint 4 (Data Foundation) ────────────────────────
  // Cumple CLAUDE.md sección 4: toda fuente registrada con origen, fecha,
  // método, formato y nivel de confianza.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS fuentes_datos (
      id                TEXT PRIMARY KEY,
      jurisdiccion      TEXT NOT NULL,
      tipo              TEXT NOT NULL,    -- ConnectorTipo
      url               TEXT NOT NULL,
      formato           TEXT NOT NULL,
      oficial           BOOLEAN NOT NULL,
      licencia          TEXT,
      frecuencia        TEXT,
      nivel_confianza   TEXT NOT NULL,    -- 'alto'|'medio'|'bajo'
      notas             TEXT,
      registrado_en     TEXT NOT NULL,
      ultimo_crawl      TEXT
    )
  `)

  // ─── Cache OpenSanctions / ICIJ (post-MVP) ────────────────────────────────
  // Resultado cacheado de querys a opensanctions.org keyed por CUIT. Evita
  // 1 round-trip API por análisis. TTL típico 30 días — refrescar via
  // npm run seed:opensanctions.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS opensanctions_matches (
      cuit                TEXT PRIMARY KEY,
      nombre              TEXT NOT NULL,
      matched             BOOLEAN NOT NULL,
      riesgo              TEXT,            -- 'sancionado'|'pep'|'offshore'|'crimen'|null
      dataset_principal   TEXT,
      entidad_id          TEXT,
      entidad_caption     TEXT,
      entidad_url         TEXT,
      consultado_en       TEXT NOT NULL
    )
  `)

  // ─── Bulk ICIJ Offshore Leaks Database ─────────────────────────────────────
  // Cargado via: npm run seed:icij -- /ruta/a/csvs/
  // Descarga: https://offshoreleaks.icij.org/pages/database
  // Incluye: Panama Papers, Pandora Papers, Paradise Papers, Bahamas Leaks, Offshore Leaks.
  // Permite detección offline sin rate limit, mucho más rápido que API on-demand.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS icij_entidades (
      node_id         TEXT PRIMARY KEY,
      nombre          TEXT NOT NULL,
      nombre_norm     TEXT NOT NULL,
      tipo            TEXT NOT NULL,     -- 'entity'|'officer'|'intermediary'
      jurisdiccion    TEXT,
      countries       TEXT,
      country_codes   TEXT,
      estado          TEXT,
      fuente          TEXT NOT NULL,     -- 'Panama Papers'|'Pandora Papers'|etc.
      incorporacion   TEXT,
      cargado_en      TEXT NOT NULL
    )
  `)

  await dbRun(`
    CREATE INDEX IF NOT EXISTS idx_icij_nombre_norm
    ON icij_entidades(nombre_norm)
  `)

  // ─── Scraper health monitoring ─────────────────────────────────────────────
  // Registra cada ejecución de un scraper: cuándo corrió, cuántos contratos
  // extrajo, si falló y por qué. Alimenta el endpoint /api/scrapers/health
  // y permite detectar scrapers rotos (portal cambió estructura HTML).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS scrapers_health (
      id               TEXT NOT NULL,
      ejecutado_en     TEXT NOT NULL,
      ok               BOOLEAN NOT NULL,
      contratos_count  INTEGER,
      duracion_ms      INTEGER,
      error_msg        TEXT,
      url_chequeada    TEXT,
      PRIMARY KEY (id, ejecutado_en)
    )
  `)

  // ─── Alertas automáticas (detector de eventos) ─────────────────────────────
  // Sistema de monitoreo continuo: detecta scrapers rotos, fuentes desactualizadas,
  // y datos nuevos disponibles. Generadas por scripts/check-alertas.ts (cron),
  // expuestas via GET /api/alertas, mostradas como badge en AppShell.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS alertas (
      id              TEXT PRIMARY KEY,
      tipo            TEXT NOT NULL,    -- 'scraper_roto'|'fuente_desactualizada'|'datos_nuevos'
      severidad       TEXT NOT NULL,    -- 'info'|'warning'|'critical'
      titulo          TEXT NOT NULL,
      detalle         TEXT,
      fuente_id       TEXT,             -- referencia opcional a fuentes_datos.id
      detectado_en    TEXT NOT NULL,
      leida           BOOLEAN NOT NULL DEFAULT false,
      leida_en        TEXT
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

export async function isIGJLoaded(): Promise<boolean> {
  const rows = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM igj_entidades`)
  return (rows[0]?.cnt ?? 0) > 0
}

export async function clearIGJTables(): Promise<void> {
  await dbRun(`DELETE FROM igj_entidades`)
  await dbRun(`DELETE FROM igj_autoridades`)
}

export async function loadIGJFromCSV(entidadesPath: string, autoridadesPath: string): Promise<{ entidades: number; autoridades: number }> {
  // Use DuckDB native CSV reader for performance
  const escapedEnt = entidadesPath.replace(/\\/g, '/')
  const escapedAut = autoridadesPath.replace(/\\/g, '/')

  await dbRun(`
    INSERT INTO igj_entidades
    SELECT
      TRY_CAST(numero_correlativo AS INTEGER),
      REGEXP_REPLACE(CAST(cuit AS VARCHAR), '-', '', 'g'),
      razon_social,
      descripcion_tipo_societario,
      (dada_de_baja IS NULL OR TRIM(dada_de_baja) = '')
    FROM read_csv_auto('${escapedEnt}', header=true, ignore_errors=true)
    WHERE cuit IS NOT NULL AND TRIM(CAST(cuit AS VARCHAR)) != ''
  `)

  await dbRun(`
    INSERT INTO igj_autoridades
    SELECT
      TRY_CAST(numero_correlativo AS INTEGER),
      apellido_nombre,
      tipo_administrador,
      numero_documento
    FROM read_csv_auto('${escapedAut}', header=true, ignore_errors=true)
    WHERE apellido_nombre IS NOT NULL AND TRIM(apellido_nombre) != ''
  `)

  const [{ cnt: cntEnt }] = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM igj_entidades`)
  const [{ cnt: cntAut }] = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM igj_autoridades`)
  return { entidades: cntEnt, autoridades: cntAut }
}

export interface IGJDirectorRow {
  apellido_nombre: string
  tipo_administrador: string
  numero_documento: string
}

export async function getDirectoresPorCuitIGJ(cuit: string): Promise<IGJDirectorRow[]> {
  const normalizedCuit = cuit.replace(/-/g, '')
  return dbAll<IGJDirectorRow>(`
    SELECT a.apellido_nombre, a.tipo_administrador, a.numero_documento
    FROM igj_autoridades a
    JOIN igj_entidades e ON e.numero_correlativo = a.numero_correlativo
    WHERE e.cuit = ?
    ORDER BY a.tipo_administrador, a.apellido_nombre
  `, [normalizedCuit])
}

// ─── Contratos (permanent store) ──────────────────────────────────────────────

export function hashContrato(municipio: string, c: Contrato): string {
  const key = `${municipio}|${c.anio}|${c.tipo}|${c.proveedor}|${c.area}|${c.monto}`
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

function normProveedor(nombre: string): string {
  return nombre.trim().toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    // Strip trailing legal-entity suffixes ("EMPRESA SA" → "EMPRESA")
    .replace(/\s+(S\.?A\.?S?\.?|S\.?R\.?L\.?|S\.?C\.?S?\.?)\s*$/, '')
    .trim()
}

export async function getContratosCount(municipio?: string): Promise<number> {
  const sql = municipio
    ? `SELECT COUNT(*) as cnt FROM contratos WHERE municipio = ?`
    : `SELECT COUNT(*) as cnt FROM contratos`
  const rows = await dbAll<{ cnt: number }>(sql, municipio ? [municipio] : [])
  return rows[0]?.cnt ?? 0
}

export async function clearContratos(municipio?: string): Promise<void> {
  if (municipio) {
    await dbRun(`DELETE FROM contratos WHERE municipio = ?`, [municipio])
  } else {
    await dbRun(`DELETE FROM contratos`)
  }
}

export async function insertContratoBatch(municipio: string, contratos: Contrato[]): Promise<number> {
  let inserted = 0
  const now = new Date().toISOString()
  for (const c of contratos) {
    const hash = hashContrato(municipio, c)
    try {
      await dbRun(
        `INSERT OR IGNORE INTO contratos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [hash, municipio, c.anio, c.tipo, c.proveedor, normProveedor(c.proveedor),
         c.area, c.descripcion ?? '', c.monto, c.fuenteUrl, now]
      )
      inserted++
    } catch {
      // duplicate hash — skip
    }
  }
  return inserted
}

export async function getAllContratos(municipio?: string): Promise<Contrato[]> {
  const sql = municipio
    ? `SELECT * FROM contratos WHERE municipio = ? ORDER BY anio, proveedor`
    : `SELECT * FROM contratos ORDER BY municipio, anio, proveedor`
  const rows = await dbAll<any>(sql, municipio ? [municipio] : [])
  return rows.map(r => ({
    tipo: r.tipo,
    proveedor: r.proveedor,
    area: r.area,
    descripcion: r.descripcion,
    monto: r.monto,
    anio: r.anio,
    fuenteUrl: r.fuente_url,
  }))
}

// ─── Dashboard queries ────────────────────────────────────────────────────────

export interface DashboardMunicipio {
  municipio: string
  total_contratos: number
  monto_total: number
  anio_min: number
  anio_max: number
  total_señales: number
}

export async function getDashboardMunicipios(): Promise<DashboardMunicipio[]> {
  return dbAll<DashboardMunicipio>(`
    SELECT
      c.municipio,
      COUNT(*) as total_contratos,
      COALESCE(SUM(c.monto), 0) as monto_total,
      MIN(c.anio) as anio_min,
      MAX(c.anio) as anio_max,
      COALESCE(s.cnt, 0) as total_señales
    FROM contratos c
    LEFT JOIN (
      SELECT municipio, COUNT(*) as cnt FROM señales_cache GROUP BY municipio
    ) s ON c.municipio = s.municipio
    GROUP BY c.municipio, s.cnt
    ORDER BY monto_total DESC
  `)
}

export interface TopEntidad {
  proveedor: string
  municipio: string
  total_contratos: number
  monto_total: number
  señales: number
  anio_min: number
  anio_max: number
}

export async function getTopEntidades(limit = 20): Promise<TopEntidad[]> {
  return dbAll<TopEntidad>(`
    SELECT
      proveedor_norm as proveedor,
      municipio,
      COUNT(*) as total_contratos,
      SUM(monto) as monto_total,
      0 as señales,
      MIN(anio) as anio_min,
      MAX(anio) as anio_max
    FROM contratos
    GROUP BY proveedor_norm, municipio
    ORDER BY monto_total DESC
    LIMIT ?
  `, [limit])
}

export async function searchEntidades(query: string, limit = 20): Promise<TopEntidad[]> {
  const pattern = `%${query.toUpperCase()}%`
  return dbAll<TopEntidad>(`
    SELECT
      proveedor_norm as proveedor,
      municipio,
      COUNT(*) as total_contratos,
      SUM(monto) as monto_total,
      0 as señales,
      MIN(anio) as anio_min,
      MAX(anio) as anio_max
    FROM contratos
    WHERE proveedor_norm LIKE ?
    GROUP BY proveedor_norm, municipio
    ORDER BY monto_total DESC
    LIMIT ?
  `, [pattern, limit])
}

export interface EntidadContrato {
  hash: string
  anio: number
  tipo: string
  area: string
  descripcion: string
  monto: number
  proveedor: string
  municipio: string
  fuente_url: string
}

export async function getContratosPorProveedor(proveedor: string): Promise<EntidadContrato[]> {
  return dbAll<EntidadContrato>(`
    SELECT hash, anio, tipo, area, descripcion, monto, proveedor, municipio, fuente_url
    FROM contratos
    WHERE proveedor_norm = ?
    ORDER BY anio DESC, monto DESC
  `, [proveedor.toUpperCase()])
}

export async function getContratoPorHash(hash: string): Promise<EntidadContrato | null> {
  const rows = await dbAll<EntidadContrato>(`
    SELECT hash, anio, tipo, area, descripcion, monto, proveedor, municipio, fuente_url
    FROM contratos
    WHERE hash = ?
    LIMIT 1
  `, [hash])
  return rows[0] ?? null
}

// ─── Señales cache ────────────────────────────────────────────────────────────

export async function clearSeñalesCache(): Promise<void> {
  await dbRun(`DELETE FROM señales_cache`)
}

export async function insertSeñalCache(
  municipio: string,
  señal: Señal,
  cuits: string[] = []
): Promise<void> {
  const id = crypto.randomUUID()
  await dbRun(
    `INSERT INTO señales_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, municipio, señal.tipologia, señal.titulo, señal.resumen,
      señal.score, señal.legal.severidad,
      JSON.stringify(señal.evidencia), JSON.stringify(señal.legal),
      cuits.length > 0 ? JSON.stringify(cuits) : null,
      new Date().toISOString()
    ]
  )
}

export interface SeñalCacheRow {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: string
  evidencia_json: string
  legal_json: string
  entidades_cuit: string | null
  computado_en: string
}

export async function getSeñalesCache(municipio?: string): Promise<SeñalCacheRow[]> {
  if (municipio) {
    return dbAll<SeñalCacheRow>(
      `SELECT * FROM señales_cache WHERE municipio = ? ORDER BY score DESC`, [municipio]
    )
  }
  return dbAll<SeñalCacheRow>(`SELECT * FROM señales_cache ORDER BY score DESC`)
}

// Señales asociadas a un CUIT específico (entidades_cuit es JSON array de strings).
export async function getSeñalesPorCuit(cuit: string): Promise<SeñalCacheRow[]> {
  // DuckDB list_contains sobre el JSON parseado. Fallback: LIKE pattern matching.
  return dbAll<SeñalCacheRow>(
    `SELECT * FROM señales_cache
     WHERE entidades_cuit IS NOT NULL
       AND entidades_cuit LIKE ?
     ORDER BY score DESC`,
    [`%"${cuit}"%`]
  )
}

export async function getSeñalesCacheCount(): Promise<number> {
  const rows = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM señales_cache`)
  return rows[0]?.cnt ?? 0
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

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

// ─── Fuentes de datos (Sprint 4) ──────────────────────────────────────────────

export interface FuenteDatosRow {
  id: string
  jurisdiccion: string
  tipo: string
  url: string
  formato: string
  oficial: boolean
  licencia: string | null
  frecuencia: string | null
  nivel_confianza: string
  notas: string | null
  registrado_en: string
  ultimo_crawl: string | null
}

export async function registrarFuente(f: FuenteMetadata): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO fuentes_datos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      f.id,
      f.jurisdiccion,
      'api_estructurada', // por ahora; el conector debería pasar tipo
      f.url,
      f.formato,
      f.oficial,
      f.licencia ?? null,
      f.frecuenciaActualizacion ?? null,
      f.nivelConfianza,
      f.notas ?? null,
      new Date().toISOString(),
      null,
    ]
  )
}

export async function listarFuentes(): Promise<FuenteDatosRow[]> {
  return dbAll<FuenteDatosRow>(`
    SELECT * FROM fuentes_datos ORDER BY jurisdiccion, registrado_en
  `)
}

export async function marcarUltimoCrawl(fuenteId: string): Promise<void> {
  await dbRun(`UPDATE fuentes_datos SET ultimo_crawl = ? WHERE id = ?`, [
    new Date().toISOString(),
    fuenteId,
  ])
}

// ─── Cache OpenSanctions ──────────────────────────────────────────────────────

export async function upsertOSMatch(m: OSMatch): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO opensanctions_matches VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      m.cuit,
      m.nombre,
      m.matched,
      m.riesgo,
      m.datasetPrincipal,
      m.entidadId,
      m.entidadCaption,
      m.entidadUrl,
      m.consultadoEn,
    ]
  )
}

interface OSMatchRow {
  cuit: string
  nombre: string
  matched: boolean
  riesgo: string | null
  dataset_principal: string | null
  entidad_id: string | null
  entidad_caption: string | null
  entidad_url: string | null
  consultado_en: string
}

function rowToOSMatch(r: OSMatchRow): OSMatch {
  return {
    cuit: r.cuit,
    nombre: r.nombre,
    matched: r.matched,
    riesgo: r.riesgo as OSMatch['riesgo'],
    datasetPrincipal: r.dataset_principal,
    entidadId: r.entidad_id,
    entidadCaption: r.entidad_caption,
    entidadUrl: r.entidad_url,
    consultadoEn: r.consultado_en,
  }
}

export async function getOSMatch(cuit: string): Promise<OSMatch | null> {
  const rows = await dbAll<OSMatchRow>(
    `SELECT * FROM opensanctions_matches WHERE cuit = ? LIMIT 1`,
    [cuit]
  )
  return rows[0] ? rowToOSMatch(rows[0]) : null
}

// Devuelve un Map<cuit, OSMatch> para todos los CUITs consultados (incluye
// matches negativos — saber que ya buscamos y no encontramos también es útil).
export async function getOSMatchesAll(): Promise<Map<string, OSMatch>> {
  const rows = await dbAll<OSMatchRow>(`SELECT * FROM opensanctions_matches`)
  const map = new Map<string, OSMatch>()
  for (const r of rows) {
    map.set(r.cuit, rowToOSMatch(r))
  }
  return map
}

export async function getOSMatchesCount(): Promise<{ total: number; matched: number }> {
  const total = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM opensanctions_matches`
  )
  const matched = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM opensanctions_matches WHERE matched = true`
  )
  return { total: total[0]?.cnt ?? 0, matched: matched[0]?.cnt ?? 0 }
}

// ─── Alertas helpers ──────────────────────────────────────────────────────────

export type AlertaTipo = 'scraper_roto' | 'fuente_desactualizada' | 'datos_nuevos'
export type AlertaSeveridad = 'info' | 'warning' | 'critical'

export interface Alerta {
  id: string
  tipo: AlertaTipo
  severidad: AlertaSeveridad
  titulo: string
  detalle: string | null
  fuenteId: string | null
  detectadoEn: string
  leida: boolean
  leidaEn: string | null
}

export async function upsertAlerta(a: Omit<Alerta, 'leida' | 'leidaEn'>): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO alertas
     (id, tipo, severidad, titulo, detalle, fuente_id, detectado_en, leida, leida_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, false, NULL)`,
    [a.id, a.tipo, a.severidad, a.titulo, a.detalle, a.fuenteId, a.detectadoEn]
  )
}

export async function getAlertas(opts: { soloNoLeidas?: boolean; limit?: number } = {}): Promise<Alerta[]> {
  const where = opts.soloNoLeidas ? 'WHERE leida = false' : ''
  const limit = opts.limit ?? 100
  const rows = await dbAll<{
    id: string; tipo: string; severidad: string; titulo: string
    detalle: string | null; fuente_id: string | null
    detectado_en: string; leida: boolean; leida_en: string | null
  }>(
    `SELECT * FROM alertas ${where} ORDER BY detectado_en DESC LIMIT ?`,
    [limit]
  )
  return rows.map(r => ({
    id: r.id,
    tipo: r.tipo as AlertaTipo,
    severidad: r.severidad as AlertaSeveridad,
    titulo: r.titulo,
    detalle: r.detalle,
    fuenteId: r.fuente_id,
    detectadoEn: r.detectado_en,
    leida: r.leida,
    leidaEn: r.leida_en,
  }))
}

export async function marcarAlertaLeida(id: string): Promise<void> {
  await dbRun(
    `UPDATE alertas SET leida = true, leida_en = ? WHERE id = ?`,
    [new Date().toISOString(), id]
  )
}

export async function marcarTodasLeidas(): Promise<number> {
  const noLeidas = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alertas WHERE leida = false`
  )
  await dbRun(
    `UPDATE alertas SET leida = true, leida_en = ? WHERE leida = false`,
    [new Date().toISOString()]
  )
  return noLeidas[0]?.cnt ?? 0
}

export async function countAlertasNoLeidas(): Promise<{ total: number; critical: number }> {
  const total = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alertas WHERE leida = false`
  )
  const critical = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM alertas WHERE leida = false AND severidad = 'critical'`
  )
  return { total: total[0]?.cnt ?? 0, critical: critical[0]?.cnt ?? 0 }
}

// ─── Scraper health helpers ───────────────────────────────────────────────────

export interface ScraperRun {
  id: string
  ejecutadoEn: string
  ok: boolean
  contratosCount: number | null
  duracionMs: number | null
  errorMsg: string | null
  urlChequeada: string | null
}

export async function registrarScraperRun(run: ScraperRun): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO scrapers_health VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [run.id, run.ejecutadoEn, run.ok, run.contratosCount, run.duracionMs, run.errorMsg, run.urlChequeada]
  )
}

export async function getScrapersHealth(): Promise<ScraperRun[]> {
  const rows = await dbAll<{
    id: string; ejecutado_en: string; ok: boolean
    contratos_count: number | null; duracion_ms: number | null
    error_msg: string | null; url_chequeada: string | null
  }>(`
    SELECT s.*
    FROM scrapers_health s
    INNER JOIN (
      SELECT id, MAX(ejecutado_en) as last
      FROM scrapers_health GROUP BY id
    ) m ON s.id = m.id AND s.ejecutado_en = m.last
    ORDER BY s.id
  `)
  return rows.map(r => ({
    id: r.id,
    ejecutadoEn: r.ejecutado_en,
    ok: r.ok,
    contratosCount: r.contratos_count,
    duracionMs: r.duracion_ms,
    errorMsg: r.error_msg,
    urlChequeada: r.url_chequeada,
  }))
}

// ─── ICIJ Offline Leaks helpers ───────────────────────────────────────────────

export interface ICIJEntidad {
  nodeId: string
  nombre: string
  tipo: 'entity' | 'officer' | 'intermediary'
  jurisdiccion: string | null
  countries: string | null
  countryCodes: string | null
  estado: string | null
  fuente: string
  incorporacion: string | null
}

export async function insertICIJBatch(entidades: ICIJEntidad[]): Promise<number> {
  const now = new Date().toISOString()
  let inserted = 0
  for (const e of entidades) {
    try {
      await dbRun(
        `INSERT OR IGNORE INTO icij_entidades VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          e.nodeId,
          e.nombre,
          normalizeICIJ(e.nombre),
          e.tipo,
          e.jurisdiccion,
          e.countries,
          e.countryCodes,
          e.estado,
          e.fuente,
          e.incorporacion,
          now,
        ]
      )
      inserted++
    } catch {
      // duplicate node_id — skip silently
    }
  }
  return inserted
}

// Búsqueda por nombre normalizado — usada por seed:icij para cruzar contra empresas
// y por /api/cruce/icij para búsqueda directa.
export async function buscarICIJPorNombre(
  nombre: string,
  limit = 20
): Promise<ICIJEntidad[]> {
  const norm = normalizeICIJ(nombre)
  if (norm.length < 3) return []

  const rows = await dbAll<{
    node_id: string; nombre: string; tipo: string; jurisdiccion: string | null
    countries: string | null; country_codes: string | null; estado: string | null
    fuente: string; incorporacion: string | null
  }>(
    `SELECT node_id, nombre, tipo, jurisdiccion, countries, country_codes,
            estado, fuente, incorporacion
     FROM icij_entidades
     WHERE nombre_norm LIKE ?
     LIMIT ?`,
    [`%${norm}%`, limit]
  )
  return rows.map(r => ({
    nodeId: r.node_id,
    nombre: r.nombre,
    tipo: r.tipo as ICIJEntidad['tipo'],
    jurisdiccion: r.jurisdiccion,
    countries: r.countries,
    countryCodes: r.country_codes,
    estado: r.estado,
    fuente: r.fuente,
    incorporacion: r.incorporacion,
  }))
}

export async function getICIJCount(): Promise<{ total: number; fuentes: Record<string, number> }> {
  const total = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM icij_entidades`)
  const porFuente = await dbAll<{ fuente: string; cnt: number }>(
    `SELECT fuente, COUNT(*) as cnt FROM icij_entidades GROUP BY fuente ORDER BY cnt DESC`
  )
  const fuentes: Record<string, number> = {}
  for (const r of porFuente) fuentes[r.fuente] = r.cnt
  return { total: total[0]?.cnt ?? 0, fuentes }
}

function normalizeICIJ(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')  // strip diacritics
    .replace(/[^A-Z0-9 ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
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
