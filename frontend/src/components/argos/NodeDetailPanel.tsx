/**
 * NodeDetailPanel.tsx
 *
 * Panel lateral derecho (slide-in) que muestra KPIs, relaciones, señales y
 * fuentes del nodo actualmente seleccionado en el grafo.
 *
 * Migrado pixel-perfect desde `.tmp-argos-v2/argos/panel.jsx` (v2.0).
 * Conserva las classNames originales (`panel`, `glass`, `panel-head`,
 * `panel-body`, `kpi-grid`, `kpi`, `spark`, `rel-list`, `signal-card`, etc.)
 * para que el CSS del HTML standalone aplique sin retoques.
 *
 * NO hace fetch — recibe `NodeDetail` pre-construido por `nodeDetailFromNode`.
 *
 * Diferencias relevantes vs el .jsx original:
 * - Tipado TypeScript estricto (no `window.X`).
 * - El lookup de severidad por relación que el .jsx hacía contra
 *   `window.ArgosMock.SEN` se reemplaza por `relacion.severidad` (ya disponible
 *   en el tipo `Relacion`). Si no viene, no se renderiza la barra lateral.
 * - El KPI `sub` ya no usa `dangerouslySetInnerHTML` — `dompurify` NO está en
 *   el package.json del frontend (verificado), así que renderizamos texto plano
 *   para evitar XSS. Si en el futuro se necesita HTML inline (ej. resaltar
 *   "grave" en rojo), instalar `dompurify` y volver a `<span dangerouslySetInnerHTML>`
 *   pasando `DOMPurify.sanitize(k.sub)`.
 * - Sparkline mantiene el SVG path original con gradient `#6FB8E8`. No soporta
 *   múltiples series (deuda técnica heredada del .jsx).
 */

import { useEffect, useState } from 'react'
import type { NodeDetail, KPI, Relacion, ArgosNodeType } from '@/lib/argos/types'
import { Ico } from '@/components/argos/ArgosIcons'
import { IdentityBadge } from '@/components/argos/IdentityBadge'
import { sumarioProveedorMarkdown, copyToClipboard } from '@/lib/argos/sumario'
import { capturarCanvasWrap } from '@/lib/argos/screenshot'
import { addItem as addToWatchlist, readLocal as readWatchlistLocal } from '@/lib/argos/watchlist'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Compacta un número a notación AR-friendly (1,2B / 850,5M / 4,3K).
 * Replica el formatNumberCompact del .jsx original.
 */
function formatNumberCompact(n: number): string {
  if (n >= 1e9) return (n / 1e9).toFixed(2).replace('.', ',') + 'B'
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace('.', ',') + 'M'
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace('.', ',') + 'K'
  return n.toLocaleString('es-AR')
}

const TYPE_LABEL_PLURAL: Record<string, string> = {
  todos: 'Todos',
  proveedor: 'Proveedores',
  director: 'Directores',
  contrato: 'Contratos',
  señal: 'Señales',
  jurisdiccion: 'Jurisdicciones',
}

type RelFilter = 'todos' | ArgosNodeType

// ─── Sparkline ────────────────────────────────────────────────────────────────

/**
 * SVG inline con `linePath` + `areaPath` y gradient `#6FB8E8`.
 * Misma fórmula y proporciones que el .jsx (200×28 viewBox).
 */
function Sparkline({ data }: { data: number[] }) {
  if (!data || data.length < 2) return null
  const w = 200
  const h = 28
  const max = Math.max(...data)
  const min = Math.min(...data)
  const range = max - min || 1
  const pts = data.map((v, i): [number, number] => {
    const x = (i / (data.length - 1)) * w
    const y = h - ((v - min) / range) * h
    return [x, y]
  })
  const linePath = pts
    .map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1))
    .join(' ')
  const areaPath = linePath + ` L${w},${h} L0,${h} Z`

  return (
    <svg className="spark" viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none">
      <defs>
        <linearGradient id="spark-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#6FB8E8" stopOpacity="0.4" />
          <stop offset="100%" stopColor="#6FB8E8" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d={areaPath} />
      <path className="line" d={linePath} />
    </svg>
  )
}

// ─── Skeleton de carga ────────────────────────────────────────────────────────

