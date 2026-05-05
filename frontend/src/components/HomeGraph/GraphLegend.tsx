// frontend/src/components/HomeGraph/GraphLegend.tsx
//
// Overlay esquina inferior izquierda con la taxonomía visual + meta del
// snapshot (total nodos, aristas, monto total).

import { ENTITY_COLORS } from './buildGraph'

interface Props {
  meta: { totalNodos: number; totalAristas: number; montoTotal: number }
}

const ENTRIES: { key: keyof typeof ENTITY_COLORS; label: string }[] = [
  { key: 'jurisdiccion', label: 'Estado · Provincia' },
  { key: 'reparticion', label: 'Repartición · Ministerio' },
  { key: 'empresa', label: 'Empresa · Proveedor' },
  { key: 'persona', label: 'Persona · Funcionario' },
]

function fmtCompactARS(n: number): string {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(0)} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${n.toFixed(0)}`
}

export function GraphLegend({ meta }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        left: 18,
        bottom: 18,
        background: 'rgba(15, 22, 38, 0.78)',
        backdropFilter: 'blur(12px) saturate(120%)',
        WebkitBackdropFilter: 'blur(12px) saturate(120%)',
        border: '1px solid rgba(148, 163, 184, 0.18)',
        borderRadius: 6,
        padding: '12px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 7,
        zIndex: 90,
        userSelect: 'none',
        pointerEvents: 'none',
        minWidth: 220,
      }}
    >
      <div
        style={{
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          fontSize: 9,
          letterSpacing: '0.22em',
          color: '#64748B',
          marginBottom: 2,
        }}
      >
        TAXONOMÍA
      </div>
      {ENTRIES.map(({ key, label }) => (
        <div key={key} style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
          <span
            style={{
              width: 11,
              height: 11,
              borderRadius: '50%',
              background: ENTITY_COLORS[key],
              border: `1px solid ${ENTITY_COLORS[key]}`,
              boxShadow: `0 0 8px ${ENTITY_COLORS[key]}55`,
              flex: '0 0 11px',
            }}
            aria-hidden
          />
          <span
            style={{
              fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
              fontSize: 10.5,
              color: '#CBD5E1',
              letterSpacing: '0.04em',
            }}
          >
            {label}
          </span>
        </div>
      ))}
      <div
        style={{
          marginTop: 8,
          paddingTop: 8,
          borderTop: '1px solid rgba(148, 163, 184, 0.14)',
          fontFamily: '"Geist Mono", "JetBrains Mono", monospace',
          fontSize: 9.5,
          color: '#94A3B8',
          letterSpacing: '0.04em',
          lineHeight: 1.55,
        }}
      >
        <div>{meta.totalNodos} nodos · {meta.totalAristas} aristas</div>
        <div style={{ color: '#CBD5E1', marginTop: 2 }}>{fmtCompactARS(meta.montoTotal)} ejecutados</div>
        <div style={{ color: '#475569', marginTop: 6, fontSize: 9, letterSpacing: '0.12em' }}>
          scroll · drag · click
        </div>
      </div>
    </div>
  )
}
