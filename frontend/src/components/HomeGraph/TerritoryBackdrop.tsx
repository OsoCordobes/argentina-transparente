// frontend/src/components/HomeGraph/TerritoryBackdrop.tsx
//
// Silueta SVG estilizada del territorio de Córdoba (provincia + departamentos)
// como guía visual sutil. Opacity ~6%, no interactivo. Sirve como "marco
// geográfico" del mapa neural — el usuario reconoce la forma del territorio
// y entiende inmediatamente el alcance.
//
// El path es una aproximación simplificada a 2 niveles:
//   1) Outline general de la Provincia de Córdoba
//   2) Outline aproximado del territorio de Capital (más al sur-centro)
//
// Coordenadas aproximadas (no precisión cartográfica — es decoración).

export function TerritoryBackdrop() {
  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid meet"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
        opacity: 0.085,
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="territory-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4FC3F7" stopOpacity="0.6" />
          <stop offset="60%" stopColor="#FFB74D" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#FFB74D" stopOpacity="0.2" />
        </linearGradient>
        <filter id="territory-blur">
          <feGaussianBlur stdDeviation="1.2" />
        </filter>
      </defs>
      {/* Outline simplificado de la Provincia de Córdoba — forma vertical
          aproximada con "pico" sur-este. Coordenadas en viewBox 800x600. */}
      <path
        d="
          M 340 60
          C 380 50, 440 55, 470 75
          C 500 95, 510 130, 525 170
          C 540 220, 555 280, 545 340
          C 540 380, 525 415, 500 445
          C 475 475, 450 500, 415 515
          C 380 525, 350 525, 320 510
          C 290 495, 270 470, 260 435
          C 250 395, 250 350, 260 305
          C 270 260, 285 215, 295 175
          C 305 135, 315 95, 340 60
          Z
        "
        fill="url(#territory-grad)"
        stroke="#4FC3F7"
        strokeWidth="0.8"
        strokeOpacity="0.6"
        filter="url(#territory-blur)"
      />
      {/* "Capital" — circulo aproximado en posición sur-centro provincial */}
      <circle
        cx="400"
        cy="400"
        r="22"
        fill="#FFB74D"
        fillOpacity="0.35"
        stroke="#FFB74D"
        strokeWidth="0.8"
        strokeOpacity="0.5"
        filter="url(#territory-blur)"
      />
      {/* Etiquetas geográficas muy sutiles */}
      <text
        x="400"
        y="280"
        fontFamily="'Geist Mono', monospace"
        fontSize="9"
        letterSpacing="0.32em"
        fill="#4FC3F7"
        fillOpacity="0.5"
        textAnchor="middle"
      >
        PROVINCIA
      </text>
      <text
        x="400"
        y="442"
        fontFamily="'Geist Mono', monospace"
        fontSize="7"
        letterSpacing="0.32em"
        fill="#FFB74D"
        fillOpacity="0.55"
        textAnchor="middle"
      >
        CAPITAL
      </text>
    </svg>
  )
}
