import { Contrato, Señal, EmpresaEnriquecida } from '../types'
import { getDirectoresCompartidos, isGraphAvailable } from '../lib/graph'

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

export function detectarServiciosSinHistorial(contratos: Contrato[]): Señal | null {
  const PALABRAS_SERVICIO = ['LIMPIEZA', 'SEGURIDAD', 'MANTENIMIENTO', 'VIGILANCIA', 'CONSTRUCCION', 'OBRA', 'PINTURA']
  const UMBRAL_MONTO = 50_000_000

  const sospechosos: { proveedor: string; monto: number; descripcion: string }[] = []

  const porProv = new Map<string, Contrato[]>()
  for (const c of contratos) {
    const k = c.proveedor.trim().toUpperCase()
    if (!porProv.has(k)) porProv.set(k, [])
    porProv.get(k)!.push(c)
  }

  for (const [proveedor, cs] of porProv.entries()) {
    const esServicio = cs.some(c =>
      PALABRAS_SERVICIO.some(p => c.descripcion.toUpperCase().includes(p))
    )
    if (!esServicio) continue

    const monto = cs.reduce((s, c) => s + c.monto, 0)
    if (monto < UMBRAL_MONTO) continue

    const años = new Set(cs.map(c => c.anio))
    if (años.size > 2) continue

    const contratoPrincipal = cs.sort((a, b) => b.monto - a.monto)[0]
    sospechosos.push({ proveedor, monto, descripcion: contratoPrincipal.descripcion })
  }

  if (sospechosos.length === 0) return null

  sospechosos.sort((a, b) => b.monto - a.monto)
  const total = sospechosos.reduce((s, x) => s + x.monto, 0)

  return {
    tipologia: 'servicio_sin_historial',
    score: Math.min(75, 60 + sospechosos.length * 3),
    titulo: `${sospechosos.length} proveedor/es de servicios sin historial previo detectado/s: ${ars(total)} total`,
    resumen: `Se identificaron ${sospechosos.length} proveedor/es que prestan servicios intensivos en mano de obra (limpieza, construcción, mantenimiento) por montos superiores a ${ars(UMBRAL_MONTO)}, pero solo aparecen en el dataset por un período acotado, sin historial de contrataciones previas verificable. El caso más significativo: "${sospechosos[0].proveedor}" por ${ars(sospechosos[0].monto)}.`,
    evidencia: sospechosos.slice(0, 4).map(s => ({
      descripcion: `${s.proveedor}: ${ars(s.monto)} — ${s.descripcion.slice(0, 70)}`,
      fuenteUrl: contratos[0].fuenteUrl,
    })),
    legal: {
      articulos: ['Ley Provincial 8614 art. 18 (habilitación de proveedores)', 'RG AFIP 4871 (registro empleadores)'],
      severidad: 'grave',
      denunciarAnte: [
        'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
        'AFIP/ARCA — División Fiscalización',
      ],
    },
  }
}

export function detectarFraccionamientoAvanzado(contratos: Contrato[]): Señal | null {
  const porProv = new Map<string, Contrato[]>()
  for (const c of contratos) {
    const k = c.proveedor.trim().toUpperCase()
    if (!porProv.has(k)) porProv.set(k, [])
    porProv.get(k)!.push(c)
  }

  const casos: { proveedor: string; contratos: Contrato[]; montoTotal: number; montoMax: number }[] = []

  for (const [proveedor, cs] of porProv.entries()) {
    if (cs.length < 3) continue

    const concursos = cs.filter(c =>
      c.tipo.toUpperCase().includes('CONCURSO') ||
      c.tipo.toUpperCase().includes('DIRECTA')
    )
    if (concursos.length < 3) continue

    const total = concursos.reduce((s, c) => s + c.monto, 0)
    const montoMax = Math.max(...concursos.map(c => c.monto))

    if (total > 20_000_000 && montoMax < total * 0.4 && concursos.length >= 3) {
      casos.push({ proveedor, contratos: concursos, montoTotal: total, montoMax })
    }
  }

  if (casos.length === 0) return null
  casos.sort((a, b) => b.montoTotal - a.montoTotal)

  return {
    tipologia: 'fraccionamiento_avanzado',
    score: Math.min(80, 55 + casos.length * 5),
    titulo: `Posible fraccionamiento en ${casos.length} proveedor/es: contratos múltiples de montos similares`,
    resumen: `Se detectaron ${casos.length} proveedor/es con patrón consistente con fraccionamiento contractual: múltiples contratos de montos similares que individualmente no superan los umbrales de licitación, pero que acumulados representan montos significativos. El caso principal: "${casos[0].proveedor}" con ${casos[0].contratos.length} contratos por ${ars(casos[0].montoTotal)} total (máximo individual: ${ars(casos[0].montoMax)}).`,
    evidencia: casos.slice(0, 3).map(c => ({
      descripcion: `${c.proveedor}: ${c.contratos.length} contratos × ${ars(c.montoTotal / c.contratos.length)} promedio = ${ars(c.montoTotal)} total`,
      fuenteUrl: contratos[0].fuenteUrl,
    })),
    legal: {
      articulos: [
        'Ley Provincial 8614 art. 14 (prohibición de fraccionamiento)',
        'Ordenanza Municipal de Contrataciones — art. correspondiente a umbrales',
      ],
      severidad: 'moderada',
      denunciarAnte: ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
    },
  }
}

