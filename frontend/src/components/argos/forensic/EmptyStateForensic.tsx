/**
 * EmptyStateForensic — empty state digno (NO infantil).
 *
 * eyebrow mono uppercase + headline editorial peso 300 + body + actions.
 * Centrado vertical, max-width controlled.
 */
import { ReactNode } from 'react'

interface Props {
  /** Eyebrow tipo "EXPEDIENTES · 0 ABIERTOS" */
  eyebrow: string
  /** Headline editorial, peso 300, ~18px */
  title: string
  /** Body text, lead/explanation */
  body: string
  /** Action(s) row debajo */
  primaryAction?: ReactNode
  secondaryAction?: ReactNode
  /** Hint footer (mono uppercase pequeño) */
  hint?: string
}

export function EmptyStateForensic({
  eyebrow,
  title,
  body,
  primaryAction,
  secondaryAction,
  hint,
}: Props) {
  return (
    <div className="fx-empty">
      <div className="fx-empty__inner">
        <div
          className="fx-eyebrow"
          style={{ marginBottom: 16 }}
        >
          {eyebrow}
        </div>
        <div className="fx-empty__title">{title}</div>
        <div className="fx-empty__body">{body}</div>
        {(primaryAction || secondaryAction) && (
          <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: hint ? 20 : 0 }}>
            {primaryAction}
            {secondaryAction}
          </div>
        )}
        {hint && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              marginTop: 6,
            }}
          >
            {hint}
          </div>
        )}
      </div>
    </div>
  )
}
