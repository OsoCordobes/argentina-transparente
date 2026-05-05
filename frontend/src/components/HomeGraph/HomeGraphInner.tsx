// frontend/src/components/HomeGraph/HomeGraphInner.tsx
//
// Vive DENTRO de SigmaContainer (necesario para que useSigma /
// useRegisterEvents funcionen). Responsabilidades:
//   1. Cargar el Graphology Graph en sigma vía useLoadGraph.
//   2. Arrancar el supervisor de ForceAtlas2 (layout natural permanente).
//   3. Registrar handlers: hover (dim del resto), click (selección).
//   4. Exponer selección hacia el padre via callback.
//
// Mantenemos el estado de hover/selected acá adentro porque la cadena de
// re-rendering de sigma necesita que el reducer se actualice cuando el
// estado cambia.

import { useEffect, useState } from 'react'
import {
  useLoadGraph,
  useRegisterEvents,
  useSetSettings,
  useSigma,
} from '@react-sigma/core'
import FA2LayoutSupervisor from 'graphology-layout-forceatlas2/worker'
import forceAtlas2 from 'graphology-layout-forceatlas2'
import type Graph from 'graphology'
import type { GraphNodeAttrs, GraphEdgeAttrs } from './buildGraph'

interface Props {
  graph: Graph<GraphNodeAttrs, GraphEdgeAttrs>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
}

export function HomeGraphInner({ graph, selectedId, onSelect, onHover }: Props) {
  const sigma = useSigma()
  const loadGraph = useLoadGraph()
  const registerEvents = useRegisterEvents()
  const setSettings = useSetSettings()

  const [hoveredId, setHoveredId] = useState<string | null>(null)

  // 1) Cargar el grafo en sigma. El effect corre solo cuando cambia la
  //    referencia del graph (en práctica, cuando el padre fetchea de nuevo).
  useEffect(() => {
    loadGraph(graph)
  }, [graph, loadGraph])

  // 2) Pre-asentar layout con FA2 sincrónico unas iteraciones para arrancar
  //    desde un estado decente, después dejar el supervisor corriendo en
  //    worker para que las relaciones "respiren".
  useEffect(() => {
    if (!graph || graph.order === 0) return
    // Pre-warm: 200 iteraciones síncronas. Es el "explosion" inicial.
    forceAtlas2.assign(graph, {
      iterations: 200,
      settings: {
        gravity: 0.6,
        scalingRatio: 18,
        slowDown: 4,
        barnesHutOptimize: true,
        adjustSizes: true,
        outboundAttractionDistribution: true,
        edgeWeightInfluence: 1,
      },
      getEdgeWeight: 'weight',
    })

    // Worker continuo — micro-movimiento que hace que el grafo se sienta vivo.
    const supervisor = new FA2LayoutSupervisor(graph, {
      settings: {
        gravity: 0.6,
        scalingRatio: 18,
        slowDown: 18,
        barnesHutOptimize: true,
        adjustSizes: true,
        edgeWeightInfluence: 1,
      },
      getEdgeWeight: 'weight',
    })
    supervisor.start()
    // Auto-pausa después de 6s para no quemar CPU si el usuario no interactúa.
    const stopTimer = setTimeout(() => supervisor.stop(), 6000)

    return () => {
      clearTimeout(stopTimer)
      supervisor.kill()
    }
  }, [graph])

  // 3) Registrar event handlers
  useEffect(() => {
    registerEvents({
      enterNode: e => { setHoveredId(e.node); onHover(e.node) },
      leaveNode: () => { setHoveredId(null); onHover(null) },
      clickNode: e => onSelect(e.node),
      clickStage: () => onSelect(null),
    })
  }, [registerEvents, onHover, onSelect])

  // 4) Reducers — la magia del hover dim + selected highlight.
  //    Sigma corre estos en cada frame; mantenelos baratos.
  useEffect(() => {
    setSettings({
      // Arista curvada por default (plugin edge-curve la aplica si type='curve')
      defaultEdgeType: 'curve',
      // Render labels cuando el nodo está hovered/selected o cuando es grande
      renderLabels: true,
      labelDensity: 0.07,
      labelGridCellSize: 60,
      labelRenderedSizeThreshold: 8,
      labelFont: '"Geist", "Inter", system-ui, sans-serif',
      labelColor: { color: '#E5E7EB' },
      labelSize: 12,
      labelWeight: '500',
      // Permite que el plugin de borde funcione
      defaultNodeType: 'circle',
      // Look general
      stagePadding: 60,
      minCameraRatio: 0.15,
      maxCameraRatio: 6,
      // Hover behavior es manejado por reducers — no por sigma defaults
      hoverRenderer: () => undefined as unknown as void,
      // Tono de fondo lo pone el contenedor (ver index.tsx)
      // ─── REDUCERS data-driven ─────────────────────────────────────
      nodeReducer: (node, attrs) => {
        const data = attrs as GraphNodeAttrs
        const next: Record<string, unknown> = { ...data }

        // Filtros / oculto: cae a opacity baja
        if (data.hidden) {
          next.color = withAlpha(data.color, 0.08)
          next.label = ''
          return next
        }

        // CUIT no verificado → un poco más translúcido
        if (!data.cuitVerificado) {
          next.color = withAlpha(data.color, 0.7)
        }

        // Hover / selected
        const isHovered = hoveredId === node
        const isSelected = selectedId === node
        const neighborOfHover = hoveredId
          ? graph.areNeighbors?.(node, hoveredId) ?? false
          : false
        const neighborOfSelected = selectedId
          ? graph.areNeighbors?.(node, selectedId) ?? false
          : false

        if (selectedId) {
          if (isSelected) {
            next.size = data.size * 1.35
            next.zIndex = 3
            next.borderColor = '#FFFFFF'
            next.borderSize = 3
            next.label = data.label
          } else if (neighborOfSelected) {
            next.zIndex = 2
            next.label = data.label
          } else {
            next.color = withAlpha(data.color, 0.18)
            next.label = ''
          }
        } else if (hoveredId) {
          if (isHovered || neighborOfHover) {
            next.zIndex = 2
            next.label = data.label
            if (isHovered) next.size = data.size * 1.18
          } else {
            next.color = withAlpha(data.color, 0.15)
            next.label = ''
          }
        }

        return next
      },
      edgeReducer: (edge, attrs) => {
        const data = attrs as GraphEdgeAttrs
        const next: Record<string, unknown> = { ...data }

        if (data.hidden) {
          next.color = withAlpha(data.color, 0.04)
          return next
        }

        const [s, t] = graph.extremities(edge)
        const focus = selectedId ?? hoveredId
        if (!focus) return next

        const adjacent = focus === s || focus === t
        if (adjacent) {
          next.color = data.color  // brilla
          next.size = (data.size ?? 1) * 1.6
          next.zIndex = 2
        } else {
          next.color = withAlpha(data.color, 0.08)
        }
        return next
      },
    })
  }, [setSettings, hoveredId, selectedId, graph])

  // Notificar a sigma que el reducer cambió — fuerza re-render.
  useEffect(() => {
    sigma.refresh()
  }, [hoveredId, selectedId, sigma])

  return null
}

// Convierte un color hex (#RRGGBB) en rgba(...) con el alfa pedido.
function withAlpha(hex: string, alpha: number): string {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
