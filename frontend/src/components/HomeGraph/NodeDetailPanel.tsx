// frontend/src/components/HomeGraph/NodeDetailPanel.tsx
//
// Panel lateral derecho que aparece al click sobre un nodo. Muestra los
// datos REALES del nodo: nombre, tipo, monto total, # contratos,
// estado de verificación CUIT, señales activas. Glass-bg + slide-in.

import { useEffect } from 'react'
import { ENTITY_COLORS, type GraphNodeAttrs } from './buildGraph'

interface Props {
  node: GraphNodeAttrs | null
  onClose: () => void
}

function fmtCompactARS(n: number): string {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n)}`
}

function entityLabel(t: GraphNodeAttrs['entityType']): string {
  if (t === 'jurisdiccion') return 'Estado / Provincia'
  if (t === 'reparticion') return 'Repartición · Ministerio'
  if (t === 'empresa') return 'Empresa · Proveedor'
  if (t === 'persona') return 'Persona · Funcionario'
  return 'Documento'
}

export function NodeDetailPanel({ node, onClose }: Props) {
  // Cerrar con Esc
  useEffect(() => {
    if (!node) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [node, onClose])

  const open = !!node

  return (
    <aside
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 360,
        height: '100%',
        background: 'rgba(11, 16, 32, 0.92)',
        backdropFilter: 'blur(18px) saturate(140%)',
        WebkitBackdropFilter: 'blur(18px) saturate(140%)',
        borderLeft: '1px solid rgba(148, 163, 184, 0.18)',
        boxShadow: '-12px 0 32px rgba(0,0,0,0.4)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 280ms cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 100,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: open ? 'auto' : 'none',
      }}
      aria-hidden={!open}
    >
      {!node ? null : (
        <>
          {/* Header */}
          <div
            style={{
              padding: '16px 20px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 12,
            }}
          >
            <span
              style={{
                width: 16,
                height: 16,
                borderRadius: '50%',
                background: ENTITY_COLORS[node.entityType],
                border: `1.5px solid ${ENTITY_COLORS[node.entityType]}`,
                boxShadow: `0 0 12px ${ENTITY_COLORS[node.entityType]}77`,
                marginTop: 4,
                flexShrink: 0,
              }}
              aria-hidden
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 9,
                  color: '#64748B',
                  letterSpacing: '0.22em',
                  marginBottom: 4,
                }}
              >
                {entityLabel(node.entityType)}
              </div>
              <div
                style={{
                  fontFamily: '"Geist", system-ui, sans-serif',
                  fontSize: 16,
                  color: '#E5E7EB',
                  fontWeight: 500,
                  lineHeight: 1.3,
                  letterSpacing: '-0.01em',
                  wordBreak: 'break-word',
                }}
              >
                {node.label}
              </div>
              {node.subtitle && (
                <div
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 11,
                    color: '#94A3B8',
                    marginTop: 6,
                    letterSpacing: '0.02em',
                  }}
                >
                  {node.subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: 18,
                lineHeight: 1,
                padding: 4,
                fontFamily: 'monospace',
              }}
            >
              ✕
            </button>
          </div>

          {/* KPIs grandes */}
          <div style={{ padding: '20px 20px 4px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {node.monto > 0 && (
              <Kpi label="MONTO TOTAL" value={fmtCompactARS(node.monto)} highlight />
            )}
            {node.contratos > 0 && (
              <Kpi label="CONTRATOS" value={String(node.contratos)} />
            )}
            {(node.hasGrave || node.hasModerada) && (
              <Kpi
                label="SEÑALES ACTIVAS"
                value={node.hasGrave ? 'GRAVE' : 'MODERADA'}
                tone={node.hasGrave ? 'danger' : 'warn'}
              />
            )}
            {!node.cuitVerificado && node.entityType === 'empresa' && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.28)',
                  borderRadius: 4,
                  color: '#FCD34D',
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.04em',
                  lineHeight: 1.5,
                }}
              >
                ⚑ Sin CUIT verificado — la identidad fiscal está pendiente
                de cruce con AFIP/IGJ.
              </div>
            )}
          </div>

          {/* Footer: hint para expansión futura */}
          <div
            style={{
              marginTop: 'auto',
              padding: '14px 20px',
              borderTop: '1px solid rgba(148, 163, 184, 0.14)',
              fontFamily: '"Geist Mono", monospace',
              fontSize: 9.5,
              color: '#64748B',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
            }}
          >
            Doble-click → expandir vecinos
            <span style={{ color: '#475569', marginLeft: 8 }}>(req. Neo4j)</span>
          </div>
        </>
      )}
    </aside>
  )
}

function Kpi({
  label,
  value,
  tone = 'default',
  highlight = false,
}: {
  label: string
  value: string
  tone?: 'default' | 'danger' | 'warn'
  highlight?: boolean
}) {
  const color =
    tone === 'danger' ? '#FCA5A5' :
    tone === 'warn' ? '#FCD34D' :
    '#E5E7EB'
  return (
    <div>
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 9,
          color: '#64748B',
          letterSpacing: '0.22em',
          marginBottom: 6,
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Geist", system-ui, sans-serif',
          fontSize: highlight ? 26 : 18,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
        }}
      >
        {value}
      </div>
    </div>
  )
}
