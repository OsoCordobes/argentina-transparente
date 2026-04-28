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
  empresa: string                     // razón social
  cuit_empresa: string
  dni_director: string                // DNI tal como en igj_autoridades
  contratos_count: number
  monto_total: number
  fuente_url_contratos: string[]      // URLs canónicas de los contratos
}

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
} = {}): Promise<CruceCandidato[]> {
  const maxDnis = opts.maxDnisIGJ ?? 3
  const minMonto = opts.minMonto ?? 0
  const tolerancia = opts.toleranciaAniosTemporal ?? 2
  const excluirSinOverlap = opts.excluirSinOverlap ?? true
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
      cruces_raw AS (
        SELECT f.apellido_nombre AS funcionario,
               f.norm AS funcionario_norm,
               f.jurisdiccion,
               r.dnis AS unique_dnis_igj,
               ie.razon_social AS empresa,
               ie.cuit AS cuit_empresa,
               ia.numero_documento AS dni_director
          FROM funcs f
          JOIN funcs_raros r ON r.norm = f.norm
          JOIN igj_autoridades ia ON ${NORM_SQL('ia.apellido_nombre')} = f.norm
          JOIN igj_entidades ie ON ie.numero_correlativo = ia.numero_correlativo
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
           cr.dni_director, c.cnt, c.tot
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
        empresa: r.empresa,
        cuit_empresa: r.cuit_empresa,
        dni_director: r.dni_director,
        contratos_count: Number(r.cnt),
        monto_total: Number(r.tot),
        fuente_url_contratos: [],  // populated below via separate query
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
  }

  const all = [...grouped.values()].sort((a, b) => b.monto_total - a.monto_total)
  return excluirSinOverlap ? all.filter(c => c.overlap_temporal) : all
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
 * Convierte un candidato en una Señal estándar de ARGOS.
 *
 * Scoring:
 *   - Base: 30 puntos (señal Tier 2 sin verificación DNI)
 *   - Monto: log10(monto) * 6, max 50
 *   - Rareza: (4 - dnis) * 8, max 24
 *   - Cargo con poder de adjudicación: +15
 *   - Cap: 95 (nunca 100 hasta DNI verificado)
 */
export function candidatoASeñal(c: CruceCandidato): Señal {
  const scoreMonto = Math.min(50, Math.log10(Math.max(c.monto_total, 1)) * 6)
  const scoreRareza = (4 - c.unique_dnis_igj) * 8
  const scoreCargo = bonusPorCargo(c.cargos)
  const score = Math.min(95, Math.round(scoreMonto + scoreRareza + scoreCargo + 30))

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const aniosFuncStr = c.anios_funcionario.length > 0
    ? `activo en ${c.anios_funcionario[0]}-${c.anios_funcionario[c.anios_funcionario.length - 1]}`
    : 'sin años registrados'
  const aniosContratoStr = c.anios_contrato.length > 0
    ? `${c.anios_contrato[0]}-${c.anios_contrato[c.anios_contrato.length - 1]}`
    : 'sin año'
  const evidencia: EvidenciaItem[] = [
    {
      descripcion: `Funcionario "${c.funcionario}" (${c.jurisdiccion}, áreas: ${c.reparticiones.join(', ') || 'sin datos'}, ${aniosFuncStr}) tiene apellido_nombre normalizado idéntico al del director DNI ${c.dni_director} de la empresa "${c.empresa}" (CUIT ${c.cuit_empresa}). Esa empresa recibió ${c.contratos_count} contrato(s) por $${Math.round(c.monto_total).toLocaleString('es-AR')} del mismo municipio en ${aniosContratoStr}. Overlap temporal: ${c.overlap_temporal ? 'SÍ' : 'NO'}.`,
      fuenteUrl: c.fuente_url_contratos[0] ?? '',
    },
    ...c.fuente_url_contratos.slice(1).map(url => ({
      descripcion: `Contrato adicional con la empresa.`,
      fuenteUrl: url,
    })),
    {
      descripcion: `IMPORTANTE — VERIFICACIÓN REQUERIDA: el match es por apellido_nombre normalizado, no por DNI directo (agentes_publicos no tiene DNI poblado). El DNI ${c.dni_director} es del director IGJ; falta confirmar que coincide con el DNI del funcionario antes de considerar la señal como evidencia. Filtro de rareza: solo ${c.unique_dnis_igj} DNI(s) distinto(s) en IGJ con este apellido — bajo riesgo de homonimia pero no nulo.`,
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
export function patronASeñal(p: CrucePatronSistemico): Señal {
  const scoreMonto = Math.min(30, Math.log10(Math.max(p.monto_total, 1)) * 6)
  const scoreRareza = Math.min(24, (4 - p.unique_dnis_igj) * 6)
  const scoreCantidad = Math.min(25, (p.empresas_count - 1) * 5)
  const scoreCargo = bonusPorCargo(p.cargos)
  const score = Math.min(95, Math.round(50 + scoreMonto + scoreRareza + scoreCantidad + scoreCargo))

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
    const señal = patronASeñal(p)
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
