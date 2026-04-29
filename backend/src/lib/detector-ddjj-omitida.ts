// detector-ddjj-omitida.ts (PLAN-DATOS Fase C3)
//
// Detecta funcionarios obligados a presentar DDJJ patrimonial (Anexo III
// Ley 25.188 + Ley Provincial 8.835 Córdoba) que NO presentaron declaración
// para uno o más años en los que ocuparon cargo.
//
// Es una señal de IRREGULARIDAD ADMINISTRATIVA — no de corrupción directa.
// Por eso el cap es moderado (60) por default; severidad 'moderada' o 'leve'
// excepto cuando hay DNI confirmado AND múltiples años consecutivos.
//
// Match: por (apellido_nombre_norm + jurisdiccion + año). Cuando A4-A5
// pueblen DNIs en agentes_publicos, este detector se vuelve Tier 1 por
// match directo de DNI.

import { dbAll, dbRun, insertSeñalCache } from './db'
import { crearSnapshot } from './snapshots'
import crypto from 'crypto'
import type { Señal } from '../types/index'
import {
  CARGOS_OBLIGADOS_DDJJ_PATRONES,
  esCargoAltoRango,
  sqlCargoLike,
} from './cargos-conocidos'

const NORM_SQL = (col: string) =>
  `regexp_replace(strip_accents(UPPER(${col})), '[^A-Z\\s]', ' ', 'g')`

const ORGANISMOS_DENUNCIA_C3 = [
  'Oficina Anticorrupción Nacional',
  'Tribunal de Cuentas de Córdoba',
  'Fiscalía de Estado de Córdoba',
  'Defensoría del Pueblo de Córdoba',
]

const MARCO_LEGAL_C3 = [
  'Ley 25.188 — Ética Pública: obligación de DDJJ patrimonial integral (art. 4-12)',
  'Ley Provincial 8.835 — Carta del Ciudadano (Córdoba): DDJJ obligatoria para funcionarios',
  'Decreto 164/1999 — Reglamentario Ley 25.188 (Anexo III: cargos obligados)',
]

export interface CrucePuestoSinDDJJ {
  apellido_nombre: string
  apellido_nombre_norm: string
  jurisdiccion: string
  cargo: string
  reparticion: string | null
  anios_con_cargo: number[]          // años en los que figura como funcionario
  anios_con_ddjj: number[]           // años con DDJJ presentada (match por nombre)
  anios_omitidos: number[]           // anios_con_cargo \ anios_con_ddjj
  bruto_promedio: number | null
  fuente_url: string
  // Si A4-A5 ya populó DNI:
  dni_funcionario: string | null     // populado solo si agentes_publicos.cuit ya backfilled
}

/**
 * Encuentra funcionarios obligados con años de cargo SIN DDJJ correspondiente.
 *
 * Filtros:
 *   - cargo MATCH cualquier patrón Anexo III
 *   - tener al menos 1 año en agentes_publicos
 *   - tener al menos 1 año SIN DDJJ correspondiente (los con todo declarado
 *     se omiten — no son señal)
 */
export async function encontrarPuestosSinDDJJ(opts: {
  jurisdicciones?: string[]
  minAniosOmitidos?: number  // default 1 — emite incluso por una omisión simple
} = {}): Promise<CrucePuestoSinDDJJ[]> {
  const minAnios = opts.minAniosOmitidos ?? 1
  const jurisdiccionesFilter = opts.jurisdicciones?.length
    ? `AND jurisdiccion IN (${opts.jurisdicciones.map(j => `'${j.replace(/'/g, "''")}'`).join(',')})`
    : ''

  // Filtro de cargos obligados — usa helper compartido (lib/cargos-conocidos.ts)
  const cargoLike = sqlCargoLike('cargo', CARGOS_OBLIGADOS_DDJJ_PATRONES)

  // Funcionarios obligados (en agentes_publicos)
  type FuncObligado = {
    apellido_nombre: string
    apellido_nombre_norm: string
    jurisdiccion: string
    cargo: string
    reparticion: string | null
    anios: number[] | string
    bruto_promedio: number | null
    fuente_url: string
  }
  const funcionarios = await dbAll<FuncObligado>(`
    SELECT apellido_nombre,
           ${NORM_SQL('apellido_nombre')} AS apellido_nombre_norm,
           jurisdiccion,
           cargo,
           ANY_VALUE(reparticion) AS reparticion,
           LIST(DISTINCT anio) AS anios,
           AVG(bruto) AS bruto_promedio,
           ANY_VALUE(fuente_url) AS fuente_url
      FROM agentes_publicos
     WHERE apellido_nombre IS NOT NULL
       AND cargo IS NOT NULL
       AND anio IS NOT NULL
       AND (${cargoLike})
       ${jurisdiccionesFilter}
     GROUP BY apellido_nombre, jurisdiccion, cargo
  `)

  // DDJJ por (apellido_nombre_norm, año declarado)
  type DDJJEntry = { apellido_nombre_norm: string; anios: number[] | string }
  const ddjjs = await dbAll<DDJJEntry>(`
    SELECT apellido_nombre_norm,
           LIST(DISTINCT anio_declarado) AS anios
      FROM declaraciones_juradas
     WHERE apellido_nombre_norm IS NOT NULL
       AND apellido_nombre_norm != ''
       AND anio_declarado IS NOT NULL
     GROUP BY apellido_nombre_norm
  `)
  const ddjjPorNorm = new Map<string, Set<number>>()
  for (const d of ddjjs) {
    const arr = Array.isArray(d.anios) ? d.anios : []
    ddjjPorNorm.set(d.apellido_nombre_norm, new Set(arr.map(Number)))
  }

  // Cruce
  const candidatos: CrucePuestoSinDDJJ[] = []
  for (const f of funcionarios) {
    const aniosCargoArr = Array.isArray(f.anios) ? f.anios.map(Number) : []
    if (aniosCargoArr.length === 0) continue
    const aniosCargo = new Set(aniosCargoArr)
    const aniosDDJJ = ddjjPorNorm.get(f.apellido_nombre_norm) ?? new Set<number>()
    const aniosOmitidos = [...aniosCargo].filter(a => !aniosDDJJ.has(a)).sort()
    if (aniosOmitidos.length < minAnios) continue
    candidatos.push({
      apellido_nombre: f.apellido_nombre,
      apellido_nombre_norm: f.apellido_nombre_norm,
      jurisdiccion: f.jurisdiccion,
      cargo: f.cargo,
      reparticion: f.reparticion,
      anios_con_cargo: [...aniosCargo].sort(),
      anios_con_ddjj: [...aniosDDJJ].filter(a => aniosCargo.has(a)).sort(),
      anios_omitidos: aniosOmitidos,
      bruto_promedio: f.bruto_promedio !== null ? Number(f.bruto_promedio) : null,
      fuente_url: f.fuente_url,
      dni_funcionario: null, // populado por A4-A5 cuando aplique
    })
  }
  return candidatos.sort((a, b) => b.anios_omitidos.length - a.anios_omitidos.length)
}

