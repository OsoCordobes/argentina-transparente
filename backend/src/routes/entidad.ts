import { Router, Request, Response } from 'express'
import {
  searchEntidades, getContratosPorProveedor, getSeñalesPorCuit,
  dbAll, type EntidadContrato, type SeñalCacheRow,
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

function mapContrato(c: EntidadContrato & {
  metodo_extraccion?: string
  nivel_confianza?: string
  cargado_en?: string
}) {
  return {
    hash: c.hash,
    tipo: c.tipo,
    proveedor: c.proveedor,
    area: c.area,
    descripcion: c.descripcion,
    monto: c.monto,
    anio: c.anio,
    municipio: c.municipio,
    fuenteUrl: c.fuente_url,
    metodoExtraccion: c.metodo_extraccion ?? 'desconocido',
    nivelConfianza: c.nivel_confianza ?? 'medio',
    cargadoEn: c.cargado_en,
  }
}

function mapSeñal(s: SeñalCacheRow) {
  return {
    id: s.id,
    municipio: s.municipio,
    tipologia: s.tipologia,
    titulo: s.titulo,
    resumen: s.resumen,
    score: s.score,
    severidad: s.severidad,
    evidencia: JSON.parse(s.evidencia_json),
    legal: JSON.parse(s.legal_json),
    cuits: s.entidades_cuit ? (JSON.parse(s.entidades_cuit) as string[]) : [],
    computadoEn: s.computado_en,
  }
}

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

    // Top área (por monto) — para KPI "Área principal" del panel
    const porArea = new Map<string, number>()
    for (const c of contratos) {
      porArea.set(c.area, (porArea.get(c.area) ?? 0) + c.monto)
    }
    const topAreaEntry = [...porArea.entries()].sort((a, b) => b[1] - a[1])[0]
    const topArea = topAreaEntry
      ? { area: topAreaEntry[0], monto: topAreaEntry[1], pct: (topAreaEntry[1] / montoTotal) * 100 }
      : null

    // Trazabilidad: fecha del dato más reciente y método de extracción dominante
    const fechaActualizacion = contratos
      .map(c => c.cargado_en).filter((s): s is string => !!s)
      .sort().pop() ?? null
    const metodosCount = new Map<string, number>()
    for (const c of contratos) {
      const k = c.metodo_extraccion ?? 'desconocido'
      metodosCount.set(k, (metodosCount.get(k) ?? 0) + 1)
    }
    const metodoDominante = [...metodosCount.entries()]
      .sort((a, b) => b[1] - a[1])[0]?.[0] ?? 'desconocido'

    // Distribution by tipo
    const porTipo = new Map<string, { cantidad: number; monto: number }>()
    for (const c of contratos) {
      const prev = porTipo.get(c.tipo) ?? { cantidad: 0, monto: 0 }
      porTipo.set(c.tipo, { cantidad: prev.cantidad + 1, monto: prev.monto + c.monto })
    }
    const tipos = Array.from(porTipo.entries())
      .map(([tipo, data]) => ({ tipo, ...data }))
      .sort((a, b) => b.monto - a.monto)

    // AFIP enrichment
    const empresaRows = await dbAll<{
      cuit: string
      nombre: string
      es_empleador: boolean
      inicio_actividades: string | null
      estado: string | null
      actividad_principal: string | null
    }>(`SELECT * FROM empresas WHERE UPPER(nombre) = ? LIMIT 1`, [nombre])
    const afip = empresaRows[0] ? {
      cuit: empresaRows[0].cuit,
      esEmpleador: empresaRows[0].es_empleador,
      inicioActividades: empresaRows[0].inicio_actividades,
      estado: empresaRows[0].estado,
      actividadPrincipal: empresaRows[0].actividad_principal,
    } : null

    // Señales asociadas vía entidades_cuit (Sprint 2)
    const señales = afip?.cuit
      ? (await getSeñalesPorCuit(afip.cuit)).map(mapSeñal)
      : []

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
        topArea,
        fechaActualizacion,
        metodoDominante,
        // Top 500 contratos por monto (suficiente para cualquier proveedor
        // real y permite filtros año/área client-side sin perder datos).
        contratos: contratos
          .slice()
          .sort((a, b) => b.monto - a.monto)
          .slice(0, 500)
          .map(mapContrato),
        señales,
      },
    })
  } catch (err) {
    console.error('[entidad] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
