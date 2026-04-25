/**
 * ChatThread.tsx
 *
 * Renderiza el historial de mensajes del chat.
 * Usa React.memo + split CompletedTurns / CurrentTurn para evitar
 * re-renders de todo el historial durante streaming.
 *
 * El streaming se simula por el padre (ExplorarLayout) con rAF coalescing —
 * este componente sólo recibe messages[] y streaming string.
 */

import { memo, useEffect, useRef, useCallback } from 'react'
import type { ChatMessage } from '@/lib/argos/types'

// ─── Turno completado (memoizado — no re-renderiza durante stream) ────────────

const CompletedTurn = memo(function CompletedTurn({ msg }: { msg: ChatMessage }) {
  const isUser = msg.role === 'user'
  const time = new Date(msg.ts).toLocaleTimeString('es-AR', {
    hour: '2-digit',
    minute: '2-digit',
  })

  return (
    <div className={`ae-msg ae-msg-${isUser ? 'user' : 'assistant'}`}>
      <div className="ae-msg-bubble">{msg.content}</div>
      <span className="ae-msg-time">{time}</span>
    </div>
  )
})

// ─── Turno actual (streaming — sólo este re-renderiza) ───────────────────────

const CurrentTurn = memo(function CurrentTurn({ content }: { content: string }) {
  return (
    <div className="ae-msg ae-msg-assistant">
      <div className={`ae-msg-bubble ${content ? 'ae-streaming-cursor' : ''}`}>
        {content || <span style={{ opacity: 0.4 }}>…</span>}
      </div>
    </div>
  )
})

// ─── Props ────────────────────────────────────────────────────────────────────

interface ChatThreadProps {
  messages: ChatMessage[]
  streamingContent: string
  isStreaming: boolean
}

// ─── Componente principal ─────────────────────────────────────────────────────

export const ChatThread = memo(function ChatThread({
  messages,
  streamingContent,
  isStreaming,
}: ChatThreadProps) {
  const bottomRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Auto-scroll al final cuando llega nuevo contenido
  const scrollToBottom = useCallback(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [])

  useEffect(() => {
    scrollToBottom()
  }, [messages.length, streamingContent, scrollToBottom])

  if (messages.length === 0 && !isStreaming) {
    return (
      <div ref={containerRef} className="ae-chat-thread">
        <div className="ae-empty" style={{ flex: '1 1 auto', paddingTop: 40 }}>
          <div className="ae-empty-icon">⚡</div>
          <div className="ae-empty-title">Empezá a explorar</div>
          <div className="ae-empty-text">
            Preguntá sobre señales de riesgo, facturación, directores o
            contratos. O hacé clic en un nodo para empezar.
          </div>
        </div>
        <div ref={bottomRef} />
      </div>
    )
  }

  return (
    <div ref={containerRef} className="ae-chat-thread">
      {messages.map((msg) => (
        <CompletedTurn key={msg.ts} msg={msg} />
      ))}

      {isStreaming && <CurrentTurn content={streamingContent} />}

      <div ref={bottomRef} />
    </div>
  )
})
