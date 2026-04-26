/**
 * GraphCanvas.tsx — d3-force + IMPERATIVE animation (refs only, zero React per-frame)
 *
 * Migrado del zip Argos v2.0 (`graph.jsx`, 466 LOC). Refactor obligatorio:
 *   - Eliminado `window.__argosSim` global. La simulación vive en `simRef`.
 *     En modo DEV se expone read-only para debugging.
 *   - Tipado estricto contra `d3-force` (NodeDatum/LinkDatum extienden los
 *     SimulationNodeDatum / SimulationLinkDatum del paquete).
 *   - Props nuevas: snapshot/focusedId/hoveredId/highlighted/idle/heroNodeId/
 *     labelsMode/labelsDepth/onHover/onSelect/onBgEnter/onBgLeave.
 *
 * Patrón:
 *   - useRef mirroring de cada prop dinámica → la simulación lee de refs,
 *     NO re-renderiza por cada frame.
 *   - Build sim solo cuando snapshot/size cambia.
 *   - 3 RAF loops: tick (posiciones), step (cámara), pulse (halos 15Hz).
 *   - Cleanup: stop() + cancelAnimationFrame en cada useEffect.
 *
 * className pixel-perfect del zip: graph, node, halo, ring, dot, node-label.
 *
 * Performance: hasta ~500 nodos. La simulación itera todos los nodos por
 * frame, pero usa refs (sin reconciliation). Para >500 nodos puede haber
 * jank en navegadores low-end — considerar canvas2d en una v2.
 */

import { useEffect, useRef, useState, useMemo, useCallback, memo } from 'react'
import {
  forceSimulation,
  forceManyBody,
  forceLink,
  forceCenter,
  forceCollide,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
  type SimulationLinkDatum,
} from 'd3-force'
import type {
  ArgosGraph,
  ArgosNode,
  ArgosNodeType,
  ArgosSeveridad,
  ArgosEdge,
  ArgosEdgeKind,
} from '@/lib/argos/types'

// ─── Constantes de diseño (copiadas del .jsx) ─────────────────────────────────

const TYPE_COLOR: Record<ArgosNodeType, string> = {
  jurisdiccion: '#6FB8E8',
  proveedor: '#FFFFFF',
  director: '#B79CFF',
  contrato: '#62C7A0',
  'señal': '#F5B544',
  // Mapa-neural cordobés
  empresa: '#FFFFFF',           // blanco como proveedor
  persona: '#FFAA5A',           // ámbar (persona física = decision maker)
  funcionario: '#78C8C8',       // teal (servidor público)
  reparticion: '#6FB8E8',       // celeste (jurisdicción/área del Estado)
}

function nodeBaseRadius(n: ArgosNode): number {
  const t = n.type
  const w = n.weight ?? 0.4
  if (t === 'jurisdiccion' || t === 'reparticion') return 14 + w * 16
  if (t === 'proveedor' || t === 'empresa') return 6 + w * 14
  if (t === 'señal') return 7 + w * 8
  if (t === 'director' || t === 'persona') return 6 + w * 8
  if (t === 'funcionario') return 5 + w * 6
  return 3 + w * 5
}

function colorFor(n: ArgosNode): string {
  const sev = n.flags?.severidad
  if (sev === 'grave') return '#E5484D'
  if (sev === 'moderada') return '#F5B544'
  return TYPE_COLOR[n.type] ?? '#9BA3B4'
}

// ─── Tipado d3-force ──────────────────────────────────────────────────────────

/**
 * NodeDatum: ArgosNode + propiedades que d3-force muta in-place
 * (x/y/vx/vy ya están en ArgosNode; index/fx/fy son del simulador).
 */
interface NodeDatum extends ArgosNode, SimulationNodeDatum {
  index?: number
}

/**
 * LinkDatum: por contrato d3 reemplaza source/target (string|Node) por el
 * objeto NodeDatum una vez resuelto. Antes del primer tick pueden ser
 * strings — el código maneja ambos casos.
 */
interface LinkDatum extends SimulationLinkDatum<NodeDatum> {
  source: string | NodeDatum
  target: string | NodeDatum
  kind: ArgosEdgeKind
  weight: number
}

