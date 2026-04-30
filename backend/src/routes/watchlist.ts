/**
 * routes/watchlist.ts — Phase F8
 *
 * POST /api/watchlist/novedades
 *
 * Recibe una lista de items de la watchlist del usuario (proveedor_id +
 * ultima_visita ISO) y devuelve cuántos contratos / señales nuevas
 * aparecieron desde la última visita.
 *
 * El frontend mantiene la watchlist en localStorage (y opcionalmente en
 * Supabase para sync entre devices). Este endpoint es stateless: el cliente
 * envía sus items en el body; el backend sólo consulta DuckDB.
 *
 * BigInt safety: DuckDB devuelve COUNT como BigInt. Casteamos a Number
 * (CLAUDE.md / sesión beta-loop bug B2).
 */
import { Router, type Request, type Response } from 'express'
import { dbAll } from '../lib/db'

interface NovedadItem {
  proveedor_id: string
  ultima_visita: string
}

interface NovedadResult {
  proveedor_id: string
  nuevos_contratos: number
  nuevas_senales: number
}

const router = Router()

router.post('/novedades', async (req: Request, res: Response) => {
  const { items } = req.body as { items?: NovedadItem[] }
  if (!Array.isArray(items)) {
    return res.status(400).json({ ok: false, error: 'items requerido' })
  }

  const novedades: NovedadResult[] = []

  for (const it of items) {
    if (!it || typeof it.proveedor_id !== 'string' || typeof it.ultima_visita !== 'string') {
      // Item mal formado: lo saltamos sin tirar (cero alucinaciones — preferimos
      // ignorarlo a inventar un conteo falso).
      continue
    }

    const contratos = await dbAll<{ n: number | bigint }>(
      `SELECT COUNT(*) as n FROM contratos
       WHERE proveedor_norm = ? AND cargado_en > ?`,
      [it.proveedor_id.toUpperCase(), it.ultima_visita],
    )
    const senales = await dbAll<{ n: number | bigint }>(
      `SELECT COUNT(*) as n FROM señales_cache
       WHERE entidades_cuit IS NOT NULL
         AND computado_en > ?`,
      [it.ultima_visita],
    )

    const nC = Number(contratos[0]?.n ?? 0)
    const nS = Number(senales[0]?.n ?? 0)
    if (nC > 0 || nS > 0) {
      novedades.push({
        proveedor_id: it.proveedor_id,
        nuevos_contratos: nC,
        nuevas_senales: nS,
      })
    }
  }

  res.json({ ok: true, novedades, total: novedades.length })
})

export default router
