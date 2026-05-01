/**
 * ErrorState — error consistente con detalle técnico colapsado.
 *
 * Title amigable arriba. Detalle técnico oculto en <details> (no exhibe
 * el raw error message por default, pero queda accesible).
 *
 * Uso:
 *   <ErrorState
 *     title="No se pudieron cargar los contratos"
 *     detail={err.message}
 *     onRetry={() => refetch()}
 *   />
 *
 * compact={true} → render inline (banner) en vez de bloque centrado.
 */
import { AlertCircle, RotateCcw } from 'lucide-react'

interface Props {
  /** Título amigable. Ej: "No se pudieron cargar los contratos". */
  title: string
  /** Detalle técnico (raw error). Colapsado por default. */
  detail?: string
  /** Acción de retry. */
  onRetry?: () => void
  /** Modo compacto inline. Default: false (full block). */
  compact?: boolean
}

export function ErrorState({ title, detail, onRetry, compact = false }: Props) {
  const containerBase = {
    display: 'flex',
    backgroundColor: 'var(--surface-raised)',
    border: '1px solid var(--semantic-danger)',
    borderRadius: 'var(--radius-lg)',
    color: 'var(--text-primary)',
  } as const

  const containerStyle = compact
    ? {
        ...containerBase,
        flexDirection: 'row' as const,
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-3) var(--space-4)',
      }
    : {
        ...containerBase,
        flexDirection: 'column' as const,
        alignItems: 'flex-start',
        gap: 'var(--space-3)',
        padding: 'var(--space-5)',
        maxWidth: 560,
        marginInline: 'auto',
      }

  return (
    <div role="alert" style={containerStyle}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          flexShrink: 0,
        }}
      >
        <AlertCircle
          size={compact ? 18 : 22}
          strokeWidth={1.75}
          color="var(--semantic-danger)"
          aria-hidden
        />
        <span
          style={{
            fontSize: compact ? 'var(--text-sm)' : 'var(--text-md)',
            fontFamily: 'var(--font-sans)',
            fontWeight: 'var(--weight-medium)',
            color: 'var(--text-primary)',
            lineHeight: 'var(--leading-tight)',
          }}
        >
          {title}
        </span>
      </div>

      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          gap: 'var(--space-2)',
          width: '100%',
        }}
      >
        {detail && (
          <details
            style={{
              fontSize: 'var(--text-xs)',
              fontFamily: 'var(--font-mono)',
              color: 'var(--text-secondary)',
            }}
          >
            <summary
              style={{
                cursor: 'pointer',
                color: 'var(--text-muted)',
                userSelect: 'none',
                listStyle: 'revert',
              }}
            >
              Ver detalle técnico
            </summary>
            <pre
              style={{
                marginTop: 'var(--space-2)',
                padding: 'var(--space-2)',
                backgroundColor: 'var(--surface-base)',
                border: '1px solid var(--hairline-1)',
                borderRadius: 'var(--radius-sm)',
                color: 'var(--text-secondary)',
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontSize: 'var(--text-xs)',
                lineHeight: 'var(--leading-normal)',
                margin: 0,
              }}
            >
              {detail}
            </pre>
          </details>
        )}

        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 'var(--space-1-5)',
              padding: 'var(--space-1-5) var(--space-3)',
              backgroundColor: 'transparent',
              border: '1px solid var(--hairline-strong)',
              borderRadius: 'var(--radius-md)',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-sans)',
              fontSize: 'var(--text-sm)',
              fontWeight: 'var(--weight-medium)',
              cursor: 'pointer',
              transition: 'background-color var(--motion-fast) var(--ease-out), border-color var(--motion-fast) var(--ease-out)',
              alignSelf: 'flex-start',
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.backgroundColor = 'var(--surface-overlay)'
              e.currentTarget.style.borderColor = 'var(--accent-primary)'
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.backgroundColor = 'transparent'
              e.currentTarget.style.borderColor = 'var(--hairline-strong)'
            }}
          >
            <RotateCcw size={14} strokeWidth={1.75} aria-hidden />
            Reintentar
          </button>
        )}
      </div>
    </div>
  )
}
