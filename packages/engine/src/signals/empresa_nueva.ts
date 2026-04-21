import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, agruparPorProveedor, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

const UMBRAL_MONTO = 5_000_000

export const empresaNueva: SignalDetector = {
  id:          'empresa_nueva',
  tipologia:   'empresa_nueva',
  categoria:   'concentracion',
  descripcion: 'Detecta proveedores cuya fecha de constitución precede en ≤1 año a su primer contrato y recibieron >$5M.',

  legalFramework: {
    articulos: [
      'Art. 11 Decreto 1023/2001 — capacidad para contratar con el Estado',
      'Res. 1169/2016 — Registro de Proveedores del Estado',
    ],
    denunciar_ante: ORGANISMOS_DENUNCIA,
    tipologia_ti: 'Shell company',
  },

  async detect(ctx) {
    const [contratos, empresas] = await Promise.all([ctx.contratos(), ctx.empresas()])
    if (empresas.length === 0) return []

    const porProv    = agruparPorProveedor(contratos)
    const empresaMap = new Map(empresas.map(e => [e.nombre_normalizado, e]))

    const sospechosos: {
      nombre:           string
      fechaConst:       Date
      primerAnio:       number
      monto:            number
      sourceUrl:        string
    }[] = []

    for (const [nombre, cs] of porProv.entries()) {
      const empresa = empresaMap.get(nombre)
      if (!empresa?.fecha_constitucion) continue

      const primerAnio = Math.min(...cs.map(c => c.anio))
      const monto      = montoTotal(cs)
      const anioConst  = empresa.fecha_constitucion.getFullYear()

      // Empresa constituida ≤1 año antes de su primer contrato con el municipio
      if (primerAnio - anioConst <= 1 && monto >= UMBRAL_MONTO) {
        sospechosos.push({
          nombre,
          fechaConst: empresa.fecha_constitucion,
          primerAnio,
          monto,
          sourceUrl:  cs[0].source_url,
        })
      }
    }

    if (sospechosos.length === 0) return []
    sospechosos.sort((a, b) => b.monto - a.monto)

    return [makeHallazgo({
      señalId:    'empresa_nueva',
      tipologia:  'empresa_nueva',
      categoria:  'concentracion',
      score:      65,
      titulo:     `${sospechosos.length} proveedor${sospechosos.length > 1 ? 'es' : ''} con actividad reciente al momento del primer contrato`,
      resumen:    `Proveedores cuya fecha de constitución es igual o anterior en 1 año a su primer contrato con el municipio, y recibieron montos significativos. Posible habilitación ad hoc para capturar contratos. Caso principal: "${sospechosos[0].nombre}" — constituida en ${sospechosos[0].fechaConst.getFullYear()}, primer contrato en ${sospechosos[0].primerAnio}, total recibido ${ars(sospechosos[0].monto)}.`,
      severidad:  'moderada',
      evidencia:  sospechosos.slice(0, 5).map(s => ({
        descripcion: `${s.nombre}: constituida ${s.fechaConst.getFullYear()}, primer contrato ${s.primerAnio}, total ${ars(s.monto)}`,
        fuente_url:  s.sourceUrl,
      })),
      articulos:  [
        'Art. 11 Decreto 1023/2001 — capacidad para contratar con el Estado',
        'Res. 1169/2016 — Registro de Proveedores del Estado',
      ],
      entidades:  sospechosos.slice(0, 5).map(s => ({
        tipo: 'Empresa' as const, id: s.nombre, nombre: s.nombre,
      })),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
