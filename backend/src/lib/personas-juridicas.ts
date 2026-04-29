// personas-juridicas.ts — Helpers para la tabla maestra personas_juridicas
// (PLAN-DATOS Fase A2). Review iteración #1: complemento al schema en db.ts
// para que los seeds (cuando consoliden empresas + igj_entidades + RNS)
// tengan API consistente y no escriban SQL inline.

import { dbAll, dbRun } from './db'
import { validarCUIT, esCuitPersonaJuridica, normalizarCUIT } from './identidad-validator'
import type { PersonaJuridica } from '../types/index'

interface PJRow {
  cuit: string
  razon_social: string
  razon_social_norm: string
  alias_json: string
  tipo_societario: string | null
  fecha_constitucion: string | null
  dom_fiscal_provincia: string | null
  dom_fiscal_localidad: string | null
  dom_legal_provincia: string | null
  dom_legal_localidad: string | null
  estado: string | null
  es_empleador: boolean | null
  actividad_principal: string | null
  fuentes_url_json: string
  primer_visto: string
  ultimo_visto: string
  t_efectivo: string | null
  t_publicado: string | null
  snapshot_id: string | null
  superseded_by_id: string | null
}

/**
 * Normaliza razón social para JOIN cross-tabla.
 * UPPER + sin tildes + colapsa whitespace + quita sufijos societarios comunes
 * (S.A., SRL, SAS, etc.) para que "ACME SA" y "Acme S.A." colapsen al mismo bucket.
 */
