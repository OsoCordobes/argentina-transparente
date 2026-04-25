/**
 * ExplorarLayout.tsx
 *
 * Shell del modo Explorar:
 * - Sidebar izquierda adaptativa (220px base → 360px con mensajes, 56px colapsada)
 * - Canvas central (d3-force)
 * - Panel de detalle derecho (deslizante, 340px)
 *
 * Gestiona:
 * - Estado del chat (messages[], streaming)
 * - Estado del grafo (focusedNodeId, highlightedIds)
 * - Tooltip flotante sobre nodos
 * - rAF coalescing para el stream de chunks
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { GraphCanvas } from './GraphCanvas'
import { NodeDetailPanel } from './NodeDetailPanel'
import { ChatThread } from './ChatThread'
import { resolveChat, getContextChips } from '@/lib/argos/chatResolver'
import { nodeDetailFromNode } from '@/lib/argos/graphFromData'
import type { ArgosGraph, ArgosNode, ChatMessage, ChatChunk, NodeDetail, ChatContext } from '@/lib/argos/types'

// ─── Tooltip flotante ─────────────────────────────────────────────────────────

interface TooltipState {
  node: ArgosNode | null
  x: number
  y: number
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface ExplorarLayoutProps {
  graph: ArgosGraph
  isLoading: boolean
}

// ─── Componente principal ─────────────────────────────────────────────────────

export function ExplorarLayout({ graph, isLoading }: ExplorarLayoutProps) {
  const navigate = useNavigate()

  // ─── Estado del chat ────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [streamingContent, setStreamingContent] = useState('')
  const [isStreaming, setIsStreaming] = useState(false)
  const pendingChunksRef = useRef<ChatChunk[]>([])
  const streamRafRef = useRef<number>(0)
  const inputRef = useRef<HTMLTextAreaElement>(null)

  // ─── Estado del grafo ───────────────────────────────────────────────────────
  const [focusedNodeId, setFocusedNodeId] = useState<string | null>(null)
  const [highlightedIds, setHighlightedIds] = useState<Set<string>>(new Set())
  const [nodeDetail, setNodeDetail] = useState<NodeDetail | null>(null)
  const [tooltip, setTooltip] = useState<TooltipState>({ node: null, x: 0, y: 0 })

  // ─── Sidebar colapsada (pocas señales de uso → auto-collapse) ──────────────
  const sidebarExpanded = messages.length > 0
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false)

  // ─── Contexto del chat ──────────────────────────────────────────────────────
  const chatCtx = useMemo<ChatContext>(
    () => ({ focusNodeId: focusedNodeId, graph }),
    [focusedNodeId, graph]
  )

  const chips = useMemo(() => getContextChips(chatCtx), [chatCtx])

  // ─── rAF stream dispatcher ──────────────────────────────────────────────────

  const dispatchStream = useCallback(() => {
    const chunks = pendingChunksRef.current.splice(0)
    if (!chunks.length) return

    let delta = ''
    let done = false
    const newHighlights: string[] = []
    let focus: string | null = null

    for (const chunk of chunks) {
      if (chunk.delta) delta += chunk.delta
      if (chunk.done) done = true
      if (chunk.entidades) {
        for (const e of chunk.entidades) newHighlights.push(e.id)
      }
      if (chunk.focus) focus = chunk.focus.nodeId
    }

    if (delta) {
      setStreamingContent((prev) => prev + delta)
    }

    if (newHighlights.length > 0) {
      setHighlightedIds((prev) => new Set([...prev, ...newHighlights]))
    }

    if (focus) {
      setFocusedNodeId(focus)
    }

    if (done) {
      setIsStreaming(false)
      setStreamingContent((prev) => {
        const finalContent = prev
        setMessages((msgs) => [
          ...msgs,
          { role: 'assistant', content: finalContent, ts: Date.now() },
        ])
        return ''
      })
    }
  }, [])

  // ─── Simulación de streaming con rAF coalescing ────────────────────────────

  const simulateStream = useCallback(
    (chunks: ChatChunk[]) => {
      setIsStreaming(true)
      setStreamingContent('')
      setHighlightedIds(new Set())

      let i = 0
      const intervalMs = 28 // ~35 chunks/seg — fluido sin colapsar

      function scheduleNext() {
        if (i >= chunks.length) return
        const chunk = chunks[i++]
        pendingChunksRef.current.push(chunk)

        if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current)
        streamRafRef.current = requestAnimationFrame(dispatchStream)

        if (i < chunks.length) {
          setTimeout(scheduleNext, intervalMs)
        }
      }

      scheduleNext()
    },
    [dispatchStream]
  )

  // ─── Enviar mensaje ─────────────────────────────────────────────────────────

  const sendMessage = useCallback(
    (text: string) => {
      const trimmed = text.trim()
      if (!trimmed || isStreaming) return

      setMessages((msgs) => [
        ...msgs,
        { role: 'user', content: trimmed, ts: Date.now() },
      ])

      const responseChunks = resolveChat(trimmed, chatCtx)
      simulateStream(responseChunks)
    },
    [isStreaming, chatCtx, simulateStream]
  )

  // ─── Manejo del form ────────────────────────────────────────────────────────

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()
      const val = inputRef.current?.value ?? ''
      if (inputRef.current) inputRef.current.value = ''
      sendMessage(val)
    },
    [sendMessage]
  )

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault()
        const val = inputRef.current?.value ?? ''
        if (inputRef.current) inputRef.current.value = ''
        sendMessage(val)
      }
    },
    [sendMessage]
  )

  // ─── Click en chip ──────────────────────────────────────────────────────────

  const handleChipClick = useCallback(
    (chip: string) => {
      sendMessage(chip)
    },
    [sendMessage]
  )

  // ─── Interacción con nodos ──────────────────────────────────────────────────

  const handleNodeClick = useCallback(
    (node: ArgosNode) => {
      setFocusedNodeId(node.id)
      setNodeDetail(nodeDetailFromNode(node, graph))
    },
    [graph]
  )

  const handleNodeHover = useCallback((node: ArgosNode | null, x: number, y: number) => {
    setTooltip({ node, x, y })
  }, [])

  const handlePanelClose = useCallback(() => {
    setNodeDetail(null)
    setFocusedNodeId(null)
  }, [])

  const handlePanelFocusNode = useCallback((nodeId: string) => {
    setFocusedNodeId(nodeId)
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (node) setNodeDetail(nodeDetailFromNode(node, graph))
  }, [graph])

  const handleNavigateToEntity = useCallback(
    (node: ArgosNode) => {
      if (node.type === 'proveedor') {
        navigate(`/entidad/${encodeURIComponent(node.label)}`)
      } else if (node.type === 'director') {
        navigate(`/entidad/${encodeURIComponent(node.label)}`)
      }
    },
    [navigate]
  )

  // ─── Cleanup RAF ────────────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (streamRafRef.current) cancelAnimationFrame(streamRafRef.current)
    }
  }, [])

  // ─── Sidebar CSS class ──────────────────────────────────────────────────────

  const sidebarClass = [
    'ae-sidebar',
    sidebarCollapsed ? 'collapsed' : '',
    !sidebarCollapsed && sidebarExpanded ? 'expanded' : '',
  ]
    .filter(Boolean)
    .join(' ')

  // ─── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="argos-explorar">
      {/* ── Sidebar ── */}
      <aside className={sidebarClass}>
        {/* Header */}
        <div className="ae-sidebar-header">
          <div className="ae-sidebar-logo">A</div>
          {!sidebarCollapsed && (
            <span className="ae-sidebar-title">Explorar ARGOS</span>
          )}
          <button
            onClick={() => setSidebarCollapsed((v) => !v)}
            style={{
              marginLeft: 'auto',
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              color: 'var(--ae-text-muted)',
              padding: 2,
              display: 'flex',
              transform: sidebarCollapsed ? 'rotate(0deg)' : 'rotate(180deg)',
              transition: 'transform 250ms',
            }}
            title={sidebarCollapsed ? 'Expandir' : 'Colapsar'}
          >
            <ChevronRight size={14} />
          </button>
        </div>

        {/* Chips de contexto */}
        {!sidebarCollapsed && chips.length > 0 && (
          <div className="ae-context-chips">
            {chips.map((chip) => (
              <button
                key={chip}
                className="ae-chip"
                onClick={() => handleChipClick(chip)}
              >
                <span className="ae-chip-dot" />
                {chip}
              </button>
            ))}
          </div>
        )}

        {/* Thread */}
        {!sidebarCollapsed && (
          <ChatThread
            messages={messages}
            streamingContent={streamingContent}
            isStreaming={isStreaming}
          />
        )}

        {/* Input */}
        {!sidebarCollapsed && (
          <div className="ae-chat-input-area">
            <form className="ae-chat-form" onSubmit={handleSubmit}>
              <textarea
                ref={inputRef}
                className="ae-chat-textarea"
                placeholder="Preguntá sobre señales, contratos, proveedores…"
                rows={1}
                onKeyDown={handleKeyDown}
                onInput={(e) => {
                  // Auto-resize
                  const el = e.currentTarget
                  el.style.height = 'auto'
                  el.style.height = `${Math.min(el.scrollHeight, 120)}px`
                }}
                disabled={isStreaming}
              />
              <button
                type="submit"
                className="ae-chat-send"
                disabled={isStreaming}
                title="Enviar (Enter)"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                  <path d="M12.5 7L1.5 1.5L4.5 7L1.5 12.5L12.5 7Z" fill="currentColor" />
                </svg>
              </button>
            </form>
          </div>
        )}
      </aside>

      {/* ── Canvas ── */}
      {isLoading ? (
        <div className="ae-canvas-wrapper">
          <div className="ae-grid-bg" />
          <div className="ae-spinner">
            <div className="ae-spinner-ring" />
            <span>Construyendo grafo…</span>
          </div>
        </div>
      ) : (
        <GraphCanvas
          graph={graph}
          focusedNodeId={focusedNodeId}
          highlightedIds={highlightedIds}
          onNodeClick={handleNodeClick}
          onNodeHover={handleNodeHover}
        />
      )}

      {/* ── Panel detalle ── */}
      <NodeDetailPanel
        detail={nodeDetail}
        onClose={handlePanelClose}
        onFocusNode={handlePanelFocusNode}
        onNavigateToEntity={handleNavigateToEntity}
      />

      {/* ── Tooltip flotante ── */}
      {tooltip.node && (
        <div
          className="ae-node-tooltip"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y - 36,
            position: 'fixed',
          }}
        >
          <div>{tooltip.node.label}</div>
          {tooltip.node.subtitle && (
            <div className="ae-node-tooltip-sub">{tooltip.node.subtitle}</div>
          )}
        </div>
      )}
    </div>
  )
}
