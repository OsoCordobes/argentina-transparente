/**
 * VerificacionBadge.tsx
 *
 * Badge universal del estado de verificación de una señal.
 * PLAN-UI §8 — innegociable: TODA señal lleva este badge en cualquier
 * superficie donde aparezca. Sin él, una señal no puede mostrarse.
 *
 * Estados (alineados con backend lib/verificacion-senales.ts):
 *
 *   ✓ verificada     verde      DNI/CUIT confirmado, lista para denuncia
 *   ◌ sin_verificar  amarillo   detector la generó, falta humano
 *   ✗ descartada     gris       refutada (típicamente homonimia)
 *   ⚠ bloqueada      rojo       fuente caída/redactada
 */
import type { EstadoVerificacionSeñal } from '@/lib/argos/types'

interface Props {
  estado: EstadoVerificacionSeñal
  /** Si se conoce el verificador, se muestra en el title (tooltip). */
  verificadoPor?: string | null
  verificadoEn?: string | null
  /** Compacto = solo glifo + label corta. Default: full. */
  compact?: boolean
}

const CONFIG: Record<EstadoVerificacionSeñal, { glyph: string; label: string; color: string; description: string }> = {
  verificada: {
    glyph: '✓',
    label: 'Verificada',
    color: '#62C7A0', // verde
    description: 'DNI/CUIT confirmado contra fuente externa. Lista para denuncia.',
  },
  sin_verificar: {
    glyph: '◌',
    label: 'Sin verificar',
    color: '#F5B544', // amarillo
    description: 'El detector la generó automáticamente. Falta confirmación humana.',
  },
  descartada: {
    glyph: '✗',
    label: 'Descartada',
    color: '#9BA3B4', // gris
    description: 'Verificada y refutada (típicamente homonimia confirmada). Queda en histórico.',
  },
  bloqueada: {
    glyph: '⚠',
    label: 'Bloqueada',
    color: '#E25656', // rojo
    description: 'Verificación intentada pero la fuente está caída o redactada.',
  },
}

export function VerificacionBadge({ estado, verificadoPor, verificadoEn, compact = false }: Props) {
  const cfg = CONFIG[estado]

  let titleParts = [cfg.description]
  if (verificadoPor) titleParts.push(`Por: ${verificadoPor}`)
  if (verificadoEn) {
    const fecha = new Date(verificadoEn).toLocaleDateString('es-AR', { year: 'numeric', month: 'short', day: 'numeric' })
    titleParts.push(`El: ${fecha}`)
  }
  const title = titleParts.join(' · ')

  return (
    <span
      title={title}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 4,
        fontSize: compact ? 10 : 11,
        padding: compact ? '2px 6px' : '3px 8px',
        borderRadius: 3,
        background: cfg.color + '22',
        color: cfg.color,
        border: `1px solid ${cfg.color}`,
        whiteSpace: 'nowrap',
        fontWeight: 500,
      }}
    >
      <span aria-hidden="true">{cfg.glyph}</span>
      {!compact && cfg.label}
    </span>
  )
}
