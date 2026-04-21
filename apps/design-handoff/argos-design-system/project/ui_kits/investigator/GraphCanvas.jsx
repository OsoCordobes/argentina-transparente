function GraphCanvas({ selectedId, onSelect }) {
  const nodes = MOCK_GRAPH_NODES;
  const TypeIcon = { Empresa: Icons.Building, Persona: Icons.User, Contrato: Icons.FileText, Agencia: Icons.Building };

  const nodeById = Object.fromEntries(nodes.map(n => [n.id, n]));
  const edges = MOCK_GRAPH_EDGES.map(e => ({ ...e, a: nodeById[e.from], b: nodeById[e.to] })).filter(e => e.a && e.b);

  return (
    <div className="canvas">
      <svg className="edges">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
            <path d="M0 0 L10 5 L0 10 z" fill="#94a3b8" />
          </marker>
        </defs>
        {edges.map((e, i) => {
          const x1 = e.a.x + 70, y1 = e.a.y + 24;
          const x2 = e.b.x + 70, y2 = e.b.y + 24;
          const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
          return (
            <g key={i}>
              <line className="edge" x1={x1} y1={y1} x2={x2} y2={y2} markerEnd="url(#arrow)" />
              <rect x={mx - 22} y={my - 7} width="44" height="14" fill="#fff" stroke="#e2e8f0" rx="3"/>
              <text className="edge-lbl" x={mx} y={my + 3} textAnchor="middle">{e.label}</text>
            </g>
          );
        })}
      </svg>
      {nodes.map((n) => {
        const Ic = TypeIcon[n.type] || Icons.FileText;
        return (
          <div
            key={n.id}
            className={`enode ${n.type} ${selectedId === n.id ? 'selected' : ''}`}
            style={{ left: n.x, top: n.y }}
            onClick={() => onSelect(n.id)}
          >
            <div className="tag"><Ic /> {n.type}</div>
            <div className="name">{n.label}</div>
          </div>
        );
      })}
      <div className="canvas-controls">
        <button title="Zoom in"><Icons.Plus size={12} /></button>
        <button title="Zoom out"><Icons.Minus size={12} /></button>
        <button title="Fit view"><Icons.Maximize size={12} /></button>
      </div>
      <div className="minimap">
        <svg width="150" height="90" viewBox="0 0 800 500">
          <rect width="800" height="500" fill="#f8fafc"/>
          {edges.map((e, i) => (
            <line key={i} x1={e.a.x + 70} y1={e.a.y + 24} x2={e.b.x + 70} y2={e.b.y + 24} stroke="#cbd5e1" strokeWidth="2"/>
          ))}
          {nodes.map((n, i) => {
            const fill = { Empresa: '#93c5fd', Persona: '#6ee7b7', Contrato: '#fcd34d', Agencia: '#c4b5fd' }[n.type] || '#cbd5e1';
            return <rect key={i} x={n.x + 50} y={n.y + 14} width="40" height="20" rx="3" fill={fill} />;
          })}
        </svg>
      </div>
    </div>
  );
}

window.GraphCanvas = GraphCanvas;
