/**
 * ExplorarLayout.tsx
 *
 * Shell del modo Explorar (Argos v2.0, pixel-perfect del zip).
 * Migrado de `argos/app.jsx` del zip ARGOS v2.0.
 *
 * Estructura:
 * - Sidebar (brand + nav + ChatThread embed cuando hay mensajes + footer)
 * - Main: Header (breadcrumb + labels toggle) + canvas-wrap (Hero + GraphCanvas + Input + Panel)
 * - O PlaceholderSection si no estás en inicio/mapa
 *
 * State machine: useReducer con 14 acciones (ver `reducer` abajo).
 * Stream coalescing: rAF buffer en `makeChunkBuffer`.
 */

import { useReducer, useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { GraphCanvas } from './GraphCanvas'
import { NodeDetailPanel } from './NodeDetailPanel'
import { Ico } from './ArgosIcons'
import argosApi from '@/lib/argos/api'
import {
  saveThread,
  loadThread,
  clearThread,
  parseDeeplink,
  buildDeeplinkUrl,
  consumeDeeplinkParams,
} from '@/lib/argos/chat-persist'
import { copyToClipboard } from '@/lib/argos/sumario'
import type {
  ArgosGraph,
  ArgosNode,
  ArgosNodeType,
  ChatMessage,
  ChatChunk,
  ChatFadeLevel,
  NodeDetail,
} from '@/lib/argos/types'

// ─── Constantes UI ────────────────────────────────────────────────────────────

interface SectionDef {
  id: SectionId
  label: string
  icon: typeof Ico.Home
}
type SectionId = 'inicio' | 'mapa' | 'expedientes' | 'señales' | 'fuentes' | 'acerca'

const SECTIONS: SectionDef[] = [
  { id: 'inicio', label: 'Inicio', icon: Ico.Home },
  { id: 'mapa', label: 'Mapa', icon: Ico.Network },
  { id: 'expedientes', label: 'Expedientes', icon: Ico.FileText },
  { id: 'señales', label: 'Señales', icon: Ico.Alert },
  { id: 'fuentes', label: 'Fuentes', icon: Ico.Database },
  { id: 'acerca', label: 'Acerca de', icon: Ico.Info },
]

const SUGGESTIONS_BY_TYPE: Record<ArgosNodeType, string[]> = {
  proveedor: [
    '¿Tiene señales activas?',
    '¿Quiénes son sus directores?',
    '¿Cómo evolucionó su facturación?',
    '¿Hay otros proveedores similares?',
  ],
  jurisdiccion: [
    '¿Cuáles son las señales más graves?',
    '¿Qué proveedores concentran el gasto?',
    '¿Cómo evolucionó el gasto anual?',
  ],
  director: [
    '¿En qué otras empresas figura?',
    '¿Esas empresas compiten entre sí?',
  ],
  señal: [
    'Explicame esta señal en detalle',
    '¿Qué evidencia hay?',
    '¿Dónde se denuncia?',
  ],
  contrato: [
    '¿Quién es el proveedor?',
    '¿Hay otros contratos similares?',
  ],
}

const SUGGESTIONS = [
  '¿Qué proveedores concentran el gasto en Córdoba?',
  'Mostrame las señales de riesgo más graves',
  'CUIT 30-71234567-8',
  'Directores compartidos entre empresas',
]

const PLACEHOLDERS = [
  'Preguntale a ARGOS por un municipio, proveedor o CUIT…',
  'Ej: "¿Quién concentra el rubro pavimentación en Córdoba?"',
  'Pegá un CUIT o nombre de empresa…',
  'Ej: "Mostrame las señales graves del 2023"',
]

// ─── State machine ────────────────────────────────────────────────────────────

interface AppState {
  graph: ArgosGraph
  focusedNodeId: string | null
  hoveredNodeId: string | null
  selectedNodeId: string | null
  highlightedNodeIds: Set<string>
  searchQuery: string
  isSearching: boolean
  chat: {
    thread: ChatMessage[]
    streaming: boolean
    fadeLevel: ChatFadeLevel
  }
  panel: {
    open: boolean
    detail: NodeDetail | null
    loading: boolean
  }
  sidebar: SectionId
}

type AppAction =
  | { t: 'GRAPH_LOADED'; payload: ArgosGraph }
  | { t: 'THREAD_RESTORED'; thread: ChatMessage[] }
  | { t: 'SEARCH_SUBMIT'; query: string }
  | { t: 'FOCUS_NODE'; id: string | null }
  | { t: 'HOVER_NODE'; id: string | null }
  | { t: 'SELECT_NODE'; id: string }
  | { t: 'PANEL_DETAIL_LOADED'; detail: NodeDetail | null }
  | { t: 'PANEL_CLOSE' }
  | { t: 'CHAT_USER_MSG'; content: string }
  | { t: 'CHAT_CHUNK'; chunk: ChatChunk }
  | { t: 'CHAT_FADE'; level: ChatFadeLevel }
  | { t: 'NAV'; section: SectionId }
  | { t: 'CLEAR' }
  | { t: 'CLEAR_CHAT' }
  | { t: 'HIGHLIGHT_ONE'; id: string | null }

const initialState: AppState = {
  graph: { nodes: [], edges: [] },
  focusedNodeId: null,
  hoveredNodeId: null,
  selectedNodeId: null,
  highlightedNodeIds: new Set(),
  searchQuery: '',
  isSearching: false,
  chat: { thread: [], streaming: false, fadeLevel: 'idle' },
  panel: { open: false, detail: null, loading: false },
  sidebar: 'inicio',
}

function reducer(state: AppState, a: AppAction): AppState {
  switch (a.t) {
    case 'GRAPH_LOADED':
      return { ...state, graph: a.payload }
    case 'SEARCH_SUBMIT':
      return { ...state, searchQuery: a.query, isSearching: true }
    case 'FOCUS_NODE':
      return { ...state, focusedNodeId: a.id }
    case 'HOVER_NODE':
      return { ...state, hoveredNodeId: a.id }
    case 'SELECT_NODE':
      return {
        ...state,
        selectedNodeId: a.id,
        focusedNodeId: a.id,
        panel: { open: true, loading: true, detail: null },
      }
    case 'PANEL_DETAIL_LOADED':
      return { ...state, panel: { open: true, loading: false, detail: a.detail } }
    case 'PANEL_CLOSE':
      return {
        ...state,
        panel: { open: false, loading: false, detail: null },
        selectedNodeId: null,
      }
    case 'CHAT_USER_MSG':
      return {
        ...state,
        chat: {
          ...state.chat,
          thread: [
            ...state.chat.thread,
            { role: 'user', content: a.content, ts: Date.now() },
            { role: 'assistant', content: '', ts: Date.now() },
          ],
          streaming: true,
          fadeLevel: 'typing',
        },
        isSearching: true,
      }
    case 'CHAT_CHUNK': {
      const t = [...state.chat.thread]
      const last = t[t.length - 1]
      if (a.chunk.delta && last?.role === 'assistant') {
        t[t.length - 1] = { ...last, content: last.content + a.chunk.delta }
      }
      let h = state.highlightedNodeIds
      if (a.chunk.entidades?.length) {
        h = new Set(a.chunk.entidades.map((e) => e.id))
      }
      let focused = state.focusedNodeId
      if (a.chunk.focus?.nodeId) focused = a.chunk.focus.nodeId
      const streaming = !a.chunk.done
      return {
        ...state,
        chat: { ...state.chat, thread: t, streaming, fadeLevel: streaming ? 'typing' : 'idle' },
        highlightedNodeIds: h,
        focusedNodeId: focused,
        isSearching: false,
      }
    }
    case 'CHAT_FADE':
      return { ...state, chat: { ...state.chat, fadeLevel: a.level } }
    case 'NAV':
      return { ...state, sidebar: a.section }
    case 'CLEAR':
      return {
        ...state,
        searchQuery: '',
        focusedNodeId: null,
        highlightedNodeIds: new Set(),
      }
    case 'THREAD_RESTORED':
      return {
        ...state,
        chat: {
          thread: a.thread,
          streaming: false,
          fadeLevel: 'idle',
        },
      }
    case 'CLEAR_CHAT':
      return {
        ...state,
        chat: { thread: [], streaming: false, fadeLevel: 'idle' },
        highlightedNodeIds: new Set(),
      }
    case 'HIGHLIGHT_ONE': {
      const h = new Set(state.highlightedNodeIds)
      if (a.id) h.add(a.id)
      else h.clear()
      return { ...state, highlightedNodeIds: h }
    }
    default:
      return state
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeChunkBuffer(dispatch: (a: AppAction) => void) {
  let pending: ChatChunk | null = null
  let raf: number | null = null
  return (chunk: ChatChunk) => {
    if (!pending) pending = { delta: '' }
    if (chunk.delta) pending.delta = (pending.delta ?? '') + chunk.delta
    if (chunk.entidades) pending.entidades = chunk.entidades
    if (chunk.focus) pending.focus = chunk.focus
    if (chunk.done) pending.done = true
    if (raf !== null) return
    raf = requestAnimationFrame(() => {
      const out = pending
      pending = null
      raf = null
      if (out) {
        try {
          dispatch({ t: 'CHAT_CHUNK', chunk: out })
        } catch (err) {
          // eslint-disable-next-line no-console
          console.error('[ARGOS] dispatch error', err)
        }
      }
    })
  }
}

// ─── Sidebar ──────────────────────────────────────────────────────────────────

// ─── SidebarChat (chat embedido en el sidebar — pixel-perfect del zip) ─────

interface SidebarChatProps {
  thread: ChatMessage[]
  streaming: boolean
  graph: ArgosGraph
  focusedNodeId: string | null
  onChipHover: (id: string | null) => void
  onChipClick: (id: string) => void
  onClear: () => void
}

function renderInlineBody(
  text: string,
  graph: ArgosGraph,
  onChipHover: (id: string | null) => void,
  onChipClick: (id: string) => void,
): React.ReactNode {
  const parts: React.ReactNode[] = []
  const regex = /\[\[node:([^\]]+)\]\]/g
  let last = 0
  let m: RegExpExecArray | null
  let key = 0
  while ((m = regex.exec(text))) {
    if (m.index > last) parts.push(<span key={key++}>{text.slice(last, m.index)}</span>)
    const id = m[1]
    const node = graph.nodes.find((n) => n.id === id)
    if (node) {
      const cls = node.type === 'señal' ? 't-senal' : `t-${node.type}`
      parts.push(
        <span
          key={key++}
          className={`entity-chip ${cls}`}
          onMouseEnter={() => onChipHover(node.id)}
          onMouseLeave={() => onChipHover(null)}
          onClick={() => onChipClick(node.id)}
          role="button"
          tabIndex={0}
        >
          {node.label.length > 28 ? node.label.slice(0, 26) + '…' : node.label}
        </span>,
      )
    } else {
      parts.push(
        <span key={key++} style={{ color: 'var(--text-3)' }}>
          [{id}]
        </span>,
      )
    }
    last = m.index + m[0].length
  }
  if (last < text.length) parts.push(<span key={key++}>{text.slice(last)}</span>)
  return parts
}

function SidebarChat({
  thread, streaming, graph, focusedNodeId,
  onChipHover, onChipClick, onClear,
}: SidebarChatProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [shareStatus, setShareStatus] = useState<'idle' | 'ok'>('idle')
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight
  }, [thread.length, streaming, thread[thread.length - 1]?.content])

  // Feature E — botón "Compartir vista" copia URL deeplink
  const handleShare = async () => {
    const lastUser = [...thread].reverse().find((m) => m.role === 'user')
    const url = buildDeeplinkUrl({
      focusNodeId: focusedNodeId,
      query: lastUser?.content,
    })
    const ok = await copyToClipboard(url)
    if (ok) {
      setShareStatus('ok')
      setTimeout(() => setShareStatus('idle'), 1800)
    }
  }

  if (thread.length === 0) return null

  return (
    <div ref={scrollRef} className="sidebar-chat" aria-live="polite">
      <div
        className="thread-head"
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          padding: '8px 14px',
          borderBottom: '1px solid var(--stroke)',
          fontSize: 11,
          color: 'var(--text-3)',
        }}
      >
        <span>
          <span className={`tdot ${streaming ? 'streaming' : ''}`} />{' '}
          ARGOS · {streaming ? 'investigando…' : `${thread.length} mensaje${thread.length === 1 ? '' : 's'}`}
        </span>
        <span style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={handleShare}
            className="thead-btn"
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11 }}
            title="Copiar link compartible al portapapeles (incluye foco actual + última pregunta)"
          >
            {shareStatus === 'ok' ? '✓ Link copiado' : 'Compartir'}
          </button>
          <button
            onClick={onClear}
            className="thead-btn"
            style={{ background: 'transparent', border: 'none', color: 'inherit', cursor: 'pointer', fontSize: 11 }}
            title="Limpiar conversación + localStorage"
          >
            Limpiar
          </button>
        </span>
      </div>
      {thread.map((m, i) => (
        <div key={i} className={`msg ${m.role}`}>
          <div className="role">{m.role === 'user' ? 'Vos' : 'ARGOS'}</div>
          <div className="body">
            {m.role === 'assistant'
              ? renderInlineBody(m.content || (streaming && i === thread.length - 1 ? '' : ''), graph, onChipHover, onChipClick)
              : m.content}
            {streaming && i === thread.length - 1 && m.role === 'assistant' && (
              !m.content
                ? <span className="typing-dots"><span/><span/><span/></span>
                : <span className="typing-cursor" />
            )}
          </div>
        </div>
      ))}
    </div>
  )
}

