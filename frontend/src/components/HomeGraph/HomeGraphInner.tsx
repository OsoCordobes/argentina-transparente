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
import noverlap from 'graphology-layout-noverlap'
import type Graph from 'graphology'
import type { MapaDetail } from '@/lib/queries'
import type { GraphNodeAttrs, GraphEdgeAttrs } from './buildGraph'

interface Props {
  graph: Graph<GraphNodeAttrs, GraphEdgeAttrs>
  selectedId: string | null
  onSelect: (id: string | null) => void
  onHover: (id: string | null) => void
  detail: MapaDetail
}

export function HomeGraphInner({ graph, selectedId, onSelect, onHover, detail }: Props) {
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

  // 2) Layout: pre-posicionamiento por cluster ya viene de buildGraph.
  //    FA2 sólo refina LOCALMENTE (slowDown alto, scalingRatio bajo).
  //    noverlap pasa al final para limpiar overlaps sin destruir clusters.
  useEffect(() => {
    if (!graph || graph.order === 0) return

    // 2.a — FA2 light: 80 iteraciones para ajustar posiciones manteniendo
    //       la estructura cluster. NO usamos linLogMode (causa colapso
    //       cuando los clusters están bien separados).
    forceAtlas2.assign(graph, {
      iterations: 80,
      settings: {
        gravity: 0.05,           // muy baja — los clusters ya están en posición
        scalingRatio: 4,         // bajo — apenas separa
        slowDown: 50,            // alto — movimiento mínimo
        barnesHutOptimize: true,
        adjustSizes: true,
        edgeWeightInfluence: 0.5,
        linLogMode: false,
      },
      getEdgeWeight: 'weight',
    })

    // 2.b — noverlap: limpia overlaps sin re-arrange global. Esencial para
    //       que los nodos del mismo cluster no se superpongan.
    noverlap.assign(graph, {
      maxIterations: 100,
      settings: {
        margin: 1.5,
        ratio: 1.0,
        speed: 3,
      },
    })

    // 2.c — Sigma refresh para reflejar las nuevas posiciones
    sigma.refresh()

    // 2.d — Worker continuo MUY suave para "respiración" sutil sin
    //       reordenar. Auto-pausa rápido (3s) para que la lectura sea
    //       estable después.
    const supervisor = new FA2LayoutSupervisor(graph, {
      settings: {
        gravity: 0.05,
        scalingRatio: 4,
        slowDown: 80,
        barnesHutOptimize: true,
        adjustSizes: true,
        edgeWeightInfluence: 0.5,
        linLogMode: false,
      },
      getEdgeWeight: 'weight',
    })
    supervisor.start()
    const stopTimer = setTimeout(() => supervisor.stop(), 3000)

    return () => {
      clearTimeout(stopTimer)
      supervisor.kill()
    }
  }, [graph, sigma])

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
      // Densidad baja para no saturar al pasar de 200 nodos. Sigma elige
      // labels priorizando por size — los nodos grandes (ministerios con
      // mucho monto/empleados) ganan visibilidad.
      labelDensity: 0.04,
      labelGridCellSize: 90,
      labelRenderedSizeThreshold: 11,
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
          next.color = withAlpha(data.color, 0.06)
          next.label = ''
          return next
        }

        // ─── Detail-level visibility ──────────────────────────────────
        // En MACRO: depth 0+1 plenos; depth 2 al 30%; depth 3 oculto
        // En MESO: depth 0+1+2 plenos; depth 3 al 25%
        // En DEEP: todo pleno
        if (detail === 'macro' && data.depth >= 2) {
          next.color = withAlpha(data.color, data.depth === 2 ? 0.30 : 0)
          next.label = ''
          if (data.depth === 3) return next
        } else if (detail === 'meso' && data.depth === 3) {
          next.color = withAlpha(data.color, 0.25)
          next.label = ''
        }

        // CUIT no verificado → un poco más translúcido
        if (!data.cuitVerificado) {
          next.color = withAlpha((next.color as string) ?? data.color, 0.7)
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
  }, [setSettings, hoveredId, selectedId, graph, detail])

  // Notificar a sigma que el reducer cambió — fuerza re-render.
  useEffect(() => {
    sigma.refresh()
  }, [hoveredId, selectedId, detail, sigma])

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
