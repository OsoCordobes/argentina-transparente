// grafo-jerarquia-v2.ts — Response depth-structured para semantic-zoom.
//
// Reusa getJerarquiaCordoba() y agrupa nodos+aristas por nivel (depth0/1/2/3).
// El frontend semantic-zoom puede pedir niveles on-demand sin re-correr SQL.
//
// Convención de aristas por nivel:
//   - edges en depth N son las que conectan al menos un nodo en depth N
//     con cualquier nodo en depths 0..N (jerárquicas hacia arriba o entre pares).

import { getJerarquiaCordoba, type JerarquiaNode, type JerarquiaEdge } from './grafo-jerarquia'

export interface DepthLevel {
  nodes: JerarquiaNode[]
  edges: JerarquiaEdge[]
}

export interface JerarquiaV2Response {
  depth0: DepthLevel
  depth1: DepthLevel
  depth2: DepthLevel
  depth3: DepthLevel
  meta: {
    jurisdiccion: string
    totalNodos: number
    totalAristas: number
    montoTotal: number
  }
}

export async function getJerarquiaV2(opts: {
  jurisdiccion?: 'cordoba-capital' | 'cordoba-provincia' | 'all'
  maxReparticiones?: number
  maxEmpresasPorReparticion?: number
}): Promise<JerarquiaV2Response> {
  const flat = await getJerarquiaCordoba({
    jurisdiccion: opts.jurisdiccion ?? 'cordoba-capital',
    maxReparticiones: opts.maxReparticiones ?? 12,
    maxEmpresasPorReparticion: opts.maxEmpresasPorReparticion ?? 4,
  })

  const byDepth = new Map<number, JerarquiaNode[]>()
  for (const n of flat.nodes) {
    const d = (n.data.depth as number) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  }

  function idsAtOrBelow(d: number): Set<string> {
    const ids = new Set<string>()
    for (let i = 0; i <= d; i++) {
      for (const n of byDepth.get(i) ?? []) ids.add(n.id)
    }
    return ids
  }

  function edgesForLevel(d: number): JerarquiaEdge[] {
    const idsAt = new Set((byDepth.get(d) ?? []).map(n => n.id))
    const idsBelow = idsAtOrBelow(d)
    return flat.edges.filter(e =>
      (idsAt.has(e.source) && idsBelow.has(e.target)) ||
      (idsAt.has(e.target) && idsBelow.has(e.source))
    )
  }

  return {
    depth0: { nodes: byDepth.get(0) ?? [], edges: edgesForLevel(0) },
    depth1: { nodes: byDepth.get(1) ?? [], edges: edgesForLevel(1) },
    depth2: { nodes: byDepth.get(2) ?? [], edges: edgesForLevel(2) },
    depth3: { nodes: byDepth.get(3) ?? [], edges: edgesForLevel(3) },
    meta: {
      jurisdiccion: opts.jurisdiccion ?? 'cordoba-capital',
      totalNodos: flat.nodes.length,
      totalAristas: flat.edges.length,
      montoTotal: flat.meta.montoTotal,
    },
  }
}
