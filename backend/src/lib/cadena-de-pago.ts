// cadena-de-pago.ts — Helpers para consumir la vista materializada
// `cadena_de_pago` (creada en B4) directamente desde TypeScript.
// PLAN-DATOS Fase B (review iteración #1).
//
// Antes: la vista solo era accesible vía endpoint /api/peso/:partida_id (B5).
// Eso obligaba a cualquier consumer interno (detector, seed, script CLI) a
// duplicar la SQL inline. Esta capa es la fuente única de verdad para
// queries sobre la cadena de pago.

import { dbAll } from './db'

export interface CadenaDePagoFila {
  partidaId: string
  partidaJurisdiccion: string
  partidaAnio: number
  partidaTrimestre: number | null
  programa: string | null
  partida: string | null
  partidaNombre: string | null
  creditoInicial: number | null
  creditoVigente: number | null
  compromiso: number | null
  devengado: number | null
  pagadoPartida: number | null
  partidaFuenteUrl: string
  contratoHash: string | null
  contratoTipo: string | null
  proveedor: string | null
  proveedorNorm: string | null
  proveedorCuit: string | null
  proveedorCuitInferido: string | null
  numeroOrdenCompra: string | null
  contratoArea: string | null
  contratoMontoAdjudicado: number | null
  contratoFuenteUrl: string | null
  contratoTotalPagado: number
  contratoCantidadPagos: number
  contratoPrimerPago: string | null
  contratoUltimoPago: string | null
}

interface CadenaDePagoRow {
  partida_id: string
  partida_jurisdiccion: string
  partida_anio: number
  partida_trimestre: number | null
  programa: string | null
  partida: string | null
  partida_nombre: string | null
  credito_inicial: number | null
  credito_vigente: number | null
  compromiso: number | null
  devengado: number | null
  pagado_partida: number | null
  partida_fuente_url: string
  contrato_hash: string | null
  contrato_tipo: string | null
  proveedor: string | null
  proveedor_norm: string | null
  proveedor_cuit: string | null
  proveedor_cuit_inferido: string | null
  numero_orden_compra: string | null
  contrato_area: string | null
  contrato_monto_adjudicado: number | null
  contrato_fuente_url: string | null
  contrato_total_pagado: number | null
  contrato_cantidad_pagos: number | null
  contrato_primer_pago: string | null
  contrato_ultimo_pago: string | null
}

function rowToCadena(r: CadenaDePagoRow): CadenaDePagoFila {
  return {
    partidaId: r.partida_id,
    partidaJurisdiccion: r.partida_jurisdiccion,
    partidaAnio: Number(r.partida_anio),
    partidaTrimestre: r.partida_trimestre !== null ? Number(r.partida_trimestre) : null,
    programa: r.programa,
    partida: r.partida,
    partidaNombre: r.partida_nombre,
    creditoInicial: r.credito_inicial !== null ? Number(r.credito_inicial) : null,
    creditoVigente: r.credito_vigente !== null ? Number(r.credito_vigente) : null,
    compromiso: r.compromiso !== null ? Number(r.compromiso) : null,
    devengado: r.devengado !== null ? Number(r.devengado) : null,
    pagadoPartida: r.pagado_partida !== null ? Number(r.pagado_partida) : null,
    partidaFuenteUrl: r.partida_fuente_url,
    contratoHash: r.contrato_hash,
    contratoTipo: r.contrato_tipo,
    proveedor: r.proveedor,
    proveedorNorm: r.proveedor_norm,
    proveedorCuit: r.proveedor_cuit,
    proveedorCuitInferido: r.proveedor_cuit_inferido,
    numeroOrdenCompra: r.numero_orden_compra,
    contratoArea: r.contrato_area,
    contratoMontoAdjudicado: r.contrato_monto_adjudicado !== null ? Number(r.contrato_monto_adjudicado) : null,
    contratoFuenteUrl: r.contrato_fuente_url,
    contratoTotalPagado: Number(r.contrato_total_pagado ?? 0),
    contratoCantidadPagos: Number(r.contrato_cantidad_pagos ?? 0),
    contratoPrimerPago: r.contrato_primer_pago,
    contratoUltimoPago: r.contrato_ultimo_pago,
  }
}

