// cargos-funcionarios.ts — Helpers para la tabla cargos_funcionarios
// (PLAN-DATOS Fase A6).
//
// La tabla colapsa N filas por (persona, año) de agentes_publicos en filas de
// "carrera": un funcionario en un cargo + repartición + jurisdicción es UNA
// fila con vigente_desde / vigente_hasta. Útil para:
//
//   - Profile UI §3.1 (sección "Cargos públicos" con tabla de vigencia)
//   - Detector C1 refactor (bonus por cargo con poder de adjudicación)
//   - Filtros temporales en señales (¿estaba vigente cuándo se firmó X?)
//
// El DNI queda nullable hasta que Fase A4-A5 backfileen identidades desde
// DDJJ + boletín; el JOIN cross-tabla mientras tanto va por
// (apellido_nombre_norm, jurisdiccion).

import crypto from 'crypto'
import { dbAll, dbRun } from './db'

export interface CargoFuncionario {
  id: string
  dni: string | null
  apellidoNombre: string
  apellidoNombreNorm: string
  jurisdiccion: string
  reparticion: string | null
  cargo: string
  vigenteDesde: string | null
  vigenteHasta: string | null
  facultades: string[]
  fuenteUrl: string
  cargadoEn: string
}

interface CargoRow {
  id: string
  dni: string | null
  apellido_nombre: string
  apellido_nombre_norm: string
  jurisdiccion: string
  reparticion: string | null
  cargo: string
  vigente_desde: string | null
  vigente_hasta: string | null
  facultades_json: string
  fuente_url: string
  cargado_en: string
}

function rowToCargo(r: CargoRow): CargoFuncionario {
  let facultades: string[] = []
  try { facultades = JSON.parse(r.facultades_json) }
  catch { facultades = [] }
  return {
    id: r.id,
    dni: r.dni,
    apellidoNombre: r.apellido_nombre,
    apellidoNombreNorm: r.apellido_nombre_norm,
    jurisdiccion: r.jurisdiccion,
    reparticion: r.reparticion,
    cargo: r.cargo,
    vigenteDesde: r.vigente_desde,
    vigenteHasta: r.vigente_hasta,
    facultades,
    fuenteUrl: r.fuente_url,
    cargadoEn: r.cargado_en,
  }
}

/**
 * Computa el ID determinístico de un cargo (idempotente).
 * Usa md5 para alinear con SQL `md5()` de DuckDB que la migración usa.
 * Los upserts JS y la migración SQL deben producir exactamente el mismo id
 * para que los conflictos se detecten correctamente.
 */
export function cargoId(jurisdiccion: string, apellidoNombreNorm: string, cargo: string, reparticion: string | null): string {
  const key = `${jurisdiccion}|${apellidoNombreNorm}|${cargo}|${reparticion ?? ''}`
  return crypto.createHash('md5').update(key).digest('hex')
}

/**
 * Busca cargos por DNI canónico (FK).
 * Solo trae filas donde el backfill de A4-A5 ya populó dni.
 */
export async function getCargosPorDNI(dni: string): Promise<CargoFuncionario[]> {
  const rows = await dbAll<CargoRow>(
    `SELECT * FROM cargos_funcionarios WHERE dni = ? ORDER BY vigente_desde DESC NULLS LAST`,
    [dni],
  )
  return rows.map(rowToCargo)
}

/**
 * Busca cargos por apellido_nombre_norm + jurisdicción opcional. Útil mientras
 * la mayoría de filas tiene dni=NULL (pre-backfill A4-A5).
 */
export async function getCargosPorApellidoNombre(
  apellidoNombreNorm: string,
  jurisdiccion?: string,
): Promise<CargoFuncionario[]> {
  const params: unknown[] = [apellidoNombreNorm]
  let sql = `SELECT * FROM cargos_funcionarios WHERE apellido_nombre_norm = ?`
  if (jurisdiccion) {
    sql += ` AND jurisdiccion = ?`
    params.push(jurisdiccion)
  }
  sql += ` ORDER BY vigente_desde DESC NULLS LAST`
  const rows = await dbAll<CargoRow>(sql, params)
  return rows.map(rowToCargo)
}

/**
 * Inserta/actualiza un cargo. Idempotente por id.
 * Usado por la migración derivarCargosFuncionariosDesdeAgentes() y por
 * cargas externas curadas (con `facultades` específicas).
 */
