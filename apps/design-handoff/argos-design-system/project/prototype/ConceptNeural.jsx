// ─── Concept A: Neural Canvas ────────────────────────────────────────
// Dark, cinematic. Nodes drift gently. Edges pulse. Searching an entity
// flies the camera to that node and explodes its connections outward.
// Inspector slides in from the right.

function NeuralCanvas({ onSelect, selectedId, focus, setFocus }) {
  const canvasRef = React.useRef(null);
  const [dims, setDims] = React.useState({ w: 800, h: 600 });

  React.useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
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

  // Force-ish layout: stable seeded positions per entity id
  const layout = React.useMemo(() => {
    const cx = dims.w / 2, cy = dims.h / 2;
    const anchor = 'e1'; // focus node
    const pos = {};
    pos[anchor] = { x: cx, y: cy };
    // 1-hop neighbors on a circle
    const hop1 = EDGES.filter(e => e.from === anchor || e.to === anchor)
      .map(e => e.from === anchor ? e.to : e.from);
    const uniq1 = [...new Set(hop1)];
    const R1 = Math.min(dims.w, dims.h) * 0.26;
    uniq1.forEach((id, i) => {
      const t = (i / uniq1.length) * Math.PI * 2 - Math.PI / 2;
      pos[id] = { x: cx + Math.cos(t) * R1, y: cy + Math.sin(t) * R1 };
    });
    // 2-hop outside ring — larger radius, more spread
    const R2 = Math.min(dims.w, dims.h) * 0.44;
    const placed = new Set([anchor, ...uniq1]);
    const remaining = Object.keys(ENTITIES).filter(id => !placed.has(id));
    remaining.forEach((id, i) => {
      const t = (i / remaining.length) * Math.PI * 2 + 0.3;
      pos[id] = { x: cx + Math.cos(t) * R2, y: cy + Math.sin(t) * R2 };
    });
    return pos;
  }, [dims]);

  // Slow drift
  const [t, setT] = React.useState(0);
  React.useEffect(() => {
    let raf;
    const loop = (ts) => { setT(ts / 1000); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, []);

  const drift = (id, i) => {
    const seed = id.charCodeAt(0) + (id.charCodeAt(1) || 0);
    const dx = Math.sin(t * 0.2 + seed) * 2;
    const dy = Math.cos(t * 0.17 + seed * 1.3) * 1.6;
    return { dx, dy };
  };

  return (
    <div className="neural" ref={canvasRef}>
      <div className="neural-grid"/>

      {/* SVG layer for edges */}
      <svg className="neural-svg" width={dims.w} height={dims.h}>
        {EDGES.map((e, i) => {
          const a = layout[e.from], b = layout[e.to];
          if (!a || !b) return null;
          const ad = drift(e.from, i), bd = drift(e.to, i);
          const x1 = a.x + ad.dx, y1 = a.y + ad.dy;
          const x2 = b.x + bd.dx, y2 = b.y + bd.dy;
          const isGrave = (e.from === 'e1' && e.to === 'd1') || (e.from === 'p4' && e.to === 'd1');
          const isHot = selectedId && (e.from === selectedId || e.to === selectedId);
          const stroke = isGrave ? '#ef4444' : '#ffffff';
          const baseOp = isGrave ? 0.35 : 0.10;
          const op = isHot ? (isGrave ? 0.85 : 0.55) : baseOp;
          return (
            <line
              key={i}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke={stroke}
              strokeWidth={isHot ? 1.25 : 1}
              opacity={op}
            />
          );
        })}
      </svg>

      {/* Node layer */}
      {Object.entries(layout).map(([id, p], i) => {
        const ent = ENTITIES[id];
        if (!ent) return null;
        const d = drift(id, i);
        const isSelected = selectedId === id;
        const isAnchor = id === 'e1';
        const hasSignal = SIGNALS.some(s => s.subject === id);
        const gravityClass = isAnchor ? 'is-anchor' : (hasSignal ? 'has-signal' : '');
        return (
          <button
            key={id}
            className={`neural-node ent-${ent.type} ${gravityClass} ${isSelected ? 'is-selected' : ''}`}
            style={{ left: p.x + d.dx, top: p.y + d.dy }}
            onClick={() => onSelect(id)}
          >
            <span className="neural-node-core"/>
            <span className="neural-node-label">{ent.label}</span>
          </button>
        );
      })}

      {/* HUD */}
      <div className="neural-hud-tl">
        <div className="hud-row"><span className="hud-dot"/>en vivo</div>
        <div className="hud-row">{Object.keys(ENTITIES).length} entidades · {EDGES.length} relaciones</div>
      </div>
      <div className="neural-hud-br">
        <button className="hud-btn">{I.zoomOut({ s: 14 })}</button>
        <button className="hud-btn">{I.fit({ s: 14 })}</button>
        <button className="hud-btn">{I.zoomIn({ s: 14 })}</button>
      </div>
      <div className="neural-hud-tr">
        <span className="sev-badge sev-grave">2 graves</span>
        <span className="sev-badge sev-moderada">3 moderadas</span>
        <span className="sev-badge sev-leve">2 leves</span>
      </div>
    </div>
  );
}

Object.assign(window, { NeuralCanvas });
