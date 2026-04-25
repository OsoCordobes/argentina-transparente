/**
 * chatStream.ts
 *
 * Cliente del endpoint SSE `POST /api/chat`. Se conecta al backend, parsea los
 * eventos `data:` línea por línea y emite ChatChunk[] al callback `onChunk`.
 *
 * Si la variable `VITE_CHAT_LLM` no es 'true' o el endpoint falla, el caller
 * (ExplorarLayout) cae al resolver local (chatResolver.ts) — cero downtime.
 */

import type { ChatChunk } from './types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export const CHAT_LLM_ENABLED = import.meta.env.VITE_CHAT_LLM === 'true'

interface StreamOptions {
  message: string
  focusNodeId: string | null
  signal?: AbortSignal
  onChunk: (chunk: ChatChunk) => void
}

/**
 * Llama al endpoint SSE y emite chunks. Resuelve cuando el stream termina (done).
 * Throws si el HTTP falla (no-200 o red caída) — el caller debe hacer fallback.
 */
export async function streamChat(opts: StreamOptions): Promise<void> {
  const res = await fetch(`${API_URL}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      message: opts.message,
      focusNodeId: opts.focusNodeId,
    }),
    signal: opts.signal,
  })

  if (!res.ok) {
    const errText = await res.text().catch(() => '')
    throw new Error(`HTTP ${res.status}: ${errText.slice(0, 200)}`)
  }

  if (!res.body) throw new Error('Respuesta sin body')

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })

      // SSE = bloques separados por \n\n. Cada bloque puede tener "data: <json>".
      let nlIdx = buffer.indexOf('\n\n')
      while (nlIdx !== -1) {
        const block = buffer.slice(0, nlIdx)
        buffer = buffer.slice(nlIdx + 2)

        for (const line of block.split('\n')) {
          if (!line.startsWith('data:')) continue
          const payload = line.slice(5).trim()
          if (!payload) continue

          try {
            const chunk = JSON.parse(payload) as ChatChunk & { error?: string }
            if (chunk.error) throw new Error(chunk.error)
            opts.onChunk(chunk)
            if (chunk.done) return
          } catch (e) {
            if (e instanceof Error && e.message.startsWith('Unexpected')) continue
            throw e
          }
        }

        nlIdx = buffer.indexOf('\n\n')
      }
    }
  } finally {
    reader.releaseLock()
  }
}
