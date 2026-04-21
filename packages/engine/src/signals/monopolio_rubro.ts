import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const monopolioRubro: SignalDetector = {
  id:          'monopolio_rubro',
  tipologia:   'monopolio_rubro',
  categoria:   'concentracion',
  descripcion: 'Detecta cuando un proveedor concentra ≥60% del gasto en un área específica.',

  legalFramework: {
    articulos: ['Ley Provincial 8614 art. 22 (principio de concurrencia)'],
    denunciar_ante: ORGANISMOS_DENUNCIA,
    tipologia_ti: 'Market allocation',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    const porArea   = new Map<string, typeof contratos>()

    for (const c of contratos) {
      if (!c.area) continue
      const k = c.area.trim().toUpperCase()
      if (!porArea.has(k)) porArea.set(k, [])
      porArea.get(k)!.push(c)
    }

    let mejor: { area: string; proveedor: string; pct: number; monto: number; total: number } | null = null

    for (const [area, cs] of porArea.entries()) {
      if (cs.length < 3) continue
      const totalArea = montoTotal(cs)
      if (totalArea < 1_000_000) continue

      for (const [prov, pcs] of agruparPorProveedor(cs).entries()) {
        const m   = montoTotal(pcs)
        const pct = (m / totalArea) * 100
        if (pct >= 60 && (!mejor || pct > mejor.pct))
          mejor = { area, proveedor: prov, pct, monto: m, total: totalArea }
      }
    }

    if (!mejor) return []

    return [makeHallazgo({
      señalId:    'monopolio_rubro',
      tipologia:  'monopolio_rubro',
      categoria:  'concentracion',
      score:      Math.min(85, Math.round(55 + mejor.pct * 0.3)),
      titulo:     `${mejor.proveedor} concentra el ${mejor.pct.toFixed(1)}% del gasto en "${mejor.area}"`,
      resumen:    `En el área "${mejor.area}", el proveedor "${mejor.proveedor}" recibió ${ars(mejor.monto)} de un total de ${ars(mejor.total)} (${mejor.pct.toFixed(1)}%). Una concentración superior al 60% en un área sugiere direccionamiento de contrataciones.`,
      severidad:  mejor.pct >= 80 ? 'grave' : 'moderada',
      evidencia:  [{ descripcion: `${mejor.proveedor}: ${ars(mejor.monto)} de ${ars(mejor.total)} en ${mejor.area}`, fuente_url: contratos[0].source_url }],
      articulos:  ['Ley Provincial 8614 art. 22 (principio de concurrencia)'],
      entidades:  [{ tipo: 'Empresa' as const, id: mejor.proveedor, nombre: mejor.proveedor }],
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
