// ─── Feedback FAB ────────────────────────────────────────────────
// Floating button. Click → mini-form to send feedback from any screen.
// Captures: mensaje · ruta actual · caso_id (si hay) · severidad.
// Backend contract: POST /api/feedback (creates GitHub Issue).

function FeedbackFab({ routeLabel, casoId }) {
  const [open, setOpen] = React.useState(false);
  const [kind, setKind] = React.useState('idea'); // 'idea' | 'bug' | 'data'
  const [mensaje, setMensaje] = React.useState('');
  const [sent, setSent] = React.useState(false);

  const submit = () => {
    // Would POST to /api/feedback
    console.log('[feedback]', { kind, mensaje, route: routeLabel, caso_id: casoId });
    setSent(true);
    setTimeout(() => { setOpen(false); setSent(false); setMensaje(''); }, 1800);
  };

  return (
    <>
      <button className="fb-fab" onClick={() => setOpen(true)} title="Pedir cambio o feature">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
        </svg>
        <span>Mejorar ARGOS</span>
      </button>

      {open && (
        <div className="fb-backdrop" onClick={() => setOpen(false)}>
          <div className="fb-modal" onClick={e => e.stopPropagation()}>
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
                  <button className="fb-close" onClick={() => setOpen(false)}>
                    {I.close({ s: 14 })}
                  </button>
                </div>

                <div className="fb-kinds">
                  <button className={kind === 'idea' ? 'on' : ''} onClick={() => setKind('idea')}>
                    💡 Idea / feature
                  </button>
                  <button className={kind === 'bug' ? 'on' : ''} onClick={() => setKind('bug')}>
                    🐞 Bug
                  </button>
                  <button className={kind === 'data' ? 'on' : ''} onClick={() => setKind('data')}>
                    📊 Dato incorrecto
                  </button>
                </div>

                <textarea
                  className="fb-textarea"
                  autoFocus
                  rows={5}
                  placeholder={
                    kind === 'idea' ? 'Me encantaría poder…'
                    : kind === 'bug' ? 'Esperaba X pero pasó Y…'
                    : 'El dato X dice Z pero debería ser W, fuente:…'
                  }
                  value={mensaje}
                  onChange={e => setMensaje(e.target.value)}
                />

                <div className="fb-context">
                  <span className="eyebrow">Contexto adjunto</span>
                  <div className="fb-context-chips">
                    <span className="fb-chip mono">ruta: {routeLabel}</span>
                    {casoId && <span className="fb-chip mono">caso: {casoId}</span>}
                    <span className="fb-chip mono">ua: Chrome/Mac</span>
                  </div>
                </div>

                <div className="fb-actions">
                  <button className="top-action" onClick={() => setOpen(false)}>Cancelar</button>
                  <button
                    className="top-action primary"
                    disabled={!mensaje.trim()}
                    onClick={submit}
                  >
                    {I.send({ s: 12 })} Enviar
                  </button>
                </div>

                <div className="fb-footnote">
                  Esto crea un issue interno. Vas a recibir un email cuando lo abordemos.
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}

Object.assign(window, { FeedbackFab });
