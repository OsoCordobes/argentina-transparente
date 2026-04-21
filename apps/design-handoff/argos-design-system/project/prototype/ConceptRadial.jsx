// ─── Concept C: Radial Spotlight ─────────────────────────────────────
// Entity at the center, concentric rings of connections ordered by
// relevance (signals highlighted), like a radar / planetarium view.
// Edges are rays from the center. Signals glow on the outer ring.

function RadialSpotlight({ onSelect, selectedId }) {
  const ref = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 900, h: 700 });

  React.useEffect(() => {
    const el = ref.current; if (!el) return;
    const measure = () => {
      const r = el.getBoundingClientRect();
      if (r.width > 50 && r.height > 50) setDims({ w: r.width, h: r.height });
    };
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    measure();
    const id = setTimeout(measure, 100);
    return () => { ro.disconnect(); clearTimeout(id); };
  }, []);

  const cx = dims.w / 2, cy = dims.h / 2;
  const anchorId = 'e1';
  const anchor = ENTITIES[anchorId];

  // Inner ring: directors + agencies (the "insiders")
  const inner = ['p1','p2','a1','p4'].map(id => ENTITIES[id]).filter(Boolean);
  // Outer ring: contracts + donations + related companies
  const outer = ['c1','c2','c7','d1','e3','e4','e2','e5'].map(id => ENTITIES[id]).filter(Boolean);

  const R1 = Math.min(dims.w, dims.h) * 0.22;
  const R2 = Math.min(dims.w, dims.h) * 0.38;

  const innerAt = (i) => {
    const t = (i / inner.length) * Math.PI * 2 - Math.PI / 2;
    return { x: cx + Math.cos(t) * R1, y: cy + Math.sin(t) * R1, t };
  };
  const outerAt = (i) => {
    const t = (i / outer.length) * Math.PI * 2 - Math.PI / 2 + Math.PI / outer.length;
    return { x: cx + Math.cos(t) * R2, y: cy + Math.sin(t) * R2, t };
  };

  // Animated sweep line
  const [sweep, setSweep] = React.useState(0);
  React.useEffect(() => {
    let raf;
    const loop = (ts) => { setSweep((ts / 6000) * Math.PI * 2); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const sweepX = cx + Math.cos(sweep - Math.PI / 2) * (R2 + 40);
  const sweepY = cy + Math.sin(sweep - Math.PI / 2) * (R2 + 40);

  return (
    <div className="radial" ref={ref}>
      <div className="radial-bg"/>
      <svg className="radial-svg" width={dims.w} height={dims.h}>
        <defs>
          <radialGradient id="core-grad">
            <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.6"/>
            <stop offset="70%" stopColor="#1e40af" stopOpacity="0.1"/>
            <stop offset="100%" stopColor="#1e40af" stopOpacity="0"/>
          </radialGradient>
          <radialGradient id="sweep-grad" cx="0.5" cy="0.5" r="0.5">
            <stop offset="0%" stopColor="#60a5fa" stopOpacity="0.15"/>
            <stop offset="100%" stopColor="#60a5fa" stopOpacity="0"/>
          </radialGradient>
        </defs>

        {/* Rings */}
        <circle cx={cx} cy={cy} r={R1} fill="none" stroke="rgba(148,163,184,0.18)" strokeDasharray="2 4"/>
        <circle cx={cx} cy={cy} r={R2} fill="none" stroke="rgba(148,163,184,0.18)" strokeDasharray="2 4"/>
        <circle cx={cx} cy={cy} r={R2 + 40} fill="none" stroke="rgba(148,163,184,0.1)" strokeDasharray="1 6"/>

        {/* Cardinal labels */}
        {[0, 1, 2, 3].map(i => {
          const t = (i / 4) * Math.PI * 2 - Math.PI / 2;
          const lx = cx + Math.cos(t) * (R2 + 30);
          const ly = cy + Math.sin(t) * (R2 + 30);
          const labels = ['contratos', 'red societaria', 'aportes', 'agencias'];
          return <text key={i} x={lx} y={ly} fontSize="9" fill="rgba(148,163,184,0.5)" textAnchor="middle" dominantBaseline="middle" style={{ fontFamily: 'var(--font-mono)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>{labels[i]}</text>;
        })}

        {/* Core glow */}
        <circle cx={cx} cy={cy} r={80} fill="url(#core-grad)"/>

        {/* Rays from center to each node */}
        {inner.map((e, i) => {
          const p = innerAt(i);
          return <line key={'r1'+i} x1={cx} y1={cy} x2={p.x} y2={p.y} stroke="rgba(96,165,250,0.2)" strokeWidth="1"/>;
        })}
        {outer.map((e, i) => {
          const p = outerAt(i);
          const isGrave = SIGNALS.find(s => s.subject === e.id && s.severity === 'grave');
          return <line key={'r2'+i} x1={cx} y1={cy} x2={p.x} y2={p.y}
            stroke={isGrave ? 'rgba(239,68,68,0.5)' : 'rgba(96,165,250,0.12)'}
            strokeWidth={isGrave ? 1.5 : 1}/>;
        })}

        {/* Sweep */}
        <line x1={cx} y1={cy} x2={sweepX} y2={sweepY} stroke="rgba(96,165,250,0.25)" strokeWidth="40" strokeLinecap="round"/>
        <line x1={cx} y1={cy} x2={sweepX} y2={sweepY} stroke="rgba(96,165,250,0.8)" strokeWidth="1"/>
      </svg>

      {/* Center anchor node */}
      <button
        className={`radial-core ent-${anchor.type}`}
        style={{ left: cx, top: cy }}
        onClick={() => onSelect(anchorId)}
      >
        <div className="radial-core-icon"><EntIcon type={anchor.type} size={20}/></div>
        <div className="radial-core-label">{anchor.label}</div>
        <div className="radial-core-meta">{anchor.cuit}</div>
        <div className="radial-core-stat">{fmtARSshort(anchor.total)} · {anchor.contracts} contratos</div>
      </button>

      {/* Inner ring nodes */}
      {inner.map((e, i) => {
        const p = innerAt(i);
        const sig = SIGNALS.find(s => s.subject === e.id);
        return (
          <button key={e.id}
            className={`radial-node radial-node-inner ent-${e.type} ${selectedId===e.id?'is-selected':''} ${sig?'has-signal':''}`}
            style={{ left: p.x, top: p.y }}
            onClick={() => onSelect(e.id)}
          >
            <div className="radial-node-dot"><EntIcon type={e.type} size={14}/></div>
            <div className="radial-node-label">{e.label}</div>
          </button>
        );
      })}

      {/* Outer ring nodes */}
      {outer.map((e, i) => {
        const p = outerAt(i);
        const sig = SIGNALS.find(s => s.subject === e.id);
        return (
          <button key={e.id}
            className={`radial-node radial-node-outer ent-${e.type} ${selectedId===e.id?'is-selected':''} ${sig?`has-signal sev-${sig.severity}`:''}`}
            style={{ left: p.x, top: p.y }}
            onClick={() => onSelect(e.id)}
          >
            <div className="radial-node-dot"><EntIcon type={e.type} size={12}/></div>
            <div className="radial-node-label">{e.label}</div>
            {sig && <span className="radial-sig"/>}
          </button>
        );
      })}

      {/* Legend */}
      <div className="radial-legend">
        <div className="legend-title">RADAR · TECNOSERV SA</div>
        <div className="legend-rows">
          <div><span className="dot ent-Persona" style={{background:'#10b981'}}/>directores</div>
          <div><span className="dot ent-Agencia" style={{background:'#8b5cf6'}}/>agencias</div>
          <div><span className="dot ent-Contrato" style={{background:'#f59e0b'}}/>contratos</div>
          <div><span className="dot" style={{background:'#ef4444'}}/>señales graves</div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { RadialSpotlight });
