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

const KIND_WHITELIST = new Set(['pf', 'pj', 'signal'])
const MAX_ITEMS = 50

watchlistD8Router.post('/feed', async (req: Request, res: Response) => {
  // Audit fix SEC-2: validación estricta del payload + cap de items para
  // evitar DoS por N+1 queries. Antes: items=[1..1000] generaba 1000+
  // queries en serie sin auth.
  const rawItems = Array.isArray(req.body?.items) ? req.body.items : []
  if (rawItems.length > MAX_ITEMS) {
    return res.status(400).json({
      error: `máximo ${MAX_ITEMS} items por request (recibido: ${rawItems.length})`,
    })
  }
  const items: Array<{ id: string; kind: 'pf' | 'pj' | 'signal'; lastSeenAt?: string }> = []
  for (const it of rawItems) {
    if (!it || typeof it.id !== 'string' || it.id.length === 0 || it.id.length > 64) continue
    if (!KIND_WHITELIST.has(it.kind)) continue
    items.push({
      id: it.id, kind: it.kind,
      lastSeenAt: typeof it.lastSeenAt === 'string' ? it.lastSeenAt.slice(0, 32) : undefined,
    })
  }
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
      // Audit fix SEC-2: el patrón anterior era N+1 (1 query por dni).
      // Ahora: 1 query para resolver los nombres + 1 query con OR LIKE
      // que captura todas las señales potenciales. La performance es
      // O(1+1) en lugar de O(N).
      const pfRows = await dbAll<{ dni: string; apellido_nombre: string }>(
        `SELECT dni, apellido_nombre FROM personas_fisicas
          WHERE dni IN (${dnis.map(() => '?').join(',')})`,
        dnis,
      )
      if (pfRows.length > 0) {
        const sigs = await dbAll<{ id: string; titulo: string; computado_en: string }>(
          `SELECT id, titulo, computado_en FROM señales_cache
            WHERE estado_verificacion != 'descartada'
              AND (${pfRows.map(() => 'titulo LIKE ?').join(' OR ')})
            ORDER BY computado_en DESC
            LIMIT 200`,
          pfRows.map(p => `%${p.apellido_nombre}%`),
        )
        for (const pf of pfRows) {
          const item = items.find(i => i.id === pf.dni)!
          for (const s of sigs) {
            if (!s.titulo.includes(pf.apellido_nombre)) continue
            if (item.lastSeenAt && s.computado_en <= item.lastSeenAt) continue
            alertas.push({
              actorId: pf.dni, actorKind: 'pf', tipo: 'nueva_senal',
              refId: s.id, titulo: s.titulo, ts: s.computado_en,
            })
          }
        }
      }
    }

    alertas.sort((a, b) => b.ts.localeCompare(a.ts))
    return res.json({ alertas: alertas.slice(0, 100), total: alertas.length })
  } catch (err) {
    console.error('[watchlist-d8/feed]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})
