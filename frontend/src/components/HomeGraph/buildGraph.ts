// frontend/src/components/HomeGraph/buildGraph.ts
//
// Pure adapter: response de /api/grafo/mapa-provincial → instancia
// Graphology con encoding visual completo data-driven.
//
// 7 tipos de nodo + 8 tipos de arista. Layout dual-root: provincia
// pre-posicionada al norte (y < 0), capital al sur (y > 0). FA2 refina
// pero las posiciones iniciales preservan la lectura jurisdiccional.

import Graph from 'graphology'
import type { MapaProvincialResponse } from '@/lib/queries'
import { getSprite } from './sprites'

// ═══════════════════════════════════════════════════════════════════════
// PALETA — todos los colores hex resueltos en JS para que sigma los
// reciba como strings. Sincronizados con docs/superpowers/plans/2026-05-05.
// ═══════════════════════════════════════════════════════════════════════

export const COLORS = {
  // Jurisdicciones (depth 0)
  jurProvincia: '#4FC3F7',  // azul provincial
  jurCapital:   '#FFB74D',  // amber capital

  // Ministerios + secretarías (depth 1) — tono de su jurisdicción
  ministerioProvincia: '#29B6F6',
  ministerioCapital:   '#FFA726',

  // Organismos descentralizados (depth 1, jurisdicción mixta)
  organismo: '#A78BFA',

  // Sub-niveles (depth 2)
  direccion: '#94A3B8',  // gris neutro
  empresa:   '#F59E0B',  // amber

  // Personas (depth 3)
  personaFuncionario: '#60A5FA',  // celeste
  personaDirector:    '#C084FC',  // violet
  empleado:           '#CBD5E1',  // gris muy claro

  // Aristas — color por kind
  edgeContiene:           'rgba(148, 163, 184, 0.20)',
  edgeComparteJurisd:     'rgba(120, 144, 255, 0.55)',
  edgeContrata:           '#F59E0B',
  edgeTrabajaEn:          'rgba(203, 213, 225, 0.16)',
  edgeDirige:             '#C084FC',
  edgePreside:            '#60A5FA',
  edgeConflicto:          '#EF4444',
  edgeCompartedirector:   'rgba(192, 132, 252, 0.42)',

  // Fallbacks
  defaultNode: '#475569',
  defaultEdge: 'rgba(71, 85, 105, 0.4)',
} as const

// Para legend / detail panel
export const ENTITY_COLORS: Record<string, string> = {
  jurisdiccion: COLORS.jurProvincia,  // legend usa una representativa
  ministerio: COLORS.ministerioCapital,
  direccion: COLORS.direccion,
  organismo: COLORS.organismo,
  empresa: COLORS.empresa,
  persona: COLORS.personaFuncionario,
  empleado: COLORS.empleado,
}

// ═══════════════════════════════════════════════════════════════════════
// TIPOS — Graphology node/edge attrs
// ═══════════════════════════════════════════════════════════════════════

export interface GraphNodeAttrs {
  // requeridos por sigma
  x: number
  y: number
  size: number
  color: string
  label: string
  // sigma program
  type?: string
  image?: string  // data URL del sprite Lucide (Phase D)
  // metadata propia
  entityType: 'jurisdiccion' | 'ministerio' | 'direccion' | 'organismo' | 'empresa' | 'persona' | 'empleado'
  jurisdiccion: 'provincia' | 'capital' | null
  depth: 0 | 1 | 2 | 3
  subtitle: string
  weight: number
  // datos crudos
  monto: number
  contratos: number
  empleados: number
  cuit: string | null
  cuitVerificado: boolean
  hasGrave: boolean
  hasModerada: boolean
  // hidden by filter
  hidden?: boolean
  // borde para señales graves
  borderColor?: string
  borderSize?: number
  // sub-attrs: para detail panel y reducers
  rawData: Record<string, unknown>
}

export interface GraphEdgeAttrs {
  size: number
  color: string
  type?: string
  kind:
    | 'contiene'
    | 'comparte_jurisdiccion'
    | 'contrata'
    | 'trabaja_en'
    | 'dirige'
    | 'preside'
    | 'conflicto_con'
    | 'comparte_director'
  weight: number
  hidden?: boolean
}

// ═══════════════════════════════════════════════════════════════════════
// ENCODING HELPERS
// ═══════════════════════════════════════════════════════════════════════

function nodeColor(t: GraphNodeAttrs['entityType'], jur: 'provincia' | 'capital' | null): string {
  if (t === 'jurisdiccion') return jur === 'provincia' ? COLORS.jurProvincia : COLORS.jurCapital
  if (t === 'ministerio') return jur === 'provincia' ? COLORS.ministerioProvincia : COLORS.ministerioCapital
  if (t === 'organismo') return COLORS.organismo
  if (t === 'direccion') return COLORS.direccion
  if (t === 'empresa') return COLORS.empresa
  if (t === 'persona') return COLORS.personaFuncionario
  if (t === 'empleado') return COLORS.empleado
  return COLORS.defaultNode
}

