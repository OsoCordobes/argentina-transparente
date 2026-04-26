/**
 * ChatThread.tsx — Argos v2.0 migration
 *
 * Renderiza un thread de chat con 3 modos (collapsed/expanded/minimized),
 * parsea entity chips inline `[[node:id]]` en mensajes assistant, y soporta
 * markdown ligero (**bold**, *italic*, \n).
 *
 * Migrado pixel-perfect desde `.tmp-argos-v2/argos/chat.jsx` — classNames y
 * SVG paths idénticos al prototipo. Adaptaciones TS:
 *   - `window.ArgosMock.GRAPH` → prop `graph: ArgosGraph` (resolver explícito).
 *   - `window.Ico` → import desde `@/components/argos/ArgosIcons`.
 */

import { memo, useEffect, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type {
  ArgosGraph,
  ChatFadeLevel,
  ChatMessage,
  ChatThreadMode,
} from '@/lib/argos/types'
import { Ico } from '@/components/argos/ArgosIcons'

// ─── renderBody — parsea chips + markdown inline ───────────────────────────
// Función interna (no exportada). Retorna un array de elementos React.

type Part = { type: 'text'; value: string } | { type: 'chip'; id: string }

function renderBody(
  text: string,
  onChipHover: (id: string | null) => void,
  onChipClick: (id: string) => void,
  graph: ArgosGraph,
): ReactNode[] {
  const parts: Part[] = []
  const regex = /\[\[node:([^\]]+)\]\]/g
  let last = 0
  let m: RegExpExecArray | null
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push({ type: 'text', value: text.slice(last, m.index) })
    parts.push({ type: 'chip', id: m[1] })
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push({ type: 'text', value: text.slice(last) })

  const renderText = (t: string, key: number): ReactNode[] => {
    const out: ReactNode[] = []
    let i = 0
    let k = 0
    const push = (el: ReactNode) => {
      out.push(<span key={`${key}-${k++}`}>{el}</span>)
    }
    while (i < t.length) {
      if (t.slice(i, i + 2) === '**') {
        const end = t.indexOf('**', i + 2)
        if (end > 0) {
          push(<strong>{t.slice(i + 2, end)}</strong>)
          i = end + 2
          continue
        }
      }
      if (t[i] === '*') {
        const end = t.indexOf('*', i + 1)
        if (end > 0) {
          push(<em>{t.slice(i + 1, end)}</em>)
          i = end + 1
          continue
        }
      }
      if (t[i] === '\n') {
        push(<br />)
        i++
        continue
      }
      const next = (() => {
        let p = i
        while (p < t.length && t[p] !== '*' && t[p] !== '\n') p++
        return p
      })()
      push(t.slice(i, next))
      i = next
    }
    return out
  }

  return parts.map((p, i) => {
    if (p.type === 'text') return <span key={i}>{renderText(p.value, i)}</span>
    const node = graph.nodes.find((n) => n.id === p.id)
    if (!node) return <span key={i} style={{ color: 'var(--text-3)' }}>[{p.id}]</span>
    const cls = node.type === 'señal' ? 't-senal' : `t-${node.type}`
    const label = node.label.length > 28 ? node.label.slice(0, 26) + '…' : node.label
    return (
      <span
        key={i}
        className={`entity-chip ${cls}`}
        onMouseEnter={() => onChipHover(node.id)}
        onMouseLeave={() => onChipHover(null)}
        onClick={() => onChipClick(node.id)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter') onChipClick(node.id)
        }}
      >
        {label}
      </span>
    )
  })
}

// ─── Props ─────────────────────────────────────────────────────────────────

export interface ChatThreadProps {
  thread: ChatMessage[]
  streaming: boolean
  fade: ChatFadeLevel
  graph: ArgosGraph
  onChipHover: (id: string | null) => void
  onChipClick: (id: string) => void
  onMouseEnter?: () => void
  onMouseLeave?: () => void
  onClear: () => void
}

// ─── Componente principal ──────────────────────────────────────────────────

