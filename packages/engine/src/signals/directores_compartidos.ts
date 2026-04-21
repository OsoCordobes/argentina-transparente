import type { SignalDetector } from '../types'
import { makeHallazgo, ars, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const directoresCompartidos: SignalDetector = {
  id:          'directores_compartidos',
  tipologia:   'directores_compartidos',
  categoria:   'concentracion',
  descripcion: 'Detecta directores que aparecen en ≥2 empresas proveedoras del municipio (posible cartel).',

  legalFramework: {
    articulos: [
      'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
      'Art. 210 Código Penal — asociación ilícita',
      'Art. 265 Código Penal — negociaciones incompatibles con la función pública',
      'Convenio OCDE — Directrices sobre colusión en compras públicas',
    ],
    denunciar_ante: [
      ...ORGANISMOS_DENUNCIA,
      'CNDC — Comisión Nacional de Defensa de la Competencia (cndc.gob.ar)',
      'Fiscalía Federal de Córdoba',
    ],
    tipologia_ti: 'Bid rigging',
  },

  async detect(ctx) {
    const resultados = await ctx.directoresCompartidos(2)
    if (resultados.length === 0) return []

    // resultados: { director, empresas[], contratos, monto_total }[]
    // Each entry = a director appearing in 2+ companies

    const total = resultados.reduce((s, r) => s + r.monto_total, 0)
    const sourceUrl = (await ctx.contratos())[0]?.source_url ?? ''

    return [makeHallazgo({
      señalId:    'directores_compartidos',
      tipologia:  'directores_compartidos',
      categoria:  'concentracion',
      score:      85,
      titulo:     `${resultados.length} director${resultados.length > 1 ? 'es' : ''} vincula${resultados.length === 1 ? '' : 'n'} múltiples proveedores del municipio`,
      resumen:    `Se identificaron ${resultados.length} persona${resultados.length > 1 ? 's' : ''} que figura${resultados.length === 1 ? '' : 'n'} como director${resultados.length > 1 ? 'es' : ''} en 2 o más empresas proveedoras del municipio. Proveedores que aparecen como competidores en licitaciones pero comparten directores en común indica posible cartel o empresas vinculadas presentadas como independientes. Monto total involucrado: ${ars(total)}.`,
      severidad:  'grave',
      evidencia:  resultados.slice(0, 5).map(r => ({
        descripcion: `${r.director}: director en ${r.empresas.join(', ')} — ${r.contratos} contratos, ${ars(r.monto_total)}`,
        fuente_url:  sourceUrl,
      })),
      articulos:  [
        'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
        'Art. 210 Código Penal — asociación ilícita',
        'Art. 265 Código Penal — negociaciones incompatibles con la función pública',
      ],
      entidades: resultados.slice(0, 5).flatMap(r =>
        r.empresas.map(e => ({ tipo: 'Empresa' as const, id: e, nombre: e }))
      ),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