interface SidebarProps {
  active: SectionId
  onNav: (s: SectionId) => void
  hasChat: boolean
  hasHistory: boolean
  thread: ChatMessage[]
  streaming: boolean
  fadeLevel: ChatFadeLevel
  graph: ArgosGraph
  focusedNodeId: string | null
  onChipHover: (id: string | null) => void
  onChipClick: (id: string) => void
  onChatClear: () => void
  totalProv: number
  totalSenales: number
  totalJur: number
}

function Sidebar({
  active, onNav, hasChat, hasHistory, thread, streaming, fadeLevel, graph, focusedNodeId,
  onChipHover, onChipClick, onChatClear,
  totalProv, totalSenales, totalJur,
}: SidebarProps) {
  return (
    <aside className={`sidebar ${hasChat ? 'has-chat' : ''} ${hasHistory ? 'has-history' : ''}`}>
      <div className="brand">
        <ArgosMark size={30} />
        <div className="brand-text">
          <div className="name">ARGOS</div>
          <div className="tag">Inteligencia ciudadana</div>
        </div>
      </div>
      <nav className="nav" aria-label="Secciones">
        {SECTIONS.map((s) => {
          const I = s.icon
          return (
            <button
              key={s.id}
              className={`nav-item ${active === s.id ? 'active' : ''}`}
              onClick={() => onNav(s.id)}
              aria-current={active === s.id ? 'page' : undefined}
              title={s.label}
            >
              <I size={16} stroke={active === s.id ? '#6FB8E8' : 'currentColor'} sw={1.7} />
              <span className="l">{s.label}</span>
            </button>
          )
        })}
      </nav>
      {hasChat && (
        <SidebarChat
          thread={thread}
          streaming={streaming}
          graph={graph}
          focusedNodeId={focusedNodeId}
          onChipHover={onChipHover}
          onChipClick={onChipClick}
          onClear={onChatClear}
        />
      )}
      <div className="sidebar-foot">
        <div className="row" style={{ marginBottom: 6 }}>
          <span className="dot-live" /> <span className="text">Backend conectado</span>
        </div>
        <div className="text" style={{ color: 'var(--text-3)' }}>
          {totalJur} jurisdicciones · {totalProv} proveedores · {totalSenales} señales
        </div>
      </div>
    </aside>
  )
}

