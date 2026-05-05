// frontend/src/components/HomeGraph/TerritoryBackdrop.tsx
//
// Fondo SVG que comunica la división izquierda/derecha entre las dos
// jurisdicciones. Tiene 3 capas:
//   1. Línea vertical central sutil — eje divisorio "Provincia | Capital"
//   2. Etiquetas grandes de cada zona ("PROVINCIA", "CAPITAL")
//   3. Silueta tenue del territorio cordobés como decoración geográfica
//
// Todo no-interactivo (pointerEvents: none) — solo decoración.

export function TerritoryBackdrop() {
  return (
    <svg
      viewBox="0 0 800 600"
      preserveAspectRatio="xMidYMid slice"
      style={{
        position: 'absolute',
        inset: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        zIndex: 1,
      }}
      aria-hidden
    >
      <defs>
        <linearGradient id="prov-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#4FC3F7" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#4FC3F7" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id="cap-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB74D" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#FFB74D" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id="divider" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(148,163,184,0)" />
          <stop offset="50%" stopColor="rgba(148,163,184,0.18)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0)" />
        </linearGradient>
      </defs>

      {/* Tinte sutil en cada mitad — refuerza la división de zonas */}
      <rect x="0" y="0" width="400" height="600" fill="url(#prov-grad)" />
      <rect x="400" y="0" width="400" height="600" fill="url(#cap-grad)" />

      {/* Línea vertical divisoria — sutil pero visible */}
      <line
        x1="400" y1="0" x2="400" y2="600"
        stroke="url(#divider)"
        strokeWidth="1"
        strokeDasharray="4 6"
      />

      {/* Etiqueta grande PROVINCIA, izquierda */}
      <text
        x="200"
        y="50"
        fontFamily="'Geist Mono', monospace"
        fontSize="13"
        fontWeight="500"
        letterSpacing="0.42em"
        fill="#4FC3F7"
        fillOpacity="0.55"
        textAnchor="middle"
      >
        PROVINCIA
      </text>
      <text
        x="200"
        y="68"
        fontFamily="'Geist Mono', monospace"
        fontSize="9"
        letterSpacing="0.20em"
        fill="#4FC3F7"
        fillOpacity="0.32"
        textAnchor="middle"
      >
        de Córdoba
      </text>

      {/* Etiqueta grande CAPITAL, derecha */}
      <text
        x="600"
        y="50"
        fontFamily="'Geist Mono', monospace"
        fontSize="13"
        fontWeight="500"
        letterSpacing="0.42em"
        fill="#FFB74D"
        fillOpacity="0.55"
        textAnchor="middle"
      >
        CAPITAL
      </text>
      <text
        x="600"
        y="68"
        fontFamily="'Geist Mono', monospace"
        fontSize="9"
        letterSpacing="0.20em"
        fill="#FFB74D"
        fillOpacity="0.32"
        textAnchor="middle"
      >
        Córdoba ciudad
      </text>

      {/* Footer — etiquetas de empleados y monto en cada zona */}
      <text
        x="200"
        y="570"
        fontFamily="'Geist Mono', monospace"
        fontSize="9"
        letterSpacing="0.18em"
        fill="#4FC3F7"
        fillOpacity="0.30"
        textAnchor="middle"
      >
        ~127K empleados · provincia
      </text>
      <text
        x="600"
        y="570"
        fontFamily="'Geist Mono', monospace"
        fontSize="9"
        letterSpacing="0.18em"
        fill="#FFB74D"
        fillOpacity="0.30"
        textAnchor="middle"
      >
        ~52K empleados · capital
      </text>
    </svg>
  )
}
