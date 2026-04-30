/**
 * pages/Explorar.tsx
 *
 * Página del modo Explorar (chat-first neural graph).
 *
 * Iter6 análisis-datos: el grafo se alimenta desde Neo4j (`/api/grafo/nucleo`)
 * con todos los actores cordobeses — empresas, personas físicas, funcionarios,
 * reparticiones — y sus relaciones reales (DIRIGE, TRABAJA_EN, OPERA_EN,
 * CONFLICTO_CON, etc.). El fallback al grafo dashboard-only queda activo
 * cuando Neo4j no está disponible.
 *
 * PLAN-UI §4.1 (review iteración #1 visible):
 *   - Cap visual de 80 nodos (curados por relevancia)
 *   - Click en nodo PF/PJ → navega al Profile canónico
 *   - Banner inferior cuando hay nodos ocultos por cap
 */

import '@/styles/argos.css'
import { useMemo } from 'react'
import { useDashboard, useGrafoNucleo } from '@/lib/queries'
import { graphFromDashboard, graphFromNeo4j } from '@/lib/argos/graphFromData'
import { curarTopN } from '@/lib/argos/curador-grafo'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import type { ArgosGraph } from '@/lib/argos/types'

const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

export default function Explorar() {
  // Pedimos hasta 200 nodos al backend; el curador los recorta a ~80 visibles.
  // Pedir más al backend permite que el curador tenga "sobra" para descartar
  // los menos relevantes y mantener el núcleo conectado.
  const grafoQuery = useGrafoNucleo(200)
  const grafoNeo4j = grafoQuery.data
  const usarNeo4j = grafoNeo4j?.graphAvailable && grafoNeo4j.nodes.length > 0

  const dashboard = useDashboard()

  const { graph, nodosOcultados, totalOriginal } = useMemo(() => {
    let raw: ArgosGraph
    if (usarNeo4j && grafoNeo4j) {
      raw = graphFromNeo4j(grafoNeo4j)
    } else if (dashboard.data) {
      raw = graphFromDashboard(dashboard.data)
    } else {
      raw = EMPTY_GRAPH
    }
    // PLAN-UI §4.1: cap a 80 nodos por relevancia
    const curado = curarTopN(raw, { maxNodos: 80, mantenerSeveros: true })
    return {
      graph: curado.graph,
      nodosOcultados: curado.nodosOcultados,
      totalOriginal: curado.totalOriginal,
    }
  }, [usarNeo4j, grafoNeo4j, dashboard.data])

  const isLoading = usarNeo4j ? grafoQuery.isLoading : dashboard.isLoading

  return (
    <>
      <ExplorarLayout
        graph={graph}
        isLoading={isLoading}
      />
      {nodosOcultados > 0 && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            right: 12,
            zIndex: 50,
            padding: '8px 14px',
            background: '#171b24',
            border: '1px solid #2c3447',
            borderRadius: 6,
            color: '#aab4c9',
            fontSize: 11,
            fontFamily: 'ui-monospace, monospace',
            boxShadow: '0 2px 8px rgba(0,0,0,0.4)',
            pointerEvents: 'none',
          }}
        >
          ⓘ Mostrando {graph.nodes.length} de {totalOriginal} nodos · {nodosOcultados} ocultos por relevancia
        </div>
      )}
    </>
  )
}
