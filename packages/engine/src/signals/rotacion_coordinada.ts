import type { SignalDetector } from '../types'
import { makeHallazgo, ars, montoTotal, periodoLabel, ORGANISMOS_DENUNCIA } from './_helpers'

export const rotacionCoordinada: SignalDetector = {
  id:          'rotacion_coordinada',
  tipologia:   'rotacion_coordinada',
  categoria:   'concentracion',
  descripcion: 'Detecta pares de proveedores que ganan contratos en un área en años distintos sin coincidir (rotación de cartel).',

  legalFramework: {
    articulos: [
      'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
      'Art. 310 Código Penal — falsedad en licitaciones públicas',
      'Convenio OCDE — Directrices sobre colusión en compras públicas',
    ],
    denunciar_ante: [
      ...ORGANISMOS_DENUNCIA,
      'CNDC — Comisión Nacional de Defensa de la Competencia (cndc.gob.ar)',
    ],
    tipologia_ti: 'Market allocation',
  },

  async detect(ctx) {
    const contratos = await ctx.contratos()
    if (contratos.length === 0) return []

    // Only base-award types
    const base = contratos.filter(c =>
      c.tipo === 'licitacion_publica' ||
      c.tipo === 'licitacion_privada' ||
      c.tipo === 'contratacion_directa'
    )
    if (base.length === 0) return []

    // Group by area
    const porArea = new Map<string, typeof base>()
    for (const c of base) {
      const area = (c.area ?? '').trim().toUpperCase()
      if (!area) continue
      if (!porArea.has(area)) porArea.set(area, [])
      porArea.get(area)!.push(c)
    }

    type Caso = {
      area:       string
      pares:      { prov1: string; años1: number[]; prov2: string; años2: number[] }[]
      montoTotal: number
    }
    const casos: Caso[] = []

    for (const [area, cs] of porArea.entries()) {
      const totalAnios = new Set(cs.map(c => c.anio))
      if (totalAnios.size < 3) continue

      // Build proveedor → { años, monto }
      const porProv = new Map<string, { años: Set<number>; monto: number }>()
      for (const c of cs) {
        const prov = c.proveedor_normalizado || c.proveedor.trim().toUpperCase()
        if (!porProv.has(prov)) porProv.set(prov, { años: new Set(), monto: 0 })
        const entry = porProv.get(prov)!
        entry.años.add(c.anio)
        entry.monto += c.monto
      }
      if (porProv.size < 2) continue

      const provList = Array.from(porProv.entries())
      const pares: Caso['pares'] = []

      for (let i = 0; i < provList.length; i++) {
        for (let j = i + 1; j < provList.length; j++) {
          const [prov1, d1] = provList[i]
          const [prov2, d2] = provList[j]
          const overlap = [...d1.años].filter(y => d2.años.has(y))
          if (overlap.length > 0) continue
          if (d1.años.size + d2.años.size < 3) continue
          pares.push({
            prov1, años1: [...d1.años].sort(),
            prov2, años2: [...d2.años].sort(),
          })
        }
      }

      if (pares.length === 0) continue
      const areaMonto = montoTotal(cs)
      if (areaMonto < 10_000_000) continue

      casos.push({ area, pares, montoTotal: areaMonto })
    }

    if (casos.length === 0) return []
    casos.sort((a, b) => b.montoTotal - a.montoTotal)

    const top        = casos[0]
    const totalMonto = casos.reduce((s, c) => s + c.montoTotal, 0)

    return [makeHallazgo({
      señalId:    'rotacion_coordinada',
      tipologia:  'rotacion_coordinada',
      categoria:  'concentracion',
      score:      Math.min(80, 60 + casos.length * 5),
      titulo:     `Posible rotación coordinada en ${casos.length} área${casos.length > 1 ? 's' : ''}: proveedores que se alternan sin competir`,
      resumen:    `En ${casos.length} área${casos.length > 1 ? 's' : ''}, dos o más proveedores ganan contratos en años distintos sin nunca coincidir en el mismo año. Caso principal: área "${top.area}" — ${top.pares[0].prov1} (años ${top.pares[0].años1.join(', ')}) y ${top.pares[0].prov2} (años ${top.pares[0].años2.join(', ')}) se alternan con ${ars(totalMonto)} involucrados. Este patrón es consistente con acuerdos de reparto de mercado prohibidos por la Ley de Defensa de la Competencia.`,
      severidad:  'grave',
      evidencia:  top.pares.slice(0, 4).map(p => ({
        descripcion: `"${top.area}": ${p.prov1} (años ${p.años1.join(', ')}) vs ${p.prov2} (años ${p.años2.join(', ')})`,
        fuente_url:  contratos[0].source_url,
      })),
      articulos:  [
        'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
        'Art. 310 Código Penal — falsedad en licitaciones públicas',
      ],
      entidades: top.pares.slice(0, 2).flatMap(p => [
        { tipo: 'Empresa' as const, id: p.prov1, nombre: p.prov1 },
        { tipo: 'Empresa' as const, id: p.prov2, nombre: p.prov2 },
      ]),
      municipioId: ctx.municipio_id,
      periodo:     periodoLabel(ctx.periodo_desde, ctx.periodo_hasta),
    })]
  },
}
