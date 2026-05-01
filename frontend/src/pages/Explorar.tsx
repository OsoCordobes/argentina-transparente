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
import { useDashboard, useGrafoNucleo, useGrafoJerarquia } from '@/lib/queries'
import {
  graphFromDashboard,
  graphFromNeo4j,
  graphFromJerarquia,
} from '@/lib/argos/graphFromData'
import { curarTopN } from '@/lib/argos/curador-grafo'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import type { ArgosGraph } from '@/lib/argos/types'

const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

export default function Explorar() {
  // Fuente preferida: jerarquía DuckDB (Estado → Reparticion → Empresa).
  // No depende de Neo4j y muestra estructura inmediatamente reconocible.
  const grafoJerQuery = useGrafoJerarquia({
    jurisdiccion: 'all',
    maxReparticiones: 12,
    maxEmpresasPorReparticion: 4,
  })
  const grafoJer = grafoJerQuery.data
  const usarJerarquia = !!grafoJer && grafoJer.nodes.length > 0

  // Fallback 1: Neo4j si está disponible (relaciones más ricas vía conflictos
  // y directores).
  const grafoQuery = useGrafoNucleo(200)
  const grafoNeo4j = grafoQuery.data
  const usarNeo4j =
    !usarJerarquia && grafoNeo4j?.graphAvailable && grafoNeo4j.nodes.length > 0

  // Fallback 2: graphFromDashboard (sin estructura, último recurso).
  const dashboard = useDashboard()

  const { graph, nodosOcultados, totalOriginal } = useMemo(() => {
    let raw: ArgosGraph
    if (usarJerarquia && grafoJer) {
      raw = graphFromJerarquia(grafoJer)
    } else if (usarNeo4j && grafoNeo4j) {
      raw = graphFromNeo4j(grafoNeo4j)
    } else if (dashboard.data) {
      raw = graphFromDashboard(dashboard.data)
    } else {
      raw = EMPTY_GRAPH
    }
    // En jerarquía nunca queremos perder los nodos depth 0/1 (estado y
    // reparticiones). Subimos el cap y dejamos que la simulación física
    // organice. En Neo4j/dashboard mantenemos 80.
    const cap = usarJerarquia ? 120 : 80
    const curado = curarTopN(raw, { maxNodos: cap, mantenerSeveros: true })
    return {
      graph: curado.graph,
      nodosOcultados: curado.nodosOcultados,
      totalOriginal: curado.totalOriginal,
    }
  }, [usarJerarquia, grafoJer, usarNeo4j, grafoNeo4j, dashboard.data])

  const isLoading = usarJerarquia
    ? grafoJerQuery.isLoading
    : usarNeo4j
    ? grafoQuery.isLoading
    : dashboard.isLoading

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
            // var(--z-overlay): pill flotante sobre el contenido.
            zIndex: 100,
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
