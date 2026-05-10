/**
 * EntityIcon — taxonomía visual canónica de ARGOS.
 *
 * Render del shape correcto por tipo de entidad. Es la fuente única
 * de verdad para qué shape/color usa cada tipo en TODA la app:
 * cards, leyendas de grafo, filtros chips, badges, etc.
 *
 * Shapes (basados en research forense Palantir/Maltego/Linkurious):
 *   estado     → hexágono (institucional)
 *   persona    → círculo (humano, neutro)
 *   empresa    → rect rounded (privado)
 *   documento  → diamante (artefacto)
 *   senal      → triángulo invertido (alerta)
 *
 * Si severidad='grave' en señal, halo pulsante para llamar atención.
 * Si verificado=true en persona, glyph verde NE (tier 1 visible).
 *
 * Helpers exportados (getEntityColor/Icon/Shape) permiten consumir
 * los tokens desde GraphCanvas sin importar todo el componente.
 */
import { Building2, User, Briefcase, FileText, AlertTriangle } from 'lucide-react'
import type { ComponentType } from 'react'

export type EntityType = 'estado' | 'persona' | 'empresa' | 'documento' | 'senal'

interface Props {
  type: EntityType
  size: number
  color?: string
  severidad?: 'grave' | 'moderada'
  verificado?: boolean
}

// ─── Helpers exportables ────────────────────────────────────────────────

export function getEntityColor(
  type: EntityType,
  severidad: 'grave' | 'moderada' = 'grave',
): { fill: string; stroke: string } {
  switch (type) {
    case 'estado':
      return { fill: 'var(--entity-estado)', stroke: 'var(--entity-estado-border)' }
    case 'persona':
      return { fill: 'var(--entity-persona)', stroke: 'var(--entity-persona-border)' }
    case 'empresa':
      return { fill: 'var(--entity-empresa)', stroke: 'var(--entity-empresa-border)' }
    case 'documento':
      return { fill: 'var(--entity-documento)', stroke: 'var(--entity-documento-border)' }
    case 'senal':
      return severidad === 'grave'
        ? { fill: 'var(--entity-senal-grave)', stroke: 'var(--entity-senal-grave)' }
        : { fill: 'var(--entity-senal-moderada)', stroke: 'var(--entity-senal-moderada)' }
  }
}

export function getEntityIcon(type: EntityType): ComponentType<{ size?: number; strokeWidth?: number; color?: string }> {
  switch (type) {
    case 'estado':
      return Building2
    case 'persona':
      return User
    case 'empresa':
      return Briefcase
    case 'documento':
      return FileText
    case 'senal':
      return AlertTriangle
  }
}

/**
 * Devuelve un path SVG centrado en (size/2, size/2) que dibuja el shape
 * del tipo. Usable directamente en cualquier <svg> externo (GraphCanvas).
 */
export function getEntityShape(type: EntityType, size: number): { d: string } {
  const cx = size / 2
  const cy = size / 2
  const r = size / 2

  switch (type) {
    case 'estado': {
      // hexágono regular (apex top)
      const points: [number, number][] = []
      for (let i = 0; i < 6; i++) {
        const angle = (Math.PI / 3) * i - Math.PI / 2
        points.push([cx + r * Math.cos(angle), cy + r * Math.sin(angle)])
      }
      const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${p[0].toFixed(2)} ${p[1].toFixed(2)}`).join(' ') + ' Z'
      return { d }
    }
    case 'persona': {
      // círculo
      return { d: `M ${cx - r} ${cy} A ${r} ${r} 0 1 0 ${cx + r} ${cy} A ${r} ${r} 0 1 0 ${cx - r} ${cy} Z` }
    }
    case 'empresa': {
      // rect rounded radius=6 (clamp si size pequeño)
      const rx = Math.min(6, size / 4)
      return { d: `M 0 ${rx} Q 0 0 ${rx} 0 L ${size - rx} 0 Q ${size} 0 ${size} ${rx} L ${size} ${size - rx} Q ${size} ${size} ${size - rx} ${size} L ${rx} ${size} Q 0 ${size} 0 ${size - rx} Z` }
    }
    case 'documento': {
      // diamante (rect 45°)
      return { d: `M ${cx} 0 L ${size} ${cy} L ${cx} ${size} L 0 ${cy} Z` }
    }
    case 'senal': {
      // triángulo invertido (apex abajo)
      return { d: `M 0 0 L ${size} 0 L ${cx} ${size} Z` }
    }
  }
}

// ─── Component ──────────────────────────────────────────────────────────

export function EntityIcon({
  type,
  size,
  color,
  severidad = 'grave',
  verificado = false,
}: Props) {
  const palette = getEntityColor(type, severidad)
  const fill = color ?? palette.fill
  const stroke = color ?? palette.stroke
  const Icon = getEntityIcon(type)
  const shape = getEntityShape(type, size)
  const iconSize = Math.round(size * 0.5)
  const isHalo = type === 'senal' && severidad === 'grave'

  return (
    <span
      style={{
        position: 'relative',
        display: 'inline-flex',
        width: size,
        height: size,
        flexShrink: 0,
      }}
      aria-hidden
    >
      {isHalo && (
        <span
          style={{
            position: 'absolute',
            inset: -size * 0.2,
            borderRadius: '50%',
            background: 'var(--entity-senal-grave)',
            opacity: 0.45,
            animation: 'argos-pulse-halo 1.6s var(--ease-in-out) infinite',
            pointerEvents: 'none',
          }}
        />
      )}
      <svg
        width={size}
        height={size}
        viewBox={`0 0 ${size} ${size}`}
        style={{ position: 'relative', display: 'block' }}
      >
        <path
          d={shape.d}
          fill={fill}
          stroke={stroke}
          strokeWidth={1.5}
          opacity={0.92}
        />
      </svg>
      <span
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'var(--text-primary)',
          pointerEvents: 'none',
        }}
      >
        <Icon size={iconSize} strokeWidth={1.75} color="var(--text-primary)" />
      </span>
      {type === 'persona' && verificado && (
        <span
          style={{
            position: 'absolute',
            top: -2,
            right: -2,
            width: Math.max(8, size * 0.28),
            height: Math.max(8, size * 0.28),
            borderRadius: '50%',
            background: 'var(--semantic-success)',
            border: '1.5px solid var(--surface-base)',
          }}
          aria-hidden
        />
      )}
    </span>
  )
}
