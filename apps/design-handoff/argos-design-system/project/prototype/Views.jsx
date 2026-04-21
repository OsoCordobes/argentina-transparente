// ─── Alerts feed + Saved boards views (used as secondary views) ──────

function AlertsFeed({ variant = 'light' }) {
  return (
    <div className={`feed ${variant}`}>
      <div className="feed-head">
        <div>
          <div className="eyebrow">Monitoreo · últimas 72 h</div>
          <h2 className="feed-title">Alertas</h2>
        </div>
        <div className="feed-toolbar">
          <button className="top-action">{I.filter({ s: 12 })} Filtrar</button>
          <button className="top-action primary">{I.plus({ s: 12 })} Nueva regla</button>
        </div>
      </div>

      <div className="feed-stats">
        <div className="feed-stat"><span className="sev-dot" style={{background:'var(--red-500)'}}/><b>5</b> graves</div>
        <div className="feed-stat"><span className="sev-dot" style={{background:'var(--amber-500)'}}/><b>12</b> moderadas</div>
        <div className="feed-stat"><span className="sev-dot" style={{background:'var(--blue-500)'}}/><b>8</b> leves</div>
        <div className="feed-stat feed-stat-total"><b>25</b> alertas nuevas</div>
      </div>

      <div className="feed-list">
        {ALERTS.map(a => (
          <div key={a.id} className={`feed-item sev-${a.severity}`}>
            <div className="feed-item-rail"/>
            <div className="feed-item-content">
              <div className="feed-item-head">
                <span className="sev-badge">{a.severity}</span>
                <span className="feed-item-when">{a.when}</span>
                <span className="feed-item-source">{a.source}</span>
              </div>
              <div className="feed-item-title">{a.title}</div>
              <div className="feed-item-desc">{a.desc}</div>
              <div className="feed-item-actions">
                <button className="feed-action">Abrir en el grafo</button>
                <button className="feed-action">Añadir al tablero</button>
                <button className="feed-action feed-action-muted">Descartar</button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function BoardsList({ variant = 'light' }) {
  return (
    <div className={`feed ${variant}`}>
      <div className="feed-head">
        <div>
          <div className="eyebrow">Investigaciones</div>
          <h2 className="feed-title">Tableros guardados</h2>
        </div>
        <button className="top-action primary">{I.plus({ s: 12 })} Nuevo tablero</button>
      </div>

      <div className="boards-grid">
        {BOARDS.map(b => (
          <div key={b.id} className="board-card">
            <div className="board-card-head">
              <div className={`board-status board-status-${b.status}`}>{b.status}</div>
              <div className="board-owner">{b.owner === 'vos' ? 'tu tablero' : `por ${b.owner}`}</div>
            </div>
            <div className="board-title">{b.title}</div>
            <div className="board-mini-graph">
              <svg viewBox="0 0 100 40" width="100%" height="40">
                {[...Array(8)].map((_, i) => <circle key={i} cx={10 + i*12} cy={8 + ((i*13)%26)} r="2" fill="#3b82f6" opacity="0.6"/>)}
                <path d="M10,10 L22,18 L34,12 L46,25 L58,15 L70,22 L82,10 L94,18" stroke="#3b82f6" strokeWidth="0.8" fill="none" opacity="0.4"/>
              </svg>
            </div>
            <div className="board-footer">
              <div className="board-stats">
                <span><b>{b.entities}</b> entidades</span>
                <span><b>{b.signals}</b> señales</span>
              </div>
              <div className="board-updated">{b.updated}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

Object.assign(window, { AlertsFeed, BoardsList });
