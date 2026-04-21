import { create }           from 'zustand'
import { persist }          from 'zustand/middleware'
import type { Node, Edge }  from '@xyflow/react'

// ─── Types ────────────────────────────────────────────────────────────────────

export type EntityType = 'Empresa' | 'Persona' | 'Contrato' | 'Organismo'

export interface EntityNode {
  entityId:   string
  entityType: EntityType
  nombre:     string
  nota?:      string
  pinnedAt:   number  // timestamp
}

export interface Hallazgo {
  id:        string
  señal_id:  string
  tipologia: string
  categoria: string
  score:     number
  titulo:    string
  resumen:   string
  severidad: 'leve' | 'moderada' | 'grave'
  periodo:   string
  entidades_afectadas: { tipo: string; id: string; nombre: string }[]
  evidencia: { descripcion: string; fuente_url: string }[]
  legal: {
    articulos:      string[]
    severidad:      string
    denunciar_ante: string[]
  }
}

// ─── Store ────────────────────────────────────────────────────────────────────

interface BoardState {
  // Graph canvas
  nodes:  Node[]
  edges:  Edge[]
  setNodes: (nodes: Node[]) => void
  setEdges: (edges: Edge[]) => void

  // Pinned entities
  pinnedEntities: Record<string, EntityNode>
  pinEntity:      (entity: EntityNode) => void
  unpinEntity:    (entityId: string)   => void

  // Selected node
  selectedNodeId: string | null
  selectNode:     (id: string | null) => void

  // Hallazgos cache
  hallazgos:      Hallazgo[]
  setHallazgos:   (h: Hallazgo[]) => void

  // Note on a node
  setNota: (entityId: string, nota: string) => void

  // Analysis params
  municipioId:  string
  periodDesde:  number
  periodHasta:  number
  setAnalysisParams: (municipio: string, desde: number, hasta: number) => void
}

export const useBoardStore = create<BoardState>()(
  persist(
    (set) => ({
      nodes: [],
      edges: [],
      setNodes: (nodes) => set({ nodes }),
      setEdges: (edges) => set({ edges }),

      pinnedEntities: {},
      pinEntity: (entity) => set((s) => ({
        pinnedEntities: { ...s.pinnedEntities, [entity.entityId]: entity },
      })),
      unpinEntity: (entityId) => set((s) => {
        const { [entityId]: _removed, ...rest } = s.pinnedEntities
        return { pinnedEntities: rest }
      }),

      selectedNodeId: null,
      selectNode: (id) => set({ selectedNodeId: id }),

      hallazgos: [],
      setHallazgos: (hallazgos) => set({ hallazgos }),

      setNota: (entityId, nota) => set((s) => ({
        pinnedEntities: {
          ...s.pinnedEntities,
          ...(s.pinnedEntities[entityId]
            ? { [entityId]: { ...s.pinnedEntities[entityId], nota } }
            : {}),
        },
      })),

      municipioId:  'cordoba-capital',
      periodDesde:  2019,
      periodHasta:  2023,
      setAnalysisParams: (municipioId, periodDesde, periodHasta) =>
        set({ municipioId, periodDesde, periodHasta }),
    }),
    {
      name: 'argos-board-v1',
      partialize: (s) => ({
        pinnedEntities: s.pinnedEntities,
        nodes:          s.nodes,
        edges:          s.edges,
        municipioId:    s.municipioId,
        periodDesde:    s.periodDesde,
        periodHasta:    s.periodHasta,
      }),
    },
  ),
)
