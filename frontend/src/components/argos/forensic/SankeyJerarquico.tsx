/**
 * SankeyJerarquico — port directo del SVG de
 * argos-v3/project/forensic/surface-dinero.jsx (líneas 82-101).
 *
 * 4 columnas: RECAUDACIÓN → NIVEL DE GOBIERNO → MINISTERIO/ENTE → DESTINO.
 * Bezier paths entre columnas, grosor proporcional al monto.
 *
 * Highlighting:
 *   - tone='select'  → celeste (jurisdicción seleccionada)
 *   - tone='alarm'   → rojo (destino con señal)
 *   - tone='warn'    → ámbar (estimado/proyectado)
 *   - tone undefined → neutral
 *
 * NO es interactivo todavía (click en nodo en sub-iteración). Sí es responsive
 * vía viewBox preservativo.
 */

export interface SankeyNode {
  id: string
  /** Columna 0..3 */
  col: number
  /** y inicial dentro de la columna */
  y0: number
  /** alto de la barra */
  h: number
  /** label arriba */
  lbl: string
  /** monto formateado (ej. "$13.428") */
  amt: string
  /** subtítulo (ej. "mil M") o porcentaje (ej. "29.7%") */
  sub?: string
  share?: string
  /** Tono visual */
  tone?: 'select' | 'alarm' | 'warn' | 'neutral'
  /** Si es estimado (chip "PROYECTADO") */
  estimated?: boolean
}

export interface SankeyEdge {
  s: string  // source node id
  t: string  // target node id
  w: number  // grosor (proporcional al monto)
  hl?: boolean
}

interface SankeyJerarquicoProps {
  nodes: SankeyNode[]
  edges: SankeyEdge[]
  /** Labels de las 4 columnas */
  colLabels?: [string, string, string, string]
  /** Width del SVG viewBox */
  width?: number
  /** Height del SVG viewBox */
  height?: number
  /** Colores por defecto (ya hay vars CSS) */
  colW?: number[]
  colX?: number[]
}

const DEFAULT_COL_LABELS: [string, string, string, string] = [
  'RECAUDACIÓN', 'NIVEL DE GOBIERNO', 'MINISTERIO / ENTE', 'DESTINO',
]
const DEFAULT_COL_W = [240, 240, 280, 280]
const DEFAULT_COL_X = [40, 380, 760, 1180]

export function SankeyJerarquico({
  nodes,
  edges,
  colLabels = DEFAULT_COL_LABELS,
  width = 1500,
  height = 520,
  colW = DEFAULT_COL_W,
  colX = DEFAULT_COL_X,
}: SankeyJerarquicoProps) {
  const nodeFor = (id: string) => nodes.find((n) => n.id === id)

  // Calcular sy/ty (offsets de stacking) — replica del bundle
  const out: Record<string, number> = {}
  const inp: Record<string, number> = {}
  const enrichedEdges = edges.map((e) => {
    const ns = nodeFor(e.s)
    const nt = nodeFor(e.t)
    if (!ns || !nt) return null
    out[e.s] = out[e.s] || 0
    inp[e.t] = inp[e.t] || 0
    const sy = ns.y0 + out[e.s] + e.w / 2
    const ty = nt.y0 + inp[e.t] + e.w / 2
    out[e.s] += e.w
    inp[e.t] += e.w
    return { ...e, sy, ty, ns, nt }
  }).filter(Boolean) as Array<SankeyEdge & { sy: number; ty: number; ns: SankeyNode; nt: SankeyNode }>

  function path(e: typeof enrichedEdges[number]): string {
    const x1 = colX[e.ns.col] + colW[e.ns.col]
    const x2 = colX[e.nt.col]
    const mx = (x1 + x2) / 2
    const y1 = e.sy
    const y2 = e.ty
    const w = e.w
    return `M ${x1} ${y1 - w / 2} C ${mx} ${y1 - w / 2}, ${mx} ${y2 - w / 2}, ${x2} ${y2 - w / 2} L ${x2} ${y2 + w / 2} C ${mx} ${y2 + w / 2}, ${mx} ${y1 + w / 2}, ${x1} ${y1 + w / 2} Z`
  }

  function nodeFill(n: SankeyNode): string {
    if (n.tone === 'select') return 'var(--select)'
    if (n.tone === 'alarm') return 'var(--alarm)'
    if (n.tone === 'warn') return 'var(--warn)'
    return 'var(--text-2)'
  }

  return (
    <svg viewBox={`0 0 ${width} ${height}`} style={{ width: '100%', height: 520, display: 'block' }}>
      {/* Headers de columnas */}
      {colLabels.map((h, i) => (
        <text
          key={`h-${i}`}
          x={colX[i] + colW[i] / 2}
          y={28}
          fill="var(--text-3)"
          fontFamily="JetBrains Mono, monospace"
          fontSize="9.5"
          letterSpacing="3"
          textAnchor="middle"
        >
          {h}
        </text>
      ))}

      {/* Bezier paths (orden importante: edges abajo, nodes arriba) */}
      {enrichedEdges.map((e, i) => (
        <path
          key={`e-${i}`}
          d={path(e)}
          fill={e.hl ? 'var(--select)' : 'var(--text-2)'}
          fillOpacity={e.hl ? 0.22 : 0.07}
          stroke="none"
        />
      ))}

      {/* Nodes (rect con fillOpacity 0.06 + barra lateral fillOpacity 0.95 + label + amt + sub) */}
      {nodes.map((n) => {
        const x = colX[n.col]
        const w = colW[n.col]
        const y = n.y0
        const h = n.h
        const fill = nodeFill(n)
        const labelColor = n.tone === 'select' ? 'var(--select)'
          : n.tone === 'alarm' ? 'var(--alarm)'
          : n.tone === 'warn' ? 'var(--warn)'
          : 'var(--text-2)'
        return (
          <g key={n.id}>
            <rect x={x} y={y} width={4} height={h} fill={fill} fillOpacity={n.tone ? 0.95 : 0.7} />
            <rect x={x + 4} y={y} width={w - 4} height={h} fill={fill} fillOpacity={0.06} />
            <text
              x={x + 12}
              y={y + 14}
              fill="var(--text-1)"
              fontFamily="JetBrains Mono, monospace"
              fontSize="10"
              letterSpacing="1.5"
            >
              {n.lbl}
              {n.estimated && (
                <tspan dx={6} fill="var(--warn)" fontSize="8">★PROY</tspan>
              )}
            </text>
            <text
              x={x + 12}
              y={y + 30}
              fill={labelColor}
              fontFamily="JetBrains Mono, monospace"
              fontSize="13"
              fontWeight="500"
            >
              {n.amt}
            </text>
            {n.sub && (
              <text
                x={x + w - 8}
                y={y + 30}
                fill="var(--text-3)"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9"
                textAnchor="end"
              >
                {n.sub}
              </text>
            )}
            {n.share && (
              <text
                x={x + w - 8}
                y={y + 14}
                fill="var(--text-3)"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9"
                textAnchor="end"
              >
                {n.share}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
