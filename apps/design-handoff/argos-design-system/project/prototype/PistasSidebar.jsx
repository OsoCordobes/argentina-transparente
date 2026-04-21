// ─── Pistas Sidebar ──────────────────────────────────────────────
// Persistent left sidebar listing the investigator's "pistas" for the case:
// pinned entities, pinned signals, uploaded files, notes. Survives across
// the 5 views (Grafo / Timeline / Mapa / Tabla / Dossier).

function PistasSidebar({
  pinnedEntityIds,
  pinnedSignalIds,
  files,
  notes,
  selectedId,
  onSelectEntity,
  onSelectSignal,
  onRemoveEntity,
  onRemoveSignal,
  onAddFile,
  onAddNote,
  collapsed,
  onToggleCollapse,
}) {
  const [openSection, setOpenSection] = React.useState({
    entities: true, signals: true, files: true, notes: true,
  });
  const toggle = (k) => setOpenSection(s => ({ ...s, [k]: !s[k] }));

  const pinnedEntities = pinnedEntityIds.map(id => ENTITIES[id]).filter(Boolean);
  const pinnedSignals  = pinnedSignalIds.map(id => SIGNALS.find(s => s.id === id)).filter(Boolean);

  if (collapsed) {
    return (
      <aside className="pistas pistas-collapsed" title="Expandir pistas">
        <button className="pistas-expand" onClick={onToggleCollapse} aria-label="Expandir">
          {I.chevron({ s: 14 })}
        </button>
        <div className="pistas-collapsed-counts">
          <span title="Entidades">{pinnedEntities.length}</span>
          <span title="Señales">{pinnedSignals.length}</span>
          <span title="Archivos">{files.length}</span>
          <span title="Notas">{notes.length}</span>
        </div>
      </aside>
    );
  }

  return (
    <aside className="pistas">
      <div className="pistas-head">
        <div className="pistas-title-wrap">
          <div className="eyebrow">Pistas · caso activo</div>
          <div className="pistas-case-title">Pavimentación Ruta S-271</div>
        </div>
        <button className="pistas-collapse" onClick={onToggleCollapse} aria-label="Colapsar" title="Colapsar (⌥P)">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
        </button>
      </div>

      <div className="pistas-scroll">
        {/* Entities */}
        <Section
          open={openSection.entities}
          onToggle={() => toggle('entities')}
          label="Entidades"
          count={pinnedEntities.length}
          icon={I.building({ s: 13 })}
        >
          {pinnedEntities.length === 0 ? (
            <div className="pistas-empty">Nada pinneado aún · click‑derecho en un nodo para agregar.</div>
          ) : pinnedEntities.map(e => (
            <div
              key={e.id}
              className={`pistas-row ent-${e.type} ${selectedId === e.id ? 'is-selected' : ''}`}
              onClick={() => onSelectEntity(e.id)}
            >
              <span className="pistas-row-icon"><EntIcon type={e.type} size={13}/></span>
              <span className="pistas-row-label">{e.label}</span>
              {e.type === 'Empresa' && signalCount(e.id) > 0 && (
                <span className="pistas-row-sig" title={`${signalCount(e.id)} señales`}>{signalCount(e.id)}</span>
              )}
              <button className="pistas-row-x" onClick={(ev) => { ev.stopPropagation(); onRemoveEntity(e.id); }} title="Desanclar">
                {I.close({ s: 11 })}
              </button>
            </div>
          ))}
          <button className="pistas-add">
            {I.plus({ s: 12 })} Agregar entidad
          </button>
        </Section>

        {/* Signals */}
        <Section
          open={openSection.signals}
          onToggle={() => toggle('signals')}
          label="Señales"
          count={pinnedSignals.length}
          icon={I.alerts({ s: 13 })}
        >
          {pinnedSignals.length === 0 ? (
            <div className="pistas-empty">Sin señales pinneadas.</div>
          ) : pinnedSignals.map(s => (
            <div
              key={s.id}
              className={`pistas-row sev-${s.severity}`}
              onClick={() => onSelectSignal(s.id)}
            >
              <span className="pistas-sev-dot" style={{background: 'var(--sev-color)'}}/>
              <span className="pistas-row-label">{s.title}</span>
              <span className="pistas-row-score">{s.score}</span>
              <button className="pistas-row-x" onClick={(ev) => { ev.stopPropagation(); onRemoveSignal(s.id); }} title="Quitar">
                {I.close({ s: 11 })}
              </button>
            </div>
          ))}
        </Section>

        {/* Files */}
        <Section
          open={openSection.files}
          onToggle={() => toggle('files')}
          label="Archivos"
          count={files.length}
          icon={I.file({ s: 13 })}
        >
          {files.length === 0 ? (
            <div className="pistas-empty">Arrastrá un PDF o imagen aquí para agregarlo al caso.</div>
          ) : files.map(f => (
            <div key={f.id} className="pistas-file">
              <span className="pistas-file-icon">{I.file({ s: 13 })}</span>
              <div className="pistas-file-body">
                <div className="pistas-file-name">{f.filename}</div>
                <div className="pistas-file-meta">
                  <span className={`pistas-file-ocr ocr-${f.ocr_status}`}>
                    {f.ocr_status === 'done' ? 'OCR ✓' : f.ocr_status === 'pending' ? 'OCR…' : 'OCR ×'}
                  </span>
                  {f.sha256 && <span className="pistas-file-sha" title={f.sha256}>sha {f.sha256.slice(0, 8)}</span>}
                </div>
              </div>
            </div>
          ))}
          <button className="pistas-add" onClick={onAddFile}>
            {I.plus({ s: 12 })} Subir archivo
          </button>
        </Section>

        {/* Notes */}
        <Section
          open={openSection.notes}
          onToggle={() => toggle('notes')}
          label="Notas"
          count={notes.length}
          icon={I.pin({ s: 13 })}
        >
          {notes.length === 0 ? (
            <div className="pistas-empty">Anotá hipótesis, preguntas o pendientes.</div>
          ) : notes.map(n => (
            <div key={n.id} className="pistas-note">
              <div className="pistas-note-text">{n.texto}</div>
              {n.anclada_a && (
                <div className="pistas-note-anchor">
                  ↳ {ENTITIES[n.anclada_a]?.label || n.anclada_a}
                </div>
              )}
            </div>
          ))}
          <button className="pistas-add" onClick={onAddNote}>
            {I.plus({ s: 12 })} Agregar nota
          </button>
        </Section>
      </div>
    </aside>
  );
}

function Section({ open, onToggle, label, count, icon, children }) {
  return (
    <div className={`pistas-section ${open ? 'is-open' : ''}`}>
      <button className="pistas-section-head" onClick={onToggle}>
        <span className="pistas-section-chev">
          <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
        </span>
        <span className="pistas-section-icon">{icon}</span>
        <span className="pistas-section-label">{label}</span>
        <span className="pistas-section-count">{count}</span>
      </button>
      {open && <div className="pistas-section-body">{children}</div>}
    </div>
  );
}

function signalCount(entityId) {
  return SIGNALS.filter(s => s.subject === entityId).length;
}

Object.assign(window, { PistasSidebar });
