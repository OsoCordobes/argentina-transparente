// ─── Map View ────────────────────────────────────────────────────
// Schematic map of Córdoba Capital showing obras (public works) as bubbles.
// Not a real cartographic map — it's a stylized abstraction with zones +
// barrios labels + obra points sized by amount. Legible and fast.

const BARRIOS = [
  { id: 'centro',     name: 'Centro Histórico',    cx: 500, cy: 400, r: 55 },
  { id: 'nueva-cba',  name: 'Nueva Córdoba',       cx: 560, cy: 470, r: 45 },
  { id: 'alberdi',    name: 'Alberdi',             cx: 430, cy: 380, r: 42 },
  { id: 'gral-paz',   name: 'General Paz',         cx: 570, cy: 340, r: 40 },
  { id: 'cerro',      name: 'Cerro de las Rosas',  cx: 420, cy: 270, r: 50 },
  { id: 'san-vicente',name: 'San Vicente',         cx: 620, cy: 420, r: 45 },
  { id: 'alta-cba',   name: 'Alta Córdoba',        cx: 490, cy: 290, r: 48 },
  { id: 'lib-san-martin', name: 'Liberador San Martín', cx: 370, cy: 450, r: 40 },
  { id: 'villa-el-libertador', name: 'Villa El Libertador', cx: 560, cy: 620, r: 60 },
  { id: 'argüello',   name: 'Argüello',            cx: 330, cy: 240, r: 55 },
  { id: 'empalme',    name: 'Empalme',             cx: 680, cy: 490, r: 42 },
  { id: 'teodoro-f',  name: 'Teodoro Fels',        cx: 280, cy: 380, r: 42 },
];

// Obras (work sites) with supplier + amount
const OBRAS = [
  { id: 'o1', barrio: 'centro',     label: 'Pavimentación Ruta S‑271', supplier: 'e1', amount: 48200000, year: 2023 },
  { id: 'o2', barrio: 'gral-paz',   label: 'Alumbrado Zona Oeste',     supplier: 'e1', amount: 19800000, year: 2022 },
  { id: 'o3', barrio: 'san-vicente',label: 'Bacheo y reparación',      supplier: 'e4', amount:  6230000, year: 2021 },
  { id: 'o4', barrio: 'villa-el-libertador', label: 'Recolección residuos', supplier: 'e5', amount: 92400000, year: 2023 },
  { id: 'o5', barrio: 'alta-cba',   label: 'Servicios generales',      supplier: 'e2', amount: 12400000, year: 2021 },
  { id: 'o6', barrio: 'nueva-cba',  label: 'Mantenimiento vehicular',  supplier: 'e3', amount:  8450000, year: 2022 },
  { id: 'o7', barrio: 'cerro',      label: 'Nueva adjudicación',       supplier: 'e1', amount: 68400000, year: 2024 },
  { id: 'o8', barrio: 'alberdi',    label: 'Provisión insumos salud',  supplier: 'e1', amount:  5100000, year: 2019 },
];

