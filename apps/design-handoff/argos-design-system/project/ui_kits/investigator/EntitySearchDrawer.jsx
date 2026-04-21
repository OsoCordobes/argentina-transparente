function EntitySearchDrawer({ onPin, pinned = new Set() }) {
  const [q, setQ] = React.useState('');
  const results = MOCK_ENTITIES.filter(e =>
    !q || e.label.toLowerCase().includes(q.toLowerCase()) || (e.cuit || '').includes(q)
  );

  const typeColor = {
    Empresa:  { bg: '#eff6ff', fg: '#1d4ed8' },
    Persona:  { bg: '#ecfdf5', fg: '#047857' },
    Contrato: { bg: '#fffbeb', fg: '#b45309' },
    Agencia:  { bg: '#f5f3ff', fg: '#6d28d9' },
  };
  const TypeIcon = { Empresa: Icons.Building, Persona: Icons.User, Contrato: Icons.FileText, Agencia: Icons.Building };

  return (
    <>
      <div className="search-section">
        <p className="eyebrow">Buscar entidad</p>
        <div className="field">
          <Icons.Search />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Empresa, persona, CUIT…" />
        </div>
      </div>
      <div className="search-section" style={{ paddingTop: 0, paddingBottom: 6 }}>
        <p className="eyebrow">Resultados · {results.length}</p>
      </div>
      <div className="results">
        {results.map((e) => {
          const Ic = TypeIcon[e.type] || Icons.FileText;
          const c  = typeColor[e.type];
          return (
            <div key={e.id} className={`result ${pinned.has(e.id) ? 'pinned' : ''}`} onClick={() => onPin?.(e)}>
              <span className="icon" style={{ background: c.bg, color: c.fg }}><Ic /></span>
              <div style={{ minWidth: 0 }}>
                <div className="label">{e.label}</div>
                <div className="sub">{e.cuit}{e.contracts != null ? ` · ${e.contracts} contratos` : ''}</div>
              </div>
              <Icons.Pin size={13} className="pin" />
            </div>
          );
        })}
      </div>
    </>
  );
}

window.EntitySearchDrawer = EntitySearchDrawer;
