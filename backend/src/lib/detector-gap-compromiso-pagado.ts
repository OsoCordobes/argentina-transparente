// detector-gap-compromiso-pagado.ts (PLAN-DATOS Fase C4)
//
// Detector financiero que compara las etapas 3 y 5 del ciclo presupuestario
// (compromiso vs pagado) por partida/programa para identificar deuda
// flotante anómala — dinero comprometido (orden firmada) pero NO pagado.
//
// Ciclo presupuestario Ley 24.156:
//   Crédito → Compromiso → Devengado → Pagado
//
// Es esperable que compromiso > pagado AL FINAL DEL EJERCICIO (deudas
// pendientes que cierran en el ejercicio siguiente). El detector señala
// ANOMALÍAS:
//
//   - gap absoluto > minMonto (default $1M): la deuda flotante es material
//   - gap_pct >= 30%: más de 1/3 de lo comprometido nunca se pagó —
//     potencial maquillaje de ejecución (firmar OCs sin intención de pagar)
//   - año cerrado (no es el ejercicio en curso): si gap persiste pasado
//     el cierre, es deuda real, no flujo normal
//
// Es señal financiera, NO de corrupción directa. Cap 80. Para escalar a
// "grave" (>=75) hace falta gap_pct alto + monto material + año cerrado.

import { dbAll, dbRun, insertSeñalCache } from './db'
import { crearSnapshot } from './snapshots'
import crypto from 'crypto'
import type { Señal } from '../types/index'

const ORGANISMOS_DENUNCIA_C4 = [
  'Tribunal de Cuentas de Córdoba',
  'Auditoría General de la Nación (cuando aplique nivel nacional)',
  'Sindicatura General de la Nación',
  'Fiscalía de Estado de Córdoba',
]

const MARCO_LEGAL_C4 = [
  'Ley 24.156 — Administración Financiera (etapas del gasto: compromiso, devengado, pagado)',
  'Ley Provincial 9.086 — Administración Financiera Córdoba',
  'Ley 25.917 — Régimen Federal de Responsabilidad Fiscal (límites a deuda flotante)',
]

export interface PartidaConGap {
  partida_id: string
  jurisdiccion: string
  anio: number
  trimestre: number | null
  programa: string | null
  partida: string | null
  partida_nombre: string | null
  credito_vigente: number | null
  compromiso: number
  devengado: number | null
  pagado: number
  gap_absoluto: number          // compromiso - pagado
  gap_pct: number               // gap / compromiso (0..1)
  fuente_url: string
}

/**
 * Encuentra partidas con gap compromiso↔pagado anómalo.
 *
 * Filtros:
 *   - compromiso > 0 (no se mide si nunca se comprometió)
 *   - pagado != null (excluimos partidas con etapa Pagado no reportada)
 *   - gap_pct >= minGapPct (default 30%)
 *   - gap_absoluto >= minGapAbs (default $1M)
 *   - opcionalmente: solo años cerrados (anio < anio actual)
 */
export async function encontrarPartidasConGap(opts: {
  jurisdicciones?: string[]
  minGapPct?: number          // 0..1, default 0.30
  minGapAbs?: number          // default 1_000_000
  soloAniosCerrados?: boolean // default true
} = {}): Promise<PartidaConGap[]> {
  const minGapPct = opts.minGapPct ?? 0.30
  const minGapAbs = opts.minGapAbs ?? 1_000_000
  const soloCerrados = opts.soloAniosCerrados ?? true

  // Review #1 C4: validación de inputs. Sin esto un caller que pasa
  // minGapPct: 30 (pensando 30% como entero) no genera señales y sin error
  // — silent no-output. Detect early and throw.
  if (minGapPct < 0 || minGapPct > 1) {
    throw new Error(
      `encontrarPartidasConGap: minGapPct debe estar en [0, 1] (fracción, no porcentaje). Recibido: ${minGapPct}`,
    )
  }
  if (minGapAbs < 0) {
    throw new Error(
      `encontrarPartidasConGap: minGapAbs debe ser >= 0. Recibido: ${minGapAbs}`,
    )
  }

  const anioActual = new Date().getFullYear()

  const jurisdiccionesFilter = opts.jurisdicciones?.length
    ? `AND jurisdiccion IN (${opts.jurisdicciones.map(j => `'${j.replace(/'/g, "''")}'`).join(',')})`
    : ''
  const aniosCerradosFilter = soloCerrados ? `AND anio < ${anioActual}` : ''

  const rows = await dbAll<{
    partida_id: string
    jurisdiccion: string
    anio: number
    trimestre: number | null
    programa: string | null
    partida: string | null
    partida_nombre: string | null
    credito_vigente: number | null
    compromiso: number
    devengado: number | null
    pagado: number
    gap_absoluto: number
    gap_pct: number
    fuente_url: string
  }>(`
    SELECT
      id AS partida_id,
      jurisdiccion,
      anio,
      trimestre,
      programa,
      partida,
      partida_nombre,
      credito_vigente,
      compromiso,
      devengado,
      pagado,
      (compromiso - pagado) AS gap_absoluto,
      CASE WHEN compromiso > 0 THEN (compromiso - pagado) / compromiso ELSE 0 END AS gap_pct,
      fuente_url
    FROM presupuesto_ejecucion
    WHERE compromiso IS NOT NULL
      AND compromiso > 0
      AND pagado IS NOT NULL
      AND (compromiso - pagado) >= ${minGapAbs}
      AND CASE WHEN compromiso > 0 THEN (compromiso - pagado) / compromiso ELSE 0 END >= ${minGapPct}
      ${jurisdiccionesFilter}
      ${aniosCerradosFilter}
    ORDER BY (compromiso - pagado) DESC
  `)

  return rows.map(r => ({
    partida_id: r.partida_id,
    jurisdiccion: r.jurisdiccion,
    anio: Number(r.anio),
    trimestre: r.trimestre !== null ? Number(r.trimestre) : null,
    programa: r.programa,
    partida: r.partida,
    partida_nombre: r.partida_nombre,
    credito_vigente: r.credito_vigente !== null ? Number(r.credito_vigente) : null,
    compromiso: Number(r.compromiso),
    devengado: r.devengado !== null ? Number(r.devengado) : null,
    pagado: Number(r.pagado),
    gap_absoluto: Number(r.gap_absoluto),
    gap_pct: Number(r.gap_pct),
    fuente_url: r.fuente_url,
  }))
}