// ─── Logo ─────────────────────────────────────────────────────────────────────

function ArgosMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="iris" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6FB8E8" stopOpacity="1" />
          <stop offset="100%" stopColor="#6FB8E8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon
        points="16,2 28,8 28,24 16,30 4,24 4,8"
        fill="none"
        stroke="#6FB8E8"
        strokeWidth="1.4"
        opacity="0.85"
      />
      <polygon
        points="16,6 25,10 25,22 16,26 7,22 7,10"
        fill="none"
        stroke="#6FB8E8"
        strokeOpacity="0.35"
        strokeWidth="0.8"
      />
      <ellipse cx="16" cy="16" rx="8" ry="5" fill="none" stroke="#F5F7FA" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="3.2" fill="url(#iris)" />
      <circle cx="16" cy="16" r="1.6" fill="#F5F7FA" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 6
        const x1 = 16 + Math.cos(a) * 9
        const y1 = 16 + Math.sin(a) * 9
        const x2 = 16 + Math.cos(a) * 12
        const y2 = 16 + Math.sin(a) * 12
        return (
          <line
            key={i}
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke="#6FB8E8"
            strokeOpacity="0.4"
            strokeWidth="0.7"
          />
        )
      })}
    </svg>
  )
}

// ─── Header ───────────────────────────────────────────────────────────────────

