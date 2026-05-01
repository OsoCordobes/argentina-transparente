// frontend/src/components/graph/overlay/GraphSidebar.tsx
import { useEffect } from 'react'
import type { GraphNode } from '../types'

interface Props {
  open: boolean
  node: GraphNode | null
  onClose: () => void
  /** contenido inyectado por el adapter (KPIs, etc.) */
  children?: React.ReactNode
}

export function GraphSidebar({ open, node, onClose, children }: Props) {
  // Close on Esc
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  return (
    <aside
      style={{
        position: 'fixed',
        top: 'var(--header-h, 42px)',
        right: 0,
        width: 340,
        bottom: 0,
        background: 'var(--surface-raised)',
        borderLeft: '1px solid var(--hairline-2)',
        boxShadow: 'var(--elevation-3)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform var(--motion-normal) var(--ease-out)',
        zIndex: 'var(--z-search, 500)',
        overflow: 'auto',
        padding: 'var(--space-5)',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'transparent',
          border: '1px solid var(--hairline-2)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
        }}
        aria-label="Cerrar (Esc)"
      >
        ×
      </button>
      {node && (
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase' }}>
            {node.type}
          </div>
          <h2 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: 'var(--space-1) 0 var(--space-3)', fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-semibold)' }}>
            {node.label}
          </h2>
          {node.subtitle && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {node.subtitle}
            </div>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--hairline-2)', margin: 'var(--space-4) 0' }} />
          {children}
        </div>
      )}
    </aside>
  )
}
