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
 */

import '@/styles/argos.css'
import { useMemo } from 'react'
import { useDashboard, useGrafoNucleo } from '@/lib/queries'
import { graphFromDashboard, graphFromNeo4j } from '@/lib/argos/graphFromData'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import type { ArgosGraph } from '@/lib/argos/types'

const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

export default function Explorar() {
  // Primary: grafo Neo4j (mapa-neural cordobés). Pedimos hasta 250 nodos
  // del núcleo caliente — empresas con OPERA_EN, personas que dirigen ≥3
  // empresas, conflictos detectados.
  const grafoQuery = useGrafoNucleo(350)
  const grafoNeo4j = grafoQuery.data
  const usarNeo4j = grafoNeo4j?.graphAvailable && grafoNeo4j.nodes.length > 0

  // Fallback: si Neo4j no está disponible, armamos el grafo desde dashboard
  // (proveedores + jurisdicciones + señales activas).
  const dashboard = useDashboard()

  const graph = useMemo<ArgosGraph>(() => {
    if (usarNeo4j && grafoNeo4j) {
      return graphFromNeo4j(grafoNeo4j)
    }
    if (dashboard.data) {
      return graphFromDashboard(dashboard.data)
    }
    return EMPTY_GRAPH
  }, [usarNeo4j, grafoNeo4j, dashboard.data])

  const isLoading = usarNeo4j ? grafoQuery.isLoading : dashboard.isLoading

  return (
    <ExplorarLayout
      graph={graph}
      isLoading={isLoading}
    />
  )
}
