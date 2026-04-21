// ─── Table View ──────────────────────────────────────────────────
// Spreadsheet view of contracts/entities with filters + sort + export.

function TableView({ pinnedEntityIds, onPinEntity, onSelectEntity }) {
  const [sortKey, setSortKey] = React.useState('amount');
  const [sortDir, setSortDir] = React.useState('desc');
  const [filterYear, setFilterYear] = React.useState('all');
  const [filterTipo, setFilterTipo] = React.useState('all');
  const [filterSignal, setFilterSignal] = React.useState('all');

  // Build contract rows — one per contrato entity + enrich with supplier + agency + signals
  const rows = React.useMemo(() => {
    const contracts = Object.values(ENTITIES).filter(e => e.type === 'Contrato');
    return contracts.map(c => {
      const supplierEdge = EDGES.find(e => e.to === c.id && e.label === 'titular');
      const supplier = supplierEdge ? ENTITIES[supplierEdge.from] : null;
      const agencyEdge = supplier ? EDGES.find(e => e.to === supplier.id && e.label === 'adjudica') : null;
      const agency = agencyEdge ? ENTITIES[agencyEdge.from] : null;
      const sigs = supplier ? SIGNALS.filter(s => s.subject === supplier.id) : [];
      const topSig = sigs.sort((a, b) => b.score - a.score)[0];
      return {
        id: c.id,
        code: c.label,
        desc: c.desc,
        amount: c.amount,
        year: c.year,
        tipo: c.tipo,
        supplier_id: supplier?.id,
        supplier: supplier?.label || '—',
        agency: agency?.label || '—',
        topSig,
        pinned: pinnedEntityIds.includes(supplier?.id) || pinnedEntityIds.includes(c.id),
      };
    });
  }, [pinnedEntityIds]);

  const filtered = rows.filter(r => {
    if (filterYear !== 'all' && String(r.year) !== filterYear) return false;
    if (filterTipo !== 'all' && r.tipo !== filterTipo) return false;
    if (filterSignal === 'any' && !r.topSig) return false;
    if (filterSignal === 'grave' && r.topSig?.severity !== 'grave') return false;
    if (filterSignal === 'moderada' && r.topSig?.severity !== 'moderada') return false;
    return true;
  }).sort((a, b) => {
    const mul = sortDir === 'asc' ? 1 : -1;
    const av = a[sortKey], bv = b[sortKey];
    if (av == null) return 1;
    if (bv == null) return -1;
    if (typeof av === 'number') return (av - bv) * mul;
    return String(av).localeCompare(String(bv)) * mul;
  });

  const total = filtered.reduce((acc, r) => acc + r.amount, 0);

  const setSort = (k) => {
    if (sortKey === k) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir('desc'); }
  };
  const SortCaret = ({ k }) => sortKey === k ? (
    <span className="tv-sort-caret">{sortDir === 'asc' ? '▲' : '▼'}</span>
  ) : null;

  const years = Array.from(new Set(rows.map(r => r.year))).sort((a,b) => b-a);
  const tipos = Array.from(new Set(rows.map(r => r.tipo)));

  return (
    <div className="tableview">
      <div className="tv-toolbar">
        <div className="tv-filters">
          <label className="tv-filter">
            <span>Año</span>
            <select value={filterYear} onChange={e => setFilterYear(e.target.value)}>
              <option value="all">Todos</option>
              {years.map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label className="tv-filter">
            <span>Tipo</span>
            <select value={filterTipo} onChange={e => setFilterTipo(e.target.value)}>
              <option value="all">Todos</option>
              {tipos.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </label>
          <label className="tv-filter">
            <span>Señal</span>
            <select value={filterSignal} onChange={e => setFilterSignal(e.target.value)}>
              <option value="all">Todas</option>
              <option value="any">Cualquiera</option>
              <option value="grave">Grave</option>
              <option value="moderada">Moderada</option>
            </select>
          </label>
        </div>

        <div className="tv-summary">
          <div><span className="tv-summary-num">{filtered.length}</span> contratos</div>
          <div><span className="tv-summary-num">{fmtARSshort(total)}</span> total</div>
        </div>

        <div className="tv-actions">
          <button className="top-action">{I.ext({ s: 12 })} CSV</button>
          <button className="top-action">{I.ext({ s: 12 })} JSON</button>
        </div>
      </div>

      <div className="tv-scroll">
        <table className="tv-table">
          <thead>
            <tr>
              <th style={{width: 32}}></th>
              <th className="tv-sort" onClick={() => setSort('code')}>Código <SortCaret k="code"/></th>
              <th className="tv-sort" onClick={() => setSort('desc')}>Descripción <SortCaret k="desc"/></th>
              <th className="tv-sort" onClick={() => setSort('supplier')}>Proveedor <SortCaret k="supplier"/></th>
              <th className="tv-sort" onClick={() => setSort('agency')}>Organismo <SortCaret k="agency"/></th>
              <th className="tv-sort tv-num" onClick={() => setSort('amount')}>Monto <SortCaret k="amount"/></th>
              <th className="tv-sort" onClick={() => setSort('year')}>Año <SortCaret k="year"/></th>
              <th>Tipo</th>
              <th>Señal</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(r => (
              <tr key={r.id} className={r.pinned ? 'is-pinned' : ''} onClick={() => r.supplier_id && onSelectEntity(r.supplier_id)}>
                <td className="tv-pin-cell">
                  <button
                    className={`tv-pin ${r.pinned ? 'on' : ''}`}
                    onClick={(ev) => { ev.stopPropagation(); r.supplier_id && onPinEntity(r.supplier_id); }}
                    title={r.pinned ? 'Pinneado' : 'Pinear proveedor'}
                  >
                    {I.pin({ s: 12 })}
                  </button>
                </td>
                <td className="mono tv-mono">{r.code}</td>
                <td className="tv-desc">{r.desc}</td>
                <td className="tv-supplier">
                  <span className="ent-dot ent-Empresa"/>
                  <span>{r.supplier}</span>
                </td>
                <td className="tv-agency">{r.agency}</td>
                <td className="tv-num mono">{fmtARS(r.amount)}</td>
                <td className="mono tv-year">{r.year}</td>
                <td>
                  <span className="tv-tipo-pill">{r.tipo}</span>
                </td>
                <td>
                  {r.topSig ? (
                    <span className={`sev-badge sev-${r.topSig.severity}`}>
                      {r.topSig.severity} · {r.topSig.score}
                    </span>
                  ) : <span className="tv-nosig">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="tv-footer">
        {filtered.length} filas · ordenado por <b>{sortKey}</b> {sortDir === 'asc' ? '↑' : '↓'} · fuente: Portal de Datos Abiertos · Municipalidad de Córdoba
      </div>
    </div>
  );
}

Object.assign(window, { TableView });
