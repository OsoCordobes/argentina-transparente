// detector-conflicto-funcionario-proveedor.ts (M4.1)
//
// Detecta funcionarios públicos cuyo apellido_nombre coincide con directores
// de empresas que aparecen como proveedores en contratos del MISMO municipio.
//
// CAVEAT IMPORTANTE: agentes_publicos no tiene DNI ni CUIT poblado. El match
// es por apellido_nombre normalizado. Para reducir false positives:
//
//   - Filtro 1: apellido normalizado matchea ≤3 DNIs únicos en igj_autoridades
//     (descarta nombres comunes como "GONZALEZ JOSE LUIS" que matchean cientos
//      de personas)
//   - Filtro 2: jurisdicción del funcionario = municipio del contrato (un
//     funcionario provincial dirigiendo proveedor del Capital es señal débil)
//   - Filtro 3: contrato existe (proveedor_norm aparece en contratos)
//
// Cada Señal generada lleva un score 0-100 calculado como:
//   score = min(100, log10(monto) * 10 + (10 - dnis_distintos) * 3)
//
// Y disclaimer en `evidencia` indicando que requiere verificación manual del
// DNI antes de considerar como evidencia legal.

import { dbAll, dbRun, insertSeñalCache } from './db'
import { crearSnapshot } from './snapshots'
import { upsertConflicto, isGraphAvailable } from './graph'
import crypto from 'crypto'
import type { Señal } from '../types/index'

type EvidenciaItem = { descripcion: string; fuenteUrl: string }
type MarcoLegal = { articulos: string[]; severidad: 'grave' | 'moderada' | 'leve'; denunciarAnte: string[] }

const ORGANISMOS_DENUNCIA = [
  'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
  'Fiscalía de Estado de Córdoba (fiscaliaestado.cba.gov.ar)',
  'Defensoría del Pueblo de Córdoba (defensoria.cba.gov.ar)',
]

const MARCO_LEGAL_BASE = [
  'Ley 25.188 — Ética Pública: incompatibilidades por interés económico (art. 13-15)',
  'Ley Provincial 8.835 — Carta del Ciudadano: prohibición de conflicto de intereses',
  'Código Civil y Comercial art. 159 — deber fiduciario de directores de sociedades',
]

export interface CruceCandidato {
  funcionario: string                 // apellido_nombre tal como en agentes_publicos
  funcionario_norm: string            // normalizado (UPPER + sin tildes)
  jurisdiccion: string                // jurisdiccion del funcionario (= municipio del contrato)
  reparticiones: string[]             // áreas/oficinas donde figura como agente
  cargos: string[]                    // cargos distintos que ostenta
  anios_funcionario: number[]         // años distintos donde aparece como agente
  anios_contrato: number[]            // años distintos de los contratos con la empresa
  overlap_temporal: boolean           // ¿hay solapamiento de años? (con tolerancia ±2)
  unique_dnis_igj: number             // # DNIs distintos en IGJ con este apellido (medida de rareza)
  apellido_freq_agentes: number       // # filas en agentes_publicos con apellido_nombre normalizado idéntico (base rate proxy)
  empresa: string                     // razón social
  cuit_empresa: string
  dni_director: string                // DNI tal como en igj_autoridades
  contratos_count: number
  monto_total: number
  fuente_url_contratos: string[]      // URLs canónicas de los contratos
  // ── PLAN-DATOS Fase C1: filtro geográfico + verificación DNI ─────────────
  dom_fiscal_provincia: string | null    // provincia del domicilio fiscal de la PJ (rns_personas_juridicas)
  coincide_provincia: 'si' | 'no' | 'desconocido'
  // DNI confirmado del funcionario (vía DDJJ u otra fuente externa). Si != null
  // y coincide con dni_director → verificación Tier 1 → cap-95. Si null → cap-60.
  dni_funcionario_confirmado: string | null
}

// Filtro geográfico (review #1 C1): mata el falso positivo estructural tipo
// MOSQUERA(funcionario cordoba-capital) ↔ Renault Argentina S.A. (director CABA).
// Logic delegada a lib/jurisdicciones.ts (fuente única de verdad — C3, C5
// y futuros detectores también la consumen).
import { coincideProvinciaJurisdiccion } from './jurisdicciones'

/**
 * Re-export para compat con tests existentes que importaban
 * coincideProvinciaFuncionario directamente. La firma es idéntica al
 * coincideProvinciaJurisdiccion del módulo compartido.
 */
export const coincideProvinciaFuncionario = coincideProvinciaJurisdiccion

const NORM_SQL = (col: string) =>
  `regexp_replace(strip_accents(UPPER(${col})), '[^A-Z\\s]', ' ', 'g')`

