import { Router, Request, Response } from 'express'

const router = Router()

// POST /analizar
router.post('/', async (req: Request, res: Response) => {
  // placeholder — implementación próxima sesión
  res.json({ ok: true, mensaje: 'en construcción' })
})

export default router
