function NodeInspector({ nodeId, onClose }) {
  const [tab, setTab] = React.useState('signals');
  const node = MOCK_GRAPH_NODES.find(n => n.id === nodeId);
  if (!node) return null;
  const details = MOCK_ENTITIES.find(e => e.id === nodeId) || {};

  return (
    <>
      <div className="insp-header" style={{ position: 'relative' }}>
        <button className="btn icon sm close" style={{ position: 'absolute', top: 8, right: 8 }} onClick={onClose}>
          <Icons.X size={12} />
        </button>
        <div className="kind">{node.type}</div>
        <div className="title">{node.label}</div>
        {details.cuit && <div className="meta">{details.cuit}{details.contracts != null ? ` · ${details.contracts} contratos` : ''}</div>}
      </div>
      <div className="tabs">
        <div className={`tab ${tab === 'signals' ? 'active' : ''}`} onClick={() => setTab('signals')}>Señales</div>
        <div className={`tab ${tab === 'contracts' ? 'active' : ''}`} onClick={() => setTab('contracts')}>Contratos</div>
        <div className={`tab ${tab === 'notes' ? 'active' : ''}`} onClick={() => setTab('notes')}>Notas</div>
      </div>
      <div className="tab-body">
        {tab === 'signals' && (
          <>
            {MOCK_SIGNALS.map(s => (
              <div className={`signal ${s.severity}`} key={s.id}>
                <div className="signal-hd">
                  <span className={`sev ${s.severity}`}>{s.severity}</span>
                  <span className="score">· {s.score}</span>
                </div>
                <div className="title">{s.title}</div>
                <div className="desc">{s.desc}</div>
                <a className="src" href="#" onClick={(e) => e.preventDefault()}>
                  <Icons.External /> {s.source}
                </a>
              </div>
            ))}
          </>
        )}
        {tab === 'contracts' && (
          <div>
            {MOCK_CONTRACTS.map(c => (
              <div className="contract-row" key={c.id}>
                <div>
                  <div className="year">{c.year}</div>
                </div>
                <div>
                  <div className="label">{c.type}</div>
                  <div className="sub">{c.area}</div>
                </div>
                <div className="amt">{fmtARS(c.amount)}</div>
              </div>
            ))}
          </div>
        )}
        {tab === 'notes' && (
          <div style={{ color: 'var(--fg-muted)', fontSize: 12, lineHeight: 1.55 }}>
            <p style={{ margin: '0 0 8px' }}>Sin notas para esta entidad.</p>
            <button className="btn sm outline"><Icons.Plus /> Agregar nota</button>
          </div>
        )}
      </div>
    </>
  );
}

window.NodeInspector = NodeInspector;
