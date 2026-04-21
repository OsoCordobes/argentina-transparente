import { Router, Request, Response } from 'express'
import {
  searchEntidades, getContratosPorProveedor, dbAll,
} from '../lib/db'

const router = Router()

// GET /api/entidad/search?q=ROGGIO — search entities by name
router.get('/search', async (req: Request, res: Response) => {
  const q = String(req.query.q ?? '').trim()
  if (q.length < 2) {
    return res.status(400).json({ ok: false, error: 'Query debe tener al menos 2 caracteres' })
  }

  try {
    const entidades = await searchEntidades(q, 30)
    res.json({ ok: true, entidades })
  } catch (err) {
    console.error('[entidad/search] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

// GET /api/entidad/:nombre — full profile for a provider
router.get('/:nombre', async (req: Request, res: Response) => {
  const nombre = decodeURIComponent(req.params.nombre).toUpperCase()

  try {
    const contratos = await getContratosPorProveedor(nombre)
    if (contratos.length === 0) {
      return res.status(404).json({ ok: false, error: 'Entidad no encontrada' })
    }

    const montoTotal = contratos.reduce((s, c) => s + c.monto, 0)
    const anios = [...new Set(contratos.map(c => c.anio))].sort()
    const municipios = [...new Set(contratos.map(c => c.municipio))]
    const areas = [...new Set(contratos.map(c => c.area))]

    // Distribution by year
    const porAnio = new Map<number, { cantidad: number; monto: number }>()
    for (const c of contratos) {
      const prev = porAnio.get(c.anio) ?? { cantidad: 0, monto: 0 }
      porAnio.set(c.anio, { cantidad: prev.cantidad + 1, monto: prev.monto + c.monto })
    }
    const timeline = Array.from(porAnio.entries())
      .map(([anio, data]) => ({ anio, ...data }))
      .sort((a, b) => a.anio - b.anio)

    // Distribution by tipo
    const porTipo = new Map<string, { cantidad: number; monto: number }>()
    for (const c of contratos) {
      const prev = porTipo.get(c.tipo) ?? { cantidad: 0, monto: 0 }
      porTipo.set(c.tipo, { cantidad: prev.cantidad + 1, monto: prev.monto + c.monto })
    }
    const tipos = Array.from(porTipo.entries())
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.monto - a.monto)

    // Check if we have AFIP data
    const empresaRows = await dbAll<any>(
      `SELECT * FROM empresas WHERE UPPER(nombre) = ? LIMIT 1`, [nombre]
    )
    const afip = empresaRows[0] ? {
      cuit: empresaRows[0].cuit,
      esEmpleador: empresaRows[0].es_empleador,
      inicioActividades: empresaRows[0].inicio_actividades,
      estado: empresaRows[0].estado,
      actividadPrincipal: empresaRows[0].actividad_principal,
    } : null

    res.json({
      ok: true,
      entidad: {
        nombre,
        montoTotal,
        totalContratos: contratos.length,
        anios,
        municipios,
        areas,
        afip,
        timeline,
        tipos,
        contratos: contratos.slice(0, 100), // limit for response size
      },
    })
  } catch (err) {
    console.error('[entidad] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
