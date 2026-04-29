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

export function saveWatchlist(items: WatchlistItem[]): void {
  localStorage.setItem(KEY, JSON.stringify(items))
  window.dispatchEvent(new Event('argos:watchlist-changed'))
}

export function addToWatchlist(item: Omit<WatchlistItem, 'addedAt'>): boolean {
  const all = getWatchlist()
  if (all.some(x => x.id === item.id)) return false
  all.push({ ...item, addedAt: new Date().toISOString() })
  saveWatchlist(all)
  return true
}

export function removeFromWatchlist(id: string): void {
  saveWatchlist(getWatchlist().filter(x => x.id !== id))
}

export function isInWatchlist(id: string): boolean {
  return getWatchlist().some(x => x.id === id)
}

export function markAllSeen(): void {
  const now = new Date().toISOString()
  saveWatchlist(getWatchlist().map(x => ({ ...x, lastSeenAt: now })))
}

export function exportWatchlist(): string {
  return JSON.stringify(getWatchlist(), null, 2)
}

export function importWatchlist(json: string): boolean {
  try {
    const parsed = JSON.parse(json) as WatchlistItem[]
    if (!Array.isArray(parsed)) return false
    saveWatchlist(parsed)
    return true
  } catch { return false }
}
