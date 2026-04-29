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
  /**
   * Deprecado en review #1 (post-bug fix). El algoritmo nuevo (seed+expand)
   * ya no descarta huérfanos por construcción. La opción se mantiene en la
   * interfaz por backwards-compat con callers existentes pero se ignora.
   */
  mantenerSeveros?: boolean
}

export interface CuracionResultado {
  graph: ArgosGraph
  capExcedido: boolean
  nodosOcultados: number
  totalOriginal: number
}

/**
 * Cap por relevancia con expansión por vecindad.
 *
 * BUG FIX (review #1): el algoritmo anterior tomaba top N y FILTRABA
 * orphans, lo que reducía el resultado a 6-10 nodos cuando el grafo era
 * disperso (típico: señales conectan a empresas que NO están en el top N
 * por relevancia, así que después del filtro de edges quedan orphans y
 * se descartan).
 *
 * Estrategia nueva (seed + expansión):
 *   1. Tomar TOP_SEEDS nodos por relevancia (default 40)
 *   2. Agregar todos sus vecinos directos (1-hop) hasta llenar maxNodos
 *   3. Filtrar edges al conjunto resultante
 *   4. NO descartar nodos sin edges — el render los maneja como aislados
 *
 * Garantía: el resultado tiene exactamente min(maxNodos, totalOriginal)
 * nodos. Sin "shrinkage" sorpresivo del 80 a 6.
 */
export function curarTopN(graph: ArgosGraph, opts: CuracionOpts = {}): CuracionResultado {
  const maxNodos = opts.maxNodos ?? 80
  const totalOriginal = graph.nodes.length

  if (graph.nodes.length <= maxNodos) {
    return { graph, capExcedido: false, nodosOcultados: 0, totalOriginal }
  }

  // 1. Ranking por relevancia
  const ranked = [...graph.nodes].sort((a, b) => relevanciaTotal(b) - relevanciaTotal(a))

  // 2. Seed: 50% del cap como semillas de alta relevancia
  const seedCount = Math.max(1, Math.floor(maxNodos * 0.5))
  const seeds = ranked.slice(0, seedCount)
  const seleccionados = new Set<string>(seeds.map(n => n.id))

  // 3. Indexar edges por nodo para expansión rápida
  const edgesPorNodo = new Map<string, Set<string>>()
  for (const e of graph.edges) {
    const sid = typeof e.source === 'string' ? e.source : e.source.id
    const tid = typeof e.target === 'string' ? e.target : e.target.id
    if (!edgesPorNodo.has(sid)) edgesPorNodo.set(sid, new Set())
    if (!edgesPorNodo.has(tid)) edgesPorNodo.set(tid, new Set())
    edgesPorNodo.get(sid)!.add(tid)
    edgesPorNodo.get(tid)!.add(sid)
  }

  // 4. Expansión: agregar vecinos de las semillas hasta llenar el cap
  const idToNode = new Map(graph.nodes.map(n => [n.id, n]))
  for (const seed of seeds) {
    if (seleccionados.size >= maxNodos) break
    const vecinos = edgesPorNodo.get(seed.id) ?? new Set()
    // Vecinos ordenados por relevancia (los más interesantes primero)
    const vecinosOrdenados = [...vecinos]
      .map(id => idToNode.get(id))
      .filter((n): n is ArgosNode => !!n)
      .sort((a, b) => relevanciaTotal(b) - relevanciaTotal(a))
    for (const v of vecinosOrdenados) {
      if (seleccionados.size >= maxNodos) break
      seleccionados.add(v.id)
    }
  }

  // 5. Si todavía faltan slots, completar con los siguientes en el ranking
  for (const n of ranked) {
    if (seleccionados.size >= maxNodos) break
    seleccionados.add(n.id)
  }

  const nodosFinal = graph.nodes.filter(n => seleccionados.has(n.id))
  const edgesFinales: ArgosEdge[] = graph.edges.filter(e => {
    const sid = typeof e.source === 'string' ? e.source : e.source.id
    const tid = typeof e.target === 'string' ? e.target : e.target.id
    return seleccionados.has(sid) && seleccionados.has(tid)
  })

  return {
    graph: { nodes: nodosFinal, edges: edgesFinales },
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
