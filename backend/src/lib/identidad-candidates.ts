import crypto from 'crypto'
import { dbRun, dbAll } from './db'

export type IdentidadTipo = 'persona' | 'empresa'
export type IdentidadMetodo =
  | 'dni_exact' | 'cuit_exact'
  | 'nombre_norm' | 'razon_social_norm'
  | 'levenshtein' | 'soundex'
  | 'manual_verification' | 'consensus'

export interface IdentidadCandidato {
  id: string
  tipo: IdentidadTipo
  fuenteA: string
  identificadorA: string
  fuenteB: string
  identificadorB: string
  tier: 1 | 2 | 3
  metodo: IdentidadMetodo
  score: number
  verificadoPorHumano: boolean
  verificadoEn: string | null
  verificadoPor: string | null
  notas: string | null
  createdAt: string
}

interface Row {
  id: string; tipo: string
  fuente_a: string; identificador_a: string
  fuente_b: string; identificador_b: string
  tier: number; metodo: string; score: number
  verificado_por_humano: boolean
  verificado_en: string | null
  verificado_por: string | null
  notas: string | null
  created_at: string
}

function fromRow(r: Row): IdentidadCandidato {
  const t = Number(r.tier)
  const tier: 1 | 2 | 3 = t === 1 ? 1 : t === 2 ? 2 : 3
  return {
    id: r.id,
    tipo: r.tipo as IdentidadTipo,
    fuenteA: r.fuente_a, identificadorA: r.identificador_a,
    fuenteB: r.fuente_b, identificadorB: r.identificador_b,
    tier,
    metodo: r.metodo as IdentidadMetodo,
    score: Number(r.score),
    verificadoPorHumano: !!r.verificado_por_humano,
    verificadoEn: r.verificado_en,
    verificadoPor: r.verificado_por,
    notas: r.notas,
    createdAt: r.created_at,
  }
}

export async function insertarCandidato(input: {
  tipo: IdentidadTipo
  fuenteA: string; identificadorA: string
  fuenteB: string; identificadorB: string
  tier: 1 | 2 | 3
  metodo: IdentidadMetodo
  score: number
  notas?: string
}): Promise<string> {
  // Idempotente: hash determinístico para evitar duplicar el mismo candidato.
  const id = crypto
    .createHash('sha256')
    .update(`${input.tipo}|${input.fuenteA}|${input.identificadorA}|${input.fuenteB}|${input.identificadorB}|${input.metodo}`)
    .digest('hex').slice(0, 32)

  await dbRun(
    `INSERT OR IGNORE INTO identidad_candidates
      (id, tipo, fuente_a, identificador_a, fuente_b, identificador_b,
       tier, metodo, score, verificado_por_humano, notas, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?, ?)`,
    [
      id, input.tipo, input.fuenteA, input.identificadorA,
      input.fuenteB, input.identificadorB,
      input.tier, input.metodo, input.score,
      input.notas ?? null, new Date().toISOString(),
    ]
  )
  return id
}

export async function listarCandidatos(filter: {
  tipo?: IdentidadTipo
  tier?: 1 | 2 | 3
  verificado?: boolean
  limit?: number
}): Promise<IdentidadCandidato[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.tipo)             { where.push('tipo = ?');                  params.push(filter.tipo) }
  if (filter.tier)             { where.push('tier = ?');                  params.push(filter.tier) }
  if (filter.verificado !== undefined) { where.push('verificado_por_humano = ?'); params.push(filter.verificado) }
  const sql = `SELECT * FROM identidad_candidates ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY tier, score DESC LIMIT ?`
  params.push(filter.limit ?? 200)
  const rows = await dbAll<Row>(sql, params)
  return rows.map(fromRow)
}

export async function verificarManualmente(
  id: string,
  confirmar: boolean,
  verificadoPor: string,
  notas?: string
): Promise<void> {
  // Si confirmar=true, promovemos a tier 1 con metodo='manual_verification'.
  // Si confirmar=false, lo dejamos marcado como verificado=true pero NO promovemos.
  // No borramos el row para preservar audit trail.
  const ahora = new Date().toISOString()
  if (confirmar) {
    if (notas) {
      await dbRun(
        `UPDATE identidad_candidates
         SET tier = 1, metodo = 'manual_verification',
             verificado_por_humano = true,
             verificado_en = ?, verificado_por = ?,
             notas = COALESCE(notas, '') || ' | confirmado: ' || ?
         WHERE id = ?`,
        [ahora, verificadoPor, notas, id]
      )
    } else {
      await dbRun(
        `UPDATE identidad_candidates
         SET tier = 1, metodo = 'manual_verification',
             verificado_por_humano = true,
             verificado_en = ?, verificado_por = ?
         WHERE id = ?`,
        [ahora, verificadoPor, id]
      )
    }
  } else {
    if (notas) {
      await dbRun(
        `UPDATE identidad_candidates
         SET verificado_por_humano = true,
             verificado_en = ?, verificado_por = ?,
             notas = COALESCE(notas, '') || ' | rechazado: ' || ?
         WHERE id = ?`,
        [ahora, verificadoPor, notas, id]
      )
    } else {
      await dbRun(
        `UPDATE identidad_candidates
         SET verificado_por_humano = true,
             verificado_en = ?, verificado_por = ?
         WHERE id = ?`,
        [ahora, verificadoPor, id]
      )
    }
  }
}

export async function contarCandidatosPorTier(): Promise<{ t1: number; t2: number; t3: number }> {
  const rows = await dbAll<{ tier: number; n: number | bigint }>(
    `SELECT tier, COUNT(*) as n FROM identidad_candidates GROUP BY tier`
  )
  const out = { t1: 0, t2: 0, t3: 0 }
  for (const r of rows) {
    const t = Number(r.tier)
    const n = Number(r.n)
    if (t === 1) out.t1 = n
    else if (t === 2) out.t2 = n
    else if (t === 3) out.t3 = n
  }
  return out
}

/**
 * Auto-promueve a T1 los candidatos T2/T3 cuando hay 2+ candidatos
 * independientes (fuente_a distinta) que apuntan al mismo identificador_b
 * con score ≥ minScore. Política "consenso multi-fuente".
 */
export async function autoPromoverPorConsenso(minScore = 0.85): Promise<number> {
  const grupos = await dbAll<{ identificador_b: string; n: number | bigint; max_score: number }>(
    `SELECT identificador_b,
            COUNT(DISTINCT fuente_a) as n,
            MAX(score) as max_score
     FROM identidad_candidates
     WHERE tier IN (2, 3)
       AND verificado_por_humano = false
       AND score >= ?
     GROUP BY identificador_b
     HAVING COUNT(DISTINCT fuente_a) >= 2`,
    [minScore]
  )

  let promoted = 0
  for (const g of grupos) {
    const ahora = new Date().toISOString()
    await dbRun(
      `UPDATE identidad_candidates
       SET tier = 1, metodo = 'consensus',
           verificado_por_humano = true,
           verificado_en = ?, verificado_por = 'sistema',
           notas = COALESCE(notas, '') || ' | auto-promoted via consensus (n=' || ? || ')'
       WHERE identificador_b = ? AND tier IN (2, 3) AND verificado_por_humano = false AND score >= ?`,
      [ahora, String(Number(g.n)), g.identificador_b, minScore]
    )
    promoted += Number(g.n)
  }
  return promoted
}
