function AIChatPanel({ onClose }) {
  const [messages, setMessages] = React.useState(MOCK_CHAT);
  const [draft, setDraft] = React.useState('');
  const endRef = React.useRef(null);

  React.useEffect(() => {
    endRef.current?.scrollTo?.({ top: 9999 });
  }, [messages]);

  const send = () => {
    if (!draft.trim()) return;
    const next = [...messages, { who: 'user', text: draft }];
    setMessages(next);
    setDraft('');
    setTimeout(() => {
      setMessages(m => [...m, { who: 'bot', text: 'Analizando señales y cruces relevantes… (respuesta simulada del co-investigador IA).' }]);
    }, 600);
  };

  return (
    <div className="chat">
      <div className="chat-hd">
        <Icons.Sparkle size={14} />
        <span className="title">Co-investigador IA</span>
        <span className="badge">Beta</span>
        <div style={{ flex: 1 }} />
        <button className="btn icon sm" onClick={onClose}><Icons.X size={12} /></button>
      </div>
      <div className="chat-body" ref={endRef}>
        {messages.map((m, i) => (
          <div className={`msg ${m.who}`} key={i}>
            <div className="who">{m.who === 'bot' ? 'ARGOS · IA' : 'Investigador'}</div>
            <div className="bubble">{m.text}</div>
          </div>
        ))}
      </div>
      <div className="chat-input">
        <input
          placeholder="Preguntale al co-investigador…"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && send()}
        />
        <button className="btn primary sm" onClick={send}><Icons.Send /> Enviar</button>
      </div>
    </div>
  );
}

window.AIChatPanel = AIChatPanel;
