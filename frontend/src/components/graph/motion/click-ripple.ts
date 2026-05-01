/**
 * Al click en un nodo, dispara un ripple (CSS animation) en las aristas
 * salientes desde ese nodo. ~600ms.
 *
 * Las aristas adyacentes obtienen la clase `edge-click-ripple`. CSS:
 *   .edge-path.edge-click-ripple { animation: edge-pulse 600ms ease-out; }
 */
export function fireClickRipple(
  _nodeId: string,  // unused but kept for future contextual variants
  edgeRefs: Map<string, SVGPathElement>,
  adjacentEdgeIds: string[]
): void {
  for (const eId of adjacentEdgeIds) {
    const el = edgeRefs.get(eId)
    if (!el) continue
    el.classList.add('edge-click-ripple')
    setTimeout(() => el.classList.remove('edge-click-ripple'), 600)
  }
}
