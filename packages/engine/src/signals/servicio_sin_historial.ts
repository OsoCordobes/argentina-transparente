import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

const PALABRAS_SERVICIO = ['LIMPIEZA', 'SEGURIDAD', 'MANTENIMIENTO', 'VIGILANCIA', 'CONSTRUCCION', 'OBRA', 'PINTURA']
const UMBRAL_MONTO = 50_000_000

export const servicioSinHistorial: SignalDetector = {
  id:          'servicio_sin_historial',
  tipologia:   'servicio_sin_historial',
  categoria:   'concentracion',
  descripcion: 'Detecta proveedores de servicios intensivos con montos >$50M que solo aparecen en el dataset por ≤2 años.',

  legalFramework: {
    articulos: [
      'Ley Provincial 8614 art. 18 (habilitación de proveedores)',
      'RG AFIP 4871 (registro empleadores)',
    ],
    denunciar_ante: [
      'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
      'AFIP/ARCA — División Fiscalización',
    ],
    tipologia_ti: 'Shell company',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    const porProv   = agruparPorProveedor(contratos)

    const sospechosos: { proveedor: string; monto: number; descripcion: string; sourceUrl: string }[] = []

    for (const [proveedor, cs] of porProv.entries()) {
      const esServicio = cs.some(c =>
        PALABRAS_SERVICIO.some(p => (c.descripcion ?? '').toUpperCase().includes(p))
      )
      if (!esServicio) continue

      const monto = montoTotal(cs)
      if (monto < UMBRAL_MONTO) continue

      const años = new Set(cs.map(c => c.anio))
      if (años.size > 2) continue

      const principal = [...cs].sort((a, b) => b.monto - a.monto)[0]
      sospechosos.push({
        proveedor,
        monto,
        descripcion: principal.descripcion ?? '',
        sourceUrl:   principal.source_url,
      })
    }

    if (sospechosos.length === 0) return []

    sospechosos.sort((a, b) => b.monto - a.monto)
    const total = sospechosos.reduce((s, x) => s + x.monto, 0)

    return [makeHallazgo({
      señalId:    'servicio_sin_historial',
      tipologia:  'servicio_sin_historial',
      categoria:  'concentracion',
      score:      Math.min(75, 60 + sospechosos.length * 3),
      titulo:     `${sospechosos.length} proveedor/es de servicios sin historial previo: ${ars(total)} total`,
      resumen:    `Se identificaron ${sospechosos.length} proveedor/es que prestan servicios intensivos en mano de obra (limpieza, construcción, mantenimiento) por montos superiores a ${ars(UMBRAL_MONTO)}, pero solo aparecen en el dataset por un período acotado (≤2 años). El caso más significativo: "${sospechosos[0].proveedor}" por ${ars(sospechosos[0].monto)}.`,
      severidad:  'grave',
      evidencia:  sospechosos.slice(0, 4).map(s => ({
        descripcion: `${s.proveedor}: ${ars(s.monto)} — ${s.descripcion.slice(0, 70)}`,
        fuente_url:  s.sourceUrl,
      })),
      articulos:  [
        'Ley Provincial 8614 art. 18 (habilitación de proveedores)',
        'RG AFIP 4871 (registro empleadores)',
      ],
      denunciarAnte: [
        'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
        'AFIP/ARCA — División Fiscalización',
      ],
      entidades:  sospechosos.slice(0, 4).map(s => ({
        tipo: 'Empresa' as const, id: s.proveedor, nombre: s.proveedor,
      })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
