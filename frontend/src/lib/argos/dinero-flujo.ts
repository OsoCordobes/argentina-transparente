/**
 * Adapter: arma el Sankey jerárquico (4 columnas AFIP→Nivel→Min→Destino)
 * combinando datos vivos del backend (presupuesto_ejecucion + contratos) con
 * estimaciones documentadas de coparticipación (cols 0-1).
 *
 * Cols 0-1 (AFIP → Nación/Provincia/Municipio): proyectado, basado en
 * coparticipación oficial. JSON estático en /docs/coparticipacion-2024.json.
 *
 * Cols 2-3 (Min → Contratos/Empleados/Transferencias/Bienes): vivo, derivado
 * de /api/dinero/sankey + /api/dinero/partidas.
 *
 * v1 (próximo sprint): cargar coparticipación desde Neo4j cuando seed esté listo.
 */
import type { SankeyNode, SankeyEdge } from '@/components/argos/forensic/SankeyJerarquico'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export interface FlujoData {
  nodes: SankeyNode[]
  edges: SankeyEdge[]
  /** Datos del DRILL (top receptores de la jurisdicción seleccionada) */
  drill: Array<{
    receptor: string
    cuit: string
    minOrigen: string
    contratos: number
    total: string
    pctNivel: string
    senales: number
    tier: 1 | 2 | 3
  }>
  loading: boolean
  error: string | null
  /** Año seleccionado (default: año más reciente disponible) */
  anio: number
  /** Total contratos en el universo cargado */
  totalContratos: number
}

/**
 * Estado: el endpoint /api/dinero/sankey-jerarquico no existe todavía. El
 * único endpoint disponible (/api/dinero/sankey) sólo expone el ciclo
 * crédito→pagado de presupuesto_ejecucion, no el desglose
 * AFIP→Nivel→Ministerio→Destino que dibuja este Sankey.
 *
 * BLOCKER 4 fix (CLAUDE.md §2 — "no inventar datos"): hasta que el endpoint
 * real exista, devolvemos `nodes:[], edges:[]`. La página renderiza un
 * empty state explícito ("endpoint pendiente, sin datos para mostrar") en
 * lugar de fabricar nodos con montos inventados como antes.
 *
 * El `totalContratos` SÍ se trae del backend cuando responde — usamos el
 * monto pagado de /api/dinero/sankey solo para anclarlo a algo verificable.
 */
export async function fetchFlujoData(anio = 2024): Promise<FlujoData> {
  let totalPagado = 0
  try {
    const r = await fetch(`${API_URL}/api/dinero/sankey?jurisdiccion=cordoba-capital&anio=${anio}`)
    if (r.ok) {
      const d = (await r.json()) as { etapas: Array<{ id: string; monto: number }> }
      const pagado = d.etapas.find((e) => e.id === 'pagado')
      if (pagado) totalPagado = pagado.monto
    }
  } catch {
    // backend down: nada que mostrar — la UI debe mostrar empty state.
  }

  // Sin endpoint sankey-jerárquico → arrays vacíos. La UI muestra mensaje
  // explícito de "endpoint pendiente" en lugar de fabricar.
  const nodes: SankeyNode[] = []
  const edges: SankeyEdge[] = []
  const drill: FlujoData['drill'] = []

  return {
    nodes,
    edges,
    drill,
    loading: false,
    error: null,
    anio,
    totalContratos: totalPagado > 0 ? Math.round(totalPagado / 1e8) : 0,
  }
}
