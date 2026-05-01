/**
 * Al click en un nodo, dispara un ripple (CSS animation) en las aristas
 * salientes desde ese nodo. ~600ms.
 *
 * Las aristas adyacentes obtienen la clase `edge-click-ripple`. CSS:
 *   .edge-path.edge-click-ripple { animation: edge-pulse 600ms ease-out; }
 *
 * Devuelve `cancel()` para limpiar el setTimeout si el componente se
 * desmonta mid-ripple — evita leak de referencia DOM. Caller lo guarda
 * y lo invoca antes de re-firing un nuevo ripple sobre los mismos nodos.
 */
export function fireClickRipple(
  _nodeId: string, // unused but kept for future contextual variants
  edgeRefs: Map<string, SVGPathElement>,
  adjacentEdgeIds: string[],
): () => void {
  const timers: ReturnType<typeof setTimeout>[] = []
  for (const eId of adjacentEdgeIds) {
    const el = edgeRefs.get(eId)
    if (!el) continue
    el.classList.add('edge-click-ripple')
    timers.push(setTimeout(() => el.classList.remove('edge-click-ripple'), 600))
  }
  return () => timers.forEach(t => clearTimeout(t))
}
