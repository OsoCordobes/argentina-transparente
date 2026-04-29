/**
 * MiniGraph.tsx — SVG static-layout graph con animación sequential stagger.
 *
 * Para Profile: muestra 1° grado del actor focal. Botón expande a 2° (cap 500).
 * No usa d3-force (eso es para /mapa fullscreen). Posicionamiento radial
 * simple alrededor del nodo focal.
 *
 * Animación (review brainstorm UI):
 *   - Nodos aparecen 1 a 1 con stagger 30ms (CSS opacity + scale).
 *   - Aristas se trazan con stroke-dashoffset → 0 (path-length 200ms).
 *
 * Glyphs: ● PF (azul) / ■ PJ (naranja) / ⚐ señal (rojo) / □ contrato (gris).
 */
import { useMemo, useEffect, useState } from 'react'
import { Link } from 'react-router-dom'

export type MiniNodeKind = 'pf' | 'pj' | 'signal' | 'contract' | 'role'

export interface MiniNode {
  id: string
  kind: MiniNodeKind
  label: string
  /** Si está, click navega a esa ruta. */
  href?: string
  /** Mayor weight = nodo más grande (relevancia). 0..1. */
  weight?: number
}

export interface MiniEdge {
  source: string  // node id
  target: string  // node id
  /** Etiqueta opcional sobre la arista (e.g. 'dirige', 'señaló'). */
  label?: string
}

interface Props {
  focalId: string
  nodes: MiniNode[]
  edges: MiniEdge[]
  /** Click handler en un nodo (opcional). Si no se provee, se usa href. */
  onNodeClick?: (n: MiniNode) => void
  /** Si hay 2° grado disponible, callback para expandir. */
  onExpand?: () => void
  expanded?: boolean
  /** Default 280. Altura del SVG. */
  height?: number
}

const COLORS: Record<MiniNodeKind, string> = {
  pf: '#7da3ff',
  pj: '#ff9b5c',
  signal: '#E25656',
  contract: '#9BA3B4',
  role: '#62C7A0',
}

const GLYPH: Record<MiniNodeKind, string> = {
  pf: '●', pj: '■', signal: '⚐', contract: '□', role: '★',
}

