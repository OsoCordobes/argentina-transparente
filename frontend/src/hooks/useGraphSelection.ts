/**
 * useGraphSelection — estado compartido entre tabla/lista y grafo de una página.
 *
 * Permite que click en una fila resalte el nodo correspondiente (y viceversa),
 * sin que cada página re-implemente el patrón. Lo usan ActoresD6 (piloto),
 * más adelante Dinero y Señales (M2).
 *
 * API:
 *   const { selectedKey, hoveredKey, select, hover, clear, isSelected, isHovered } = useGraphSelection()
 *
 * Las claves son strings opacas — cada página decide su esquema (ej:
 * `pf:30-12345-6` para una persona, `senal:abc` para una señal). El hook
 * solo provee el contenedor de estado y la API.
 *
 * Soporta una callback opcional `onChange` para que componentes externos
 * (tabla con scrollIntoView, grafo con focus) reaccionen a cambios sin
 * tener que observar manualmente.
 */

import { useCallback, useState } from 'react'

export interface GraphSelectionState {
  /** Item seleccionado de forma persistente (ej: click). null = ninguno. */
  selectedKey: string | null
  /** Item hover (transitorio). null = sin hover. */
  hoveredKey: string | null
  /**
   * Setea selección persistente. Comportamiento:
   *   - `select(null)` limpia.
   *   - `select(key)` con key distinta a la actual → cambia selección.
   *   - `select(key)` con key igual a la actual → toggle (deselecciona).
   */
  select: (key: string | null) => void
  /** Setea hover. Pasar null al salir. */
  hover: (key: string | null) => void
  /** Limpia ambos (selected + hovered). */
  clear: () => void
  /** Helper: ¿este key está seleccionado? */
  isSelected: (key: string) => boolean
  /** Helper: ¿este key está siendo hovered? */
  isHovered: (key: string) => boolean
  /** ¿Hay alguna selección activa (selected o hovered)? */
  hasFocus: boolean
}

export function useGraphSelection(): GraphSelectionState {
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [hoveredKey, setHoveredKey] = useState<string | null>(null)

  const select = useCallback((key: string | null) => {
    setSelectedKey((prev) => (prev === key ? null : key)) // toggle si es el mismo
  }, [])

  const hover = useCallback((key: string | null) => {
    setHoveredKey(key)
  }, [])

  const clear = useCallback(() => {
    setSelectedKey(null)
    setHoveredKey(null)
  }, [])

  const isSelected = useCallback(
    (key: string) => selectedKey === key,
    [selectedKey]
  )
  const isHovered = useCallback(
    (key: string) => hoveredKey === key,
    [hoveredKey]
  )

  return {
    selectedKey,
    hoveredKey,
    select,
    hover,
    clear,
    isSelected,
    isHovered,
    hasFocus: selectedKey !== null || hoveredKey !== null,
  }
}