/**
 * Convierte un cruce en una Señal.
 *
 * Scoring (señal administrativa, cap 60 default):
 *   - Base: 40
 *   - Cargo de alto rango (Ministro, Director, Secretario, Concejal): +15
 *   - Años omitidos consecutivos: +5 por año, max 30
 *   - Cap: 60 (irregularidad administrativa, no corrupción directa)
 *   - Cap: 75 si DNI confirmado y >= 3 años consecutivos omitidos
 *     (patrón sostenido + identidad verificada empieza a ser dolo)
 */
export function puestoSinDDJJASeñal(c: CrucePuestoSinDDJJ): Señal {
  const altoRango = esCargoAltoRango(c.cargo)
  const scoreCargo = altoRango ? 15 : 0
  const scoreAnios = Math.min(30, c.anios_omitidos.length * 5)
  const cap = (c.dni_funcionario && c.anios_omitidos.length >= 3) ? 75 : 60
  const score = Math.min(cap, 40 + scoreCargo + scoreAnios)

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const aniosStr = c.anios_omitidos.length === 1
    ? `${c.anios_omitidos[0]}`
    : `${c.anios_omitidos[0]}-${c.anios_omitidos[c.anios_omitidos.length - 1]} (${c.anios_omitidos.length} años)`

  const evidencia = [
    {
      descripcion: `${c.apellido_nombre} (${c.jurisdiccion}) ocupó el cargo "${c.cargo}"${c.reparticion ? ` en ${c.reparticion}` : ''} en los años ${c.anios_con_cargo.join(', ')} pero NO presentó Declaración Jurada Patrimonial Integral correspondiente a: ${aniosStr}. El cargo está obligado a declarar por el Anexo III de la Ley 25.188.`,
      fuenteUrl: c.fuente_url,
    },
    {
      descripcion: c.dni_funcionario
        ? `DNI VERIFICADO: ${c.dni_funcionario}. Match cross-tabla por DNI (Tier 1).`
        : `VERIFICACIÓN PENDIENTE: el match es por apellido_nombre normalizado (agentes_publicos.cuit aún no populado por A4-A5). Antes de denunciar, confirmar que el funcionario es realmente la misma persona que omitió declarar — homonimia no descartada.`,
      fuenteUrl: c.fuente_url,
    },
  ]

  return {
    tipologia: 'ddjj_omitida',
    score,
    titulo: `DDJJ omitida: ${c.apellido_nombre} (${c.cargo}, ${c.jurisdiccion}) — ${c.anios_omitidos.length} año${c.anios_omitidos.length === 1 ? '' : 's'}`,
    resumen: `${c.apellido_nombre} ocupa cargo de ${c.cargo} en ${c.jurisdiccion} (obligado a declarar) pero no figura DDJJ presentada para: ${aniosStr}. ${c.dni_funcionario ? 'DNI verificado.' : 'Match por nombre — verificar DNI antes de publicar.'}`,
    evidencia,
    legal: {
      severidad,
      articulos: MARCO_LEGAL_C3,
      denunciarAnte: ORGANISMOS_DENUNCIA_C3,
    },
  }
}

export async function ejecutarDetectorDDJJOmitida(opts: {
  jurisdicciones?: string[]
  minAniosOmitidos?: number
  reemplazarExistentes?: boolean
} = {}): Promise<{ snapshotId: string; insertadas: number; candidatos: number }> {
  const start = Date.now()
  const snap = await crearSnapshot({
    seedId: 'detector:ddjj_omitida',
    fuenteUrl: 'internal://duckdb',
    hashArchivo: crypto.createHash('sha256').update(`detector-c3-${start}`).digest('hex').slice(0, 16),
    filasLeidas: 0,
    notas: `jurisdicciones=${(opts.jurisdicciones ?? ['*']).join(',')}, minAnios=${opts.minAniosOmitidos ?? 1}`,
  })

  const candidatos = await encontrarPuestosSinDDJJ(opts)

  if (opts.reemplazarExistentes) {
    await dbRun(`DELETE FROM señales_cache WHERE tipologia = 'ddjj_omitida'`)
  }

  let insertadas = 0
  for (const c of candidatos) {
    const señal = puestoSinDDJJASeñal(c)
    await insertSeñalCache(c.jurisdiccion, señal, [])
    insertadas++
  }

  return { snapshotId: snap.id, insertadas, candidatos: candidatos.length }
}
