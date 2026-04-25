/**
 * NodeDetailPanel.tsx
 *
 * Panel lateral derecho que muestra KPIs, relaciones, señales y fuentes
 * del nodo actualmente seleccionado en el grafo.
 *
 * NO hace fetch — recibe NodeDetail pre-construido por nodeDetailFromNode().
 */

import { memo, useCallback } from 'react'
import { X, ExternalLink, AlertTriangle, Users, FileText, MapPin } from 'lucide-react'
import type { NodeDetail, ArgosNode, ArgosNodeType, ArgosSeveridad, KPI } from '@/lib/argos/types'
import { fmtARS, fmtCompactARS } from '@/lib/format'

// ─── Helpers ──────────────────────────────────────────────────────────────────

const NODE_TYPE_LABEL: Record<ArgosNodeType, string> = {
  jurisdiccion: 'Jurisdicción',
  proveedor: 'Proveedor',
  director: 'Director',
  contrato: 'Contrato',
  señal: 'Señal de riesgo',
}

const NODE_TYPE_COLOR: Record<ArgosNodeType, string> = {
  jurisdiccion: '#818cf8',
  proveedor: '#38bdf8',
  director: '#f472b6',
  contrato: '#34d399',
  señal: '#fb923c',
}

const SEV_LABEL: Record<ArgosSeveridad, string> = {
  grave: 'Grave',
  moderada: 'Moderada',
  leve: 'Leve',
}

// ─── KPI Sparkline ────────────────────────────────────────────────────────────

