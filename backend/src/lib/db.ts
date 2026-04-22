import DuckDB from "duckdb";
import crypto from "crypto";
import path from "path";
import fs from "fs";
import type { Contrato, Señal, Expediente } from "../types/index";

const DEFAULT_DB_PATH = path.join(process.cwd(), "data", "argos.duckdb");
const DB_PATH = path.resolve(process.env.ARGOS_DUCKDB_PATH || DEFAULT_DB_PATH);
const DATA_DIR = path.dirname(DB_PATH);

let _db: DuckDB.Database | null = null;
let _conn: DuckDB.Connection | null = null;

function getConn(): DuckDB.Connection {
  if (!_conn)
    throw new Error("Base de datos no inicializada — llamar initDb() primero");
  return _conn;
}

// Deterministic UUID-like identifier based on stable source keys.
// We use SHA-1 and UUIDv5-compatible bits to keep IDs reproducible.
export function stableEntityId(namespace: string, key: string): string {
  const digest = crypto
    .createHash("sha1")
    .update(`${namespace}:${key}`)
    .digest("hex")
    .slice(0, 32);
  const chars = digest.split("");
  chars[12] = "5";
  const variantNibble = parseInt(chars[16], 16);
  chars[16] = ((variantNibble & 0x3) | 0x8).toString(16);
  const hex = chars.join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}

// duckdb uses variadic params + trailing callback; TypeScript doesn't model this perfectly
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbRun(sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null) => {
      if (err) reject(err);
      else resolve();
    };
    (getConn() as any).run(sql, ...params, cb);
  });
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function dbAll<T>(sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const cb = (err: Error | null, rows: T[]) => {
      if (err) reject(err);
      else resolve(rows);
    };
    (getConn() as any).all(sql, ...params, cb);
  });
}

export async function initDb(): Promise<void> {
  if (_conn && _db) return;

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

  _db = await new Promise<DuckDB.Database>((resolve, reject) => {
    const db = new DuckDB.Database(DB_PATH, (err) => {
      if (err) {
        const maybeSize = fs.existsSync(DB_PATH)
          ? fs.statSync(DB_PATH).size
          : null;
        const sizeHint = maybeSize !== null ? ` (size=${maybeSize} bytes)` : "";
        reject(
          new Error(
            `No se pudo abrir DuckDB en ${DB_PATH}${sizeHint}: ${err.message}`,
          ),
        );
        return;
      }
      resolve(db);
    });
  });

  _conn = _db.connect();

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
  `);

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
  `);

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
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS directores (
      id               TEXT PRIMARY KEY,
      cuit_empresa     TEXT NOT NULL,
      nombre_director  TEXT NOT NULL,
      fuente_url       TEXT,
      actualizado_en   TEXT NOT NULL
    )
  `);

  // ─── Phase 2: canonical entities + provenance ─────────────────────────────
  await dbRun(`
    CREATE TABLE IF NOT EXISTS entity_registry (
      entity_id         TEXT PRIMARY KEY,
      entity_type       TEXT NOT NULL,
      canonical_name    TEXT NOT NULL,
      cuit              TEXT,
      source_primary    TEXT NOT NULL,
      discovered_at     TEXT NOT NULL,
      last_verified_at  TEXT,
      confidence_level  DOUBLE NOT NULL DEFAULT 0.5,
      resolution_status TEXT NOT NULL DEFAULT 'canonical',
      merge_parent_id   TEXT,
      metadata_json     TEXT,
      updated_at        TEXT NOT NULL
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS provenance (
      id                TEXT PRIMARY KEY,
      table_name        TEXT NOT NULL,
      record_id         TEXT NOT NULL,
      entity_id         TEXT,
      field_name        TEXT NOT NULL,
      source_value      TEXT,
      source_name       TEXT NOT NULL,
      extracted_at      TEXT NOT NULL,
      extraction_method TEXT NOT NULL,
      confidence_score  DOUBLE NOT NULL DEFAULT 0.5,
      validation_status TEXT NOT NULL DEFAULT 'unvalidated',
      metadata_json     TEXT
    )
  `);

  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_entity_registry_type ON entity_registry(entity_type)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_entity_registry_cuit ON entity_registry(cuit)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_entity_registry_name ON entity_registry(canonical_name)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_provenance_entity ON provenance(entity_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_provenance_table_record ON provenance(table_name, record_id)`,
  );
  await dbRun(
    `CREATE INDEX IF NOT EXISTS idx_provenance_source ON provenance(source_name)`,
  );

  await dbRun(`
    CREATE TABLE IF NOT EXISTS igj_entidades (
      numero_correlativo INTEGER,
      cuit               TEXT,
      razon_social       TEXT,
      tipo_societario    TEXT,
      activa             BOOLEAN
    )
  `);

  await dbRun(`
    CREATE TABLE IF NOT EXISTS igj_autoridades (
      numero_correlativo INTEGER,
      apellido_nombre    TEXT,
      tipo_administrador TEXT,
      numero_documento   TEXT
    )
  `);

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
  `);
}

// ─── Tipos públicos ────────────────────────────────────────────────────────────

export interface HistorialEntry {
  id: string;
  municipio: string;
  anio_desde: number;
  anio_hasta: number;
  generado_en: string;
  resumen_ejecutivo: string | null;
  total_contratos: number;
  total_señales: number;
}

export interface ReporteCompleto {
  id: string;
  municipio: string;
  anio_desde: number;
  anio_hasta: number;
  generado_en: string;
  expediente: Expediente;
}

// ─── Operaciones ──────────────────────────────────────────────────────────────

export async function upsertEmpresa(data: {
  cuit: string;
  nombre: string;
  esEmpleador: boolean;
  inicioActividades: string | null;
  estado: string | null;
  actividadPrincipal: string | null;
  fuenteUrl: string;
}): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO empresas VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      data.cuit,
      data.nombre,
      data.esEmpleador,
      data.inicioActividades,
      data.estado,
      data.actividadPrincipal,
      data.fuenteUrl,
      new Date().toISOString(),
    ],
  );
}

export async function upsertDirectores(
  cuitEmpresa: string,
  directores: string[],
  fuenteUrl: string,
): Promise<void> {
  for (const nombre of directores) {
    const id = `${cuitEmpresa}_${nombre.trim().toUpperCase()}`;
    await dbRun(`INSERT OR REPLACE INTO directores VALUES (?, ?, ?, ?, ?)`, [
      id,
      cuitEmpresa,
      nombre.trim(),
      fuenteUrl,
      new Date().toISOString(),
    ]);
  }
}

export async function getDirectoresPorEmpresa(cuit: string): Promise<string[]> {
  const rows = await dbAll<{ nombre_director: string }>(
    `SELECT nombre_director FROM directores WHERE cuit_empresa = ?`,
    [cuit],
  );
  return rows.map((r) => r.nombre_director);
}

export async function isIGJLoaded(): Promise<boolean> {
  const rows = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM igj_entidades`,
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