function PanelSkeleton() {
  return (
    <div className="panel-body">
      <div className="skeleton" style={{ height: 14, width: '40%', marginBottom: 10 }} />
      <div className="skeleton" style={{ height: 24, width: '80%', marginBottom: 6 }} />
      <div className="skeleton" style={{ height: 12, width: '60%', marginBottom: 18 }} />
      <div className="kpi-grid">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="skeleton" style={{ height: 64 }} />
        ))}
      </div>
      <div style={{ marginTop: 18 }}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="skeleton" style={{ height: 36, marginBottom: 6 }} />
        ))}
      </div>
    </div>
  )
}

// ─── Ícono de nodo según tipo ─────────────────────────────────────────────────

interface NodeIconProps {
  type: ArgosNodeType
  size?: number
}

function NodeIcon({ type, size = 14 }: NodeIconProps) {
  const stroke =
    type === 'jurisdiccion'
      ? '#6FB8E8'
      : type === 'proveedor'
      ? '#FFFFFF'
      : type === 'director'
      ? '#B79CFF'
      : type === 'contrato'
      ? '#62C7A0'
      : '#F5B544'

  const Component =
    type === 'jurisdiccion'
      ? Ico.Building
      : type === 'proveedor'
      ? Ico.Briefcase
      : type === 'director'
      ? Ico.User
      : type === 'contrato'
      ? Ico.Doc
      : Ico.Alert

  return <Component size={size} stroke={stroke} sw={1.7} />
}

// ─── Helpers para render de KPI ───────────────────────────────────────────────

function isMonoFormat(k: KPI): boolean {
  return (
    k.format === 'currency' ||
    k.format === 'count' ||
    k.format === 'date' ||
    (k.format === 'text' && /^\d/.test(k.value || ''))
  )
}

// ─── Props ────────────────────────────────────────────────────────────────────

interface NodeDetailPanelProps {
  open: boolean
  loading: boolean
  detail: NodeDetail | null
  onClose: () => void
  /** Click en una relación → navegar al nodo target. */
  onSelect: (id: string) => void
  /** Hover en una relación → resaltar en el grafo (null al salir). */
  onRelHover: (id: string | null) => void
  /** V4 forensic: warn box arriba del panel con qué cambió desde la última visita */
  lastDelta?: string | null
  /** V4 forensic: 'sidebar' = panel ancho normal · 'drawer' = overlay 440px sobre grafo */
  variant?: 'sidebar' | 'drawer'
}

// ─── Panel principal ──────────────────────────────────────────────────────────