export function detectarConcentracionTemporal(contratos: Contrato[]): Señal | null {
  const años = new Set(contratos.map(c => c.anio))
  if (años.size !== 1) return null

  const TIPOS_FIN_ANIO = ['PRÓRROGA', 'PRORROGA', 'COMPLEMENTARIOS', 'AMPLIACIÓN']
  const contratosFinAnio = contratos.filter(c =>
    TIPOS_FIN_ANIO.some(t => c.tipo.toUpperCase().includes(t))
  )

  const total = contratos.reduce((s, c) => s + c.monto, 0)
  const montoFinAnio = contratosFinAnio.reduce((s, c) => s + c.monto, 0)
  const pct = (montoFinAnio / total) * 100

  const ampliaciones = contratos.filter(c =>
    c.tipo.toUpperCase().includes('AMPLIACI') ||
    c.tipo.toUpperCase().includes('COMPLEMENT')
  )

  if (pct < 30 && ampliaciones.length < 3) return null

  return {
    tipologia: 'gasto_fin_ejercicio',
    score: Math.min(70, Math.round(45 + pct * 0.4)),
    titulo: `${pct.toFixed(1)}% del gasto vía prórrogas y ampliaciones — patrón de cierre de ejercicio`,
    resumen: `El ${pct.toFixed(1)}% del gasto analizado (${ars(montoFinAnio)}) se realizó a través de prórrogas y ampliaciones de contratos existentes. Este patrón es consistente con el "gasto de fin de ejercicio", práctica donde los fondos presupuestarios no ejecutados se comprometen en contratos de urgencia o ampliaciones antes del cierre del año fiscal, eludiendo procesos competitivos.`,
    evidencia: [{
      descripcion: `${contratosFinAnio.length} contratos vía prórroga/ampliación: ${ars(montoFinAnio)} de ${ars(total)} total`,
      fuenteUrl: contratos[0].fuenteUrl,
    }],
    legal: {
      articulos: [
        'Ley Provincial 8614 art. 14 (principio de licitación)',
        'Ley de Administración Financiera — cierre de ejercicio',
      ],
      severidad: pct >= 40 ? 'grave' : 'moderada',
      denunciarAnte: ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
    },
  }
}

export function detectarProveedorCronico(contratos: Contrato[]): Señal | null {
  const años = [...new Set(contratos.map(c => c.anio))].sort()
  if (años.length < 2) return null

  const porProv = new Map<string, Map<number, number>>()

  for (const c of contratos) {
    const k = c.proveedor.trim().toUpperCase()
    if (!porProv.has(k)) porProv.set(k, new Map())
    const añoMap = porProv.get(k)!
    añoMap.set(c.anio, (añoMap.get(c.anio) ?? 0) + c.monto)
  }

  const cronicos: { proveedor: string; años: number; montoTotal: number; evolucion: string }[] = []

  for (const [proveedor, añoMap] of porProv.entries()) {
    if (añoMap.size < Math.max(2, años.length * 0.6)) continue

    const total = Array.from(añoMap.values()).reduce((s, m) => s + m, 0)
    if (total < 50_000_000) continue

    const montosOrdenados = años.map(a => añoMap.get(a) ?? 0)
    const primero = montosOrdenados.find(m => m > 0) ?? 0
    const ultimo = [...montosOrdenados].reverse().find(m => m > 0) ?? 0
    const crecimiento = primero > 0 ? ((ultimo - primero) / primero) * 100 : 0

    cronicos.push({
      proveedor,
      años: añoMap.size,
      montoTotal: total,
      evolucion: crecimiento >= 0
        ? `creció ${crecimiento.toFixed(0)}% en el período`
        : `disminuyó ${Math.abs(crecimiento).toFixed(0)}% en el período`,
    })
  }

  if (cronicos.length === 0) return null
  cronicos.sort((a, b) => b.montoTotal - a.montoTotal)

  return {
    tipologia: 'proveedor_cronico',
    score: Math.min(70, 50 + cronicos.length * 4),
    titulo: `${cronicos.length} proveedor/es con presencia continua en múltiples años por ${ars(cronicos.reduce((s, c) => s + c.montoTotal, 0))} total`,
    resumen: `Se identificaron ${cronicos.length} proveedor/es que mantienen una presencia continua en las contrataciones municipales a lo largo de ${años.length} años analizados (${años[0]}–${años[años.length - 1]}). La permanencia prolongada sin procesos competitivos renovados puede indicar ausencia de mecanismos efectivos de competencia. El caso más significativo: "${cronicos[0].proveedor}" con presencia en ${cronicos[0].años} años, ${cronicos[0].evolucion}, acumulando ${ars(cronicos[0].montoTotal)} en el período.`,
    evidencia: cronicos.slice(0, 4).map(c => ({
      descripcion: `${c.proveedor}: ${c.años} años de presencia continua — ${ars(c.montoTotal)} acumulado — ${c.evolucion}`,
      fuenteUrl: contratos[0].fuenteUrl,
    })),
    legal: {
      articulos: [
        'Ley Provincial 8614 art. 22 (principio de concurrencia)',
        'Principio de eficiencia en el gasto público',
      ],
      severidad: 'moderada',
      denunciarAnte: [
        'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
        'Concejo Deliberante de Córdoba — Comisión de Control',
      ],
    },
  }
}

