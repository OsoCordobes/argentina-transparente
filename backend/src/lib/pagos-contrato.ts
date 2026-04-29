// pagos-contrato.ts — Helpers para la tabla pagos_contrato (PLAN-DATOS Fase B3).
//
// Atomiza la cadena de pago: cada fila es UN egreso real contra un contrato.
// Útil para:
//   - Profile UI §3.2 sección "Pagos recibidos" en /empresa/:cuit
//   - Vista cadena_de_pago de Fase B4 (agregar pagado_total por contrato)
//   - Detector C4 "gap_compromiso_pagado": señala partidas con compromiso
//     alto y suma de pagos baja persistente (deuda flotante creciente)

import crypto from 'crypto'
import { dbAll, dbRun } from './db'

export interface PagoContrato {
  id: string
  contratoHash: string
  fechaPago: string             // ISO YYYY-MM-DD
  monto: number
  moneda: string                // 'ARS' por default
  concepto: string | null
  fuenteUrl: string
  cargadoEn: string
}

interface PagoRow {
  id: string
  contrato_hash: string
  fecha_pago: string
  monto: number
  moneda: string
  concepto: string | null
  fuente_url: string
  cargado_en: string
}

function rowToPago(r: PagoRow): PagoContrato {
  return {
    id: r.id,
    contratoHash: r.contrato_hash,
    fechaPago: r.fecha_pago,
    monto: Number(r.monto),
    moneda: r.moneda,
    concepto: r.concepto,
    fuenteUrl: r.fuente_url,
    cargadoEn: r.cargado_en,
  }
}

/** Computa el ID determinístico de un pago. */
export function pagoId(contratoHash: string, fechaPago: string, monto: number): string {
  const key = `${contratoHash}|${fechaPago}|${monto}`
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 32)
}

/**
 * Inserta o reemplaza un pago. Idempotente por id (delete + insert).
 * Si re-corre con un mismo contratoHash + fechaPago + monto, sobrescribe
 * los demás campos (concepto, fuente_url, etc.) con los valores nuevos.
 */
export async function upsertPagoContrato(p: Omit<PagoContrato, 'id' | 'cargadoEn'>): Promise<string> {
  const id = pagoId(p.contratoHash, p.fechaPago, p.monto)
  const now = new Date().toISOString()
  await dbRun(`DELETE FROM pagos_contrato WHERE id = ?`, [id])
  await dbRun(
    `INSERT INTO pagos_contrato
       (id, contrato_hash, fecha_pago, monto, moneda, concepto, fuente_url, cargado_en)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [id, p.contratoHash, p.fechaPago, p.monto, p.moneda, p.concepto, p.fuenteUrl, now],
  )
  return id
}

/** Devuelve todos los pagos de un contrato ordenados por fecha. */
export async function getPagosPorContrato(contratoHash: string): Promise<PagoContrato[]> {
  const rows = await dbAll<PagoRow>(
    `SELECT * FROM pagos_contrato WHERE contrato_hash = ? ORDER BY fecha_pago ASC`,
    [contratoHash],
  )
  return rows.map(rowToPago)
}

/**
 * Suma de pagos por contrato. Útil para responder "cuánto se pagó del
 * contrato X" sin tener que joinear N veces. Devuelve 0 si no hay pagos.
 */
export async function getTotalPagadoPorContrato(contratoHash: string): Promise<number> {
  const rows = await dbAll<{ total: number | null }>(
    `SELECT COALESCE(SUM(monto), 0) AS total FROM pagos_contrato WHERE contrato_hash = ?`,
    [contratoHash],
  )
  return Number(rows[0]?.total ?? 0)
}

/**
 * Resumen agregado por contrato — devuelve hash, monto adjudicado (de contratos)
 * y total pagado + fechas primer/último pago. Útil para el detector C4
 * "gap_compromiso_pagado" y para la sección "Pagos recibidos" del Profile.
 *
 * Review #1: agregadas primerPago/ultimoPago al output (estaban computadas
 * en la query SQL pero la signature los omitía — denuncia-builder ya los
 * pedía como NonNullable e inicializaba a null porque este helper no los
 * devolvía. Ahora denuncia-builder podrá usarlos sin null).
 *
 * `soloConPagos`: si true, omite contratos sin pagos cargados.
 */
export async function getResumenPagosContratos(opts: { soloConPagos?: boolean } = {}): Promise<Array<{
  contratoHash: string
  montoAdjudicado: number
  totalPagado: number
  cantidadPagos: number
  primerPago: string | null
  ultimoPago: string | null
}>> {
  const join = opts.soloConPagos ? 'INNER' : 'LEFT'
  const rows = await dbAll<{
    contrato_hash: string
    monto_adjudicado: number
    total_pagado: number | null
    cantidad_pagos: number
    primer_pago: string | null
    ultimo_pago: string | null
  }>(
    `SELECT
       c.hash AS contrato_hash,
       c.monto AS monto_adjudicado,
       COALESCE(SUM(p.monto), 0) AS total_pagado,
       COUNT(p.id) AS cantidad_pagos,
       MIN(p.fecha_pago) AS primer_pago,
       MAX(p.fecha_pago) AS ultimo_pago
     FROM contratos c
     ${join} JOIN pagos_contrato p ON p.contrato_hash = c.hash
     GROUP BY c.hash, c.monto`,
  )
  return rows.map(r => ({
    contratoHash: r.contrato_hash,
    montoAdjudicado: Number(r.monto_adjudicado),
    totalPagado: Number(r.total_pagado ?? 0),
    cantidadPagos: Number(r.cantidad_pagos),
    primerPago: r.primer_pago,
    ultimoPago: r.ultimo_pago,
  }))
}

/**
 * Review #1: elimina un pago por id. Útil cuando un seed cargó un pago
 * erróneamente y hay que limpiarlo sin re-correr el seed completo.
 * Idempotente — si el id no existe, es no-op.
 */
export async function eliminarPagoContrato(id: string): Promise<void> {
  await dbRun(`DELETE FROM pagos_contrato WHERE id = ?`, [id])
}
