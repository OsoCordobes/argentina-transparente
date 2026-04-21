import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const concentracionProveedor: SignalDetector = {
  id:          'concentracion_proveedor',
  tipologia:   'concentracion_proveedor',
  categoria:   'concentracion',
  descripcion: 'Detecta cuando un único proveedor concentra ≥35% del gasto total.',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 22 (principio de concurrencia)',
      'Decreto 1338/2016',
      'CP art. 265 (negociaciones incompatibles)',
    ],
    denunciar_ante: ORGANISMOS_DENUNCIA,
    tipologia_ti: 'Sole-source abuse',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    const total     = montoTotal(contratos)
    if (total === 0) return []

    const porProv = agruparPorProveedor(contratos)
    const ranking = Array.from(porProv.entries())
      .map(([p, cs]) => ({ p, m: montoTotal(cs), n: cs.length }))
      .sort((a, b) => b.m - a.m)

    const top = ranking[0]
    if (!top) return []
    const pct = (top.m / total) * 100
    if (pct < 35) return []

    return [makeHallazgo({
      señalId:    'concentracion_proveedor',
      tipologia:  'concentracion_proveedor',
      categoria:  'concentracion',
      score:      Math.min(95, Math.round(50 + pct)),
      titulo:     `Concentración extrema: ${top.p} recibe el ${pct.toFixed(1)}% del gasto`,
      resumen:    `El proveedor "${top.p}" concentra ${ars(top.m)} (${pct.toFixed(1)}% del gasto total de ${ars(total)}) en ${top.n} contrato/s. Una concentración superior al 35% en un solo proveedor contradice los principios de concurrencia establecidos en la normativa.`,
      severidad:  pct >= 60 ? 'grave' : 'moderada',
      evidencia:  [{ descripcion: `${top.p}: ${ars(top.m)} (${pct.toFixed(1)}% del total)`, fuente_url: contratos[0].source_url }],
      articulos:  ['Ley Provincial 8614 art. 22 (principio de concurrencia)', 'Decreto 1338/2016'],
      entidades:  [{ tipo: 'Empresa', id: top.p, nombre: top.p }],
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
