/**
 * Fondo radial (decisión Q7=B): centro `surface-overlay` → bordes `surface-base`
 * + tinte azul 4% en el centro. Sin dot grid ni constellation.
 *
 * Se renderiza como <rect fill="url(#argos-radial-bg)"/> ocupando todo el SVG.
 */
export function RadialGradientDef() {
  return (
    <defs>
      <radialGradient id="argos-radial-bg" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="var(--surface-overlay)" stopOpacity="0.7" />
        <stop offset="60%" stopColor="var(--surface-raised)" stopOpacity="0.4" />
        <stop offset="100%" stopColor="var(--surface-base)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="argos-blue-tint" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.04" />
        <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

interface BgProps {
  width: number
  height: number
}

export function RadialBackground({ width, height }: BgProps) {
  return (
    <>
      <rect x="0" y="0" width={width} height={height} fill="var(--surface-base)" />
      <rect x="0" y="0" width={width} height={height} fill="url(#argos-radial-bg)" />
      <rect x="0" y="0" width={width} height={height} fill="url(#argos-blue-tint)" />
    </>
  )
}
