import { useMemo } from 'react'
import { useGrafoJerarquiaV2 } from '@/lib/queries'
import { GraphEngine } from '@/components/graph/GraphEngine'
import { GraphSidebar } from '@/components/graph/overlay/GraphSidebar'
import { useSelection } from '@/components/graph/interactions/use-selection'
import { LoadingState, ErrorState, EmptyState } from '@/components/argos/primitives'
import type { GraphSnapshot, GraphNode, EdgeKind } from '@/components/graph/types'

/**
 * Mapea el `type` que viene del backend (jurisdiccion / reparticion / empresa /
 * proveedor / persona / funcionario / director / contrato / documento) al
 * `EntityType` canónico del engine (estado / persona / empresa / documento).
 */
function mapBackendType(type: string): GraphNode['type'] {
  if (type === 'jurisdiccion' || type === 'reparticion') return 'estado'
  if (type === 'empresa' || type === 'proveedor') return 'empresa'
  if (type === 'persona' || type === 'funcionario' || type === 'director') return 'persona'
  if (type === 'contrato' || type === 'documento') return 'documento'
  return 'estado'
}

/**
 * Mapea el `kind` de la arista del backend al `EdgeKind` canónico del engine.
 * Backend usa 'gano' (legacy) → engine usa 'contrata' (semántica clara).
 */
function mapBackendEdgeKind(kind: string): EdgeKind {
  switch (kind) {
    case 'gano': return 'contrata'
    case 'contrata': return 'contrata'
    case 'pertenece_a': return 'pertenece_a'
    case 'dirige': return 'dirige'
    case 'tiene_director': return 'dirige'
    case 'conflicto_con': return 'conflicto_con'
    case 'emite': return 'emite'
    default: return 'pertenece_a'
  }
}

export function HomeAdapter() {
  const query = useGrafoJerarquiaV2('cordoba-capital')
  const { selectedId, select, clear } = useSelection()

  const snapshot: GraphSnapshot = useMemo(() => {
    const r = query.data
    if (!r) return { nodes: [], edges: [] }
    const allNodes = [
      ...r.depth0.nodes,
      ...r.depth1.nodes,
      ...r.depth2.nodes,
      ...r.depth3.nodes,
    ]
    const allEdges = [
      ...r.depth0.edges,
      ...r.depth1.edges,
      ...r.depth2.edges,
      ...r.depth3.edges,
    ]
    return {
      nodes: allNodes.map(n => ({
        id: n.id,
        type: mapBackendType(n.type),
        label: n.label,
        subtitle: n.subtitle,
        weight: n.weight,
        depth: (n.data as { depth?: number })?.depth ?? 0,
        data: n.data,
      })),
      edges: allEdges.map(e => ({
        source: e.source,
        target: e.target,
        kind: mapBackendEdgeKind(e.kind),
        weight: e.weight,
      })),
    }
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

  if (!query.data || snapshot.nodes.length === 0) {
    return (
      <EmptyState
        eyebrow="MAPA · 0 NODOS"
        title="La base de Córdoba está vacía"
        body="Corré los seeds del backend (npm run seed:cordoba) para popular contratos."
      />
    )
  }

  const selectedNode = selectedId ? snapshot.nodes.find(n => n.id === selectedId) ?? null : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600 }}>
      <GraphEngine
        snapshot={snapshot}
        layout="radial-cluster"
        selectedId={selectedId}
        onSelect={(id) => select(id)}
      />
      <GraphSidebar
        open={!!selectedId}
        node={selectedNode}
        onClose={clear}
      >
        {selectedNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(selectedNode.data as { monto?: number })?.monto != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>MONTO TOTAL</div>
                <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-semibold)' }}>
                  ${((selectedNode.data as { monto: number }).monto / 1e9).toFixed(2)} mil M
                </div>
              </div>
            )}
            {(selectedNode.data as { contratos?: number })?.contratos != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CONTRATOS</div>
                <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-semibold)' }}>
                  {(selectedNode.data as { contratos: number }).contratos}
                </div>
              </div>
            )}
          </div>
        )}
      </GraphSidebar>
    </div>
  )
}
