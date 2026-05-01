// frontend/src/components/graph/GraphEngine.tsx
//
// GraphEngine — el orquestador del grafo forense premium.
//
// Combina layout (radial-cluster), LOD (viewport-budget + semantic-zoom),
// motion (breathing sim + entry-wave + click-ripple), primitivas
// (EntityNode + EdgePath), interacciones (hover + zoom-pan) y fondo
// (radial gradient). Todas las piezas viven en archivos hermanos y se
// componen acá sin más estado del estrictamente necesario.
//
// Trade-off conocido (PR-1, intencional): la sim de respiración llama
// `setTick` cada frame para forzar re-render. Es ineficiente para >300
// nodos pero el cap LOD ya nos protege. La optimización a refs
// imperativas queda para PR-5.
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphEngineProps, ZoomState } from './types'
import { computeRadialLayout } from './layouts/radial-cluster'
import { calcViewportBudget } from './lod/viewport-budget'
import { selectVisibleNodes } from './lod/semantic-zoom'
import { createBreathingSim } from './motion/breathing'
import { fireEntryWave } from './motion/entry-wave'
import { fireClickRipple } from './motion/click-ripple'
import { useHover } from './interactions/use-hover'
import { useZoomPan } from './interactions/use-zoom-pan'
import { EntityNode, type ZoomLevel } from './primitives/EntityNode'
import { EdgePath } from './primitives/EdgePath'
import { RadialBackground, RadialGradientDef } from './background/RadialGradient'

function zoomLevelOf(k: number): ZoomLevel {
  if (k < 0.9) return 'far'
  if (k < 2.4) return 'medium'
  if (k < 4.5) return 'close'
  return 'deep'
}

export function GraphEngine({
  snapshot,
  selectedId,
  hoveredId: hoveredFromOutside,
  onSelect,
  onHover,
  onZoom,
}: GraphEngineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const edgeRefs = useRef<Map<string, SVGPathElement>>(new Map())
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const [zoomState, setZoomState] = useState<ZoomState>({ k: 1, x: 0, y: 0 })

  const { hoveredId: hoveredInternal, setHover, clearHover } = useHover()
  const hoveredId = hoveredFromOutside ?? hoveredInternal

  // ResizeObserver — measure viewport (RAF-coalesced + skip-if-unchanged).
  // Guardamos contra entornos sin RO (jsdom): el size queda en el default 1200x800.
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    if (typeof ResizeObserver === 'undefined') return
    let pending = false
    const ro = new ResizeObserver(entries => {
      if (pending) return
      pending = true
      requestAnimationFrame(() => {
        pending = false
        const cr = entries[0]?.contentRect
        if (!cr) return
        setSize(prev =>
          Math.abs(prev.w - cr.width) < 1 && Math.abs(prev.h - cr.height) < 1
            ? prev
            : { w: cr.width, h: cr.height }
        )
      })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Layout — recalc cuando snapshot o size cambia
  const layout = useMemo(
    () =>
      computeRadialLayout({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        centerX: size.w / 2,
        centerY: size.h / 2,
        maxRadius: Math.min(size.w, size.h) * 0.42,
      }),
    [snapshot, size]
  )

  // LOD — qué nodos renderizar según viewport + zoom
  const visibleNodes = useMemo(() => {
    const budget = calcViewportBudget({ width: size.w, height: size.h }, zoomState.k)
    return selectVisibleNodes(snapshot.nodes, budget)
  }, [snapshot.nodes, size, zoomState.k])

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => snapshot.edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [snapshot.edges, visibleNodeIds]
  )

  // Sim de respiración — re-create on snapshot/layout change.
  // El tick fuerza re-render para que las nuevas posiciones se reflejen.
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const reduceMotion =
      typeof window !== 'undefined' &&
      typeof window.matchMedia === 'function' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sim = createBreathingSim(visibleNodes, layout.anchors, reduceMotion)
    sim.on('tick', () => setTick(t => t + 1))
    return () => {
      sim.stop()
    }
  }, [layout, visibleNodes])

  // Position lookup — el sim mutó copias de los GraphNode pero no las visibles.
  // Para PR-1 usamos la posición ancla directamente; el "breathing" se hace
  // sobre nodos que el sim sí controla pero no los renderizamos por ref.
  // La consecuencia: el primer paint usa anchors. Optimización viene en PR-5.
  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const n of visibleNodes) {
      const a = layout.anchors.get(n.id)
      map.set(n.id, { x: n.x ?? a?.fx0 ?? 0, y: n.y ?? a?.fy0 ?? 0 })
    }
    return map
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, layout, tick])

  // Zoom + pan
  useZoomPan({
    svgRef,
    contentRef,
    minZoom: 0.4,
    maxZoom: 6,
    onZoom: state => {
      setZoomState(state)
      onZoom?.(state)
    },
  })

  // Entry wave on first paint con snapshot válido
  const firstWaveRef = useRef(false)
  useEffect(() => {
    if (firstWaveRef.current) return
    if (visibleEdges.length === 0) return
    firstWaveRef.current = true
    const edgesByDepth = new Map<number, string[]>()
    for (const e of visibleEdges) {
      const target = visibleNodes.find(n => n.id === e.target)
      const d = target?.depth ?? 0
      const arr = edgesByDepth.get(d) ?? []
      arr.push(`${e.source}->${e.target}`)
      edgesByDepth.set(d, arr)
    }
    fireEntryWave(edgeRefs.current, edgesByDepth)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot])

  const zLevel = zoomLevelOf(zoomState.k)

  // Click en background → deselect
  function handleSvgClick(e: React.MouseEvent) {
    if (e.target === svgRef.current) {
      onSelect?.(null)
    }
  }

  function adjacentEdgeIds(nodeId: string): string[] {
    return visibleEdges
      .filter(e => e.source === nodeId || e.target === nodeId)
      .map(e => `${e.source}->${e.target}`)
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: 'block', cursor: 'grab' }}
      onClick={handleSvgClick}
    >
      <RadialGradientDef />
      <RadialBackground width={size.w} height={size.h} />
      <g ref={contentRef}>
        {/* Edges primero (debajo de los nodos) */}
        {visibleEdges.map(e => {
          const s = nodePositions.get(e.source)
          const t = nodePositions.get(e.target)
          if (!s || !t) return null
          const id = `${e.source}->${e.target}`
          return (
            <g
              key={id}
              ref={el => {
                const path = el?.querySelector('path.edge-path') as SVGPathElement | null
                if (path) edgeRefs.current.set(id, path)
              }}
            >
              <EdgePath x1={s.x} y1={s.y} x2={t.x} y2={t.y} kind={e.kind} weight={e.weight} />
            </g>
          )
        })}
        {/* Nodes encima */}
        {visibleNodes.map(n => {
          const pos = nodePositions.get(n.id)
          if (!pos) return null
          const isSelected = selectedId === n.id
          const isHovered = hoveredId === n.id
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                setHover(n.id)
                onHover?.(n.id)
              }}
              onMouseLeave={() => {
                clearHover()
                onHover?.(null)
              }}
              onClick={ev => {
                ev.stopPropagation()
                onSelect?.(n.id)
                fireClickRipple(n.id, edgeRefs.current, adjacentEdgeIds(n.id))
              }}
            >
              <EntityNode
                node={n}
                cx={pos.x}
                cy={pos.y}
                zoomLevel={zLevel}
                selected={isSelected}
                hovered={isHovered}
              />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
