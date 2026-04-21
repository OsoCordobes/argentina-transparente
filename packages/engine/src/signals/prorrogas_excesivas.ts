import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

const TIPOS_PRORROGA = ['PRÓRROGA', 'PRORROGA', 'COMPLEMENTARIOS', 'AMPLIACIÓN DE LA CONTRATACIÓN', 'AMPLIACION']

export const prorrogasExcesivas: SignalDetector = {
  id:          'prorrogas_excesivas',
  tipologia:   'prorrogas_excesivas',
  categoria:   'procedimiento',
  descripcion: 'Detecta contratos prorrogados reiteradamente sin nueva licitación (≥20% del gasto vía prórroga).',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 14 (licitación como principio general)',
      'Ley Nacional 13.064 art. 3 (licitación pública para obras)',
      'CP art. 265 (negociaciones incompatibles)',
    ],
    denunciar_ante: ORGANISMOS_DENUNCIA,
    tipologia_ti: 'No-competition procurement',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    if (contratos.length === 0) return []

    const prorrogas = contratos.filter(c =>
      TIPOS_PRORROGA.some(t => c.tipo.toUpperCase().includes(t) || c.descripcion?.toUpperCase().includes(t))
    )
    if (prorrogas.length === 0) return []

    const total = montoTotal(contratos)
    const monto = montoTotal(prorrogas)
    const pct   = (monto / total) * 100
    if (pct < 20) return []

    const porProv = agruparPorProveedor(prorrogas)
    const ranking = Array.from(porProv.entries())
      .map(([p, cs]) => ({ p, m: montoTotal(cs) }))
      .sort((a, b) => b.m - a.m)
      .slice(0, 5)

    return [makeHallazgo({
      señalId:    'prorrogas_excesivas',
      tipologia:  'prorrogas_excesivas',
      categoria:  'procedimiento',
      score:      Math.min(90, Math.round(55 + pct * 0.5)),
      titulo:     `${prorrogas.length} contratos prorrogados sin nueva licitación: ${ars(monto)} (${pct.toFixed(1)}% del gasto)`,
      resumen:    `Se detectaron ${prorrogas.length} contratos renovados por prórroga por un total de ${ars(monto)}, equivalente al ${pct.toFixed(1)}% del gasto analizado. Las prórrogas reiteradas evitan los mecanismos de competencia y permiten mantener proveedores sin someterlos a nueva evaluación de precios y calidad.`,
      severidad:  pct >= 40 ? 'grave' : 'moderada',
      evidencia:  ranking.map(r => ({
        descripcion: `${r.p}: ${ars(r.m)} vía prórroga`,
        fuente_url:  contratos[0].source_url,
      })),
      articulos:  [
        'Ley Provincial 8614 art. 14 (licitación como principio general)',
        'Ley de Contabilidad Pública art. 7',
      ],
      entidades: ranking.map(r => ({ tipo: 'Empresa' as const, id: r.p, nombre: r.p })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
