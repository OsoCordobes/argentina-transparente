// frontend/src/components/HomeGraph/TerritoryBackdrop.tsx
//
// Fondo SVG decorativo que comunica la división Provincia | Capital.
// Capas (orden bottom→top):
//   1. Tinte de fondo por mitad — refuerza la zonificación.
//   2. Línea vertical divisoria al centro — eje conceptual del mapa.
//   3. Etiquetas grandes "PROVINCIA" / "CAPITAL" arriba.
//   4. Footer con conteos reales de empleados públicos.
//
// Todo no-interactivo (pointerEvents: none). El zIndex es 1 — atrás del
// grafo (zIndex implícito por orden de DOM dentro del SigmaContainer).

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
          <stop offset="0%" stopColor="#4FC3F7" stopOpacity="0.07" />
          <stop offset="50%" stopColor="#4FC3F7" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#4FC3F7" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id="cap-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#FFB74D" stopOpacity="0.07" />
          <stop offset="50%" stopColor="#FFB74D" stopOpacity="0.04" />
          <stop offset="100%" stopColor="#FFB74D" stopOpacity="0.10" />
        </linearGradient>
        <linearGradient id="divider" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(148,163,184,0)" />
          <stop offset="20%" stopColor="rgba(148,163,184,0.08)" />
          <stop offset="50%" stopColor="rgba(148,163,184,0.28)" />
          <stop offset="80%" stopColor="rgba(148,163,184,0.08)" />
          <stop offset="100%" stopColor="rgba(148,163,184,0)" />
        </linearGradient>
        <filter id="text-glow">
          <feGaussianBlur stdDeviation="2" />
        </filter>
      </defs>

      {/* Tinte sutil en cada mitad */}
      <rect x="0" y="0" width="400" height="600" fill="url(#prov-grad)" />
      <rect x="400" y="0" width="400" height="600" fill="url(#cap-grad)" />

      {/* Línea vertical divisoria con dashes finitas */}
      <line
        x1="400" y1="40" x2="400" y2="560"
        stroke="url(#divider)"
        strokeWidth="1.2"
        strokeDasharray="3 8"
      />

      {/* Marker círculos pequeños en la línea cada cierto intervalo (suma textura) */}
      <circle cx="400" cy="200" r="2" fill="rgba(148,163,184,0.20)" />
      <circle cx="400" cy="300" r="3" fill="rgba(148,163,184,0.30)" />
      <circle cx="400" cy="400" r="2" fill="rgba(148,163,184,0.20)" />

      {/* Etiqueta PROVINCIA — grande, arriba izquierda */}
      <g style={{ pointerEvents: 'none' }}>
        <text
          x="200"
          y="58"
          fontFamily="'Geist Mono', 'JetBrains Mono', monospace"
          fontSize="16"
          fontWeight="600"
          letterSpacing="0.46em"
          fill="#4FC3F7"
          fillOpacity="0.78"
          textAnchor="middle"
        >
          PROVINCIA
        </text>
        <text
          x="200"
          y="78"
          fontFamily="'Geist Mono', monospace"
          fontSize="10"
          letterSpacing="0.24em"
          fill="#4FC3F7"
          fillOpacity="0.45"
          textAnchor="middle"
        >
          de Córdoba
        </text>
      </g>

      {/* Etiqueta CAPITAL — grande, arriba derecha */}
      <g style={{ pointerEvents: 'none' }}>
        <text
          x="600"
          y="58"
          fontFamily="'Geist Mono', 'JetBrains Mono', monospace"
          fontSize="16"
          fontWeight="600"
          letterSpacing="0.46em"
          fill="#FFB74D"
          fillOpacity="0.78"
          textAnchor="middle"
        >
          CAPITAL
        </text>
        <text
          x="600"
          y="78"
          fontFamily="'Geist Mono', monospace"
          fontSize="10"
          letterSpacing="0.24em"
          fill="#FFB74D"
          fillOpacity="0.45"
          textAnchor="middle"
        >
          Córdoba ciudad
        </text>
      </g>

      {/* Footer — métricas reales de cada zona */}
      <text
        x="200"
        y="565"
        fontFamily="'Geist Mono', monospace"
        fontSize="9.5"
        letterSpacing="0.20em"
        fill="#4FC3F7"
        fillOpacity="0.40"
        textAnchor="middle"
      >
        ~127K empleados públicos
      </text>
      <text
        x="600"
        y="565"
        fontFamily="'Geist Mono', monospace"
        fontSize="9.5"
        letterSpacing="0.20em"
        fill="#FFB74D"
        fillOpacity="0.40"
        textAnchor="middle"
      >
        ~52K empleados públicos
      </text>
    </svg>
  )
}