/**
 * Encuentra cruces funcionario↔director-proveedor con filtros estrictos.
 * No inserta nada — solo retorna candidatos para que el caller decida.
 */
export async function encontrarCrucesCandidatos(opts: {
  municipios?: string[]
  maxDnisIGJ?: number              // descartar apellidos demasiado comunes (default 3)
  minMonto?: number                // descartar contratos muy chicos (default 0)
  toleranciaAniosTemporal?: number // ±N años entre actividad funcionario y año contrato (default 2)
  excluirSinOverlap?: boolean      // si true, descarta cruces sin overlap temporal (default true)
  // PLAN-DATOS Fase C1: por defecto excluye crosses con coincide_provincia='no'
  // (mismatch geográfico confirmado). 'desconocido' SI se incluye — falta data
  // RNS, no falta evidencia. Pasar false para corridas exploratorias.
  excluirProvinciaDistinta?: boolean
} = {}): Promise<CruceCandidato[]> {
  const maxDnis = opts.maxDnisIGJ ?? 3
  const minMonto = opts.minMonto ?? 0
  const tolerancia = opts.toleranciaAniosTemporal ?? 2
  const excluirSinOverlap = opts.excluirSinOverlap ?? true
  const excluirProvinciaDistinta = opts.excluirProvinciaDistinta ?? true
  const municipiosFilter = opts.municipios?.length
    ? `AND f.jurisdiccion IN (${opts.municipios.map(m => `'${m.replace(/'/g, "''")}'`).join(',')})`
    : ''

  const rows = await dbAll<any>(`
    WITH
      funcs AS (
        SELECT DISTINCT
               apellido_nombre,
               ${NORM_SQL('apellido_nombre')} AS norm,
               jurisdiccion,
               reparticion,
               cargo
          FROM agentes_publicos
         WHERE apellido_nombre IS NOT NULL
           AND jurisdiccion IS NOT NULL
      ),
      funcs_raros AS (
        SELECT f.norm, COUNT(DISTINCT ia.numero_documento) AS dnis
          FROM funcs f
          JOIN igj_autoridades ia ON ${NORM_SQL('ia.apellido_nombre')} = f.norm
         GROUP BY f.norm
        HAVING COUNT(DISTINCT ia.numero_documento) BETWEEN 1 AND ${maxDnis}
      ),
      rns_dom AS (
        -- Dedup por cuit (RNS tiene snapshots mensuales). Tomamos un solo
        -- valor por cuit con ANY_VALUE — la provincia es estable entre snapshots.
        SELECT cuit,
               ANY_VALUE(dom_fiscal_provincia) AS dom_fiscal_provincia
          FROM rns_personas_juridicas
         WHERE cuit IS NOT NULL
           AND dom_fiscal_provincia IS NOT NULL
         GROUP BY cuit
      ),
      cruces_raw AS (
        SELECT f.apellido_nombre AS funcionario,
               f.norm AS funcionario_norm,
               f.jurisdiccion,
               r.dnis AS unique_dnis_igj,
               ie.razon_social AS empresa,
               ie.cuit AS cuit_empresa,
               ia.numero_documento AS dni_director,
               rns.dom_fiscal_provincia AS dom_fiscal_provincia
          FROM funcs f
          JOIN funcs_raros r ON r.norm = f.norm
          JOIN igj_autoridades ia ON ${NORM_SQL('ia.apellido_nombre')} = f.norm
          JOIN igj_entidades ie ON ie.numero_correlativo = ia.numero_correlativo
          LEFT JOIN rns_dom rns ON rns.cuit = ie.cuit
      ),
      contratos_agg AS (
        SELECT proveedor_norm, municipio,
               COUNT(*) AS cnt,
               SUM(monto) AS tot
          FROM contratos
         GROUP BY proveedor_norm, municipio
      )
    SELECT cr.funcionario, cr.funcionario_norm, cr.jurisdiccion,
           cr.unique_dnis_igj, cr.empresa, cr.cuit_empresa,
           cr.dni_director, cr.dom_fiscal_provincia, c.cnt, c.tot
      FROM cruces_raw cr
      JOIN contratos_agg c
        ON (UPPER(cr.empresa) = c.proveedor_norm
            OR UPPER(REPLACE(cr.empresa, '.', '')) = c.proveedor_norm)
       AND c.municipio = cr.jurisdiccion
     WHERE c.tot >= ${minMonto}
       ${municipiosFilter}
  `)

  // Dedupe por (funcionario+empresa) y agrupar reparticiones/cargos
  const grouped = new Map<string, CruceCandidato>()
  for (const r of rows) {
    const key = `${r.funcionario_norm}||${r.cuit_empresa}||${r.jurisdiccion}`
    if (!grouped.has(key)) {
      const domFiscal: string | null = r.dom_fiscal_provincia ?? null
      grouped.set(key, {
        funcionario: r.funcionario,
        funcionario_norm: r.funcionario_norm,
        jurisdiccion: r.jurisdiccion,
        reparticiones: [],
        cargos: [],
        anios_funcionario: [],
        anios_contrato: [],
        overlap_temporal: false,
        unique_dnis_igj: Number(r.unique_dnis_igj),
        apellido_freq_agentes: 0,  // populated abajo (base rate)
        empresa: r.empresa,
        cuit_empresa: r.cuit_empresa,
        dni_director: r.dni_director,
        contratos_count: Number(r.cnt),
        monto_total: Number(r.tot),
        fuente_url_contratos: [],  // populated below via separate query
        // PLAN-DATOS Fase C1: filtro geográfico + verificación DNI
        dom_fiscal_provincia: domFiscal,
        coincide_provincia: coincideProvinciaFuncionario(r.jurisdiccion, domFiscal),
        dni_funcionario_confirmado: null, // populado externamente cuando hay DDJJ + match
      })
    }
  }

  // Enriquecer cada candidato con metadata + URLs + años (filtro temporal)
  for (const c of grouped.values()) {
    const meta = await dbAll<{ reparticion: string | null; cargo: string | null; anio: number | null }>(
      `SELECT DISTINCT reparticion, cargo, anio
         FROM agentes_publicos
        WHERE ${NORM_SQL('apellido_nombre')} = ?
          AND jurisdiccion = ?`,
      [c.funcionario_norm, c.jurisdiccion]
    )
    c.reparticiones = [...new Set(meta.map(m => m.reparticion).filter((x): x is string => !!x))].slice(0, 5)
    c.cargos = [...new Set(meta.map(m => m.cargo).filter((x): x is string => !!x))].slice(0, 5)
    c.anios_funcionario = [...new Set(meta.map(m => m.anio).filter((x): x is number => x != null))].sort()

    // URLs + años reales de los contratos de la empresa con este municipio
    const urls = await dbAll<{ fuente_url: string; anio: number }>(
      `SELECT DISTINCT fuente_url, anio
         FROM contratos
        WHERE municipio = ?
          AND (proveedor_norm = ? OR proveedor_norm = ?)
        LIMIT 50`,
      [c.jurisdiccion, c.empresa.toUpperCase(), c.empresa.toUpperCase().replace(/\./g, '')]
    )
    c.fuente_url_contratos = [...new Set(urls.map(u => u.fuente_url).filter(u => !!u))].slice(0, 5)
    c.anios_contrato = [...new Set(urls.map(u => u.anio).filter((x): x is number => x != null))].sort()

    // Overlap temporal: hay al menos un año del funcionario dentro de [contrato.min - tolerancia, contrato.max + tolerancia]
    if (c.anios_funcionario.length > 0 && c.anios_contrato.length > 0) {
      const cMin = c.anios_contrato[0] - tolerancia
      const cMax = c.anios_contrato[c.anios_contrato.length - 1] + tolerancia
      c.overlap_temporal = c.anios_funcionario.some(a => a >= cMin && a <= cMax)
    }

    // Base rate: cuántos agentes_publicos comparten el mismo apellido_nombre
    // normalizado. Proxy de "rareza poblacional". 178K agentes total.
    // Si N=1 → posiblemente único; si N>20 → apellido común aunque IGJ diga raro.
    const fr = await dbAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM agentes_publicos
        WHERE ${NORM_SQL('apellido_nombre')} = ?`,
      [c.funcionario_norm]
    )
    c.apellido_freq_agentes = Number(fr[0]?.n ?? 0)
  }

  let all = [...grouped.values()].sort((a, b) => b.monto_total - a.monto_total)
  if (excluirSinOverlap) all = all.filter(c => c.overlap_temporal)
  // PLAN-DATOS Fase C1: descarta crosses con mismatch geográfico confirmado
  // (la PJ está en otra provincia que la del funcionario). 'desconocido' SI
  // pasa — no hay evidencia de mismatch, solo falta data RNS.
  if (excluirProvinciaDistinta) all = all.filter(c => c.coincide_provincia !== 'no')
  return all
}

// Cargos con poder real de adjudicación o influencia sobre contratos.
// Sumar bonus de score si el funcionario ostenta alguno.
const CARGOS_CON_PODER = [
  'DIRECTOR', 'DIRECTORA',
  'SECRETARIO', 'SECRETARIA',
  'SUBSECRETARIO', 'SUBSECRETARIA',
  'JEFE', 'JEFA',
  'GERENTE',
  'COORDINADOR', 'COORDINADORA',
  'INTENDENTE',
  'CONCEJAL', 'CONCEJALA',
  'MINISTRO', 'MINISTRA',
  'PRESIDENTE', 'PRESIDENTA',
]

function bonusPorCargo(cargos: string[]): number {
  const norm = cargos.map(c => c.toUpperCase())
  for (const palabra of CARGOS_CON_PODER) {
    if (norm.some(c => c.includes(palabra))) return 15
  }
  return 0
}

/**
 * Iter #4: factor de ajuste por base rate del apellido en agentes_publicos.
 * El conteo es un proxy poblacional (178K agentes provincia + capital).
 *
 * - apellido_freq ≤ 5    → factor 1.25 (apellido raro en padrón → matchea más)
 * - apellido_freq ≤ 20   → factor 1.0  (mid-rango, sin ajuste)
 * - apellido_freq ≤ 100  → factor 0.85 (común, baja confianza ligeramente)
 * - apellido_freq > 100  → factor 0.65 (muy común, baja confianza fuerte)
 *
 * Nota: el filtro IGJ (maxDnisIGJ ≤ 3) ya filtra apellidos raros en IGJ,
 * pero "raro en IGJ" puede coexistir con "muy común en padrón" — apellidos
 * humildes que no aparecen como directores de SA. Este factor ataca ese gap.
 */
export function factorBaseRate(apellido_freq_agentes: number): number {
  if (apellido_freq_agentes <= 5) return 1.25
  if (apellido_freq_agentes <= 20) return 1.0
  if (apellido_freq_agentes <= 100) return 0.85
  return 0.65
}

/**
 * Devuelve el cap de score apropiado según verificación de identidad.
 * PLAN-DATOS Fase C1:
 *   - Cap 60 cuando el DNI del funcionario NO está confirmado externamente.
 *     Score nunca llega a 'grave' (≥75) sin un humano que verifique.
 *   - Cap 95 cuando dni_funcionario_confirmado === dni_director (match Tier 1
 *     contra fuente externa como DDJJ). Score puede escalar hasta 95 — el
 *     último 5 queda como margen para auditoría judicial.
 */
export function capScoreSegunVerificacion(c: { dni_director: string; dni_funcionario_confirmado: string | null }): number {
  if (c.dni_funcionario_confirmado && c.dni_funcionario_confirmado === c.dni_director) {
    return 95 // DNI verificado → cap normal
  }
  return 60 // sin verificación → no puede escalar a 'grave'
}

/**
 * Convierte un candidato en una Señal estándar de ARGOS.
 *
 * Scoring:
 *   - Base: 30 puntos (señal Tier 2 sin verificación DNI)
 *   - Monto: log10(monto) * 6, max 50
 *   - Rareza: (4 - dnis) * 8 * factor base rate
 *   - Cargo con poder de adjudicación: +15
 *
 * Cap dinámico (C1):
 *   - 60 sin DNI confirmado → max severidad 'moderada'
 *   - 95 con DNI confirmado → max severidad 'grave'
 *
 * Filtro geográfico aplicado en encontrarCrucesCandidatos: este punto solo
 * recibe candidatos con coincide_provincia ∈ {'si', 'desconocido'}.
 */
export function candidatoASeñal(c: CruceCandidato): Señal {
  const scoreMonto = Math.min(50, Math.log10(Math.max(c.monto_total, 1)) * 6)
  const factor = factorBaseRate(c.apellido_freq_agentes)
  const scoreRareza = (4 - c.unique_dnis_igj) * 8 * factor
  const scoreCargo = bonusPorCargo(c.cargos)
  const cap = capScoreSegunVerificacion(c)
  const score = Math.min(cap, Math.round(scoreMonto + scoreRareza + scoreCargo + 30))

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const aniosFuncStr = c.anios_funcionario.length > 0
    ? `activo en ${c.anios_funcionario[0]}-${c.anios_funcionario[c.anios_funcionario.length - 1]}`
    : 'sin años registrados'
  const aniosContratoStr = c.anios_contrato.length > 0
    ? `${c.anios_contrato[0]}-${c.anios_contrato[c.anios_contrato.length - 1]}`
    : 'sin año'
  // Texto del filtro geográfico para evidencia (PLAN-DATOS Fase C1)
  const provinciaTxt =
    c.coincide_provincia === 'si'
      ? `Filtro geográfico OK: PJ tiene domicilio fiscal en ${c.dom_fiscal_provincia} (provincia compatible con ${c.jurisdiccion}).`
      : c.coincide_provincia === 'desconocido'
      ? `Filtro geográfico INCONCLUSO: la PJ no figura en el Registro Nacional de Sociedades (rns_personas_juridicas) o no declara provincia fiscal. Riesgo de cross-jurisdiccional no descartable.`
      : `Filtro geográfico FALLA: PJ tiene domicilio fiscal en ${c.dom_fiscal_provincia} pero el funcionario es de ${c.jurisdiccion}. NO debería haber pasado el filtro — bug si ves esta señal en cache.`

  const verifTxt =
    c.dni_funcionario_confirmado && c.dni_funcionario_confirmado === c.dni_director
      ? `DNI VERIFICADO: dni_funcionario_confirmado=${c.dni_funcionario_confirmado} coincide con director IGJ (cap-95).`
      : `VERIFICACIÓN PENDIENTE: el match es por apellido_nombre normalizado, no por DNI directo. El DNI ${c.dni_director} es del director IGJ; falta confirmar que coincide con el DNI del funcionario antes de considerar la señal como evidencia. Cap-60 hasta verificación humana — score nunca llega a 'grave' sin DNI confirmado.`

  const evidencia: EvidenciaItem[] = [
    {
      descripcion: `Funcionario "${c.funcionario}" (${c.jurisdiccion}, áreas: ${c.reparticiones.join(', ') || 'sin datos'}, ${aniosFuncStr}) tiene apellido_nombre normalizado idéntico al del director DNI ${c.dni_director} de la empresa "${c.empresa}" (CUIT ${c.cuit_empresa}). Esa empresa recibió ${c.contratos_count} contrato(s) por $${Math.round(c.monto_total).toLocaleString('es-AR')} del mismo municipio en ${aniosContratoStr}. Overlap temporal: ${c.overlap_temporal ? 'SÍ' : 'NO'}. ${provinciaTxt}`,
      fuenteUrl: c.fuente_url_contratos[0] ?? '',
    },
    ...c.fuente_url_contratos.slice(1).map(url => ({
      descripcion: `Contrato adicional con la empresa.`,
      fuenteUrl: url,
    })),
    {
      descripcion: `IMPORTANTE — ${verifTxt} Filtro de rareza: solo ${c.unique_dnis_igj} DNI(s) distinto(s) en IGJ con este apellido — bajo riesgo de homonimia pero no nulo.`,
      fuenteUrl: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c',
    },
  ]

  const legal: MarcoLegal = {
    severidad,
    articulos: MARCO_LEGAL_BASE,
    denunciarAnte: ORGANISMOS_DENUNCIA,
  }

  return {
    tipologia: 'conflicto_funcionario_proveedor',
    score,
    titulo: `Conflicto potencial: ${c.funcionario} (${c.jurisdiccion}) y ${c.empresa} ($${Math.round(c.monto_total).toLocaleString('es-AR')})`,
    resumen: `Posible conflicto de intereses: el funcionario ${c.funcionario} comparte apellido (raro: solo ${c.unique_dnis_igj} DNI(s) coinciden en IGJ) con el director DNI ${c.dni_director} de ${c.empresa}, empresa que tiene ${c.contratos_count} contrato(s) por un total de $${Math.round(c.monto_total).toLocaleString('es-AR')} con el mismo municipio. Requiere verificación manual del DNI del funcionario antes de denunciar.`,
    evidencia,
    legal,
  }
}

// ============================================================================
// M4.1 Iter #6 — Patrón sistémico (señal compuesta)
//
// Cuando un mismo funcionario aparece con apellido coincidente con directores
// de ≥2 empresas distintas que son proveedoras del mismo municipio, eso es
// evidencia más fuerte que un cruce individual: deja de ser "una coincidencia
// rara" y empieza a parecer un patrón sistémico.
//
// Esta señal compuesta NO reemplaza las individuales — convive con ellas en
// señales_cache (tipologia distinta) para que el dashboard muestre tanto la
// pieza agregada como las piezas individuales como evidencia.
// ============================================================================

export interface PatronEmpresa {
  razon_social: string
  cuit: string
  dni_director: string
  contratos_count: number
  monto: number
  fuente_urls: string[]
  anios_contrato: number[]
}

export interface CrucePatronSistemico {
  funcionario: string
  funcionario_norm: string
  jurisdiccion: string
  reparticiones: string[]
  cargos: string[]
  anios_funcionario: number[]
  unique_dnis_igj: number
  empresas: PatronEmpresa[]
  empresas_count: number
  contratos_total: number
  monto_total: number
  // PLAN-DATOS Fase C1: si todas las direcciones del patrón comparten el
  // mismo dni_director (y este coincide con el dni_funcionario_confirmado),
  // entonces el patrón puede escalar al cap-95.
  dni_funcionario_confirmado: string | null
}

/**
 * Agrupa candidatos por (funcionario_norm, jurisdiccion) y emite un patrón
 * sistémico cuando hay ≥`minEmpresas` empresas distintas. Las empresas vienen
 * ordenadas por monto descendente.
 */
export function aggregarPatronesSistemicos(
  candidatos: CruceCandidato[],
  minEmpresas = 2,
): CrucePatronSistemico[] {
  const grupos = new Map<string, CruceCandidato[]>()
  for (const c of candidatos) {
    const key = `${c.funcionario_norm}||${c.jurisdiccion}`
    const arr = grupos.get(key) ?? []
    arr.push(c)
    grupos.set(key, arr)
  }

  const patrones: CrucePatronSistemico[] = []
  for (const [, group] of grupos) {
    // Una empresa puede aparecer dos veces vía nombre+nombre-sin-puntos; dedup por CUIT
    const porCuit = new Map<string, CruceCandidato[]>()
    for (const g of group) {
      const arr = porCuit.get(g.cuit_empresa) ?? []
      arr.push(g)
      porCuit.set(g.cuit_empresa, arr)
    }
    if (porCuit.size < minEmpresas) continue

    const head = group[0]
    const reparticiones = [...new Set(group.flatMap(g => g.reparticiones))].slice(0, 8)
    const cargos = [...new Set(group.flatMap(g => g.cargos))].slice(0, 8)
    const aniosFunc = [...new Set(group.flatMap(g => g.anios_funcionario))].sort()

    const empresas: PatronEmpresa[] = [...porCuit.entries()].map(([cuit, items]) => {
      const monto = items.reduce((s, x) => s + x.monto_total, 0)
      const contratos = items.reduce((s, x) => s + x.contratos_count, 0)
      return {
        razon_social: items[0].empresa,
        cuit,
        dni_director: items[0].dni_director,
        contratos_count: contratos,
        monto,
        fuente_urls: [...new Set(items.flatMap(x => x.fuente_url_contratos))].slice(0, 5),
        anios_contrato: [...new Set(items.flatMap(x => x.anios_contrato))].sort(),
      }
    }).sort((a, b) => b.monto - a.monto)

    // dni_funcionario_confirmado del patrón = el del head si coincide en TODOS
    // los candidatos del grupo (mismo funcionario, una sola persona física).
    const dnis = new Set(group.map(g => g.dni_funcionario_confirmado).filter((x): x is string => !!x))
    const dniConfirmado = dnis.size === 1 ? group[0].dni_funcionario_confirmado : null
    patrones.push({
      funcionario: head.funcionario,
      funcionario_norm: head.funcionario_norm,
      jurisdiccion: head.jurisdiccion,
      reparticiones,
      cargos,
      anios_funcionario: aniosFunc,
      unique_dnis_igj: head.unique_dnis_igj,
      empresas,
      empresas_count: empresas.length,
      contratos_total: empresas.reduce((s, e) => s + e.contratos_count, 0),
      monto_total: empresas.reduce((s, e) => s + e.monto, 0),
      dni_funcionario_confirmado: dniConfirmado,
    })
  }

  return patrones.sort((a, b) => b.monto_total - a.monto_total)
}

/**
 * Convierte un patrón sistémico en una Señal compuesta.
 *
 * Scoring (más alto que el individual porque hay múltiples empresas como evidencia):
 *   - Base: 50 (Tier 2 + patrón replicado)
 *   - Monto: log10(monto_total) * 6, max 30
 *   - Rareza apellido: (4 - dnis) * 6, max 24
 *   - Cantidad de empresas: (empresas_count - 1) * 5, max 25
 *   - Cargo con poder: +15
 *   - Cap: 95 (sigue sin DNI verificado)
 */
export function patronASeñal(p: CrucePatronSistemico, apellidoFreqAgentes = 1): Señal {
  const scoreMonto = Math.min(30, Math.log10(Math.max(p.monto_total, 1)) * 6)
  const factor = factorBaseRate(apellidoFreqAgentes)
  const scoreRareza = Math.min(24, (4 - p.unique_dnis_igj) * 6 * factor)
  const scoreCantidad = Math.min(25, (p.empresas_count - 1) * 5)
  const scoreCargo = bonusPorCargo(p.cargos)
  // PLAN-DATOS Fase C1: cap-60 sin DNI verificado, cap-95 con DNI verificado.
  // El DNI del patrón debe coincidir con el dni_director de TODAS las empresas
  // implicadas — si un patrón tiene 3 empresas con 3 directores distintos
  // (homonimia distribuida), no se escala aunque haya verificación parcial.
  const algunDniNoCoincide = p.dni_funcionario_confirmado
    ? p.empresas.some(e => e.dni_director !== p.dni_funcionario_confirmado)
    : true
  const cap = (p.dni_funcionario_confirmado && !algunDniNoCoincide) ? 95 : 60
  const score = Math.min(cap, Math.round(50 + scoreMonto + scoreRareza + scoreCantidad + scoreCargo))

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const aniosFuncStr = p.anios_funcionario.length > 0
    ? `activo ${p.anios_funcionario[0]}-${p.anios_funcionario[p.anios_funcionario.length - 1]}`
    : 'sin años registrados'

  const empresasResumen = p.empresas
    .map(e => `${e.razon_social} (CUIT ${e.cuit}, DNI dir. ${e.dni_director}, $${Math.round(e.monto).toLocaleString('es-AR')})`)
    .join('; ')

  const evidencia: EvidenciaItem[] = [
    {
      descripcion: `PATRÓN SISTÉMICO: el funcionario "${p.funcionario}" (${p.jurisdiccion}, áreas: ${p.reparticiones.join(', ') || 'sin datos'}, ${aniosFuncStr}) comparte apellido_nombre normalizado con directores de ${p.empresas_count} empresas distintas que son proveedoras del mismo municipio. Total agregado: ${p.contratos_total} contrato(s) por $${Math.round(p.monto_total).toLocaleString('es-AR')}. Empresas: ${empresasResumen}.`,
      fuenteUrl: p.empresas[0]?.fuente_urls[0] ?? '',
    },
    ...p.empresas.flatMap(e => e.fuente_urls.slice(0, 2).map(url => ({
      descripcion: `Contrato municipio↔${e.razon_social}.`,
      fuenteUrl: url,
    }))),
    {
      descripcion: `IMPORTANTE — VERIFICACIÓN REQUERIDA: el match es por apellido_nombre normalizado, no por DNI directo. El patrón de ${p.empresas_count} empresas distintas con el mismo apellido raro (${p.unique_dnis_igj} DNI(s) IGJ) reduce la probabilidad de coincidencia por homonimia, pero no la elimina. Confirmar DNI del funcionario antes de denunciar.`,
      fuenteUrl: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c',
    },
  ]

  return {
    tipologia: 'conflicto_funcionario_multiproveedor',
    score,
    titulo: `Patrón sistémico: ${p.funcionario} (${p.jurisdiccion}) y ${p.empresas_count} empresas ($${Math.round(p.monto_total).toLocaleString('es-AR')})`,
    resumen: `Posible patrón sistémico de conflicto de intereses: el funcionario ${p.funcionario} comparte apellido (${p.unique_dnis_igj} DNI(s) coinciden en IGJ) con directores de ${p.empresas_count} empresas distintas que reciben en conjunto ${p.contratos_total} contrato(s) por $${Math.round(p.monto_total).toLocaleString('es-AR')} del mismo municipio. La replicación del patrón aumenta la fuerza de la señal sobre un cruce individual.`,
    evidencia,
    legal: {
      severidad,
      articulos: MARCO_LEGAL_BASE,
      denunciarAnte: ORGANISMOS_DENUNCIA,
    },
  }
}

/**
 * Pipeline completo: encontrar candidatos → convertir a señales individuales
 * + agregar patrones sistémicos → persistir en señales_cache. Crea snapshot.
 */
export async function ejecutarDetector(opts: {
  municipios?: string[]
  maxDnisIGJ?: number
  minMonto?: number
  reemplazarExistentes?: boolean
  minEmpresasPatron?: number   // mínimo empresas distintas para emitir señal sistémica (default 2)
} = {}): Promise<{
  snapshotId: string
  insertadas: number
  candidatos: number
  patronesSistemicos: number
  nodosGrafoCreados: number
}> {
  const start = Date.now()
  const minEmpresasPatron = opts.minEmpresasPatron ?? 2
  const snap = await crearSnapshot({
    seedId: 'detector:conflicto_funcionario_proveedor',
    fuenteUrl: 'internal://duckdb',
    hashArchivo: crypto.createHash('sha256').update(`detector-${start}`).digest('hex').slice(0, 16),
    filasLeidas: 0,
    notas: `maxDnisIGJ=${opts.maxDnisIGJ ?? 3}, minMonto=${opts.minMonto ?? 0}, mun=${(opts.municipios ?? ['*']).join(',')}, minEmpresasPatron=${minEmpresasPatron}`,
  })

  const candidatos = await encontrarCrucesCandidatos(opts)

  if (opts.reemplazarExistentes) {
    await dbRun(`DELETE FROM señales_cache WHERE tipologia = 'conflicto_funcionario_proveedor'`)
    await dbRun(`DELETE FROM señales_cache WHERE tipologia = 'conflicto_funcionario_multiproveedor'`)
    // Cleanup nodos :Conflicto en grafo si está disponible — la próxima
    // corrida los recreará con el snapshot nuevo. Idempotente.
    if (isGraphAvailable()) {
      const { listarConflictos } = await import('./graph')
      // Borrado por jurisdiccion(es) o todos si no hay filtro
      // (no exponemos delete genérico — preferimos recreate via MERGE).
      // El MERGE on id ya sobreescribe propiedades sin duplicar.
      void listarConflictos // referencia para tree-shake
    }
  }

  const detectadoEn = new Date().toISOString()
  const grafoOn = isGraphAvailable()
  let nodosGrafoCreados = 0

  let insertadas = 0
  for (const c of candidatos) {
    if (opts.municipios?.length && !opts.municipios.includes(c.jurisdiccion)) continue
    const señal = candidatoASeñal(c)
    await insertSeñalCache(c.jurisdiccion, señal)
    insertadas++

    if (grafoOn) {
      const conflictoId = crypto.createHash('sha256')
        .update(`${c.funcionario_norm}|${c.cuit_empresa}|${c.jurisdiccion}|conflicto_funcionario_proveedor`)
        .digest('hex')
      await upsertConflicto(
        {
          id: conflictoId,
          tipologia: 'conflicto_funcionario_proveedor',
          jurisdiccion: c.jurisdiccion,
          funcionarioNombre: c.funcionario,
          funcionarioNorm: c.funcionario_norm,
          funcionarioDni: null,  // M4.1 todavía sin DNI verificado
          score: señal.score,
          severidad: señal.legal.severidad,
          contratosTotal: c.contratos_count,
          montoTotal: c.monto_total,
          empresasCount: 1,
          detectadoEn,
          snapshotId: snap.id,
          fuenteUrls: c.fuente_url_contratos,
        },
        [{
          cuitEmpresa: c.cuit_empresa,
          empresaNombre: c.empresa,
          dniDirector: c.dni_director,
          contratos: c.contratos_count,
          monto: c.monto_total,
        }]
      )
      nodosGrafoCreados++
    }
  }

  // Iter #6: señales compuestas por patrón sistémico
  const patrones = aggregarPatronesSistemicos(candidatos, minEmpresasPatron)
  let patronesInsertados = 0
  for (const p of patrones) {
    if (opts.municipios?.length && !opts.municipios.includes(p.jurisdiccion)) continue
    // Pasamos el freq mínimo entre todos los candidatos del patrón —
    // si UN candidato es muy común, el patrón compuesto debe heredar la
    // confianza menor (más estricto).
    const freqMin = Math.min(...candidatos
      .filter(c => c.funcionario_norm === p.funcionario_norm && c.jurisdiccion === p.jurisdiccion)
      .map(c => c.apellido_freq_agentes), Infinity)
    const señal = patronASeñal(p, isFinite(freqMin) ? freqMin : 1)
    await insertSeñalCache(p.jurisdiccion, señal)
    patronesInsertados++
    insertadas++

    if (grafoOn) {
      const conflictoId = crypto.createHash('sha256')
        .update(`${p.funcionario_norm}|MULTI|${p.jurisdiccion}|conflicto_funcionario_multiproveedor`)
        .digest('hex')
      const todasUrls = [...new Set(p.empresas.flatMap(e => e.fuente_urls))].slice(0, 10)
      await upsertConflicto(
        {
          id: conflictoId,
          tipologia: 'conflicto_funcionario_multiproveedor',
          jurisdiccion: p.jurisdiccion,
          funcionarioNombre: p.funcionario,
          funcionarioNorm: p.funcionario_norm,
          funcionarioDni: null,
          score: señal.score,
          severidad: señal.legal.severidad,
          contratosTotal: p.contratos_total,
          montoTotal: p.monto_total,
          empresasCount: p.empresas_count,
          detectadoEn,
          snapshotId: snap.id,
          fuenteUrls: todasUrls,
        },
        p.empresas.map(e => ({
          cuitEmpresa: e.cuit,
          empresaNombre: e.razon_social,
          dniDirector: e.dni_director,
          contratos: e.contratos_count,
          monto: e.monto,
        }))
      )
      nodosGrafoCreados++
    }
  }

  await dbRun(
    `UPDATE snapshots
        SET filas_leidas = ?, filas_insertadas = ?, duracion_ms = ?, status = ?
      WHERE id = ?`,
    [candidatos.length, insertadas, Date.now() - start, 'success', snap.id]
  )

  return {
    snapshotId: snap.id,
    insertadas,
    candidatos: candidatos.length,
    patronesSistemicos: patronesInsertados,
    nodosGrafoCreados,
  }
}
