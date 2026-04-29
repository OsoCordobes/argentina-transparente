// backfill-agentes-dni.ts (lib) — PLAN-DATOS A4
//
// Lógica reutilizable para backfillear `agentes_publicos.dni` desde
// `declaraciones_juradas` post-OCR. Match Tier 1 estricto: nombre normalizado
// + jurisdicción + DNI válido módulo-11 + único candidato.
//
// El CLI vive en `scripts/backfill-agentes-dni.ts`; los tests llaman a
// `backfillAgentesDni()` directamente con fixtures.

import { dbAll, dbRun } from './db'
import { validarDNI } from './identidad-validator'

export interface BackfillResult {
  totalNull: number
  matched: number
  ambiguos: number
  updates: Array<{ id: string; dni: string; fuente: string }>
}

export interface BackfillOpts {
  apply?: boolean
  jurisdiccion?: string
}

interface CandidatoRow {
  agente_id: string
  jurisdiccion: string
  dni: string
  fuente_url: string
  pdf_url: string | null
}

/**
 * Calcula y opcionalmente aplica el backfill de DNI a `agentes_publicos`.
 * Devuelve el plan completo (matched, ambiguos, updates) — el caller decide
 * si reportar al usuario o sólo ejecutar.
 *
 * Garantías:
 *   - Solo actualiza filas con `dni IS NULL` (no sobrescribe).
 *   - Solo cruza con DDJJ que tengan `dni` validado módulo-11.
 *   - Si un agente coincide con varios DNIs distintos (homónimos), se descarta
 *     como ambiguo — Tier 1 no admite ambigüedad.
 *   - `fuente_dni_url` apunta al `pdf_url` de la DDJJ (o `fuente_url` si está
 *     vacío). Esto permite que un fiscal vuelva al PDF original.
 */
export async function backfillAgentesDni(opts: BackfillOpts = {}): Promise<BackfillResult> {
  const wherejur = opts.jurisdiccion
    ? `AND a.jurisdiccion = '${opts.jurisdiccion.replace(/'/g, "''")}'`
    : ''

  // El JOIN normaliza apellido_nombre al vuelo (UPPER + remoción tildes ASCII)
  // para alinear con DDJJ.apellido_nombre_norm. Si DDJJ.apellido_nombre_norm
  // es NULL (legacy pre-OCR migrado), no matchea — eso es seguro.
  const candidatos = await dbAll<CandidatoRow>(`
    SELECT
      a.id                 AS agente_id,
      a.jurisdiccion       AS jurisdiccion,
      d.dni                AS dni,
      d.fuente_url         AS fuente_url,
      d.pdf_url            AS pdf_url
    FROM agentes_publicos a
    JOIN declaraciones_juradas d
      ON d.jurisdiccion = a.jurisdiccion
     AND d.apellido_nombre_norm = UPPER(
           TRANSLATE(a.apellido_nombre, 'áéíóúñÁÉÍÓÚÑ', 'aeiounAEIOUN')
         )
    WHERE a.dni IS NULL
      AND a.apellido_nombre IS NOT NULL
      AND d.dni IS NOT NULL
      ${wherejur}
  `)

  const porAgente = new Map<string, { dnis: Set<string>; fuente: string }>()
  for (const c of candidatos) {
    if (!validarDNI(c.dni)) continue
    let entry = porAgente.get(c.agente_id)
    if (!entry) {
      entry = { dnis: new Set(), fuente: c.pdf_url || c.fuente_url }
      porAgente.set(c.agente_id, entry)
    }
    entry.dnis.add(c.dni)
    if (!entry.fuente && c.pdf_url) entry.fuente = c.pdf_url
  }

  let matched = 0
  let ambiguos = 0
  const updates: BackfillResult['updates'] = []
  for (const [agente_id, info] of porAgente) {
    if (info.dnis.size === 1) {
      matched++
      const [dni] = [...info.dnis]
      updates.push({ id: agente_id, dni, fuente: info.fuente })
    } else {
      ambiguos++
    }
  }

  const totalNullRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM agentes_publicos
      WHERE dni IS NULL${opts.jurisdiccion ? ` AND jurisdiccion = '${opts.jurisdiccion.replace(/'/g, "''")}'` : ''}`,
  )
  const totalNull = Number(totalNullRows[0]?.n ?? 0)

  if (opts.apply) {
    for (const u of updates) {
      await dbRun(
        `UPDATE agentes_publicos SET dni = ?, fuente_dni_url = ? WHERE id = ?`,
        [u.dni, u.fuente, u.id],
      )
    }
  }

  return { totalNull, matched, ambiguos, updates }
}
