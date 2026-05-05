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

  // ─── posicionamiento inicial dual-root ─────────────────────────────────
  // Provincia gravita hacia el norte (y negativo), capital hacia el sur.
  // FA2 después refina pero el sesgo se mantiene en la primer paint.
  const N = data.nodes.length
  const seenJur = new Map<'provincia' | 'capital', number>()
  let provIdx = 0, capIdx = 0
  const provCount = data.nodes.filter(n => n.jurisdiccion === 'provincia').length
  const capCount = data.nodes.filter(n => n.jurisdiccion === 'capital').length
  const otherCount = data.nodes.filter(n => n.jurisdiccion === null).length

  function initialPosition(node: { id: string; type: string; depth: number; jurisdiccion: 'provincia' | 'capital' | null; weight: number }): { x: number; y: number } {
    // Roots: provincia al norte (-y), capital al sur (+y)
    if (node.type === 'jurisdiccion') {
      return node.jurisdiccion === 'provincia' ? { x: 0, y: -8 } : { x: 0, y: 8 }
    }
    // Sin jurisdicción (empresas, personas) → centro inicial, FA2 las acomoda
    if (!node.jurisdiccion) {
      const i = otherCount > 0 ? (graph.order % otherCount) : 0
      const angle = (i / Math.max(1, otherCount)) * 2 * Math.PI
      return { x: Math.cos(angle) * 4, y: Math.sin(angle) * 4 }
    }
    // Ministerios/direcciones/organismos: distribuir en arco de 180° por jurisdicción
    const idx = node.jurisdiccion === 'provincia' ? provIdx++ : capIdx++
    const total = node.jurisdiccion === 'provincia' ? Math.max(1, provCount) : Math.max(1, capCount)
    const baseY = node.jurisdiccion === 'provincia' ? -8 : 8
    const r = node.depth === 1 ? 5 : node.depth === 2 ? 9 : 12
    // Arco: -π → 0 (norte) o 0 → π (sur)
    const t = (idx + 1) / (total + 1)
    let angle: number
    if (node.jurisdiccion === 'provincia') {
      angle = -Math.PI + t * Math.PI  // -π hasta 0
    } else {
      angle = t * Math.PI  // 0 hasta π
    }
    return {
      x: Math.cos(angle) * r,
      y: baseY + Math.sin(angle) * r * 0.6,
    }
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