export async function upsertCargoFuncionario(c: Omit<CargoFuncionario, 'id' | 'cargadoEn'>): Promise<string> {
  const id = cargoId(c.jurisdiccion, c.apellidoNombreNorm, c.cargo, c.reparticion)
  const now = new Date().toISOString()
  // Review #2 A6: ON CONFLICT en lugar de DELETE+INSERT. Mismo razonamiento
  // que A1/A2: race-safe + no rompe FKs con CASCADE. La diferencia con
  // derivarCargosFuncionariosDesdeAgentes es que ESE upsert curado SI puede
  // sobrescribir dni y facultades — el caller pasó esos campos explícitamente.
  await dbRun(
    `INSERT INTO cargos_funcionarios
       (id, dni, apellido_nombre, apellido_nombre_norm, jurisdiccion, reparticion, cargo,
        vigente_desde, vigente_hasta, facultades_json, fuente_url, cargado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (id) DO UPDATE SET
       dni                  = EXCLUDED.dni,
       apellido_nombre      = EXCLUDED.apellido_nombre,
       apellido_nombre_norm = EXCLUDED.apellido_nombre_norm,
       jurisdiccion         = EXCLUDED.jurisdiccion,
       reparticion          = EXCLUDED.reparticion,
       cargo                = EXCLUDED.cargo,
       vigente_desde        = EXCLUDED.vigente_desde,
       vigente_hasta        = EXCLUDED.vigente_hasta,
       facultades_json      = EXCLUDED.facultades_json,
       fuente_url           = EXCLUDED.fuente_url,
       cargado_en           = EXCLUDED.cargado_en`,
    [
      id, c.dni, c.apellidoNombre, c.apellidoNombreNorm, c.jurisdiccion,
      c.reparticion, c.cargo, c.vigenteDesde, c.vigenteHasta,
      JSON.stringify(c.facultades), c.fuenteUrl, now,
    ],
  )
  return id
}

// ─── Review iteración #1: filtros temporales ────────────────────────────────
//
// El detector M4.1 (C1) chequea overlap_temporal por años — pero compara
// `c.anios_funcionario` con `c.anios_contrato`, no con la vigencia real del
// cargo. Cuando se backfileen las vigencias (A4-A5 + A6 derivación), estos
// helpers permiten preguntas más precisas:
//
//   - "¿Estaba este funcionario en su cargo el día que firmó este contrato?"
//   - "¿Quién tenía facultad de adjudicación en jurisdicción X en fecha Y?"
//
// La comparación de fechas es por ISO string (lexicográficamente equivalente
// a comparación cronológica para formato YYYY-MM-DD).

/**
 * ¿El cargo estuvo vigente en una fecha específica?
 * Compara contra vigente_desde y vigente_hasta del CargoFuncionario.
 *
 * Reglas:
 *   - Si vigente_desde es null, asumimos que sí (data incompleta — no descarta)
 *   - Si vigente_hasta es null, asumimos vigente actualmente
 *   - Si fecha > vigente_hasta, NO vigente
 *   - Si fecha < vigente_desde, NO vigente
 */
export function cargoVigenteEnFecha(cargo: Pick<CargoFuncionario, 'vigenteDesde' | 'vigenteHasta'>, fechaIso: string): boolean {
  // Normalizar fechaIso a YYYY-MM-DD (toleramos timestamps completos)
  const fecha = fechaIso.length >= 10 ? fechaIso.slice(0, 10) : fechaIso
  if (cargo.vigenteDesde) {
    const desde = cargo.vigenteDesde.length >= 10 ? cargo.vigenteDesde.slice(0, 10) : cargo.vigenteDesde
    if (fecha < desde) return false
  }
  if (cargo.vigenteHasta) {
    const hasta = cargo.vigenteHasta.length >= 10 ? cargo.vigenteHasta.slice(0, 10) : cargo.vigenteHasta
    if (fecha > hasta) return false
  }
  return true
}

/**
 * Lista cargos vigentes en una fecha específica, filtrando por jurisdicción.
 * Útil para el detector M4.1: "¿qué funcionarios tenían cargo activo cuando
 * se firmó el contrato del año X?".
 *
 * SQL: aprovecha que vigente_desde y vigente_hasta están en formato
 * lexicográficamente comparable (ISO YYYY-MM-DD).
 */
