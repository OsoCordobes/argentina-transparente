// name-only-unmatched.ts — PLAN-DATOS A5
//
// Tras correr resolvers (A4 backfill DNI agentes, resolve-identities para
// contratos, futuros para transferencias), las filas que QUEDAN con dni/cuit
// NULL son irresolubles con la información actual: tenemos solo el nombre.
//
// Marcamos `name_only_unmatched=TRUE` en esas filas. Los detectores Tier 1
// filtran `WHERE name_only_unmatched=FALSE` para no emitir señales con
// identidad ambigua. Esto es el complemento "negativo" de A4: A4 puebla los
// que matchean; A5 etiqueta los que NO.
//
// Idempotente: re-correr no cambia nada (UPDATE solo donde dni IS NULL ∧
// name_only_unmatched=FALSE).
//
// Uso típico (post-resolution):
//   await flagAgentesNameOnly()                  // global
//   await flagAgentesNameOnly({ jurisdiccion: 'cordoba-capital' })
//   await flagContratosNameOnly()
//   await flagTransferenciasNameOnly()

import { dbAll, dbRun } from './db'

export interface FlagResult {
  marcadas: number    // filas que pasaron de FALSE → TRUE en este run
  yaMarcadas: number  // filas que ya tenían el flag (idempotencia)
  totalNull: number   // total de filas con identidad NULL en la tabla
}

export interface FlagOpts {
  jurisdiccion?: string  // para agentes/transferencias
  municipio?: string     // para contratos
}

/**
 * Marca agentes_publicos con dni IS NULL como name_only_unmatched.
 * Asume que A4 (backfillAgentesDni) ya corrió. Si no corrió, marcaremos
 * filas que potencialmente sí podrían resolverse — por eso el script CLI
 * advierte si A4 nunca se aplicó (heurística: 0% dni populated).
 */
export async function flagAgentesNameOnly(opts: FlagOpts = {}): Promise<FlagResult> {
  const wherejur = opts.jurisdiccion
    ? ` AND jurisdiccion = '${opts.jurisdiccion.replace(/'/g, "''")}'`
    : ''

  const yaRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM agentes_publicos
       WHERE dni IS NULL AND name_only_unmatched = TRUE${wherejur}`,
  )
  const yaMarcadas = Number(yaRows[0]?.n ?? 0)

  await dbRun(
    `UPDATE agentes_publicos
        SET name_only_unmatched = TRUE
      WHERE dni IS NULL
        AND name_only_unmatched = FALSE${wherejur}`,
  )

  const totalNullRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM agentes_publicos WHERE dni IS NULL${wherejur}`,
  )
  const totalNull = Number(totalNullRows[0]?.n ?? 0)
  // marcadas = totalNull - yaMarcadas (las que estaban FALSE y pasaron a TRUE)
  const marcadas = Math.max(0, totalNull - yaMarcadas)
  return { marcadas, yaMarcadas, totalNull }
}

/**
 * Marca contratos con proveedor_cuit IS NULL como name_only_unmatched.
 * Asume que resolve-identities ya corrió. Es válido marcar también cuando
 * solo existe `proveedor_cuit_inferido` (Tier 4-5) — esos no son Tier 1.
 */
export async function flagContratosNameOnly(opts: FlagOpts = {}): Promise<FlagResult> {
  const wheremun = opts.municipio
    ? ` AND municipio = '${opts.municipio.replace(/'/g, "''")}'`
    : ''

  const yaRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM contratos
       WHERE proveedor_cuit IS NULL AND name_only_unmatched = TRUE${wheremun}`,
  )
  const yaMarcadas = Number(yaRows[0]?.n ?? 0)

  await dbRun(
    `UPDATE contratos
        SET name_only_unmatched = TRUE
      WHERE proveedor_cuit IS NULL
        AND name_only_unmatched = FALSE${wheremun}`,
  )

  const totalNullRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM contratos WHERE proveedor_cuit IS NULL${wheremun}`,
  )
  const totalNull = Number(totalNullRows[0]?.n ?? 0)
  const marcadas = Math.max(0, totalNull - yaMarcadas)
  return { marcadas, yaMarcadas, totalNull }
}

/**
 * Marca transferencias con beneficiario_cuit IS NULL como name_only_unmatched.
 * Las transferencias suelen tener beneficiarios PF/PJ; sin CUIT no se pueden
 * cruzar con aportantes ni IGJ.
 */
export async function flagTransferenciasNameOnly(opts: FlagOpts = {}): Promise<FlagResult> {
  const wherejur = opts.jurisdiccion
    ? ` AND jurisdiccion = '${opts.jurisdiccion.replace(/'/g, "''")}'`
    : ''

  const yaRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transferencias
       WHERE beneficiario_cuit IS NULL AND name_only_unmatched = TRUE${wherejur}`,
  )
  const yaMarcadas = Number(yaRows[0]?.n ?? 0)

  await dbRun(
    `UPDATE transferencias
        SET name_only_unmatched = TRUE
      WHERE beneficiario_cuit IS NULL
        AND name_only_unmatched = FALSE${wherejur}`,
  )

  const totalNullRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM transferencias WHERE beneficiario_cuit IS NULL${wherejur}`,
  )
  const totalNull = Number(totalNullRows[0]?.n ?? 0)
  const marcadas = Math.max(0, totalNull - yaMarcadas)
  return { marcadas, yaMarcadas, totalNull }
}
