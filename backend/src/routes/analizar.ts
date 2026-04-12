import { Router, Request, Response } from 'express'
import { getConnector } from '../connectors/interface'
import { calcularSeñales } from '../engine/signals'
import { generarExpediente } from '../lib/claude'
import { insertReporte } from '../lib/db'

const router = Router()

router.post('/', async (req: Request, res: Response) => {
  const { municipioId, anioDesde, anioHasta } = req.body

  if (!municipioId || typeof municipioId !== 'string')
    return res.status(400).json({ ok: false, error: 'municipioId requerido' })
  if (!anioDesde || !anioHasta)
    return res.status(400).json({ ok: false, error: 'anioDesde y anioHasta requeridos' })

  const desde = parseInt(String(anioDesde))
  const hasta = parseInt(String(anioHasta))
  const anioActual = new Date().getFullYear()

  if (isNaN(desde) || isNaN(hasta))
    return res.status(400).json({ ok: false, error: 'anioDesde y anioHasta deben ser números' })
  if (desde < 2005 || hasta > anioActual)
    return res.status(400).json({ ok: false, error: `Rango válido: 2005–${anioActual}` })
  if (hasta < desde)
    return res.status(400).json({ ok: false, error: 'anioHasta debe ser >= anioDesde' })
  if (hasta - desde > 5)
    return res.status(400).json({ ok: false, error: 'Rango máximo: 5 años por análisis' })

  let connector
  try {
    connector = getConnector(municipioId)
  } catch (err) {
    return res.status(400).json({ ok: false, error: String(err) })
  }

  try {
    console.log(`[analizar] ${municipioId} ${desde}–${hasta}`)
    const contratos = await connector.getContratos(desde, hasta)

    if (contratos.length === 0)
      return res.status(404).json({
        ok: false,
        error: `Sin datos disponibles para ${municipioId} en ${desde}–${hasta}. El portal publica con aproximadamente 1 año de retraso.`,
      })

    const señales = calcularSeñales(contratos)
    const expediente = await generarExpediente(
      connector.nombre, desde, hasta, contratos, señales
    )

    const reporteId = await insertReporte(expediente, municipioId, desde, hasta)

    return res.json({ ok: true, id: reporteId, expediente })
  } catch (err) {
    console.error('[analizar] Error:', err)
    return res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