export async function clearIGJTables(): Promise<void> {
  await dbRun(`DELETE FROM igj_entidades`);
  await dbRun(`DELETE FROM igj_autoridades`);
}

export interface EntityRegistryUpsert {
  entityId: string;
  entityType: string;
  canonicalName: string;
  cuit: string | null;
  sourcePrimary: string;
  discoveredAt: string;
  lastVerifiedAt: string | null;
  confidenceLevel: number;
  resolutionStatus: "canonical" | "merged" | "uncertain" | "orphaned";
  mergeParentId: string | null;
  metadataJson: string | null;
}

export async function upsertEntityRegistry(
  row: EntityRegistryUpsert,
): Promise<void> {
  const now = new Date().toISOString();
  await dbRun(
    `INSERT OR REPLACE INTO entity_registry (
      entity_id, entity_type, canonical_name, cuit, source_primary,
      discovered_at, last_verified_at, confidence_level, resolution_status,
      merge_parent_id, metadata_json, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.entityId,
      row.entityType,
      row.canonicalName,
      row.cuit,
      row.sourcePrimary,
      row.discoveredAt,
      row.lastVerifiedAt,
      row.confidenceLevel,
      row.resolutionStatus,
      row.mergeParentId,
      row.metadataJson,
      now,
    ],
  );
}

export interface ProvenanceUpsert {
  id: string;
  tableName: string;
  recordId: string;
  entityId: string | null;
  fieldName: string;
  sourceValue: string | null;
  sourceName: string;
  extractedAt: string;
  extractionMethod: string;
  confidenceScore: number;
  validationStatus: "unvalidated" | "verified" | "conflict";
  metadataJson: string | null;
}

export async function upsertProvenance(row: ProvenanceUpsert): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO provenance (
      id, table_name, record_id, entity_id, field_name,
      source_value, source_name, extracted_at, extraction_method,
      confidence_score, validation_status, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.tableName,
      row.recordId,
      row.entityId,
      row.fieldName,
      row.sourceValue,
      row.sourceName,
      row.extractedAt,
      row.extractionMethod,
      row.confidenceScore,
      row.validationStatus,
      row.metadataJson,
    ],
  );
}

export async function getEntityRegistryCount(): Promise<number> {
  const rows = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM entity_registry`,
  );
  return rows[0]?.cnt ?? 0;
}

