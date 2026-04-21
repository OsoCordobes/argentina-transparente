import { useCallback, useState } from 'react'
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  addEdge,
  type Connection,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'

import EntityNode    from '@/components/board/EntityNode'
import NodeInspector from '@/components/board/NodeInspector'
import TimelineView  from '@/components/board/TimelineView'
import CaseLayout, { type CaseView } from '@/components/layout/CaseLayout'
import PistasSidebar from '@/components/layout/PistasSidebar'
import AISidebar     from '@/components/layout/AISidebar'
import FeedbackFab   from '@/components/layout/FeedbackFab'
import { useBoardStore } from '@/store/useBoardStore'

const nodeTypes = { entity: EntityNode }

export default function BoardPage() {
  const {
    nodes: storedNodes,
    edges: storedEdges,
    setNodes: storeSetNodes,
    setEdges: storeSetEdges,
    selectedNodeId,
  } = useBoardStore()

  const [nodes, , onNodesChange] = useNodesState(storedNodes)
  const [edges, setEdges, onEdgesChange] = useEdgesState(storedEdges)
  const [activeView, setActiveView] = useState<CaseView>('grafo')

  const handleNodesChange: typeof onNodesChange = useCallback(
    (changes) => {
      onNodesChange(changes)
      setTimeout(() => { storeSetNodes(nodes) }, 50)
    },
    [onNodesChange, nodes, storeSetNodes],
  )

  const handleEdgesChange: typeof onEdgesChange = useCallback(
    (changes) => {
      onEdgesChange(changes)
      setTimeout(() => storeSetEdges(edges), 50)
    },
    [onEdgesChange, edges, storeSetEdges],
  )

  const onConnect = useCallback(
    (connection: Connection) => {
      setEdges((eds) => {
        const newEdges = addEdge({ ...connection, animated: true }, eds)
        storeSetEdges(newEdges)
        return newEdges
      })
    },
    [setEdges, storeSetEdges],
  )

  const showInspector = Boolean(selectedNodeId) && activeView === 'grafo'

  const main = (
    <>
      {activeView === 'grafo' && (
        <>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={handleNodesChange}
            onEdgesChange={handleEdgesChange}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            proOptions={{ hideAttribution: true }}
          >
            <Background gap={16} />
            <Controls />
            <MiniMap
              nodeColor={(n) => {
                const type = (n.data as { entityType?: string }).entityType
                if (type === 'Empresa') return '#93c5fd'
                if (type === 'Persona') return '#6ee7b7'
                return '#fcd34d'
              }}
            />
          </ReactFlow>

          {nodes.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="text-center text-[color:var(--fg-muted)]">
                <p className="display-md mb-2">Empieza anclando entidades</p>
                <p className="text-sm">
                  Buscá una empresa o persona en la sidebar izquierda y pineala al caso.
                </p>
              </div>
            </div>
          )}

          {showInspector && (
            <aside className="absolute top-3 right-3 w-80 max-h-[calc(100%-24px)] rounded-md bg-[color:var(--surface)] border border-[color:var(--gray-200)] shadow-[var(--shadow-md)] overflow-auto">
              <NodeInspector />
            </aside>
          )}
        </>
      )}

      {activeView === 'timeline' && <TimelineView />}

      {activeView === 'mapa' && <ViewStub title="Mapa" hint="Georreferenciación de obras y concentración de gasto por municipio." />}
      {activeView === 'tabla' && <ViewStub title="Tabla" hint="Spreadsheet de contratos con filtros y export CSV / JSON / GraphML." />}
      {activeView === 'dossier' && <ViewStub title="Dossier" hint="Expediente generado por IA en 3 modos (forense · periodístico · denuncia)." />}
    </>
  )

  return (
    <>
      <CaseLayout
        caseTitle="Nueva investigación"
        caseSubtitle="Córdoba Capital · 2019-2023"
        activeView={activeView}
        onChangeView={setActiveView}
        pistas={<PistasSidebar />}
        main={main}
        aiSidebar={<AISidebar />}
      />
      <FeedbackFab routeLabel={`/board/${activeView}`} />
    </>
  )
}

function ViewStub({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex-1 flex items-center justify-center">
      <div className="text-center max-w-sm">
        <div className="display-md mb-2 text-[color:var(--fg)]">{title}</div>
        <p className="text-[13px] text-[color:var(--fg-muted)] leading-relaxed">{hint}</p>
        <div className="mt-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[color:var(--bg-subtle)] border border-[color:var(--gray-200)] text-[10px] text-[color:var(--fg-subtle)] uppercase tracking-wider">
          Fase A · próximamente
        </div>
      </div>
    </div>
  )
}
