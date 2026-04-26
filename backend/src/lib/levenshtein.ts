/**
 * Levenshtein distance + similarity helpers.
 *
 * Usado por el identity resolver (Phase F3) para clasificar matches
 * fuzzy entre nombres de empresa que difieren por typos o variaciones
 * de razón social.
 */

/** Levenshtein distance — case-insensitive. */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase()
  const t = b.toLowerCase()
  if (s === t) return 0
  if (!s.length) return t.length
  if (!t.length) return s.length

  const v0: number[] = Array(t.length + 1).fill(0).map((_, i) => i)
  const v1: number[] = Array(t.length + 1).fill(0)

  for (let i = 0; i < s.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < t.length; j++) {
      const cost = s[i] === t[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= t.length; j++) v0[j] = v1[j]
  }
  return v1[t.length]
}

/** Similarity 0-100. 100 = idéntico, 0 = nada en común. */
export function similarityPct(a: string, b: string): number {
  if (!a.length && !b.length) return 100
  const maxLen = Math.max(a.length, b.length)
  const dist = levenshtein(a, b)
  return Math.max(0, Math.round((1 - dist / maxLen) * 100))
}