export async function getProvenanceCount(): Promise<number> {
  const rows = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM provenance`,
  );
  return rows[0]?.cnt ?? 0;
}

export async function loadIGJFromCSV(
  entidadesPath: string,
  autoridadesPath: string,
): Promise<{ entidades: number; autoridades: number }> {
  // Use DuckDB native CSV reader for performance
  const escapedEnt = entidadesPath.replace(/\\/g, "/");
  const escapedAut = autoridadesPath.replace(/\\/g, "/");

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
  `);

  await dbRun(`
    INSERT INTO igj_autoridades
    SELECT
      TRY_CAST(numero_correlativo AS INTEGER),
      apellido_nombre,
      tipo_administrador,
      numero_documento
    FROM read_csv_auto('${escapedAut}', header=true, ignore_errors=true)
    WHERE apellido_nombre IS NOT NULL AND TRIM(apellido_nombre) != ''
  `);

  const [{ cnt: cntEnt }] = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM igj_entidades`,
  );
  const [{ cnt: cntAut }] = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM igj_autoridades`,
  );
  return { entidades: cntEnt, autoridades: cntAut };
}

export interface IGJDirectorRow {
  apellido_nombre: string;
  tipo_administrador: string;
  numero_documento: string;
}

export async function getDirectoresPorCuitIGJ(
  cuit: string,
): Promise<IGJDirectorRow[]> {
  const normalizedCuit = cuit.replace(/-/g, "");
  return dbAll<IGJDirectorRow>(
    `
    SELECT a.apellido_nombre, a.tipo_administrador, a.numero_documento
    FROM igj_autoridades a
    JOIN igj_entidades e ON e.numero_correlativo = a.numero_correlativo
    WHERE e.cuit = ?
    ORDER BY a.tipo_administrador, a.apellido_nombre
  `,
    [normalizedCuit],
  );
}

// ─── Contratos (permanent store) ──────────────────────────────────────────────

export function hashContrato(municipio: string, c: Contrato): string {
  const key = `${municipio}|${c.anio}|${c.tipo}|${c.proveedor}|${c.area}|${c.monto}`;
  return crypto.createHash("sha256").update(key).digest("hex").slice(0, 16);
}

function normProveedor(nombre: string): string {
  return (
    nombre
      .trim()
      .toUpperCase()
      .replace(/\s+/g, " ")
      .replace(/\.$/, "")
      // Strip trailing legal-entity suffixes ("EMPRESA SA" → "EMPRESA")
      .replace(/\s+(S\.?A\.?S?\.?|S\.?R\.?L\.?|S\.?C\.?S?\.?)\s*$/, "")
      .trim()
  );
}

export async function getContratosCount(municipio?: string): Promise<number> {
  const sql = municipio
    ? `SELECT COUNT(*) as cnt FROM contratos WHERE municipio = ?`
    : `SELECT COUNT(*) as cnt FROM contratos`;
  const rows = await dbAll<{ cnt: number }>(sql, municipio ? [municipio] : []);
  return rows[0]?.cnt ?? 0;
}

export async function clearContratos(municipio?: string): Promise<void> {
  if (municipio) {
    await dbRun(`DELETE FROM contratos WHERE municipio = ?`, [municipio]);
  } else {
    await dbRun(`DELETE FROM contratos`);
  }
}

