/**
 * Dispara una "electric wave" que recorre todas las aristas hierárquicas
 * desde la raíz hacia afuera, en ~1.5s.
 *
 * Usa CSS class `edge-wave-active` que activa una transición de
 * stroke-dashoffset. Se activa con stagger por depth (BFS desde root).
 *
 * El componente EdgePath debe declarar:
 *   .edge-path { stroke-dasharray: 4 4; stroke-dashoffset: 0; }
 *   .edge-path.edge-wave-active { stroke-dashoffset: -8; transition: stroke-dashoffset 1.2s ease-out; }
 *
 * Devuelve una función `cancel()` que limpia los setTimeouts pendientes —
 * el caller debe llamarla en cleanup de useEffect para evitar leaks de
 * referencias DOM cuando el componente se desmonta mid-wave.
 */
export function fireEntryWave(
  edgeRefs: Map<string, SVGPathElement>,
  edgesByDepth: Map<number, string[]>
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = []
  const depths = Array.from(edgesByDepth.keys())
  if (depths.length === 0) return () => {}
  const maxDepth = Math.max(...depths)
  for (let d = 0; d <= maxDepth; d++) {
    const ids = edgesByDepth.get(d) ?? []
    const delay = d * 200 // 200ms stagger per depth ring
    ids.forEach(id => {
      const el = edgeRefs.get(id)
      if (!el) return
      timers.push(
        setTimeout(() => {
          el.classList.add('edge-wave-active')
          timers.push(setTimeout(() => el.classList.remove('edge-wave-active'), 1200))
        }, delay),
      )
    })
  }
  return () => timers.forEach(t => clearTimeout(t))
}
