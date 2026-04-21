// ─── ARGOS App Shell ─────────────────────────────────────────
// Composes: left rail, top bar, view switcher (5 views), Pistas sidebar,
// main canvas, AI sidebar (suggestions + chat), Feedback FAB.
//
// State model:
//   view         — 'board' | 'alerts' | 'boards' | 'dossier' (top-rail views)
//   concept      — 'grafo' | 'timeline' | 'mapa' | 'tabla' | 'dossier' (caso sub-views)
//   pinnedEntityIds / pinnedSignalIds / files / notes  — "Pistas" for the active caso
//   selectedId   — currently-selected entity (drives Inspector)
//   dismissed    — dismissed suggestion ids

const TWEAKS_DEFAULTS = /*EDITMODE-BEGIN*/{
  "view": "board",
  "concept": "grafo",
  "graphSub": "neural",
  "dossierMode": "forense",
  "pistasCollapsed": false,
  "aiCollapsed": false,
  "pupilColor": "#2563eb",
  "isPremium": false,
  "showTweaksBtn": true
}/*EDITMODE-END*/;

// The 5 sub-views of a caso (only shown when view='board')
const CASO_VIEWS = [
  { id: 'grafo',    label: 'Grafo',    kbd: 'G', icon: 'graph' },
  { id: 'timeline', label: 'Timeline', kbd: 'T', icon: 'timeline' },
  { id: 'mapa',     label: 'Mapa',     kbd: 'M', icon: 'map' },
  { id: 'tabla',    label: 'Tabla',    kbd: 'B', icon: 'table' },
  { id: 'dossier',  label: 'Dossier',  kbd: 'D', icon: 'dossier' },
];

