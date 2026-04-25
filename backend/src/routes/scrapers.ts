import { Router, Request, Response } from 'express'
import { getScrapersHealth } from '../lib/db'

const router = Router()

// GET /api/scrapers/health — estado de todos los scrapers conocidos
// Retorna la última ejecución de cada scraper: cuándo corrió, cuántos
// contratos extrajo, si falló. Útil para detectar scrapers rotos cuando
// el portal cambia su estructura HTML.
router.get('/health', async (_req: Request, res: Response) => {
  try {
    const runs = await getScrapersHealth()

    // Clasificar: ok / warning (sin datos) / error
    const withStatus = runs.map(r => ({
      ...r,
      status: !r.ok ? 'error' : (r.contratosCount === 0 ? 'warning' : 'ok'),
    }))

    const resumen = {
      total: runs.length,
      ok: withStatus.filter(r => r.status === 'ok').length,
      warning: withStatus.filter(r => r.status === 'warning').length,
      error: withStatus.filter(r => r.status === 'error').length,
    }

    res.json({ ok: true, resumen, scrapers: withStatus })
  } catch (err) {
    console.error('[scrapers/health] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
