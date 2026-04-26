/**
 * Identity resolver tiered (Phase F3).
 *
 * Resuelve la identidad de una empresa a partir de (nombre, cuit?) y
 * devuelve un IdentityMatch con tier explícito + score 0-100. Evita
 * los dos extremos malos:
 *   - exigir CUIT estricto (perdemos casos con CUIT no cargado),
 *   - matchear solo por nombre normalizado (falsos positivos por
 *     homónimos / razones sociales similares).
 *
 * Tiers:
 *   1 cuit_exact          score 100   — CUIT recibido coincide con empresas.cuit
 *   2 name_normalized     score  85   — normProveedor(nombre) === empresas.nombre upper
 *   3 name_fuzzy_high     score 70-99 — Levenshtein similarity ≥85% con un solo candidato
 *   4 llm_ambiguous       score 60-99 — Haiku desempata candidatos con 60-84% similitud
 *   5 no_match            score   0   — nada
 *
 * Todo resultado se cachea en `identity_matches` keyed por proveedor_norm.
 * La 2da invocación con el mismo nombre devuelve el cache sin re-escanear
 * `empresas` (y sin tocar el LLM).
 */

import { dbAll, dbRun, normProveedor } from './db'

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export type IdentityTier = 1 | 2 | 3 | 4 | 5

export type IdentityMethod =
  | 'cuit_exact'
  | 'name_normalized'
  | 'name_fuzzy_high'
  | 'llm_ambiguous'
  | 'no_match'

export interface IdentityMatch {
  cuit: string | null
  tier: IdentityTier
  score: number
  metodo: IdentityMethod
  candidatos_alternos?: string[]
}

// ─── LLM invoker inyectable ───────────────────────────────────────────────────
// Hook puntual para que los tests puedan mockear sin red. La implementación
// real (Tier 4) se introduce en F3.4 — por ahora el default tira a no_match.

export type LlmInvoker = (prompt: string) => Promise<string>

const noopLlmInvoker: LlmInvoker = async () => '{"match": false}'

let llmInvoker: LlmInvoker = noopLlmInvoker

export function _setLlmInvokerForTests(fn: LlmInvoker): void {
  llmInvoker = fn
}

export function _resetLlmInvokerForTests(): void {
  llmInvoker = noopLlmInvoker
}

// ─── Internos ─────────────────────────────────────────────────────────────────

interface EmpresaRow {
  cuit: string
  nombre: string
}

async function fetchEmpresas(): Promise<EmpresaRow[]> {
  return dbAll<EmpresaRow>(`SELECT cuit, nombre FROM empresas`)
}

async function lookupCache(proveedorNorm: string): Promise<IdentityMatch | null> {
  const rows = await dbAll<{
    cuit_resuelto: string | null
    tier: number
    score: number
    metodo: string
    candidatos_alternos: string | null
  }>(
    `SELECT cuit_resuelto, tier, score, metodo, candidatos_alternos
     FROM identity_matches WHERE proveedor_norm = ? LIMIT 1`,
    [proveedorNorm]
  )
  if (!rows[0]) return null
  const r = rows[0]
  let alternos: string[] | undefined
  if (r.candidatos_alternos) {
    try { alternos = JSON.parse(r.candidatos_alternos) as string[] } catch { /* malformed, ignore */ }
  }
  return {
    cuit: r.cuit_resuelto,
    tier: r.tier as IdentityTier,
    score: r.score,
    metodo: r.metodo as IdentityMethod,
    candidatos_alternos: alternos,
  }
}

async function persistMatch(proveedorNorm: string, m: IdentityMatch): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO identity_matches
     (proveedor_norm, cuit_resuelto, tier, score, metodo, candidatos_alternos, resuelto_en)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      proveedorNorm,
      m.cuit,
      m.tier,
      m.score,
      m.metodo,
      m.candidatos_alternos && m.candidatos_alternos.length > 0
        ? JSON.stringify(m.candidatos_alternos)
        : null,
      new Date().toISOString(),
    ]
  )
}

// ─── API pública ──────────────────────────────────────────────────────────────

/**
 * Resuelve la identidad de una empresa a partir de su nombre y CUIT opcional.
 * Cachea en `identity_matches`. La 2da llamada con el mismo nombre devuelve
 * el cache sin re-escanear `empresas`.
 */