// ─── Señales de entidades (Sprint 3) ─────────────────────────────────────────

export function detectarEmpresaNueva(
  contratos: Contrato[],
  empresas: Map<string, EmpresaEnriquecida>
): Señal | null {
  const UMBRAL_MONTO = 5_000_000
  const sospechosos: { nombre: string; inicioActividades: string; primerAnio: number; monto: number }[] = []

  for (const [nombre, data] of empresas) {
    if (!data.inicioActividades || !data.encontrado) continue

    const partes = data.inicioActividades.split('/')
    if (partes.length !== 3) continue
    const anioInicio = parseInt(partes[2])
    if (isNaN(anioInicio)) continue

    const contratosProveedor = contratos.filter(
      c => c.proveedor.trim().toUpperCase() === nombre
    )
    if (contratosProveedor.length === 0) continue

    const primerAnio = Math.min(...contratosProveedor.map(c => c.anio))
    const monto = contratosProveedor.reduce((s, c) => s + c.monto, 0)

    // Empresa que arranca actividades y al año siguiente ya tiene contratos significativos
    if (primerAnio - anioInicio <= 1 && monto >= UMBRAL_MONTO) {
      sospechosos.push({ nombre, inicioActividades: data.inicioActividades, primerAnio, monto })
    }
  }

  if (sospechosos.length === 0) return null

  return {
    tipologia: 'empresa_nueva',
    score: 65,
    titulo: `${sospechosos.length} proveedor${sospechosos.length > 1 ? 'es' : ''} con actividad reciente al momento del primer contrato`,
    resumen: `Proveedores cuyo inicio de actividades en AFIP es igual o anterior en 1 año a su primer contrato con el municipio, y recibieron montos significativos. Posible habilitación ad hoc para capturar contratos.`,
    evidencia: sospechosos.slice(0, 5).map(s => ({
      descripcion: `${s.nombre}: inicio actividades ${s.inicioActividades}, primer contrato ${s.primerAnio}, total recibido ${ars(s.monto)}`,
      fuenteUrl: empresas.get(s.nombre)?.fuenteUrl ?? '',
    })),
    legal: {
      articulos: [
        'Art. 11 Decreto 1023/2001 — capacidad para contratar con el Estado',
        'Res. 1169/2016 — Registro de Proveedores del Estado',
        'Art. 72 LCT — acreditación de capacidad operativa',
      ],
      severidad: 'moderada',
      denunciarAnte: ORGANISMOS,
    },
  }
}

