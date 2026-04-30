/**
 * V4 Forensic — Primitivos React tipados
 *
 * Port de argos-v3/project/forensic/system.jsx con:
 * - props tipadas
 * - estilos en argos-forensic.css (imported como side-effect)
 * - tooltip nativo en TierDot via title=
 *
 * Importante: si rendereás cualquier de estos, importás esta entrada y CSS
 * cargado de side-effect. No es necesario importar argos-forensic.css aparte.
 */
import { ReactNode } from 'react'
import '@/styles/argos.css'
import '@/styles/argos-forensic.css'
import type { Severity, Kind, Tier } from './types'

// ─── Severity Pill ────────────────────────────────────────────────────────────

export function SevPill({ kind }: { kind: Severity }) {
  return (
    <span className={`fx-sev-pill fx-sev-pill--${kind}`}>
      <span className="dot" />
      {kind.toUpperCase()}
    </span>
  )
}

// ─── Glyph PF / PJ / JR ───────────────────────────────────────────────────────

export function Glyph({ kind, size = 8 }: { kind: Kind; size?: number }) {
  const klass = kind === 'PF' ? 'fx-glyph fx-glyph--pf'
    : kind === 'PJ' ? 'fx-glyph fx-glyph--pj'
    : 'fx-glyph fx-glyph--jr'
  return (
    <span
      className={klass}
      style={size !== 8 ? { width: size, height: size } : undefined}
      aria-hidden
    />
  )
}

// ─── Tier dot (con tooltip nativo) ────────────────────────────────────────────

const TIER_LABEL: Record<Tier, string> = {
  1: 'Tier 1 — oficial verificado',
  2: 'Tier 2 — oficial inferido',
  3: 'Tier 3 — scraped, sujeto a revisión',
}

export function TierDot({ tier = 1 }: { tier?: Tier }) {
  return <span className={`fx-tier fx-tier--${tier}`} title={TIER_LABEL[tier]} />
}

// ─── Filter Chip (vertical: label arriba, value abajo) ────────────────────────

interface FilterChipProps {
  label: string
  value: string
  active?: boolean
  onClick?: () => void
}
export function FilterChip({ label, value, active, onClick }: FilterChipProps) {
  return (
    <button
      type="button"
      className={`fx-chip ${active ? 'fx-chip--active' : ''}`}
      onClick={onClick}
    >
      <span className="fx-chip__label">{label}</span>
      <span className="fx-chip__value">{value}</span>
    </button>
  )
}

// ─── FCM (filter cell horizontal: label | value) ──────────────────────────────

interface FCMProps {
  label: string
  value: string
  active?: boolean
  onClick?: () => void
}
export function FCM({ label, value, active, onClick }: FCMProps) {
  return (
    <button
      type="button"
      className={`fx-fcm ${active ? 'fx-fcm--active' : ''}`}
      onClick={onClick}
    >
      <span className="fx-fcm__label">{label}</span>
      <span className="fx-fcm__value">{value}</span>
    </button>
  )
}

// ─── Filter Field (más sutil, para top de tablas) ─────────────────────────────

interface FilterFieldProps {
  label: string
  value: string
  wide?: boolean
  onClick?: () => void
}
export function FilterField({ label, value, wide, onClick }: FilterFieldProps) {
  return (
    <button
      type="button"
      className={`fx-field ${wide ? 'fx-field--wide' : ''}`}
      onClick={onClick}
      style={{ background: 'transparent', cursor: 'pointer' }}
    >
      <span className="fx-field__label">{label}</span>
      <span className="fx-field__value">{value}</span>
    </button>
  )
}

// ─── Kbd ──────────────────────────────────────────────────────────────────────

export function Kbd({ children }: { children: ReactNode }) {
  return <kbd className="fx-kbd">{children}</kbd>
}

// ─── Legend row (severidad visible) ───────────────────────────────────────────

interface LegendRowProps {
  color: string
  label: string
  n: number | string
}
export function LegendRow({ color, label, n }: LegendRowProps) {
  const display = typeof n === 'number' ? String(n).padStart(2, '0') : n
  return (
    <div className="fx-legend-row">
      <span className="swatch" style={{ background: color }} />
      <span style={{ flex: 1, letterSpacing: '0.04em' }}>{label}</span>
      <span style={{ color: 'var(--text-3)' }}>{display}</span>
    </div>
  )
}

// ─── Forensic Header ──────────────────────────────────────────────────────────

interface ForensicHeaderProps {
  /** Sección a mostrar (mono uppercase a la izq) */
  section: string
  /** Si es una superficie con grafo, no muestra "VOLVER AL GRAFO" */
  isGraphSurface?: boolean
  /** Si tiene tracking Δ habilitado, muestra el botón */
  hasDelta?: boolean
  /** Fecha legible para Δ (default: lo lee de localStorage en M2) */
  deltaSince?: string | null
  /** Custom right content (vista filtros, label toggle, etc.) */
  customRight?: ReactNode
  /** Click handlers */
  onClickDelta?: () => void
  onClickBackToGraph?: () => void
  onClickLabelsToggle?: () => void
  /** Estado del toggle de labels (graph surfaces) */
  labelsOn?: boolean
}

export function ForensicHeader({
  section,
  isGraphSurface = false,
  hasDelta = true,
  deltaSince,
  customRight,
  onClickDelta,
  onClickBackToGraph,
  onClickLabelsToggle,
  labelsOn = false,
}: ForensicHeaderProps) {
  const today = new Date().toLocaleDateString('es-AR', {
    day: '2-digit', month: '2-digit', year: '2-digit',
  })
  const deltaLabel = deltaSince ?? '28/04'
  return (
    <header className="fx-header">
      <div style={{ display: 'flex' }}>
        <div className="fx-header__section">/{section}</div>
      </div>
      <div style={{ display: 'flex' }}>
        {customRight}
        {isGraphSurface && (
          <button
            type="button"
            className="fx-header__btn"
            onClick={onClickLabelsToggle}
            title="Toggle labels"
          >
            {labelsOn ? 'LABELS:ON' : 'LABELS:OFF'}
          </button>
        )}
        {!isGraphSurface && (
          <button
            type="button"
            className="fx-header__btn"
            onClick={onClickBackToGraph}
            title="Volver al grafo (/)"
          >
            <svg
              width="11" height="11" viewBox="0 0 16 16"
              fill="none" stroke="currentColor" strokeWidth="1.4"
              aria-hidden
            >
              <path d="M2 8h12M8 2 2 8l6 6" />
            </svg>
            VOLVER AL GRAFO
          </button>
        )}
        {hasDelta && (
          <button
            type="button"
            className="fx-header__btn"
            onClick={onClickDelta}
            title="Ver cambios desde tu última visita"
          >
            Δ DESDE {deltaLabel}
          </button>
        )}
        <div className="fx-header__pill">
          <span className="dot" />
          DATOS AL {today}
        </div>
      </div>
    </header>
  )
}
