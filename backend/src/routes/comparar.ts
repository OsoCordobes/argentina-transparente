// routes/comparar.ts — endpoint para /comparar (PLAN-UI D9).
//
// Devuelve un slot de métricas comparables para una entidad. El frontend
// llama 2 veces (A y B) y arma el diff visualmente.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const compararRouter = Router()
export default compararRouter

interface MetricasEmpresa {
  cuit: string
  razonSocial: string
  domFiscalProvincia: string | null
  tipoSocietario: string | null
  // Agregados
  cantidadContratos: number
  montoTotal: number
  cantidadSenales: number
  primerContratoAnio: number | null
  ultimoContratoAnio: number | null
  jurisdicciones: string[]
  // Sparkline 2015-presente
  sparkline: Array<{ anio: number; monto: number }>
}

compararRouter.get('/empresa', async (req: Request, res: Response) => {
  const cuit = req.query.cuit ? String(req.query.cuit) : null
  if (!cuit) return res.status(400).json({ error: 'cuit requerido' })

  try {
    const pjRows = await dbAll<{
      cuit: string; razon_social: string; dom_fiscal_provincia: string | null; tipo_societario: string | null;
    }>(`SELECT cuit, razon_social, dom_fiscal_provincia, tipo_societario
          FROM personas_juridicas WHERE cuit = ?`, [cuit])
    if (pjRows.length === 0) {
      // Fallback a empresas legacy
      const empRows = await dbAll<{ cuit: string; nombre: string }>(
        `SELECT cuit, nombre FROM empresas WHERE cuit = ?`, [cuit],
      )
      if (empRows.length === 0) return res.status(404).json({ error: 'empresa no encontrada' })
      return res.json({
        cuit, razonSocial: empRows[0].nombre,
        domFiscalProvincia: null, tipoSocietario: null,
        cantidadContratos: 0, montoTotal: 0, cantidadSenales: 0,
        primerContratoAnio: null, ultimoContratoAnio: null, jurisdicciones: [],
        sparkline: [],
      } satisfies MetricasEmpresa)
    }

    const pj = pjRows[0]

    const [contratosAgg, senalesCount, sparkRows, juRows] = await Promise.all([
      dbAll<{ cnt: number; tot: number; min_anio: number | null; max_anio: number | null }>(
        `SELECT COUNT(*) AS cnt, COALESCE(SUM(monto), 0) AS tot,
                MIN(anio) AS min_anio, MAX(anio) AS max_anio
           FROM contratos WHERE proveedor_cuit = ?`, [cuit]),
      dbAll<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM señales_cache
          WHERE estado_verificacion != 'descartada'
            AND entidades_cuit LIKE ?`, [`%${cuit}%`]),
      dbAll<{ anio: number; monto: number }>(
        `SELECT anio, COALESCE(SUM(monto), 0) AS monto FROM contratos
          WHERE proveedor_cuit = ? AND anio IS NOT NULL
          GROUP BY anio ORDER BY anio`, [cuit]),
      dbAll<{ municipio: string }>(
        `SELECT DISTINCT municipio FROM contratos WHERE proveedor_cuit = ?`, [cuit]),
    ])

    const m: MetricasEmpresa = {
      cuit: pj.cuit,
      razonSocial: pj.razon_social,
      domFiscalProvincia: pj.dom_fiscal_provincia,
      tipoSocietario: pj.tipo_societario,
      cantidadContratos: Number(contratosAgg[0]?.cnt ?? 0),
      montoTotal: Number(contratosAgg[0]?.tot ?? 0),
      cantidadSenales: Number(senalesCount[0]?.cnt ?? 0),
      primerContratoAnio: contratosAgg[0]?.min_anio ? Number(contratosAgg[0].min_anio) : null,
      ultimoContratoAnio: contratosAgg[0]?.max_anio ? Number(contratosAgg[0].max_anio) : null,
      jurisdicciones: juRows.map(r => r.municipio),
      sparkline: sparkRows.map(r => ({ anio: Number(r.anio), monto: Number(r.monto) })),
    }
    return res.json(m)
  } catch (err) {
    console.error('[comparar/empresa]', err)
    return res.status(500).json({ error: (err as Error).message })
  }
})

compararRouter.get('/empresas-lookup', async (req: Request, res: Response) => {
  const q = req.query.q ? String(req.query.q).trim().toLowerCase() : ''
  if (q.length < 2) return res.json({ items: [] })
  try {
    const rows = await dbAll<{ cuit: string; razon_social: string }>(
      `SELECT cuit, razon_social FROM personas_juridicas
        WHERE LOWER(razon_social) LIKE ? OR cuit LIKE ?
        LIMIT 8`,
      [`%${q}%`, `%${q}%`],
    )
    return res.json({ items: rows.map(r => ({ cuit: r.cuit, label: r.razon_social })) })
  } catch (err) {
    console.error('[comparar/empresas-lookup]', err)
    return res.status(500).json({ error: (err as Error).message })
  }
})