function nodeSize(n: { entityType: string; weight: number; depth: number; monto: number; empleados: number }): number {
  const base = n.depth === 0 ? 22 : n.depth === 1 ? 14 : n.depth === 2 ? 8 : 5
  const range = n.depth === 0 ? 14 : n.depth === 1 ? 14 : n.depth === 2 ? 8 : 4
  return base + n.weight * range
}

function edgeColor(kind: GraphEdgeAttrs['kind']): string {
  switch (kind) {
    case 'contiene': return COLORS.edgeContiene
    case 'comparte_jurisdiccion': return COLORS.edgeComparteJurisd
    case 'contrata': return COLORS.edgeContrata
    case 'trabaja_en': return COLORS.edgeTrabajaEn
    case 'dirige': return COLORS.edgeDirige
    case 'preside': return COLORS.edgePreside
    case 'conflicto_con': return COLORS.edgeConflicto
    case 'comparte_director': return COLORS.edgeCompartedirector
    default: return COLORS.defaultEdge
  }
}

function edgeSize(kind: GraphEdgeAttrs['kind'], weight: number): number {
  // weight viene 0..1 normalizado del backend
  switch (kind) {
    case 'comparte_jurisdiccion': return 4.5
    case 'contrata': return 0.6 + Math.sqrt(Math.max(0, weight)) * 4.0
    case 'contiene': return 0.4 + weight * 0.6
    case 'trabaja_en': return 0.3
    case 'dirige': return 1.4
    case 'preside': return 1.8
    case 'conflicto_con': return 2.5
    case 'comparte_director': return 1.0
    default: return 1.0
  }
}

// ═══════════════════════════════════════════════════════════════════════
// MAIN BUILDER
// ═══════════════════════════════════════════════════════════════════════

