import { Contrato, Señal, EmpresaEnriquecida, OSMatch } from '../types'
import { getDirectoresCompartidos, getRedDeEmpresas, isGraphAvailable } from '../lib/graph'
import detectorsConfigRaw from './detectors-config.json'
import { parseDetectorConfig, type DetectorConfig } from './detectors-loader'

/**
 * Configuración legal/umbrales por detector — leída de detectors-config.json
 * y validada con zod. La auditoría legal 2026-04-26 clasifica los 15
 * detectores en Tier 1 (Primario) o Tier 2 (Indicio con caveat).
 *
 * Para usar en un detector:
 *   const C = cfg('detectarX')
 *   ... C.norma, C.umbral_minimo, C.caveat ...
 *
 * Tirar errores tempranos en startup (no en cada llamada) si el config
 * está corrupto. Si un detector falta del config, `cfg()` lanza Error.
 */
const DETECTORS_CONFIG = parseDetectorConfig(detectorsConfigRaw)

function cfg(name: string): DetectorConfig {
  const c = DETECTORS_CONFIG[name]
  if (!c) throw new Error(`Detector "${name}" sin entrada en detectors-config.json`)
  return c
}

const ORGANISMOS = [
  'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
  'Defensoría del Pueblo de Córdoba (defensoria.cba.gov.ar)',
  'Fiscalía de Estado de Córdoba (fiscaliaestado.cba.gov.ar)',
  'Ministerio Público Fiscal (fiscales.gob.ar)',
]

function montoTotal(cs: Contrato[]): number {
  return cs.reduce((s, c) => s + c.monto, 0)
}

/**
 * Normaliza nombres de proveedor para que variantes societarias no se
 * cuenten como empresas distintas. "ACME S.A." y "ACME SRL" colapsan
 * al mismo nombre raíz "ACME". También strip dobles espacios y puntos.
 */
export function normalizarProveedor(nombre: string): string {
  return nombre
    .trim()
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\.\s*/g, ' ')
    .replace(
      /\s+(S\s*A\s*S?|S\s*R\s*L|SOCIEDAD\s+(?:ANONIMA|ANÓNIMA|RESPONSABILIDAD\s+LIMITADA)|SAIIC[FA]?A?|SACICI|SAIC|UTE|U\.?\s*T\.?|SCS|SCEI|COOPERATIVA|COOP)\s*$/i,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim()
}

function agruparPorProveedor(cs: Contrato[]): Map<string, Contrato[]> {
  const map = new Map<string, Contrato[]>()
  for (const c of cs) {
    const k = normalizarProveedor(c.proveedor)
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
  const C = cfg('detectarProrrogas')
  const UMBRAL_MIN = (C.umbral_minimo as number | undefined) ?? 20
  const UMBRAL_GRAVE = (C.umbral_grave as number | undefined) ?? 40

  const TIPOS = ['PRÓRROGA', 'PRORROGA', 'COMPLEMENTARIOS', 'AMPLIACIÓN DE LA CONTRATACIÓN']
  const prorrogas = contratos.filter(c =>
    TIPOS.some(t => c.tipo.toUpperCase().includes(t))
  )
  if (prorrogas.length === 0) return null
  const total = montoTotal(contratos)
  const monto = montoTotal(prorrogas)
  const pct = (monto / total) * 100
  if (pct < UMBRAL_MIN) return null
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
      articulos: [C.norma!],
      severidad: pct >= UMBRAL_GRAVE ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
  }
}

