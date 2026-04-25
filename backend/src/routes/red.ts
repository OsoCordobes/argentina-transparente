import { Router, Request, Response } from 'express'
import { getRedCytoscape, isGraphAvailable } from '../lib/graph'

const router = Router()

// GET /api/red/:municipio — grafo Cytoscape de empresas vinculadas por directores
router.get('/:municipio', async (req: Request, res: Response) => {
  const municipio = String(req.params.municipio).trim()
  if (!municipio) {
    return res.status(400).json({ ok: false, error: 'Municipio requerido' })
  }

  if (!isGraphAvailable()) {
    return res.status(503).json({
      ok: false,
      error: 'Neo4j no disponible — la vista de red requiere el grafo cargado',
      reintentar: false,
    })
  }

  try {
    const elements = await getRedCytoscape(municipio)
    res.json({
      ok: true,
      municipio,
      elements,
      stats: {
        nodes: elements.nodes.length,
        edges: elements.edges.length,
      },
    })
  } catch (err) {
    console.error('[red] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
