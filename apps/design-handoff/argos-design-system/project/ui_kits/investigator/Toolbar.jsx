function Toolbar({ viewMode, setViewMode, showAI, setShowAI }) {
  return (
    <div className="toolbar">
      <button className={`btn sm ${viewMode === 'graph' ? 'active' : ''}`} onClick={() => setViewMode('graph')}>
        <Icons.Network /> Grafo
      </button>
      <button className={`btn sm ${viewMode === 'timeline' ? 'active' : ''}`} onClick={() => setViewMode('timeline')}>
        <Icons.Clock /> Línea de tiempo
      </button>
      <div style={{ flex: 1 }} />
      <button className="btn sm outline"><Icons.Filter /> Filtros</button>
      <button className="btn sm outline"><Icons.Download /> Exportar</button>
      <button className={`btn sm ${showAI ? 'primary' : 'outline'}`} onClick={() => setShowAI(v => !v)}>
        <Icons.Bot /> IA {showAI && <Icons.X size={12} />}
      </button>
    </div>
  );
}

window.Toolbar = Toolbar;