export function detectarConcentracion(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarConcentracion')
  const UMBRAL_MIN = (C.umbral_minimo as number | undefined) ?? 35
  const UMBRAL_GRAVE = (C.umbral_grave as number | undefined) ?? 60

  const total = montoTotal(contratos)
  if (total === 0) return null
  const porProv = agruparPorProveedor(contratos)
  const ranking = Array.from(porProv.entries())
    .map(([k, cs]) => ({
      // displayName preserva el nombre original (ej. "GIGANTE SA") para que
      // el usuario reconozca el proveedor como aparece en los contratos.
      // La key normalizada (k) se usa solo para bucketing.
      displayName: cs[0].proveedor,
      m: montoTotal(cs), n: cs.length, _key: k,
    }))
    .sort((a, b) => b.m - a.m)
  const top = ranking[0]
  const pct = (top.m / total) * 100
  if (pct < UMBRAL_MIN) return null
  return {
    tipologia: 'concentracion_proveedor',
    score: Math.min(95, Math.round(50 + pct)),
    titulo: `Concentración extrema: ${top.displayName} recibe el ${pct.toFixed(1)}% del gasto`,
    resumen: `El proveedor "${top.displayName}" concentra ${ars(top.m)} (${pct.toFixed(1)}% del gasto total de ${ars(total)}) en ${top.n} contrato/s. Una concentración superior al ${UMBRAL_MIN}% en un solo proveedor contradice los principios de concurrencia establecidos en la normativa.`,
    evidencia: [{ descripcion: `${top.displayName}: ${ars(top.m)} (${pct.toFixed(1)}% del total)`, fuenteUrl: contratos[0].fuenteUrl }],
    legal: {
      articulos: [C.norma!],
      severidad: pct >= UMBRAL_GRAVE ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
    caveat: C.caveat,
  }
}

// ─── PLAN-DATOS Fase C5: detectarConcentracionPorCuit ──────────────────────
// Variante Tier 1 de detectarConcentracion que agrupa contratos por
// proveedorCuit (Tier 1-3 verificado del identity_resolver) en lugar de por
// nombre normalizado. Habilita señal publicable cuando los datos están
// completos. Si NO hay contratos con proveedorCuit, devuelve null y deja
// que detectarConcentracion (legacy por nombre) emita su señal.
//
// Ventajas frente a la versión por nombre:
//   - Inmune a alias de razón social ("ACME SA" vs "Acme S.A.").
//   - Inmune a homonimia (dos empresas con razón social idéntica pero CUIT
//     distinto se separan correctamente).
//   - Permite cruzar con personas_juridicas para enriquecer evidencia
//     (domicilio fiscal, estado, fecha constitución).
//
// Tipologia: 'concentracion_cuit'. NO sustituye 'concentracion_proveedor'
// (legacy) — coexisten. La UI puede preferir esta cuando exista.
import { validarCUIT } from '../lib/identidad-validator'

/**
 * Agrupa contratos por proveedorCuit, descartando:
 *   - Contratos sin proveedorCuit (entran al detector legacy por nombre)
 *   - Contratos con proveedorCuit malformado (DV inválido, prefijo desconocido)
 *
 * Review #1 C5: agregada validación módulo-11. Defensa contra seeds que
 * populen proveedorCuit corrupto — el detector publicable nunca debe emitir
 * una señal cuyo CUIT no resuelve correctamente.
 */
function agruparPorCuit(cs: Contrato[]): Map<string, Contrato[]> {
  const map = new Map<string, Contrato[]>()
  for (const c of cs) {
    if (!c.proveedorCuit) continue
    if (!validarCUIT(c.proveedorCuit)) continue // defensa contra CUITs corruptos
    const k = c.proveedorCuit
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(c)
  }
  return map
}

export function detectarConcentracionPorCuit(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarConcentracion') // reusa thresholds del legacy
  const UMBRAL_MIN = (C.umbral_minimo as number | undefined) ?? 35
  const UMBRAL_GRAVE = (C.umbral_grave as number | undefined) ?? 60

  // Solo opera sobre el subset con CUIT verificado. Los contratos sin
  // proveedorCuit caen al detector legacy concentracion_proveedor.
  const verificados = contratos.filter(c => !!c.proveedorCuit)
  if (verificados.length === 0) return null

  // El total se calcula sobre TODOS los contratos del set (no solo verificados)
  // para que el % sea comparable con la versión legacy. La señal solo se emite
  // si el top tiene CUIT verificado.
  const total = montoTotal(contratos)
  if (total === 0) return null

  const porCuit = agruparPorCuit(verificados)
  if (porCuit.size === 0) return null

  const ranking = Array.from(porCuit.entries())
    .map(([cuit, cs]) => ({
      cuit,
      displayName: cs[0].proveedor,
      m: montoTotal(cs),
      n: cs.length,
    }))
    .sort((a, b) => b.m - a.m)

  const top = ranking[0]
  const pct = (top.m / total) * 100
  if (pct < UMBRAL_MIN) return null

  return {
    tipologia: 'concentracion_cuit',
    score: Math.min(95, Math.round(50 + pct)),
    titulo: `Concentración extrema verificada: ${top.displayName} (CUIT ${top.cuit}) recibe el ${pct.toFixed(1)}% del gasto`,
    resumen: `El proveedor "${top.displayName}" (CUIT ${top.cuit}, identidad verificada Tier 1-3) concentra ${ars(top.m)} (${pct.toFixed(1)}% del gasto total de ${ars(total)}) en ${top.n} contrato(s). El agrupamiento es por CUIT, lo cual es inmune a alias de razón social y a homonimia. Una concentración superior al ${UMBRAL_MIN}% en un solo CUIT contradice los principios de concurrencia.`,
    evidencia: [
      {
        descripcion: `${top.displayName} (CUIT ${top.cuit}): ${ars(top.m)} (${pct.toFixed(1)}% del total) en ${top.n} contrato(s).`,
        fuenteUrl: contratos[0].fuenteUrl,
      },
      ...ranking.slice(1, 4).map(r => ({
        descripcion: `Top siguiente — ${r.displayName} (CUIT ${r.cuit}): ${ars(r.m)} (${((r.m / total) * 100).toFixed(1)}%).`,
        fuenteUrl: contratos[0].fuenteUrl,
      })),
    ],
    legal: {
      articulos: [C.norma!],
      severidad: pct >= UMBRAL_GRAVE ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
    caveat: C.caveat,
    cuits: [top.cuit],
  }
}

export function detectarContratacionesDirectas(contratos: Contrato[]): Señal | null {
  // Match el FRASE completa (no substring overlap). Acepta acentos opcionales.
  // Patrones aceptados: "CONTRATACION DIRECTA", "CONTRATACIÓN DIRECTA",
  //   "COMPRA DIRECTA", "ADJUDICACION DIRECTA". Rechaza "DIRECCION GENERAL
  //   DE CONTRATACIONES" (que matchearía con .includes substring).
  const RE_DIRECTA = /\b(?:CONTRATACI[OÓ]N|COMPRA|ADJUDICACI[OÓ]N)\s+DIRECTA\b/
  const directas = contratos.filter(c =>
    RE_DIRECTA.test(c.tipo.toUpperCase()),
  )
  const C = cfg('detectarContratacionesDirectas')
  const MIN_UNIDADES = (C.umbral_minimo_unidades as number | undefined) ?? 5
  const MIN_PCT = (C.umbral_minimo_pct as number | undefined) ?? 8
  const GRAVE_UNIDADES = (C.umbral_grave_unidades as number | undefined) ?? 20
  if (directas.length < MIN_UNIDADES) return null
  const total = montoTotal(contratos)
  const monto = montoTotal(directas)
  const pct = (monto / total) * 100
  if (pct < MIN_PCT && directas.length < 15) return null
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
      articulos: [C.norma!],
      severidad: directas.length > GRAVE_UNIDADES ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
  }
}

export function detectarMonopolioRubro(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarMonopolioRubro')
  const UMBRAL_MIN = (C.umbral_minimo as number | undefined) ?? 60
  const UMBRAL_GRAVE = (C.umbral_grave as number | undefined) ?? 80

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
    for (const [, pcs] of porProv.entries()) {
      const m = montoTotal(pcs)
      const pct = (m / totalArea) * 100
      // Mostrar nombre original (cs[0]) en lugar de la key normalizada
      if (pct >= UMBRAL_MIN && (!mejor || pct > mejor.pct))
        mejor = { area, proveedor: pcs[0].proveedor, pct, monto: m, total: totalArea }
    }
  }
  if (!mejor) return null
  return {
    tipologia: 'monopolio_rubro',
    score: Math.min(85, Math.round(55 + mejor.pct * 0.3)),
    titulo: `${mejor.proveedor} concentra el ${mejor.pct.toFixed(1)}% del gasto en "${mejor.area}"`,
    resumen: `En el área "${mejor.area}", el proveedor "${mejor.proveedor}" recibió ${ars(mejor.monto)} de un total de ${ars(mejor.total)} (${mejor.pct.toFixed(1)}%). Una concentración superior al ${UMBRAL_MIN}% en un área sugiere direccionamiento de contrataciones.`,
    evidencia: [{ descripcion: `${mejor.proveedor}: ${ars(mejor.monto)} de ${ars(mejor.total)} en ${mejor.area}`, fuenteUrl: contratos[0].fuenteUrl }],
    legal: {
      articulos: [C.norma!],
      severidad: mejor.pct >= UMBRAL_GRAVE ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
    caveat: C.caveat,
  }
}

/**
 * Raíces (prefijos) que capturan variantes de servicios típicos del estado.
 * Robustas a typos comunes en datasets argentinos (descripcion no curada).
 * Match por substring sobre descripcion + tipo + area concatenados.
 *
 * Ejemplos cubiertos por raíz:
 * - LIMP → LIMPIEZA, LIMPEZA, LIMPIO/A
 * - SEGUR/SECUR → SEGURIDAD, SECURIDAD
 * - MANTEN/MANTIN → MANTENIMIENTO, MANTINIMIENTO
 * - VIGIL → VIGILANCIA
 * - CONSTRU → CONSTRUCCIÓN, CONSTRUCION
 * - PINT → PINTURA, PINTADO
 * - CATER → CATERING
 * - GASTR/COMID/ALIMENT → GASTRONOMIA, COMIDA, ALIMENTOS
 * - IMPR → IMPRENTA, IMPRESIÓN
 * - SOFT/DESARR/INFORMAT → desarrollo software/sistemas informáticos
 * - CONSULT/ASESOR → consultoría
 * - VEHICUL/AUTOMOT/TRANSP → flota, transporte
 * - INDUMENT/UNIFORM → uniformes
 */
const RAICES_SERVICIO = [
  'LIMP', 'SEGUR', 'SECUR', 'MANTEN', 'MANTIN', 'VIGIL', 'CONSTRU',
  'PINT', 'OBRA', 'CATER', 'GASTR', 'ALIMENT', 'COMID', 'IMPR',
  'SOFT', 'DESARR', 'INFORMAT', 'CONSULT', 'ASESOR',
  'VEHICUL', 'AUTOMOT', 'TRANSP', 'INDUMENT', 'UNIFORM',
]

export function detectarServiciosSinHistorial(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarServiciosSinHistorial')
  const UMBRAL_MONTO = (C.umbral_monto_pesos as number | undefined) ?? 50_000_000
  const MAX_ANIOS = (C.umbral_max_anios as number | undefined) ?? 2

  const sospechosos: { proveedor: string; monto: number; descripcion: string }[] = []

  const porProv = new Map<string, Contrato[]>()
  for (const c of contratos) {
    const k = c.proveedor.trim().toUpperCase()
    if (!porProv.has(k)) porProv.set(k, [])
    porProv.get(k)!.push(c)
  }

  for (const [proveedor, cs] of porProv.entries()) {
    const esServicio = cs.some(c => {
      // Concatenar descripcion + tipo + area para máxima cobertura.
      const haystack = `${c.descripcion} ${c.tipo} ${c.area}`.toUpperCase()
      return RAICES_SERVICIO.some(r => haystack.includes(r))
    })
    if (!esServicio) continue

    const monto = cs.reduce((s, c) => s + c.monto, 0)
    if (monto < UMBRAL_MONTO) continue

    const años = new Set(cs.map(c => c.anio))
    if (años.size > MAX_ANIOS) continue

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
      articulos: [C.norma!],
      severidad: 'grave',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
        'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
        'AFIP/ARCA — División Fiscalización',
      ],
    },
    caveat: C.caveat,
  }
}

