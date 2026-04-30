/**
 * Δ tracking — qué cambió desde la última visita del usuario.
 *
 * v0: localStorage (sin backend). Marca `argos_last_visit_iso` al cierre/blur.
 * El conteo de novedades es 0 hasta que tengamos `/api/diff?since=ISO`.
 *
 * v1 (próximo sprint): cablear a `getNovedades({since})` real que pide al backend.
 */
import { useEffect, useState } from 'react'

const KEY_LAST_VISIT = 'argos_last_visit_iso'

/**
 * Lee la última visita del usuario.
 * Returns ISO string o null si es la primera vez.
 */
export function readLastVisit(): string | null {
  try {
    return localStorage.getItem(KEY_LAST_VISIT)
  } catch {
    return null
  }
}

/**
 * Marca el momento actual como la última visita del usuario.
 * Llamar al unmount de cualquier ruta o al cierre de la pestaña.
 */
export function markVisit(): void {
  try {
    localStorage.setItem(KEY_LAST_VISIT, new Date().toISOString())
  } catch {
    // localStorage no disponible (Safari private mode, etc.) — ignoramos
  }
}

/**
 * Formatea una fecha ISO en formato corto AR ("28/04").
 * Si la fecha es null o inválida, devuelve "—".
 */
export function formatShortDate(iso: string | null): string {
  if (!iso) return '—'
  try {
    const d = new Date(iso)
    if (Number.isNaN(d.getTime())) return '—'
    return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' })
  } catch {
    return '—'
  }
}

/**
 * Hook React para usar el tracking Δ en componentes.
 * Returns:
 *   - lastVisit: ISO string o null
 *   - lastVisitShort: "28/04" o "—"
 *   - novedadesCount: 0 (v0); > 0 cuando tengamos backend
 *   - markNow: función que actualiza el timestamp (idempotente)
 */
export function useDeltaSinceLastVisit() {
  const [lastVisit, setLastVisit] = useState<string | null>(() => readLastVisit())
  // v0: novedades count siempre 0. v1 hará fetch a /api/diff
  const [novedadesCount] = useState(0)

  useEffect(() => {
    // Marcar visita al unmount/cierre
    const onBeforeUnload = () => markVisit()
    window.addEventListener('beforeunload', onBeforeUnload)
    return () => {
      window.removeEventListener('beforeunload', onBeforeUnload)
      markVisit()
      setLastVisit(readLastVisit())
    }
  }, [])

  return {
    lastVisit,
    lastVisitShort: formatShortDate(lastVisit),
    novedadesCount,
    markNow: () => {
      markVisit()
      setLastVisit(readLastVisit())
    },
  }
}