export async function resolverEmpresa(
  nombre: string,
  cuit?: string,
): Promise<IdentityMatch> {
  const proveedorNorm = normProveedor(nombre)

  // 0. Cache hit — devolver sin tocar nada más.
  const cached = await lookupCache(proveedorNorm)
  if (cached) return cached

  const empresas = await fetchEmpresas()

  // 1. Tier 1 — CUIT exacto.
  if (cuit) {
    const cuitNorm = cuit.replace(/\D/g, '')
    const hit = empresas.find(e => e.cuit === cuitNorm)
    if (hit) {
      const match: IdentityMatch = {
        cuit: hit.cuit,
        tier: 1,
        score: 100,
        metodo: 'cuit_exact',
      }
      await persistMatch(proveedorNorm, match)
      return match
    }
  }

  // 2. Tier 2 — nombre normalizado coincide exacto.
  // normProveedor ya hace UPPER + trim + strip de S.A./S.R.L. Aplicamos lo
  // mismo al nombre del candidato para comparar manzana con manzana.
  const tier2 = empresas.find(e => normProveedor(e.nombre) === proveedorNorm)
  if (tier2) {
    const match: IdentityMatch = {
      cuit: tier2.cuit,
      tier: 2,
      score: 85,
      metodo: 'name_normalized',
    }
    await persistMatch(proveedorNorm, match)
    return match
  }

  // 3. Tier 3 — fuzzy >=85%, mejor candidato.
  // Computamos similitud con cada empresa una sola vez y partimos en buckets.
  // Importante: lazy require de levenshtein para no penalizar el cache hit path.
  const { similarityPct } = await import('./levenshtein')
  const scored = empresas.map(e => ({
    cuit: e.cuit,
    nombre: e.nombre,
    sim: similarityPct(proveedorNorm, normProveedor(e.nombre)),
  }))
  scored.sort((a, b) => b.sim - a.sim)

  const tier3 = scored[0]
  if (tier3 && tier3.sim >= 85) {
    const match: IdentityMatch = {
      cuit: tier3.cuit,
      tier: 3,
      score: tier3.sim,
      metodo: 'name_fuzzy_high',
    }
    await persistMatch(proveedorNorm, match)
    return match
  }

  // 4. Tier 4 — LLM desempata candidatos con 60-84% similitud (top 3).
  const ambiguos = scored.filter(s => s.sim >= 60 && s.sim < 85).slice(0, 3)
  if (ambiguos.length > 0) {
    const llmMatch = await intentarLlmMatch(nombre, ambiguos)
    if (llmMatch) {
      await persistMatch(proveedorNorm, llmMatch)
      return llmMatch
    }
  }

  // 5. Tier 5 — nada.
  const noMatch: IdentityMatch = {
    cuit: null,
    tier: 5,
    score: 0,
    metodo: 'no_match',
  }
  await persistMatch(proveedorNorm, noMatch)
  return noMatch
}

// ─── Tier 4 LLM fallback ──────────────────────────────────────────────────────

interface CandidatoLLM {
  cuit: string
  nombre: string
  sim: number
}

/**
 * Stub de Tier 4 que se completa en F3.4. Por ahora delega al llmInvoker
 * (mockeable desde tests) y parsea la respuesta JSON. Si el invoker no está
 * activado o el parseo falla, devuelve null y el caller cae a Tier 5.
 *
 * Contrato del invoker: recibe un prompt y devuelve string JSON con shape
 *   { match: bool, candidato_index: 1|2|3, score: 0-100, reason: string }
 */
async function intentarLlmMatch(
  nombre: string,
  candidatos: CandidatoLLM[],
): Promise<IdentityMatch | null> {
  if (candidatos.length === 0) return null

  const prompt = construirPromptLlm(nombre, candidatos)
  let raw: string
  try {
    raw = await llmInvoker(prompt)
  } catch {
    return null
  }

  let parsed: { match?: boolean; candidato_index?: number; score?: number; reason?: string }
  try {
    parsed = JSON.parse(raw)
  } catch {
    return null
  }

  if (!parsed.match) return null

  const idx = (parsed.candidato_index ?? 0) - 1
  const score = parsed.score ?? 0
  if (idx < 0 || idx >= candidatos.length) return null
  if (score < 70) return null

  const ganador = candidatos[idx]
  return {
    cuit: ganador.cuit,
    tier: 4,
    score: Math.min(99, Math.max(60, score)),
    metodo: 'llm_ambiguous',
    candidatos_alternos: candidatos.filter((_, i) => i !== idx).map(c => `${c.nombre} (CUIT ${c.cuit})`),
  }
}

function construirPromptLlm(nombre: string, candidatos: CandidatoLLM[]): string {
  const listado = candidatos
    .map((c, i) => `${i + 1}. "${c.nombre}" (CUIT ${c.cuit}, similitud ${c.sim}%)`)
    .join('\n')
  return `Sos un experto en identidad de empresas argentinas. Tengo un proveedor
y candidatos parciales.

Proveedor: "${nombre}"
Candidatos:
${listado}

Responde JSON estricto:
{"match": true|false, "candidato_index": 1|2|3, "score": 0-100, "reason": "..."}

Match true solo si estás muy seguro (>70 score). Si dudás, false.`
}