export function NodeDetailPanel({
  open,
  loading,
  detail,
  onClose,
  onSelect,
  onRelHover,
  lastDelta = null,
  variant = 'sidebar',
}: NodeDetailPanelProps) {
  const [accSrc, setAccSrc] = useState(false)
  const [expanded, setExpanded] = useState<Record<number, boolean>>({})
  const [relFilter, setRelFilter] = useState<RelFilter>('todos')
  // Feature B — filtros año/área sobre lista de contratos del proveedor
  const [yearFilter, setYearFilter] = useState<number | null>(null)
  const [areaFilter, setAreaFilter] = useState<string | null>(null)
  // Feature C — feedback del botón "Copiar sumario"
  const [copyStatus, setCopyStatus] = useState<'idle' | 'ok' | 'fail'>('idle')
  // Feature D — feedback del botón "Descargar imagen"
  const [shotStatus, setShotStatus] = useState<'idle' | 'busy' | 'ok' | 'fail'>('idle')
  // F8 — watchlist: el nodo actual ya está marcado por el user?
  const [enWatchlist, setEnWatchlist] = useState(false)

  // Reset de filtros al cambiar de nodo (mismo deps que el .jsx).
  useEffect(() => {
    setAccSrc(false)
    setExpanded({})
    setRelFilter('todos')
    setYearFilter(null)
    setAreaFilter(null)
  }, [detail?.node?.id])

  // F8 — sync `enWatchlist` con localStorage cada vez que cambia el nodo.
  useEffect(() => {
    if (!detail) {
      setEnWatchlist(false)
      return
    }
    const items = readWatchlistLocal()
    setEnWatchlist(items.some((i) => i.proveedor_id === detail.node.id))
  }, [detail])

  // ESC cierra el panel.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && open) onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Panel cerrado → render placeholder transparente (preserva ancho de layout
  // y permite la animación de transición CSS hacia `open`).
  if (!open) return <div className={`panel glass fx-panel ${variant === 'drawer' ? 'fx-panel--drawer' : ''}`} aria-hidden />

  const n = detail?.node

  // Header label del tipo (capitalizado, "Señal" para el caso especial).
  const typeLabel =
    n?.type === 'señal'
      ? 'Señal'
      : n?.type
      ? n.type[0].toUpperCase() + n.type.slice(1)
      : 'Detalle'

  // Feature C — Copia el sumario en Markdown al portapapeles.
  // Toast inline de 1.6s indica éxito o falla.
  const handleCopySumario = async () => {
    if (!detail) return
    const md = sumarioProveedorMarkdown(detail)
    const ok = await copyToClipboard(md)
    setCopyStatus(ok ? 'ok' : 'fail')
    setTimeout(() => setCopyStatus('idle'), 1800)
  }

  // Feature D — Captura grafo + ficha como PNG con watermark.
  // Operación cara (1-3s), por eso state 'busy' para feedback.
  const handleDownloadImage = async () => {
    if (!detail) return
    setShotStatus('busy')
    const result = await capturarCanvasWrap({
      slug: detail.node.label,
      fechaDatos: detail.meta?.fechaActualizacion ?? null,
    })
    setShotStatus(result.ok ? 'ok' : 'fail')
    if (!result.ok) {
      // eslint-disable-next-line no-console
      console.warn('[screenshot] Falló:', result.error)
    }
    setTimeout(() => setShotStatus('idle'), 2000)
  }

  // F8 — agregar el proveedor actual a la watchlist personal del user.
  // Sólo aplica para nodos de tipo proveedor (no jurisdicción / contrato / etc).
  const handleAddToWatchlist = async () => {
    if (!detail) return
    const now = new Date().toISOString()
    const cuit =
      typeof detail.node.data?.cuit === 'string'
        ? (detail.node.data.cuit as string)
        : null
    await addToWatchlist({
      proveedor_id: detail.node.id,
      proveedor_label: detail.node.label,
      cuit,
      agregado_en: now,
      ultima_visita: now,
      notas: null,
    })
    setEnWatchlist(true)
  }

  // Export JSON: descarga el `detail` completo como `<id>.json`.
  const exportJSON = () => {
    if (!detail || !n) return
    const blob = new Blob([JSON.stringify(detail, null, 2)], {
      type: 'application/json',
    })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${n.id}.json`
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <aside
      className={`panel glass open fx-panel ${variant === 'drawer' ? 'fx-panel--drawer' : ''}`}
      role="dialog"
      aria-label="Detalle del nodo"
    >
      <div className="panel-inner" style={{ minHeight: 0, height: '100%' }}>
        {loading || !detail || !n ? (
          <>
            <div className="panel-head">
              <div className="panel-row1">
                <div
                  className="skeleton"
                  style={{ height: 22, width: 90, borderRadius: 999 }}
                />
                <button
                  type="button"
                  className="x-btn"
                  onClick={onClose}
                  aria-label="Cerrar"
                >
                  <Ico.X size={14} />
                </button>
              </div>
            </div>
            <PanelSkeleton />
          </>
        ) : (
          <>
            {/* ── Header ── */}
            <div className="panel-head">
              <div className="panel-row1">
                <span className={`type-chip t-${n.type}`}>
                  <NodeIcon type={n.type} size={11} />
                  {typeLabel}
                </span>
                <button
                  type="button"
                  className="x-btn"
                  onClick={onClose}
                  aria-label="Cerrar"
                >
                  <Ico.X size={14} />
                </button>
              </div>
              <h2 className="panel-title">{n.label}</h2>
              {n.subtitle && (
                <div
                  className={`panel-sub ${n.type === 'proveedor' ? 'mono' : ''}`}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}
                >
                  <span>{n.subtitle}</span>
                  {detail.identidad && (
                    <IdentityBadge
                      tier={detail.identidad.tier}
                      score={detail.identidad.score}
                    />
                  )}
                </div>
              )}
              {!n.subtitle && detail.identidad && (
                <div style={{ marginTop: 6 }}>
                  <IdentityBadge
                    tier={detail.identidad.tier}
                    score={detail.identidad.score}
                  />
                </div>
              )}
              {(n.flags?.verificadoAfip || n.flags?.severidad) && (
                <div className="badges">
                  {n.flags?.verificadoAfip && (
                    <span className="badge verified">● Verificado AFIP</span>
                  )}
                  {n.flags?.severidad && (
                    <span className={`badge sev-${n.flags.severidad}`}>
                      ● Severidad {n.flags.severidad}
                    </span>
                  )}
                </div>
              )}
              {/* Trazabilidad — Feature A: badge prominente con fecha + método */}
              {detail.meta && (
                <div
                  style={{
                    marginTop: 10,
                    fontSize: 11,
                    color: 'var(--text-3)',
                    lineHeight: 1.5,
                    borderTop: '1px solid var(--stroke)',
                    paddingTop: 8,
                  }}
                  className="mono"
                >
                  <div>
                    <span style={{ color: 'var(--celeste)' }}>●</span>{' '}
                    Datos al{' '}
                    {detail.meta.fechaActualizacion
                      ? new Date(detail.meta.fechaActualizacion).toLocaleDateString(
                          'es-AR',
                          { day: '2-digit', month: '2-digit', year: 'numeric' },
                        )
                      : 'fecha no disponible'}
                  </div>
                  <div style={{ marginTop: 2 }}>
                    Fuente:{' '}
                    <span style={{ color: 'var(--text-2)' }}>
                      gobiernoabierto.cordoba.gob.ar
                    </span>
                    {' · método: '}
                    <span style={{ color: 'var(--text-2)' }}>
                      {detail.meta.metodoDominante}
                    </span>
                  </div>
                </div>
              )}
            </div>

            {/* V4 — lastDelta warn box (qué cambió desde la última visita) */}
            {lastDelta && (
              <div className="fx-delta-box">
                <span className="delta-label">Δ</span>
                <span className="delta-text">{lastDelta}</span>
              </div>
            )}

            {/* ── Body ── */}
            <div className="panel-body">
              {/* Indicadores (KPI grid) */}
              <div className="section-title">Indicadores</div>
              <div className="kpi-grid">
                {detail.kpis.map((k, i) => {
                  const mono = isMonoFormat(k)
                  return (
                    <div
                      className={`kpi ${k.format === 'trend' ? 'trend' : ''}`}
                      key={i}
                    >
                      <div className="l">{k.label}</div>
                      <div className={`v ${mono ? 'mono' : ''}`}>
                        {k.format === 'currency' && k.amount != null ? (
                          <>
                            $ {formatNumberCompact(k.amount)}
                            <span className="unit">ARS</span>
                          </>
                        ) : (
                          k.value
                        )}
                      </div>
                      {/*
                        XSS guard: dompurify no está instalado (verificado contra
                        package.json del frontend). Renderizamos `k.sub` como
                        texto plano. Si en el futuro hace falta HTML, instalar
                        `dompurify` y reemplazar por:
                          <span dangerouslySetInnerHTML={{
                            __html: DOMPurify.sanitize(k.sub),
                          }} />
                      */}
                      {k.sub && <div className="sub">{k.sub}</div>}
                      {k.format === 'trend' && k.trend && (
                        <Sparkline data={k.trend} />
                      )}
                    </div>
                  )
                })}
              </div>

              {/* Feature A+B — Top contratos con filtros año/área client-side */}
              {detail.contratos && detail.contratos.length > 0 && (() => {
                // Universos (todos los años/áreas que aparecen en los contratos)
                const allYears = [...new Set(detail.contratos.map((c) => c.anio))]
                  .sort((a, b) => b - a)
                const allAreas = [...new Set(detail.contratos.map((c) => c.area).filter(Boolean))]
                  .sort()

                // Aplicar filtros
                const filtered = detail.contratos.filter(
                  (c) =>
                    (yearFilter === null || c.anio === yearFilter) &&
                    (areaFilter === null || c.area === areaFilter),
                )

                // Recompute KPI compacto si hay filtro activo
                const filtroActivo = yearFilter !== null || areaFilter !== null
                const montoFiltrado = filtered.reduce((s, c) => s + c.monto, 0)
                const totalDelProveedor = detail.contratos.reduce((s, c) => s + c.monto, 0)
                const pctDelTotal = totalDelProveedor > 0
                  ? (montoFiltrado / totalDelProveedor) * 100
                  : 0

                const visibles = filtered.slice(0, 10)

                return (
                  <>
                    <div className="section-title">
                      Top contratos ({filtered.length}
                      {filtered.length !== detail.contratos.length
                        ? ` de ${detail.contratos.length}`
                        : ''})
                    </div>

                    {/* Chips de filtros */}
                    {(allYears.length > 1 || allAreas.length > 1) && (
                      <div style={{ marginBottom: 10 }}>
                        {allYears.length > 1 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--text-3)',
                                alignSelf: 'center',
                                marginRight: 4,
                              }}
                            >
                              Año:
                            </span>
                            <button
                              type="button"
                              className={`rel-filter ${yearFilter === null ? 'active' : ''}`}
                              onClick={() => setYearFilter(null)}
                              style={{ fontSize: 10 }}
                            >
                              Todos
                            </button>
                            {allYears.map((y) => (
                              <button
                                key={y}
                                type="button"
                                className={`rel-filter ${yearFilter === y ? 'active' : ''}`}
                                onClick={() =>
                                  setYearFilter(yearFilter === y ? null : y)
                                }
                                style={{ fontSize: 10 }}
                              >
                                {y}
                              </button>
                            ))}
                          </div>
                        )}
                        {allAreas.length > 1 && (
                          <div
                            style={{
                              display: 'flex',
                              flexWrap: 'wrap',
                              gap: 4,
                              marginBottom: 6,
                            }}
                          >
                            <span
                              style={{
                                fontSize: 10,
                                color: 'var(--text-3)',
                                alignSelf: 'center',
                                marginRight: 4,
                              }}
                            >
                              Área:
                            </span>
                            <button
                              type="button"
                              className={`rel-filter ${areaFilter === null ? 'active' : ''}`}
                              onClick={() => setAreaFilter(null)}
                              style={{ fontSize: 10 }}
                            >
                              Todas
                            </button>
                            {allAreas.slice(0, 8).map((a) => (
                              <button
                                key={a}
                                type="button"
                                className={`rel-filter ${areaFilter === a ? 'active' : ''}`}
                                onClick={() =>
                                  setAreaFilter(areaFilter === a ? null : a)
                                }
                                style={{ fontSize: 10 }}
                                title={a}
                              >
                                {a.length > 22 ? a.slice(0, 20) + '…' : a}
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* KPI inline cuando hay filtro activo */}
                    {filtroActivo && (
                      <div
                        style={{
                          padding: '6px 10px',
                          border: '1px solid var(--celeste)',
                          borderRadius: 6,
                          marginBottom: 10,
                          fontSize: 11,
                          color: 'var(--text-2)',
                          background: 'rgba(111,184,232,0.06)',
                        }}
                        className="mono"
                      >
                        <span style={{ color: 'var(--celeste)' }}>●</span>{' '}
                        Filtrado: ${formatNumberCompact(montoFiltrado)} ARS en{' '}
                        {filtered.length} contrato{filtered.length === 1 ? '' : 's'}
                        {' · '}
                        <span style={{ color: 'var(--text-3)' }}>
                          {pctDelTotal.toFixed(1)}% del total del proveedor
                        </span>
                      </div>
                    )}

                    {/* Lista visible (top 10 del subset filtrado) */}
                    <div
                      style={{
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 6,
                        marginBottom: 14,
                      }}
                    >
                      {visibles.length === 0 ? (
                        <div
                          style={{
                            padding: 12,
                            border: '1px dashed var(--stroke)',
                            borderRadius: 6,
                            color: 'var(--text-3)',
                            fontSize: 11,
                            textAlign: 'center',
                          }}
                        >
                          Sin contratos con esos filtros
                        </div>
                      ) : (
                        visibles.map((c) => (
                          <a
                            key={c.hash}
                            href={c.fuenteUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                              display: 'block',
                              padding: '8px 10px',
                              border: '1px solid var(--stroke)',
                              borderRadius: 6,
                              textDecoration: 'none',
                              color: 'var(--text)',
                              background: 'var(--bg-panel)',
                              fontSize: 11,
                              lineHeight: 1.4,
                            }}
                            title={c.descripcion}
                          >
                            <div
                              style={{
                                display: 'flex',
                                justifyContent: 'space-between',
                                gap: 8,
                                marginBottom: 2,
                              }}
                            >
                              <span
                                className="mono"
                                style={{ color: 'var(--celeste)' }}
                              >
                                {c.anio} · {c.area || 'sin área'}
                              </span>
                              <span
                                className="mono"
                                style={{
                                  color: 'var(--text-2)',
                                  whiteSpace: 'nowrap',
                                }}
                              >
                                ${formatNumberCompact(c.monto)}
                              </span>
                            </div>
                            <div
                              style={{
                                color: 'var(--text-3)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {c.descripcion || c.tipo || '(sin descripción)'}
                            </div>
                            <div
                              style={{
                                marginTop: 4,
                                fontSize: 10,
                                color: 'var(--text-3)',
                              }}
                            >
                              ↗ Ver fuente original
                            </div>
                          </a>
                        ))
                      )}
                    </div>
                  </>
                )
              })()}

              {/* Relaciones con filtros */}
              {detail.relaciones.length > 0 &&
                (() => {
                  const counts = detail.relaciones.reduce<Record<string, number>>(
                    (acc, r) => {
                      acc[r.node.type] = (acc[r.node.type] || 0) + 1
                      acc.todos = (acc.todos || 0) + 1
                      return acc
                    },
                    {}
                  )
                  const filtered =
                    relFilter === 'todos'
                      ? detail.relaciones
                      : detail.relaciones.filter(
                          (r) => r.node.type === relFilter
                        )
                  const types = (
                    [
                      'todos',
                      'proveedor',
                      'director',
                      'contrato',
                      'señal',
                      'jurisdiccion',
                    ] as RelFilter[]
                  ).filter((t) => (counts[t] || 0) > 0)

                  return (
                    <>
                      <div className="section-title">
                        Relaciones ({detail.relaciones.length})
                      </div>
                      {types.length > 2 && (
                        <div className="rel-filters">
                          {types.map((t) => (
                            <button
                              key={t}
                              type="button"
                              className={`rel-filter ${
                                relFilter === t ? 'active' : ''
                              }`}
                              onClick={() => setRelFilter(t)}
                            >
                              {TYPE_LABEL_PLURAL[t] || t}
                              <span className="count">{counts[t]}</span>
                            </button>
                          ))}
                        </div>
                      )}
                      <div className="rel-list">
                        {filtered.slice(0, 20).map((r: Relacion, i) => {
                          const sev = r.severidad
                          const sevClass = sev
                            ? `has-severity sev-${sev}`
                            : ''
                          return (
                            <div
                              className={`rel ${sevClass}`}
                              key={i}
                              onClick={() => onSelect(r.node.id)}
                              onMouseEnter={() => onRelHover(r.node.id)}
                              onMouseLeave={() => onRelHover(null)}
                              role="button"
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onSelect(r.node.id)
                              }}
                            >
                              <div className="icon">
                                <NodeIcon type={r.node.type} size={12} />
                              </div>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div className="label">{r.node.label}</div>
                                <div className="meta">
                                  {r.via.replace(/_/g, ' ')}
                                </div>
                              </div>
                              <Ico.Chev size={14} stroke="#5C6478" />
                            </div>
                          )
                        })}
                      </div>
                    </>
                  )
                })()}

              {/* Señales activas (cards expandibles) */}
              {detail.señales.filter(Boolean).length > 0 && (
                <>
                  <div className="section-title">Señales activas</div>
                  {detail.señales.filter(Boolean).map((s, i) => (
                    <div
                      key={i}
                      className={`signal-card ${expanded[i] ? 'expanded' : ''}`}
                    >
                      <span className={`badge sev-${s.severidad}`}>
                        ● {s.severidad}
                      </span>
                      <div className="t">{s.titulo}</div>
                      <div className="r">{s.resumen}</div>
                      {s.evidencia.length > 0 && (
                        <div
                          className="more"
                          onClick={() =>
                            setExpanded((p) => ({ ...p, [i]: !p[i] }))
                          }
                        >
                          {expanded[i]
                            ? 'Ocultar evidencia'
                            : `Ver evidencia (${s.evidencia.length})`}
                        </div>
                      )}
                      {expanded[i] && (
                        <div
                          style={{
                            marginTop: 8,
                            fontSize: 12,
                            color: 'var(--text-2)',
                          }}
                        >
                          {s.evidencia.map((ev, k) => (
                            <div
                              key={k}
                              style={{
                                padding: '5px 0',
                                borderTop: '1px solid var(--stroke)',
                              }}
                            >
                              · {ev.descripcion}
                              <div>
                                <a
                                  href={ev.fuenteUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  style={{
                                    color: 'var(--celeste)',
                                    fontSize: 11,
                                  }}
                                >
                                  {ev.fuenteUrl}
                                </a>
                              </div>
                            </div>
                          ))}
                          <div
                            style={{
                              marginTop: 8,
                              fontSize: 11.5,
                              color: 'var(--text-3)',
                            }}
                          >
                            <strong style={{ color: 'var(--text-2)' }}>
                              Marco legal:
                            </strong>{' '}
                            {s.legal.articulos.join(' · ')}
                            <br />
                            <strong style={{ color: 'var(--text-2)' }}>
                              Denunciar ante:
                            </strong>{' '}
                            {s.legal.denunciarAnte.join(' · ')}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </>
              )}

              {/* Fuentes (accordion) */}
              <div className="section-title">
                <div
                  className="acc-head"
                  onClick={() => setAccSrc((s) => !s)}
                >
                  <span>Fuentes ({detail.fuentes.length})</span>
                  <Ico.ChevDown
                    size={14}
                    // El `style` inline sobre el SVG conserva la rotación
                    // animada del .jsx original.
                  />
                </div>
              </div>
              {accSrc && (
                <div>
                  {detail.fuentes.map((f, i) => (
                    <div className="source-row" key={i}>
                      <a href={f.url} target="_blank" rel="noreferrer">
                        {f.descripcion}
                      </a>
                      <span className="date mono">
                        {f.fechaAcceso}
                        {f.nivelConfianza ? ` · ${f.nivelConfianza}` : ''}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* ── Footer ── */}
            <div className="panel-foot">
              <button
                type="button"
                className="btn primary"
                onClick={handleCopySumario}
                disabled={!detail.contratos || detail.contratos.length === 0}
                title="Copia un bloque Markdown al portapapeles, listo para pegar en Google Docs / Notion / email"
              >
                <Ico.Copy size={14} />{' '}
                {copyStatus === 'ok'
                  ? '✓ Copiado al portapapeles'
                  : copyStatus === 'fail'
                  ? '✗ Error al copiar'
                  : 'Copiar sumario (Markdown)'}
              </button>
              <div className="btn-row">
                <button
                  type="button"
                  className="btn"
                  onClick={handleDownloadImage}
                  disabled={shotStatus === 'busy'}
                  title="Captura el grafo + ficha como PNG con watermark"
                >
                  <Ico.Download size={13} />{' '}
                  {shotStatus === 'busy'
                    ? 'Generando…'
                    : shotStatus === 'ok'
                    ? '✓ Imagen descargada'
                    : shotStatus === 'fail'
                    ? '✗ Error'
                    : 'Descargar imagen (PNG)'}
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={exportJSON}
                  title="Descarga el detalle del nodo en JSON estructurado"
                >
                  <Ico.FileText size={13} /> Exportar JSON
                </button>
                {n.type === 'proveedor' && (
                  <button
                    type="button"
                    className="btn"
                    onClick={handleAddToWatchlist}
                    disabled={enWatchlist}
                    title={
                      enWatchlist
                        ? 'Este proveedor ya está en tu watchlist'
                        : 'Agregar este proveedor a tu watchlist personal'
                    }
                  >
                    {enWatchlist ? '⭐ En tu watchlist' : '☆ Agregar a watchlist'}
                  </button>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </aside>
  )
}
