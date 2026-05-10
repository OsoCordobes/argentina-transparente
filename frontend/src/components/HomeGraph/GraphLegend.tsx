// frontend/src/components/HomeGraph/GraphLegend.tsx
//
// Overlay esquina inferior izquierda. Taxonomía visual extendida (7 tipos)
// + meta real del snapshot (nodos, aristas, monto, empleados, breakdown
// por tipo).

import { COLORS } from './buildGraph'

interface Props {
  meta: {
    totalNodos: number
    totalAristas: number
    montoTotal: number
    empleadosTotal: number
    porTipo: Record<string, number>
  }
}

const ENTRIES: { key: string; label: string; color: string }[] = [
  { key: 'jurisdiccion', label: 'Jurisdicción', color: COLORS.jurProvincia },
  { key: 'ministerio', label: 'Ministerio · Secretaría', color: COLORS.ministerioCapital },
  { key: 'organismo', label: 'Organismo descentralizado', color: COLORS.organismo },
  { key: 'direccion', label: 'Dirección interna', color: COLORS.direccion },
  { key: 'empresa', label: 'Empresa · Proveedor', color: COLORS.empresa },
  { key: 'persona', label: 'Persona · Funcionario', color: COLORS.personaFuncionario },
]

function fmtCompactARS(n: number): string {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n)}`
}
function fmtCompact(n: number): string {
  if (!n) return '0'
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)}K`
  return String(n)
}

export function GraphLegend({ meta }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 18,
        background: 'rgba(15, 22, 38, 0.82)',
        backdropFilter: 'blur(14px) saturate(140%)',
        WebkitBackdropFilter: 'blur(14px) saturate(140%)',
        border: '1px solid rgba(148, 163, 184, 0.20)',
        borderRadius: 6,
        padding: '14px 16px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        zIndex: 90,
        userSelect: 'none',
        pointerEvents: 'none',
        minWidth: 260,
        boxShadow: '0 12px 32px rgba(0, 0, 0, 0.4)',
      }}
    >
      <div
        style={{
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          fontSize: 9,
          letterSpacing: '0.22em',
          color: '#64748B',
          marginBottom: 4,
        }}
      >
        MAPA DE CÓRDOBA
      </div>

      {ENTRIES.map(({ key, label, color }) => {
        const n = meta.porTipo[key] ?? 0
        return (
          <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: color,
                border: `1px solid ${color}`,
                boxShadow: `0 0 6px ${color}88`,
                flex: '0 0 10px',
              }}
              aria-hidden
            />
            <span
              style={{
                fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
                fontSize: 10,
                color: '#CBD5E1',
                letterSpacing: '0.04em',
                flex: 1,
              }}
            >
              {label}
            </span>
            <span
              style={{
                fontFamily: '"Geist Mono", monospace',
                fontSize: 10,
                color: '#94A3B8',
                letterSpacing: '0.04em',
                fontVariantNumeric: 'tabular-nums',
              }}
            >
              {n.toLocaleString('es-AR')}
            </span>
          </div>
        )
      })}

      <div
        style={{
          marginTop: 10,
          paddingTop: 10,
          borderTop: '1px solid rgba(148, 163, 184, 0.16)',
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          fontSize: 9.5,
          color: '#94A3B8',
          letterSpacing: '0.04em',
          lineHeight: 1.7,
          fontVariantNumeric: 'tabular-nums',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>nodos · aristas</span>
          <span style={{ color: '#E5E7EB' }}>{meta.totalNodos} · {meta.totalAristas}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>empleados públicos</span>
          <span style={{ color: '#E5E7EB' }}>{fmtCompact(meta.empleadosTotal)}</span>
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
          <span>contratado</span>
          <span style={{ color: '#E5E7EB' }}>{fmtCompactARS(meta.montoTotal)}</span>
        </div>
        <div style={{ color: '#475569', marginTop: 8, fontSize: 9, letterSpacing: '0.16em' }}>
          scroll · drag · click · ⌘K
        </div>
      </div>
    </div>
  )
}
