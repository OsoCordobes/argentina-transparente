/**
 * LoadingState — loading consistente en 3 modos.
 *
 *   inline:  barra fina con shimmer arriba (top-of-page hint).
 *   block:   N skeleton lines con shimmer (placeholder antes del data render).
 *   overlay: full overlay con backdrop-blur + label central + dot pulsante.
 *
 * Reemplaza el zoo de spinners + "Cargando..." varios. Respeta
 * prefers-reduced-motion (las animations se neutralizan globalmente
 * en tokens.css).
 */

interface Props {
  /** Modo de render. Default: 'block'. */
  mode?: 'inline' | 'block' | 'overlay'
  /** Etiqueta opcional ("Cargando contratos..."). */
  label?: string
  /** Cantidad de skeleton lines en mode='block'. Default: 3. */
  lines?: number
}

const SHIMMER_BG =
  'linear-gradient(90deg, transparent 0%, var(--hairline-2) 50%, transparent 100%)'

const SHIMMER_STYLE = {
  background: SHIMMER_BG,
  backgroundSize: '200% 100%',
  animation: 'argos-shimmer 1.6s var(--ease-in-out) infinite',
} as const

export function LoadingState({ mode = 'block', label, lines = 3 }: Props) {
  if (mode === 'inline') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label ?? 'Cargando'}
        style={{
          width: '100%',
          height: 2,
          backgroundColor: 'var(--hairline-1)',
          borderRadius: 'var(--radius-pill)',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 0,
            ...SHIMMER_STYLE,
          }}
        />
      </div>
    )
  }

  if (mode === 'overlay') {
    return (
      <div
        role="status"
        aria-live="polite"
        aria-label={label ?? 'Cargando'}
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: 'var(--glass-bg)',
          backdropFilter: 'var(--glass-blur)',
          WebkitBackdropFilter: 'var(--glass-blur)',
          zIndex: 10,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 'var(--space-3)',
            padding: 'var(--space-3) var(--space-5)',
            backgroundColor: 'var(--surface-overlay)',
            border: '1px solid var(--hairline-2)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--elevation-2)',
          }}
        >
          <span
            aria-hidden
            style={{
              display: 'inline-block',
              width: 8,
              height: 8,
              borderRadius: '50%',
              backgroundColor: 'var(--accent-primary)',
              animation: 'argos-dot-pulse 1.2s var(--ease-in-out) infinite',
            }}
          />
          <span
            style={{
              fontSize: 'var(--text-sm)',
              fontFamily: 'var(--font-sans)',
              color: 'var(--text-primary)',
              fontWeight: 'var(--weight-medium)',
            }}
          >
            {label ?? 'Cargando…'}
          </span>
        </div>
      </div>
    )
  }

  // mode === 'block'
  const linesCount = Math.max(1, lines)
  const rows = Array.from({ length: linesCount }, (_, i) => i)

  return (
    <div
      role="status"
      aria-live="polite"
      aria-label={label ?? 'Cargando'}
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: 'var(--space-2)',
        padding: 'var(--space-4)',
        backgroundColor: 'var(--surface-raised)',
        border: '1px solid var(--hairline-1)',
        borderRadius: 'var(--radius-lg)',
      }}
    >
      {label && (
        <div
          style={{
            fontSize: 'var(--text-xs)',
            fontFamily: 'var(--font-mono)',
            textTransform: 'uppercase',
            letterSpacing: 'var(--tracking-wider)',
            color: 'var(--text-muted)',
            marginBottom: 'var(--space-1)',
          }}
        >
          {label}
        </div>
      )}
      {rows.map((idx) => {
        // Líneas con anchos variables para que se sienta natural.
        const widths = ['100%', '92%', '78%', '85%', '60%']
        const width = widths[idx % widths.length]
        return (
          <div
            key={idx}
            style={{
              height: 12,
              width,
              borderRadius: 'var(--radius-sm)',
              backgroundColor: 'var(--hairline-1)',
              ...SHIMMER_STYLE,
            }}
          />
        )
      })}
    </div>
  )
}