export function detectarFraccionamientoAvanzado(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarFraccionamientoAvanzado')
  const MIN_CONTRATOS = (C.umbral_minimo_contratos as number | undefined) ?? 3
  const MIN_TOTAL = (C.umbral_minimo_total_pesos as number | undefined) ?? 20_000_000
  const MAX_PCT_TOTAL = (C.umbral_max_contrato_pct_total as number | undefined) ?? 40

  const porProv = agruparPorProveedor(contratos)

  const casos: { proveedor: string; contratos: Contrato[]; montoTotal: number; montoMax: number }[] = []

  // Patrón fraccionamiento aplica a cualquier modalidad — incluido LICITACION
  // (que el código previo excluía). Lo único que NO debe entrar son las
  // prórrogas y ampliaciones (esas tienen detector propio).
  for (const [proveedor, cs] of porProv.entries()) {
    if (cs.length < MIN_CONTRATOS) continue

    const candidatos = cs.filter(c => {
      const t = c.tipo.toUpperCase()
      const esProrroga = t.includes('PRÓRROGA') || t.includes('PRORROGA') ||
                          t.includes('AMPLIACI') || t.includes('COMPLEMENT')
      return !esProrroga
    })
    if (candidatos.length < MIN_CONTRATOS) continue
    const concursos = candidatos

    const total = concursos.reduce((s, c) => s + c.monto, 0)
    const montoMax = Math.max(...concursos.map(c => c.monto))

    if (total > MIN_TOTAL && montoMax < total * (MAX_PCT_TOTAL / 100) && concursos.length >= MIN_CONTRATOS) {
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
      articulos: [C.norma!],
      severidad: 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
    },
  }
}

