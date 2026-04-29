// personas-fisicas.ts — Helpers para la tabla maestra personas_fisicas
// (PLAN-DATOS Fase A1). Review iteración #1: extraído del schema-puro de db.ts
// para que los seeds A4/A5 (cuando se desbloqueen) tengan API consistente y
// no escriban SQL inline.

import { dbAll, dbRun } from './db'
import {
  validarDNI,
  validarCUIT,
  normalizarDNI,
  esCuitPersonaFisica,
} from './identidad-validator'
import type { PersonaFisica } from '../types/index'

interface PFRow {
  dni: string
  cuit: string | null
  apellido_nombre: string
  apellido_nombre_norm: string
  fuentes_url_json: string
  fuente_dni_url: string | null
  primer_visto: string
  ultimo_visto: string
  t_efectivo: string | null
  t_publicado: string | null
  snapshot_id: string | null
  superseded_by_id: string | null
}

/** Normaliza apellido_nombre para JOIN cross-tabla. UPPER + sin tildes + colapsa whitespace. */
export function normalizarApellidoNombre(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // tildes y diacríticos
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function rowToPF(r: PFRow): PersonaFisica {
  let fuentesUrl: string[] = []
  try { fuentesUrl = JSON.parse(r.fuentes_url_json) } catch { fuentesUrl = [] }
  return {
    dni: r.dni,
    cuit: r.cuit,
    apellidoNombre: r.apellido_nombre,
    apellidoNombreNorm: r.apellido_nombre_norm,
    fuentesUrl,
    fuenteDniUrl: r.fuente_dni_url,
    primerVisto: r.primer_visto,
    ultimoVisto: r.ultimo_visto,
    tEfectivo: r.t_efectivo,
    tPublicado: r.t_publicado,
    snapshotId: r.snapshot_id,
    supersededById: r.superseded_by_id,
  }
}

/**
 * Inserta o actualiza una persona física canónica.
 *
 * Garantías:
 *   - Valida DNI (formato + longitud); rechaza si inválido
 *   - Si se pasa cuit, lo valida módulo-11 y verifica que sea PF (prefijo 20/23/24/27);
 *     si no se pasa, intenta derivarlo de los candidatos válidos para el DNI (toma el primero)
 *   - Normaliza apellido_nombre_norm internamente (no requiere que el caller lo haga)
 *   - Acumula fuentes_url incrementalmente: si la persona ya existe, las URLs nuevas
 *     se mergean con las existentes (sin duplicados)
 *   - primer_visto se preserva si la persona ya existía; ultimo_visto se actualiza
 *
 * Devuelve el DNI canónico (forma normalizada).
 * Lanza Error si DNI o CUIT son inválidos.
 */
export async function upsertPersonaFisica(input: {
  dni: string
  cuit?: string | null
  apellidoNombre: string
  fuentesUrl?: string[]
  fuenteDniUrl?: string | null
  snapshotId?: string | null
}): Promise<string> {
  const dniNorm = normalizarDNI(input.dni)
  if (!dniNorm || !validarDNI(dniNorm)) {
    throw new Error(`upsertPersonaFisica: DNI inválido "${input.dni}"`)
  }

  // CUIT: solo lo guardamos si el caller lo pasó explícitamente y es válido.
  //
  // Review #2 A1: NO auto-derivamos CUIT desde DNI. derivarCUITsCandidatos
  // devuelve [20-..., 23-..., 27-...]; tomar el primero asignaría género
  // masculino por default — sesgo + dato falso. Si el CUIT no está confirmado
  // por una fuente externa, queda null. Los callers que tienen CUIT
  // (DDJJ post-OCR, IGJ, AFIP padrón) lo pasan; los que solo tienen DNI
  // dejan que el resolver lo busque después.
  let cuitFinal: string | null = null
  if (input.cuit) {
    if (!validarCUIT(input.cuit)) {
      throw new Error(`upsertPersonaFisica: CUIT inválido "${input.cuit}" para DNI ${dniNorm}`)
    }
    if (!esCuitPersonaFisica(input.cuit)) {
      throw new Error(`upsertPersonaFisica: CUIT "${input.cuit}" no es de Persona Física (prefijo 30/33/34 reservado a PJ)`)
    }
    const digits = input.cuit.replace(/\D/g, '')
    cuitFinal = `${digits.slice(0, 2)}-${digits.slice(2, 10)}-${digits.slice(10)}`
  }

  const apellidoNorm = normalizarApellidoNombre(input.apellidoNombre)
  const now = new Date().toISOString()

  // Lookup existente para preservar primer_visto + acumular fuentes
  const existing = await dbAll<PFRow>(
    `SELECT * FROM personas_fisicas WHERE dni = ?`,
    [dniNorm],
  )
  const fuentesNuevas = input.fuentesUrl ?? []
  let fuentesFinal: string[]
  let primerVisto: string
  if (existing.length > 0) {
    let prev: string[] = []
    try { prev = JSON.parse(existing[0].fuentes_url_json) } catch { prev = [] }
    fuentesFinal = Array.from(new Set([...prev, ...fuentesNuevas]))
    primerVisto = existing[0].primer_visto
  } else {
    fuentesFinal = Array.from(new Set(fuentesNuevas))
    primerVisto = now
  }

  // Review #2 A1: usar INSERT...ON CONFLICT en lugar de DELETE+INSERT. El
  // patrón anterior tenía dos problemas:
  //   - Race: dos llamadas concurrentes podían hacer DELETE+INSERT entreveradas.
  //   - Leaks de FK: si otra tabla referenciaba dni con CASCADE, el DELETE
  //     borraba sus referencias.
  // ON CONFLICT (dni) DO UPDATE preserva la row existente y la actualiza en
  // una sola operación atómica.
  await dbRun(
    `INSERT INTO personas_fisicas
       (dni, cuit, apellido_nombre, apellido_nombre_norm, fuentes_url_json,
        fuente_dni_url, primer_visto, ultimo_visto, t_efectivo, t_publicado,
        snapshot_id, superseded_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT (dni) DO UPDATE SET
       cuit                = EXCLUDED.cuit,
       apellido_nombre     = EXCLUDED.apellido_nombre,
       apellido_nombre_norm= EXCLUDED.apellido_nombre_norm,
       fuentes_url_json    = EXCLUDED.fuentes_url_json,
       fuente_dni_url      = EXCLUDED.fuente_dni_url,
       ultimo_visto        = EXCLUDED.ultimo_visto,
       t_efectivo          = EXCLUDED.t_efectivo,
       t_publicado         = EXCLUDED.t_publicado,
       snapshot_id         = EXCLUDED.snapshot_id`,
    [
      dniNorm,
      cuitFinal,
      input.apellidoNombre,
      apellidoNorm,
      JSON.stringify(fuentesFinal),
      input.fuenteDniUrl ?? null,
      primerVisto,
      now,
      now, // t_efectivo: cuando ocurrió el evento — para A4/A5 siempre es ahora
      now, // t_publicado: cuando lo supo ARGOS — siempre ahora
      input.snapshotId ?? null,
    ],
  )
  return dniNorm
}

/** Lookup por DNI canónico. Devuelve null si no existe. */
export async function getPersonaFisicaPorDNI(dni: string): Promise<PersonaFisica | null> {
  const dniNorm = normalizarDNI(dni)
  if (!dniNorm) return null
  const rows = await dbAll<PFRow>(`SELECT * FROM personas_fisicas WHERE dni = ?`, [dniNorm])
  return rows[0] ? rowToPF(rows[0]) : null
}

/** Lookup por CUIT formateado o sin separadores. */
export async function getPersonaFisicaPorCUIT(cuit: string): Promise<PersonaFisica | null> {
  const norm = cuit.replace(/\D/g, '')
  if (norm.length !== 11) return null
  const formatted = `${norm.slice(0, 2)}-${norm.slice(2, 10)}-${norm.slice(10)}`
  const rows = await dbAll<PFRow>(`SELECT * FROM personas_fisicas WHERE cuit = ?`, [formatted])
  return rows[0] ? rowToPF(rows[0]) : null
}

/** Lookup por apellido_nombre_norm (multi-resultado posible — homonimia). */
export async function buscarPersonasPorApellidoNombre(apellidoNombre: string): Promise<PersonaFisica[]> {
  const norm = normalizarApellidoNombre(apellidoNombre)
  if (!norm) return []
  const rows = await dbAll<PFRow>(
    `SELECT * FROM personas_fisicas WHERE apellido_nombre_norm = ? ORDER BY ultimo_visto DESC`,
    [norm],
  )
  return rows.map(rowToPF)
}
