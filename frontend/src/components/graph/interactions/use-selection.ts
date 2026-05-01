import { useState, useEffect, useCallback } from 'react'

/**
 * Selección persistente. Click selecciona, click background o Esc deselecciona.
 * Esc se conecta al evento global 'argos:escape' (ya emitido por ArgosShell).
 */
export function useSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const select = useCallback((id: string | null) => {
    setSelectedId(prev => (prev === id ? null : id))  // toggle
  }, [])
  const clear = useCallback(() => setSelectedId(null), [])

  useEffect(() => {
    const onEsc = () => setSelectedId(null)
    window.addEventListener('argos:escape', onEsc)
    return () => window.removeEventListener('argos:escape', onEsc)
  }, [])

  return { selectedId, select, clear }
}