/**
 * Convierte una partida con gap en una Señal.
 *
 * Scoring (cap 80 — señal financiera, no corrupción directa):
 *   - Base: 30
 *   - Monto absoluto del gap: log10(gap) * 5, max 25
 *   - Gap %: gap_pct * 30, max 30 (gap_pct=1 → +30, gap_pct=0.5 → +15)
 *   - Año cerrado >= 2 años pasados: +5 (gap viejo persistente)
 *   - Cap: 80
 *
 * Severidad: grave >= 75 (gap muy material + persistente),
 *            moderada >= 55, leve resto.
 */
export function partidaConGapASeñal(p: PartidaConGap): Señal {
  const anioActual = new Date().getFullYear()
  const aniosCerrado = anioActual - p.anio
  const scoreMonto = Math.min(25, Math.log10(Math.max(p.gap_absoluto, 1)) * 5)
  const scorePct = Math.min(30, p.gap_pct * 30)
  const scoreViejo = aniosCerrado >= 2 ? 5 : 0
  const score = Math.min(80, Math.round(30 + scoreMonto + scorePct + scoreViejo))

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const programaTxt = p.programa ?? '(sin programa)'
  const partidaTxt = p.partida ? `${p.partida}${p.partida_nombre ? ` ${p.partida_nombre}` : ''}` : '(sin partida)'

  const evidencia = [
    {
      descripcion: `Partida "${partidaTxt}" del programa "${programaTxt}" en ${p.jurisdiccion} (${p.anio}${p.trimestre ? ` Q${p.trimestre}` : ''}) tiene compromiso de $${Math.round(p.compromiso).toLocaleString('es-AR')} pero solo $${Math.round(p.pagado).toLocaleString('es-AR')} efectivamente pagado. Gap de $${Math.round(p.gap_absoluto).toLocaleString('es-AR')} (${(p.gap_pct * 100).toFixed(1)}% sin ejecutar). Año ya cerrado: la deuda flotante NO es flujo normal de cierre — es deuda real persistente.`,
      fuenteUrl: p.fuente_url,
    },
    {
      descripcion: `Etapas reportadas: crédito vigente=$${p.credito_vigente !== null ? Math.round(p.credito_vigente).toLocaleString('es-AR') : 'N/D'}, compromiso=$${Math.round(p.compromiso).toLocaleString('es-AR')}, devengado=$${p.devengado !== null ? Math.round(p.devengado).toLocaleString('es-AR') : 'N/D'}, pagado=$${Math.round(p.pagado).toLocaleString('es-AR')}. Si compromiso >> devengado: orden firmada sin entrega documentada (compromiso ficticio). Si devengado >> pagado: deuda con proveedores no saldada.`,
      fuenteUrl: p.fuente_url,
    },
  ]

  return {
    tipologia: 'gap_compromiso_pagado',
    score,
    titulo: `Deuda flotante: ${p.jurisdiccion} ${p.anio} — partida "${partidaTxt}" gap $${Math.round(p.gap_absoluto).toLocaleString('es-AR')} (${(p.gap_pct * 100).toFixed(0)}%)`,
    resumen: `La partida ${partidaTxt} del programa ${programaTxt} (${p.jurisdiccion} ${p.anio}) comprometió $${Math.round(p.compromiso).toLocaleString('es-AR')} pero pagó solo $${Math.round(p.pagado).toLocaleString('es-AR')}. Gap del ${(p.gap_pct * 100).toFixed(1)}% en año cerrado — posible compromiso ficticio o deuda flotante no saldada.`,
    evidencia,
    legal: {
      severidad,
      articulos: MARCO_LEGAL_C4,
      denunciarAnte: ORGANISMOS_DENUNCIA_C4,
    },
  }
}

export async function ejecutarDetectorGapCompromiso(opts: {
  jurisdicciones?: string[]
  minGapPct?: number
  minGapAbs?: number
  soloAniosCerrados?: boolean
  reemplazarExistentes?: boolean
} = {}): Promise<{ snapshotId: string; insertadas: number; candidatos: number }> {
  const start = Date.now()
  const snap = await crearSnapshot({
    seedId: 'detector:gap_compromiso_pagado',
    fuenteUrl: 'internal://duckdb',
    hashArchivo: crypto.createHash('sha256').update(`detector-c4-${start}`).digest('hex').slice(0, 16),
    filasLeidas: 0,
    notas: `minGapPct=${opts.minGapPct ?? 0.30}, minGapAbs=${opts.minGapAbs ?? 1_000_000}, soloCerrados=${opts.soloAniosCerrados ?? true}`,
  })

  const candidatos = await encontrarPartidasConGap(opts)

  if (opts.reemplazarExistentes) {
    await dbRun(`DELETE FROM señales_cache WHERE tipologia = 'gap_compromiso_pagado'`)
  }

  let insertadas = 0
  for (const c of candidatos) {
    const señal = partidaConGapASeñal(c)
    await insertSeñalCache(c.jurisdiccion, señal, [])
    insertadas++
  }

  return { snapshotId: snap.id, insertadas, candidatos: candidatos.length }
}
