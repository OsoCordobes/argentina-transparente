/**
 * GraphCanvas.tsx
 *
 * Grafo d3-force renderizado en SVG con animación imperativa.
 * NUNCA usa useState para la posición de nodos — toda la animación
 * se hace con refs + mutación directa del DOM (patrón d3 clásico).
 *
 * React sólo se invoca para cambios estructurales (nodes/edges, focusedId).
 * Esto evita el freeze de 60 re-renders/seg que quemaba el heap.
 */

import { useEffect, useRef, useCallback, memo } from 'react'
import type { RefObject } from 'react'
import type { ArgosGraph, ArgosNode, ArgosEdge } from '@/lib/argos/types'

// d3-force se importa con dynamic import para que vaya en su propio chunk
// y no bloquee el bundle inicial.

// ─── Constantes de diseño ─────────────────────────────────────────────────────

const NODE_COLOR: Record<string, string> = {
  jurisdiccion: '#818cf8',
  proveedor: '#38bdf8',
  director: '#f472b6',
  contrato: '#34d399',
  señal: '#fb923c',
}

const NODE_RADIUS = (weight: number) => 6 + weight * 18

// ─── Tipos D3 mínimos para evitar import masivo ───────────────────────────────

type D3Simulation = {
  nodes: (arr?: ArgosNode[]) => ArgosNode[] | D3Simulation
  force: (name: string, f?: unknown) => D3Simulation
  alpha: (v?: number) => number | D3Simulation
  alphaTarget: (v: number) => D3Simulation
  alphaDecay: (v: number) => D3Simulation
  velocityDecay: (v: number) => D3Simulation
  on: (event: string, cb: () => void) => D3Simulation
  restart: () => D3Simulation
  stop: () => void
  tick: () => D3Simulation
}

// ─── Pan/zoom imperativo ──────────────────────────────────────────────────────

interface ViewState {
  tx: number
  ty: number
  scale: number
}

