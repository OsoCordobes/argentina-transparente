import type { SignalDetector } from '../types'
import { makeHallazgo, ars, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const redDeEmpresas: SignalDetector = {
  id:          'red_de_empresas',
  tipologia:   'red_de_empresas',
  categoria:   'concentracion',
  descripcion: 'Detecta pares de empresas proveedoras vinculadas por 2 o más directores en común (red empresarial oculta).',

  legalFramework: {
    articulos: [
      'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
      'Art. 33 Ley General de Sociedades — grupos empresarios vinculados',
      'Art. 210 Código Penal — asociación ilícita',
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

    // Build company-pair map: for each director appearing in ≥2 companies, we generate pairs
    const pares = new Map<string, { empresa1: string; empresa2: string; directores: string[] }>()

    for (const r of resultados) {
      if (r.empresas.length < 2) continue
      for (let i = 0; i < r.empresas.length; i++) {
        for (let j = i + 1; j < r.empresas.length; j++) {
          const [a, b] = [r.empresas[i], r.empresas[j]].sort()
          const key    = `${a}|||${b}`
          if (!pares.has(key)) pares.set(key, { empresa1: a, empresa2: b, directores: [] })
          pares.get(key)!.directores.push(r.director)
        }
      }
    }

    // Filter pairs with ≥2 shared directors
    const paresVinculados = Array.from(pares.values())
      .filter(p => p.directores.length >= 2)

    if (paresVinculados.length === 0) return []

    const sourceUrl = (await ctx.contratos())[0]?.source_url ?? ''

    return [makeHallazgo({
      señalId:    'red_de_empresas',
      tipologia:  'red_de_empresas',
      categoria:  'concentracion',
      score:      88,
      titulo:     `${paresVinculados.length} par${paresVinculados.length > 1 ? 'es' : ''} de proveedores vinculados por 2 o más directores en común`,
      resumen:    `Se identificaron ${paresVinculados.length} par${paresVinculados.length > 1 ? 'es' : ''} de empresas proveedoras del municipio que comparten 2 o más directores en sus órganos de administración. La vinculación directiva entre empresas que compiten en licitaciones o se complementan en contratos constituye un indicio de posible colusión o grupo económico no declarado que distorsiona la competencia.`,
      severidad:  'grave',
      evidencia:  paresVinculados.slice(0, 5).map(p => ({
        descripcion: `${p.empresa1} y ${p.empresa2} comparten ${p.directores.length} directores: ${p.directores.join(', ')}`,
        fuente_url:  sourceUrl,
      })),
      articulos:  [
        'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
        'Art. 33 Ley General de Sociedades — grupos empresarios vinculados',
        'Art. 210 Código Penal — asociación ilícita',
      ],
      entidades: paresVinculados.slice(0, 3).flatMap(p => [
        { tipo: 'Empresa' as const, id: p.empresa1, nombre: p.empresa1 },
        { tipo: 'Empresa' as const, id: p.empresa2, nombre: p.empresa2 },
      ]),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
