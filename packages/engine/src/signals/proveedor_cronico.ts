import type { SignalDetector } from '../types'
import { makeHallazgo, ars, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const proveedorCronico: SignalDetector = {
  id:          'proveedor_cronico',
  tipologia:   'proveedor_cronico',
  categoria:   'concentracion',
  descripcion: 'Detecta proveedores con presencia continua en ≥60% de los años analizados y gasto acumulado >$50M.',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 22 (principio de concurrencia)',
      'Principio de eficiencia en el gasto público',
    ],
    denunciar_ante: [
      'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
      'Concejo Deliberante de Córdoba — Comisión de Control',
    ],
    tipologia_ti: 'Sole-source abuse',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    if (contratos.length === 0) return []

    const años = [...new Set(contratos.map(c => c.anio))].sort()
    if (años.length < 2) return []

    // Build a map: proveedor → { anio → monto }
    const porProv = new Map<string, Map<number, number>>()
    for (const c of contratos) {
      const k = c.proveedor_normalizado || c.proveedor.trim().toUpperCase()
      if (!porProv.has(k)) porProv.set(k, new Map())
      const añoMap = porProv.get(k)!
      añoMap.set(c.anio, (añoMap.get(c.anio) ?? 0) + c.monto)
    }

    const cronicos: {
      proveedor:  string
      añosCount:  number
      montoTotal: number
      evolucion:  string
      sourceUrl:  string
    }[] = []

    const sourceUrl = contratos[0].source_url

    for (const [proveedor, añoMap] of porProv.entries()) {
      if (añoMap.size < Math.max(2, años.length * 0.6)) continue

      const total = Array.from(añoMap.values()).reduce((s, m) => s + m, 0)
      if (total < 50_000_000) continue

      const montosOrdenados = años.map(a => añoMap.get(a) ?? 0)
      const primero         = montosOrdenados.find(m => m > 0) ?? 0
      const ultimo          = [...montosOrdenados].reverse().find(m => m > 0) ?? 0
      const crecimiento     = primero > 0 ? ((ultimo - primero) / primero) * 100 : 0

      cronicos.push({
        proveedor,
        añosCount:  añoMap.size,
        montoTotal: total,
        evolucion:  crecimiento >= 0
          ? `creció ${crecimiento.toFixed(0)}% en el período`
          : `disminuyó ${Math.abs(crecimiento).toFixed(0)}% en el período`,
        sourceUrl,
      })
    }

    if (cronicos.length === 0) return []
    cronicos.sort((a, b) => b.montoTotal - a.montoTotal)

    const totalAcumulado = cronicos.reduce((s, c) => s + c.montoTotal, 0)

    return [makeHallazgo({
      señalId:    'proveedor_cronico',
      tipologia:  'proveedor_cronico',
      categoria:  'concentracion',
      score:      Math.min(70, 50 + cronicos.length * 4),
      titulo:     `${cronicos.length} proveedor/es con presencia continua en múltiples años por ${ars(totalAcumulado)} total`,
      resumen:    `Se identificaron ${cronicos.length} proveedor/es que mantienen presencia continua en las contrataciones municipales a lo largo de ${años.length} años analizados (${años[0]}–${años[años.length - 1]}). La permanencia prolongada sin procesos competitivos renovados puede indicar ausencia de mecanismos efectivos de competencia. Caso más significativo: "${cronicos[0].proveedor}" con presencia en ${cronicos[0].añosCount} años, ${cronicos[0].evolucion}, acumulando ${ars(cronicos[0].montoTotal)}.`,
      severidad:  'moderada',
      evidencia:  cronicos.slice(0, 4).map(c => ({
        descripcion: `${c.proveedor}: ${c.añosCount} años de presencia continua — ${ars(c.montoTotal)} acumulado — ${c.evolucion}`,
        fuente_url:  c.sourceUrl,
      })),
      articulos:  [
        'Ley Provincial 8614 art. 22 (principio de concurrencia)',
        'Principio de eficiencia en el gasto público',
      ],
      entidades:  cronicos.slice(0, 4).map(c => ({
        tipo: 'Empresa' as const, id: c.proveedor, nombre: c.proveedor,
      })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
