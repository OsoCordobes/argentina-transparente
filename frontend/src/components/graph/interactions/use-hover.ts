import { useState, useRef, useCallback } from 'react'

/**
 * Hover state RAF-throttled.
 * onMouseMove se coalesce en un setState por frame max.
 */
export function useHover() {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)

  const setHover = useCallback((id: string | null) => {
    pendingRef.current = id
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setHoveredId(pendingRef.current)
    })
  }, [])

  const clearHover = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setHoveredId(null)
  }, [])

  return { hoveredId, setHover, clearHover }
}