function App() {
  const [state, setState] = React.useState(TWEAKS_DEFAULTS);
  const [selectedId, setSelectedId] = React.useState('e1');
  const [pinnedEntityIds, setPinnedEntityIds] = React.useState(['e1', 'e2', 'e6']);
  const [pinnedSignalIds, setPinnedSignalIds] = React.useState(['s1', 's3']);
  const [files, setFiles] = React.useState([
    { id: 'f1', filename: 'Decreto 412-2023.pdf', size: 834_000, ocr_status: 'done', sha256: 'a3f2e891c7d44b21' },
    { id: 'f2', filename: 'Balance TECNOSERV 2023.xlsx', size: 214_000, ocr_status: 'done', sha256: '7c1b0d4498ee02ff' },
    { id: 'f3', filename: 'Acta asamblea IGJ.pdf', size: 1_210_000, ocr_status: 'pending', sha256: null },
  ]);
  const [notes, setNotes] = React.useState([
    { id: 'n1', texto: 'Verificar si Pérez firmó también balances 2022. Llamar a contadora Altamira el martes.', anclada_a: 'e1', created_at: '2024-10-14' },
  ]);
  const [dismissed, setDismissed] = React.useState(new Set());
  const [tweaksOpen, setTweaksOpen] = React.useState(false);
  const [editMode, setEditMode] = React.useState(false);

  // Persist (lightweight; only the tweak-style keys)
  React.useEffect(() => {
    try {
      const saved = localStorage.getItem('argos-proto-state');
      if (saved) setState(s => ({ ...s, ...JSON.parse(saved) }));
    } catch {}
  }, []);
  React.useEffect(() => {
    try { localStorage.setItem('argos-proto-state', JSON.stringify(state)); } catch {}
  }, [state]);

  // Edit-mode protocol (Tweaks toggle)
  React.useEffect(() => {
    function onMsg(e) {
      if (e.data?.type === '__activate_edit_mode')   setEditMode(true);
      if (e.data?.type === '__deactivate_edit_mode') setEditMode(false);
    }
    window.addEventListener('message', onMsg);
    window.parent.postMessage({ type: '__edit_mode_available' }, '*');
    return () => window.removeEventListener('message', onMsg);
  }, []);

  // Keyboard shortcuts for view switching (only when in a caso / board view)
  React.useEffect(() => {
    function onKey(e) {
      if (state.view !== 'board') return;
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      const m = { g: 'grafo', t: 'timeline', m: 'mapa', b: 'tabla', d: 'dossier' };
      const c = m[e.key.toLowerCase()];
      if (c) { setState(s => ({ ...s, concept: c })); e.preventDefault(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [state.view]);

  const setTweak = (k, v) => {
    setState(s => ({ ...s, [k]: v }));
    window.parent.postMessage({ type: '__edit_mode_set_keys', edits: { [k]: v } }, '*');
  };

  // Pistas actions
  const pinEntity = (id) => setPinnedEntityIds(ids => ids.includes(id) ? ids : [...ids, id]);
  const unpinEntity = (id) => setPinnedEntityIds(ids => ids.filter(x => x !== id));
  const togglePinEntity = (id) => setPinnedEntityIds(ids => ids.includes(id) ? ids.filter(x => x !== id) : [...ids, id]);
  const unpinSignal = (id) => setPinnedSignalIds(ids => ids.filter(x => x !== id));
  const addFile = () => {
    const nm = prompt('Nombre de archivo (simulado):');
    if (!nm) return;
    setFiles(fs => [...fs, { id: 'f'+Date.now(), filename: nm, size: 120_000, ocr_status: 'pending', sha256: null }]);
  };
  const addNote = () => {
    const t = prompt('Nota:');
    if (!t) return;
    setNotes(ns => [...ns, { id: 'n'+Date.now(), texto: t, anclada_a: selectedId, created_at: new Date().toISOString().slice(0,10) }]);
  };

  // Suggestions (derived)
  const allSuggestions = React.useMemo(() => computeSuggestions(pinnedEntityIds), [pinnedEntityIds]);
  const suggestions = allSuggestions.filter(s => !dismissed.has(s.id));

  const acceptSuggestion = (s, a) => {
    if (a.target_entity_id) {
      setSelectedId(a.target_entity_id);
      pinEntity(a.target_entity_id);
    }
    if (a.label?.toLowerCase().includes('pinear señal') && s.kind === 'signal') {
      const sigId = s.id.replace(/^sig-/, '');
      setPinnedSignalIds(ids => ids.includes(sigId) ? ids : [...ids, sigId]);
    }
    setDismissed(d => new Set([...d, s.id]));
  };
  const dismissSuggestion = (id) => setDismissed(d => new Set([...d, id]));

  // Theme: dark only for grafo view (neural/radial feel)
  const isDarkView = state.view === 'board' && state.concept === 'grafo' && (state.graphSub === 'neural' || state.graphSub === 'radial');

  // Whether to render the full caso workspace (pistas + view + AI sidebar)
  const inCaso = state.view === 'board';

  const appClass = [
    'app',
    isDarkView ? 'dark' : '',
    inCaso ? 'mode-caso' : 'mode-simple',
    state.aiCollapsed ? 'ai-collapsed' : '',
    state.pistasCollapsed ? 'pistas-collapsed' : '',
  ].filter(Boolean).join(' ');

  // routeLabel used by the FeedbackFab
  const routeLabel = inCaso
    ? `caso/pavimentacion-s271/${state.concept}`
    : `/${state.view}`;

  return (
    <div className={appClass} data-screen-label={`ARGOS · ${state.view} · ${state.concept}`}>
      {/* ── Left rail ── */}
      <nav className="rail">
        <div className="rail-brand" title="ARGOS"><ArgosMark size={32} pupil={state.pupilColor}/></div>
        <button className={`rail-btn ${state.view==='board'?'is-active':''}`} onClick={() => setState(s => ({...s, view:'board'}))} title="Caso actual">{I.graph({ s: 18 })}</button>
        <button className={`rail-btn ${state.view==='alerts'?'is-active':''}`} onClick={() => setState(s => ({...s, view:'alerts'}))} title="Alertas">
          {I.alerts({ s: 18 })}
          <span className="badge">5</span>
        </button>
        <button className={`rail-btn ${state.view==='boards'?'is-active':''}`} onClick={() => setState(s => ({...s, view:'boards'}))} title="Todos los casos">{I.board({ s: 18 })}</button>
        <div className="rail-spacer"/>
        <button className="rail-btn" title="Configuración">{I.settings({ s: 18 })}</button>
        <div className="rail-avatar" title="María Clara">MC</div>
      </nav>

      {/* ── Top bar ── */}
      <header className="topbar">
        <div className="crumbs">
          <span>Córdoba Capital</span>
          <span className="chevron">{I.chevron({ s: 12 })}</span>
          <span>{inCaso ? 'Casos' : state.view === 'alerts' ? 'Monitoreo' : 'Investigaciones'}</span>
          <span className="chevron">{I.chevron({ s: 12 })}</span>
          <span className="current">
            {inCaso ? 'Pavimentación Ruta S-271'
             : state.view === 'alerts' ? 'Alertas'
             : 'Tableros guardados'}
          </span>
        </div>

        <div className="search">
          {I.search({ s: 14 })}
          <input placeholder="Buscar empresa, persona, CUIT, contrato…"/>
          <kbd className="kbd">⌘K</kbd>
        </div>

        <button className="top-action">{I.share({ s: 12 })} Compartir</button>
        <button className="top-action primary">{I.dossier({ s: 12 })} Exportar dossier</button>
      </header>

      {/* ── View bar (only in caso) ── */}
      {inCaso && (
        <div className="viewbar">
          <div className="viewbar-case">
            {state.concept === 'grafo'    && <span><b>Grafo</b> · red societaria</span>}
            {state.concept === 'timeline' && <span><b>Timeline</b> · eventos 2018–2024</span>}
            {state.concept === 'mapa'     && <span><b>Mapa</b> · obras por barrio</span>}
            {state.concept === 'tabla'    && <span><b>Tabla</b> · contratos</span>}
            {state.concept === 'dossier'  && <span><b>Dossier</b> · {state.dossierMode}</span>}
          </div>
          <div className="viewbar-sep"/>
          <div className="view-tabs" role="tablist">
            {CASO_VIEWS.map(v => (
              <button
                key={v.id}
                role="tab"
                aria-selected={state.concept === v.id}
                className={state.concept === v.id ? 'on' : ''}
                onClick={() => setState(s => ({ ...s, concept: v.id }))}
                title={`Cambiar a ${v.label} (${v.kbd})`}
              >
                {I[v.icon]?.({ s: 12 }) || null}
                <span>{v.label}</span>
                <span className="kbd">{v.kbd}</span>
              </button>
            ))}
          </div>

          {state.concept === 'grafo' && (
            <div className="graph-sub">
              <button className={state.graphSub==='neural'?'on':''}    onClick={()=>setTweak('graphSub','neural')}>Neural</button>
              <button className={state.graphSub==='corkboard'?'on':''} onClick={()=>setTweak('graphSub','corkboard')}>Corkboard</button>
              <button className={state.graphSub==='radial'?'on':''}    onClick={()=>setTweak('graphSub','radial')}>Radar</button>
            </div>
          )}

          <div className="viewbar-right">
            <button className="top-action">{I.filter({ s: 12 })} Filtros</button>
          </div>
        </div>
      )}

      {/* ── Pistas (left caso sidebar) ── */}
      {inCaso && (
        <PistasSidebar
          pinnedEntityIds={pinnedEntityIds}
          pinnedSignalIds={pinnedSignalIds}
          files={files}
          notes={notes}
          selectedId={selectedId}
          onSelectEntity={setSelectedId}
          onSelectSignal={() => {}}
          onRemoveEntity={unpinEntity}
          onRemoveSignal={unpinSignal}
          onAddFile={addFile}
          onAddNote={addNote}
          collapsed={state.pistasCollapsed}
          onToggleCollapse={() => setTweak('pistasCollapsed', !state.pistasCollapsed)}
        />
      )}

      {/* ── Main ── */}
      <main className="main">
        {!inCaso ? (
          state.view === 'alerts' ? <AlertsFeed/> : <BoardsList/>
        ) : state.concept === 'grafo' ? (
          <div className="board-canvas board-canvas-fill">
            {state.graphSub === 'neural'    && <NeuralCanvas    onSelect={setSelectedId} selectedId={selectedId}/>}
            {state.graphSub === 'corkboard' && <Corkboard       onSelect={setSelectedId} selectedId={selectedId}/>}
            {state.graphSub === 'radial'    && <RadialSpotlight onSelect={setSelectedId} selectedId={selectedId}/>}
            {selectedId && (
              <Inspector
                entityId={selectedId}
                onClose={() => setSelectedId(null)}
                variant={isDarkView ? 'dark' : 'light'}
                pinned={pinnedEntityIds.includes(selectedId)}
                onTogglePin={() => togglePinEntity(selectedId)}
              />
            )}
          </div>
        ) : state.concept === 'timeline' ? (
          <TimelinePanel pinnedEntityIds={pinnedEntityIds} selectedId={selectedId} onSelectEntity={setSelectedId}/>
        ) : state.concept === 'mapa' ? (
          <MapView pinnedEntityIds={pinnedEntityIds} onSelectEntity={setSelectedId}/>
        ) : state.concept === 'tabla' ? (
          <TableView
            pinnedEntityIds={pinnedEntityIds}
            onPinEntity={togglePinEntity}
            onSelectEntity={setSelectedId}
          />
        ) : (
          <DossierEditor
            mode={state.dossierMode}
            onChangeMode={(m) => setTweak('dossierMode', m)}
          />
        )}
      </main>

      {/* ── AI sidebar (right) ── */}
      {inCaso && (
        <AISidebar
          pinnedEntityIds={pinnedEntityIds}
          suggestions={suggestions}
          onAcceptSuggestion={acceptSuggestion}
          onDismissSuggestion={dismissSuggestion}
          onAskAgent={() => alert('[prototype] el Agente autónomo corre el plan en background.')}
          isPremium={state.isPremium}
          onUpgrade={() => setTweak('isPremium', true)}
          collapsed={state.aiCollapsed}
          onToggleCollapse={() => setTweak('aiCollapsed', !state.aiCollapsed)}
        />
      )}

      {/* ── Feedback FAB (transversal) ── */}
      <FeedbackFab routeLabel={routeLabel} casoId={inCaso ? 'caso-s271' : null}/>

      {/* ── Tweaks ── */}
      {(tweaksOpen || editMode) && (
        <aside className="tweaks is-open">
          <h4>Tweaks</h4>
          <div className="row">
            <label>Vista</label>
            <div className="segment">
              <button className={state.view==='board'?'on':''}  onClick={()=>setTweak('view','board')}>Caso</button>
              <button className={state.view==='alerts'?'on':''} onClick={()=>setTweak('view','alerts')}>Alertas</button>
              <button className={state.view==='boards'?'on':''} onClick={()=>setTweak('view','boards')}>Listado</button>
            </div>
          </div>
          {inCaso && (
            <div className="row">
              <label>Sub-vista</label>
              <div className="segment segment-wrap">
                {CASO_VIEWS.map(v => (
                  <button key={v.id} className={state.concept===v.id?'on':''} onClick={()=>setTweak('concept',v.id)}>{v.label}</button>
                ))}
              </div>
            </div>
          )}
          {inCaso && state.concept === 'grafo' && (
            <div className="row">
              <label>Grafo</label>
              <div className="segment">
                <button className={state.graphSub==='neural'?'on':''}    onClick={()=>setTweak('graphSub','neural')}>Neural</button>
                <button className={state.graphSub==='corkboard'?'on':''} onClick={()=>setTweak('graphSub','corkboard')}>Corkboard</button>
                <button className={state.graphSub==='radial'?'on':''}    onClick={()=>setTweak('graphSub','radial')}>Radar</button>
              </div>
            </div>
          )}
          <div className="row">
            <label>Pistas</label>
            <div className="segment">
              <button className={!state.pistasCollapsed?'on':''} onClick={()=>setTweak('pistasCollapsed',false)}>Expandida</button>
              <button className={state.pistasCollapsed?'on':''} onClick={()=>setTweak('pistasCollapsed',true)}>Colapsada</button>
            </div>
          </div>
          <div className="row">
            <label>Co-investigador</label>
            <div className="segment">
              <button className={!state.aiCollapsed?'on':''} onClick={()=>setTweak('aiCollapsed',false)}>Abierto</button>
              <button className={state.aiCollapsed?'on':''} onClick={()=>setTweak('aiCollapsed',true)}>Cerrado</button>
            </div>
          </div>
          <div className="row">
            <label>Tier</label>
            <div className="segment">
              <button className={!state.isPremium?'on':''} onClick={()=>setTweak('isPremium',false)}>Free</button>
              <button className={state.isPremium?'on':''} onClick={()=>setTweak('isPremium',true)}>Pro</button>
            </div>
          </div>
          <div className="row">
            <label>Logo · pupila</label>
            <input type="color" value={state.pupilColor} onChange={e => setTweak('pupilColor', e.target.value)}/>
          </div>
        </aside>
      )}
      {state.showTweaksBtn && !editMode && (
        <button className="tweaks-fab" onClick={() => setTweaksOpen(o => !o)} title="Tweaks">
          {I.settings({ s: 14 })}
        </button>
      )}
    </div>
  );
}

// ─── Timeline panel (kept simple for now) ───────────────────────────
function TimelinePanel({ pinnedEntityIds, selectedId, onSelectEntity }) {
  // Collect contratos from pinned entities
  const rows = React.useMemo(() => {
    const out = [];
    EDGES.filter(e => e.label === 'titular').forEach(e => {
      if (pinnedEntityIds.includes(e.from)) {
        const c = ENTITIES[e.to];
        if (c) out.push({ ...c, supplier: ENTITIES[e.from] });
      }
    });
    // Also include "aporta" edges (campaign donations) from pinned entities
    EDGES.filter(e => e.label === 'aporta').forEach(e => {
      if (pinnedEntityIds.includes(e.from)) {
        out.push({
          id: `donate-${e.from}-${e.to}`,
          label: 'Aporte de campaña',
          desc: 'Aporte directo a campaña electoral',
          amount: 2_400_000,
          year: 2018,
          supplier: ENTITIES[e.from],
          tipo: 'aporte',
        });
      }
    });
    return out.sort((a, b) => a.year - b.year);
  }, [pinnedEntityIds]);

  const minYear = Math.min(...rows.map(r => r.year), 2018);
  const maxYear = Math.max(...rows.map(r => r.year), 2024);
  const span = maxYear - minYear;

  return (
    <div className="tl-wrap">
      <div className="tl-header">
        <div>
          <div className="eyebrow">Vista · Timeline</div>
          <h2 className="tl-title">{minYear}–{maxYear}</h2>
          <div className="tl-subtitle">{rows.length} eventos de {pinnedEntityIds.length} entidades pinneadas</div>
        </div>
        <div className="tl-legend">
          <span><span className="tl-legend-dot tl-dot-contrato"/> Contrato</span>
          <span><span className="tl-legend-dot tl-dot-aporte"/> Aporte de campaña</span>
          <span><span className="tl-legend-dot tl-dot-election"/> Elección</span>
        </div>
      </div>

      <div className="tl-stage">
        <div className="tl-axis">
          {Array.from({ length: span + 1 }, (_, i) => minYear + i).map(y => (
            <div key={y} className="tl-year" style={{ left: `${((y - minYear) / span) * 100}%` }}>
              <div className="tl-year-tick"/>
              <div className="tl-year-label">{y}</div>
            </div>
          ))}
          {/* Election marker */}
          <div className="tl-election" style={{ left: `${((2019 - minYear) / span) * 100}%` }}>
            <div className="tl-election-line"/>
            <div className="tl-election-label">Elecciones 2019</div>
          </div>
        </div>

        <div className="tl-lanes">
          {rows.map((r, i) => {
            const left = ((r.year - minYear) / span) * 100;
            const isAporte = r.tipo === 'aporte';
            return (
              <div
                key={r.id}
                className={`tl-item ${isAporte ? 'is-aporte' : 'is-contrato'} ${selectedId === r.supplier?.id ? 'is-selected' : ''}`}
                style={{ left: `${left}%`, top: `${20 + (i * 58) % 380}px` }}
                onClick={() => onSelectEntity(r.supplier?.id)}
              >
                <div className="tl-item-dot"/>
                <div className="tl-item-card">
                  <div className="tl-item-head">
                    <span className="tl-item-supplier">{r.supplier?.label}</span>
                    <span className="tl-item-year">{r.year}</span>
                  </div>
                  <div className="tl-item-title">{r.label}</div>
                  <div className="tl-item-amount">
                    {r.amount ? '$' + (r.amount/1000000).toFixed(1) + 'M' : '—'}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { App, TimelinePanel });
