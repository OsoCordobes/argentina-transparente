import { Router, Request, Response } from 'express'
import {
  getContratoPorHash, getSeñalesPorCuit, dbAll,
  type SeñalCacheRow,
} from '../lib/db'

const router = Router()

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

// GET /api/contrato/:hash — ficha individual de contrato (cadena de custodia)
router.get('/:hash', async (req: Request, res: Response) => {
  const hash = String(req.params.hash).trim()
  if (!hash || hash.length < 8) {
    return res.status(400).json({ ok: false, error: 'Hash inválido' })
  }

  try {
    const contrato = await getContratoPorHash(hash)
    if (!contrato) {
      return res.status(404).json({ ok: false, error: 'Contrato no encontrado' })
    }

    // AFIP del proveedor (best-effort)
    const empresaRows = await dbAll<{
      cuit: string
      nombre: string
      es_empleador: boolean
      inicio_actividades: string | null
      estado: string | null
      actividad_principal: string | null
    }>(`SELECT * FROM empresas WHERE UPPER(nombre) = ? LIMIT 1`, [
      contrato.proveedor.trim().toUpperCase(),
    ])

    const afip = empresaRows[0] ? {
      cuit: empresaRows[0].cuit,
      esEmpleador: empresaRows[0].es_empleador,
      inicioActividades: empresaRows[0].inicio_actividades,
      estado: empresaRows[0].estado,
      actividadPrincipal: empresaRows[0].actividad_principal,
    } : null

    // Señales asociadas al CUIT del proveedor
    const señales = afip?.cuit
      ? (await getSeñalesPorCuit(afip.cuit)).map(mapSeñal)
      : []

    res.json({
      ok: true,
      contrato: {
        hash: contrato.hash,
        tipo: contrato.tipo,
        proveedor: contrato.proveedor,
        area: contrato.area,
        descripcion: contrato.descripcion,
        monto: contrato.monto,
        anio: contrato.anio,
        municipio: contrato.municipio,
        fuenteUrl: contrato.fuente_url,
      },
      afip,
      señales,
      cadenaCustodia: {
        // Stub: estos campos se cementarán cuando Sprint 4 agregue fuentes_datos
        // table con metadata trazable. Por ahora devolvemos lo verificable hoy.
        fuenteUrl: contrato.fuente_url,
        hashContrato: contrato.hash,
      },
    })
  } catch (err) {
    console.error('[contrato] Error:', err)
    res.status(500).json({ ok: false, error: String(err) })
  }
})

export default router
