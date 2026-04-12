import { Router } from 'express'
import { getHistorial } from '../lib/db'

const router = Router()

router.get('/', async (_req, res) => {
  try {
    const historial = await getHistorial(20)
    res.json(historial)
  } catch (err) {
    console.error('[historial] Error:', err)
    res.status(500).json({ error: String(err) })
  }
})

export default router
