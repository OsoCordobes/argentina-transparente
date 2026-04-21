// ─── AI Sidebar ──────────────────────────────────────────────────
// Right sidebar. Two sections stacked:
//   • passive suggestions (chips) — auto-computed from current pinned entities
//   • chat — contextual conversation with the co-investigator
// Distinct from AIChat.jsx which is the old bottom-panel chat component.

function AISidebar({
  pinnedEntityIds,
  suggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
  onAskAgent,
  isPremium,
  onUpgrade,
  collapsed,
  onToggleCollapse,
}) {
  if (collapsed) {
    return (
      <aside className="ai-sidebar ai-sidebar-collapsed" onClick={onToggleCollapse} title="Abrir co-investigador">
        <div className="ai-sidebar-collapsed-icon">{I.sparkles({ s: 18 })}</div>
        {suggestions.length > 0 && (
          <div className="ai-sidebar-collapsed-badge">{suggestions.length}</div>
        )}
      </aside>
    );
  }

  return (
    <aside className="ai-sidebar">
      <div className="ai-head">
        <div className="ai-head-title">
          <span className="ai-dot"/>
          <span>Co‑investigador</span>
          {isPremium ? <span className="ai-tier-premium">Pro</span> : <span className="ai-tier-free">Free</span>}
        </div>
        <button className="ai-head-collapse" onClick={onToggleCollapse} title="Cerrar">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </button>
      </div>

      {/* Passive suggestions */}
      <div className="ai-suggestions">
        <div className="ai-suggestions-head">
          <span className="eyebrow">Sugerencias</span>
          <span className="ai-suggestions-hint">Actualizadas hace 2 min</span>
        </div>
        {suggestions.length === 0 ? (
          <div className="ai-suggestions-empty">
            Anclá entidades al caso y te iré sugiriendo conexiones en silencio.
          </div>
        ) : suggestions.map(s => (
          <div key={s.id} className={`ai-chip kind-${s.kind} ${s.severity ? `sev-${s.severity}` : ''}`}>
            <div className="ai-chip-head">
              <span className="ai-chip-icon">
                {s.kind === 'signal'     ? I.alerts({ s: 12 })
                : s.kind === 'connection' ? I.graph({ s: 12 })
                :                           I.sparkles({ s: 12 })}
              </span>
              <span className="ai-chip-kind">
                {s.kind === 'signal' ? 'Señal' : s.kind === 'connection' ? 'Conexión' : 'Patrón'}
              </span>
              {s.severity && <span className="sev-badge">{s.severity}</span>}
            </div>
            <div className="ai-chip-title">{s.title}</div>
            <div className="ai-chip-desc">{s.desc}</div>
            <div className="ai-chip-actions">
              {s.actions.map((a, i) => (
                <button
                  key={i}
                  className={i === 0 ? 'ai-chip-btn primary' : 'ai-chip-btn'}
                  onClick={() => onAcceptSuggestion(s, a)}
                >
                  {a.label}
                </button>
              ))}
              <button className="ai-chip-dismiss" onClick={() => onDismissSuggestion(s.id)} title="Descartar">
                {I.close({ s: 10 })}
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Agent prompt (premium hook) */}
      <div className={`ai-agent-card ${isPremium ? 'is-premium' : ''}`}>
        <div className="ai-agent-head">
          <span className="ai-agent-icon">{I.sparkles({ s: 14 })}</span>
          <span className="ai-agent-title">Agente autónomo</span>
        </div>
        {isPremium ? (
          <>
            <div className="ai-agent-desc">Dale un objetivo. El agente busca, pinea y deja hipótesis.</div>
            <button className="ai-agent-btn" onClick={onAskAgent}>Lanzar investigación…</button>
          </>
        ) : (
          <>
            <div className="ai-agent-desc">Con tier Pro, corre solo toda la noche y te deja hallazgos.</div>
            <button className="ai-agent-btn ghost" onClick={onUpgrade}>Ver Pro →</button>
          </>
        )}
      </div>

      {/* Chat — compact */}
      <div className="ai-chat-wrap">
        <AIChat variant="light" compact/>
      </div>
    </aside>
  );
}

// Heuristic "passive suggestions" derived from current pinned entity set.
// Pure-client for the prototype; in production this calls POST /api/ai/suggestions.
function computeSuggestions(pinnedEntityIds) {
  const out = [];
  const pinnedSet = new Set(pinnedEntityIds);

  // 1) Shared directors
  const directorsByEntity = {};
  EDGES.filter(e => e.label === 'director' || e.label === 'dir. supl.').forEach(e => {
    if (!directorsByEntity[e.to]) directorsByEntity[e.to] = [];
    directorsByEntity[e.to].push(e.from);
  });
  const pairs = [];
  Object.entries(directorsByEntity).forEach(([eId, dirs]) => {
    if (pinnedSet.has(eId)) dirs.forEach(d => pairs.push([d, eId]));
  });
  const commonDirs = {};
  pairs.forEach(([d, e]) => {
    if (!commonDirs[d]) commonDirs[d] = [];
    commonDirs[d].push(e);
  });
  Object.entries(commonDirs).forEach(([d, es]) => {
    if (es.length >= 2) {
      out.push({
        id: `dir-${d}`,
        kind: 'connection',
        title: 'Director compartido entre empresas pinneadas',
        desc: `${ENTITIES[d]?.label || d} figura como director en ${es.map(x => ENTITIES[x]?.label).filter(Boolean).join(' y ')}.`,
        actions: [
          { label: 'Ver en grafo', target_entity_id: d },
          { label: 'Pinear director' },
        ],
      });
    }
  });

  // 2) Severe signals on pinned entities (not already in list)
  SIGNALS.filter(s => pinnedSet.has(s.subject) && s.severity === 'grave').slice(0, 2).forEach(s => {
    out.push({
      id: `sig-${s.id}`,
      kind: 'signal',
      severity: s.severity,
      title: `Señal grave: ${s.title}`,
      desc: s.desc,
      actions: [{ label: 'Pinear señal' }, { label: 'Ver evidencia' }],
    });
  });

  // 3) Anomaly — pre-electoral spike
  if (pinnedEntityIds.includes('e1')) {
    out.push({
      id: 'anom-election',
      kind: 'anomaly',
      title: 'Pico de contratos pre‑electoral',
      desc: '3 contratos firmados en los 30 días previos a elecciones. Probable captura política.',
      actions: [{ label: 'Ver en timeline' }],
    });
  }

  return out.slice(0, 4);
}

Object.assign(window, { AISidebar, computeSuggestions });