export function detectarConcentracionTemporal(contratos: Contrato[]): Señal | null {
  if (contratos.length === 0) return null
  const C = cfg('detectarConcentracionTemporal')
  const UMBRAL_MIN = (C.umbral_minimo as number | undefined) ?? 30
  const UMBRAL_GRAVE = (C.umbral_grave as number | undefined) ?? 40
  const MIN_AMPLIACIONES = (C.umbral_min_ampliaciones as number | undefined) ?? 3

  // Agrupar por año fiscal y elegir el peor año (mayor concentración en
  // prórrogas/ampliaciones). Esto permite operar sobre datasets multiyear
  // sin perder señales en años problemáticos individuales.
  const porAnio = new Map<number, Contrato[]>()
  for (const c of contratos) {
    if (!porAnio.has(c.anio)) porAnio.set(c.anio, [])
    porAnio.get(c.anio)!.push(c)
  }

  const TIPOS_FIN_ANIO = ['PRÓRROGA', 'PRORROGA', 'COMPLEMENTARIOS', 'AMPLIACIÓN', 'AMPLIACION']

  type AnioStats = {
    anio: number
    pct: number
    montoFinAnio: number
    total: number
    contratosFinAnio: Contrato[]
    contratosDelAnio: Contrato[]
    ampliaciones: number
  }

  let peor: AnioStats | null = null

  for (const [anio, cs] of porAnio) {
    const contratosFinAnio = cs.filter(c =>
      TIPOS_FIN_ANIO.some(t => c.tipo.toUpperCase().includes(t))
    )
    const total = cs.reduce((s, c) => s + c.monto, 0)
    const montoFinAnio = contratosFinAnio.reduce((s, c) => s + c.monto, 0)
    const pct = total > 0 ? (montoFinAnio / total) * 100 : 0

    const ampliaciones = cs.filter(c =>
      c.tipo.toUpperCase().includes('AMPLIACI') ||
      c.tipo.toUpperCase().includes('COMPLEMENT')
    ).length

    // Umbral: ≥30% del gasto vía prórroga/ampliación, o ≥3 ampliaciones (señal débil).
    if (pct < UMBRAL_MIN && ampliaciones < MIN_AMPLIACIONES) continue

    if (!peor || pct > peor.pct) {
      peor = { anio, pct, montoFinAnio, total, contratosFinAnio, contratosDelAnio: cs, ampliaciones }
    }
  }

  if (!peor) return null

  return {
    tipologia: 'gasto_fin_ejercicio',
    score: Math.min(70, Math.round(45 + peor.pct * 0.4)),
    titulo: `${peor.pct.toFixed(1)}% del gasto del año ${peor.anio} vía prórrogas y ampliaciones — patrón de cierre de ejercicio`,
    resumen: `En el ejercicio fiscal ${peor.anio}, el ${peor.pct.toFixed(1)}% del gasto (${ars(peor.montoFinAnio)} de ${ars(peor.total)} total) se realizó a través de prórrogas y ampliaciones de contratos existentes. Este patrón es consistente con el "gasto de fin de ejercicio", práctica donde los fondos presupuestarios no ejecutados se comprometen en contratos de urgencia o ampliaciones antes del cierre del año fiscal, eludiendo procesos competitivos.`,
    evidencia: [{
      descripcion: `Año ${peor.anio}: ${peor.contratosFinAnio.length} contratos vía prórroga/ampliación, ${ars(peor.montoFinAnio)} de ${ars(peor.total)} total`,
      fuenteUrl: peor.contratosFinAnio[0]?.fuenteUrl ?? peor.contratosDelAnio[0].fuenteUrl,
    }],
    legal: {
      articulos: [C.norma!],
      severidad: peor.pct >= UMBRAL_GRAVE ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ['Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)'],
    },
    caveat: C.caveat,
  }
}

export function detectarProveedorCronico(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarProveedorCronico')
  const PCT_ANIOS = (C.umbral_min_pct_anios as number | undefined) ?? 60
  const MIN_ANIOS = (C.umbral_min_anios as number | undefined) ?? 2
  const MIN_TOTAL = (C.umbral_minimo_total_pesos as number | undefined) ?? 50_000_000

  const años = [...new Set(contratos.map(c => c.anio))].sort()
  if (años.length < MIN_ANIOS) return null

  const porProv = new Map<string, Map<number, number>>()

  for (const c of contratos) {
    const k = c.proveedor.trim().toUpperCase()
    if (!porProv.has(k)) porProv.set(k, new Map())
    const añoMap = porProv.get(k)!
    añoMap.set(c.anio, (añoMap.get(c.anio) ?? 0) + c.monto)
  }

  const cronicos: { proveedor: string; años: number; montoTotal: number; evolucion: string }[] = []

  for (const [proveedor, añoMap] of porProv.entries()) {
    if (añoMap.size < Math.max(MIN_ANIOS, años.length * (PCT_ANIOS / 100))) continue

    const total = Array.from(añoMap.values()).reduce((s, m) => s + m, 0)
    if (total < MIN_TOTAL) continue

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
      articulos: [C.norma!],
      severidad: 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
        'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
        'Concejo Deliberante de Córdoba — Comisión de Control',
      ],
    },
    caveat: C.caveat,
  }
}

// ─── Señales de entidades (Sprint 3) ─────────────────────────────────────────

export function detectarEmpresaNueva(
  contratos: Contrato[],
  empresas: Map<string, EmpresaEnriquecida>
): Señal | null {
  const C = cfg('detectarEmpresaNueva')
  const UMBRAL_MONTO = (C.umbral_minimo_pesos as number | undefined) ?? 5_000_000
  const MAX_ANIOS_INICIO = (C.umbral_max_anios_inicio as number | undefined) ?? 1

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
    if (primerAnio - anioInicio <= MAX_ANIOS_INICIO && monto >= UMBRAL_MONTO) {
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
      articulos: [C.norma!],
      severidad: 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
    caveat: C.caveat,
  }
}

