/**
 * watchlist-merge.ts
 *
 * Merge puro local + remoto para la watchlist personal del usuario.
 *
 * Política: unión por `proveedor_id`. Si el mismo proveedor aparece en ambos
 * lados, gana el item con `agregado_en` más reciente (comparación lexicográfica
 * sobre ISO strings — válida porque ISO 8601 ordena igual que orden temporal).
 *
 * Output ordenado por `agregado_en` descendente (más nuevo primero).
 */
import type { WatchlistItem } from './types'

export function mergeWatchlists(
  local: WatchlistItem[],
  remoto: WatchlistItem[],
): WatchlistItem[] {
  const map = new Map<string, WatchlistItem>()
  for (const item of [...local, ...remoto]) {
    const existing = map.get(item.proveedor_id)
    if (!existing || item.agregado_en > existing.agregado_en) {
      map.set(item.proveedor_id, item)
    }
  }
  return [...map.values()].sort((a, b) =>
    b.agregado_en.localeCompare(a.agregado_en),
  )
}
