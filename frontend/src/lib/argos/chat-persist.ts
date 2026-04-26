/**
 * chat-persist.ts — persiste el chat thread en localStorage y soporta
 * deeplinks `?focus=<nodeId>&q=<urlencoded>` para que un editor pueda
 * abrir un link y aterrizar exactamente donde estaba el redactor.
 *
 * Hard rule (CLAUDE.md §2): el chat puede contener narrativa generada
 * por LLM. localStorage es local al browser — no transmitimos. Pero al
 * compartir un link via deeplink, solo viajan `focus` (id de nodo) y
 * `q` (la pregunta del usuario). NO la respuesta del LLM (que volverá
 * a generarse al re-disparar la query).
 */

import type { ChatMessage } from './types'

const STORAGE_KEY = 'argos.chat.thread.v1'
const MAX_MESSAGES = 50  // ~100KB worst case, holgado en el cap localStorage 5MB

// ─── Persistencia ────────────────────────────────────────────────────────────

export function saveThread(thread: ChatMessage[]): void {
  if (typeof localStorage === 'undefined') return
  try {
    // Truncar al final si excede MAX_MESSAGES (preservar los más recientes)
    const trimmed = thread.length > MAX_MESSAGES
      ? thread.slice(thread.length - MAX_MESSAGES)
      : thread
    localStorage.setItem(STORAGE_KEY, JSON.stringify(trimmed))
  } catch {
    // QuotaExceeded o private mode — silently ignore
  }
}

export function loadThread(): ChatMessage[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw) as unknown
    if (!Array.isArray(parsed)) return []
    // Validate shape: cada item debe tener role + content + ts
    return parsed.filter(
      (m): m is ChatMessage =>
        typeof m === 'object' &&
        m !== null &&
        ('role' in m) &&
        (m as ChatMessage).role !== undefined &&
        ((m as ChatMessage).role === 'user' || (m as ChatMessage).role === 'assistant') &&
        typeof (m as ChatMessage).content === 'string' &&
        typeof (m as ChatMessage).ts === 'number',
    )
  } catch {
    return []
  }
}

export function clearThread(): void {
  if (typeof localStorage === 'undefined') return
  try {
    localStorage.removeItem(STORAGE_KEY)
  } catch {
    /* ignore */
  }
}

// ─── Deeplinks ───────────────────────────────────────────────────────────────

export interface Deeplink {
  focusNodeId?: string
  query?: string
}

/**
 * Lee `?focus=<id>&q=<text>` del URL actual. No mutates URL.
 */
export function parseDeeplink(): Deeplink {
  if (typeof window === 'undefined' || !window.location?.search) return {}
  const params = new URLSearchParams(window.location.search)
  const focus = params.get('focus')
  const q = params.get('q')
  return {
    focusNodeId: focus ?? undefined,
    query: q ?? undefined,
  }
}

/**
 * Construye una URL absoluta `/<path>?focus=<id>&q=<text>` para compartir.
 * El path por default es el actual. Encode-safe.
 */
export function buildDeeplinkUrl(opts: {
  focusNodeId?: string | null
  query?: string | null
  basePath?: string
}): string {
  const base =
    opts.basePath ??
    (typeof window !== 'undefined' ? window.location.pathname : '/explorar')
  const origin =
    typeof window !== 'undefined' ? window.location.origin : ''
  const params = new URLSearchParams()
  if (opts.focusNodeId) params.set('focus', opts.focusNodeId)
  if (opts.query) params.set('q', opts.query)
  const qs = params.toString()
  return `${origin}${base}${qs ? '?' + qs : ''}`
}

/**
 * Limpia los query params del URL actual sin recargar (cuando ya cargamos
 * el deeplink, lo "consumimos" para que F5 no re-dispare).
 */
export function consumeDeeplinkParams(): void {
  if (typeof window === 'undefined' || !window.history?.replaceState) return
  try {
    window.history.replaceState({}, '', window.location.pathname)
  } catch {
    /* ignore */
  }
}
