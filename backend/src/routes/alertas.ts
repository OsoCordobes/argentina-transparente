import { Router, Request, Response } from 'express'
import {
  getAlertas, marcarAlertaLeida, marcarTodasLeidas, countAlertasNoLeidas,
} from '../lib/db'
import { detectarAlertas } from '../lib/alertas'

const router = Router()

// GET /api/alertas?soloNoLeidas=true&limit=50
router.get('/', async (req: Request, res: Response) => {
  try {
    const soloNoLeidas = req.query.soloNoLeidas === 'true'
    const limit = parseInt(String(req.query.limit ?? '100'))
    const [alertas, count] = await Promise.all([
      getAlertas({ soloNoLeidas, limit }),
      countAlertasNoLeidas(),
    ])
    res.json({ ok: true, count, alertas })
  } catch (err) {
    console.error('[alertas] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// GET /api/alertas/count — endpoint liviano para badges en frontend
router.get('/count', async (_req: Request, res: Response) => {
  try {
    const count = await countAlertasNoLeidas()
    res.json({ ok: true, ...count })
  } catch (err) {
    console.error('[alertas/count] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// POST /api/alertas/:id/leer — marcar una alerta como leída
router.post('/:id/leer', async (req: Request, res: Response) => {
  try {
    await marcarAlertaLeida(req.params.id)
    res.json({ ok: true })
  } catch (err) {
    console.error('[alertas/leer] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// POST /api/alertas/leer-todas — marcar todas como leídas
router.post('/leer-todas', async (_req: Request, res: Response) => {
  try {
    const marcadas = await marcarTodasLeidas()
    res.json({ ok: true, marcadas })
  } catch (err) {
    console.error('[alertas/leer-todas] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// POST /api/alertas/detectar — disparar detección manual (alternativa al cron)
router.post('/detectar', async (_req: Request, res: Response) => {
  try {
    const resultado = await detectarAlertas()
    res.json({ ok: true, ...resultado })
  } catch (err) {
    console.error('[alertas/detectar] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