export const ChatThread = memo(function ChatThread({
  thread,
  streaming,
  fade,
  graph,
  onChipHover,
  onChipClick,
  onMouseEnter,
  onMouseLeave,
  onClear,
}: ChatThreadProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [mode, setMode] = useState<ChatThreadMode>('collapsed')
  const [entered, setEntered] = useState(false)

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight
  }, [thread.length, streaming, mode])

  // entry: keyframe `thread-in` fires on mount (550ms with hold).
  // Wait for it to finish before letting fade-* classes take over.
  useEffect(() => {
    if (thread.length > 0 && !entered) {
      const t = setTimeout(() => setEntered(true), 580)
      return () => clearTimeout(t)
    }
  }, [thread.length, entered])

  if (!thread.length) return null

  const fadeClass =
    fade === 'hover-graph' ? 'fade-graph' : fade === 'idle' ? 'fade-idle' : 'fade-active'

  // In expanded/minimized, ignore fade
  const effectiveFadeClass =
    mode === 'expanded' || mode === 'minimized' ? 'fade-fixed' : fadeClass

  // MINIMIZED
  if (mode === 'minimized') {
    return (
      <div
        className={`thread thread-minimized ${entered ? 'visible' : ''} ${
          entered ? 'is-entered' : ''
        } ${thread.length > 2 ? 'has-history' : ''}`}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
      >
        <button className="thread-min-btn" onClick={() => setMode('collapsed')}>
          <span className="dot-live" />
          <span className="lbl">
            ARGOS · {thread.length} mensaje{thread.length === 1 ? '' : 's'}
          </span>
          <Ico.Network size={14} />
        </button>
      </div>
    )
  }

  // COLLAPSED / EXPANDED
  const showLastN = mode === 'expanded' ? thread.length : Math.min(thread.length, 4)
  const slice = thread.slice(thread.length - showLastN)
  const hasOverflow = thread.length > showLastN

  return (
    <div
      className={`thread thread-${mode} ${entered ? 'visible' : ''} ${effectiveFadeClass} ${
        entered ? 'is-entered' : ''
      } ${thread.length > 2 ? 'has-history' : ''}`}
      aria-live="polite"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <div className="thread-head">
        <div className="thread-head-left">
          <span className={`tdot ${streaming ? 'streaming' : ''}`} />
          <span className="thead-title">ARGOS</span>
          <span className="thead-sub">
            · {streaming ? 'investigando…' : 'investigación activa'}
          </span>
        </div>
        <div className="thread-head-right">
          <button
            className="thead-btn"
            aria-label="Minimizar"
            title="Minimizar"
            onClick={() => setMode('minimized')}
          >
            <svg width="11" height="11" viewBox="0 0 11 11">
              <line
                x1="2"
                y1="6"
                x2="9"
                y2="6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
          <button
            className="thead-btn"
            aria-label={mode === 'expanded' ? 'Contraer' : 'Expandir'}
            title={mode === 'expanded' ? 'Contraer' : 'Expandir'}
            onClick={() => setMode(mode === 'expanded' ? 'collapsed' : 'expanded')}
          >
            {mode === 'expanded' ? (
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path
                  d="M3 3h2v1H4v1H3V3zM8 3v2H7V4H6V3h2zM3 8h2v-1H4V6H3v2zM8 8V6H7v1H6v1h2z"
                  fill="currentColor"
                />
              </svg>
            ) : (
              <svg width="11" height="11" viewBox="0 0 11 11">
                <path
                  d="M2 2h3v1H3v2H2V2zM6 2v1h2v2h1V2H6zM2 9h3v-1H3V6H2v3zM9 9V6H8v2H6v1h3z"
                  fill="currentColor"
                />
              </svg>
            )}
          </button>
          <button
            className="thead-btn"
            aria-label="Limpiar"
            title="Limpiar"
            onClick={onClear}
          >
            <svg width="11" height="11" viewBox="0 0 11 11">
              <path
                d="M2.5 2.5l6 6m0-6l-6 6"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
      </div>
      <div className="messages" ref={ref}>
        {hasOverflow && mode !== 'expanded' && (
          <div className="thread-more">
            <button onClick={() => setMode('expanded')}>
              Ver conversación completa ({thread.length})
            </button>
          </div>
        )}
        {slice.map((m, i) => {
          const realIdx = thread.length - showLastN + i
          return (
            <div key={realIdx} className={`msg ${m.role}`}>
              <div className="role">{m.role === 'user' ? 'Tú' : 'ARGOS'}</div>
              <div className="body">
                {m.role === 'assistant'
                  ? renderBody(m.content, onChipHover, onChipClick, graph)
                  : m.content}
                {streaming &&
                  realIdx === thread.length - 1 &&
                  m.role === 'assistant' && <span className="typing-cursor" />}
              </div>
            </div>
          )
        })}
        {streaming && thread[thread.length - 1]?.role === 'user' && (
          <div className="msg assistant">
            <div className="role">ARGOS</div>
            <div className="body">
              <span className="typing-dots">
                <span />
                <span />
                <span />
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  )
})