export async function insertContratoBatch(
  municipio: string,
  contratos: Contrato[],
): Promise<number> {
  let inserted = 0;
  const now = new Date().toISOString();
  for (const c of contratos) {
    const hash = hashContrato(municipio, c);
    try {
      await dbRun(
        `INSERT OR IGNORE INTO contratos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          hash,
          municipio,
          c.anio,
          c.tipo,
          c.proveedor,
          normProveedor(c.proveedor),
          c.area,
          c.descripcion ?? "",
          c.monto,
          c.fuenteUrl,
          now,
        ],
      );
      inserted++;
    } catch {
      // duplicate hash — skip
    }
  }
  return inserted;
}

export async function getAllContratos(municipio?: string): Promise<Contrato[]> {
  const sql = municipio
    ? `SELECT * FROM contratos WHERE municipio = ? ORDER BY anio, proveedor`
    : `SELECT * FROM contratos ORDER BY municipio, anio, proveedor`;
  const rows = await dbAll<any>(sql, municipio ? [municipio] : []);
  return rows.map((r) => ({
    tipo: r.tipo,
    proveedor: r.proveedor,
    area: r.area,
    descripcion: r.descripcion,
    monto: r.monto,
    anio: r.anio,
    fuenteUrl: r.fuente_url,
  }));
}

// ─── Dashboard queries ────────────────────────────────────────────────────────

export interface DashboardMunicipio {
  municipio: string;
  total_contratos: number;
  monto_total: number;
  anio_min: number;
  anio_max: number;
  total_señales: number;
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
  `);
}

export interface TopEntidad {
  proveedor: string;
  municipio: string;
  total_contratos: number;
  monto_total: number;
  señales: number;
  anio_min: number;
  anio_max: number;
}

export async function getTopEntidades(limit = 20): Promise<TopEntidad[]> {
  return dbAll<TopEntidad>(
    `
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
  `,
    [limit],
  );
}

export async function searchEntidades(
  query: string,
  limit = 20,
): Promise<TopEntidad[]> {
  const pattern = `%${query.toUpperCase()}%`;
  return dbAll<TopEntidad>(
    `
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
  `,
    [pattern, limit],
  );
}

export interface EntidadContrato {
  anio: number;
  tipo: string;
  area: string;
  descripcion: string;
  monto: number;
  municipio: string;
  fuente_url: string;
}

export async function getContratosPorProveedor(
  proveedor: string,
): Promise<EntidadContrato[]> {
  return dbAll<EntidadContrato>(
    `
    SELECT anio, tipo, area, descripcion, monto, municipio, fuente_url
    FROM contratos
    WHERE proveedor_norm = ?
    ORDER BY anio DESC, monto DESC
  `,
    [proveedor.toUpperCase()],
  );
}

// ─── Señales cache ────────────────────────────────────────────────────────────

export async function clearSeñalesCache(municipio?: string): Promise<void> {
  if (municipio) {
    await dbRun(`DELETE FROM señales_cache WHERE municipio = ?`, [municipio]);
  } else {
    await dbRun(`DELETE FROM señales_cache`);
  }
}

export async function insertSeñalCache(
  municipio: string,
  señal: Señal,
): Promise<void> {
  const id = crypto.randomUUID();
  await dbRun(
    `INSERT INTO señales_cache VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      municipio,
      señal.tipologia,
      señal.titulo,
      señal.resumen,
      señal.score,
      señal.legal.severidad,
      JSON.stringify(señal.evidencia),
      JSON.stringify(señal.legal),
      null,
      new Date().toISOString(),
    ],
  );
}

export interface SeñalCacheRow {
  id: string;
  municipio: string;
  tipologia: string;
  titulo: string;
  resumen: string;
  score: number;
  severidad: string;
  evidencia_json: string;
  legal_json: string;
  computado_en: string;
}

export async function getSeñalesCache(
  municipio?: string,
): Promise<SeñalCacheRow[]> {
  if (municipio) {
    return dbAll<SeñalCacheRow>(
      `SELECT * FROM señales_cache WHERE municipio = ? ORDER BY score DESC`,
      [municipio],
    );
  }
  return dbAll<SeñalCacheRow>(
    `SELECT * FROM señales_cache ORDER BY score DESC`,
  );
}

export async function getSeñalesCacheCount(): Promise<number> {
  const rows = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM señales_cache`,
  );
  return rows[0]?.cnt ?? 0;
}

// ─── Reportes ─────────────────────────────────────────────────────────────────

export async function insertReporte(
  expediente: Expediente,
  municipio: string,
  anioDesde: number,
  anioHasta: number,
): Promise<string> {
  const id = crypto.randomUUID();
  await dbRun(`INSERT INTO reportes VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
    id,
    municipio,
    anioDesde,
    anioHasta,
    new Date().toISOString(),
    expediente.resumenEjecutivo ?? null,
    expediente.datosBase.totalContratos,
    expediente.señales.length,
    JSON.stringify(expediente),
  ]);
  return id;
}

export async function getHistorial(limit = 20): Promise<HistorialEntry[]> {
  return dbAll<HistorialEntry>(
    `SELECT id, municipio, anio_desde, anio_hasta, generado_en,
            resumen_ejecutivo, total_contratos, total_señales
     FROM reportes
     ORDER BY generado_en DESC
     LIMIT ?`,
    [limit],
  );
}

export async function getReporte(id: string): Promise<ReporteCompleto | null> {
  const rows = await dbAll<{
    id: string;
    municipio: string;
    anio_desde: number;
    anio_hasta: number;
    generado_en: string;
    expediente_json: string;
  }>(
    `SELECT id, municipio, anio_desde, anio_hasta, generado_en, expediente_json
     FROM reportes WHERE id = ?`,
    [id],
  );
  if (!rows[0]) return null;
  const r = rows[0];
  return {
    id: r.id,
    municipio: r.municipio,
    anio_desde: r.anio_desde,
    anio_hasta: r.anio_hasta,
    generado_en: r.generado_en,
    expediente: JSON.parse(r.expediente_json) as Expediente,
  };
}
