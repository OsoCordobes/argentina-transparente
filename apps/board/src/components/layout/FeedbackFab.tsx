// ─── Feedback FAB ──────────────────────────────────────────
// Floating button + modal. Click → mini-form that POSTs to
// `/api/feedback` (creates a GitHub Issue on the configured repo).
// The Phase A backend returns 503 `feedback_not_configured` when
// GITHUB_TOKEN / GITHUB_REPO env vars are missing — we surface that
// politely instead of failing silently.

import { useState } from 'react'
import { MessageSquare, X, Send } from 'lucide-react'

type Kind = 'idea' | 'bug' | 'data'

type Props = {
  /** Human-readable current route, shown as context chip. */
  routeLabel: string
  /** Current caso id if the user is inside a case. */
  casoId?: string
  /** Optional user email; sent as `X-User-Email` header and captured in contexto. */
  userEmail?: string
}

type FeedbackResponse =
  | { issue_url: string; issue_number: number }
  | { error: { code: string; message: string } }

export default function FeedbackFab({ routeLabel, casoId, userEmail }: Props) {
  const [open, setOpen] = useState(false)
  const [kind, setKind] = useState<Kind>('idea')
  const [mensaje, setMensaje] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const close = () => {
    if (sending) return
    setOpen(false)
    setTimeout(() => {
      setSent(false)
      setError(null)
      setMensaje('')
    }, 200)
  }

  const submit = async () => {
    if (!mensaje.trim()) return
    setSending(true)
    setError(null)
    try {
      const contexto: Record<string, unknown> = {
        kind,
        user_agent: navigator.userAgent,
      }
      if (userEmail) contexto.user_email = userEmail

      const headers: Record<string, string> = { 'Content-Type': 'application/json' }
      if (userEmail) headers['X-User-Email'] = userEmail

      const res = await fetch('/api/feedback', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          mensaje: mensaje.trim(),
          ruta: routeLabel,
          caso_id: casoId,
          contexto,
        }),
      })

      const body = (await res.json().catch(() => null)) as FeedbackResponse | null

      if (!res.ok || !body || 'error' in body) {
        const msg = body && 'error' in body
          ? body.error.message
          : res.status === 503
            ? 'Feedback todavía no está configurado en el servidor.'
            : `Error ${res.status}`
        setError(msg)
        return
      }

      setSent(true)
      setTimeout(() => close(), 1800)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error de red')
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      <button
        className="fb-fab"
        onClick={() => setOpen(true)}
        title="Pedir cambio o feature"
        type="button"
      >
        <MessageSquare size={14} />
        <span>Mejorar ARGOS</span>
      </button>

      {open && (
        <div className="fb-backdrop" onClick={close}>
          <div className="fb-modal" onClick={(e) => e.stopPropagation()} role="dialog">
            {sent ? (
              <div className="fb-sent">
                <div className="fb-sent-check">✓</div>
                <div className="fb-sent-title">Gracias. Lo recibimos.</div>
                <div className="fb-sent-sub">Te escribimos por email cuando cambie de estado.</div>
              </div>
            ) : (
              <>
                <div className="fb-head">
                  <div>
                    <div className="eyebrow">Pedir cambio</div>
                    <div className="fb-title">¿Qué te molesta? ¿Qué te falta?</div>
                  </div>
                  <button className="fb-close" onClick={close} type="button">
                    <X size={14} />
                  </button>
                </div>

                <div className="fb-kinds">
                  <button
                    type="button"
                    className={kind === 'idea' ? 'on' : ''}
                    onClick={() => setKind('idea')}
                  >
                    💡 Idea / feature
                  </button>
                  <button
                    type="button"
                    className={kind === 'bug' ? 'on' : ''}
                    onClick={() => setKind('bug')}
                  >
                    🐞 Bug
                  </button>
                  <button
                    type="button"
                    className={kind === 'data' ? 'on' : ''}
                    onClick={() => setKind('data')}
                  >
                    📊 Dato incorrecto
                  </button>
                </div>

                <textarea
                  className="fb-textarea"
                  autoFocus
                  rows={5}
                  placeholder={
                    kind === 'idea'
                      ? 'Me encantaría poder…'
                      : kind === 'bug'
                        ? 'Esperaba X pero pasó Y…'
                        : 'El dato X dice Z pero debería ser W, fuente:…'
                  }
                  value={mensaje}
                  onChange={(e) => setMensaje(e.target.value)}
                />

                <div className="fb-context">
                  <span className="eyebrow">Contexto adjunto</span>
                  <div className="fb-context-chips">
                    <span className="fb-chip mono">ruta: {routeLabel}</span>
                    {casoId && <span className="fb-chip mono">caso: {casoId}</span>}
                    {userEmail && <span className="fb-chip mono">user: {userEmail}</span>}
                  </div>
                </div>

                {error && <div className="fb-error">{error}</div>}

                <div className="fb-actions">
                  <button type="button" className="fb-btn" onClick={close} disabled={sending}>
                    Cancelar
                  </button>
                  <button
                    type="button"
                    className="fb-btn primary"
                    disabled={!mensaje.trim() || sending}
                    onClick={submit}
                  >
                    <Send size={12} style={{ marginRight: 4 }} />
                    {sending ? 'Enviando…' : 'Enviar'}
                  </button>
                </div>

                <div className="fb-footnote">
                  Esto crea un issue interno. Recibís email cuando lo abordamos.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  )
}