export function detectarEmpresaSinEmpleados(
  contratos: Contrato[],
  empresas: Map<string, EmpresaEnriquecida>
): Señal | null {
  const C = cfg('detectarEmpresaSinEmpleados')
  const UMBRAL_MONTO = (C.umbral_minimo_pesos as number | undefined) ?? 10_000_000
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
      articulos: [C.norma!],
      severidad: 'grave',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
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
  const C = cfg('detectarDirectoresCompartidos')

  // Iter 8.12: emitir cuits únicos para que la señal conecte a las empresas
  // en el grafo Neo4j vía SEÑALA.
  const cuits = Array.from(new Set(pares.flatMap(p => [p.cuit1, p.cuit2]).filter(Boolean)))

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
      articulos: [C.norma!],
      severidad: 'grave',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
        ...ORGANISMOS,
        'CNDC — Comisión Nacional de Defensa de la Competencia (cndc.gob.ar)',
        'Fiscalía Federal de Córdoba',
      ],
    },
    cuits,
  }
}

// ─── Señales de comportamiento coordinado (Sprint 4) ─────────────────────────

export function detectarRotacionCoordinada(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarRotacionCoordinada')
  const MIN_ANIOS_SIN_OVERLAP = (C.umbral_min_anios_sin_overlap as number | undefined) ?? 3
  const MIN_MONTO = (C.umbral_minimo_pesos as number | undefined) ?? 10_000_000

  // Only consider base-award contract types (not extensions/amendments)
  const BASE_TIPOS = ['LICITACI', 'CONCURSO', 'DIRECTA']
  const base = contratos.filter(c =>
    BASE_TIPOS.some(t => c.tipo.toUpperCase().includes(t))
  )
  if (base.length === 0) return null

  // Group by area
  const porArea = new Map<string, Contrato[]>()
  for (const c of base) {
    const area = c.area.trim().toUpperCase()
    if (!area) continue
    if (!porArea.has(area)) porArea.set(area, [])
    porArea.get(area)!.push(c)
  }

  const casos: {
    area: string
    pares: { prov1: string; años1: number[]; prov2: string; años2: number[] }[]
    montoTotal: number
  }[] = []

  for (const [area, cs] of porArea.entries()) {
    const totalAnios = new Set(cs.map(c => c.anio))
    if (totalAnios.size < 3) continue

    // Group by proveedor within this area
    const porProv = new Map<string, { años: Set<number>; monto: number }>()
    for (const c of cs) {
      const prov = c.proveedor.trim().toUpperCase()
      if (!porProv.has(prov)) porProv.set(prov, { años: new Set(), monto: 0 })
      const entry = porProv.get(prov)!
      entry.años.add(c.anio)
      entry.monto += c.monto
    }
    if (porProv.size < 2) continue

    // Find pairs with no overlapping years (each wins in different years)
    const provList = Array.from(porProv.entries())
    const pares: { prov1: string; años1: number[]; prov2: string; años2: number[] }[] = []

    for (let i = 0; i < provList.length; i++) {
      for (let j = i + 1; j < provList.length; j++) {
        const [prov1, d1] = provList[i]
        const [prov2, d2] = provList[j]
        const overlap = [...d1.años].filter(y => d2.años.has(y))
        if (overlap.length > 0) continue
        // Both need meaningful presence (combined ≥N years)
        if (d1.años.size + d2.años.size < MIN_ANIOS_SIN_OVERLAP) continue
        pares.push({
          prov1, años1: [...d1.años].sort(),
          prov2, años2: [...d2.años].sort(),
        })
      }
    }

    if (pares.length === 0) continue
    const montoTotal = cs.reduce((s, c) => s + c.monto, 0)
    if (montoTotal < MIN_MONTO) continue

    casos.push({ area, pares, montoTotal })
  }

  if (casos.length === 0) return null
  casos.sort((a, b) => b.montoTotal - a.montoTotal)

  const top = casos[0]
  const totalMonto = casos.reduce((s, c) => s + c.montoTotal, 0)

  return {
    tipologia: 'rotacion_coordinada',
    score: Math.min(80, 60 + casos.length * 5),
    titulo: `Posible rotación coordinada en ${casos.length} área${casos.length > 1 ? 's' : ''}: proveedores que se alternan sin competir`,
    resumen: `En ${casos.length} área${casos.length > 1 ? 's' : ''}, dos o más proveedores ganan contratos base en años distintos sin nunca coincidir en el mismo año. Caso principal: área "${top.area}" — ${top.pares[0].prov1} (años ${top.pares[0].años1.join(', ')}) y ${top.pares[0].prov2} (años ${top.pares[0].años2.join(', ')}) se alternan con ${ars(totalMonto)} involucrados. Este patrón es consistente con acuerdos de reparto de mercado prohibidos por la Ley de Defensa de la Competencia.`,
    evidencia: top.pares.slice(0, 4).map(p => ({
      descripcion: `"${top.area}": ${p.prov1} (años ${p.años1.join(', ')}) vs ${p.prov2} (años ${p.años2.join(', ')})`,
      fuenteUrl: contratos[0].fuenteUrl,
    })),
    legal: {
      articulos: [C.norma!],
      severidad: 'grave',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
        ...ORGANISMOS,
        'CNDC — Comisión Nacional de Defensa de la Competencia (cndc.gob.ar)',
      ],
    },
  }
}

