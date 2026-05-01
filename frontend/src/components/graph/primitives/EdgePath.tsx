// frontend/src/components/graph/primitives/EdgePath.tsx
//
// EdgePath — primitive visual de arista en el grafo forense.
//
// Distintos `kind` rinden estilos distintos para que la naturaleza
// de la relación sea visualmente legible sin leyenda en pantalla:
//
//   pertenece_a  → línea sólida tenue (jerárquico estructural)
//   contrata     → curva bezier ámbar (transacción comercial); grosor
//                  log-escalado por monto (weight 0..1)
//   dirige       → línea punteada cyan (rol de gobernanza, no monto)
//   conflicto_con → línea sólida roja gruesa con drop-shadow glow
//   emite        → línea muy fina punteada (documento/acto)
//
// Tokens.css siempre — nunca hex hardcoded. Stroke widths múltiplos
// de 0.5. Curva bezier centra el control point en la perpendicular
// al midpoint, k = clamp(longitud * 0.12, 8, 36).
import type { EdgeKind } from '../types'

interface Props {
  x1: number
  y1: number
  x2: number
  y2: number
  kind: EdgeKind
  /** 0..1 — afecta strokeWidth (solo en 'contrata') */
  weight: number
}

interface EdgeStyle {
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  strokeOpacity: number
  curved: boolean
  filter?: string
}

function styleFor(kind: EdgeKind, weight: number): EdgeStyle {
  switch (kind) {
    case 'pertenece_a':
      return { stroke: 'var(--text-muted)', strokeWidth: 1.5, strokeOpacity: 0.55, curved: false }
    case 'contrata':
      return {
        stroke: 'var(--entity-empresa)',
        strokeWidth: 1 + Math.log2(1 + weight * 8),
        strokeOpacity: 0.7,
        curved: true,
      }
    case 'dirige':
      return {
        stroke: 'var(--entity-documento)',
        strokeWidth: 1,
        strokeDasharray: '6 3',
        strokeOpacity: 0.65,
        curved: false,
      }
    case 'conflicto_con':
      return {
        stroke: 'var(--semantic-danger)',
        strokeWidth: 2.5,
        strokeOpacity: 0.85,
        curved: false,
        filter: 'drop-shadow(0 0 3px var(--semantic-danger))',
      }
    case 'emite':
      return {
        stroke: 'var(--entity-documento)',
        strokeWidth: 1,
        strokeDasharray: '2 4',
        strokeOpacity: 0.5,
        curved: false,
      }
  }
}

function buildPath(x1: number, y1: number, x2: number, y2: number, curved: boolean): string {
  if (!curved) return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const k = Math.max(8, Math.min(36, len * 0.12))
  const cpx = (x1 + x2) / 2 + nx * k
  const cpy = (y1 + y2) / 2 + ny * k
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

export function EdgePath({ x1, y1, x2, y2, kind, weight }: Props) {
  const style = styleFor(kind, weight)
  const d = buildPath(x1, y1, x2, y2, style.curved)
  return (
    <path
      className="edge-path"
      d={d}
      fill="none"
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      strokeOpacity={style.strokeOpacity}
      strokeDasharray={style.strokeDasharray}
      filter={style.filter}
    />
  )
}
