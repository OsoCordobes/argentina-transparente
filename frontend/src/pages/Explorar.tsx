/**
 * pages/Explorar.tsx
 *
 * Página del modo Explorar (chat-first neural graph).
 * Carga datos del dashboard via React Query y construye el grafo inicial.
 * El CSS argos.css está scoped — no afecta al resto de la app.
 */

import '@/styles/argos.css'
import { useMemo } from 'react'
import { useDashboard } from '@/lib/queries'
import { graphFromDashboard } from '@/lib/argos/graphFromData'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import type { ArgosGraph } from '@/lib/argos/types'

const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

export default function Explorar() {
  const { data, isLoading } = useDashboard()

  const graph = useMemo(() => {
    if (!data) return EMPTY_GRAPH
    return graphFromDashboard(data)
  }, [data])

  return (
    <ExplorarLayout
      graph={graph}
      isLoading={isLoading}
    />
  )
}
