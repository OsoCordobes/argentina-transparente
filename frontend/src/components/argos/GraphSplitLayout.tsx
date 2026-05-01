/**
 * GraphSplitLayout.tsx — wrapper genérico para páginas con grafo + contenido.
 *
 * Diseño "graph-context-everywhere": cada página que tenga una lista de
 * actores/contratos/señales muestra al lado el grafo, dinámicamente filtrado
 * por lo que está en pantalla. El usuario nunca pierde el contexto estructural.
 *
 * Este componente es DUMB: no maneja estado, no toca selección. Las páginas
 * pasan `primary` (su contenido) y `graph` (el GraphCanvas), y usan su propio
 * `useGraphSelection` para coordinar bidireccionalmente.
 *
 * Props:
 *   - orientation: 'vertical' (left/right) | 'horizontal' (top/bottom)
 *   - ratio: división del espacio (default '50/50')
 *   - primaryFirst: si false, el grafo aparece primero
 *
 * Layout decisions:
 *   - flex container row|column con flex-basis para honrar el ratio
 *   - 1px hairline entre paneles (var(--hairline-1))
 *   - primary side: bg sólido (var(--bg-forensic-1)), overflow auto
 *   - graph side: gradient radial sutil (estilo ActoresD6), overflow hidden
 *   - min-height calc(100vh - 42px) — coincide con el body de ArgosShell
 *
 * Usado por:
 *   - ActoresD6 (vertical 56/44) — referencia de patrón aunque inline
 *   - Dinero (horizontal 60/40)
 *   - Señales (vertical 50/50)
 */
import type { ReactNode } from 'react'

export type GraphSplitOrientation = 'vertical' | 'horizontal'
export type GraphSplitRatio = '50/50' | '60/40' | '56/44' | '40/60' | '44/56'

export interface GraphSplitLayoutProps {
  /** 'vertical' = left/right split, 'horizontal' = top/bottom split */
  orientation: GraphSplitOrientation
  /** Reparto del espacio. Default '50/50'. */
  ratio?: GraphSplitRatio
  /** Contenido principal de la página (Sankey, tabla, etc.) */
  primary: ReactNode
  /** Lado del grafo (típicamente <GraphCanvas snapshot=... />) */
  graph: ReactNode
  /** Si false, invierte el orden: graph aparece primero. Default true. */
  primaryFirst?: boolean
}

/**
 * Convierte el ratio a flex-basis para cada pane.
 * Returns [primaryBasis, graphBasis] como porcentajes (string '60%').
 */
function ratioToBasis(ratio: GraphSplitRatio): [string, string] {
  switch (ratio) {
    case '50/50': return ['50%', '50%']
    case '60/40': return ['60%', '40%']
    case '56/44': return ['56%', '44%']
    case '40/60': return ['40%', '60%']
    case '44/56': return ['44%', '56%']
  }
}

const PRIMARY_BG = 'var(--bg-forensic-1)'
const GRAPH_BG =
  'radial-gradient(ellipse at 50% 45%, var(--bg-forensic-2) 0%, var(--bg-forensic-0) 65%)'
const HAIRLINE = '1px solid var(--hairline-1)'

export function GraphSplitLayout({
  orientation,
  ratio = '50/50',
  primary,
  graph,
  primaryFirst = true,
}: GraphSplitLayoutProps) {
  const isVertical = orientation === 'vertical'
  const [primaryBasis, graphBasis] = ratioToBasis(ratio)

  // Hairline entre paneles: borde derecho del primero (vertical) o
  // borde inferior (horizontal). Lo aplicamos al pane "primero" del DOM.
  // Si primaryFirst es false, el orden visual cambia y el hairline también.
  const dividerOnPrimary = primaryFirst
    ? (isVertical ? { borderRight: HAIRLINE } : { borderBottom: HAIRLINE })
    : (isVertical ? { borderLeft: HAIRLINE } : { borderTop: HAIRLINE })
  const dividerOnGraph = primaryFirst
    ? {} // graph no necesita borde porque el primary ya lo tiene
    : (isVertical ? { borderRight: HAIRLINE } : { borderBottom: HAIRLINE })

  const primaryPane = (
    <div
      style={{
        flex: `1 1 ${primaryBasis}`,
        background: PRIMARY_BG,
        overflow: 'auto',
        minWidth: 0,        // permite que la tabla se shrinkee sin desbordar
        minHeight: 0,
        display: 'flex',
        flexDirection: 'column',
        ...dividerOnPrimary,
      }}
    >
      {primary}
    </div>
  )

  const graphPane = (
    <div
      style={{
        flex: `1 1 ${graphBasis}`,
        background: GRAPH_BG,
        overflow: 'hidden',
        position: 'relative',  // el GraphCanvas usa absolute inset:0 para llenar
        minWidth: 0,
        minHeight: 0,
        ...dividerOnGraph,
      }}
    >
      {graph}
    </div>
  )

  return (
    <div
      style={{
        // Negativo para anular el padding del body de ArgosShell — el split
        // ocupa edge-to-edge igual que ActoresD6.
        margin: '-24px -32px -48px',
        display: 'flex',
        flexDirection: isVertical ? 'row' : 'column',
        minHeight: 'calc(100vh - 42px)',
      }}
    >
      {primaryFirst ? primaryPane : graphPane}
      {primaryFirst ? graphPane : primaryPane}
    </div>
  )
}

export default GraphSplitLayout