export function MiniGraph({
  focalId, nodes, edges, onNodeClick, onExpand, expanded = false, height = 320,
}: Props) {
  const [revealed, setRevealed] = useState<Set<string>>(new Set())
  const [revealedEdges, setRevealedEdges] = useState<Set<string>>(new Set())

  // Layout radial: focal en el centro, vecinos en círculo. Si hay 2° grado
  // (después de expand), van en un anillo externo.
  const layout = useMemo(() => computeRadial(focalId, nodes, edges), [focalId, nodes, edges])

  // Sequential stagger: aparece focal primero, después vecinos uno por uno.
  // Edges se trazan después de que ambos endpoints están visibles.
  useEffect(() => {
    setRevealed(new Set())
    setRevealedEdges(new Set())
    const timers: ReturnType<typeof setTimeout>[] = []

    // Focal aparece primero
    timers.push(setTimeout(() => {
      setRevealed(new Set([focalId]))
    }, 50))

    // Resto sequential 30ms cada uno
    nodes.filter(n => n.id !== focalId).forEach((n, i) => {
      timers.push(setTimeout(() => {
        setRevealed(prev => new Set([...prev, n.id]))
      }, 100 + i * 30))
    })

    // Edges aparecen después de que sus endpoints estén visibles
    edges.forEach((e, i) => {
      const delay = 200 + i * 30
      timers.push(setTimeout(() => {
        setRevealedEdges(prev => new Set([...prev, `${e.source}-${e.target}`]))
      }, delay))
    })

    return () => timers.forEach(clearTimeout)
  }, [focalId, nodes, edges])

  const width = 580 // viewBox; el SVG es responsive con preserveAspectRatio

  return (
    <div style={s.wrap}>
      <div style={s.toolbar}>
        <span style={s.label}>
          GRAFO · 1°{expanded ? ' + 2°' : ''} grado · {nodes.length} nodos
        </span>
        <div style={{ flex: 1 }} />
        {onExpand && !expanded && (
          <button style={s.btn} onClick={onExpand}>Expandir 2°</button>
        )}
        <Link to="/mapa" style={s.btn}>Abrir en /mapa ↗</Link>
      </div>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        style={s.svg}
      >
        {/* Edges first (behind nodes) */}
        {edges.map(e => {
          const a = layout.get(e.source)
          const b = layout.get(e.target)
          if (!a || !b) return null
          const isRevealed = revealedEdges.has(`${e.source}-${e.target}`)
          const length = Math.hypot(b.x - a.x, b.y - a.y)
          return (
            <line
              key={`${e.source}-${e.target}`}
              x1={a.x} y1={a.y} x2={b.x} y2={b.y}
              stroke="#3a4150"
              strokeWidth={1.4}
              strokeDasharray={length}
              strokeDashoffset={isRevealed ? 0 : length}
              style={{ transition: 'stroke-dashoffset 220ms ease-out' }}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map(n => {
          const pos = layout.get(n.id)
          if (!pos) return null
          const color = COLORS[n.kind]
          const r = n.id === focalId ? 13 : 9 + (n.weight ?? 0) * 4
          const isRevealed = revealed.has(n.id)
          const handleClick = () => {
            if (onNodeClick) onNodeClick(n)
          }
          // Review #2 D2: el atributo `transform` de SVG y la propiedad
          // `transform` de CSS coexistían y se peleaban — el grupo terminaba
          // en 2× la posición y la animación de scale corrompía el layout.
          // Solución: solo CSS transform, que combina translate + scale en
          // una sola transformación (transform-origin: center cuando los
          // hijos están centrados sobre 0,0 — que es nuestro caso al usar
          // <circle r=...> sin cx/cy y <text textAnchor="middle">).
          return (
            <g
              key={n.id}
              style={{
                opacity: isRevealed ? 1 : 0,
                transform: `translate(${pos.x}px, ${pos.y}px) scale(${isRevealed ? 1 : 0.4})`,
                transformOrigin: '0 0',
                transition: 'opacity 220ms ease-out, transform 220ms ease-out',
                cursor: n.href || onNodeClick ? 'pointer' : 'default',
              }}
              onClick={handleClick}
            >
              {n.id === focalId && (
                <circle r={r + 6} fill={color + '22'} stroke={color} strokeWidth={1} />
              )}
              <circle
                r={r}
                fill={color + '33'}
                stroke={color}
                strokeWidth={1.5}
              />
              <text
                textAnchor="middle"
                y={3}
                fontSize={11}
                fill={color}
                style={{ fontFamily: 'ui-monospace, monospace' }}
              >
                {GLYPH[n.kind]}
              </text>
              <text
                textAnchor="middle"
                y={r + 14}
                fontSize={10}
                fill="#dde3ee"
                style={{ pointerEvents: 'none', fontFamily: '-apple-system, sans-serif' }}
              >
                {truncate(n.label, 18)}
              </text>
              {n.href && (
                <Link to={n.href} aria-label={n.label}>
                  <rect x={-r - 2} y={-r - 2} width={(r + 2) * 2} height={(r + 2) * 2} fill="transparent" />
                </Link>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s
}

interface Pos { x: number; y: number }

function computeRadial(focalId: string, nodes: MiniNode[], edges: MiniEdge[]): Map<string, Pos> {
  const W = 580, H = 320
  const cx = W / 2, cy = H / 2
  const map = new Map<string, Pos>()

  // Focal en el centro
  map.set(focalId, { x: cx, y: cy })

  // Determine ring per node based on shortest path to focal (BFS depth-1 vs 2)
  const adj = new Map<string, Set<string>>()
  for (const n of nodes) adj.set(n.id, new Set())
  for (const e of edges) {
    adj.get(e.source)?.add(e.target)
    adj.get(e.target)?.add(e.source)
  }

  const depths = new Map<string, number>()
  depths.set(focalId, 0)
  const queue = [focalId]
  while (queue.length) {
    const cur = queue.shift()!
    const d = depths.get(cur)!
    for (const next of adj.get(cur) ?? []) {
      if (!depths.has(next)) {
        depths.set(next, d + 1)
        queue.push(next)
      }
    }
  }

  // Group nodes by depth
  const ring1 = nodes.filter(n => depths.get(n.id) === 1)
  const ring2 = nodes.filter(n => (depths.get(n.id) ?? 99) >= 2)
  const orphans = nodes.filter(n => n.id !== focalId && !depths.has(n.id))

  const place = (arr: MiniNode[], radius: number, angleOffset = 0) => {
    arr.forEach((n, i) => {
      const angle = angleOffset + (2 * Math.PI * i) / Math.max(arr.length, 1)
      map.set(n.id, {
        x: cx + Math.cos(angle) * radius,
        y: cy + Math.sin(angle) * radius,
      })
    })
  }

  place(ring1, 100)
  place(ring2, 145, Math.PI / 6) // offset 30° para que no se alineen con ring1
  place(orphans, 130, -Math.PI / 4)

  return map
}

const s: Record<string, React.CSSProperties> = {
  wrap: {
    background: '#0d1117', border: '1px solid #1f2937', borderRadius: 4,
    padding: '12px 14px',
  },
  toolbar: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8,
  },
  label: {
    fontSize: 11, color: '#9BA3B4', letterSpacing: 1, textTransform: 'uppercase' as const,
  },
  btn: {
    background: 'transparent', border: '1px solid #2a3140',
    color: '#62C7A0', padding: '4px 10px', borderRadius: 3, fontSize: 11,
    cursor: 'pointer', textDecoration: 'none',
  },
  svg: { display: 'block', width: '100%' },
}
