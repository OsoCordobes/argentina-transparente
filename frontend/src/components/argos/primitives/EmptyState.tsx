/**
 * EmptyState — estado vacío consistente para toda la app.
 *
 * Reemplaza ad-hoc divs con "Sin resultados" / "Cargando..." / blank.
 * Diseño centrado vertical+horizontal, eyebrow mono uppercase tracking
 * wider, title editorial, body explicativo, hasta 2 acciones.
 *
 * Uso típico:
 *   <EmptyState
 *     eyebrow="ACTORES · 0 ENCONTRADOS"
 *     title="Sin actores en este filtro"
 *     body="Probá ampliar el rango de fechas o quitar filtros para ver más resultados."
 *     primaryAction={<Button>Limpiar filtros</Button>}
 *   />
 */
import { Inbox } from 'lucide-react'
import type { ReactNode } from 'react'

interface Props {
  /** Eyebrow label (uppercase, mono, tracked). Ej: "ACTORES · 0 ENCONTRADOS". */
  eyebrow?: string
  /** Título principal — frase corta que orienta. */
  title: string
  /** Body explicativo — 1-2 líneas, explica por qué está vacío. */
  body?: string
  /** Acción primaria (botón). */
  primaryAction?: ReactNode
  /** Acción secundaria (link o botón sutil). */
  secondaryAction?: ReactNode
  /** Icon principal (Lucide). Default: Inbox 48px. */
  icon?: ReactNode
}

export function EmptyState({
  eyebrow,
  title,
  body,
  primaryAction,
  secondaryAction,
  icon,
}: Props) {
  const defaultIcon = (
    <Inbox
      size={48}
      strokeWidth={1.5}
      color="var(--text-muted)"
      aria-hidden
    />
  )

  return (
    <div
      role="status"
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        textAlign: 'center',
        paddingBlock: 'var(--space-12)',
        paddingInline: 'var(--space-6)',
        gap: 'var(--space-3)',
        maxWidth: 480,
        marginInline: 'auto',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          width: 64,
          height: 64,
          marginBottom: 'var(--space-2)',
        }}
      >
        {icon ?? defaultIcon}
      </div>

      {eyebrow && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--text-muted)',
            fontWeight: 'var(--weight-medium)',
          }}
        >
          {eyebrow}
        </div>
      )}

      <div
        style={{
          fontSize: 'var(--text-md)',
          fontFamily: 'var(--font-sans)',
          fontWeight: 'var(--weight-medium)',
          color: 'var(--text-primary)',
          lineHeight: 'var(--leading-tight)',
        }}
      >
        {title}
      </div>

      {body && (
        <div
          style={{
            fontSize: 'var(--text-sm)',
            fontFamily: 'var(--font-sans)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--leading-normal)',
            maxWidth: 380,
          }}
        >
          {body}
        </div>
      )}

      {(primaryAction || secondaryAction) && (
        <div
          style={{
            display: 'flex',
            gap: 'var(--space-2)',
            justifyContent: 'center',
            marginTop: 'var(--space-3)',
            flexWrap: 'wrap',
          }}
        >
          {primaryAction}
          {secondaryAction}
        </div>
      )}
    </div>
  )
}