export function detectarAdendaPostAdjudicacion(contratos: Contrato[]): Señal | null {
  const C = cfg('detectarAdendaPostAdjudicacion')
  const MIN_PCT = (C.umbral_minimo_pct as number | undefined) ?? 50
  const GRAVE_PCT = (C.umbral_grave_pct as number | undefined) ?? 100
  const MIN_BASE = (C.umbral_minimo_base_pesos as number | undefined) ?? 5_000_000

  const TIPOS_BASE = ['LICITACI', 'CONCURSO', 'DIRECTA']
  const TIPOS_ADENDA = ['AMPLIACI', 'COMPLEMENTARIO', 'ADICIONAL']

  // Group by (proveedor, area, anio) and classify each contrato
  const grupos = new Map<string, { base: Contrato[]; adendas: Contrato[] }>()

  for (const c of contratos) {
    const prov = c.proveedor.trim().toUpperCase()
    const area = c.area.trim().toUpperCase()
    const key = `${prov}|||${area}|||${c.anio}`
    if (!grupos.has(key)) grupos.set(key, { base: [], adendas: [] })
    const g = grupos.get(key)!

    if (TIPOS_BASE.some(t => c.tipo.toUpperCase().includes(t))) {
      g.base.push(c)
    } else if (TIPOS_ADENDA.some(t => c.tipo.toUpperCase().includes(t))) {
      g.adendas.push(c)
    }
  }

  const hallazgos: {
    proveedor: string; area: string; anio: number
    montoBase: number; montoAdenda: number; pct: number; fuenteUrl: string
  }[] = []

  for (const [key, g] of grupos.entries()) {
    if (g.base.length === 0 || g.adendas.length === 0) continue
    const montoBase  = g.base.reduce((s, c) => s + c.monto, 0)
    const montoAdenda = g.adendas.reduce((s, c) => s + c.monto, 0)
    const pct = (montoAdenda / montoBase) * 100
    if (pct < MIN_PCT || montoBase < MIN_BASE) continue
    const [proveedor, area, anioStr] = key.split('|||')
    hallazgos.push({ proveedor, area, anio: parseInt(anioStr), montoBase, montoAdenda, pct, fuenteUrl: g.base[0].fuenteUrl })
  }

  if (hallazgos.length === 0) return null
  hallazgos.sort((a, b) => b.pct - a.pct)

  const top = hallazgos[0]

  return {
    tipologia: 'adenda_postajudicacion',
    score: Math.min(75, 55 + hallazgos.length * 4),
    titulo: `${hallazgos.length} contrato${hallazgos.length > 1 ? 's' : ''} con ampliaciones post-adjudicación superiores al 50% del valor original`,
    resumen: `Se detectaron ${hallazgos.length} caso${hallazgos.length > 1 ? 's' : ''} donde el monto total de ampliaciones o complementarios supera el 50% del contrato base. Caso principal: "${top.proveedor}" en "${top.area}" (${top.anio}): contrato base ${ars(top.montoBase)}, ampliado ${ars(top.montoAdenda)} (${top.pct.toFixed(0)}% de incremento). Las adendas masivas post-adjudicación permiten obtener contratos con precios artificialmente bajos y luego incrementarlos sin nuevo proceso competitivo.`,
    evidencia: hallazgos.slice(0, 4).map(h => ({
      descripcion: `${h.proveedor} (${h.anio}): base ${ars(h.montoBase)} → ampliado +${ars(h.montoAdenda)} (${h.pct.toFixed(0)}%)`,
      fuenteUrl: h.fuenteUrl,
    })),
    legal: {
      articulos: [C.norma!],
      severidad: top.pct >= GRAVE_PCT ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? ORGANISMOS,
    },
  }
}

export function detectarRedDeEmpresas(
  pares: { empresa1: string; empresa2: string; cuit1: string; cuit2: string; directoresCompartidos: string[] }[]
): Señal | null {
  if (pares.length === 0) return null
  const C = cfg('detectarRedDeEmpresas')

  // Iter 8.12: emitir cuits únicos para que SEÑALA conecte la señal a las
  // empresas en el grafo Neo4j.
  const cuits = Array.from(new Set(pares.flatMap(p => [p.cuit1, p.cuit2]).filter(Boolean)))

  return {
    tipologia: 'red_de_empresas',
    score: 88,
    titulo: `${pares.length} par${pares.length > 1 ? 'es' : ''} de proveedores vinculados por 2 o más directores en común`,
    resumen: `Se identificaron ${pares.length} par${pares.length > 1 ? 'es' : ''} de empresas proveedoras del municipio que comparten 2 o más directores en sus órganos de administración. La vinculación directiva entre empresas que compiten en licitaciones o se complementan en contratos constituye un indicio de posible colusión o grupo económico no declarado que distorsiona la competencia.`,
    evidencia: pares.slice(0, 5).map(p => ({
      descripcion: `${p.empresa1} y ${p.empresa2} comparten ${p.directoresCompartidos.length} directores: ${p.directoresCompartidos.join(', ')}`,
      fuenteUrl: `https://www.cuitonline.com/search.php?q=${encodeURIComponent(p.empresa1)}`,
    })),
    legal: {
      articulos: [C.norma!],
      severidad: 'grave',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
        ...ORGANISMOS,
        'CNDC — Comisión Nacional de Defensa de la Competencia (cndc.gob.ar)',
        'Fiscalía Federal de Córdoba',
      ],
    },
    cuits,
  }
}

// ─── Conflicto funcionario↔proveedor (Iter4 análisis-datos) ────────────────
//
// Cruce nuevo apoyado en agentes_publicos (cargado en M1.2 + M1.3 — 178K
// funcionarios provinciales y municipales) contra la lista de proveedores.
// Es la primera señal "ARGOS-only" que combina dos tablas que estaban
// dormidas: agentes_publicos + cualquier base de identidad jurídica.
//
// Estrategia de match (tier explícito en cada hit):
//   Tier 1 (cuit_exact)      — funcionario.cuit === empresa.cuit del proveedor
//   Tier 2 (apellido_norm)   — apellido_nombre normalizado matchea proveedor
//                              (riesgo de homonimia, requiere verificación)
//
// Score 95 (grave) si hay al menos un hit Tier 1.
// Score 75 (moderada) si solo hay hits Tier 2.

