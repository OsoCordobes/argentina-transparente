function InvestigatorApp() {
  const [viewMode, setViewMode]     = React.useState('graph');
  const [showAI, setShowAI]         = React.useState(true);
  const [selectedId, setSelectedId] = React.useState('e1');
  const [pinned, setPinned]         = React.useState(new Set(['e1', 'a1', 'p1', 'c1', 'c2', 'e2']));

  const onPin = (e) => {
    setPinned(p => { const next = new Set(p); next.has(e.id) ? next.delete(e.id) : next.add(e.id); return next; });
  };

  return (
    <div className="app">
      <aside className="rail-l" data-screen-label="01 Left rail · Search">
        <div className="brand">
          <div className="mark">
            <svg viewBox="0 0 52 52" fill="none">
              <line x1="14" y1="16" x2="26" y2="36" stroke="currentColor" strokeWidth="2"/>
              <line x1="38" y1="16" x2="26" y2="36" stroke="currentColor" strokeWidth="2"/>
              <line x1="14" y1="16" x2="38" y2="16" stroke="currentColor" strokeWidth="2"/>
              <circle cx="14" cy="16" r="5" fill="#fff" stroke="currentColor" strokeWidth="2"/>
              <circle cx="38" cy="16" r="5" fill="#fff" stroke="currentColor" strokeWidth="2"/>
              <circle cx="26" cy="36" r="6" fill="#2563eb"/>
            </svg>
          </div>
          <div className="name">Argos</div>
          <div className="ver">v3</div>
        </div>
        <EntitySearchDrawer onPin={onPin} pinned={pinned} />
      </aside>

      <div className="center" data-screen-label="02 Center · Graph + AI">
        <Toolbar viewMode={viewMode} setViewMode={setViewMode} showAI={showAI} setShowAI={setShowAI} />
        {viewMode === 'graph'
          ? <GraphCanvas selectedId={selectedId} onSelect={setSelectedId} />
          : <TimelineView />}
        {showAI && <AIChatPanel onClose={() => setShowAI(false)} />}
      </div>

      {selectedId && (
        <aside className="rail-r" data-screen-label="03 Right rail · Inspector">
          <NodeInspector nodeId={selectedId} onClose={() => setSelectedId(null)} />
        </aside>
      )}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<InvestigatorApp />);
