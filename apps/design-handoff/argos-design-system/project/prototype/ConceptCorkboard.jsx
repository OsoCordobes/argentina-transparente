// ─── Concept B: Evidence Corkboard ───────────────────────────────
// Movie-style detective corkboard. Entity "cards" pinned with push-pins.
// Red string connects them. Photos = entity color blocks. Notes = small
// sticky-note cards. Slight rotation on each card for that handmade feel.

function Corkboard({ onSelect, selectedId }) {
  const boardRef = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 1000, h: 700 });

  React.useEffect(() => {
    const el = boardRef.current; if (!el) return;
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

  // Hand-placed layout — cards scattered like on a real board
  const cardPos = React.useMemo(() => {
    const W = dims.w, H = dims.h;
    return {
      'e1': { x: W*0.48, y: H*0.42, rot: -1.5, kind: 'photo',    w: 180 },
      'p1': { x: W*0.18, y: H*0.22, rot:  2.2, kind: 'photo',    w: 160 },
      'p2': { x: W*0.14, y: H*0.62, rot: -2.8, kind: 'photo',    w: 160 },
      'p4': { x: W*0.82, y: H*0.18, rot:  1.8, kind: 'photo',    w: 170 },
      'a1': { x: W*0.80, y: H*0.50, rot: -1.0, kind: 'doc',      w: 190 },
      'd1': { x: W*0.50, y: H*0.78, rot:  2.5, kind: 'receipt',  w: 170 },
      'c1': { x: W*0.28, y: H*0.82, rot: -3.2, kind: 'receipt',  w: 160 },
      'c7': { x: W*0.72, y: H*0.80, rot:  1.2, kind: 'receipt',  w: 160 },
      'e4': { x: W*0.88, y: H*0.82, rot: -2.0, kind: 'photo',    w: 150 },
      'note1': { x: W*0.34, y: H*0.08, rot: -4.5, kind: 'note', w: 180,
        text: '¿Por qué siempre gana TECNOSERV?' },
      'note2': { x: W*0.62, y: H*0.05, rot:  3.5, kind: 'note', w: 180,
        text: 'Cruzar aportes 2019 con contratos 2020-23' },
    };
  }, [dims]);

  // String connections — only the juiciest edges (full graph would be chaos)
  const strings = [
    { from: 'e1', to: 'a1', style: 'red' },
    { from: 'e1', to: 'd1', style: 'red' },
    { from: 'd1', to: 'p4', style: 'red' },
    { from: 'p4', to: 'a1', style: 'red' },
    { from: 'p1', to: 'e1', style: 'yellow' },
    { from: 'p2', to: 'e1', style: 'yellow' },
    { from: 'e1', to: 'c1', style: 'white' },
    { from: 'e1', to: 'c7', style: 'white' },
    { from: 'p1', to: 'e4', style: 'yellow' },
  ];

  return (
    <div className="corkboard" ref={boardRef}>
      <div className="cork-texture"/>

      {/* Strings (SVG layer, under cards) */}
      <svg className="cork-strings" width={dims.w} height={dims.h}>
        {strings.map((s, i) => {
          const a = cardPos[s.from], b = cardPos[s.to];
          if (!a || !b) return null;
          const color = s.style === 'red' ? '#dc2626' : s.style === 'yellow' ? '#eab308' : '#f3f4f6';
          // slight sag
          const midX = (a.x + b.x)/2, midY = (a.y + b.y)/2 + 14;
          return (
            <path key={i}
              d={`M ${a.x} ${a.y} Q ${midX} ${midY} ${b.x} ${b.y}`}
              stroke={color} strokeWidth="1.8"
              fill="none" opacity="0.85"
              strokeLinecap="round"
            />
          );
        })}
      </svg>

      {/* Cards */}
      {Object.entries(cardPos).map(([id, p]) => {
        if (p.kind === 'note') {
          return (
            <div key={id} className="cork-card cork-note"
                 style={{ left: p.x, top: p.y, width: p.w, transform: `translate(-50%,-50%) rotate(${p.rot}deg)` }}>
              <span className="cork-pin"/>
              <div className="cork-note-text">{p.text}</div>
            </div>
          );
        }
        const ent = ENTITIES[id]; if (!ent) return null;
        const sig = SIGNALS.find(s => s.subject === id);
        const isSelected = selectedId === id;
        return (
          <button key={id}
            className={`cork-card cork-${p.kind} ent-${ent.type} ${isSelected ? 'is-selected' : ''}`}
            style={{ left: p.x, top: p.y, width: p.w, transform: `translate(-50%,-50%) rotate(${p.rot}deg)` }}
            onClick={() => onSelect(id)}
          >
            <span className="cork-pin"/>
            {p.kind === 'photo' && (
              <>
                <div className="cork-photo">
                  <EntIcon type={ent.type} size={34}/>
                </div>
                <div className="cork-caption">
                  <div className="cork-name">{ent.label}</div>
                  {ent.cuit && <div className="cork-meta">{ent.cuit}</div>}
                </div>
              </>
            )}
            {p.kind === 'doc' && (
              <div className="cork-doc">
                <div className="cork-doc-head">
                  <EntIcon type={ent.type} size={14}/> <span>{ent.label}</span>
                </div>
                <div className="cork-doc-lines">
                  <span></span><span></span><span style={{width:'60%'}}></span>
                </div>
                <div className="cork-doc-stamp">EXPEDIENTE</div>
              </div>
            )}
            {p.kind === 'receipt' && (
              <div className="cork-receipt">
                <div className="cork-receipt-head">{ent.label}</div>
                <div className="cork-receipt-desc">{ent.desc || ent.sub}</div>
                {ent.amount && <div className="cork-receipt-amt">{fmtARSshort(ent.amount)}</div>}
                <div className="cork-receipt-stamp">{ent.year || ''}</div>
              </div>
            )}
            {sig && <span className="cork-sig-tag sev-grave sev-badge">{sig.tipologia.replace('_', ' ')}</span>}
          </button>
        );
      })}

      {/* Board overlay controls */}
      <div className="cork-overlay-tl">
        <div className="cork-title">Tablero · Pavimentación Ruta S-271</div>
        <div className="cork-sub">14 entidades · 9 hilos · última edición hace 20 min</div>
      </div>
      <div className="cork-overlay-tr">
        <div className="cork-legend">
          <span><i style={{background:'#dc2626'}}/>conexión fuerte</span>
          <span><i style={{background:'#eab308'}}/>directorio</span>
          <span><i style={{background:'#f3f4f6'}}/>contrato</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Corkboard });
