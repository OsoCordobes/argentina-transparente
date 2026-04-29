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
  // DuckDB: INSERT OR REPLACE no es estándar; usamos delete + insert.
  await dbRun(`DELETE FROM cargos_funcionarios WHERE id = ?`, [id])
  await dbRun(
    `INSERT INTO cargos_funcionarios
       (id, dni, apellido_nombre, apellido_nombre_norm, jurisdiccion, reparticion, cargo,
        vigente_desde, vigente_hasta, facultades_json, fuente_url, cargado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, c.dni, c.apellidoNombre, c.apellidoNombreNorm, c.jurisdiccion,
      c.reparticion, c.cargo, c.vigenteDesde, c.vigenteHasta,
      JSON.stringify(c.facultades), c.fuenteUrl, now,
    ],
  )
  return id
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
