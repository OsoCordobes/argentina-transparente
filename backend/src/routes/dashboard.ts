import { Router, Request, Response } from 'express'
import {
  getDashboardMunicipios, getTopEntidades, getSeñalesCache,
  getContratosCount, getSeñalesCacheCount,
} from '../lib/db'

const router = Router()

// GET /api/dashboard — overview for the main page
router.get('/', async (_req: Request, res: Response) => {
  try {
    const [municipios, topEntidades, señales, totalContratos, totalSeñales] = await Promise.all([
      getDashboardMunicipios(),
      getTopEntidades(15),
      getSeñalesCache(),
      getContratosCount(),
      getSeñalesCacheCount(),
    ])

    res.json({
      ok: true,
      totalContratos,
      totalSeñales,
      municipios,
      topEntidades,
      señales: señales.map(s => ({
        id: s.id,
        municipio: s.municipio,
        tipologia: s.tipologia,
        titulo: s.titulo,
        resumen: s.resumen,
        score: s.score,
        severidad: s.severidad,
        evidencia: JSON.parse(s.evidencia_json),
        legal: JSON.parse(s.legal_json),
        computadoEn: s.computado_en,
      })),
    })
  } catch (err) {
    console.error('[dashboard] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
