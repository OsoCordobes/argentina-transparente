/**
 * watchlist.ts
 *
 * Wrapper offline-first de la watchlist personal del usuario.
 *
 * - Si el user NO inició sesión en Supabase: todo vive en localStorage
 *   bajo la key `argos.watchlist.v1`. La app sigue funcional.
 * - Si el user SÍ inició sesión: al llamar `syncOnLogin()`, se hace merge
 *   union latest-wins entre lo local y lo remoto, se sube lo nuevo y se
 *   reescribe el localStorage con el merge resultante.
 *
 * Diseño: localStorage es la fuente de verdad inmediata para la UI;
 * Supabase es replicación opcional para sync entre dispositivos.
 *
 * Compatible con `supabase` stub (ver `lib/supabase.ts`) — si Supabase no
 * está configurado, las llamadas a `supabase.from(...)` retornan errores
 * suaves y `fetchRemote()` cae a `[]` sin tirar.
 */
import { supabase } from '@/lib/supabase'
import { mergeWatchlists } from './watchlist-merge'
import type { WatchlistItem } from './types'

const STORAGE_KEY = 'argos.watchlist.v1'

export function readLocal(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as WatchlistItem[]) : []
  } catch {
    return []
  }
}

export function writeLocal(items: WatchlistItem[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // localStorage puede fallar en modo privado o storage lleno. Silencioso —
    // el usuario sigue navegando, sólo se pierde la persistencia local.
  }
}

export async function fetchRemote(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase
    .from('watchlist')
    .select('*')
    .order('agregado_en', { ascending: false })
  if (error) return []
  return (data ?? []) as WatchlistItem[]
}

export async function syncOnLogin(): Promise<WatchlistItem[]> {
  const local = readLocal()
  const remote = await fetchRemote()
  const merged = mergeWatchlists(local, remote)
  // Push a Supabase los items locales que no estén ya en remoto.
  for (const item of merged) {
    if (!remote.find((r) => r.proveedor_id === item.proveedor_id)) {
      await supabase.from('watchlist').insert(item)
    }
  }
  writeLocal(merged)
  return merged
}

export async function addItem(item: WatchlistItem): Promise<void> {
  const session = (await supabase.auth.getSession()).data.session
  if (session) {
    await supabase
      .from('watchlist')
      .upsert({ ...item, user_id: session.user.id })
  }
  // Siempre escribir local para fallback offline.
  const items = readLocal()
  const next = mergeWatchlists(items, [item])
  writeLocal(next)
}
