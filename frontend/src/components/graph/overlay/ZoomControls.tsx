// frontend/src/components/graph/overlay/ZoomControls.tsx

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

const btnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: 'var(--glass-bg)',
  backdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--hairline-2)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 'var(--text-md)',
  fontFamily: 'var(--font-mono)',
}

export function ZoomControls({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 100,
      }}
    >
      <button onClick={onZoomIn} style={{ ...btnStyle, borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)' }} aria-label="Zoom in">+</button>
      <button onClick={onZoomOut} style={{ ...btnStyle, borderTop: 0 }} aria-label="Zoom out">−</button>
      <button onClick={onFit} style={{ ...btnStyle, borderTop: 0, borderBottomLeftRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wider)' }} aria-label="Fit to viewport">FIT</button>
    </div>
  )
}
