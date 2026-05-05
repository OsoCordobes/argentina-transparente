// frontend/src/components/HomeGraph/index.tsx
//
// Punto de entrada del grafo del home. Substituye al GraphEngine custom
// de PR-1 (radial-cluster fijo) por Sigma.js + Graphology + ForceAtlas2.
//
// Responsabilidades de este componente:
//   1. Fetch del snapshot vía useGrafoJerarquiaV2 (DuckDB).
//   2. Convertir API → Graphology (buildGraph).
//   3. Montar SigmaContainer con settings premium (WebGL, glass-bg, padding).
//   4. Componer overlays: leyenda, zoom controls, panel detalle, search.
//
// Bajo Sigma corre HomeGraphInner que maneja layout y eventos.

import { useMemo, useState } from 'react'
import { SigmaContainer } from '@react-sigma/core'
import EdgeCurveProgram from '@sigma/edge-curve'
import { NodeBorderProgram } from '@sigma/node-border'
import '@react-sigma/core/lib/style.css'

import { useMapaProvincial } from '@/lib/queries'
import { LoadingState, ErrorState, EmptyState } from '@/components/argos/primitives'
import { buildGraph, ENTITY_COLORS, type GraphNodeAttrs, type GraphEdgeAttrs } from './buildGraph'
import { HomeGraphInner } from './HomeGraphInner'
import { GraphLegend } from './GraphLegend'
import { GraphZoomControls } from './GraphZoomControls'
import { NodeDetailPanel } from './NodeDetailPanel'
import { GraphSearch } from './GraphSearch'
import { GraphFilters } from './GraphFilters'

const SIGMA_SETTINGS = {
  // Programs custom: borde para señales graves + curva para multi-edge.
  defaultNodeType: 'border',
  nodeProgramClasses: {
    border: NodeBorderProgram,
  },
  defaultEdgeType: 'curve',
  edgeProgramClasses: {
    curve: EdgeCurveProgram,
  },
  // Visual baseline
  renderEdgeLabels: false,
  allowInvalidContainer: true,
  // Sigma color por defecto si un atributo falla — mejor visible que invisible
  defaultNodeColor: '#475569',
  defaultEdgeColor: '#334155',
}

export function HomeGraph() {
  const query = useMapaProvincial({ detail: 'meso', jurisdiccion: 'ambas' })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)

  const graph = useMemo(() => {
    if (!query.data) return null
    return buildGraph(query.data)
  }, [query.data])

  if (query.isLoading) {
    return <LoadingState mode="overlay" label="Construyendo mapa de Córdoba…" />
  }
  if (query.error) {
    return (
      <ErrorState
        title="No se pudo cargar el mapa"
        detail={(query.error as Error).message}
        onRetry={() => query.refetch()}
      />
    )
  }
  if (!graph || graph.order === 0) {
    return (
      <EmptyState
        eyebrow="MAPA · 0 NODOS"
        title="La base de Córdoba está vacía"
        body="Corré los seeds del backend (npm run seed:cordoba) para popular contratos."
      />
    )
  }

  const selectedNode: GraphNodeAttrs | null = selectedId && graph.hasNode(selectedId)
    ? (graph.getNodeAttributes(selectedId) as GraphNodeAttrs)
    : null

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        minHeight: 600,
        background: 'radial-gradient(ellipse at center, #0F1626 0%, #050810 70%, #02040A 100%)',
        overflow: 'hidden',
      }}
    >
      <SigmaContainer<GraphNodeAttrs, GraphEdgeAttrs>
        style={{
          width: '100%',
          height: '100%',
          background: 'transparent',
        }}
        settings={SIGMA_SETTINGS}
      >
        <HomeGraphInner
          graph={graph}
          selectedId={selectedId}
          onSelect={setSelectedId}
          onHover={setHoveredId}
        />
        {/* Estos componentes usan hooks de sigma (useCamera, useSigma) —
            DEBEN vivir dentro del SigmaContainer */}
        <GraphFilters />
        <GraphSearch onSelect={setSelectedId} />
        <GraphZoomControls />
      </SigmaContainer>

      {/* Overlays externos al canvas (no requieren sigma context) */}
      <GraphLegend
        meta={{
          totalNodos: query.data?.meta.totalNodos ?? 0,
          totalAristas: query.data?.meta.totalAristas ?? 0,
          montoTotal: query.data?.meta.montoTotal ?? 0,
          empleadosTotal: query.data?.meta.empleadosTotal ?? 0,
          porTipo: query.data?.meta.porTipo ?? {},
        }}
      />

      {/* Panel detalle del nodo seleccionado */}
      <NodeDetailPanel
        node={selectedNode}
        onClose={() => setSelectedId(null)}
      />

      {/* Hint cuando no hay selección y no hay hover — muy sutil */}
      {!selectedId && !hoveredId && (
        <div
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            transform: 'translate(-50%, -50%)',
            color: 'rgba(229, 231, 235, 0.32)',
            fontFamily: 'var(--font-mono, monospace)',
            fontSize: 11,
            letterSpacing: '0.18em',
            textTransform: 'uppercase',
            pointerEvents: 'none',
            zIndex: 1,
            textShadow: '0 0 12px rgba(0,0,0,0.6)',
          }}
        >
          Hover · Click · Scroll
        </div>
      )}
    </div>
  )
}

// Re-export para tests
export { ENTITY_COLORS }
