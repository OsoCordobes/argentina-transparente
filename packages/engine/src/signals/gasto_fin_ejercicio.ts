import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

const TIPOS_FIN_ANIO = ['PRÓRROGA', 'PRORROGA', 'COMPLEMENTARIOS', 'AMPLIACIÓN']

export const gastoFinEjercicio: SignalDetector = {
  id:          'gasto_fin_ejercicio',
  tipologia:   'gasto_fin_ejercicio',
  categoria:   'procedimiento',
  descripcion: 'Detecta patrones de gasto de fin de ejercicio: ≥30% del gasto vía prórroga/ampliación en un año único.',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 14 (principio de licitación)',
      'Ley de Administración Financiera — cierre de ejercicio',
    ],
    denunciar_ante: ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
    tipologia_ti: 'No-competition procurement',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    if (contratos.length === 0) return []

    // Only meaningful for single-year analysis
    const años = new Set(contratos.map(c => c.anio))
    if (años.size !== 1) return []

    const contratosFinAnio = contratos.filter(c =>
      TIPOS_FIN_ANIO.some(t => c.tipo.toUpperCase().includes(t))
    )

    const total       = montoTotal(contratos)
    const montoFin    = montoTotal(contratosFinAnio)
    const pct         = (montoFin / total) * 100

    const ampliaciones = contratos.filter(c =>
      c.tipo.toUpperCase().includes('AMPLIACI') ||
      c.tipo.toUpperCase().includes('COMPLEMENT')
    )

    if (pct < 30 && ampliaciones.length < 3) return []

    return [makeHallazgo({
      señalId:    'gasto_fin_ejercicio',
      tipologia:  'gasto_fin_ejercicio',
      categoria:  'procedimiento',
      score:      Math.min(70, Math.round(45 + pct * 0.4)),
      titulo:     `${pct.toFixed(1)}% del gasto vía prórrogas y ampliaciones — patrón de cierre de ejercicio`,
      resumen:    `El ${pct.toFixed(1)}% del gasto analizado (${ars(montoFin)}) se realizó a través de prórrogas y ampliaciones de contratos existentes. Este patrón es consistente con el "gasto de fin de ejercicio", práctica donde los fondos presupuestarios no ejecutados se comprometen en contratos de urgencia o ampliaciones antes del cierre del año fiscal, eludiendo procesos competitivos.`,
      severidad:  pct >= 40 ? 'grave' : 'moderada',
      evidencia:  [{
        descripcion: `${contratosFinAnio.length} contratos vía prórroga/ampliación: ${ars(montoFin)} de ${ars(total)} total`,
        fuente_url:  contratos[0].source_url,
      }],
      articulos:  [
        'Ley Provincial 8614 art. 14 (principio de licitación)',
        'Ley de Administración Financiera — cierre de ejercicio',
      ],
      denunciarAnte: ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
