function TimelineView() {
  return (
    <div className="timeline">
      <h2>Línea de tiempo · TECNOSERV SA</h2>
      {MOCK_TIMELINE.map((g) => (
        <div className="year-group" key={g.year}>
          <div className="year-hd">{g.year}</div>
          {g.items.map((it, i) => (
            <div className="tl-item" key={i}>
              <div className="dot" style={{ background: it.color }} />
              <div className="body">
                <div className="t">{it.t}</div>
                <div className="s">{it.s}</div>
              </div>
              <div className="amt">{it.amt || ''}</div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

window.TimelineView = TimelineView;