function MapView({ pinnedEntityIds, onSelectEntity, onPinEntity }) {
  const [layer, setLayer] = React.useState('obras');
  const [hover, setHover] = React.useState(null);

  // Spend per barrio (for choropleth)
  const barrioSpend = React.useMemo(() => {
    const map = {};
    OBRAS.forEach(o => { map[o.barrio] = (map[o.barrio] || 0) + o.amount; });
    return map;
  }, []);
  const maxSpend = Math.max(...Object.values(barrioSpend));

  const choroplethColor = (b) => {
    if (layer !== 'concentracion') return 'var(--gray-100)';
    const t = (barrioSpend[b.id] || 0) / maxSpend;
    // Blue intensity
    const a = 0.15 + t * 0.55;
    return `rgba(37,99,235,${a.toFixed(2)})`;
  };

  // Sum per supplier
  const supplierTotals = React.useMemo(() => {
    const out = {};
    OBRAS.forEach(o => { out[o.supplier] = (out[o.supplier] || 0) + o.amount; });
    return out;
  }, []);

  const obraRadius = (amount) => {
    const maxA = Math.max(...OBRAS.map(o => o.amount));
    return 5 + (amount / maxA) * 22;
  };

  return (
    <div className="mapview">
      <div className="mv-toolbar">
        <div className="mv-layers">
          <span className="eyebrow">Capas</span>
          <div className="mv-layer-btns">
            <button className={layer === 'obras' ? 'on' : ''} onClick={() => setLayer('obras')}>Obras</button>
            <button className={layer === 'concentracion' ? 'on' : ''} onClick={() => setLayer('concentracion')}>Concentración</button>
            <button className={layer === 'proveedores' ? 'on' : ''} onClick={() => setLayer('proveedores')}>Por proveedor</button>
          </div>
        </div>
        <div className="mv-title">
          <div className="eyebrow">Municipio</div>
          <div className="mv-title-name">Córdoba Capital · 2019–2024</div>
        </div>
        <div className="mv-stats">
          <div><span className="mv-stat-num">{OBRAS.length}</span> obras</div>
          <div><span className="mv-stat-num">{fmtARSshort(OBRAS.reduce((a,o)=>a+o.amount,0))}</span> total</div>
        </div>
      </div>

      <div className="mv-stage">
        <svg viewBox="100 100 720 600" preserveAspectRatio="xMidYMid meet" className="mv-svg">
          {/* River (Suquía) — abstract */}
          <path
            d="M 120 350 Q 300 320, 500 350 T 820 380"
            fill="none" stroke="var(--blue-300)" strokeWidth="6" strokeLinecap="round" opacity="0.35"
          />
          <text x="140" y="340" className="mv-river-label">Río Suquía</text>

          {/* Barrio zones */}
          {BARRIOS.map(b => (
            <g key={b.id} className="mv-barrio">
              <circle
                cx={b.cx} cy={b.cy} r={b.r}
                fill={choroplethColor(b)}
                stroke="var(--gray-300)"
                strokeWidth="1"
                strokeDasharray="3 4"
              />
              <text x={b.cx} y={b.cy - b.r - 6} className="mv-barrio-label" textAnchor="middle">
                {b.name}
              </text>
              {layer === 'concentracion' && (
                <text x={b.cx} y={b.cy + 4} className="mv-barrio-value" textAnchor="middle">
                  {fmtARSshort(barrioSpend[b.id] || 0)}
                </text>
              )}
            </g>
          ))}

          {/* Obras */}
          {layer !== 'concentracion' && OBRAS.map(o => {
            const b = BARRIOS.find(b => b.id === o.barrio);
            if (!b) return null;
            const isPinned = pinnedEntityIds.includes(o.supplier);
            const r = obraRadius(o.amount);
            const supplier = ENTITIES[o.supplier];
            const topSig = SIGNALS.filter(s => s.subject === o.supplier)[0];
            const color = topSig?.severity === 'grave' ? 'var(--red-500)'
                        : topSig?.severity === 'moderada' ? 'var(--amber-500)'
                        : 'var(--blue-500)';
            // offset within barrio — tiny jitter
            const a = (o.id.charCodeAt(1) % 7) * 0.9;
            const jx = Math.cos(a) * (b.r * 0.3);
            const jy = Math.sin(a) * (b.r * 0.3);
            return (
              <g
                key={o.id}
                className={`mv-obra ${isPinned ? 'is-pinned' : ''}`}
                onMouseEnter={() => setHover(o.id)}
                onMouseLeave={() => setHover(null)}
                onClick={() => onSelectEntity(o.supplier)}
              >
                <circle cx={b.cx + jx} cy={b.cy + jy} r={r + 4} fill={color} opacity="0.15"/>
                <circle cx={b.cx + jx} cy={b.cy + jy} r={r} fill={color} opacity="0.7" stroke="#fff" strokeWidth="1.5"/>
                {isPinned && (
                  <circle cx={b.cx + jx} cy={b.cy + jy} r={r + 2} fill="none" stroke={color} strokeWidth="2"/>
                )}
              </g>
            );
          })}

          {/* Hovered tooltip */}
          {hover && (() => {
            const o = OBRAS.find(x => x.id === hover);
            if (!o) return null;
            const b = BARRIOS.find(b => b.id === o.barrio);
            const supplier = ENTITIES[o.supplier];
            return (
              <g pointerEvents="none">
                <rect x={b.cx + 30} y={b.cy - 40} width="230" height="72" rx="6" fill="var(--surface)" stroke="var(--border)"/>
                <text x={b.cx + 42} y={b.cy - 22} className="mv-tip-title">{o.label}</text>
                <text x={b.cx + 42} y={b.cy - 6} className="mv-tip-sub">{supplier?.label} · {o.year}</text>
                <text x={b.cx + 42} y={b.cy + 12} className="mv-tip-amt">{fmtARS(o.amount)}</text>
              </g>
            );
          })()}
        </svg>
      </div>

      {/* Legend */}
      <div className="mv-legend">
        {layer === 'obras' ? (
          <>
            <div className="mv-legend-item"><span className="mv-legend-dot" style={{background:'var(--red-500)'}}/> Proveedor con señal grave</div>
            <div className="mv-legend-item"><span className="mv-legend-dot" style={{background:'var(--amber-500)'}}/> Proveedor con señal moderada</div>
            <div className="mv-legend-item"><span className="mv-legend-dot" style={{background:'var(--blue-500)'}}/> Sin señales</div>
            <div className="mv-legend-item mv-legend-size">Tamaño = monto</div>
          </>
        ) : layer === 'concentracion' ? (
          <>
            <div className="mv-legend-scale">
              <span>bajo</span>
              <span className="mv-legend-scale-bar"/>
              <span>alto</span>
            </div>
            <div className="mv-legend-item">Gasto acumulado por barrio</div>
          </>
        ) : (
          <>
            {Object.entries(supplierTotals).map(([sid, total]) => (
              <div key={sid} className="mv-legend-item">
                <span className="mv-legend-dot" style={{background:'var(--blue-500)'}}/>
                {ENTITIES[sid]?.label} · {fmtARSshort(total)}
              </div>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { MapView });