interface HeaderProps {
  section: SectionId
  focusedNode: ArgosNode | null
  onClearFocus: () => void
  labelsMode: 'minimal' | 'all'
  labelsDepth: 1 | 2 | 3
  onLabelsToggle: () => void
  onLabelsDepth: (d: 1 | 2 | 3) => void
}

function Header({
  section, focusedNode, onClearFocus, labelsMode, labelsDepth, onLabelsToggle, onLabelsDepth,
}: HeaderProps) {
  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: 'long', year: 'numeric',
  })
  const sec = SECTIONS.find((s) => s.id === section)
  const showLabelsToggle = section === 'inicio' || section === 'mapa'
  return (
    <header className="header">
      <div className="crumb">
        <span>{sec?.label || 'Inicio'}</span>
        {focusedNode && (
          <>
            <span className="sep">/</span>
            <span className="now">
              {focusedNode.label.length > 40
                ? focusedNode.label.slice(0, 38) + '…'
                : focusedNode.label}
            </span>
            <button
              onClick={onClearFocus}
              className="x-btn"
              aria-label="Quitar foco"
              style={{ marginLeft: 4, width: 20, height: 20 }}
            >
              <Ico.X size={11} />
            </button>
          </>
        )}
      </div>
      <div className="header-right">
        {showLabelsToggle && (
          <div className="lbl-toggle">
            <button
              className={labelsMode === 'all' ? 'on' : ''}
              onClick={onLabelsToggle}
              aria-pressed={labelsMode === 'all'}
            >
              Mostrar nombres
            </button>
            {labelsMode === 'all' && (
              <div className="seg" role="group" aria-label="Profundidad de etiquetas">
                {[1, 2, 3].map((d) => (
                  <button
                    key={d}
                    className={labelsDepth === d ? 'on' : ''}
                    onClick={() => onLabelsDepth(d as 1 | 2 | 3)}
                  >
                    {d}°
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        <span className="pill">
          <span className="dot" /> Datos al {today}
        </span>
        <button className="x-btn" aria-label="Tema" style={{ width: 30, height: 30 }}>
          <Ico.Sun size={14} />
        </button>
      </div>
    </header>
  )
}

// ─── PlaceholderSection ───────────────────────────────────────────────────────

function PlaceholderSection({
  id, focusInput,
}: {
  id: SectionId
  focusInput: () => void
}) {
  const SEC = SECTIONS.find((s) => s.id === id)
  const I = SEC?.icon || Ico.Info
  return (
    <div className="section-view">
      <div className="box">
        <I size={42} stroke="#6FB8E8" sw={1.2} />
        <div className="soon" style={{ marginTop: 18 }}>● Próximamente</div>
        <h2>{SEC?.label}</h2>
        <p>
          Esta sección consolidará vistas tabulares y filtros sobre el grafo. Por ahora
          podés explorar todo desde{' '}
          <strong style={{ color: 'var(--celeste)' }}>Inicio</strong> y{' '}
          <strong style={{ color: 'var(--celeste)' }}>Mapa</strong>, o preguntarle directamente a ARGOS.
        </p>
        <button className="btn primary" style={{ marginTop: 18 }} onClick={focusInput}>
          Volver al chat
        </button>
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

interface ExplorarLayoutProps {
  graph: ArgosGraph
  isLoading: boolean
}

export function ExplorarLayout({ graph, isLoading }: ExplorarLayoutProps) {
  const [s, dispatch] = useReducer(reducer, initialState)
  const inputRef = useRef<HTMLInputElement>(null)
  const [phIdx, setPhIdx] = useState(0)
  const [draft, setDraft] = useState('')
  const [threadCursor, setThreadCursor] = useState<number | null>(null)
  // graphAsleep: empieza dormido, despierta en primer focus/submit/hover sostenido, no se vuelve a dormir
  const [graphAsleep, setGraphAsleep] = useState(true)
  const [chipIdx, setChipIdx] = useState(0)
  const [chipFading, setChipFading] = useState(false)
  const [labelsMode, setLabelsMode] = useState<'minimal' | 'all'>('minimal')
  const [labelsDepth, setLabelsDepth] = useState<1 | 2 | 3>(1)
  const [sending, setSending] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const chipHoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const wakeGraph = useCallback(() => setGraphAsleep(false), [])

  // Cargar grafo: SOLO desde el `graph` prop (real backend via /api/dashboard).
  // Si está vacío + !isLoading, mostramos empty state explícito en el render.
  // NUNCA caemos a fixtures sintéticos (CLAUDE.md §2).
  useEffect(() => {
    dispatch({ t: 'GRAPH_LOADED', payload: graph })
  }, [graph])

  // ─── Feature E — restore chat thread al montar (1 vez) ────────────────────
  // Hidrata desde localStorage. NO sobrescribe si user empezó a chatear ya.
  const hydratedRef = useRef(false)
  useEffect(() => {
    if (hydratedRef.current) return
    hydratedRef.current = true

    const saved = loadThread()
    if (saved.length > 0 && s.chat.thread.length === 0) {
      // Restore preservando timestamps originales — CHAT_USER_MSG + CHAT_CHUNK
      // generarían new Date.now() en cada uno, perdiendo los originales.
      dispatch({ t: 'THREAD_RESTORED', thread: saved })
    }

    // Procesar deeplink ?focus=&q= si vino en la URL
    const dl = parseDeeplink()
    if (dl.focusNodeId) {
      // Esperamos al graph estar cargado para enfocar — usamos timeout corto
      setTimeout(() => {
        dispatch({ t: 'SELECT_NODE', id: dl.focusNodeId! })
      }, 200)
    }
    if (dl.query && saved.length === 0) {
      // Auto-disparar la pregunta solo si no había chat previo (no spam)
      setTimeout(() => submit(dl.query!), 600)
    }
    // Consumir los params para que F5 no re-dispare
    if (dl.focusNodeId || dl.query) {
      consumeDeeplinkParams()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // ─── Feature E — persist thread cada vez que cambia ──────────────────────
  useEffect(() => {
    // No guardar mientras se está streaming (chunks parciales)
    if (s.chat.streaming) return
    saveThread(s.chat.thread)
  }, [s.chat.thread, s.chat.streaming])

  // Hero node: jurisdiccion con más señales graves
  const heroNodeId = useMemo(() => {
    if (!s.graph.nodes.length) return null
    const counts = new Map<string, number>()
    s.graph.edges.forEach((e) => {
      const sId = typeof e.source === 'string' ? e.source : e.source?.id
      const tId = typeof e.target === 'string' ? e.target : e.target?.id
      if (!sId || !tId) return
      ;[sId, tId].forEach((id) => {
        const node = s.graph.nodes.find((n) => n.id === id)
        if (!node || node.type !== 'jurisdiccion') return
        const otherId = id === sId ? tId : sId
        const other = s.graph.nodes.find((n) => n.id === otherId)
        if (other?.type === 'señal' && other.flags?.severidad === 'grave') {
          counts.set(id, (counts.get(id) || 0) + 1)
        }
      })
    })
    let best: string | null = null
    let bestN = -1
    s.graph.nodes
      .filter((n) => n.type === 'jurisdiccion')
      .forEach((n) => {
        const c = counts.get(n.id) || 0
        if (c > bestN) {
          bestN = c
          best = n.id
        }
      })
    if (!best || bestN === 0) {
      const j = s.graph.nodes
        .filter((n) => n.type === 'jurisdiccion')
        .sort((a, b) => (b.weight || 0) - (a.weight || 0))
      best = j[0]?.id ?? null
    }
    return best
  }, [s.graph])

  // Rotating placeholder
  useEffect(() => {
    const i = setInterval(() => setPhIdx((p) => (p + 1) % PLACEHOLDERS.length), 4500)
    return () => clearInterval(i)
  }, [])

  // Rotating chip (5s cycle, 250ms fade)
  useEffect(() => {
    if (s.chat.thread.length > 0) return
    const i = setInterval(() => {
      setChipFading(true)
      setTimeout(() => {
        setChipIdx((p) => (p + 1) % SUGGESTIONS.length)
        setChipFading(false)
      }, 250)
    }, 5000)
    return () => clearInterval(i)
  }, [s.chat.thread.length])

  // Cmd/Ctrl+K -> focus input  ; Esc -> close panel then clear ; ↑/↓ thread navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault()
        inputRef.current?.focus()
      }
      if (e.key === 'Escape') {
        if (s.panel.open) {
          /* panel handles its own */
        } else if (s.searchQuery || s.focusedNodeId) {
          dispatch({ t: 'CLEAR' })
        }
      }
      if (
        document.activeElement === inputRef.current &&
        (e.key === 'ArrowUp' || e.key === 'ArrowDown')
      ) {
        const userMsgs = s.chat.thread.filter((m) => m.role === 'user')
        if (!userMsgs.length) return
        e.preventDefault()
        let i = threadCursor == null ? userMsgs.length : threadCursor
        if (e.key === 'ArrowUp') i = Math.max(0, i - 1)
        else i = Math.min(userMsgs.length, i + 1)
        setThreadCursor(i)
        setDraft(i >= userMsgs.length ? '' : userMsgs[i].content)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [s.panel.open, s.searchQuery, s.focusedNodeId, s.chat.thread, threadCursor])

  // Load detail when SELECT_NODE
  useEffect(() => {
    if (!s.selectedNodeId) return
    let cancel = false
    const node = s.graph.nodes.find((n) => n.id === s.selectedNodeId)
    if (!node) return
    argosApi.getNodeDetail(node.type, node.id).then((d) => {
      if (!cancel) dispatch({ t: 'PANEL_DETAIL_LOADED', detail: d })
    })
    return () => {
      cancel = true
    }
  }, [s.selectedNodeId, s.graph.nodes])

  const submit = useCallback(
    (q: string) => {
      if (!q.trim()) return
      const isFirst = s.chat.thread.length === 0
      wakeGraph()
      dispatch({ t: 'CHAT_USER_MSG', content: q })
      setDraft('')
      setThreadCursor(null)
      if (isFirst) {
        setSending(true)
        setTimeout(() => setSending(false), 900)
      }
      const focusNode = s.focusedNodeId
        ? s.graph.nodes.find((n) => n.id === s.focusedNodeId)
        : null
      const focusContext = focusNode
        ? { focusNodeId: focusNode.id, graph: s.graph }
        : { focusNodeId: null, graph: s.graph }

      const startStreaming = () => {
        const buffered = makeChunkBuffer(dispatch)
        Promise.resolve(
          argosApi.chat(
            [...s.chat.thread, { role: 'user' as const, content: q, ts: Date.now() }],
            focusContext,
            buffered,
          ),
        ).catch((err) => {
          // eslint-disable-next-line no-console
          console.error('[ARGOS] chat error', err)
        })
      }

      if (isFirst) setTimeout(startStreaming, 1000)
      else startStreaming()
    },
    [s.chat.thread, s.focusedNodeId, s.graph, wakeGraph],
  )

  const focusedNode = s.focusedNodeId ? s.graph.nodes.find((n) => n.id === s.focusedNodeId) : null
  const inHero = s.chat.thread.length === 0
  const graphIdle =
    inHero &&
    graphAsleep &&
    !s.focusedNodeId &&
    !s.hoveredNodeId &&
    s.highlightedNodeIds.size === 0

  // Stable handlers para que React.memo(GraphCanvas) skipee re-renders
  const onGraphHover = useCallback((id: string | null) => dispatch({ t: 'HOVER_NODE', id }), [])
  const onGraphSelect = useCallback(
    (id: string) => {
      wakeGraph()
      dispatch({ t: 'SELECT_NODE', id })
    },
    [wakeGraph],
  )
  const hasThread = s.chat.thread.length > 0
  const onGraphBgEnter = useCallback(
    () => dispatch({ t: 'CHAT_FADE', level: hasThread ? 'hover-graph' : 'idle' }),
    [hasThread],
  )
  const onGraphBgLeave = useCallback(() => dispatch({ t: 'CHAT_FADE', level: 'idle' }), [])

  const onChipHover = useCallback((id: string | null) => {
    if (chipHoverTimer.current) clearTimeout(chipHoverTimer.current)
    chipHoverTimer.current = setTimeout(() => dispatch({ t: 'HIGHLIGHT_ONE', id }), 80)
  }, [])
  const onChipClick = useCallback((id: string) => dispatch({ t: 'SELECT_NODE', id }), [])
  // Feature E — al limpiar el chat también borramos localStorage
  const onChatClear = useCallback(() => {
    dispatch({ t: 'CLEAR_CHAT' })
    clearThread()
  }, [])
  const onPanelClose = useCallback(() => dispatch({ t: 'PANEL_CLOSE' }), [])
  const onPanelSelect = useCallback((id: string) => dispatch({ t: 'SELECT_NODE', id }), [])
  const onPanelRelHover = useCallback(
    (id: string | null) => dispatch({ t: 'HIGHLIGHT_ONE', id }),
    [],
  )

  const showGraph = s.sidebar === 'inicio' || s.sidebar === 'mapa'

  // Conteos para footer (sin window.ArgosMock — derivados del grafo cargado)
  const totalProv = useMemo(
    () => s.graph.nodes.filter((n) => n.type === 'proveedor').length,
    [s.graph.nodes],
  )
  const totalSenales = useMemo(
    () => s.graph.nodes.filter((n) => n.type === 'señal').length,
    [s.graph.nodes],
  )
  const totalJur = useMemo(
    () => s.graph.nodes.filter((n) => n.type === 'jurisdiccion').length,
    [s.graph.nodes],
  )

  // Loading inicial — backend cargando grafo real
  if (isLoading && s.graph.nodes.length === 0) {
    return (
      <div className="app">
        <div className="canvas-wrap" style={{ display: 'grid', placeItems: 'center', height: '100vh' }}>
          <div className="hero">
            <div className="hero-chip"><span className="pulse" /> Cargando grafo de Córdoba…</div>
          </div>
        </div>
      </div>
    )
  }

  // Backend desconectado o sin datos — estado vacío explícito (cero alucinaciones)
  if (!isLoading && s.graph.nodes.length === 0) {
    return (
      <div className="app">
        <div
          className="canvas-wrap"
          style={{ display: 'grid', placeItems: 'center', height: '100vh', padding: '0 24px' }}
        >
          <div className="hero" style={{ textAlign: 'center', maxWidth: 640 }}>
            <div className="hero-chip" style={{ background: 'var(--bg-panel)' }}>
              <span style={{ color: 'var(--ambar)' }}>●</span> SIN DATOS
            </div>
            <h1>Backend desconectado</h1>
            <p className="hero-meta" style={{ marginTop: 16, lineHeight: 1.6 }}>
              El frontend no recibió datos del API en{' '}
              <code className="mono" style={{ color: 'var(--celeste)' }}>
                {(import.meta as ImportMeta).env?.VITE_API_URL ?? 'http://localhost:3001'}
              </code>
              . ARGOS muestra únicamente datos verificables — no hay fixtures sintéticos.
              Levantá el backend con <code className="mono">npm run dev</code> en{' '}
              <code className="mono">backend/</code> y refrescá esta página.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="app">
      <Sidebar
        active={s.sidebar}
        onNav={(sec) => dispatch({ t: 'NAV', section: sec })}
        hasChat={s.chat.thread.length > 0}
        hasHistory={s.chat.thread.length > 2}
        thread={s.chat.thread}
        streaming={s.chat.streaming}
        fadeLevel={s.chat.fadeLevel}
        graph={s.graph}
        focusedNodeId={s.focusedNodeId}
        onChipHover={onChipHover}
        onChipClick={onChipClick}
        onChatClear={onChatClear}
        totalProv={totalProv}
        totalSenales={totalSenales}
        totalJur={totalJur}
      />
      <div className="main">
        <Header
          section={s.sidebar}
          focusedNode={focusedNode ?? null}
          onClearFocus={() => dispatch({ t: 'CLEAR' })}
          labelsMode={labelsMode}
          labelsDepth={labelsDepth}
          onLabelsToggle={() => setLabelsMode((m) => (m === 'minimal' ? 'all' : 'minimal'))}
          onLabelsDepth={setLabelsDepth}
        />

        {showGraph && (
          <div className="canvas-wrap">
            <div
              className={`graph-wrap ${graphIdle ? 'graph-idle' : 'graph-awake'}`}
              onMouseEnter={() => {
                if (!graphAsleep) return
                if (hoverTimer.current) clearTimeout(hoverTimer.current)
                hoverTimer.current = setTimeout(() => wakeGraph(), 500)
              }}
              onMouseLeave={() => {
                if (hoverTimer.current) clearTimeout(hoverTimer.current)
              }}
            >
              <GraphCanvas
                snapshot={s.graph}
                focusedId={s.focusedNodeId}
                hoveredId={s.hoveredNodeId}
                highlighted={s.highlightedNodeIds}
                idle={graphIdle}
                heroNodeId={heroNodeId}
                labelsMode={labelsMode}
                labelsDepth={labelsDepth}
                onHover={onGraphHover}
                onSelect={onGraphSelect}
                onBgEnter={onGraphBgEnter}
                onBgLeave={onGraphBgLeave}
              />
            </div>

            {/* Hero state */}
            <div className={`hero ${inHero ? '' : 'hidden'}`} aria-hidden={!inHero}>
              <div className="hero-chip">
                <span className="pulse" /> IA DE TRANSPARENCIA — ARGOS
              </div>
              <h1>
                ¿Qué querés <em>investigar</em> hoy?
              </h1>
              <p className="hero-meta mono">
                {totalJur} jurisdicciones · {totalProv} proveedores · {totalSenales} señales activas · datos al{' '}
                {new Date().toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })}
              </p>
            </div>

            {/* Input */}
            <div className={`input-wrap ${inHero ? 'center' : 'footer'} ${sending ? 'sending' : ''}`}>
              <form
                className="input"
                onSubmit={(e) => {
                  e.preventDefault()
                  submit(draft)
                }}
              >
                <Ico.Eye />
                <input
                  ref={inputRef}
                  value={draft}
                  onChange={(e) => {
                    setDraft(e.target.value)
                    setThreadCursor(null)
                  }}
                  placeholder={
                    focusedNode
                      ? `Preguntale a ARGOS sobre ${
                          focusedNode.label.length > 32
                            ? focusedNode.label.slice(0, 30) + '…'
                            : focusedNode.label
                        }…`
                      : PLACEHOLDERS[phIdx]
                  }
                  aria-label="Pregunta a ARGOS"
                  onFocus={() => {
                    wakeGraph()
                    dispatch({ t: 'CHAT_FADE', level: 'typing' })
                  }}
                />
                <span
                  className="mono"
                  style={{
                    fontSize: 11,
                    color: 'var(--text-3)',
                    padding: '0 8px',
                    border: '1px solid var(--stroke)',
                    borderRadius: 6,
                  }}
                >
                  ⌘K
                </span>
                <button
                  className="send"
                  type="submit"
                  aria-label="Enviar"
                  disabled={!draft.trim()}
                >
                  <Ico.Send size={14} />
                </button>
              </form>
              {inHero && (
                <div style={{ display: 'flex', justifyContent: 'center', marginTop: 14 }}>
                  <button
                    className={`chip-rotative ${chipFading ? 'fading' : ''}`}
                    onClick={() => {
                      wakeGraph()
                      submit(SUGGESTIONS[chipIdx])
                    }}
                  >
                    <span className="lbl">Probá:</span> {SUGGESTIONS[chipIdx]}
                  </button>
                </div>
              )}
              {!inHero && focusedNode && draft.length === 0 && (
                <div className="chips chips-context">
                  <span className="context-label">
                    sobre {focusedNode.label.slice(0, 28)}
                    {focusedNode.label.length > 28 ? '…' : ''}:
                  </span>
                  {(SUGGESTIONS_BY_TYPE[focusedNode.type] || SUGGESTIONS)
                    .slice(0, 3)
                    .map((qq) => (
                      <button
                        key={qq}
                        className="chip-suggest small"
                        onClick={() => submit(qq)}
                      >
                        {qq}
                      </button>
                    ))}
                </div>
              )}
            </div>

            {/* Panel detalle */}
            <NodeDetailPanel
              open={s.panel.open}
              loading={s.panel.loading}
              detail={s.panel.detail}
              onClose={onPanelClose}
              onSelect={onPanelSelect}
              onRelHover={onPanelRelHover}
            />
          </div>
        )}

        {!showGraph && (
          <PlaceholderSection
            id={s.sidebar}
            focusInput={() => {
              dispatch({ t: 'NAV', section: 'inicio' })
              setTimeout(() => inputRef.current?.focus(), 50)
            }}
          />
        )}
      </div>
    </div>
  )
}
