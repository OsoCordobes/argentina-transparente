import { Contrato, Señal } from '../types'

const ORGANISMOS = [
  'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
  'Defensoría del Pueblo de Córdoba (defensoria.cba.gov.ar)',
  'Fiscalía de Estado de Córdoba (fiscaliaestado.cba.gov.ar)',
  'Ministerio Público Fiscal (fiscales.gob.ar)',
]

function montoTotal(cs: Contrato[]): number {
  return cs.reduce((s, c) => s + c.monto, 0)
}

function agruparPorProveedor(cs: Contrato[]): Map<string, Contrato[]> {
  const map = new Map<string, Contrato[]>()
  for (const c of cs) {
    const k = c.proveedor.trim().toUpperCase()
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(c)
  }
  return map
}

function ars(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

export function detectarProrrogas(contratos: Contrato[]): Señal | null {
  const TIPOS = ['PRÓRROGA', 'PRORROGA', 'COMPLEMENTARIOS', 'AMPLIACIÓN DE LA CONTRATACIÓN']
  const prorrogas = contratos.filter(c =>
    TIPOS.some(t => c.tipo.toUpperCase().includes(t))
  )
  if (prorrogas.length === 0) return null
  const total = montoTotal(contratos)
  const monto = montoTotal(prorrogas)
  const pct = (monto / total) * 100
  if (pct < 20) return null
  const porProv = agruparPorProveedor(prorrogas)
  const ranking = Array.from(porProv.entries())
    .map(([p, cs]) => ({ p, m: montoTotal(cs) }))
    .sort((a, b) => b.m - a.m).slice(0, 5)
  return {
    tipologia: 'prorrogas_excesivas',
    score: Math.min(90, Math.round(55 + pct * 0.5)),
    titulo: `${prorrogas.length} contratos prorrogados sin nueva licitación: ${ars(monto)} (${pct.toFixed(1)}% del gasto)`,
    resumen: `Se detectaron ${prorrogas.length} contratos renovados por prórroga por un total de ${ars(monto)}, equivalente al ${pct.toFixed(1)}% del gasto analizado. Las prórrogas reiteradas evitan los mecanismos de competencia y permiten mantener proveedores sin someterlos a nueva evaluación de precios y calidad.`,
    evidencia: ranking.map(r => ({
      descripcion: `${r.p}: ${ars(r.m)} vía prórroga`,
      fuenteUrl: contratos[0].fuenteUrl,
    })),
    legal: {
      articulos: ['Ley Provincial 8614 art. 14 (licitación como principio general)', 'Ley de Contabilidad Pública art. 7'],
      severidad: pct >= 40 ? 'grave' : 'moderada',
      denunciarAnte: ORGANISMOS,
    },
  }
}

export function detectarConcentracion(contratos: Contrato[]): Señal | null {
  const total = montoTotal(contratos)
  if (total === 0) return null
  const porProv = agruparPorProveedor(contratos)
  const ranking = Array.from(porProv.entries())
    .map(([p, cs]) => ({ p, m: montoTotal(cs), n: cs.length }))
    .sort((a, b) => b.m - a.m)
  const top = ranking[0]
  const pct = (top.m / total) * 100
  if (pct < 35) return null
  return {
    tipologia: 'concentracion_proveedor',
    score: Math.min(95, Math.round(50 + pct)),
    titulo: `Concentración extrema: ${top.p} recibe el ${pct.toFixed(1)}% del gasto`,
    resumen: `El proveedor "${top.p}" concentra ${ars(top.m)} (${pct.toFixed(1)}% del gasto total de ${ars(total)}) en ${top.n} contrato/s. Una concentración superior al 35% en un solo proveedor contradice los principios de concurrencia establecidos en la normativa.`,
    evidencia: [{ descripcion: `${top.p}: ${ars(top.m)} (${pct.toFixed(1)}% del total)`, fuenteUrl: contratos[0].fuenteUrl }],
    legal: {
      articulos: ['Ley Provincial 8614 art. 22 (principio de concurrencia)', 'Decreto 1338/2016'],
      severidad: pct >= 60 ? 'grave' : 'moderada',
      denunciarAnte: ORGANISMOS,
    },
  }
}

export function detectarContratacionesDirectas(contratos: Contrato[]): Señal | null {
  const directas = contratos.filter(c =>
    c.tipo.toUpperCase().includes('CONTRATACI') && c.tipo.toUpperCase().includes('DIRECTA')
  )
  if (directas.length < 5) return null
  const total = montoTotal(contratos)
  const monto = montoTotal(directas)
  const pct = (monto / total) * 100
  if (pct < 8 && directas.length < 15) return null
  const top5 = [...directas].sort((a, b) => b.monto - a.monto).slice(0, 5)
  return {
    tipologia: 'contrataciones_directas',
    score: Math.min(80, Math.round(40 + directas.length * 1.2 + pct * 0.4)),
    titulo: `${directas.length} contrataciones directas por ${ars(monto)} sin proceso competitivo`,
    resumen: `Se identificaron ${directas.length} contrataciones directas por ${ars(monto)} (${pct.toFixed(1)}% del gasto). La contratación directa es una excepción al principio de licitación pública y debe estar justificada por causales taxativas.`,
    evidencia: top5.map(c => ({
      descripcion: `${c.proveedor}: ${ars(c.monto)} — ${c.descripcion.slice(0, 80)}`,
      fuenteUrl: c.fuenteUrl,
    })),
    legal: {
      articulos: ['Ley Provincial 8614 art. 18 (causales de excepción)', 'Ley de Contabilidad Pública art. 7 inc. b'],
      severidad: directas.length > 20 ? 'grave' : 'moderada',
      denunciarAnte: ORGANISMOS,
    },
  }
}

export function detectarMonopolioRubro(contratos: Contrato[]): Señal | null {
  const porArea = new Map<string, Contrato[]>()
  for (const c of contratos) {
    const k = c.area.trim().toUpperCase()
    if (!k) continue
    if (!porArea.has(k)) porArea.set(k, [])
    porArea.get(k)!.push(c)
  }
  let mejor: { area: string; proveedor: string; pct: number; monto: number; total: number } | null = null
  for (const [area, cs] of porArea.entries()) {
    if (cs.length < 3) continue
    const totalArea = montoTotal(cs)
    if (totalArea < 1_000_000) continue
    const porProv = agruparPorProveedor(cs)
    for (const [prov, pcs] of porProv.entries()) {
      const m = montoTotal(pcs)
      const pct = (m / totalArea) * 100
      if (pct >= 60 && (!mejor || pct > mejor.pct))
        mejor = { area, proveedor: prov, pct, monto: m, total: totalArea }
    }
  }
  if (!mejor) return null
  return {
    tipologia: 'monopolio_rubro',
    score: Math.min(85, Math.round(55 + mejor.pct * 0.3)),
    titulo: `${mejor.proveedor} concentra el ${mejor.pct.toFixed(1)}% del gasto en "${mejor.area}"`,
    resumen: `En el área "${mejor.area}", el proveedor "${mejor.proveedor}" recibió ${ars(mejor.monto)} de un total de ${ars(mejor.total)} (${mejor.pct.toFixed(1)}%). Una concentración superior al 60% en un área sugiere direccionamiento de contrataciones.`,
    evidencia: [{ descripcion: `${mejor.proveedor}: ${ars(mejor.monto)} de ${ars(mejor.total)} en ${mejor.area}`, fuenteUrl: contratos[0].fuenteUrl }],
    legal: {
      articulos: ['Ley Provincial 8614 art. 22 (principio de concurrencia)'],
      severidad: mejor.pct >= 80 ? 'grave' : 'moderada',
      denunciarAnte: ORGANISMOS,
    },
  }
}

export function calcularSeñales(contratos: Contrato[]): Señal[] {
  const detectores = [detectarProrrogas, detectarConcentracion, detectarContratacionesDirectas, detectarMonopolioRubro]
  const señales: Señal[] = []
  for (const d of detectores) {
    try { const s = d(contratos); if (s) señales.push(s) }
    catch (err) { console.error('[signals] Error en detector:', err) }
  }
  return señales.sort((a, b) => b.score - a.score)
}
