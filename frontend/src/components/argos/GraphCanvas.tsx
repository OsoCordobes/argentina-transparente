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
  forceRadial,
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

/**
 * Profundidad jerárquica del nodo (0 = raíz, 1 = nivel intermedio, 2+ = hojas).
 * Si el backend ya calculó depth y lo serializó en `data.depth`, lo usamos.
 * Fallback: inferimos por tipo — jurisdiccion=0, reparticion=1, resto=2.
 * Esto soporta tanto el grafo /api/grafo/jerarquia (Estado→Repartición→Empresa)
 * como el grafo dashboard legacy donde no hay depth explícito.
 */
function getNodeDepth(n: ArgosNode): number {
  const raw = (n.data as { depth?: unknown } | undefined)?.depth
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const t = n.type
  if (t === 'jurisdiccion') return 0
  if (t === 'reparticion') return 1
  return 2
}

/** Radio del anillo concéntrico para una profundidad dada. Usado por
 *  forceRadial y por las guías visuales (dashed circles). */
function depthRadius(depth: number, span: number): number {
  if (depth <= 0) return 0
  if (depth === 1) return span * 0.35
  if (depth === 2) return span * 0.7
  return span * 0.95
}

function nodeBaseRadius(n: ArgosNode): number {
  const t = n.type
  const w = n.weight ?? 0.4
  let r: number
  if (t === 'jurisdiccion' || t === 'reparticion') r = 14 + w * 16
  else if (t === 'proveedor' || t === 'empresa') r = 6 + w * 14
  else if (t === 'señal') r = 7 + w * 8
  else if (t === 'director' || t === 'persona') r = 6 + w * 8
  else if (t === 'funcionario') r = 5 + w * 6
  else r = 3 + w * 5

  // GAP 4: depth multiplier — la jerarquía debe ser visualmente obvia.
  const d = getNodeDepth(n)
  if (d === 0) r *= 1.5
  else if (d === 1) r *= 1.2
  return r
}

function colorFor(n: ArgosNode): string {
  const sev = n.flags?.severidad
  if (sev === 'grave') return '#E5484D'
  if (sev === 'moderada') return '#F5B544'
  return TYPE_COLOR[n.type] ?? '#9BA3B4'
}

/**
 * Path SVG para arista curva tipo "rama de árbol genealógico".
 * Punto de control en el midpoint perpendicularmente desplazado ~10% de
 * la longitud de la arista. Da sensación orgánica (vs rayos rectos).
 *
 * Para edge_length L, con normal unitaria (nx, ny), la curva sale ~0.1L
 * del lado donde el target está más bajo (para que padre→hijo se vea
 * "fluyendo hacia abajo" en el árbol).
 */
function quadraticPathD(sx: number, sy: number, tx: number, ty: number): string {
  const dx = tx - sx
  const dy = ty - sy
  const len = Math.hypot(dx, dy) || 1
  // Vector normal perpendicular (rotado 90° antihorario).
  const nx = -dy / len
  const ny = dx / len
  // Offset proporcional a la longitud (10% de L) con cap a 36px en edges
  // muy largas. Para edges cortas (<60px) baja a 6-8px → curva apenas
  // perceptible, evita que nodos cercanos se solapen con la curva.
  const k = Math.max(6, Math.min(36, len * 0.1))
  const cpx = (sx + tx) / 2 + nx * k
  const cpy = (sy + ty) / 2 + ny * k
  return `M${sx.toFixed(1)},${sy.toFixed(1)} Q${cpx.toFixed(1)},${cpy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`
}

/** Path recto (M sx,sy L tx,ty) — para aristas no-jerárquicas. */
function straightPathD(sx: number, sy: number, tx: number, ty: number): string {
  return `M${sx.toFixed(1)},${sy.toFixed(1)} L${tx.toFixed(1)},${ty.toFixed(1)}`
}

/**
 * ¿Es una arista jerárquica (padre→hijo del árbol genealógico)?
 *
 * Reconoce:
 *   - 'gano' — Empresa → Repartición (canonical Cordoba dataset)
 *   - 'opera_en' — Empresa → Jurisdicción (alias)
 *   - 'tiene_director' — Empresa → PersonaFisica (estructura de gobernanza)
 *   - 'pertenece_a' — Repartición → Estado (cuando el backend lo emita
 *     por /api/grafo/jerarquia; no está en ArgosEdgeKind aún, comparamos string).
 */
