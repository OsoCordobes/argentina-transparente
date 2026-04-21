// ─── Inspector: right-side panel showing entity details ────────────

function Inspector({ entityId, onClose, variant = 'light' }) {
  const ent = entityId ? ENTITIES[entityId] : null;
  if (!ent) return null;

  const sigs = SIGNALS.filter(s => s.subject === entityId);
  const myEdges = EDGES.filter(e => e.from === entityId || e.to === entityId);

  return (
    <aside className={`inspector ${variant}`}>
      <div className="insp-head">
        <div className={`insp-icon ent-${ent.type}`}><EntIcon type={ent.type} size={18}/></div>
        <div className="insp-head-text">
          <div className="eyebrow">{ent.type}</div>
          <div className="insp-title">{ent.label}</div>
          {ent.cuit && <div className="insp-cuit mono">{ent.cuit}</div>}
        </div>
        <button className="insp-close" onClick={onClose} aria-label="Cerrar">{I.close({ s: 16 })}</button>
      </div>

      {ent.total && (
        <div className="insp-stats">
          <div className="stat">
            <div className="stat-label eyebrow">Monto total</div>
            <div className="stat-val mono">{fmtARS(ent.total)}</div>
          </div>
          <div className="stat">
            <div className="stat-label eyebrow">Contratos</div>
            <div className="stat-val mono">{ent.contracts}</div>
          </div>
          {ent.founded && (
            <div className="stat">
              <div className="stat-label eyebrow">Constitución</div>
              <div className="stat-val mono">{ent.founded}</div>
            </div>
          )}
        </div>
      )}

      {ent.total && (
        <div className="insp-spark">
          <div className="eyebrow" style={{ marginBottom: 6 }}>Gasto anual</div>
          <div className="insp-spark-chart">
            <Sparkline data={SPEND_BY_YEAR} w={260} h={50} stroke="var(--primary)"/>
            <div className="insp-spark-axis">
              {SPEND_BY_YEAR.map(d => <span key={d.y}>{d.y}</span>)}
            </div>
          </div>
        </div>
      )}

      {sigs.length > 0 && (
        <div className="insp-section">
          <div className="eyebrow insp-section-title">Señales detectadas · {sigs.length}</div>
          {sigs.map(s => (
            <div key={s.id} className={`insp-signal sev-${s.severity}`}>
              <div className="insp-signal-head">
                <span className="sev-badge" style={{ background: 'var(--sev-bg)', color: 'var(--sev-fg)' }}>
                  <span style={{ background: 'var(--sev-color)', width: 6, height: 6, borderRadius: 999 }}/>
                  {s.severity}
                </span>
                <span className="insp-signal-score mono">score {s.score}</span>
              </div>
              <div className="insp-signal-title">{s.title}</div>
              <div className="insp-signal-desc">{s.desc}</div>
              <div className="insp-signal-norma">{s.norma}</div>
            </div>
          ))}
        </div>
      )}

      <div className="insp-section">
        <div className="eyebrow insp-section-title">Relaciones · {myEdges.length}</div>
        <div className="insp-edges">
          {myEdges.slice(0, 6).map((e, i) => {
            const otherId = e.from === entityId ? e.to : e.from;
            const other = ENTITIES[otherId];
            if (!other) return null;
            return (
              <div key={i} className="insp-edge">
                <div className={`insp-edge-icon ent-${other.type}`}><EntIcon type={other.type} size={12}/></div>
                <div className="insp-edge-text">
                  <div className="insp-edge-label">{other.label}</div>
                  <div className="insp-edge-rel mono">{e.label}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="insp-actions">
        <button className="top-action primary"><>{I.sparkles({ s: 12 })} Pedirle a la IA que analice</></button>
        <button className="top-action"><>{I.pin({ s: 12 })} Anclar al tablero</></button>
        <button className="top-action"><>{I.share({ s: 12 })} Exportar</></button>
      </div>
    </aside>
  );
}

Object.assign(window, { Inspector });
