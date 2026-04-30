/**
 * watchlist-storage.ts — Persistencia de watchlist en localStorage (PLAN-UI D8).
 *
 * Coherente con caso-storage: mismo patrón JSON, exportable, eventos.
 */

const KEY = 'argos_watchlist_v1'

export interface WatchlistItem {
  id: string                          // dni si pf, cuit si pj, "signal:<id>" si señal
  kind: 'pf' | 'pj' | 'signal'
  label: string
  addedAt: string                     // ISO timestamp
  /** Última vez que el usuario abrió las alertas — comparar con la fecha
   *  de las señales para determinar "no leídas". */
  lastSeenAt?: string
}

export function getWatchlist(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function saveWatchlist(items: WatchlistItem[]): { ok: true } | { ok: false; reason: string } {
  // Audit fix: detectar storage bloqueado/lleno y devolver status. El caller
  // decide si avisar al usuario o silenciar.
  try {
    localStorage.setItem(KEY, JSON.stringify(items))
  } catch (err) {
    return { ok: false, reason: (err as Error).message || 'localStorage no disponible' }
  }
  window.dispatchEvent(new Event('argos:watchlist-changed'))
  return { ok: true }
}

export type StorageResult = { ok: true } | { ok: false; reason: string }

/** Devuelve `'duplicate'` si ya estaba, `{ok:true}` si se agregó, `{ok:false, reason}` si storage falló. */
export function addToWatchlist(item: Omit<WatchlistItem, 'addedAt'>): StorageResult | 'duplicate' {
  const all = getWatchlist()
  if (all.some(x => x.id === item.id)) return 'duplicate'
  all.push({ ...item, addedAt: new Date().toISOString() })
  return saveWatchlist(all)
}

export function removeFromWatchlist(id: string): StorageResult {
  return saveWatchlist(getWatchlist().filter(x => x.id !== id))
}

export function isInWatchlist(id: string): boolean {
  return getWatchlist().some(x => x.id === id)
}

export function markAllSeen(): StorageResult {
  const now = new Date().toISOString()
  return saveWatchlist(getWatchlist().map(x => ({ ...x, lastSeenAt: now })))
}

export function exportWatchlist(): string {
  return JSON.stringify(getWatchlist(), null, 2)
}

export function importWatchlist(json: string): StorageResult {
  try {
    const parsed = JSON.parse(json) as WatchlistItem[]
    if (!Array.isArray(parsed)) return { ok: false, reason: 'no es un array de watchlist' }
    return saveWatchlist(parsed)
  } catch (err) {
    return { ok: false, reason: (err as Error).message || 'JSON inválido' }
  }
}
