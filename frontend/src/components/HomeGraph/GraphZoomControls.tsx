// frontend/src/components/HomeGraph/GraphZoomControls.tsx
//
// Overlay bottom-right: + / − / FIT.
// Usa el hook useCamera de @react-sigma — debe vivir dentro de SigmaContainer
// pero como componente sibling al canvas (no inside HomeGraphInner) podemos
// montarlo afuera y exponer las funciones via context. Para simplicidad lo
// resolvemos montando el control DENTRO del SigmaContainer pero después de
// HomeGraphInner — sigma le da su contexto a ambos hijos.

import { useCamera } from '@react-sigma/core'

const btnStyle: React.CSSProperties = {
  width: 34,
  height: 34,
  background: 'rgba(15, 22, 38, 0.78)',
  backdropFilter: 'blur(12px)',
  WebkitBackdropFilter: 'blur(12px)',
  border: '1px solid rgba(148, 163, 184, 0.22)',
  color: '#CBD5E1',
  cursor: 'pointer',
  fontSize: 14,
  fontFamily: '"Geist Mono", monospace',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  transition: 'background 140ms ease, color 140ms ease',
  letterSpacing: '0.04em',
}

const fitStyle: React.CSSProperties = {
  ...btnStyle,
  fontSize: 9.5,
  letterSpacing: '0.18em',
}

export function GraphZoomControls() {
  const { zoomIn, zoomOut, reset } = useCamera({ duration: 240, factor: 1.5 })

  return (
    <div
      style={{
        position: 'absolute',
        right: 18,
        bottom: 18,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 90,
      }}
    >
      <button
        type="button"
        aria-label="Zoom in"
        onClick={() => zoomIn()}
        style={{ ...btnStyle, borderTopLeftRadius: 6, borderTopRightRadius: 6 }}
      >
        +
      </button>
      <button
        type="button"
        aria-label="Zoom out"
        onClick={() => zoomOut()}
        style={{ ...btnStyle, borderTop: 'none' }}
      >
        −
      </button>
      <button
        type="button"
        aria-label="Fit to viewport"
        onClick={() => reset({ duration: 420 })}
        style={{ ...fitStyle, borderTop: 'none', borderBottomLeftRadius: 6, borderBottomRightRadius: 6 }}
      >
        FIT
      </button>
    </div>
  )
}
