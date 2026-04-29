/**
 * curador-grafo.ts — Cap visual del grafo del Landing/Explorar.
 * PLAN-UI §4.1 — el grafo NO es "todo Córdoba", es ~80 nodos curados.
 *
 * Estrategia:
 *   1. Si el grafo trae ≤ N nodos, devolver tal cual.
 *   2. Si trae más, ordenar por relevancia (severidad de señal > peso > tipo)
 *      y quedarse con los top N.
 *   3. Filtrar edges para mantener solo las que conectan nodos sobrevivientes.
 *   4. Eliminar nodos huérfanos (sin edges) salvo los de severidad alta —
 *      una persona física aislada con señal grave igual debe verse.
 *
 * Mantiene un "núcleo conectado" — el grafo resultante es legible visualmente
 * (no spaghetti de 200+ círculos sobrelapados).
 */
import type { ArgosGraph, ArgosNode, ArgosEdge } from './types'

const PRIORIDAD_TIPO: Record<string, number> = {
  // Señales y conflictos primero (lo que el usuario quiere ver)
  'señal': 100,
  // Personas con cargo en cruce — alto valor investigativo
  persona: 80,
  funcionario: 80,
  // Empresas con contratos materiales
  empresa: 70,
  proveedor: 70,
  // Estructura institucional
  reparticion: 50,
  jurisdiccion: 40,
  // Contratos individuales — bajos por defecto, salvo que tengan señal asociada
  contrato: 30,
  director: 60,
}

function severidadScore(n: ArgosNode): number {
  const sev = n.flags?.severidad
  if (sev === 'grave') return 50
  if (sev === 'moderada') return 25
  if (sev === 'leve') return 10
  return 0
}

function relevanciaTotal(n: ArgosNode): number {
  const baseTipo = PRIORIDAD_TIPO[n.type] ?? 20
  const baseWeight = (n.weight ?? 0.4) * 30
  const baseSeveridad = severidadScore(n)
  return baseTipo + baseWeight + baseSeveridad
}

export interface CuracionOpts {
  /** Cap superior de nodos visibles. PLAN-UI §4.1 default 80. */
  maxNodos?: number
  /** Si true, mantiene nodos con severidad alta aunque queden huérfanos. */
  mantenerSeveros?: boolean
}

export interface CuracionResultado {
  graph: ArgosGraph
  capExcedido: boolean
  nodosOcultados: number
  totalOriginal: number
}

/**
 * Cap por relevancia. Devuelve el grafo curado + metadata de cuántos nodos
 * se ocultaron (la UI puede mostrar "X nodos ocultos por orden de relevancia").
 */
export function curarTopN(graph: ArgosGraph, opts: CuracionOpts = {}): CuracionResultado {
  const maxNodos = opts.maxNodos ?? 80
  const mantenerSeveros = opts.mantenerSeveros ?? true
  const totalOriginal = graph.nodes.length

  if (graph.nodes.length <= maxNodos) {
    return { graph, capExcedido: false, nodosOcultados: 0, totalOriginal }
  }

  // 1. Ranking por relevancia
  const ranked = [...graph.nodes].sort((a, b) => relevanciaTotal(b) - relevanciaTotal(a))
  const top = ranked.slice(0, maxNodos)
  const topIds = new Set(top.map(n => n.id))

  // 2. Filtrar edges: solo entre nodos sobrevivientes
  const edgesFiltradas: ArgosEdge[] = graph.edges.filter(e => {
    const sid = typeof e.source === 'string' ? e.source : e.source.id
    const tid = typeof e.target === 'string' ? e.target : e.target.id
    return topIds.has(sid) && topIds.has(tid)
  })

  // 3. Ids con al menos una arista (no-huérfanos)
  const conectados = new Set<string>()
  for (const e of edgesFiltradas) {
    const sid = typeof e.source === 'string' ? e.source : e.source.id
    const tid = typeof e.target === 'string' ? e.target : e.target.id
    conectados.add(sid)
    conectados.add(tid)
  }

  // 4. Decidir nodos finales: conectados + (severos huérfanos si mantenerSeveros)
  const nodosFinal = top.filter(n => {
    if (conectados.has(n.id)) return true
    if (mantenerSeveros && n.flags?.severidad === 'grave') return true
    return false
  })

  return {
    graph: { nodes: nodosFinal, edges: edgesFiltradas },
    capExcedido: true,
    nodosOcultados: totalOriginal - nodosFinal.length,
    totalOriginal,
  }
}

/**
 * Decide URL de Profile al hacer click en un nodo del grafo.
 * Devuelve null si el tipo no tiene Profile canónico (ej. contrato, señal,
 * jurisdicción — para esos hay otras rutas o panel inline).
 */
export function profileUrlParaNodo(node: ArgosNode): string | null {
  // Mapa-neural: persona física con DNI canónico
  if (node.type === 'persona') {
    const dni = (node.data?.dni as string | undefined) ?? node.id.replace(/^persona:/, '')
    return dni && /^\d+$/.test(dni) ? `/persona/${dni}` : null
  }
  // Mapa-neural: empresa con CUIT
  if (node.type === 'empresa' || node.type === 'proveedor') {
    const cuit = (node.data?.cuit as string | undefined) ?? null
    if (cuit && /^\d{2}-\d{8}-\d$/.test(cuit)) return `/empresa/${cuit}`
    return null
  }
  // Funcionario: si tiene DNI vinculado, va al Profile de PF
  if (node.type === 'funcionario') {
    const dni = (node.data?.dni as string | undefined) ?? null
    if (dni && /^\d+$/.test(dni)) return `/persona/${dni}`
    return null
  }
  // Director: igual que funcionario, requiere DNI
  if (node.type === 'director') {
    const dni = (node.data?.dni as string | undefined) ?? null
    if (dni && /^\d+$/.test(dni)) return `/persona/${dni}`
    return null
  }
  // Contrato → ruta legacy
  if (node.type === 'contrato') {
    const hash = node.id.replace(/^contrato:/, '')
    return hash ? `/contrato/${hash}` : null
  }
  // Otros (señal, jurisdiccion, reparticion) — sin Profile canónico todavía
  return null
}
