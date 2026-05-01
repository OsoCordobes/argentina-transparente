// routes/grafo.ts — Endpoints del mapa-neural cordobés.
//
// Estos son los que alimenta el grafo de /explorar (Argos v2). Reemplaza
// la lógica anterior que armaba el grafo in-memory desde useDashboard.
//
// Estrategia lazy:
//   GET /api/grafo/nucleo                — núcleo caliente (~150 nodos)
//   GET /api/grafo/expand/:nodeId        — vecinos de un nodo (lazy load)
//   GET /api/grafo/conflictos            — solo aristas CONFLICTO_CON
//
// Si Neo4j no está disponible, los endpoints devuelven `{nodes:[],edges:[]}`
// para que el frontend pueda fallback a un mensaje "grafo no disponible".

import { Router, Request, Response } from 'express'
import { getGrafoNucleo, expandirNodo, getGrafoStats, isGraphAvailable, listarConflictos } from '../lib/graph'
import { getJerarquiaCordoba } from '../lib/grafo-jerarquia'
import { getJerarquiaV2 } from '../lib/grafo-jerarquia-v2'

const grafoRouter = Router()
export default grafoRouter

grafoRouter.get('/nucleo', async (req: Request, res: Response) => {
  if (!isGraphAvailable()) {
    return res.json({ nodes: [], edges: [], graphAvailable: false })
  }
  const limite = parseInt(String(req.query.limite ?? '150'))
  const municipio = String(req.query.municipio ?? 'cordoba-capital')
  try {
    const grafo = await getGrafoNucleo({ limite, municipio })
    res.json({ ...grafo, graphAvailable: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Jerarquía v2 — response depth-structured (depth0/1/2/3 separados).
// Foundation del Wave PR-1 grafo premium: el frontend semantic-zoom
// fetchea por nivel on-demand. Reusa getJerarquiaCordoba(), solo cambia
// el shape de la respuesta. No reemplaza /jerarquia (legacy queda compat).
grafoRouter.get('/jerarquia/v2', async (req: Request, res: Response) => {
  const jurisdiccion = (() => {
    const v = String(req.query.jurisdiccion ?? 'cordoba-capital')
    return v === 'cordoba-capital' || v === 'cordoba-provincia' || v === 'all'
      ? v
      : 'cordoba-capital'
  })() as 'cordoba-capital' | 'cordoba-provincia' | 'all'
  try {
    const grafo = await getJerarquiaV2({ jurisdiccion })
    res.json(grafo)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// Jerarquía Estado → Reparticion → Empresa servida desde DuckDB.
// No requiere Neo4j. Es la fuente preferida del home (graph-first).
grafoRouter.get('/jerarquia', async (req: Request, res: Response) => {
  const jurisdiccion = (() => {
    const v = String(req.query.jurisdiccion ?? 'all')
    return v === 'cordoba-capital' || v === 'cordoba-provincia' || v === 'all'
      ? v
      : 'all'
  })() as 'cordoba-capital' | 'cordoba-provincia' | 'all'
  const maxReparticiones = Math.max(
    1,
    Math.min(50, parseInt(String(req.query.maxReparticiones ?? '12')) || 12)
  )
  const maxEmpresasPorReparticion = Math.max(
    0,
    Math.min(20, parseInt(String(req.query.maxEmpresasPorReparticion ?? '4')) || 4)
  )
  try {
    const grafo = await getJerarquiaCordoba({
      jurisdiccion,
      maxReparticiones,
      maxEmpresasPorReparticion,
    })
    res.json(grafo)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

grafoRouter.get('/stats', async (_req: Request, res: Response) => {
  if (!isGraphAvailable()) {
    return res.json({ graphAvailable: false })
  }
  try {
    const stats = await getGrafoStats()
    res.json({ ...stats, graphAvailable: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

// W4 Iter#5: lista de :Conflicto detectados (M4.1 + futuras señales relacionales)
// Query params: jurisdiccion, tipologia, minScore, limit (default 100)
grafoRouter.get('/conflictos', async (req: Request, res: Response) => {
  if (!isGraphAvailable()) {
    return res.json({ conflictos: [], graphAvailable: false })
  }
  try {
    const conflictos = await listarConflictos({
      jurisdiccion: req.query.jurisdiccion ? String(req.query.jurisdiccion) : undefined,
      tipologia: req.query.tipologia ? String(req.query.tipologia) : undefined,
      minScore: req.query.minScore ? parseInt(String(req.query.minScore)) : undefined,
      limit: req.query.limit ? parseInt(String(req.query.limit)) : 100,
    })
    res.json({ conflictos, graphAvailable: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})

grafoRouter.get('/expand/:nodeId(*)', async (req: Request, res: Response) => {
  if (!isGraphAvailable()) {
    return res.json({ nodes: [], edges: [], graphAvailable: false })
  }
  const nodeId = decodeURIComponent(String(req.params.nodeId ?? ''))
  if (!nodeId.includes(':')) return res.status(400).json({ error: 'nodeId inválido (esperado <tipo>:<clave>)' })
  try {
    const grafo = await expandirNodo(nodeId)
    res.json({ ...grafo, graphAvailable: true })
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
