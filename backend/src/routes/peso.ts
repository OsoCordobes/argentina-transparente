// routes/peso.ts — B5: endpoint de cadena de pago por partida presupuestaria.
//
// PLAN-DATOS Fase B5. Materializa la pregunta principal del PLAN-UI §4.2:
//   "¿Dónde fue cada peso de esta partida?"
//
// Devuelve, para una partida (presupuesto_ejecucion.id):
//   - Las 5 etapas del ciclo presupuestario (Crédito → Compromiso → Devengado → Pagado)
//   - Los contratos vinculados a esa partida (proveedor + monto adjudicado)
//   - Para cada contrato, los pagos efectivos atomizados (suma + cantidad +
//     fechas primer/último)
//
// Honesto sobre la incertidumbre: si los seeds aún no populan
// partida_presupuestaria en contratos, devuelve la partida con `contratos: []`
// y un disclaimer en `notas`. NO inventa vinculaciones.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const pesoRouter = Router()
export default pesoRouter

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

interface ContratoVinculado {
  hash: string
  tipo: string | null
  proveedor: string | null
  proveedorCuit: string | null              // Tier 1-3 verificado
  proveedorCuitInferido: string | null      // Tier 4-5 — uso restringido
  numeroOrdenCompra: string | null
  area: string | null
  montoAdjudicado: number
  totalPagado: number
  cantidadPagos: number
  primerPago: string | null
  ultimoPago: string | null
  fuenteUrl: string | null
}

interface PesoResponse {
  partida: {
    id: string
    jurisdiccion: string
    anio: number
    trimestre: number | null
    programa: string | null
    partida: string | null
    partidaNombre: string | null
    fuenteUrl: string
  }
  ciclo: {
    creditoInicial: number | null
    creditoVigente: number | null
    compromiso: number | null
    devengado: number | null
    pagadoPartida: number | null
  }
  contratos: ContratoVinculado[]
  resumen: {
    contratosVinculados: number
    montoAdjudicadoTotal: number
    pagadoEfectivoTotal: number
    /** Ratio pagado_efectivo / pagado_partida. Útil para flagear gap. */
    coberturaPagosVsPartida: number | null
  }
  notas: string[]
}

pesoRouter.get('/peso/:partida_id', async (req: Request, res: Response) => {
  const partidaId = String(req.params.partida_id)
  if (!partidaId) {
    return res.status(400).json({ error: 'partida_id requerido' })
  }

  try {
    const rows = await dbAll<CadenaDePagoRow>(
      `SELECT * FROM cadena_de_pago WHERE partida_id = ? ORDER BY contrato_hash NULLS LAST`,
      [partidaId],
    )
    if (rows.length === 0) {
      return res.status(404).json({ error: 'partida no encontrada', partida_id: partidaId })
    }

    // La partida se repite N veces (una por contrato vinculado, +1 si no hay
    // ninguno con LEFT JOIN). Tomamos los datos de partida del primer row.
    const head = rows[0]
    const notas: string[] = []

    // Construir array de contratos (filtra rows con contrato_hash NULL —
    // representan partida sin vinculación).
    const contratos: ContratoVinculado[] = rows
      .filter(r => r.contrato_hash !== null)
      .map(r => ({
        hash: r.contrato_hash!,
        tipo: r.contrato_tipo,
        proveedor: r.proveedor,
        proveedorCuit: r.proveedor_cuit,
        proveedorCuitInferido: r.proveedor_cuit_inferido,
        numeroOrdenCompra: r.numero_orden_compra,
        area: r.contrato_area,
        montoAdjudicado: Number(r.contrato_monto_adjudicado ?? 0),
        totalPagado: Number(r.contrato_total_pagado ?? 0),
        cantidadPagos: Number(r.contrato_cantidad_pagos ?? 0),
        primerPago: r.contrato_primer_pago,
        ultimoPago: r.contrato_ultimo_pago,
        fuenteUrl: r.contrato_fuente_url,
      }))

    if (contratos.length === 0) {
      notas.push(
        'Esta partida no tiene contratos vinculados (contratos.partida_presupuestaria NULL). ' +
        'Es esperable mientras los seeds no populen el campo — Fase E.',
      )
    }

    const montoAdjudicadoTotal = contratos.reduce((s, c) => s + c.montoAdjudicado, 0)
    const pagadoEfectivoTotal = contratos.reduce((s, c) => s + c.totalPagado, 0)
    const pagadoPartida = head.pagado_partida ?? null
    const coberturaPagosVsPartida = pagadoPartida && pagadoPartida > 0
      ? pagadoEfectivoTotal / pagadoPartida
      : null

    if (coberturaPagosVsPartida !== null && coberturaPagosVsPartida < 0.5) {
      notas.push(
        `Solo ${(coberturaPagosVsPartida * 100).toFixed(1)}% del pagado de partida está atribuible ` +
        `a contratos individuales. Posible deuda flotante o pagos sin OC documentada.`,
      )
    }

    const response: PesoResponse = {
      partida: {
        id: head.partida_id,
        jurisdiccion: head.partida_jurisdiccion,
        anio: Number(head.partida_anio),
        trimestre: head.partida_trimestre !== null ? Number(head.partida_trimestre) : null,
        programa: head.programa,
        partida: head.partida,
        partidaNombre: head.partida_nombre,
        fuenteUrl: head.partida_fuente_url,
      },
      ciclo: {
        creditoInicial: head.credito_inicial !== null ? Number(head.credito_inicial) : null,
        creditoVigente: head.credito_vigente !== null ? Number(head.credito_vigente) : null,
        compromiso: head.compromiso !== null ? Number(head.compromiso) : null,
        devengado: head.devengado !== null ? Number(head.devengado) : null,
        pagadoPartida: pagadoPartida !== null ? Number(pagadoPartida) : null,
      },
      contratos,
      resumen: {
        contratosVinculados: contratos.length,
        montoAdjudicadoTotal,
        pagadoEfectivoTotal,
        coberturaPagosVsPartida,
      },
      notas,
    }

    return res.json(response)
  } catch (err) {
    console.error('[peso] error:', err)
    return res.status(500).json({ error: 'error interno', detail: String(err) })
  }
})
