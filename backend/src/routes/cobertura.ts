// routes/cobertura.ts — W5: endpoint de cobertura monetaria por jurisdicción.
//
// Compara el monto declarado oficialmente (presupuesto_ejecucion.devengado)
// contra el monto trazado por ARGOS (suma de contratos.monto vinculables).
//
// Si la jurisdicción no tiene presupuesto cargado todavía (caso común
// pre-OCR boletines), devuelve `nivel: 'baja'` con `monto_declarado_oficial = 0`
// y un disclaimer en `notas`.
//
// Diseño honesto: NO inventa el denominador. Si no hay presupuesto declarado,
// la cobertura es N/A — no fingimos 100%.
//
// CLAUDE.md §5: cobertura es "señal de transparencia", no "auditoría".
// El frontend lo refleja con el banner de color.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const coberturaRouter = Router()
export default coberturaRouter

interface CoberturaResponse {
  jurisdiccion: string
  reparticion?: string
  monto_declarado_oficial: number
  monto_trazado: number
  pct_cobertura: number                // 0-1
  nivel: 'alta' | 'media' | 'baja'
  huecos_principales: Array<{
    nombre: string
    monto_declarado: number
    monto_trazado: number
    pct_trazado: number
  }>
  notas: string[]
  metodologia_url?: string
}

function clasificarNivel(pct: number): 'alta' | 'media' | 'baja' {
  if (pct >= 0.9) return 'alta'
  if (pct >= 0.7) return 'media'
  return 'baja'
}

coberturaRouter.get('/jurisdiccion/:jurisdiccion', async (req: Request, res: Response) => {
  const jurisdiccion = decodeURIComponent(String(req.params.jurisdiccion))
  const reparticionFiltro = req.query.reparticion ? String(req.query.reparticion) : undefined

  try {
    const notas: string[] = []

    // 1) Monto declarado oficial = SUM(devengado) en presupuesto_ejecucion
    // Filtramos por reparticion si está dado (matchea contra jurisdiccion_nombre o programa).
    const declaradoQ = reparticionFiltro
      ? `SELECT COALESCE(SUM(devengado), 0) AS m
           FROM presupuesto_ejecucion
          WHERE jurisdiccion = ?
            AND (jurisdiccion_nombre LIKE ? OR programa LIKE ?)`
      : `SELECT COALESCE(SUM(devengado), 0) AS m
           FROM presupuesto_ejecucion
          WHERE jurisdiccion = ?`

    const declaradoParams: unknown[] = reparticionFiltro
      ? [jurisdiccion, `%${reparticionFiltro}%`, `%${reparticionFiltro}%`]
      : [jurisdiccion]

    const declaradoRows = await dbAll<{ m: number | bigint }>(declaradoQ, declaradoParams)
    const monto_declarado_oficial = Number(declaradoRows[0]?.m ?? 0)

    // 2) Monto trazado = SUM(contratos.monto) en jurisdicción
    const trazadoQ = reparticionFiltro
      ? `SELECT COALESCE(SUM(monto), 0) AS m
           FROM contratos
          WHERE municipio = ?
            AND area LIKE ?`
      : `SELECT COALESCE(SUM(monto), 0) AS m
           FROM contratos
          WHERE municipio = ?`
    const trazadoParams: unknown[] = reparticionFiltro
      ? [jurisdiccion, `%${reparticionFiltro}%`]
      : [jurisdiccion]
    const trazadoRows = await dbAll<{ m: number | bigint }>(trazadoQ, trazadoParams)
    const monto_trazado = Number(trazadoRows[0]?.m ?? 0)

    // 3) Pct cobertura
    let pct_cobertura: number
    if (monto_declarado_oficial === 0) {
      pct_cobertura = 0
      notas.push('No hay presupuesto declarado cargado para esta jurisdicción/repartición. Cobertura comparativa no disponible.')
    } else {
      pct_cobertura = monto_trazado / monto_declarado_oficial
    }

    // 4) Top 3 huecos (reparticiones con peor cobertura) — solo si jurisdiccion-wide
    let huecos_principales: CoberturaResponse['huecos_principales'] = []
    if (!reparticionFiltro && monto_declarado_oficial > 0) {
      const huecosRows = await dbAll<{
        nombre: string | null
        declarado: number | bigint
        trazado: number | bigint
      }>(`
        WITH dec AS (
          SELECT COALESCE(jurisdiccion_nombre, 'Sin asignar') AS nombre,
                 SUM(devengado) AS declarado
            FROM presupuesto_ejecucion
           WHERE jurisdiccion = ?
           GROUP BY 1
        ),
        tra AS (
          SELECT COALESCE(area, 'Sin asignar') AS nombre,
                 SUM(monto) AS trazado
            FROM contratos
           WHERE municipio = ?
           GROUP BY 1
        )
        SELECT dec.nombre, dec.declarado, COALESCE(tra.trazado, 0) AS trazado
          FROM dec
          LEFT JOIN tra ON tra.nombre = dec.nombre
         WHERE dec.declarado > 0
         ORDER BY (COALESCE(tra.trazado, 0) / dec.declarado) ASC
         LIMIT 3
      `, [jurisdiccion, jurisdiccion])

      huecos_principales = huecosRows
        .filter(r => r.nombre && Number(r.declarado) > 0)
        .map(r => {
          const dec = Number(r.declarado)
          const tra = Number(r.trazado)
          return {
            nombre: r.nombre as string,
            monto_declarado: dec,
            monto_trazado: tra,
            pct_trazado: dec > 0 ? tra / dec : 0,
          }
        })
    }

    const response: CoberturaResponse = {
      jurisdiccion,
      reparticion: reparticionFiltro,
      monto_declarado_oficial,
      monto_trazado,
      pct_cobertura: Math.min(1, pct_cobertura),  // cap 100% (sobre-trazado se interpreta como dato pero no >100% visual)
      nivel: clasificarNivel(pct_cobertura),
      huecos_principales,
      notas,
      metodologia_url: '/docs/METODOLOGIA.md#cobertura',
    }

    res.json(response)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// GET /api/cobertura — totales globales (todas las jurisdicciones cargadas)
coberturaRouter.get('/', async (_req: Request, res: Response) => {
  try {
    const rows = await dbAll<{
      jurisdiccion: string
      declarado: number | bigint
      trazado: number | bigint
    }>(`
      WITH dec AS (
        SELECT jurisdiccion, SUM(devengado) AS declarado
          FROM presupuesto_ejecucion
         GROUP BY 1
      ),
      tra AS (
        SELECT municipio AS jurisdiccion, SUM(monto) AS trazado
          FROM contratos
         GROUP BY 1
      )
      SELECT COALESCE(dec.jurisdiccion, tra.jurisdiccion) AS jurisdiccion,
             COALESCE(dec.declarado, 0) AS declarado,
             COALESCE(tra.trazado, 0) AS trazado
        FROM dec
        FULL OUTER JOIN tra ON dec.jurisdiccion = tra.jurisdiccion
       ORDER BY 2 DESC
    `)

    res.json({
      jurisdicciones: rows.map(r => ({
        jurisdiccion: r.jurisdiccion,
        monto_declarado_oficial: Number(r.declarado),
        monto_trazado: Number(r.trazado),
        pct_cobertura: Number(r.declarado) > 0
          ? Math.min(1, Number(r.trazado) / Number(r.declarado))
          : 0,
      })),
    })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
