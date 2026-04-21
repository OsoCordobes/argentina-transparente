import type { SignalDetector } from '../types'
import { makeHallazgo, ars, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

const TIPOS_BASE   = ['licitacion_publica', 'licitacion_privada', 'contratacion_directa']
const TIPOS_ADENDA = ['adenda']
// Also match by tipo string for legacy data
const ADENDA_STRINGS = ['AMPLIACI', 'COMPLEMENTARIO', 'ADICIONAL']

export const adendaPostajudicacion: SignalDetector = {
  id:          'adenda_postajudicacion',
  tipologia:   'adenda_postajudicacion',
  categoria:   'procedimiento',
  descripcion: 'Detecta contratos cuyas ampliaciones/adendas post-adjudicación superan el 50% del valor base.',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 14 (prohibición de adendas que desnaturalizan el proceso)',
      'Art. 72 Decreto 1023/2001 — modificaciones al contrato original',
      'Principio de equivalencia de la oferta original',
    ],
    denunciar_ante: ORGANISMOS_DENUNCIA,
    tipologia_ti: 'Non-competitive procurement',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    if (contratos.length === 0) return []

    // Group by (proveedor_normalizado, area, anio)
    const grupos = new Map<string, {
      base:    typeof contratos
      adendas: typeof contratos
    }>()

    for (const c of contratos) {
      const prov  = c.proveedor_normalizado || c.proveedor.trim().toUpperCase()
      const area  = (c.area ?? '').trim().toUpperCase()
      const key   = `${prov}|||${area}|||${c.anio}`
      if (!grupos.has(key)) grupos.set(key, { base: [], adendas: [] })
      const g = grupos.get(key)!

      const tipoStr = c.tipo.toUpperCase()
      if (TIPOS_BASE.includes(c.tipo)) {
        g.base.push(c)
      } else if (
        TIPOS_ADENDA.includes(c.tipo) ||
        ADENDA_STRINGS.some(t => tipoStr.includes(t))
      ) {
        g.adendas.push(c)
      }
    }

    const hallazgos: {
      proveedor:   string
      area:        string
      anio:        number
      montoBase:   number
      montoAdenda: number
      pct:         number
      sourceUrl:   string
    }[] = []

    for (const [key, g] of grupos.entries()) {
      if (g.base.length === 0 || g.adendas.length === 0) continue
      const montoBase   = g.base.reduce((s, c) => s + c.monto, 0)
      const montoAdenda = g.adendas.reduce((s, c) => s + c.monto, 0)
      const pct         = (montoAdenda / montoBase) * 100
      if (pct < 50 || montoBase < 5_000_000) continue

      const [proveedor, area, anioStr] = key.split('|||')
      hallazgos.push({
        proveedor, area,
        anio:        parseInt(anioStr),
        montoBase, montoAdenda, pct,
        sourceUrl:   g.base[0].source_url,
      })
    }

    if (hallazgos.length === 0) return []
    hallazgos.sort((a, b) => b.pct - a.pct)

    const top = hallazgos[0]

    return [makeHallazgo({
      señalId:    'adenda_postajudicacion',
      tipologia:  'adenda_postajudicacion',
      categoria:  'procedimiento',
      score:      Math.min(75, 55 + hallazgos.length * 4),
      titulo:     `${hallazgos.length} contrato${hallazgos.length > 1 ? 's' : ''} con ampliaciones post-adjudicación superiores al 50% del valor original`,
      resumen:    `Se detectaron ${hallazgos.length} caso${hallazgos.length > 1 ? 's' : ''} donde el monto total de ampliaciones o complementarios supera el 50% del contrato base. Caso principal: "${top.proveedor}" en "${top.area}" (${top.anio}): contrato base ${ars(top.montoBase)}, ampliado ${ars(top.montoAdenda)} (${top.pct.toFixed(0)}% de incremento). Las adendas masivas post-adjudicación permiten obtener contratos con precios artificialmente bajos y luego incrementarlos sin nuevo proceso competitivo.`,
      severidad:  top.pct >= 100 ? 'grave' : 'moderada',
      evidencia:  hallazgos.slice(0, 4).map(h => ({
        descripcion: `${h.proveedor} (${h.anio}): base ${ars(h.montoBase)} → ampliado +${ars(h.montoAdenda)} (${h.pct.toFixed(0)}%)`,
        fuente_url:  h.sourceUrl,
      })),
      articulos:  [
        'Ley Provincial 8614 art. 14 (prohibición de adendas que desnaturalizan el proceso)',
        'Art. 72 Decreto 1023/2001 — modificaciones al contrato original',
      ],
      entidades:  hallazgos.slice(0, 4).map(h => ({
        tipo: 'Empresa' as const, id: h.proveedor, nombre: h.proveedor,
      })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
