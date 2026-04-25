import { Router, Request, Response } from 'express'
import { searchOpenSanctions, matchOpenSanctions, esRiesgoAlto } from '../lib/opensanctions'
import { listarFuentes } from '../lib/db'

const router = Router()

// GET /api/cruce/fuentes — listar fuentes registradas (transparencia de
// procedencia para mostrar en el dashboard)
router.get('/fuentes', async (_req: Request, res: Response) => {
  try {
    const fuentes = await listarFuentes()
    res.json({ ok: true, fuentes })
  } catch (err) {
    console.error('[cruce/fuentes] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// GET /api/cruce/persona?nombre=... — busca a esta persona en datasets
// internacionales (OpenSanctions: sanciones, PEPs, ICIJ Offshore Leaks)
router.get('/persona', async (req: Request, res: Response) => {
  const nombre = String(req.query.nombre ?? '').trim()
  if (nombre.length < 3) {
    return res.status(400).json({ ok: false, error: 'Nombre mínimo 3 caracteres' })
  }

  try {
    const results = await searchOpenSanctions(nombre, { schema: 'Person', limit: 5 })
    res.json({
      ok: true,
      query: nombre,
      results: results.map((r) => ({
        id: r.id,
        caption: r.caption,
        schema: r.schema,
        datasets: r.datasets,
        topics: r.topics ?? [],
        countries: r.countries ?? [],
        score: r.score,
        riesgo: esRiesgoAlto(r),
      })),
    })
  } catch (err) {
    console.error('[cruce/persona] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// GET /api/cruce/empresa?nombre=...&pais=AR — match estructurado de empresa
router.get('/empresa', async (req: Request, res: Response) => {
  const nombre = String(req.query.nombre ?? '').trim()
  const pais = String(req.query.pais ?? 'AR').trim()
  if (nombre.length < 3) {
    return res.status(400).json({ ok: false, error: 'Nombre mínimo 3 caracteres' })
  }

  try {
    const results = await matchOpenSanctions({
      schema: 'Company',
      name: nombre,
      country: pais,
    })
    res.json({
      ok: true,
      query: { nombre, pais },
      results: results.map((r) => ({
        id: r.id,
        caption: r.caption,
        schema: r.schema,
        datasets: r.datasets,
        topics: r.topics ?? [],
        countries: r.countries ?? [],
        score: r.score,
        riesgo: esRiesgoAlto(r),
      })),
    })
  } catch (err) {
    console.error('[cruce/empresa] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
