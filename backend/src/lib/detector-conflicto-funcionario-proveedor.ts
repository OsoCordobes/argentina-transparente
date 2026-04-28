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
  maxDnisIGJ?: number          // descartar apellidos demasiado comunes (default 3)
  minMonto?: number            // descartar contratos muy chicos (default 0)
} = {}): Promise<CruceCandidato[]> {
  const maxDnis = opts.maxDnisIGJ ?? 3
  const minMonto = opts.minMonto ?? 0
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

  // Enriquecer cada candidato con sus reparticiones/cargos + URLs específicas
  for (const c of grouped.values()) {
    const meta = await dbAll<{ reparticion: string | null; cargo: string | null }>(
      `SELECT DISTINCT reparticion, cargo
         FROM agentes_publicos
        WHERE ${NORM_SQL('apellido_nombre')} = ?
          AND jurisdiccion = ?`,
      [c.funcionario_norm, c.jurisdiccion]
    )
    c.reparticiones = [...new Set(meta.map(m => m.reparticion).filter((x): x is string => !!x))].slice(0, 5)
    c.cargos = [...new Set(meta.map(m => m.cargo).filter((x): x is string => !!x))].slice(0, 5)

    // URLs reales de los contratos de la empresa con este municipio
    const urls = await dbAll<{ fuente_url: string }>(
      `SELECT DISTINCT fuente_url
         FROM contratos
        WHERE municipio = ?
          AND (proveedor_norm = ? OR proveedor_norm = ?)
        LIMIT 5`,
      [c.jurisdiccion, c.empresa.toUpperCase(), c.empresa.toUpperCase().replace(/\./g, '')]
    )
    c.fuente_url_contratos = urls.map(u => u.fuente_url).filter(u => !!u)
  }

  return [...grouped.values()].sort((a, b) => b.monto_total - a.monto_total)
}

/**
 * Convierte un candidato en una Señal estándar de ARGOS.
 */
export function candidatoASeñal(c: CruceCandidato): Señal {
  // Score: monto + rareza apellido. Cap a 95 (nunca 100 sin verificación DNI).
  const scoreMonto = Math.min(50, Math.log10(Math.max(c.monto_total, 1)) * 6)
  const scoreRareza = (4 - c.unique_dnis_igj) * 8  // 24/16/8 puntos por 1/2/3 DNIs
  const score = Math.min(95, Math.round(scoreMonto + scoreRareza + 30))

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const evidencia: EvidenciaItem[] = [
    {
      descripcion: `Funcionario "${c.funcionario}" (${c.jurisdiccion}, áreas: ${c.reparticiones.join(', ') || 'sin datos'}) tiene apellido_nombre normalizado idéntico al del director DNI ${c.dni_director} de la empresa "${c.empresa}" (CUIT ${c.cuit_empresa}). Esa empresa recibió ${c.contratos_count} contrato(s) por $${Math.round(c.monto_total).toLocaleString('es-AR')} del mismo municipio del funcionario.`,
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

/**
 * Pipeline completo: encontrar candidatos → convertir a señales → persistir
 * en señales_cache. Crea snapshot para trazabilidad.
 */
export async function ejecutarDetector(opts: {
  municipios?: string[]
  maxDnisIGJ?: number
  minMonto?: number
  reemplazarExistentes?: boolean
} = {}): Promise<{ snapshotId: string; insertadas: number; candidatos: number }> {
  const start = Date.now()
  const snap = await crearSnapshot({
    seedId: 'detector:conflicto_funcionario_proveedor',
    fuenteUrl: 'internal://duckdb',
    hashArchivo: crypto.createHash('sha256').update(`detector-${start}`).digest('hex').slice(0, 16),
    filasLeidas: 0,
    notas: `maxDnisIGJ=${opts.maxDnisIGJ ?? 3}, minMonto=${opts.minMonto ?? 0}, mun=${(opts.municipios ?? ['*']).join(',')}`,
  })

  const candidatos = await encontrarCrucesCandidatos(opts)

  if (opts.reemplazarExistentes) {
    await dbRun(`DELETE FROM señales_cache WHERE tipologia = 'conflicto_funcionario_proveedor'`)
  }

  let insertadas = 0
  for (const c of candidatos) {
    const señal = candidatoASeñal(c)
    if (opts.municipios?.length && !opts.municipios.includes(c.jurisdiccion)) continue
    await insertSeñalCache(c.jurisdiccion, señal)
    insertadas++
  }

  await dbRun(
    `UPDATE snapshots
        SET filas_leidas = ?, filas_insertadas = ?, duracion_ms = ?, status = ?
      WHERE id = ?`,
    [candidatos.length, insertadas, Date.now() - start, 'success', snap.id]
  )

  return { snapshotId: snap.id, insertadas, candidatos: candidatos.length }
}
