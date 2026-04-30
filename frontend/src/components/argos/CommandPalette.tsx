/**
 * CommandPalette — overlay flotante global para búsqueda rápida.
 *
 * Atajo: ⌘K / Ctrl+K en cualquier ruta abre el palette.
 * Esc o click backdrop cierran.
 *
 * Datos: usa `useActoresSearch` (existente) con debounce 200ms.
 * Click en hit: navega al perfil correspondiente
 *  - tipo === 'empresa' o 'proveedor' con CUIT 11 dígitos → /empresa/<cuit>
 *  - tipo === 'director' o 'funcionario' con DNI dígitos → /persona/<dni>
 *  - resto: usa el href del backend
 *
 * Navegación por teclado: ↑↓ navega lista, Enter selecciona.
 */
import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useActoresSearch } from '@/lib/queries'
import type { ActorSearchHit } from '@/lib/queries'
import { Glyph, Kbd } from './forensic/Primitives'
import '@/styles/argos-forensic.css'

interface Props {
  open: boolean
  onClose: () => void
}

export function CommandPalette({ open, onClose }: Props) {
  const dialogRef = useRef<HTMLDialogElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const navigate = useNavigate()
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [activeIdx, setActiveIdx] = useState(0)

  // Debounce 200ms
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 200)
    return () => clearTimeout(t)
  }, [q])

  // Reset índice al cambiar la query
  useEffect(() => {
    setActiveIdx(0)
  }, [debouncedQ])

  const { data, isFetching } = useActoresSearch(debouncedQ, 'todos')
  const hits = (data?.hits ?? []).slice(0, 10)

  // Open / close del <dialog>
  useEffect(() => {
    const d = dialogRef.current
    if (!d) return
    if (open && !d.open) {
      d.showModal()
      // focus el input al abrir
      setTimeout(() => inputRef.current?.focus(), 30)
    }
    if (!open && d.open) d.close()
  }, [open])

  // Limpiar input al cerrar
  useEffect(() => {
    if (!open) {
      setQ('')
      setDebouncedQ('')
    }
  }, [open])

  // Esc cierra
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

  const navigateToHit = (h: ActorSearchHit) => {
    onClose()
    if ((h.tipo === 'empresa' || h.tipo === 'proveedor') && h.identificador && /^\d{11}$/.test(h.identificador)) {
      navigate(`/empresa/${h.identificador}`)
      return
    }
    if ((h.tipo === 'director' || h.tipo === 'funcionario') && h.identificador && /^\d{6,8}$/.test(h.identificador)) {
      navigate(`/persona/${h.identificador}`)
      return
    }
    if (h.href) {
      navigate(h.href)
    }
  }

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActiveIdx((i) => Math.min(hits.length - 1, i + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActiveIdx((i) => Math.max(0, i - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const h = hits[activeIdx]
      if (h) navigateToHit(h)
    }
  }

  const glyphFor = (t: ActorSearchHit['tipo']) =>
    t === 'empresa' || t === 'proveedor' ? 'PJ' : 'PF'

  return (
    <dialog
      ref={dialogRef}
      onClick={(e) => {
        if (e.target === dialogRef.current) onClose()
      }}
      style={{
        background: 'var(--bg-forensic-1)',
        color: 'var(--text-1)',
        border: '1px solid var(--hairline-2)',
        padding: 0,
        width: 640,
        maxWidth: '92vw',
        fontFamily: 'var(--font-sans)',
        marginTop: '12vh',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 12,
          padding: '14px 16px',
          borderBottom: '1px solid var(--hairline-1)',
          background: 'var(--bg-forensic-1)',
        }}
      >
        <span
          style={{
            fontFamily: 'var(--font-mono)',
            fontSize: 9.5,
            color: 'var(--text-3)',
            letterSpacing: '0.16em',
            textTransform: 'uppercase',
          }}
        >
          QUERY
        </span>
        <input
          ref={inputRef}
          type="text"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Buscá por nombre, DNI, CUIT, razón social…"
          style={{
            flex: 1,
            background: 'transparent',
            border: 'none',
            outline: 'none',
            color: 'var(--text-1)',
            fontSize: 13,
            fontFamily: 'var(--font-sans)',
          }}
        />
        <Kbd>esc</Kbd>
      </div>

      <div style={{ maxHeight: '60vh', overflowY: 'auto' }}>
        {isFetching && q.length >= 2 && (
          <div
            style={{
              padding: '14px 16px',
              fontSize: 11,
              color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
            }}
          >
            buscando…
          </div>
        )}

        {!isFetching && q.length >= 2 && hits.length === 0 && (
          <div
            style={{
              padding: '14px 16px',
              fontSize: 12,
              color: 'var(--text-2)',
            }}
          >
            Sin resultados para "{q}".
          </div>
        )}

        {hits.length > 0 && (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {hits.map((h, i) => (
              <li
                key={`${h.tipo}-${h.identificador ?? h.nombre}-${i}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={() => navigateToHit(h)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  padding: '10px 16px',
                  borderBottom: '1px solid var(--hairline-soft)',
                  cursor: 'pointer',
                  background: activeIdx === i ? 'var(--bg-forensic-2)' : 'transparent',
                  borderLeft: activeIdx === i ? `2px solid var(--select)` : '2px solid transparent',
                }}
              >
                <Glyph kind={glyphFor(h.tipo)} size={7} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 12.5,
                      color: 'var(--text-1)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {h.nombre}
                  </div>
                  <div
                    style={{
                      fontSize: 10,
                      color: 'var(--text-3)',
                      fontFamily: 'var(--font-mono)',
                      letterSpacing: '0.04em',
                      marginTop: 1,
                    }}
                  >
                    {h.tipo} · {h.identificador ?? '—'} {h.jurisdiccion ? `· ${h.jurisdiccion}` : ''}
                  </div>
                </div>
                <span style={{ color: 'var(--text-3)', fontSize: 11 }}>›</span>
              </li>
            ))}
          </ul>
        )}

        {q.length < 2 && (
          <div
            style={{
              padding: '20px 16px',
              fontSize: 11,
              color: 'var(--text-3)',
              fontFamily: 'var(--font-mono)',
              letterSpacing: '0.04em',
              lineHeight: 1.6,
            }}
          >
            Escribí 2+ caracteres para buscar. <Kbd>↑</Kbd> <Kbd>↓</Kbd> navegar · <Kbd>↵</Kbd> abrir · <Kbd>esc</Kbd> cerrar.
          </div>
        )}
      </div>
    </dialog>
  )
}
