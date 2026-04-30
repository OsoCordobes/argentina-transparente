/**
 * DeltaPanel — modal/dialog que se abre al click en "Δ DESDE <fecha>" del header.
 *
 * v0: muestra el placeholder "Δ tracking habilitado. Próxima visita verás
 * cambios desde {fecha}". No hace fetch al backend (no existe /api/diff aún).
 *
 * v1: lista de cambios reales (nuevos contratos, nuevas señales, nuevos
 * vínculos, mudanzas en DDJJ, etc.) cuando el backend exponga snapshots.
 */
import { useEffect, useRef } from 'react'
import { formatShortDate } from '@/lib/argos/diff'

interface DeltaPanelProps {
  open: boolean
  onClose: () => void
  lastVisitIso: string | null
}

export function DeltaPanel({ open, onClose, lastVisitIso }: DeltaPanelProps) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)

  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])

  // Esc cierra (default <dialog> behavior, pero queremos sync con state)
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    const onCancel = (e: Event) => {
      e.preventDefault()
      onClose()
    }
    d.addEventListener('cancel', onCancel)
    return () => d.removeEventListener('cancel', onCancel)
  }, [onClose])

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        // click en backdrop (fuera del contenido) cierra
        if (e.target === dialogRef.current) onClose()
      }}
      style={{
        background: 'var(--bg-forensic-1)',
        color: 'var(--text-1)',
        border: '1px solid var(--hairline-2)',
        padding: 0,
        minWidth: 480,
        maxWidth: 720,
        fontFamily: 'var(--font-sans)',
      }}
    >
      <div
        style={{
          padding: '14px 18px',
          borderBottom: '1px solid var(--hairline-1)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'var(--bg-forensic-1)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 14,
              color: 'var(--warn)',
            }}
          >
            Δ
          </span>
          <span
            style={{
              fontFamily: 'var(--font-mono)',
              fontSize: 11,
              color: 'var(--text-2)',
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
            }}
          >
            CAMBIOS DESDE {formatShortDate(lastVisitIso)}
          </span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-3)',
            cursor: 'pointer',
            fontFamily: 'var(--font-mono)',
            fontSize: 16,
            lineHeight: 1,
          }}
          aria-label="Cerrar"
        >
          ×
        </button>
      </div>

      <div style={{ padding: '24px 18px' }}>
        {!lastVisitIso ? (
          <div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-1)',
                lineHeight: 1.5,
                marginBottom: 8,
              }}
            >
              Δ tracking habilitado.
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.6 }}>
              En la próxima visita verás qué cambió desde ahora: nuevos contratos,
              nuevas señales, nuevos vínculos detectados, cambios en DDJJ.
            </div>
          </div>
        ) : (
          <div>
            <div
              style={{
                fontSize: 13,
                color: 'var(--text-1)',
                lineHeight: 1.5,
                marginBottom: 12,
              }}
            >
              Sin novedades materiales detectadas desde tu última visita.
            </div>
            <div
              style={{
                fontSize: 11,
                color: 'var(--text-3)',
                lineHeight: 1.6,
                fontFamily: 'var(--font-mono)',
                letterSpacing: '0.04em',
                padding: '10px 12px',
                border: '1px solid var(--hairline-1)',
                background: 'var(--bg-forensic-2)',
              }}
            >
              ◐ Endpoint /api/diff en desarrollo. Esta vista mostrará nodos +
              señales + vínculos nuevos cuando el backend de snapshots esté
              cableado.
            </div>
          </div>
        )}
      </div>

      <div
        style={{
          padding: '10px 18px',
          borderTop: '1px solid var(--hairline-1)',
          display: 'flex',
          justifyContent: 'flex-end',
          background: 'var(--bg-forensic-1)',
        }}
      >
        <button
          type="button"
          onClick={onClose}
          className="fx-btn-subtle"
          style={{ background: 'transparent' }}
        >
          CERRAR
        </button>
      </div>
    </dialog>
  )
}