function TrendSparkline({ values, years, format }: { values: number[]; years?: number[]; format?: 'currency' | 'count' }) {
  if (values.length < 2) return null
  const max = Math.max(...values, 1)
  const w = 280
  const h = 36
  const pts = values.map((v, i) => {
    const x = (i / (values.length - 1)) * w
    const y = h - (v / max) * h * 0.85
    return `${x},${y}`
  })
  const pathD = pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p}`).join(' ')
  const areaD = `${pathD} L${w},${h} L0,${h} Z`

  return (
    <div className="ae-kpi-trend">
      <div className="ae-kpi-label">Gasto anual</div>
      <svg className="ae-trend-svg" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
        <defs>
          <linearGradient id="ae-trend-gradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path d={areaD} className="ae-trend-area" />
        <path d={pathD} className="ae-trend-line" />
      </svg>
      {years && (
        <div className="ae-trend-years">
          <span>{years[0]}</span>
          {values.length > 2 && <span>{years[Math.floor(years.length / 2)]}</span>}
          <span>{years[years.length - 1]}</span>
        </div>
      )}
      {format === 'currency' && (
        <div style={{ fontSize: 10, color: 'var(--ae-text-muted)', marginTop: 2 }}>
          Pico: {fmtCompactARS(Math.max(...values))}
        </div>
      )}
    </div>
  )
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KPICard({ kpi }: { kpi: KPI }) {
  if (kpi.format === 'trend' && kpi.trend) {
    return (
      <TrendSparkline
        values={kpi.trend}
        years={kpi.trendYears}
        format={kpi.trendFormat}
      />
    )
  }

  let displayValue = kpi.value ?? ''
  if (kpi.format === 'currency' && kpi.amount != null) {
    displayValue = fmtCompactARS(kpi.amount)
  }

  return (
    <div className="ae-kpi-card">
      <div className="ae-kpi-label">{kpi.label}</div>
      <div className={`ae-kpi-value ${kpi.format === 'currency' ? 'currency' : ''}`}>
        {displayValue}
      </div>
      {kpi.sub && (
        <div
          className="ae-kpi-sub"
          dangerouslySetInnerHTML={{ __html: kpi.sub }}
        />
      )}
    </div>
  )
}

// ─── Relación item ────────────────────────────────────────────────────────────

function RelItem({
  relacion,
  onFocus,
}: {
  relacion: NodeDetail['relaciones'][0]
  onFocus: (node: ArgosNode) => void
}) {
  const color = NODE_TYPE_COLOR[relacion.node.type]
  return (
    <div className="ae-rel-item" onClick={() => onFocus(relacion.node)}>
      <div className="ae-rel-dot" style={{ background: color }} />
      <div className="ae-rel-label" title={relacion.node.label}>
        {relacion.node.label}
      </div>
      <div className="ae-rel-via">{relacion.via.replace(/_/g, ' ')}</div>
    </div>
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  detail: NodeDetail | null
  onClose: () => void
  onFocusNode: (nodeId: string) => void
  onNavigateToEntity: (node: ArgosNode) => void
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export const NodeDetailPanel = memo(function NodeDetailPanel({
  detail,
  onClose,
  onFocusNode,
  onNavigateToEntity,
}: NodeDetailPanelProps) {
  const handleFocus = useCallback(
    (node: ArgosNode) => {
      onFocusNode(node.id)
    },
    [onFocusNode]
  )

  const isOpen = !!detail

  return (
    <div className={`ae-panel ${isOpen ? 'open' : ''}`} style={{ position: 'relative' }}>
      {!detail ? null : (
        <>
          {/* Header */}
          <div className="ae-panel-header">
            <div className="ae-panel-type-badge">
              <span
                style={{
                  width: 6,
                  height: 6,
                  borderRadius: '50%',
                  background: NODE_TYPE_COLOR[detail.node.type],
                  display: 'inline-block',
                }}
              />
              {NODE_TYPE_LABEL[detail.node.type]}
              {detail.node.flags?.verificadoAfip && (
                <span
                  title="Verificado en AFIP"
                  style={{ color: '#34d399', fontSize: 10, marginLeft: 4 }}
                >
                  ✓ AFIP
                </span>
              )}
              {detail.node.flags?.severidad && (
                <span
                  className={`ae-señal-badge ${detail.node.flags.severidad}`}
                  style={{ marginLeft: 6 }}
                >
                  {SEV_LABEL[detail.node.flags.severidad]}
                </span>
              )}
            </div>
            <div className="ae-panel-title">{detail.node.label}</div>
            {detail.node.subtitle && (
              <div className="ae-panel-subtitle">{detail.node.subtitle}</div>
            )}
            <button className="ae-panel-close" onClick={onClose} title="Cerrar">
              <X size={12} />
            </button>
          </div>

          {/* Body */}
          <div className="ae-panel-body">
            {/* KPIs */}
            {detail.kpis.length > 0 && (
              <div className="ae-section">
                <div className="ae-section-title">Indicadores clave</div>
                <div className="ae-kpi-grid">
                  {detail.kpis.map((kpi, i) => (
                    <KPICard key={i} kpi={kpi} />
                  ))}
                </div>
              </div>
            )}

            {/* Señales */}
            {detail.señales.length > 0 && (
              <div className="ae-section">
                <div className="ae-section-title">
                  <AlertTriangle
                    size={10}
                    style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}
                  />
                  Señales de riesgo ({detail.señales.length})
                </div>
                {detail.señales.map((s) => (
                  <div key={s.id} className={`ae-señal-item ${s.severidad}`}>
                    <div className="ae-señal-header">
                      <span className={`ae-señal-badge ${s.severidad}`}>
                        {SEV_LABEL[s.severidad]}
                      </span>
                      <div className="ae-señal-title">{s.titulo}</div>
                    </div>
                    <div className="ae-señal-resumen">{s.resumen}</div>
                    {s.legal.denunciarAnte.length > 0 && (
                      <div style={{ fontSize: 10, color: 'var(--ae-text-muted)', marginTop: 4 }}>
                        Denunciar ante: {s.legal.denunciarAnte.join(', ')}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}

            {/* Relaciones */}
            {detail.relaciones.length > 0 && (
              <div className="ae-section">
                <div className="ae-section-title">
                  <Users
                    size={10}
                    style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}
                  />
                  Relaciones ({detail.relaciones.length})
                </div>
                <div className="ae-rel-list">
                  {detail.relaciones.slice(0, 8).map((rel, i) => (
                    <RelItem key={i} relacion={rel} onFocus={handleFocus} />
                  ))}
                  {detail.relaciones.length > 8 && (
                    <div style={{ fontSize: 11, color: 'var(--ae-text-muted)', padding: '4px 10px' }}>
                      +{detail.relaciones.length - 8} más…
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Fuentes */}
            {detail.fuentes.length > 0 && (
              <div className="ae-section">
                <div className="ae-section-title">
                  <FileText
                    size={10}
                    style={{ display: 'inline', marginRight: 4, verticalAlign: 'middle' }}
                  />
                  Fuentes
                </div>
                {detail.fuentes.map((f, i) => (
                  <div key={i} className="ae-fuente-item">
                    <ExternalLink size={11} style={{ color: 'var(--ae-text-muted)', flexShrink: 0, marginTop: 2 }} />
                    <div>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ae-fuente-link"
                      >
                        {f.descripcion}
                      </a>
                      <div className="ae-fuente-meta">
                        {f.fechaAcceso}
                        {f.nivelConfianza && ` · Confianza: ${f.nivelConfianza}`}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="ae-panel-foot">
            {(detail.node.type === 'proveedor' || detail.node.type === 'director') && (
              <button
                className="ae-btn ae-btn-primary"
                onClick={() => onNavigateToEntity(detail.node)}
                title="Abrir ficha completa"
              >
                <MapPin size={12} style={{ display: 'inline', marginRight: 5 }} />
                Ficha completa
              </button>
            )}
            <button className="ae-btn" onClick={onClose}>
              Cerrar
            </button>
          </div>
        </>
      )}
    </div>
  )
})
