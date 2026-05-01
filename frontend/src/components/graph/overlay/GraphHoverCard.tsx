// frontend/src/components/graph/overlay/GraphHoverCard.tsx
import { useEffect, useRef } from 'react'
import type { GraphNode } from '../types'

interface Props {
  node: GraphNode | null
  /** mouse coords en viewport (clientX/clientY) */
  x: number
  y: number
}

/**
 * Card flotante anclada al cursor + 12px offset. RAF-throttled.
 * Posición se actualiza imperativamente vía transform (no React state per pixel).
 */
export function GraphHoverCard({ node, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const posRef = useRef({ x, y })
  posRef.current = { x, y }

  useEffect(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = ref.current
      if (el) el.style.transform = `translate(${posRef.current.x + 12}px, ${posRef.current.y + 12}px)`
    })
  }, [x, y])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 1000,
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--hairline-2)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-2) var(--space-3)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        opacity: node ? 1 : 0,
        transition: 'opacity var(--motion-fast) var(--ease-out)',
        maxWidth: 240,
        boxShadow: 'var(--elevation-2)',
      }}
    >
      {node && (
        <>
          <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 2 }}>{node.label}</div>
          {node.subtitle && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {node.subtitle}
            </div>
          )}
        </>
      )}
    </div>
  )
}
