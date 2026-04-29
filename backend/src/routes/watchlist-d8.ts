// routes/watchlist-d8.ts — endpoint para feed de alertas (PLAN-UI D8).
//
// El frontend mantiene la lista de actores observados en localStorage; este
// endpoint recibe los ids y devuelve alertas: nuevas señales sobre esos
// actores en los últimos N días.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const watchlistD8Router = Router()
export default watchlistD8Router

interface AlertaItem {
  actorId: string
  actorKind: 'pf' | 'pj' | 'signal'
  tipo: 'nueva_senal' | 'cambio_estado' | 'nuevo_contrato'
  // Datos de la señal/contrato/etc
  refId: string
  titulo: string
  ts: string                          // ISO timestamp de cuando ocurrió
}

watchlistD8Router.post('/feed', async (req: Request, res: Response) => {
  const items: Array<{ id: string; kind: 'pf' | 'pj' | 'signal'; lastSeenAt?: string }> =
    Array.isArray(req.body?.items) ? req.body.items : []
  if (items.length === 0) return res.json({ alertas: [] })

  try {
    const alertas: AlertaItem[] = []

    // Para cada PJ/PF: traer señales recientes que la mencionan
    const cuits = items.filter(i => i.kind === 'pj').map(i => i.id)
    const dnis = items.filter(i => i.kind === 'pf').map(i => i.id)

    if (cuits.length > 0) {
      const rows = await dbAll<{
        id: string; titulo: string; computado_en: string; entidades_cuit: string | null
      }>(
        `SELECT id, titulo, computado_en, entidades_cuit
           FROM señales_cache
          WHERE estado_verificacion != 'descartada'
            AND entidades_cuit IS NOT NULL
            AND (${cuits.map(() => 'entidades_cuit LIKE ?').join(' OR ')})
          ORDER BY computado_en DESC
          LIMIT 200`,
        cuits.map(c => `%${c}%`),
      )
      for (const r of rows) {
        let cuitsJson: string[] = []
        try { cuitsJson = r.entidades_cuit ? JSON.parse(r.entidades_cuit) : [] } catch { /* ignore */ }
        for (const cuit of cuits) {
          if (!cuitsJson.includes(cuit)) continue
          const item = items.find(i => i.id === cuit)!
          if (item.lastSeenAt && r.computado_en <= item.lastSeenAt) continue
          alertas.push({
            actorId: cuit, actorKind: 'pj', tipo: 'nueva_senal',
            refId: r.id, titulo: r.titulo, ts: r.computado_en,
          })
        }
      }
    }

    if (dnis.length > 0) {
      // PF: matchear por nombre en el título de la señal (heurística MVP).
      // La forma propia sería resolver el DNI vs personas_fisicas y luego
      // cruzar — pero el setup mínimo evita esa indirection.
      const rows = await dbAll<{
        dni: string; apellido_nombre: string;
      }>(
        `SELECT dni, apellido_nombre FROM personas_fisicas
          WHERE dni IN (${dnis.map(() => '?').join(',')})`,
        dnis,
      )
      for (const pf of rows) {
        const sigs = await dbAll<{ id: string; titulo: string; computado_en: string }>(
          `SELECT id, titulo, computado_en FROM señales_cache
            WHERE estado_verificacion != 'descartada'
              AND titulo LIKE ?
            ORDER BY computado_en DESC
            LIMIT 20`,
          [`%${pf.apellido_nombre}%`],
        )
        const item = items.find(i => i.id === pf.dni)!
        for (const s of sigs) {
          if (item.lastSeenAt && s.computado_en <= item.lastSeenAt) continue
          alertas.push({
            actorId: pf.dni, actorKind: 'pf', tipo: 'nueva_senal',
            refId: s.id, titulo: s.titulo, ts: s.computado_en,
          })
        }
      }
    }

    alertas.sort((a, b) => b.ts.localeCompare(a.ts))
    return res.json({ alertas: alertas.slice(0, 100), total: alertas.length })
  } catch (err) {
    console.error('[watchlist-d8/feed]', err)
    return res.status(500).json({ error: (err as Error).message })
  }
})