export interface AgentePublicoLite {
  apellido_nombre: string
  cuit: string | null
  jurisdiccion: string
  reparticion: string | null
  cargo: string | null
  anio: number
  fuente_url: string
}

interface ConflictoHit {
  funcionario: AgentePublicoLite
  proveedor: string
  contratosCount: number
  monto: number
  tier: 1 | 2
  metodo: 'cuit_exact' | 'apellido_norm'
}

function normalizarApellidoNombre(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function detectarConflictoFuncionarioProveedor(
  contratos: Contrato[],
  agentes: AgentePublicoLite[],
  empresas?: Map<string, EmpresaEnriquecida>
): Señal | null {
  if (agentes.length === 0 || contratos.length === 0) return null

  const proveedoresMap = agruparPorProveedor(contratos)

  // Index funcionarios por nombre normalizado y por CUIT (para Tier 1).
  const porApellido = new Map<string, AgentePublicoLite>()
  const porCuit = new Map<string, AgentePublicoLite>()
  for (const a of agentes) {
    if (a.apellido_nombre) {
      const k = normalizarApellidoNombre(a.apellido_nombre)
      // Conservar la entrada más reciente por nombre (anio mayor)
      const existing = porApellido.get(k)
      if (!existing || a.anio > existing.anio) porApellido.set(k, a)
    }
    if (a.cuit && /^\d{11}$/.test(a.cuit)) porCuit.set(a.cuit, a)
  }

  const hits: ConflictoHit[] = []
  for (const [key, cs] of proveedoresMap) {
    const display = cs[0].proveedor
    const monto = montoTotal(cs)

    // Tier 1: si tenemos CUIT del proveedor (vía empresas) y matchea con CUIT
    // de un funcionario.
    const empresa = empresas?.get(display) ?? empresas?.get(cs[0].proveedor)
    if (empresa?.cuit) {
      const fEx = porCuit.get(empresa.cuit)
      if (fEx) {
        hits.push({ funcionario: fEx, proveedor: display, contratosCount: cs.length, monto, tier: 1, metodo: 'cuit_exact' })
        continue
      }
    }

    // Tier 2: match por apellido_nombre normalizado del proveedor (solo
    // cuando el proveedor parece persona física — heurística: 2-4 palabras
    // sin tipo societario común). Evita matchear "ACME S.A." contra
    // "Pérez García".
    const provNorm = normalizarApellidoNombre(key) // key ya viene normalizada
    const palabras = provNorm.split(' ').filter(Boolean)
    if (palabras.length < 2 || palabras.length > 4) continue

    const fNm = porApellido.get(provNorm)
    if (fNm) {
      hits.push({ funcionario: fNm, proveedor: display, contratosCount: cs.length, monto, tier: 2, metodo: 'apellido_norm' })
    }
  }

  if (hits.length === 0) return null

  hits.sort((a, b) => a.tier - b.tier || b.monto - a.monto)
  const tieneTier1 = hits.some(h => h.tier === 1)
  const totalMonto = hits.reduce((s, h) => s + h.monto, 0)
  const cuits = hits.map(h => h.funcionario.cuit).filter((x): x is string => !!x)

  const C = cfg('detectarConflictoFuncionarioProveedor')
  const score = tieneTier1 ? 95 : 75

  return {
    tipologia: 'conflicto_funcionario_proveedor',
    score,
    titulo: `${hits.length} posible${hits.length > 1 ? 's' : ''} cruce${hits.length > 1 ? 's' : ''} funcionario↔proveedor (${hits.filter(h => h.tier === 1).length} Tier 1, ${hits.filter(h => h.tier === 2).length} Tier 2)`,
    resumen: `Se detectó al menos una persona registrada como funcionaria pública (agentes_publicos) cuyo nombre o CUIT coincide con un proveedor del Estado. ${tieneTier1 ? 'Hay al menos un hit Tier 1 (CUIT exacto) — fuerte indicio de incompatibilidad bajo Ley 25.188 art. 13 inc. a.' : 'Los hits son Tier 2 (match por apellido normalizado) — requieren verificación contra biografía pública para descartar homonimia.'} Total acumulado en ${hits.reduce((s, h) => s + h.contratosCount, 0)} contrato(s) por ${ars(totalMonto)}.`,
    evidencia: hits.slice(0, 5).map(h => ({
      descripcion: `${h.funcionario.apellido_nombre} (${h.funcionario.cargo ?? h.funcionario.jurisdiccion}, ${h.funcionario.reparticion ?? '—'}) figura como proveedor "${h.proveedor}" — ${h.contratosCount} contrato(s) por ${ars(h.monto)}. Match Tier ${h.tier} (${h.metodo}).`,
      fuenteUrl: h.funcionario.fuente_url,
    })),
    legal: {
      articulos: [C.norma!],
      severidad: tieneTier1 ? 'grave' : 'moderada',
      denunciarAnte: (C.denunciar_ante as string[] | undefined) ?? [
        ...ORGANISMOS,
        'Oficina Anticorrupción (oa.gob.ar)',
      ],
    },
    cuits,
  }
}

// ─── Aparición en datasets internacionales (post-MVP — OpenSanctions/ICIJ) ──

// Riesgos que disparan la señal. PEP solo no la dispara — estar en lista de
// PEPs es información, no necesariamente delito. Los offshore/sanción/crimen
// sí son indicadores de actividad ilegal o jurisdicciones opacas.
const RIESGOS_OFFSHORE: Array<NonNullable<OSMatch['riesgo']>> = [
  'sancionado',
  'offshore',
  'crimen',
]

export function detectarAparicionOffshore(
  contratos: Contrato[],
  empresas: Map<string, EmpresaEnriquecida>,
  osMatches: Map<string, OSMatch>
): Señal | null {
  if (osMatches.size === 0 || empresas.size === 0 || contratos.length === 0) {
    return null
  }
  const proveedoresMap = agruparPorProveedor(contratos)

  // El caller arma `empresas` keyed por nombre (no necesariamente normalizado).
  // Construimos un map auxiliar con keys normalizadas para matchear con el
  // bucketing de proveedoresMap.
  const empresasNorm = new Map<string, EmpresaEnriquecida>()
  for (const [k, v] of empresas) {
    empresasNorm.set(normalizarProveedor(k), v)
  }

  type Hit = { proveedor: string; cuit: string; match: OSMatch; monto: number; cantidad: number }
  const hits: Hit[] = []

  for (const [, cs] of proveedoresMap) {
    const displayName = cs[0].proveedor
    const emp =
      empresas.get(displayName) ??                           // exact match primero
      empresasNorm.get(normalizarProveedor(displayName))     // fallback normalizado
    if (!emp?.cuit) continue
    const match = osMatches.get(emp.cuit)
    if (!match || !match.matched || !match.riesgo) continue
    if (!RIESGOS_OFFSHORE.includes(match.riesgo)) continue
    hits.push({
      proveedor: displayName,
      cuit: emp.cuit,
      match,
      monto: montoTotal(cs),
      cantidad: cs.length,
    })
  }

  if (hits.length === 0) return null
  hits.sort((a, b) => b.monto - a.monto)

  const totalMonto = hits.reduce((s, x) => s + x.monto, 0)
  const cuits = hits.map(h => h.cuit)
  const tieneOffshore = hits.some(h => h.match.riesgo === 'offshore')
  const tieneSancion = hits.some(h => h.match.riesgo === 'sancionado')

  const C = cfg('detectarAparicionOffshore')

  // Lista de organismos: extiende ORGANISMOS con UIF + Procuración cuando hay
  // offshore o sanción internacional (relevancia federal/internacional).
  const denunciarAnte = (C.denunciar_ante as string[] | undefined) ?? [
    ...ORGANISMOS,
    'UIF — Unidad de Información Financiera (uif.gob.ar)',
    'Procuración del Tesoro de la Nación',
  ]

  return {
    tipologia: 'aparicion_offshore',
    score: tieneSancion ? 95 : tieneOffshore ? 92 : 88,
    titulo: `${hits.length} proveedor${hits.length > 1 ? 'es' : ''} con vínculos en datasets internacionales (${[...new Set(hits.map(h => h.match.riesgo))].join('/')})`,
    resumen: `Se detectaron ${hits.length} empresa(s) proveedora(s) del Estado, por ${ars(totalMonto)} acumulado en ${hits.reduce((s, h) => s + h.cantidad, 0)} contratos, con presencia en bases internacionales de riesgo (ICIJ Offshore Leaks, sanciones internacionales o investigaciones criminales). La aparición en estas bases constituye un fuerte indicador de uso de jurisdicciones opacas, posibles operaciones de lavado o de actividades sancionadas globalmente.`,
    evidencia: hits.slice(0, 5).map(h => ({
      descripcion: `${h.proveedor} (CUIT ${h.cuit}, ${ars(h.monto)}): ${h.match.riesgo} — ${h.match.entidadCaption ?? h.match.datasetPrincipal ?? 'OpenSanctions match'}`,
      fuenteUrl: h.match.entidadUrl ?? `https://www.opensanctions.org/search/?q=${encodeURIComponent(h.proveedor)}`,
    })),
    legal: {
      articulos: [C.norma!],
      severidad: 'grave',
      denunciarAnte,
    },
    cuits,
  }
}

// ─── Orquestador ──────────────────────────────────────────────────────────────

export async function calcularSeñales(
  contratos: Contrato[],
  empresas?: Map<string, EmpresaEnriquecida>,
  municipioId?: string,
  osMatches?: Map<string, OSMatch>,
  agentes?: AgentePublicoLite[]
): Promise<Señal[]> {
  const señales: Señal[] = []

  // Señales determinísticas (síncronas)
  const detectoresSinc = [
    detectarProrrogas,
    detectarConcentracion,
    detectarConcentracionPorCuit, // C5: variante Tier 1 sobre proveedorCuit
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

  // Señal de conflicto funcionario↔proveedor — Iter4 análisis-datos.
  // Activa la tabla agentes_publicos contra los contratos para detectar
  // posibles incompatibilidades bajo Ley 25.188 art. 13.
  if (agentes && agentes.length > 0) {
    try {
      const s = detectarConflictoFuncionarioProveedor(contratos, agentes, empresas)
      if (s) señales.push(s)
    } catch (err) { console.error('[signals] Error en conflicto_funcionario_proveedor:', err) }
  }

  // Señal de cruce internacional (requiere AFIP + cache OpenSanctions)
  if (empresas && empresas.size > 0 && osMatches && osMatches.size > 0) {
    try {
      const s = detectarAparicionOffshore(contratos, empresas, osMatches)
      if (s) señales.push(s)
    } catch (err) { console.error('[signals] Error en aparicion_offshore:', err) }
  }

  // Señales de red (requieren Neo4j con directores cargados)
  if (isGraphAvailable() && municipioId) {
    try {
      const pares = await getDirectoresCompartidos(municipioId)
      const s = detectarDirectoresCompartidos(pares)
      if (s) señales.push(s)
    } catch (err) { console.error('[signals] Error en directores_compartidos:', err) }

    try {
      const pares = await getRedDeEmpresas(municipioId, 2)
      const s = detectarRedDeEmpresas(pares)
      if (s) señales.push(s)
    } catch (err) { console.error('[signals] Error en red_de_empresas:', err) }
  }

  // Señales de comportamiento coordinado (síncronas)
  try { const s = detectarRotacionCoordinada(contratos); if (s) señales.push(s) }
  catch (err) { console.error('[signals] Error en rotacion_coordinada:', err) }

  try { const s = detectarAdendaPostAdjudicacion(contratos); if (s) señales.push(s) }
  catch (err) { console.error('[signals] Error en adenda_postajudicacion:', err) }

  return señales.sort((a, b) => b.score - a.score)
}
