import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const contratacionesDirectas: SignalDetector = {
  id:          'contrataciones_directas',
  tipologia:   'contrataciones_directas',
  categoria:   'procedimiento',
  descripcion: 'Detecta exceso de contrataciones directas (≥5 contratos Y ≥8% del gasto).',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 18 (causales de excepción)',
      'Ley de Contabilidad Pública art. 7 inc. b',
      'CP art. 265 (negociaciones incompatibles)',
    ],
    denunciar_ante: ORGANISMOS_DENUNCIA,
    tipologia_ti: 'Non-competitive procurement',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    const directas  = contratos.filter(c => c.tipo === 'contratacion_directa')
    if (directas.length < 5) return []

    const total = montoTotal(contratos)
    const monto = montoTotal(directas)
    const pct   = (monto / total) * 100
    if (pct < 8 && directas.length < 15) return []

    const top5 = [...directas].sort((a, b) => b.monto - a.monto).slice(0, 5)

    return [makeHallazgo({
      señalId:    'contrataciones_directas',
      tipologia:  'contrataciones_directas',
      categoria:  'procedimiento',
      score:      Math.min(80, Math.round(40 + directas.length * 1.2 + pct * 0.4)),
      titulo:     `${directas.length} contrataciones directas por ${ars(monto)} sin proceso competitivo`,
      resumen:    `Se identificaron ${directas.length} contrataciones directas por ${ars(monto)} (${pct.toFixed(1)}% del gasto). La contratación directa es una excepción al principio de licitación pública y debe estar justificada por causales taxativas.`,
      severidad:  directas.length > 20 ? 'grave' : 'moderada',
      evidencia:  top5.map(c => ({
        descripcion: `${c.proveedor}: ${ars(c.monto)}${c.descripcion ? ' — ' + c.descripcion.slice(0, 80) : ''}`,
        fuente_url:  c.source_url,
      })),
      articulos:  ['Ley Provincial 8614 art. 18 (causales de excepción)', 'Ley de Contabilidad Pública art. 7 inc. b'],
      entidades:  top5.map(c => ({ tipo: 'Empresa' as const, id: c.proveedor_normalizado, nombre: c.proveedor })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