export async function cargosVigentesEnFecha(
  jurisdiccion: string,
  fechaIso: string,
): Promise<CargoFuncionario[]> {
  const fecha = fechaIso.length >= 10 ? fechaIso.slice(0, 10) : fechaIso
  const rows = await dbAll<CargoRow>(
    `SELECT * FROM cargos_funcionarios
     WHERE jurisdiccion = ?
       AND (vigente_desde IS NULL OR vigente_desde <= ?)
       AND (vigente_hasta IS NULL OR vigente_hasta >= ?)
     ORDER BY apellido_nombre_norm`,
    [jurisdiccion, fecha, fecha],
  )
  return rows.map(rowToCargo)
}

/**
 * Migración: deriva cargos_funcionarios a partir de agentes_publicos.
 *
 * Agrupa filas anuales por (apellido_nombre_norm, jurisdiccion, cargo, reparticion)
 * y emite UNA fila por grupo con vigente_desde = año mínimo, vigente_hasta = año
 * máximo (NULL si el max es el año actual o posterior, indicando vigencia activa).
 *
 * NO toca agentes_publicos. Idempotente: re-correr sobrescribe campos derivados
 * sin tocar `dni` ni `facultades_json` (preserva curación humana).
 *
 * Implementación SQL-only en DOS pasos para preservar las facultades curadas:
 *   1. INSERT INTO ... SELECT ... ON CONFLICT (id) DO UPDATE de los campos
 *      derivados (apellido, vigencias, fuente_url, cargado_en). NO toca
 *      facultades_json ni dni en el branch UPDATE.
 *   2. Para inserts nuevos, facultades_json = '[]' por DEFAULT.
 *
 * El ID es md5 determinístico (DuckDB built-in) para mantenerse en SQL.
 *
 * Devuelve cantidad de grupos materializados. Si agentes_publicos está vacío, devuelve 0.
 */
export async function derivarCargosFuncionariosDesdeAgentes(): Promise<{ insertados: number; gruposEvaluados: number }> {
  const anioActual = new Date().getFullYear()
  const cargadoEn = new Date().toISOString()

  // Una sola query: agrupa, computa id determinístico con md5, e inserta o
  // actualiza preservando dni y facultades_json (que vienen de A4-A5 / curación).
  await dbRun(
    `INSERT INTO cargos_funcionarios
       (id, dni, apellido_nombre, apellido_nombre_norm, jurisdiccion, reparticion, cargo,
        vigente_desde, vigente_hasta, facultades_json, fuente_url, cargado_en)
     SELECT
       md5(jurisdiccion || '|' || apellido_nombre_norm || '|' || cargo || '|' || COALESCE(reparticion, '')) AS id,
       NULL AS dni,
       apellido_nombre,
       apellido_nombre_norm,
       jurisdiccion,
       reparticion,
       cargo,
       CAST(anio_min AS VARCHAR) || '-01-01' AS vigente_desde,
       CASE WHEN anio_max >= ? THEN NULL ELSE CAST(anio_max AS VARCHAR) || '-12-31' END AS vigente_hasta,
       '[]' AS facultades_json,
       fuente_url,
       ? AS cargado_en
     FROM (
       SELECT
         apellido_nombre,
         regexp_replace(strip_accents(UPPER(apellido_nombre)), '[^A-Z\\s]', ' ', 'g') AS apellido_nombre_norm,
         jurisdiccion,
         reparticion,
         cargo,
         MIN(anio) AS anio_min,
         MAX(anio) AS anio_max,
         MAX(fuente_url) AS fuente_url
       FROM agentes_publicos
       WHERE apellido_nombre IS NOT NULL
         AND cargo IS NOT NULL
         AND jurisdiccion IS NOT NULL
         AND fuente_url IS NOT NULL
       GROUP BY apellido_nombre, jurisdiccion, reparticion, cargo
     )
     ON CONFLICT (id) DO UPDATE SET
       apellido_nombre = excluded.apellido_nombre,
       apellido_nombre_norm = excluded.apellido_nombre_norm,
       vigente_desde = excluded.vigente_desde,
       vigente_hasta = excluded.vigente_hasta,
       fuente_url = excluded.fuente_url,
       cargado_en = excluded.cargado_en`,
    [anioActual, cargadoEn],
  )

  // Conteo post-INSERT (refleja el total de cargos derivados, no solo los nuevos)
  const cnt = await dbAll<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM cargos_funcionarios
     WHERE apellido_nombre IN (SELECT DISTINCT apellido_nombre FROM agentes_publicos WHERE apellido_nombre IS NOT NULL)`,
  )
  const total = Number(cnt[0]?.cnt ?? 0)
  return { insertados: total, gruposEvaluados: total }
}
