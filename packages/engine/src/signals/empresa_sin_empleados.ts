import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

const UMBRAL_MONTO = 10_000_000

export const empresaSinEmpleados: SignalDetector = {
  id:          'empresa_sin_empleados',
  tipologia:   'empresa_sin_empleados',
  categoria:   'concentracion',
  descripcion: 'Detecta proveedores sin empleados registrados (empleados_estimados === 0) que recibieron contratos >$10M.',

  legalFramework: {
    articulos: [
      'Art. 29 LCT — intermediación laboral ilícita',
      'Ley 24.769 art. 1 — evasión tributaria',
      'Art. 55 Ley 11.683 — responsabilidad solidaria del Estado contratante',
    ],
    denunciar_ante: [
      ...ORGANISMOS_DENUNCIA,
      'AFIP/ARCA — División Fiscalización (afip.gob.ar)',
      'Ministerio de Trabajo — Inspección del Trabajo',
    ],
    tipologia_ti: 'Shell company',
  },

  async detect(ctx) {
    const [contratos, empresas] = await Promise.all([ctx.contratos(), ctx.empresas()])
    if (empresas.length === 0) return []

    const porProv    = agruparPorProveedor(contratos)
    const empresaMap = new Map(empresas.map(e => [e.nombre_normalizado, e]))

    const sospechosos: { nombre: string; monto: number; sourceUrl: string }[] = []

    for (const [nombre, cs] of porProv.entries()) {
      const empresa = empresaMap.get(nombre)
      if (!empresa) continue
      // Only flag if we have explicit data and it's 0 — skip undefined
      if (empresa.empleados_estimados === undefined) continue
      if (empresa.empleados_estimados > 0) continue

      const monto = montoTotal(cs)
      if (monto < UMBRAL_MONTO) continue

      sospechosos.push({ nombre, monto, sourceUrl: cs[0].source_url })
    }

    if (sospechosos.length === 0) return []
    sospechosos.sort((a, b) => b.monto - a.monto)

    return [makeHallazgo({
      señalId:    'empresa_sin_empleados',
      tipologia:  'empresa_sin_empleados',
      categoria:  'concentracion',
      score:      72,
      titulo:     `${sospechosos.length} proveedor${sospechosos.length > 1 ? 'es' : ''} sin empleados registrados recibió contratos significativos`,
      resumen:    `Empresas que no registran empleados pero recibieron contratos de alto valor. Sin empleados registrados, la capacidad operativa real es cuestionable. Posible empresa pantalla o intermediaria. Caso principal: "${sospechosos[0].nombre}" recibió ${ars(sospechosos[0].monto)} sin personal registrado.`,
      severidad:  'grave',
      evidencia:  sospechosos.slice(0, 5).map(s => ({
        descripcion: `${s.nombre}: 0 empleados registrados — recibió ${ars(s.monto)} en contratos`,
        fuente_url:  s.sourceUrl,
      })),
      articulos:  [
        'Art. 29 LCT — intermediación laboral ilícita',
        'Ley 24.769 art. 1 — evasión tributaria',
        'Art. 55 Ley 11.683 — responsabilidad solidaria del Estado contratante',
      ],
      entidades:  sospechosos.slice(0, 5).map(s => ({
        tipo: 'Empresa' as const, id: s.nombre, nombre: s.nombre,
      })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