export function detectarEmpresaSinEmpleados(
  contratos: Contrato[],
  empresas: Map<string, EmpresaEnriquecida>
): Señal | null {
  const UMBRAL_MONTO = 10_000_000
  const sospechosos: { nombre: string; monto: number; fuenteUrl: string }[] = []

  for (const [nombre, data] of empresas) {
    if (!data.encontrado) continue
    if (data.esEmpleador) continue  // tiene empleados registrados — no aplica

    const monto = contratos
      .filter(c => c.proveedor.trim().toUpperCase() === nombre)
      .reduce((s, c) => s + c.monto, 0)

    if (monto >= UMBRAL_MONTO) {
      sospechosos.push({ nombre, monto, fuenteUrl: data.fuenteUrl })
    }
  }

  if (sospechosos.length === 0) return null

  return {
    tipologia: 'empresa_sin_empleados',
    score: 72,
    titulo: `${sospechosos.length} proveedor${sospechosos.length > 1 ? 'es' : ''} sin empleados registrados recibió contratos significativos`,
    resumen: `Empresas que no figuran como empleadoras en AFIP pero recibieron contratos de alto valor. Sin empleados registrados, la capacidad operativa real es cuestionable. Posible empresa pantalla o intermediaria.`,
    evidencia: sospechosos.slice(0, 5).map(s => ({
      descripcion: `${s.nombre}: no figura como empleadora en AFIP — recibió ${ars(s.monto)} en contratos`,
      fuenteUrl: s.fuenteUrl,
    })),
    legal: {
      articulos: [
        'Art. 29 LCT — intermediación laboral ilícita',
        'Ley 24.769 art. 1 — evasión tributaria',
        'Art. 55 Ley 11.683 — responsabilidad solidaria del Estado contratante',
      ],
      severidad: 'grave',
      denunciarAnte: [
        ...ORGANISMOS,
        'AFIP/ARCA — División Fiscalización (afip.gob.ar)',
        'Ministerio de Trabajo — Inspección del Trabajo',
      ],
    },
  }
}

export function detectarDirectoresCompartidos(
  pares: { empresa1: string; empresa2: string; cuit1: string; cuit2: string; directores: string[] }[]
): Señal | null {
  if (pares.length === 0) return null

  return {
    tipologia: 'directores_compartidos',
    score: 85,
    titulo: `${pares.length} par${pares.length > 1 ? 'es' : ''} de proveedores comparte${pares.length === 1 ? 'n' : ''} directores`,
    resumen: `Proveedores que aparecen como competidores en licitaciones comparten directores o socios en común. Indica posible cartel o empresas vinculadas presentadas como independientes para cubrir requisitos de competencia.`,
    evidencia: pares.slice(0, 5).map(p => ({
      descripcion: `${p.empresa1} y ${p.empresa2} comparten: ${p.directores.join(', ')}`,
      fuenteUrl: `https://www.cuitonline.com/search.php?q=${encodeURIComponent(p.empresa1)}`,
    })),
    legal: {
      articulos: [
        'Art. 1 Ley 27.442 — Defensa de la Competencia (colusión en licitaciones)',
        'Art. 210 Código Penal — asociación ilícita',
        'Art. 265 Código Penal — negociaciones incompatibles con la función pública',
        'Convenio OCDE — Directrices sobre colusión en compras públicas',
      ],
      severidad: 'grave',
      denunciarAnte: [
        ...ORGANISMOS,
        'CNDC — Comisión Nacional de Defensa de la Competencia (cndc.gob.ar)',
        'Fiscalía Federal de Córdoba',
      ],
    },
  }
}

// ─── Orquestador ──────────────────────────────────────────────────────────────

export async function calcularSeñales(
  contratos: Contrato[],
  empresas?: Map<string, EmpresaEnriquecida>,
  municipioId?: string
): Promise<Señal[]> {
  const señales: Señal[] = []

  // Señales determinísticas (síncronas)
  const detectoresSinc = [
    detectarProrrogas,
    detectarConcentracion,
    detectarContratacionesDirectas,
    detectarMonopolioRubro,
    detectarServiciosSinHistorial,
    detectarFraccionamientoAvanzado,
    detectarConcentracionTemporal,
    detectarProveedorCronico,
  ]
  for (const d of detectoresSinc) {
    try { const s = d(contratos); if (s) señales.push(s) }
    catch (err) { console.error('[signals] Error en detector:', err) }
  }

  // Señales de entidades (requieren datos de AFIP)
  if (empresas && empresas.size > 0) {
    try { const s = detectarEmpresaNueva(contratos, empresas); if (s) señales.push(s) }
    catch (err) { console.error('[signals] Error en empresa_nueva:', err) }

    try { const s = detectarEmpresaSinEmpleados(contratos, empresas); if (s) señales.push(s) }
    catch (err) { console.error('[signals] Error en empresa_sin_empleados:', err) }
  }

  // Señales de red (requieren Neo4j con directores cargados)
  if (isGraphAvailable() && municipioId) {
    try {
      const pares = await getDirectoresCompartidos(municipioId)
      const s = detectarDirectoresCompartidos(pares)
      if (s) señales.push(s)
    } catch (err) { console.error('[signals] Error en directores_compartidos:', err) }
  }

  return señales.sort((a, b) => b.score - a.score)
}