/** Lookup por partida_id — devuelve todas las filas de la cadena (1+ por contratos vinculados). */
export async function getCadenaDePagoPorPartida(partidaId: string): Promise<CadenaDePagoFila[]> {
  const rows = await dbAll<CadenaDePagoRow>(
    `SELECT * FROM cadena_de_pago WHERE partida_id = ? ORDER BY contrato_hash NULLS LAST`,
    [partidaId],
  )
  return rows.map(rowToCadena)
}

/**
 * Lookup por proveedor_cuit (Tier 1-3 verificado). Devuelve todas las
 * filas de la cadena donde la empresa figura como proveedor — útil para
 * la sección "Pagos recibidos" del Profile /empresa/:cuit.
 */
export async function getCadenaDePagoPorProveedor(cuit: string): Promise<CadenaDePagoFila[]> {
  const rows = await dbAll<CadenaDePagoRow>(
    `SELECT * FROM cadena_de_pago WHERE proveedor_cuit = ? ORDER BY partida_anio DESC, contrato_hash NULLS LAST`,
    [cuit],
  )
  return rows.map(rowToCadena)
}

/**
 * Lookup por programa presupuestario — agrupa todas las partidas y contratos
 * bajo el programa. Útil para vista "Programa X" en /dinero (Fase D).
 */
export async function getCadenaDePagoPorPrograma(programa: string, anio?: number): Promise<CadenaDePagoFila[]> {
  const params: unknown[] = [programa]
  let sql = `SELECT * FROM cadena_de_pago WHERE programa = ?`
  if (anio !== undefined) {
    sql += ` AND partida_anio = ?`
    params.push(anio)
  }
  sql += ` ORDER BY partida_anio DESC, partida ASC`
  const rows = await dbAll<CadenaDePagoRow>(sql, params)
  return rows.map(rowToCadena)
}

/**
 * Resumen del flujo agregado para una jurisdicción/año: suma de las 5 etapas
 * (crédito_inicial → pagado) por jurisdicción. Alimenta el Sankey del PLAN-UI §4.2.
 */
export async function getResumenCicloPresupuestario(jurisdiccion: string, anio: number): Promise<{
  jurisdiccion: string
  anio: number
  creditoInicial: number
  creditoVigente: number
  compromiso: number
  devengado: number
  pagado: number
}> {
  const rows = await dbAll<{
    credito_inicial: number | null
    credito_vigente: number | null
    compromiso: number | null
    devengado: number | null
    pagado_partida: number | null
  }>(
    // Una sola fila por partida_id — usamos DISTINCT y agregamos
    `SELECT
       SUM(credito_inicial) AS credito_inicial,
       SUM(credito_vigente) AS credito_vigente,
       SUM(compromiso) AS compromiso,
       SUM(devengado) AS devengado,
       SUM(pagado_partida) AS pagado_partida
     FROM (
       SELECT DISTINCT partida_id, credito_inicial, credito_vigente,
              compromiso, devengado, pagado_partida
         FROM cadena_de_pago
        WHERE partida_jurisdiccion = ? AND partida_anio = ?
     )`,
    [jurisdiccion, anio],
  )
  const r = rows[0] ?? {}
  return {
    jurisdiccion,
    anio,
    creditoInicial: Number(r.credito_inicial ?? 0),
    creditoVigente: Number(r.credito_vigente ?? 0),
    compromiso: Number(r.compromiso ?? 0),
    devengado: Number(r.devengado ?? 0),
    pagado: Number(r.pagado_partida ?? 0),
  }
}
