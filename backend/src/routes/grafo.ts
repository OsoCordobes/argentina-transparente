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
import { getGrafoNucleo, expandirNodo, isGraphAvailable } from '../lib/graph'

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