// ─── Refs DOM por nodo / arista ───────────────────────────────────────────────

interface NodeDOMRefs {
  gEl: SVGGElement
  haloEl: SVGCircleElement | null
  ringEl: SVGCircleElement | null
  dotEl: SVGCircleElement | null
  labelEl: SVGTextElement | null
}

interface EdgeDOMRefs {
  lineEl: SVGLineElement
}

interface SimBundle {
  sim: Simulation<NodeDatum, LinkDatum>
  nodes: NodeDatum[]
  edges: LinkDatum[]
  nodeMap: Map<string, NodeDatum>
}

// ─── View state (cámara) ──────────────────────────────────────────────────────

interface ViewState {
  tx: number
  ty: number
  k: number
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function endpointId(end: string | NodeDatum): string {
  return typeof end === 'string' ? end : end.id
}

function endpointNode(end: string | NodeDatum, map: Map<string, NodeDatum>): NodeDatum | undefined {
  return typeof end === 'string' ? map.get(end) : end
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface GraphCanvasProps {
  snapshot: ArgosGraph
  focusedId: string | null
  hoveredId: string | null
  highlighted: Set<string>
  idle: boolean
  heroNodeId: string | null
  labelsMode: 'minimal' | 'all'
  labelsDepth: 1 | 2 | 3
  onHover: (id: string | null) => void
  onSelect: (id: string) => void
  onBgEnter?: () => void
  onBgLeave?: () => void
}

// ─── Componente ──────────────────────────────────────────────────────────────

function GraphCanvasInner({
  snapshot,
  focusedId,
  hoveredId,
  highlighted,
  idle,
  heroNodeId,
  labelsMode,
  labelsDepth,
  onHover,
  onSelect,
  onBgEnter,
  onBgLeave,
}: GraphCanvasProps) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const svgRef = useRef<SVGSVGElement>(null)
  const gRef = useRef<SVGGElement>(null)
  const simRef = useRef<SimBundle | null>(null)

  const [size, setSize] = useState<{ w: number; h: number }>({ w: 1200, h: 800 })
  // Forzamos 1 re-render cuando la sim termina de construirse, para que el
  // JSX pueda mapear nodes/edges con sus refs.
  const [, setSimTick] = useState(0)

  // ─── Refs imperativos para animación ─────────────────────────────────────

  const viewRef = useRef<ViewState>({ tx: 0, ty: 0, k: 1 })
  const targetView = useRef<ViewState>({ tx: 0, ty: 0, k: 1 })
  const timeRef = useRef<number>(0)
  const nodeRefs = useRef<Map<string, NodeDOMRefs>>(new Map())
  const edgeRefs = useRef<EdgeDOMRefs[]>([])

  // Refs que reflejan props para que los RAF loops no requieran re-render
  const focusedRef = useRef<string | null>(focusedId)
  const hoveredRef = useRef<string | null>(hoveredId)
  const highlightedRef = useRef<Set<string>>(highlighted)
  const heroIdRef = useRef<string | null>(heroNodeId)
  const idleRef = useRef<boolean>(idle)

  useEffect(() => { focusedRef.current = focusedId }, [focusedId])
  useEffect(() => { hoveredRef.current = hoveredId }, [hoveredId])
  useEffect(() => { highlightedRef.current = highlighted }, [highlighted])
  useEffect(() => { heroIdRef.current = heroNodeId }, [heroNodeId])
  useEffect(() => { idleRef.current = idle }, [idle])

  // ─── ResizeObserver ──────────────────────────────────────────────────────

  useEffect(() => {
    if (!wrapRef.current) return
    const ro = new ResizeObserver((entries) => {
      const cr = entries[0].contentRect
      setSize({ w: cr.width, h: cr.height })
    })
    ro.observe(wrapRef.current)
    return () => ro.disconnect()
  }, [])

  // ─── BUILD SIM (re-runs solo en cambio de snapshot o tamaño) ─────────────

  useEffect(() => {
    if (!snapshot || snapshot.nodes.length === 0) return
    if (!size.w || !size.h) return

    const cx = size.w / 2
    const cy = size.h / 2
    const span = Math.min(size.w, size.h) * 0.45

    const nodes: NodeDatum[] = snapshot.nodes.map((n, i) => ({
      ...n,
      x: cx + (Math.cos(i * 2.3) * 0.5 + (Math.random() - 0.5)) * span,
      y: cy + (Math.sin(i * 2.3) * 0.5 + (Math.random() - 0.5)) * span,
    }))

    const ids = new Set(nodes.map((n) => n.id))
    const edges: LinkDatum[] = (snapshot.edges as ArgosEdge[])
      .filter((e) => {
        if (!e) return false
        const sId = typeof e.source === 'string' ? e.source : e.source?.id
        const tId = typeof e.target === 'string' ? e.target : e.target?.id
        return ids.has(sId) && ids.has(tId)
      })
      .map((e) => ({
        source: typeof e.source === 'string' ? e.source : e.source.id,
        target: typeof e.target === 'string' ? e.target : e.target.id,
        kind: e.kind,
        weight: e.weight,
      }))

    const sim = forceSimulation<NodeDatum, LinkDatum>(nodes)
      .force(
        'charge',
        forceManyBody<NodeDatum>().strength((d) => {
          if (d.type === 'jurisdiccion' || d.type === 'reparticion') return -380
          if (d.type === 'proveedor' || d.type === 'empresa') return -130
          if (d.type === 'señal') return -170
          if (d.type === 'persona') return -100
          return -55
        }),
      )
      .force(
        'link',
        forceLink<NodeDatum, LinkDatum>(edges)
          .id((d) => d.id)
          .distance((e) => {
            if (e.kind === 'gano') return 50
            if (e.kind === 'opera_en') return 110
            if (e.kind === 'tiene_director') return 65
            if (e.kind === 'señalado_por') return 60
            if (e.kind === 'dirige') return 70
            if (e.kind === 'trabaja_en') return 90
            if (e.kind === 'es_la_misma_persona') return 35
            if (e.kind === 'conflicto_con') return 120
            return 80
          })
          .strength(0.4),
      )
      .force('center', forceCenter(cx, cy).strength(0.05))
      .force(
        'collide',
        forceCollide<NodeDatum>()
          .radius((d) => nodeBaseRadius(d) + 8)
          .strength(0.9),
      )
      .alphaDecay(0.04)
      .alphaMin(0.005)

    const nodeMap = new Map<string, NodeDatum>(nodes.map((n) => [n.id, n]))

    // ── IMPERATIVE TICK: mutamos x1/y1/x2/y2 + transform directo en SVG ──
    const writeFrame = () => {
      const eRefs = edgeRefs.current
      for (let i = 0; i < edges.length; i++) {
        const ref = eRefs[i]
        if (!ref?.lineEl) continue
        const e = edges[i]
        const s = endpointNode(e.source, nodeMap)
        const t = endpointNode(e.target, nodeMap)
        if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) continue
        ref.lineEl.setAttribute('x1', String(s.x))
        ref.lineEl.setAttribute('y1', String(s.y))
        ref.lineEl.setAttribute('x2', String(t.x))
        ref.lineEl.setAttribute('y2', String(t.y))
      }
      nodeRefs.current.forEach((ref, id) => {
        if (!ref?.gEl) return
        const n = nodeMap.get(id)
        if (!n || n.x == null || n.y == null) return
        ref.gEl.setAttribute('transform', `translate(${n.x},${n.y})`)
      })
    }
    sim.on('tick', writeFrame)

    // Seed posicional: corremos 60 ticks sincrónicos para que el grafo
    // arranque con un layout plausible, y schedulea ~10 frames de write
    // para hidratar refs que aparecen tras el primer render.
    for (let i = 0; i < 60; i++) sim.tick()

    let seedRaf = 0
    let seedAttempts = 0
    const seedWrite = () => {
      writeFrame()
      seedAttempts++
      if (seedAttempts < 10) seedRaf = requestAnimationFrame(seedWrite)
    }
    seedRaf = requestAnimationFrame(seedWrite)

    simRef.current = { sim, nodes, edges, nodeMap }

    // Debug-only: exponer la sim sin contaminar producción.
    if (import.meta.env.DEV) {
      ;(window as unknown as { __argosSim?: Simulation<NodeDatum, LinkDatum> }).__argosSim = sim
    }

    // Forzamos un render para que JSX mapee nodes/edges con refs.
    setSimTick((t) => t + 1)

    return () => {
      sim.stop()
      if (seedRaf) cancelAnimationFrame(seedRaf)
      if (import.meta.env.DEV) {
        delete (window as unknown as { __argosSim?: unknown }).__argosSim
      }
    }
    // ESLint quiere size completo; intencionalmente solo dependemos de
    // snapshot identity y dimensiones >0 para evitar rebuilds en flicker.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapshot, size.w > 0 && size.h > 0])

  // ─── VIEW RAF (cámara con interpolación hacia targetView) ────────────────

  useEffect(() => {
    let raf = 0
    const step = () => {
      const v = viewRef.current
      const t = targetView.current
      const dx = t.tx - v.tx
      const dy = t.ty - v.ty
      const dk = t.k - v.k
      if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5 || Math.abs(dk) > 0.005) {
        const far = Math.abs(dx) + Math.abs(dy) > 200
        const f = far ? 0.08 : 0.14
        v.tx += dx * f
        v.ty += dy * f
        v.k += dk * f
        if (gRef.current) {
          gRef.current.setAttribute('transform', `translate(${v.tx},${v.ty}) scale(${v.k})`)
        }
      }
      raf = requestAnimationFrame(step)
    }
    raf = requestAnimationFrame(step)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ─── PULSE RAF (halos a ~15Hz) ───────────────────────────────────────────

  useEffect(() => {
    if (typeof window === 'undefined') return
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) return

    let raf = 0
    let last = 0
    const start = performance.now()
    const tick = (t: number) => {
      if (t - last > 66) {
        last = t
        timeRef.current = (t - start) / 1000
        const fid = focusedRef.current
        const hid = hoveredRef.current
        const hi = highlightedRef.current
        const heroId = heroIdRef.current
        const heroActive = idleRef.current && heroId
        nodeRefs.current.forEach((ref, id) => {
          if (!ref?.haloEl) return
          const isFocus = id === fid
          const isHover = id === hid
          const isHi = hi && hi.has(id)
          const isHero = heroActive && id === heroId
          if (isFocus || isHover || isHi) {
            const phase = timeRef.current * 0.6 + (id.charCodeAt(0) % 17) * 0.21
            const scale = 1 + Math.sin(phase * 1.3) * 0.06
            ref.haloEl.setAttribute('opacity', '1')
            ref.haloEl.setAttribute('transform', `scale(${scale})`)
          } else if (isHero) {
            const op = 0.25 + Math.sin(timeRef.current * (Math.PI * 2 / 6)) * 0.07
            ref.haloEl.setAttribute('opacity', String(op))
            ref.haloEl.setAttribute('transform', 'scale(1)')
          } else {
            ref.haloEl.setAttribute('opacity', '0')
          }
        })
      }
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  // ─── Idle hero pulling force ─────────────────────────────────────────────

  useEffect(() => {
    const bundle = simRef.current
    const sim = bundle?.sim
    if (!sim || !bundle) return
    if (idle && heroNodeId) {
      const heroNode = bundle.nodes.find((n) => n.id === heroNodeId)
      if (heroNode) {
        sim.force(
          'xHero',
          forceX<NodeDatum>(size.w / 2).strength((d) => (d.id === heroNodeId ? 0.4 : 0.06)),
        )
        sim.force(
          'yHero',
          forceY<NodeDatum>(size.h / 2).strength((d) => (d.id === heroNodeId ? 0.4 : 0.06)),
        )
        sim.alpha(0.18).restart()
      }
    } else {
      sim.force('xHero', null)
      sim.force('yHero', null)
    }
  }, [idle, heroNodeId, size.w, size.h])

  // ─── Recenter on size change ─────────────────────────────────────────────

  useEffect(() => {
    const bundle = simRef.current
    if (!bundle) return
    bundle.sim.force('center', forceCenter(size.w / 2, size.h / 2).strength(0.05))
    bundle.sim.alpha(0.18).restart()
  }, [size.w, size.h])

  // ─── Pan/zoom on focus change ────────────────────────────────────────────

  useEffect(() => {
    if (!focusedId || !simRef.current) return
    const node = simRef.current.nodes.find((n) => n.id === focusedId)
    if (!node) return
    const t = setTimeout(() => {
      const cx = size.w / 2
      const cy = size.h / 2
      const k = node.type === 'jurisdiccion' ? 1.15 : 1.45
      const nx = node.x ?? cx
      const ny = node.y ?? cy
      targetView.current = { k, tx: cx - nx * k, ty: cy - ny * k }
      simRef.current?.sim.alpha(0.18).restart()
    }, 280)
    return () => clearTimeout(t)
  }, [focusedId, size.w, size.h])

  // ─── Wheel/pan input ─────────────────────────────────────────────────────

  const onWheel = useCallback((e: React.WheelEvent<SVGSVGElement>) => {
    e.preventDefault()
    if (!svgRef.current) return
    const delta = -e.deltaY * 0.0015
    const k = Math.min(2.5, Math.max(0.45, targetView.current.k * (1 + delta)))
    const rect = svgRef.current.getBoundingClientRect()
    const mx = e.clientX - rect.left
    const my = e.clientY - rect.top
    const x = (mx - targetView.current.tx) / targetView.current.k
    const y = (my - targetView.current.ty) / targetView.current.k
    targetView.current = { k, tx: mx - x * k, ty: my - y * k }
  }, [])

  const dragRef = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)

  const onMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    // No iniciar pan si el click cae dentro de un .node
    const target = e.target as Element | null
    if (target && target.closest && target.closest('.node')) return
    dragRef.current = {
      x: e.clientX,
      y: e.clientY,
      tx: targetView.current.tx,
      ty: targetView.current.ty,
    }
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!dragRef.current) return
    const dx = e.clientX - dragRef.current.x
    const dy = e.clientY - dragRef.current.y
    targetView.current = {
      ...targetView.current,
      tx: dragRef.current.tx + dx,
      ty: dragRef.current.ty + dy,
    }
  }, [])

  const onMouseUp = useCallback(() => {
    dragRef.current = null
  }, [])

  // ─── Snapshot derivado del bundle (post-build) ───────────────────────────

  const nodes: NodeDatum[] = simRef.current?.nodes ?? []
  const edges: LinkDatum[] = simRef.current?.edges ?? []

  // ─── Adjacency (topología) ───────────────────────────────────────────────

  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>()
    edges.forEach((e) => {
      const sId = endpointId(e.source)
      const tId = endpointId(e.target)
      if (!m.has(sId)) m.set(sId, new Set())
      if (!m.has(tId)) m.set(tId, new Set())
      m.get(sId)!.add(tId)
      m.get(tId)!.add(sId)
    })
    return m
  }, [edges])

  const neighborSet = useMemo(() => {
    if (!focusedId) return null
    const s = new Set<string>([focusedId])
    edges.forEach((e) => {
      const sId = endpointId(e.source)
      const tId = endpointId(e.target)
      if (sId === focusedId) s.add(tId)
      if (tId === focusedId) s.add(sId)
    })
    return s
    // edges identity cambia al rebuild — suficiente
  }, [focusedId, edges])

  const labelExpandSet = useMemo(() => {
    if (labelsMode !== 'all') return null
    const seed = focusedId || hoveredId || heroNodeId
    if (!seed) return new Set<string>(nodes.map((n) => n.id))
    const visited = new Set<string>([seed])
    let frontier: string[] = [seed]
    for (let d = 0; d < labelsDepth; d++) {
      const next: string[] = []
      frontier.forEach((id) => {
        const nb = adjacency.get(id)
        if (!nb) return
        nb.forEach((m) => {
          if (!visited.has(m)) {
            visited.add(m)
            next.push(m)
          }
        })
      })
      frontier = next
    }
    return visited
  }, [labelsMode, labelsDepth, focusedId, hoveredId, heroNodeId, adjacency, nodes])

  // ─── IMPERATIVE: focus/hover/highlight → mutar opacidad y labels ─────────

  useEffect(() => {
    nodeRefs.current.forEach((ref, id) => {
      if (!ref?.gEl) return
      const n = nodes.find((x) => x.id === id)
      if (!n) return
      const inFocus = !focusedId || (neighborSet ? neighborSet.has(id) : false)
      const isFocus = id === focusedId
      const isHover = id === hoveredId
      const isHi = highlighted && highlighted.has(id)
      const isHero = idle && id === heroNodeId
      ref.gEl.setAttribute('opacity', inFocus ? '1' : '0.18')

      if (ref.labelEl) {
        const r0Base = nodeBaseRadius(n)
        const isLargeJ = n.type === 'jurisdiccion' && r0Base >= 18
        const inExpand = labelExpandSet ? labelExpandSet.has(id) : false
        const showLabel =
          isHero ||
          isLargeJ ||
          isFocus ||
          isHover ||
          isHi ||
          inExpand ||
          (neighborSet?.has(id) ? r0Base > 12 : false)
        ref.labelEl.style.display = showLabel ? '' : 'none'
      }
      if (ref.ringEl) {
        ref.ringEl.setAttribute('stroke-opacity', isFocus ? '0.55' : '0.18')
      }
    })

    edgeRefs.current.forEach((ref, i) => {
      if (!ref?.lineEl) return
      const e = edges[i]
      if (!e) return
      const sId = endpointId(e.source)
      const tId = endpointId(e.target)
      const inFocus = neighborSet ? neighborSet.has(sId) && neighborSet.has(tId) : false
      const touchesHero = !focusedId && (sId === heroNodeId || tId === heroNodeId)
      const isHi = highlighted && (highlighted.has(sId) || highlighted.has(tId))
      let op = focusedId ? (inFocus ? 0.5 : 0.04) : touchesHero ? 0.22 : 0.08
      if (isHi) op = 0.75
      ref.lineEl.setAttribute('stroke-opacity', String(op))
    })
  }, [focusedId, hoveredId, highlighted, neighborSet, labelExpandSet, idle, heroNodeId, nodes, edges])

  const handleHover = useCallback((id: string | null) => onHover(id), [onHover])
  const handleSelect = useCallback((id: string) => onSelect(id), [onSelect])

  // ─── Render JSX ──────────────────────────────────────────────────────────

  return (
    <div
      ref={wrapRef}
      style={{ position: 'absolute', inset: 0 }}
      onMouseEnter={onBgEnter}
      onMouseLeave={onBgLeave}
    >
      <svg
        ref={svgRef}
        className="graph"
        onWheel={onWheel}
        onMouseDown={onMouseDown}
        onMouseMove={onMouseMove}
        onMouseUp={onMouseUp}
        onMouseLeave={onMouseUp}
      >
        <defs>
          <radialGradient id="halo-celeste" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6FB8E8" stopOpacity="0.55" />
            <stop offset="60%" stopColor="#6FB8E8" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#6FB8E8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="halo-celeste-hero" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#6FB8E8" stopOpacity="0.45" />
            <stop offset="50%" stopColor="#6FB8E8" stopOpacity="0.18" />
            <stop offset="100%" stopColor="#6FB8E8" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="halo-ambar" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#F5B544" stopOpacity="0.5" />
            <stop offset="100%" stopColor="#F5B544" stopOpacity="0" />
          </radialGradient>
          <radialGradient id="halo-rojo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#E5484D" stopOpacity="0.6" />
            <stop offset="100%" stopColor="#E5484D" stopOpacity="0" />
          </radialGradient>
          <filter id="soft-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <g ref={gRef}>
          {/* edges-group */}
          <g className="edges-group">
            {edges.map((e, i) => {
              const stroke =
                e.kind === 'conflicto_con' ? '#E5484D'
                : e.kind === 'señalado_por' ? '#F5B544'
                : e.kind === 'tiene_director' ? '#B79CFF'
                : e.kind === 'dirige' ? '#FFAA5A'
                : e.kind === 'trabaja_en' ? '#78C8C8'
                : e.kind === 'es_la_misma_persona' ? '#B79CFF'
                : e.kind === 'gano' ? '#9BA3B4'
                : '#6FB8E8'
              const sw = e.kind === 'conflicto_con'
                ? 1.2 + (e.weight || 0.5) * 2.0
                : 0.6 + (e.weight || 0.3) * 1.6
              const dash = e.kind === 'conflicto_con' ? '4 3' : undefined
              return (
                <line
                  key={i}
                  ref={(el) => {
                    if (el) edgeRefs.current[i] = { lineEl: el }
                  }}
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeOpacity={e.kind === 'conflicto_con' ? 0.65 : 0.08}
                  strokeDasharray={dash}
                />
              )
            })}
          </g>

          {/* nodes-group */}
          <g className="nodes-group">
            {nodes.map((n) => {
              const r0Base = nodeBaseRadius(n)
              const c = colorFor(n)
              const sev: ArgosSeveridad | undefined = n.flags?.severidad
              const haloId =
                sev === 'grave' ? 'halo-rojo'
                : sev === 'moderada' ? 'halo-ambar'
                : n.id === heroNodeId ? 'halo-celeste-hero'
                : 'halo-celeste'
              const r = r0Base
              const haloR = r * 4
              const initX = n.x ?? 0
              const initY = n.y ?? 0

              let fill = c
              let fillOp = 0.85
              let strokeCol = c
              let strokeOp = 0.28
              let strokeW = 0.8
              if (n.type === 'proveedor') {
                if (n.flags?.verificadoAfip) {
                  fill = '#FFFFFF'; fillOp = 0.92; strokeCol = '#FFFFFF'; strokeOp = 0.7
                } else {
                  fill = '#D8DEE9'; fillOp = 0.65; strokeCol = '#D8DEE9'; strokeOp = 0.4
                }
              } else if (n.type === 'jurisdiccion') {
                fillOp = 0.16
                strokeW = 1.4
              } else if (n.type === 'contrato') {
                fillOp = 0.10
                strokeOp = 0.10
              }

              const labelText = n.label.length > 28 ? n.label.slice(0, 26) + '…' : n.label

              return (
                <g
                  key={n.id}
                  className={`node ${n.type === 'señal' ? 'is-señal' : ''}`}
                  transform={`translate(${initX},${initY})`}
                  ref={(el) => {
                    if (!el) return
                    nodeRefs.current.set(n.id, {
                      gEl: el,
                      haloEl: el.querySelector('.halo'),
                      ringEl: el.querySelector('.ring'),
                      dotEl: el.querySelector('.dot'),
                      labelEl: el.querySelector('.node-label'),
                    })
                  }}
                  onMouseEnter={() => handleHover(n.id)}
                  onMouseLeave={() => handleHover(null)}
                  onClick={(ev) => {
                    ev.stopPropagation()
                    handleSelect(n.id)
                  }}
                  role="button"
                  tabIndex={0}
                  aria-label={`${n.type}: ${n.label}`}
                  onKeyDown={(ev) => {
                    if (ev.key === 'Enter') handleSelect(n.id)
                  }}
                >
                  <circle className="halo" r={haloR} fill={`url(#${haloId})`} opacity="0" />
                  <circle
                    className="ring"
                    r={r + 2}
                    fill="none"
                    stroke={strokeCol}
                    strokeOpacity={strokeOp * 0.6}
                    strokeWidth={1}
                  />
                  <circle
                    className="dot"
                    r={r}
                    fill={fill}
                    fillOpacity={fillOp}
                    stroke={strokeCol}
                    strokeWidth={strokeW}
                    strokeOpacity={strokeOp}
                  />
                  <text className="node-label" y={r + 14} style={{ display: 'none' }}>
                    {labelText}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
    </div>
  )
}

export const GraphCanvas = memo(GraphCanvasInner)
export default GraphCanvas
