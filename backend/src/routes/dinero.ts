// routes/dinero.ts — endpoints del módulo /dinero (PLAN-UI D4).
//
// 3 endpoints:
//   GET /api/dinero/sankey?jurisdiccion=&anio=
//       Totales por etapa del ciclo + gap entre etapas.
//   GET /api/dinero/partidas?jurisdiccion=&anio=&programa=
//       Lista de partidas con sparkline 2015-2025 (datos por año).
//   GET /api/dinero/jurisdicciones
//       Catálogo de jurisdicciones disponibles + años cubiertos.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const dineroRouter = Router()
export default dineroRouter

dineroRouter.get('/sankey', async (req: Request, res: Response) => {
  const jurisdiccion = req.query.jurisdiccion ? String(req.query.jurisdiccion) : null
  const anioRaw = req.query.anio ? Number(req.query.anio) : null
  const anio = anioRaw && !Number.isNaN(anioRaw) ? anioRaw : null

  const where: string[] = []
  const params: unknown[] = []
  if (jurisdiccion) { where.push('jurisdiccion = ?'); params.push(jurisdiccion) }
  if (anio !== null) { where.push('anio = ?'); params.push(anio) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  try {
    const rows = await dbAll<{
      total_credito_inicial: number | null
      total_credito_vigente: number | null
      total_compromiso: number | null
      total_devengado: number | null
      total_pagado: number | null
    }>(
      `SELECT
         SUM(credito_inicial) AS total_credito_inicial,
         SUM(credito_vigente) AS total_credito_vigente,
         SUM(compromiso)      AS total_compromiso,
         SUM(devengado)       AS total_devengado,
         SUM(pagado)          AS total_pagado
       FROM presupuesto_ejecucion
       ${whereSql}`,
      params,
    )
    const r = rows[0] ?? {}
    const num = (v: number | null | undefined) => Number(v ?? 0)
    const credito = num(r.total_credito_vigente) || num(r.total_credito_inicial)
    const compromiso = num(r.total_compromiso)
    const devengado = num(r.total_devengado)
    const pagado = num(r.total_pagado)

    const gap = (a: number, b: number) =>
      a > 0 ? { absoluto: a - b, pct: ((a - b) / a) * 100 } : { absoluto: 0, pct: 0 }

    return res.json({
      filtro: { jurisdiccion, anio },
      etapas: [
        { id: 'credito', label: 'Crédito vigente', monto: credito },
        { id: 'compromiso', label: 'Comprometido', monto: compromiso },
        { id: 'devengado', label: 'Devengado', monto: devengado },
        { id: 'pagado', label: 'Pagado', monto: pagado },
      ],
      gaps: [
        { de: 'credito', a: 'compromiso', ...gap(credito, compromiso) },
        { de: 'compromiso', a: 'devengado', ...gap(compromiso, devengado) },
        { de: 'devengado', a: 'pagado', ...gap(devengado, pagado) },
      ],
    })
  } catch (err) {
    console.error('[dinero/sankey]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})

dineroRouter.get('/jurisdicciones', async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll<{ jurisdiccion: string; min_anio: number; max_anio: number; cnt: number }>(
      `SELECT jurisdiccion,
              MIN(anio) AS min_anio,
              MAX(anio) AS max_anio,
              COUNT(*) AS cnt
         FROM presupuesto_ejecucion
        WHERE jurisdiccion IS NOT NULL
        GROUP BY jurisdiccion
        ORDER BY cnt DESC`,
    )
    return res.json({
      jurisdicciones: rows.map(r => ({
        id: r.jurisdiccion,
        rangoAnios: { desde: Number(r.min_anio), hasta: Number(r.max_anio) },
        cantidad: Number(r.cnt),
      })),
    })
  } catch (err) {
    console.error('[dinero/jurisdicciones]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})

dineroRouter.get('/partidas', async (req: Request, res: Response) => {
  const jurisdiccion = req.query.jurisdiccion ? String(req.query.jurisdiccion) : null
  const anioRaw = req.query.anio ? Number(req.query.anio) : null
  const anio = anioRaw && !Number.isNaN(anioRaw) ? anioRaw : null
  const programa = req.query.programa ? String(req.query.programa) : null
  const limitRaw = Number(req.query.limit ?? 50)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50

  const where: string[] = ['compromiso IS NOT NULL', 'compromiso > 0']
  const params: unknown[] = []
  if (jurisdiccion) { where.push('jurisdiccion = ?'); params.push(jurisdiccion) }
  if (anio !== null) { where.push('anio = ?'); params.push(anio) }
  if (programa) { where.push('programa = ?'); params.push(programa) }

  try {
    // Partidas para el filtro actual (1 fila por partida del año seleccionado)
    const partidas = await dbAll<{
      id: string; jurisdiccion: string; anio: number; programa: string | null;
      partida: string | null; partida_nombre: string | null;
      credito_vigente: number | null; compromiso: number; pagado: number | null;
      fuente_url: string;
    }>(
      `SELECT id, jurisdiccion, anio, programa, partida, partida_nombre,
              credito_vigente, compromiso, pagado, fuente_url
         FROM presupuesto_ejecucion
        WHERE ${where.join(' AND ')}
        ORDER BY (compromiso - COALESCE(pagado, 0)) DESC
        LIMIT ${limit}`,
      params,
    )

    // Sparkline: para cada partida (mismo programa + partida + jurisdiccion),
    // traer el monto comprometido por año 2015-presente.
    interface SparkRow { partida_norm: string; anio: number; compromiso: number }
    const claves = partidas.map(p => `${p.jurisdiccion}|${p.programa ?? ''}|${p.partida ?? ''}`)
    const sparkData = new Map<string, Array<{ anio: number; monto: number }>>()
    if (claves.length > 0) {
      const sparkRows = await dbAll<SparkRow>(
        `SELECT (jurisdiccion || '|' || COALESCE(programa, '') || '|' || COALESCE(partida, '')) AS partida_norm,
                anio, COALESCE(SUM(compromiso), 0) AS compromiso
           FROM presupuesto_ejecucion
          WHERE jurisdiccion IS NOT NULL
            AND (jurisdiccion || '|' || COALESCE(programa, '') || '|' || COALESCE(partida, '')) IN
                (${claves.map(() => '?').join(',')})
          GROUP BY partida_norm, anio
          ORDER BY anio`,
        claves,
      )
      for (const r of sparkRows) {
        const arr = sparkData.get(r.partida_norm) ?? []
        arr.push({ anio: Number(r.anio), monto: Number(r.compromiso) })
        sparkData.set(r.partida_norm, arr)
      }
    }

    const out = partidas.map(p => {
      const key = `${p.jurisdiccion}|${p.programa ?? ''}|${p.partida ?? ''}`
      const sparkline = sparkData.get(key) ?? []
      const compromiso = Number(p.compromiso)
      const pagado = Number(p.pagado ?? 0)
      const gap = compromiso > 0 ? ((compromiso - pagado) / compromiso) * 100 : 0
      return {
        id: p.id,
        jurisdiccion: p.jurisdiccion,
        anio: Number(p.anio),
        programa: p.programa,
        partida: p.partida,
        partidaNombre: p.partida_nombre,
        creditoVigente: p.credito_vigente !== null ? Number(p.credito_vigente) : null,
        compromiso,
        pagado,
        gapPct: gap,
        sparkline,
        fuenteUrl: p.fuente_url,
      }
    })

    return res.json({ filtro: { jurisdiccion, anio, programa }, partidas: out })
  } catch (err) {
    console.error('[dinero/partidas]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})
