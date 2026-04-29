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
 * Review #2 A5: helper interno que abstrae las 3 funciones públicas. La
 * lógica era idéntica salvo:
 *   - tabla a actualizar
 *   - columna que define "identidad NULL" (dni / proveedor_cuit / beneficiario_cuit)
 *   - columna del filtro (jurisdiccion / municipio)
 *
 * Centralizar:
 *   - Parametriza el filtro (antes string-interpolación con replace de
 *     comillas; frágil contra inputs no sanitizados).
 *   - Una sola fuente de verdad para la semántica de marcadas / yaMarcadas.
 */
async function flagTablaNameOnly(args: {
  tabla: 'agentes_publicos' | 'contratos' | 'transferencias'
  identityCol: 'dni' | 'proveedor_cuit' | 'beneficiario_cuit'
  filterCol: 'jurisdiccion' | 'municipio' | null
  filterValue: string | undefined
}): Promise<FlagResult> {
  const filtroSQL = args.filterCol && args.filterValue ? ` AND ${args.filterCol} = ?` : ''
  const filtroParams: unknown[] = args.filterCol && args.filterValue ? [args.filterValue] : []

  const yaRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${args.tabla}
       WHERE ${args.identityCol} IS NULL AND name_only_unmatched = TRUE${filtroSQL}`,
    filtroParams,
  )
  const yaMarcadas = Number(yaRows[0]?.n ?? 0)

  await dbRun(
    `UPDATE ${args.tabla}
        SET name_only_unmatched = TRUE
      WHERE ${args.identityCol} IS NULL
        AND name_only_unmatched = FALSE${filtroSQL}`,
    filtroParams,
  )

  const totalNullRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM ${args.tabla} WHERE ${args.identityCol} IS NULL${filtroSQL}`,
    filtroParams,
  )
  const totalNull = Number(totalNullRows[0]?.n ?? 0)
  // marcadas = filas que pasaron de FALSE → TRUE en este run.
  // Total POST-UPDATE de filas con identidad NULL es estable (UPDATE no toca
  // identidad). yaMarcadas es subset de totalNull, así que totalNull - yaMarcadas
  // ≥ 0 — el Math.max defensivo es redundante pero sin costo, lo dejamos.
  const marcadas = Math.max(0, totalNull - yaMarcadas)
  return { marcadas, yaMarcadas, totalNull }
}

/**
 * Marca agentes_publicos con dni IS NULL como name_only_unmatched.
 * Asume que A4 (backfillAgentesDni) ya corrió. Si no corrió, marcaremos
 * filas que potencialmente sí podrían resolverse — por eso el script CLI
 * advierte si A4 nunca se aplicó (heurística: 0% dni populated).
 */
export async function flagAgentesNameOnly(opts: FlagOpts = {}): Promise<FlagResult> {
  return flagTablaNameOnly({
    tabla: 'agentes_publicos',
    identityCol: 'dni',
    filterCol: 'jurisdiccion',
    filterValue: opts.jurisdiccion,
  })
}

/**
 * Marca contratos con proveedor_cuit IS NULL como name_only_unmatched.
 * Asume que resolve-identities ya corrió. Es válido marcar también cuando
 * solo existe `proveedor_cuit_inferido` (Tier 4-5) — esos no son Tier 1.
 */
export async function flagContratosNameOnly(opts: FlagOpts = {}): Promise<FlagResult> {
  return flagTablaNameOnly({
    tabla: 'contratos',
    identityCol: 'proveedor_cuit',
    filterCol: 'municipio',
    filterValue: opts.municipio,
  })
}

/**
 * Marca transferencias con beneficiario_cuit IS NULL como name_only_unmatched.
 * Las transferencias suelen tener beneficiarios PF/PJ; sin CUIT no se pueden
 * cruzar con aportantes ni IGJ.
 */
export async function flagTransferenciasNameOnly(opts: FlagOpts = {}): Promise<FlagResult> {
  return flagTablaNameOnly({
    tabla: 'transferencias',
    identityCol: 'beneficiario_cuit',
    filterCol: 'jurisdiccion',
    filterValue: opts.jurisdiccion,
  })
}