function isHierarchicalEdge(kind: ArgosEdgeKind | string): boolean {
  return (
    kind === 'gano' ||
    kind === 'opera_en' ||
    kind === 'tiene_director' ||
    kind === 'pertenece_a'
  )
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
  /** Elemento SVG. Mantengo el nombre `lineEl` por compatibilidad histórica
   *  pero ahora apunta a un <path> (mucho más flexible: rectos para no
   *  jerárquicas, curvas Bézier para padre→hijo del árbol). */
  lineEl: SVGPathElement
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

  // Premium touch D — tooltip flotante. La posición vive en un ref + RAF
  // imperativo (NO en React state) — onMouseMove dispara por pixel y
  // setState provocaría reconciliación de los 60+ <g> nodos por frame.
  // Solo el `hoveredTooltipId` está en React state porque cambia 1 vez
  // por enter/leave, no por movimiento.
  const [hoveredTooltipId, setHoveredTooltipId] = useState<string | null>(null)
  const tooltipDivRef = useRef<HTMLDivElement | null>(null)
  const tooltipRafRef = useRef<number | null>(null)
  const tooltipPosRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 })

  const scheduleTooltipMove = useCallback((clientX: number, clientY: number) => {
    if (!wrapRef.current) return
    const rect = wrapRef.current.getBoundingClientRect()
    tooltipPosRef.current = { x: clientX - rect.left, y: clientY - rect.top }
    if (tooltipRafRef.current != null) return
    tooltipRafRef.current = requestAnimationFrame(() => {
      tooltipRafRef.current = null
      const el = tooltipDivRef.current
      if (!el) return
      const { x, y } = tooltipPosRef.current
      el.style.transform = `translate(${x + 12}px, ${y + 12}px)`
    })
  }, [])

  // Premium touch E — tracking de nodos que ya completaron su entry
  // animation. La clase `.node-entering` solo debe aplicarse en el primer
  // mount del nodo dentro del snapshot; sin este Set, cualquier re-render
  // del padre re-aplicaría la clase y el usuario vería flicker entre
  // paint y el RAF que la quita.
  const enteredRef = useRef<Set<string>>(new Set())
  useEffect(() => {
    enteredRef.current = new Set()
  }, [snapshot])

  // Cleanup del RAF del tooltip al desmontar (evita disparar setAttribute
  // sobre un div ya removido del DOM).
  useEffect(() => {
    return () => {
      if (tooltipRafRef.current != null) {
        cancelAnimationFrame(tooltipRafRef.current)
        tooltipRafRef.current = null
      }
    }
  }, [])

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

    // Movimiento sutil continuo: alphaTarget > 0 mantiene la simulación
    // viva en idle (los nodos "respiran"). Si el usuario tiene
    // prefers-reduced-motion: reduce, dejamos los nodos quietos.
    const reduceMotion =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const idleAlphaTarget = reduceMotion ? 0 : 0.003

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
      // GAP 3: forceRadial — cada profundidad tiene un anillo concéntrico,
      // amarrando los nodos a su nivel jerárquico. Sin esto, los hijos
      // "flotan" sin estructura visible.
      //   depth 0 (Estado): pegado al centro (strength 0.6)
      //   depth 1 (Reparticiones): cling al primer anillo (strength 0.35)
      //   depth 2+ (Empresas): cling al anillo exterior (strength 0.25)
      .force(
        'radial',
        forceRadial<NodeDatum>(
          (d) => depthRadius(getNodeDepth(d), span),
          cx,
          cy,
        ).strength((d) => {
          const depth = getNodeDepth(d)
          if (depth === 0) return 0.6
          if (depth === 1) return 0.35
          return 0.25
        }),
      )
      .alphaDecay(0.04)
      // reduceMotion: alphaMin=0.001 para que la sim se detenga al decaer.
      // Movimiento sutil: alphaMin=0 + alphaTarget>0 mantiene la sim viva.
      .alphaMin(reduceMotion ? 0.001 : 0)
      .alphaTarget(idleAlphaTarget)

    const nodeMap = new Map<string, NodeDatum>(nodes.map((n) => [n.id, n]))

    // ── IMPERATIVE TICK: mutamos `d` del path + transform directo en <g> ──
    // path.setAttribute('d', ...) es ~tan barato como x1/y1/x2/y2 en
    // browsers modernos (Skia rasteriza ambos del mismo modo). Beneficio:
    // soportamos curvas Bézier para aristas jerárquicas sin perder perf.
    const writeFrame = () => {
      const eRefs = edgeRefs.current
      for (let i = 0; i < edges.length; i++) {
        const ref = eRefs[i]
        if (!ref?.lineEl) continue
        const e = edges[i]
        const s = endpointNode(e.source, nodeMap)
        const t = endpointNode(e.target, nodeMap)
        if (!s || !t || s.x == null || t.x == null || s.y == null || t.y == null) continue
        const d = isHierarchicalEdge(e.kind)
          ? quadraticPathD(s.x, s.y, t.x, t.y)
          : straightPathD(s.x, s.y, t.x, t.y)
        ref.lineEl.setAttribute('d', d)
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
  // Iter 8.15: el nodo focado puede haber sido agregado por
  // expandirNodoGrafo (click desde sidebar Mapa del poder) y todavía
  // no estar en simRef. Usamos un timer + retry cuando snapshot cambia
  // para asegurar que el pan llegue al nodo nuevo.

  useEffect(() => {
    if (!focusedId) return
    let cancelled = false
    const tryFocus = (attempts: number) => {
      if (cancelled) return
      const node = simRef.current?.nodes.find((n) => n.id === focusedId)
      if (!node) {
        if (attempts > 0) setTimeout(() => tryFocus(attempts - 1), 200)
        return
      }
      const cx = size.w / 2
      const cy = size.h / 2
      const k = (node.type === 'jurisdiccion' || node.type === 'reparticion')
        ? 1.15
        : 1.45
      const nx = node.x ?? cx
      const ny = node.y ?? cy
      targetView.current = { k, tx: cx - nx * k, ty: cy - ny * k }
      simRef.current?.sim.alpha(0.18).restart()
    }
    const t = setTimeout(() => tryFocus(5), 280)
    return () => {
      cancelled = true
      clearTimeout(t)
    }
  }, [focusedId, size.w, size.h, snapshot])

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
        const depth = getNodeDepth(n)
        // GAP 2: labels visibles by default cuando el nodo es estructural.
        //   - depth 0 (Estado raíz): SIEMPRE
        //   - depth 1 (Reparticiones): SIEMPRE
        //   - weight > 0.6: SIEMPRE (top empresas por monto)
        //   - severidad grave: SIEMPRE (alarmas)
        // El comportamiento aditivo (focus/hover/expand) se preserva.
        const isStructural = depth <= 1
        const isHeavy = (n.weight ?? 0) > 0.6
        const isAlarm = n.flags?.severidad === 'grave'
        const isLargeJ = n.type === 'jurisdiccion' && r0Base >= 18
        const inExpand = labelExpandSet ? labelExpandSet.has(id) : false
        const showLabel =
          isStructural ||
          isHeavy ||
          isAlarm ||
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
      // GAP 6: edge raised opacity si la fuente o destino están hovered.
      const touchesHover = hoveredId != null && (sId === hoveredId || tId === hoveredId)

      // GAP 1: baseline opacity por kind. Aristas jerárquicas (gano,
      // pertenece_a, opera_en, tiene_director) deben ser visibles SIEMPRE
      // — son el esqueleto del árbol. conflicto_con queda 0.65 (alarma roja).
      // Otras kinds intermedias 0.22 (visibles, no dominantes).
      const isHier = isHierarchicalEdge(e.kind)
      let baseline: number
      if (e.kind === 'conflicto_con') baseline = 0.65
      else if (isHier) baseline = 0.5
      else baseline = 0.22

      let op: number
      if (focusedId) {
        op = inFocus ? Math.max(0.55, baseline) : 0.04
      } else if (isHi) {
        op = 0.85
      } else if (touchesHover) {
        // +0.3 sobre baseline, capped at 0.85.
        op = Math.min(0.85, baseline + 0.3)
      } else if (touchesHero) {
        op = Math.max(baseline, 0.32)
      } else {
        op = baseline
      }
      ref.lineEl.setAttribute('stroke-opacity', String(op))
    })
    // MAJOR 4: NO incluir `nodes` ni `edges` en las deps. Ambos se
    // recalculan vía `simRef.current?.nodes ?? []` en cada render →
    // referencias frescas → este effect correría en cada render del
    // padre. La sim solo cambia cuando rebuild, lo cual ya señala
    // `setSimTick` (no listado pero gatilla render → este effect lee
    // simRef.current vía `nodes`/`edges` cerrados arriba). Las deps
    // listadas representan los inputs reales de visibilidad/highlight.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusedId, hoveredId, highlighted, neighborSet, labelExpandSet, idle, heroNodeId])

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
          {/* Premium touch B — glow para el Estado raíz y top reparticiones.
              Usado vía filter="url(#argos-glow)" en nodos depth 0 / depth 1
              con weight > 0.7. Mismo patrón visual que Maltego/Palantir. */}
          <filter id="argos-glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3.5" result="g" />
            <feComposite in="SourceGraphic" in2="g" operator="over" />
          </filter>
        </defs>

        <g ref={gRef}>
          {/* Premium touch C — guías de profundidad (anillos concéntricos
              tenues). Ayudan a "leer" la jerarquía sin agregar ruido visual.
              Renderizadas PRIMERO para quedar detrás de aristas y nodos. */}
          <g className="depth-guides" pointerEvents="none">
            {[1, 2].map((d) => {
              const span = Math.min(size.w, size.h) * 0.45
              const r = depthRadius(d, span)
              if (r <= 0) return null
              return (
                <circle
                  key={`ring-${d}`}
                  cx={size.w / 2}
                  cy={size.h / 2}
                  r={r}
                  fill="none"
                  stroke="rgba(255,255,255,0.05)"
                  strokeDasharray="2 6"
                  strokeWidth={1}
                />
              )
            })}
          </g>

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
              // Baseline strokeOpacity por kind (GAP 1). El imperative
              // effect lo sobreescribe por focus/hover, esto es solo el
              // estado de partida antes del primer tick del effect.
              const baselineOp = e.kind === 'conflicto_con' ? 0.65
                : isHierarchicalEdge(e.kind) ? 0.5
                : 0.22
              return (
                <path
                  key={i}
                  ref={(el) => {
                    if (el) edgeRefs.current[i] = { lineEl: el }
                  }}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={sw}
                  strokeOpacity={baselineOp}
                  strokeDasharray={dash}
                  strokeLinecap="round"
                />
              )
            })}
          </g>

          {/* nodes-group */}
          <g className="nodes-group">
            {nodes.map((n, idx) => {
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
              const depth = getNodeDepth(n)

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

              // GAP 5: label truncation y styling diferenciado por depth.
              const truncLen = depth <= 1 ? 32 : 24
              const labelText =
                n.label.length > truncLen ? n.label.slice(0, truncLen - 2) + '…' : n.label
              const labelFontSize =
                depth === 0 ? 13 : depth === 1 ? 12 : depth === 2 ? 10 : 9
              const labelFontWeight = depth <= 1 ? 600 : 500
              const labelFill = colorFor(n)

              // Premium touch B — glow para Estado raíz + top reparticiones.
              const applyGlow =
                depth === 0 || (depth === 1 && (n.weight ?? 0) > 0.7)

              // Premium touch E — entry transition. Stagger por idx, max 600ms.
              // Usamos CSS transition vía style + key dinámica del snapshot
              // para reiniciar al cambiar nodos. La clase .node-entering
              // arranca con opacity 0 y se anima a 1 vía CSS.
              const entryDelay = Math.min(idx * 20, 600)

              // BLOCKER 1: solo aplicamos `node-entering` si el nodo aún
              // no terminó su transición. El Set `enteredRef` se resetea
              // al cambiar snapshot. En re-renders por hover/etc el nodo
              // ya está marcado y NO recibe la clase, evitando flicker.
              const isEntering = !enteredRef.current.has(n.id)
              return (
                <g
                  key={n.id}
                  className={`node${isEntering ? ' node-entering' : ''}${n.type === 'señal' ? ' is-señal' : ''}`}
                  transform={`translate(${initX},${initY})`}
                  style={{
                    transition: `opacity 400ms ease-out ${entryDelay}ms`,
                  }}
                  ref={(el) => {
                    if (!el) return
                    nodeRefs.current.set(n.id, {
                      gEl: el,
                      haloEl: el.querySelector('.halo'),
                      ringEl: el.querySelector('.ring'),
                      dotEl: el.querySelector('.dot'),
                      labelEl: el.querySelector('.node-label'),
                    })
                    // Premium touch E — tras montar, removemos la clase
                    // .node-entering en el siguiente frame y marcamos al
                    // nodo como "ya entró" para evitar re-aplicación en
                    // futuros renders. Idempotente.
                    if (isEntering) {
                      requestAnimationFrame(() => {
                        el.classList.remove('node-entering')
                        enteredRef.current.add(n.id)
                      })
                    }
                  }}
                  onMouseEnter={(ev) => {
                    handleHover(n.id)
                    // BLOCKER 2: la posición se mueve via RAF imperativo,
                    // solo `hoveredTooltipId` toca React state (1 update
                    // por enter/leave, no por pixel).
                    setHoveredTooltipId(n.id)
                    scheduleTooltipMove(ev.clientX, ev.clientY)
                  }}
                  onMouseMove={(ev) => {
                    // BLOCKER 2: NO setState. RAF-batched, ref-driven.
                    if (hoveredTooltipId === n.id) {
                      scheduleTooltipMove(ev.clientX, ev.clientY)
                    }
                  }}
                  onMouseLeave={() => {
                    handleHover(null)
                    setHoveredTooltipId(null)
                    // Cancelar cualquier RAF pendiente para evitar que un
                    // último move post-leave lo reposicione.
                    if (tooltipRafRef.current != null) {
                      cancelAnimationFrame(tooltipRafRef.current)
                      tooltipRafRef.current = null
                    }
                  }}
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
                    filter={applyGlow ? 'url(#argos-glow)' : undefined}
                  />
                  <text
                    className="node-label"
                    y={r + 14}
                    style={{
                      display: 'none',
                      fontSize: `${labelFontSize}px`,
                      fontWeight: labelFontWeight,
                      fill: labelFill,
                      pointerEvents: 'none',
                    }}
                  >
                    {labelText}
                  </text>
                </g>
              )
            })}
          </g>
        </g>
      </svg>
      {/* Premium touch D — tooltip flotante. Pointer-events: none para no
          interceptar mouseleave del nodo. La posición se actualiza
          imperativamente vía `scheduleTooltipMove` (RAF batched) → el
          contenedor se renderiza UNA vez y solo cambia su contenido
          cuando `hoveredTooltipId` cambia (enter/leave, no por pixel).
          fontSize 11 + font-mono según pattern del diseño forense. */}
      <div
        ref={tooltipDivRef}
        style={{
          position: 'absolute',
          left: 0,
          top: 0,
          transform: 'translate(-9999px, -9999px)',
          maxWidth: 280,
          background: 'rgba(12,15,22,0.96)',
          border: '1px solid rgba(255,255,255,0.08)',
          borderRadius: 4,
          padding: '8px 10px',
          fontFamily: 'ui-monospace, "SF Mono", Menlo, monospace',
          fontSize: 11,
          color: 'var(--text-1)',
          pointerEvents: 'none',
          zIndex: 50,
          boxShadow: '0 4px 18px rgba(0,0,0,0.45)',
          opacity: hoveredTooltipId ? 1 : 0,
          willChange: 'transform',
          display: hoveredTooltipId ? 'block' : 'none',
        }}
      >
        {(() => {
          if (!hoveredTooltipId) return null
          const node = nodes.find((nx) => nx.id === hoveredTooltipId)
          if (!node) return null
          const subtitle =
            node.subtitle
            || (node.data?.cuit ? `CUIT ${String(node.data.cuit)}` : undefined)
            || (node.type === 'jurisdiccion' || node.type === 'reparticion'
                ? node.type === 'jurisdiccion' ? 'Estado' : 'Repartición'
                : undefined)
          const monto = typeof node.data?.monto === 'number'
            ? node.data.monto as number
            : null
          const contratos = typeof node.data?.contratos === 'number'
            ? node.data.contratos as number
            : (typeof node.data?.totalContratos === 'number'
                ? node.data.totalContratos as number
                : null)
          const fmtMonto = (v: number): string => {
            if (v >= 1e9) return `$${(v / 1e9).toFixed(1)} mil M`
            if (v >= 1e6) return `$${(v / 1e6).toFixed(1)} M`
            if (v >= 1e3) return `$${(v / 1e3).toFixed(0)} k`
            return `$${v.toFixed(0)}`
          }
          return (
            <>
              <div style={{ fontWeight: 600, color: colorFor(node) }}>
                {node.label}
              </div>
              {subtitle && (
                <div style={{ color: 'var(--text-3)', marginTop: 2 }}>
                  {subtitle}
                </div>
              )}
              {monto != null && (
                <div style={{ marginTop: 4 }}>
                  <span style={{ color: 'var(--text-3)' }}>monto: </span>
                  {fmtMonto(monto)}
                </div>
              )}
              {contratos != null && (
                <div>
                  <span style={{ color: 'var(--text-3)' }}>contratos: </span>
                  {contratos}
                </div>
              )}
            </>
          )
        })()}
      </div>
    </div>
  )
}

export const GraphCanvas = memo(GraphCanvasInner)
export default GraphCanvas
