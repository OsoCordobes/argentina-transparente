// frontend/src/components/HomeGraph/GraphSearch.tsx
//
// Search inline (⌘K / Ctrl-K) sobre los nodos del grafo. Cuando el usuario
// elige un resultado, la cámara vuela al nodo (camera.gotoNode con
// animación 700ms) y lo selecciona.
//
// Implementación: usamos los nodos cargados en sigma (graph.nodes()) como
// fuente — no es un fetch al backend porque ya tenemos todo en memoria.
// Para grafos más grandes (post Neo4j expansion) podemos enchufar
// /api/entidad/search.

import { useEffect, useMemo, useRef, useState } from 'react'
import { useCamera, useSigma } from '@react-sigma/core'
import type { GraphNodeAttrs } from './buildGraph'
import { ENTITY_COLORS } from './buildGraph'

interface Props {
  onSelect: (nodeId: string) => void
}

interface Match {
  id: string
  attrs: GraphNodeAttrs
  score: number
}

export function GraphSearch({ onSelect }: Props) {
  const sigma = useSigma()
  const { gotoNode } = useCamera({ duration: 720 })

  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)

  // ⌘K / Ctrl-K abre el search; Esc lo cierra.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen(true)
      } else if (e.key === 'Escape') {
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (open) setTimeout(() => inputRef.current?.focus(), 30)
  }, [open])

  const matches: Match[] = useMemo(() => {
    if (!open) return []
    const q = query.trim().toLowerCase()
    const graph = sigma.getGraph()
    const out: Match[] = []
    graph.forEachNode((id, attrs) => {
      const a = attrs as GraphNodeAttrs
      const label = (a.label ?? '').toLowerCase()
      const sub = (a.subtitle ?? '').toLowerCase()
      if (!q) {
        // sin query → top 10 por monto
        out.push({ id, attrs: a, score: a.monto || a.size })
        return
      }
      let score = 0
      if (label === q) score += 100
      if (label.startsWith(q)) score += 50
      if (label.includes(q)) score += 20
      if (sub.includes(q)) score += 5
      if (score > 0) out.push({ id, attrs: a, score })
    })
    out.sort((a, b) => b.score - a.score)
    return out.slice(0, 8)
  }, [query, open, sigma])

  // Reset activeIdx cuando cambian los matches
  useEffect(() => { setActiveIdx(0) }, [query])

  function pick(m: Match) {
    setOpen(false)
    setQuery('')
    onSelect(m.id)
    // pequeño delay para que el panel se monte antes de la animación
    requestAnimationFrame(() => gotoNode(m.id))
  }

  function onInputKey(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx(i => Math.min(i + 1, matches.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx(i => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const m = matches[activeIdx]
      if (m) pick(m)
    }
  }

  return (
    <>
      {/* Botón flotante para abrir search (alternativa a ⌘K) */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Buscar nodo"
        style={{
          position: 'absolute',
          top: 18,
          right: 18,
          background: 'rgba(15, 22, 38, 0.78)',
          backdropFilter: 'blur(12px)',
          WebkitBackdropFilter: 'blur(12px)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          color: '#CBD5E1',
          padding: '8px 14px',
          borderRadius: 6,
          cursor: 'pointer',
          fontFamily: '"Geist Mono", monospace',
          fontSize: 11,
          letterSpacing: '0.1em',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          zIndex: 90,
          transition: 'background 140ms',
        }}
      >
        <span>⌕ buscar</span>
        <span style={{ color: '#64748B', fontSize: 9, padding: '2px 6px', border: '1px solid #334155', borderRadius: 3 }}>⌘K</span>
      </button>

      {/* Modal search */}
      {open && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: 'rgba(2, 4, 10, 0.55)',
            backdropFilter: 'blur(4px)',
            zIndex: 200,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'center',
            paddingTop: '12vh',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false) }}
        >
          <div
            style={{
              width: 520,
              maxWidth: '90vw',
              background: 'rgba(15, 22, 38, 0.96)',
              border: '1px solid rgba(148, 163, 184, 0.24)',
              borderRadius: 8,
              boxShadow: '0 20px 60px rgba(0,0,0,0.6)',
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                padding: '14px 18px',
                borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
                display: 'flex',
                alignItems: 'center',
                gap: 12,
              }}
            >
              <span style={{ color: '#64748B', fontSize: 16 }}>⌕</span>
              <input
                ref={inputRef}
                type="text"
                placeholder="Buscar entidad… (nombre, repartición, empresa)"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onKeyDown={onInputKey}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  color: '#E5E7EB',
                  fontFamily: '"Geist", system-ui, sans-serif',
                  fontSize: 15,
                  letterSpacing: '-0.01em',
                }}
              />
              <span style={{ color: '#475569', fontSize: 9, padding: '2px 6px', border: '1px solid #334155', borderRadius: 3, fontFamily: 'monospace' }}>
                ESC
              </span>
            </div>
            <div style={{ maxHeight: 360, overflow: 'auto', padding: '6px 0' }}>
              {matches.length === 0 ? (
                <div style={{ padding: '24px 18px', color: '#64748B', fontSize: 12, fontFamily: '"Geist Mono", monospace' }}>
                  Sin resultados.
                </div>
              ) : (
                matches.map((m, i) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => pick(m)}
                    onMouseEnter={() => setActiveIdx(i)}
                    style={{
                      width: '100%',
                      display: 'flex',
                      alignItems: 'center',
                      gap: 12,
                      padding: '10px 18px',
                      background: i === activeIdx ? 'rgba(74, 158, 255, 0.10)' : 'transparent',
                      border: 'none',
                      borderLeft: i === activeIdx ? '2px solid #4A9EFF' : '2px solid transparent',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                  >
                    <span
                      style={{
                        width: 10,
                        height: 10,
                        borderRadius: '50%',
                        background: ENTITY_COLORS[m.attrs.entityType],
                        boxShadow: `0 0 8px ${ENTITY_COLORS[m.attrs.entityType]}55`,
                        flex: '0 0 10px',
                      }}
                    />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div
                        style={{
                          color: '#E5E7EB',
                          fontFamily: '"Geist", system-ui, sans-serif',
                          fontSize: 13,
                          fontWeight: 500,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {m.attrs.label}
                      </div>
                      <div
                        style={{
                          color: '#64748B',
                          fontFamily: '"Geist Mono", monospace',
                          fontSize: 10.5,
                          marginTop: 1,
                        }}
                      >
                        {m.attrs.subtitle}
                      </div>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
