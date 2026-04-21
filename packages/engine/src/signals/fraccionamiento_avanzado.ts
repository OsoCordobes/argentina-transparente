import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const fraccionamientoAvanzado: SignalDetector = {
  id:          'fraccionamiento_avanzado',
  tipologia:   'fraccionamiento_avanzado',
  categoria:   'procedimiento',
  descripcion: 'Detecta patrones de fraccionamiento contractual: ≥3 contratos directos/concurso de montos similares que acumulan >$20M.',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 14 (prohibición de fraccionamiento)',
      'Ordenanza Municipal de Contrataciones — art. correspondiente a umbrales',
    ],
    denunciar_ante: ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
    tipologia_ti: 'Contract splitting',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    const porProv   = agruparPorProveedor(contratos)

    const casos: {
      proveedor:  string
      cantidad:   number
      montoTotal: number
      montoMax:   number
      sourceUrl:  string
    }[] = []

    for (const [proveedor, cs] of porProv.entries()) {
      if (cs.length < 3) continue

      const concursos = cs.filter(c =>
        c.tipo === 'licitacion_privada' ||
        c.tipo === 'contratacion_directa'
      )
      if (concursos.length < 3) continue

      const total    = montoTotal(concursos)
      const montoMax = Math.max(...concursos.map(c => c.monto))

      if (total > 20_000_000 && montoMax < total * 0.4 && concursos.length >= 3) {
        casos.push({
          proveedor,
          cantidad:   concursos.length,
          montoTotal: total,
          montoMax,
          sourceUrl:  concursos[0].source_url,
        })
      }
    }

    if (casos.length === 0) return []
    casos.sort((a, b) => b.montoTotal - a.montoTotal)

    return [makeHallazgo({
      señalId:    'fraccionamiento_avanzado',
      tipologia:  'fraccionamiento_avanzado',
      categoria:  'procedimiento',
      score:      Math.min(80, 55 + casos.length * 5),
      titulo:     `Posible fraccionamiento en ${casos.length} proveedor/es: contratos múltiples de montos similares`,
      resumen:    `Se detectaron ${casos.length} proveedor/es con patrón consistente con fraccionamiento contractual: múltiples contratos de montos similares que individualmente no superan los umbrales de licitación, pero acumulados representan montos significativos. Caso principal: "${casos[0].proveedor}" con ${casos[0].cantidad} contratos por ${ars(casos[0].montoTotal)} total (máximo individual: ${ars(casos[0].montoMax)}).`,
      severidad:  'moderada',
      evidencia:  casos.slice(0, 3).map(c => ({
        descripcion: `${c.proveedor}: ${c.cantidad} contratos × ${ars(c.montoTotal / c.cantidad)} promedio = ${ars(c.montoTotal)} total`,
        fuente_url:  c.sourceUrl,
      })),
      articulos:  [
        'Ley Provincial 8614 art. 14 (prohibición de fraccionamiento)',
        'Ordenanza Municipal de Contrataciones — art. correspondiente a umbrales',
      ],
      denunciarAnte: ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
      entidades:  casos.slice(0, 3).map(c => ({
        tipo: 'Empresa' as const, id: c.proveedor, nombre: c.proveedor,
      })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