export function buildGraph(data: MapaProvincialResponse): Graph<GraphNodeAttrs, GraphEdgeAttrs> {
  const graph = new Graph<GraphNodeAttrs, GraphEdgeAttrs>({ multi: true, type: 'directed' })

  // ═══════════════════════════════════════════════════════════════════════
  // CLUSTER-AWARE LAYOUT
  // ═══════════════════════════════════════════════════════════════════════
  //
  // En lugar de dejar que ForceAtlas2 produzca un anillo uniforme, pre-
  // posicionamos cada nodo en su "barrio" temático:
  //
  //   1. Provincia ocupa la mitad IZQUIERDA del canvas
  //   2. Capital ocupa la mitad DERECHA
  //   3. Cada ministerio (depth 1) es CENTRO de su propio cluster, posicionado
  //      en arco vertical dentro de su jurisdicción
  //   4. Cada empresa (depth 2) gravita hacia el ministerio donde tiene su
  //      contrato más grande (heaviest contrata edge)
  //   5. Cada dirección (depth 2) gravita hacia su ministerio inferido por
  //      coincidencia de nombre — fallback: jurisdicción raíz
  //   6. Cada persona (depth 3) hacia su reparticion
  //
  // FA2 después solo refina LOCALMENTE (slowDown muy alto) — no destruye
  // los clusters porque las posiciones iniciales son muy estables.

  // ─── Step 1: identificar cluster centers (ministerios + organismos) ───
  const ministerios = data.nodes.filter(n => n.type === 'ministerio' || n.type === 'organismo')
  const ministeriosByJur = {
    provincia: ministerios.filter(m => m.jurisdiccion === 'provincia'),
    capital: ministerios.filter(m => m.jurisdiccion === 'capital'),
  }
  // Ordenar por weight (más grandes primero) — los grandes quedan al medio
  ministeriosByJur.provincia.sort((a, b) => b.weight - a.weight)
  ministeriosByJur.capital.sort((a, b) => b.weight - a.weight)

  // ─── Step 2: posicionar cluster centers en zonas separadas ────────────
  // World units: definimos un canvas conceptual de 200x100. Provincia
  // ocupa x=[-100, -10], Capital ocupa x=[+10, +100].
  const PROV_CX = -55
  const CAP_CX = +55
  const HALF_HEIGHT = 50  // y va de -50 a +50 dentro de cada zona

  const ministerioPos = new Map<string, { x: number; y: number }>()

  function distributeMinisterios(
    arr: typeof ministerios,
    centerX: number,
  ): void {
    if (arr.length === 0) return
    // Distribución en grid vertical: columna centrada, los grandes van más
    // cerca del centro Y, los chicos hacia los bordes
    const N = arr.length
    arr.forEach((m, i) => {
      // i=0 (más grande) → y=0; i=1,2 → y=±20; etc.
      const ringIdx = Math.ceil((i + 1) / 2)
      const sign = i % 2 === 0 ? 1 : -1
      const ySlots = Math.ceil(N / 2)
      const yStep = (HALF_HEIGHT * 2) / Math.max(1, ySlots * 2)
      // Distribuir los ministerios en arco que los aleja del centro horizontal
      const arcOffset = ringIdx * 6  // empuja hacia afuera
      const xOffset = centerX > 0 ? +arcOffset : -arcOffset
      const y = sign * ringIdx * yStep
      ministerioPos.set(m.id, { x: centerX + xOffset, y })
    })
  }
  distributeMinisterios(ministeriosByJur.provincia, PROV_CX)
  distributeMinisterios(ministeriosByJur.capital, CAP_CX)

  // ─── Step 3: para cada empresa, encontrar su ministerio principal ─────
  // El primary cluster es el ministerio destino de la arista 'contrata' con
  // mayor weight. Si una empresa contrata con 3 ministerios, gravita al de
  // mayor monto.
  const empresaPrimaryCluster = new Map<string, string>()
  for (const e of data.edges) {
    if (e.kind !== 'contrata') continue
    const cur = empresaPrimaryCluster.get(e.source)
    if (!cur) {
      empresaPrimaryCluster.set(e.source, e.target)
    } else {
      // Comparar weights — si esta arista es más grande, reemplaza
      const curEdge = data.edges.find(ee => ee.source === e.source && ee.target === cur && ee.kind === 'contrata')
      if (!curEdge || e.weight > curEdge.weight) {
        empresaPrimaryCluster.set(e.source, e.target)
      }
    }
  }

  // ─── Step 4: para direcciones, inferir ministerio padre por nombre ────
  // Las direcciones del backend hangean de la jurisdicción raíz (no de un
  // ministerio específico). Aplicamos una heurística por keyword:
  //   "DIRECCIÓN DE EDUCACIÓN" → busca ministerio con "EDUCACI" en el nombre
  function inferDireccionParent(label: string, jurisdiccion: 'provincia' | 'capital' | null): string | null {
    if (!jurisdiccion) return null
    const lbl = label.toLowerCase()
    const candidates = ministeriosByJur[jurisdiccion]
    // Stop words que no ayudan al match
    const KEYWORDS: Record<string, string[]> = {
      educacion: ['educac'],
      salud: ['salud', 'sanit', 'hospital'],
      seguridad: ['segurid', 'polic', 'penitenciar'],
      desarrollo: ['desarrollo'],
      ambiente: ['ambient', 'sostenib', 'sustent'],
      economia: ['econom', 'finanz', 'tribut', 'hacienda'],
      cultura: ['cultur', 'arte'],
      transporte: ['transp', 'trans', 'movilid'],
      gobernacion: ['gobern', 'jefatur', 'general'],
      justicia: ['justici', 'derecho'],
      trabajo: ['trabaj', 'empleo'],
      vivienda: ['vivienda', 'habit'],
      agricultura: ['agricultur', 'rural', 'ganader'],
      industria: ['industr', 'comerc', 'produc'],
    }
    for (const [, kws] of Object.entries(KEYWORDS)) {
      const hitsLabel = kws.some(k => lbl.includes(k))
      if (!hitsLabel) continue
      // Buscar ministerio que también matchee
      const match = candidates.find(m => kws.some(k => m.label.toLowerCase().includes(k)))
      if (match) return match.id
    }
    return null
  }

  // ─── Step 5: función de posicionamiento por cluster ───────────────────
  // Usamos hash determinista del id para el offset angular de cada hijo —
  // así el layout es estable entre rebuilds (no random).
  function hashFloat(s: string): number {
    let h = 2166136261
    for (let i = 0; i < s.length; i++) {
      h = (h ^ s.charCodeAt(i)) >>> 0
      h = Math.imul(h, 16777619) >>> 0
    }
    return (h % 10000) / 10000  // [0, 1)
  }

  function clusterCenter(jurId: 'provincia' | 'capital'): { x: number; y: number } {
    return { x: jurId === 'provincia' ? PROV_CX : CAP_CX, y: 0 }
  }

  function initialPosition(node: { id: string; type: string; depth: number; jurisdiccion: 'provincia' | 'capital' | null; label: string }): { x: number; y: number } {
    // Roots: jurisdicciones en posiciones fijas (centro de su mitad)
    if (node.type === 'jurisdiccion') {
      return clusterCenter(node.jurisdiccion ?? 'capital')
    }
    // Ministerios + organismos: posición pre-calculada
    if (node.type === 'ministerio' || node.type === 'organismo') {
      const pos = ministerioPos.get(node.id)
      if (pos) return pos
      // Fallback: centro de la jurisdicción + offset
      const c = clusterCenter(node.jurisdiccion ?? 'capital')
      return { x: c.x + (hashFloat(node.id) - 0.5) * 30, y: (hashFloat(node.id + '#y') - 0.5) * 60 }
    }
    // Empresas: gravita hacia su ministerio principal (heaviest contrata)
    if (node.type === 'empresa') {
      const cluster = empresaPrimaryCluster.get(node.id)
      const center = cluster ? ministerioPos.get(cluster) : null
      const fallback = node.jurisdiccion ? clusterCenter(node.jurisdiccion) : { x: 0, y: 0 }
      const c = center ?? fallback
      const angle = hashFloat(node.id) * 2 * Math.PI
      const r = 4 + hashFloat(node.id + '#r') * 5
      return { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r }
    }
    // Direcciones: inferir parent por keyword, fallback jurisdicción
    if (node.type === 'direccion') {
      const inferred = inferDireccionParent(node.label, node.jurisdiccion)
      const center = inferred ? ministerioPos.get(inferred) : null
      const fallback = node.jurisdiccion ? clusterCenter(node.jurisdiccion) : { x: 0, y: 0 }
      const c = center ?? fallback
      const angle = hashFloat(node.id) * 2 * Math.PI
      const r = 3 + hashFloat(node.id + '#r') * 3
      return { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r }
    }
    // Personas: si tienen reparticion ID en la primera arista trabaja_en, usar ese
    // (no tenemos cluster directo aquí — las personas se quedan al lado de la
    // jurisdicción, FA2 las acomodará por sus aristas)
    if (node.type === 'persona' || node.type === 'empleado') {
      const c = node.jurisdiccion ? clusterCenter(node.jurisdiccion) : { x: 0, y: 0 }
      const angle = hashFloat(node.id) * 2 * Math.PI
      const r = 8 + hashFloat(node.id + '#r') * 6
      return { x: c.x + Math.cos(angle) * r, y: c.y + Math.sin(angle) * r }
    }
    // Default fallback
    return { x: 0, y: 0 }
  }

  // ─── INSERT NODES ─────────────────────────────────────────────────────
  for (const n of data.nodes) {
    const pos = initialPosition(n)
    const color = nodeColor(n.type, n.jurisdiccion)
    const size = nodeSize({
      entityType: n.type,
      weight: n.weight,
      depth: n.depth,
      monto: Number(n.data.monto ?? 0),
      empleados: Number(n.data.empleados ?? 0),
    })
    const cuit = (n.data.cuit as string) ?? null
    const cuitVerificado = !!n.flags?.cuitVerificado || !!cuit
    const hasGrave = !!n.flags?.senalGrave
    const hasModerada = !!n.flags?.senalModerada

    graph.addNode(n.id, {
      x: pos.x,
      y: pos.y,
      size,
      color: cuitVerificado ? color : applyAlpha(color, 0.65),
      label: n.label,
      // 'pictogram' = node-image program con borde y halo de señal grave/moderada.
      type: 'pictogram',
      image: getSprite({ type: n.type, jurisdiccion: n.jurisdiccion }),
      entityType: n.type,
      jurisdiccion: n.jurisdiccion,
      depth: n.depth,
      subtitle: n.subtitle ?? '',
      weight: n.weight,
      monto: Number(n.data.monto ?? 0),
      contratos: Number(n.data.contratos ?? 0),
      empleados: Number(n.data.empleados ?? 0),
      cuit,
      cuitVerificado,
      hasGrave,
      hasModerada,
      borderColor: hasGrave ? COLORS.edgeConflicto : hasModerada ? '#F59E0B' : undefined,
      borderSize: hasGrave || hasModerada ? 2.5 : 0,
      rawData: n.data,
    })
  }

  // ─── INSERT EDGES ─────────────────────────────────────────────────────
  for (const e of data.edges) {
    if (!graph.hasNode(e.source) || !graph.hasNode(e.target)) continue
    try {
      graph.addEdge(e.source, e.target, {
        size: edgeSize(e.kind, e.weight),
        color: edgeColor(e.kind),
        type: 'curve',
        kind: e.kind,
        weight: e.weight,
      })
    } catch {
      // multi-edge duplicado exacto, no fatal
    }
  }

  return graph
}

// Aplica alpha a un color hex (#RRGGBB) → "rgba(r,g,b,a)"
function applyAlpha(hex: string, alpha: number): string {
  if (!hex || hex[0] !== '#' || hex.length < 7) return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${alpha})`
}
