// ─── AI Co-investigator chat panel ───────────────────────────────────
// Uses window.claude.complete when available; falls back to canned text.

const SYSTEM_PROMPT = `Sos el co-investigador IA de ARGOS, una plataforma de inteligencia cívica
enfocada en contrataciones del estado argentino (Córdoba Capital).
Respondés SIEMPRE en español rioplatense (es-AR), usando "vos" en lugar de "tú".
Tu tono es: sobrio, técnico, directo, sin adornos. Sos un co-investigador, no un asistente.

Contexto activo de la investigación:
- Entidad foco: TECNOSERV SA (CUIT 30-71234567-9), empresa constructora de Córdoba.
- 18 contratos recibidos entre 2019 y 2024, total $2.847.392.100.
- 74% del gasto de la Secretaría de Obras Públicas se concentra en esta empresa.
- Directores: Juan Carlos Pérez (también director de GRUPO VIAL CENTRO SA) y María Elena López.
- Aportó $2.400.000 a la campaña electoral 2019.
- Señales detectadas: concentración de proveedor (GRAVE, 92), aportante+contratista (GRAVE, 88),
  fraccionamiento avanzado en PROVEER SA (MODERADA, 68), red de empresas con directores compartidos (MODERADA, 58).
- Normativa relevante: Ley 2095 (contrataciones), Ley 26.215 (financiamiento partidos), Ley 19.550 (sociedades).

Reglas:
- Respuestas cortas (2-4 oraciones por defecto; listas cuando sea más claro).
- Citá siempre la fuente (dataset, ordenanza, ley) cuando afirmes algo.
- Si no tenés datos, decilo explícitamente. No inventes.
- Si el usuario pide generar un dossier o hacer una acción, respondé qué harías y qué confirmarías antes.
- No uses emojis. No uses markdown fuerte más allá de **negrita** ocasional.`;

function AIChat({ variant = 'light', compact = false }) {
  const [msgs, setMsgs] = React.useState(CHAT_SEED);
  const [val, setVal] = React.useState('');
  const [pending, setPending] = React.useState(false);
  const [err, setErr] = React.useState(null);
  const scrollRef = React.useRef(null);

  React.useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [msgs, pending]);

  async function send(text) {
    const q = (text ?? val).trim();
    if (!q || pending) return;
    setVal('');
    setErr(null);
    const next = [...msgs, { who: 'user', text: q }];
    setMsgs(next);
    setPending(true);
    try {
      const history = next.slice(-8).map(m => ({
        role: m.who === 'user' ? 'user' : 'assistant',
        content: m.text,
      }));
      const prompt = SYSTEM_PROMPT + '\n\n' + history.map(h => `${h.role === 'user' ? 'USUARIO' : 'ASISTENTE'}: ${h.content}`).join('\n\n') + '\n\nASISTENTE:';
      const reply = await window.claude.complete(prompt);
      setMsgs(m => [...m, { who: 'bot', text: reply.trim() }]);
    } catch (e) {
      setErr('No pude conectar con el modelo. Respondiendo con datos pre-cargados.');
      const fallback = canned(q);
      setMsgs(m => [...m, { who: 'bot', text: fallback }]);
    } finally {
      setPending(false);
    }
  }

  const suggestionsFor = (last) => last?.suggestions || [];
  const lastBot = [...msgs].reverse().find(m => m.who === 'bot');

  return (
    <div className={`aichat ${variant} ${compact ? 'compact' : ''}`}>
      <div className="aichat-header">
        <div className="aichat-avatar">{I.sparkles({ s: 14 })}</div>
        <div>
          <div className="aichat-title">Co-investigador</div>
          <div className="aichat-sub">Claude Haiku · contexto: TECNOSERV SA</div>
        </div>
        <span className="aichat-dot" aria-hidden="true"></span>
      </div>

      <div className="aichat-scroll" ref={scrollRef}>
        {msgs.map((m, i) => (
          <div key={i} className={`aichat-msg is-${m.who}`}>
            {m.who === 'bot' && <div className="aichat-msg-avatar">{I.sparkles({ s: 12 })}</div>}
            <div className="aichat-bubble" dangerouslySetInnerHTML={{ __html: formatMd(m.text) }}/>
          </div>
        ))}
        {pending && (
          <div className="aichat-msg is-bot">
            <div className="aichat-msg-avatar">{I.sparkles({ s: 12 })}</div>
            <div className="aichat-bubble is-thinking">
              <span className="dot"></span><span className="dot"></span><span className="dot"></span>
            </div>
          </div>
        )}
        {err && <div className="aichat-err">{err}</div>}
      </div>

      {lastBot && suggestionsFor(lastBot).length > 0 && !pending && (
        <div className="aichat-chips">
          {suggestionsFor(lastBot).map((s, i) => (
            <button key={i} className="chip" onClick={() => send(s)}>{s}</button>
          ))}
        </div>
      )}

      <div className="aichat-input">
        <input
          placeholder="Preguntá sobre TECNOSERV SA, la red, la normativa…"
          value={val}
          onChange={e => setVal(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') send(); }}
          disabled={pending}
        />
        <button className="aichat-send" onClick={() => send()} disabled={pending || !val.trim()} aria-label="Enviar">
          {I.send({ s: 14 })}
        </button>
      </div>
    </div>
  );
}

function formatMd(t) {
  return String(t)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\n/g, '<br/>');
}

function canned(q) {
  const s = q.toLowerCase();
  if (s.includes('concentr'))
    return 'La señal de concentración detecta que TECNOSERV SA recibió el **74%** del gasto de la Secretaría de Obras Públicas entre 2022 y 2023. El umbral de riesgo grave está en 35%. Fuente: Portal de Datos Abiertos · Córdoba. Contradice el principio de concurrencia (Ley 2095, Art. 10).';
  if (s.includes('director'))
    return 'Los directores registrados en IGJ son **Juan Carlos Pérez** (titular) y **María Elena López** (suplente). Pérez también figura como director de GRUPO VIAL CENTRO SA, lo que activa la señal de red de empresas.';
  if (s.includes('dossier') || s.includes('informe'))
    return 'Puedo armar un dossier preliminar con: (1) perfil societario, (2) mapa de contratos por año, (3) las 4 señales detectadas con su normativa, (4) línea de tiempo con hitos. Antes de publicar te muestro un borrador para revisión.';
  return 'Tengo datos sobre contratos, directores, aportes de campaña, señales detectadas y normativa aplicable. ¿Qué aspecto querés profundizar?';
}

Object.assign(window, { AIChat });