export function normalizarRazonSocial(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\s+/g, ' ')
    .replace(/\.\s*/g, ' ')
    .replace(
      /\s+(S\s*A\s*S?|S\s*R\s*L|SOCIEDAD\s+(?:ANONIMA|ANÓNIMA|RESPONSABILIDAD\s+LIMITADA)|SAIIC[FA]?A?|SACICI|SAIC|UTE|U\.?\s*T\.?|SCS|SCEI|COOPERATIVA|COOP)\s*$/,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

/** Formatea CUIT con guiones (idempotente). */
function formatCUITcanonico(cuit: string): string {
  const norm = normalizarCUIT(cuit)
  if (!norm) throw new Error(`CUIT no normalizable: "${cuit}"`)
  return `${norm.slice(0, 2)}-${norm.slice(2, 10)}-${norm.slice(10)}`
}

function rowToPJ(r: PJRow): PersonaJuridica {
  let alias: string[] = []
  let fuentesUrl: string[] = []
  try { alias = JSON.parse(r.alias_json) } catch { alias = [] }
  try { fuentesUrl = JSON.parse(r.fuentes_url_json) } catch { fuentesUrl = [] }
  return {
    cuit: r.cuit,
    razonSocial: r.razon_social,
    razonSocialNorm: r.razon_social_norm,
    alias,
    tipoSocietario: r.tipo_societario,
    fechaConstitucion: r.fecha_constitucion,
    domFiscalProvincia: r.dom_fiscal_provincia,
    domFiscalLocalidad: r.dom_fiscal_localidad,
    domLegalProvincia: r.dom_legal_provincia,
    domLegalLocalidad: r.dom_legal_localidad,
    estado: r.estado,
    esEmpleador: r.es_empleador,
    actividadPrincipal: r.actividad_principal,
    fuentesUrl,
    primerVisto: r.primer_visto,
    ultimoVisto: r.ultimo_visto,
    tEfectivo: r.t_efectivo,
    tPublicado: r.t_publicado,
    snapshotId: r.snapshot_id,
    supersededById: r.superseded_by_id,
  }
}

/**
 * Inserta o actualiza una persona jurídica canónica.
 *
 * Garantías:
 *   - Valida CUIT módulo-11; rechaza si inválido
 *   - Verifica que sea PJ (prefijo 30/33/34); rechaza si es CUIT de PF
 *     (defensa contra error de copy-paste)
 *   - Normaliza razon_social_norm internamente
 *   - Acumula alias incrementalmente (sin duplicados); si la razon_social nueva
 *     difiere de la actual, agrega la actual a alias y promueve la nueva
 *   - Acumula fuentes_url incrementalmente (sin duplicados)
 *   - primer_visto se preserva al actualizar; ultimo_visto se actualiza siempre
 *
 * Devuelve el CUIT canónico (formato XX-DDDDDDDD-V).
 * Lanza Error si CUIT inválido o no-PJ.
 */
export async function upsertPersonaJuridica(input: {
  cuit: string
  razonSocial: string
  alias?: string[]
  tipoSocietario?: string | null
  fechaConstitucion?: string | null
  domFiscalProvincia?: string | null
  domFiscalLocalidad?: string | null
  domLegalProvincia?: string | null
  domLegalLocalidad?: string | null
  estado?: string | null
  esEmpleador?: boolean | null
  actividadPrincipal?: string | null
  fuentesUrl?: string[]
  snapshotId?: string | null
}): Promise<string> {
  if (!validarCUIT(input.cuit)) {
    throw new Error(`upsertPersonaJuridica: CUIT inválido "${input.cuit}"`)
  }
  if (!esCuitPersonaJuridica(input.cuit)) {
    throw new Error(`upsertPersonaJuridica: CUIT "${input.cuit}" no es de Persona Jurídica (prefijos 30/33/34)`)
  }
  const cuitFinal = formatCUITcanonico(input.cuit)
  const razonNorm = normalizarRazonSocial(input.razonSocial)
  const now = new Date().toISOString()

  const existing = await dbAll<PJRow>(
    `SELECT * FROM personas_juridicas WHERE cuit = ?`, [cuitFinal],
  )
  let alias: string[] = []
  let fuentes: string[] = []
  let primerVisto = now
  if (existing.length > 0) {
    try { alias = JSON.parse(existing[0].alias_json) } catch { alias = [] }
    try { fuentes = JSON.parse(existing[0].fuentes_url_json) } catch { fuentes = [] }
    primerVisto = existing[0].primer_visto
    // Si la razon_social cambió, agregamos la anterior a alias antes de pisarla
    if (existing[0].razon_social && existing[0].razon_social !== input.razonSocial) {
      alias = Array.from(new Set([existing[0].razon_social, ...alias]))
    }
  }
  if (input.alias) alias = Array.from(new Set([...alias, ...input.alias]))
  if (input.fuentesUrl) fuentes = Array.from(new Set([...fuentes, ...input.fuentesUrl]))

  await dbRun(`DELETE FROM personas_juridicas WHERE cuit = ?`, [cuitFinal])
  await dbRun(
    `INSERT INTO personas_juridicas
       (cuit, razon_social, razon_social_norm, alias_json, tipo_societario,
        fecha_constitucion, dom_fiscal_provincia, dom_fiscal_localidad,
        dom_legal_provincia, dom_legal_localidad, estado, es_empleador,
        actividad_principal, fuentes_url_json, primer_visto, ultimo_visto,
        t_efectivo, t_publicado, snapshot_id, superseded_by_id)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
    [
      cuitFinal,
      input.razonSocial,
      razonNorm,
      JSON.stringify(alias),
      input.tipoSocietario ?? (existing[0]?.tipo_societario ?? null),
      input.fechaConstitucion ?? (existing[0]?.fecha_constitucion ?? null),
      input.domFiscalProvincia ?? (existing[0]?.dom_fiscal_provincia ?? null),
      input.domFiscalLocalidad ?? (existing[0]?.dom_fiscal_localidad ?? null),
      input.domLegalProvincia ?? (existing[0]?.dom_legal_provincia ?? null),
      input.domLegalLocalidad ?? (existing[0]?.dom_legal_localidad ?? null),
      input.estado ?? (existing[0]?.estado ?? null),
      input.esEmpleador !== undefined ? input.esEmpleador : (existing[0]?.es_empleador ?? null),
      input.actividadPrincipal ?? (existing[0]?.actividad_principal ?? null),
      JSON.stringify(fuentes),
      primerVisto,
      now,
      now, now,
      input.snapshotId ?? null,
    ],
  )
  return cuitFinal
}

/** Lookup por CUIT (acepta formato XX-DDDDDDDD-V o sin separadores). */
export async function getPersonaJuridicaPorCUIT(cuit: string): Promise<PersonaJuridica | null> {
  const norm = normalizarCUIT(cuit)
  if (!norm) return null
  const formatted = `${norm.slice(0, 2)}-${norm.slice(2, 10)}-${norm.slice(10)}`
  const rows = await dbAll<PJRow>(`SELECT * FROM personas_juridicas WHERE cuit = ?`, [formatted])
  return rows[0] ? rowToPJ(rows[0]) : null
}

/** Lookup por razon_social_norm (multi-resultado por homonimia). */
export async function buscarPersonasJuridicasPorRazon(razonSocial: string): Promise<PersonaJuridica[]> {
  const norm = normalizarRazonSocial(razonSocial)
  if (!norm) return []
  const rows = await dbAll<PJRow>(
    `SELECT * FROM personas_juridicas WHERE razon_social_norm = ? ORDER BY ultimo_visto DESC`,
    [norm],
  )
  return rows.map(rowToPJ)
}

/** Lookup por provincia de domicilio fiscal — alimenta el filtro de C1. */
export async function buscarPersonasJuridicasPorProvincia(provincia: string): Promise<PersonaJuridica[]> {
  const provNorm = provincia.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').trim()
  const rows = await dbAll<PJRow>(
    `SELECT * FROM personas_juridicas WHERE dom_fiscal_provincia = ? OR dom_legal_provincia = ?`,
    [provNorm, provNorm],
  )
  return rows.map(rowToPJ)
}