function applyTransform(g: SVGGElement | null, v: ViewState) {
  if (!g) return
  g.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.scale})`)
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GraphCanvasProps {
  graph: ArgosGraph
  focusedNodeId: string | null
  highlightedIds: Set<string>
  onNodeClick: (node: ArgosNode) => void
  onNodeHover: (node: ArgosNode | null, x: number, y: number) => void
}

// ─── Componente ──────────────────────────────────────────────────────────────

export const GraphCanvas = memo(function GraphCanvas({
  graph,
  focusedNodeId,
  highlightedIds,
  onNodeClick,
  onNodeHover,
}: GraphCanvasProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const simRef = useRef<D3Simulation | null>(null)
  const viewRef = useRef<ViewState>({ tx: 0, ty: 0, scale: 1 })
  const rafRef = useRef<number>(0)
  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0, tx: 0, ty: 0 })
  const nodeElsRef = useRef<Map<string, SVGGElement>>(new Map())
  const edgeElsRef = useRef<Map<string, SVGLineElement>>(new Map())

  // ─── Init d3-force ─────────────────────────────────────────────────────────

  useEffect(() => {
    let cancelled = false

    async function init() {
      const [
        { forceSimulation },
        { forceManyBody },
        { forceLink },
        { forceCenter },
        { forceCollide },
      ] = await Promise.all([
        import('d3-force'),
        import('d3-force'),
        import('d3-force'),
        import('d3-force'),
        import('d3-force'),
      ]) as [
        { forceSimulation: (nodes: ArgosNode[]) => D3Simulation },
        { forceManyBody: () => { strength: (v: number) => unknown } },
        { forceLink: (edges: ArgosEdge[]) => { id: (fn: (d: ArgosNode) => string) => unknown; distance: (fn: (d: ArgosEdge) => number) => unknown; strength: (v: number) => unknown } },
        { forceCenter: (x: number, y: number) => unknown },
        { forceCollide: () => { radius: (fn: (d: ArgosNode) => number) => unknown; strength: (v: number) => unknown } },
      ]

      if (cancelled || !svgRef.current) return

      const svg = svgRef.current
      const { width, height } = svg.getBoundingClientRect()
      const cx = width / 2
      const cy = height / 2

      // Centro de la vista en el centro del SVG
      viewRef.current = { tx: cx, ty: cy, scale: 1 }

      const sim = forceSimulation(graph.nodes)
        .force('charge', (forceManyBody() as { strength: (v: number) => unknown }).strength(-220))
        .force(
          'link',
          ((forceLink(graph.edges) as {
            id: (fn: (d: ArgosNode) => string) => typeof forceLink
            distance: (fn: (d: ArgosEdge) => number) => typeof forceLink
            strength: (v: number) => typeof forceLink
          })
            .id((d: ArgosNode) => d.id)
            .distance((e: ArgosEdge) => 80 + (1 - e.weight) * 80)
            .strength(0.4) as unknown)
        )
        .force('center', (forceCenter as (x: number, y: number) => unknown)(0, 0))
        .force(
          'collide',
          ((forceCollide() as { radius: (fn: (d: ArgosNode) => number) => unknown; strength: (v: number) => unknown })
            .radius((d: ArgosNode) => NODE_RADIUS(d.weight) + 8)
            .strength(0.7) as unknown)
        )
        .alphaDecay(0.025)
        .velocityDecay(0.35)
        .on('tick', onTick)

      simRef.current = sim
    }

    init()
    return () => {
      cancelled = true
      simRef.current?.stop()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []) // sólo en mount — el grafo se actualiza por separado

  // ─── Actualizar simulación cuando cambia el grafo ──────────────────────────

  useEffect(() => {
    const sim = simRef.current
    if (!sim) return

    // Reconstruir DOM para nodos/aristas
    rebuildDOM()

    // Actualizar fuerzas con los nuevos datos
    ;(sim as unknown as {
      nodes: (arr: ArgosNode[]) => D3Simulation
      force: (name: string, f?: unknown) => D3Simulation
    }).nodes(graph.nodes)

    const linkForce = (sim as unknown as { force: (name: string) => { links: (arr: ArgosEdge[]) => void } | null }).force('link')
    if (linkForce) linkForce.links(graph.edges)

    ;(sim as unknown as { alpha: (v: number) => D3Simulation; restart: () => D3Simulation })
      .alpha(0.5)
      .restart()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [graph.nodes.length, graph.edges.length])

  // ─── rAF tick: mutar DOM directamente, sin React ─────────────────────────

  const onTick = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(flushPositions)
  }, [])

  const flushPositions = useCallback(() => {
    const g = gRef.current
    if (!g) return

    applyTransform(g, viewRef.current)

    // Mover aristas
    for (const edge of graph.edges) {
      const src = edge.source as ArgosNode
      const tgt = edge.target as ArgosNode
      const key = `${typeof edge.source === 'string' ? edge.source : src.id}|${typeof edge.target === 'string' ? edge.target : tgt.id}`
      const el = edgeElsRef.current.get(key)
      if (el && src.x != null && tgt.x != null) {
        el.setAttribute('x1', String(src.x))
        el.setAttribute('y1', String(src.y))
        el.setAttribute('x2', String(tgt.x))
        el.setAttribute('y2', String(tgt.y))
      }
    }

    // Mover nodos
    for (const node of graph.nodes) {
      const el = nodeElsRef.current.get(node.id)
      if (el && node.x != null) {
        el.setAttribute('transform', `translate(${node.x},${node.y})`)
      }
    }
  }, [graph])

  // ─── Construcción imperativa del DOM SVG ──────────────────────────────────

  const rebuildDOM = useCallback(() => {
    const g = gRef.current
    if (!g) return

    // Limpiar
    while (g.firstChild) g.removeChild(g.firstChild)
    nodeElsRef.current.clear()
    edgeElsRef.current.clear()

    const svgNS = 'http://www.w3.org/2000/svg'

    // Layer de aristas
    const edgeLayer = document.createElementNS(svgNS, 'g')
    edgeLayer.setAttribute('class', 'ae-edge-layer')
    for (const edge of graph.edges) {
      const src = typeof edge.source === 'string' ? edge.source : (edge.source as ArgosNode).id
      const tgt = typeof edge.target === 'string' ? edge.target : (edge.target as ArgosNode).id
      const key = `${src}|${tgt}`
      const line = document.createElementNS(svgNS, 'line')
      line.setAttribute('class', 'ae-edge')
      edgeLayer.appendChild(line)
      edgeElsRef.current.set(key, line)
    }
    g.appendChild(edgeLayer)

    // Layer de nodos
    const nodeLayer = document.createElementNS(svgNS, 'g')
    nodeLayer.setAttribute('class', 'ae-node-layer')
    for (const node of graph.nodes) {
      const r = NODE_RADIUS(node.weight)
      const color = NODE_COLOR[node.type] ?? '#38bdf8'

      const grp = document.createElementNS(svgNS, 'g')
      grp.setAttribute('class', 'ae-node')
      grp.setAttribute('data-id', node.id)

      // Halo
      const halo = document.createElementNS(svgNS, 'circle')
      halo.setAttribute('class', 'ae-node-halo ae-halo-pulse')
      halo.setAttribute('r', String(r + 8))
      halo.setAttribute('fill', color)
      halo.setAttribute('opacity', '0.15')
      grp.appendChild(halo)

      // Círculo principal
      const circle = document.createElementNS(svgNS, 'circle')
      circle.setAttribute('class', 'ae-node-circle')
      circle.setAttribute('r', String(r))
      circle.setAttribute('fill', color)
      circle.setAttribute('fill-opacity', '0.9')
      grp.appendChild(circle)

      // Label
      const label = document.createElementNS(svgNS, 'text')
      label.setAttribute('class', 'ae-node-label')
      label.setAttribute('y', String(r + 12))
      label.textContent = node.label.length > 20 ? node.label.slice(0, 18) + '…' : node.label
      grp.appendChild(label)

      // Eventos
      grp.addEventListener('click', () => onNodeClick(node))
      grp.addEventListener('mouseenter', (e) => {
        const evt = e as MouseEvent
        onNodeHover(node, evt.clientX, evt.clientY)
      })
      grp.addEventListener('mouseleave', () => onNodeHover(null, 0, 0))

      nodeLayer.appendChild(grp)
      nodeElsRef.current.set(node.id, grp)
    }
    g.appendChild(nodeLayer)
  }, [graph, onNodeClick, onNodeHover])

  // ─── Actualizar estilos de focus/highlight sin reconstruir ─────────────────

  useEffect(() => {
    for (const [id, el] of nodeElsRef.current) {
      const isFocused = id === focusedNodeId
      const isHighlighted = highlightedIds.has(id)
      el.classList.toggle('focused', isFocused)

      const halo = el.querySelector('.ae-node-halo') as SVGCircleElement | null
      if (halo) {
        if (isHighlighted) {
          halo.setAttribute('opacity', '0.5')
          halo.classList.add('ae-halo-flash')
        } else {
          halo.setAttribute('opacity', isFocused ? '0.35' : '0.15')
          halo.classList.remove('ae-halo-flash')
        }
      }
    }
  }, [focusedNodeId, highlightedIds])

  // ─── Pan con mouse / touch ─────────────────────────────────────────────────

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return
    isDraggingRef.current = true
    dragStartRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: viewRef.current.tx,
      ty: viewRef.current.ty,
    }
  }, [])

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDraggingRef.current) return
    const dx = e.clientX - dragStartRef.current.x
    const dy = e.clientY - dragStartRef.current.y
    viewRef.current = {
      ...viewRef.current,
      tx: dragStartRef.current.tx + dx,
      ty: dragStartRef.current.ty + dy,
    }
    applyTransform(gRef.current, viewRef.current)
  }, [])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
  }, [])

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault()
    const factor = e.deltaY < 0 ? 1.08 : 0.92
    const newScale = Math.max(0.2, Math.min(4, viewRef.current.scale * factor))

    // Zoom centrado en cursor
    const svg = svgRef.current
    if (!svg) return
    const rect = svg.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const { tx, ty, scale } = viewRef.current
    const ratio = newScale / scale
    viewRef.current = {
      tx: mx + (tx - mx) * ratio,
      ty: my + (ty - my) * ratio,
      scale: newScale,
    }
    applyTransform(gRef.current, viewRef.current)
  }, [])

  // ─── Centrar en nodo enfocado ──────────────────────────────────────────────

  useEffect(() => {
    if (!focusedNodeId) return
    const node = graph.nodes.find((n) => n.id === focusedNodeId)
    if (!node || node.x == null || !svgRef.current) return

    const svg = svgRef.current
    const { width, height } = svg.getBoundingClientRect()
    const { scale } = viewRef.current

    viewRef.current = {
      tx: width / 2 - node.x * scale,
      ty: height / 2 - (node.y ?? 0) * scale,
      scale,
    }
    applyTransform(gRef.current, viewRef.current)
  }, [focusedNodeId, graph.nodes])

  // ─── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="ae-canvas-wrapper">
      <div className="ae-grid-bg" />
      <svg
        ref={svgRef}
        className="ae-canvas-svg"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <g ref={gRef} />
      </svg>
    </div>
  )
})
