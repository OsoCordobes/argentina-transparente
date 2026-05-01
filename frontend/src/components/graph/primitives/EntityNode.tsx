// frontend/src/components/graph/primitives/EntityNode.tsx
//
// EntityNode — primitive visual de nodo en el grafo forense.
//
// Renderiza un círculo con color/border según taxonomía de entidad
// (estado/persona/empresa/documento) usando los tokens canónicos de
// `EntityIcon`. A partir de zoom 'medium' superpone el icono Lucide
// correspondiente; en zoom 'far' el círculo va desnudo (LOD).
//
// Si el nodo trae flags.senalGrave o senalModerada, dibuja un halo
// pequeño en la esquina SE (semantic-danger / semantic-warn).
//
// Aesthetic: stroke-widths múltiplos de 0.5; sin colores hardcoded;
// fill/stroke opacities suben con hover/selected (1.0 / 0.95 / 0.85).
import { getEntityColor, getEntityIcon } from '@/components/argos/primitives/EntityIcon'
import type { GraphNode } from '../types'

export type ZoomLevel = 'far' | 'medium' | 'close' | 'deep'

interface Props {
  node: GraphNode
  cx: number
  cy: number
  zoomLevel: ZoomLevel
  selected?: boolean
  hovered?: boolean
}

function nodeRadius(node: GraphNode): number {
  const base = node.depth === 0 ? 20 : node.depth === 1 ? 14 : 9
  return base + node.weight * (node.depth === 0 ? 14 : node.depth === 1 ? 8 : 6)
}

export function EntityNode({ node, cx, cy, zoomLevel, selected, hovered }: Props) {
  const r = nodeRadius(node)
  const color = getEntityColor(node.type)
  const Icon = getEntityIcon(node.type)
  const showIcon = zoomLevel !== 'far' && r >= 9
  const iconSize = Math.max(8, Math.round(r * 0.9))

  const fillOp = selected ? 1 : hovered ? 0.95 : 0.85
  const strokeW = selected ? 2.5 : hovered ? 2 : 1.5
  const strokeOp = selected ? 1 : 0.7

  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle
        r={r}
        fill={color.fill}
        fillOpacity={fillOp}
        stroke={color.stroke}
        strokeWidth={strokeW}
        strokeOpacity={strokeOp}
      />
      {showIcon && Icon && (
        <g transform={`translate(${-iconSize / 2},${-iconSize / 2})`} pointerEvents="none">
          <Icon
            width={iconSize}
            height={iconSize}
            stroke="var(--text-primary)"
            strokeWidth={1.75}
            fill="none"
          />
        </g>
      )}
      {/* Halo SE corner si tiene señales */}
      {(node.flags?.senalGrave || node.flags?.senalModerada) && (
        <circle
          cx={r * 0.7}
          cy={r * 0.7}
          r={r * 0.3}
          fill={node.flags.senalGrave ? 'var(--semantic-danger)' : 'var(--semantic-warn)'}
          opacity={0.92}
        />
      )}
    </g>
  )
}
