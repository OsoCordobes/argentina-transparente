// ─── Case workspace shell ──────────────────────────────────
// 3-pane grid layout that hosts an investigation (caso).
//   rail (72px) · pistas (260px) · main (1fr) · ai-sidebar (340px)
// Rows: topbar (52) · viewbar (38) · content (1fr).
// Based on the handoff design at design-handoff/argos-design-system/
// project/prototype/workspace.css — classes live in index.css.

import { useEffect, type ReactNode } from 'react'
import {
  FolderOpen,
  Compass,
  Eye,
  Library,
  User,
  Network,
  Clock,
  Map,
  Table,
  FileText,
  Share2,
  Save,
  HelpCircle,
} from 'lucide-react'
import ArgosMark from './ArgosMark'

export type CaseView = 'grafo' | 'timeline' | 'mapa' | 'tabla' | 'dossier'

type CaseViewDef = {
  id: CaseView
  label: string
  kbd: string
  icon: (props: { size?: number }) => ReactNode
}

export const CASE_VIEWS: CaseViewDef[] = [
  { id: 'grafo',    label: 'Grafo',    kbd: 'G', icon: ({ size = 13 }) => <Network size={size} /> },
  { id: 'timeline', label: 'Timeline', kbd: 'T', icon: ({ size = 13 }) => <Clock size={size} /> },
  { id: 'mapa',     label: 'Mapa',     kbd: 'M', icon: ({ size = 13 }) => <Map size={size} /> },
  { id: 'tabla',    label: 'Tabla',    kbd: 'B', icon: ({ size = 13 }) => <Table size={size} /> },
  { id: 'dossier',  label: 'Dossier',  kbd: 'D', icon: ({ size = 13 }) => <FileText size={size} /> },
]

type Section = 'casos' | 'explorar' | 'watchlist' | 'biblioteca' | 'cuenta'

type Props = {
  caseTitle: string
  caseSubtitle?: string
  activeView: CaseView
  onChangeView: (v: CaseView) => void
  activeSection?: Section
  onChangeSection?: (s: Section) => void
  pistas: ReactNode
  main: ReactNode
  aiSidebar: ReactNode
  topbarRight?: ReactNode
  pistasCollapsed?: boolean
  aiCollapsed?: boolean
}

const RAIL_BUTTONS: Array<{ id: Section; label: string; icon: typeof FolderOpen }> = [
  { id: 'casos',      label: 'Casos',      icon: FolderOpen },
  { id: 'explorar',   label: 'Explorar',   icon: Compass },
  { id: 'watchlist',  label: 'Watchlist',  icon: Eye },
  { id: 'biblioteca', label: 'Biblioteca', icon: Library },
]

export default function CaseLayout({
  caseTitle,
  caseSubtitle,
  activeView,
  onChangeView,
  activeSection = 'casos',
  onChangeSection,
  pistas,
  main,
  aiSidebar,
  topbarRight,
  pistasCollapsed = false,
  aiCollapsed = false,
}: Props) {
  // Keyboard shortcuts: G / T / M / B / D switch view. Ignore when typing.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable) return
      if (e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return
      const match = CASE_VIEWS.find((v) => v.kbd.toLowerCase() === e.key.toLowerCase())
      if (match) {
        e.preventDefault()
        onChangeView(match.id)
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onChangeView])

  const shellClass = [
    'argos-shell',
    pistasCollapsed && 'pistas-collapsed',
    aiCollapsed && 'ai-collapsed',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div className={shellClass}>
      {/* ─── Left rail ─────────────────────────────────── */}
      <aside className="argos-area-rail">
        <div className="rail">
          <div className="rail-brand">
            <ArgosMark size={28} />
          </div>

          {RAIL_BUTTONS.map((b) => {
            const Icon = b.icon
            const on = activeSection === b.id
            return (
              <button
                key={b.id}
                type="button"
                className={`rail-btn ${on ? 'on' : ''}`}
                onClick={() => onChangeSection?.(b.id)}
                aria-label={b.label}
                aria-current={on ? 'page' : undefined}
              >
                <Icon size={18} strokeWidth={1.75} />
                <span className="rail-tip">{b.label}</span>
              </button>
            )
          })}

          <div className="rail-spacer" />

          <button
            type="button"
            className={`rail-btn ${activeSection === 'cuenta' ? 'on' : ''}`}
            onClick={() => onChangeSection?.('cuenta')}
            aria-label="Cuenta"
          >
            <User size={18} strokeWidth={1.75} />
            <span className="rail-tip">Cuenta</span>
          </button>
        </div>
      </aside>

      {/* ─── Topbar ────────────────────────────────────── */}
      <header className="argos-area-topbar flex items-center px-4 gap-3">
        <div className="flex flex-col min-w-0">
          <span className="eyebrow" style={{ fontSize: 9, marginBottom: 1 }}>
            Caso activo
          </span>
          <span
            className="text-[13px] font-semibold text-[color:var(--fg)] truncate"
            title={caseTitle}
          >
            {caseTitle}
          </span>
        </div>
        {caseSubtitle && (
          <>
            <span className="h-5 w-px bg-[color:var(--gray-200)]" />
            <span className="text-[12px] text-[color:var(--fg-muted)] truncate">
              {caseSubtitle}
            </span>
          </>
        )}
        <div className="flex-1" />
        {topbarRight ?? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--surface-hover)]"
            >
              <Save size={13} />
              Guardado
            </button>
            <button
              type="button"
              className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-md text-[11px] text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--surface-hover)]"
            >
              <Share2 size={13} />
              Compartir
            </button>
            <button
              type="button"
              className="inline-flex items-center justify-center h-7 w-7 rounded-md text-[color:var(--fg-muted)] hover:text-[color:var(--fg)] hover:bg-[color:var(--surface-hover)]"
              aria-label="Ayuda"
            >
              <HelpCircle size={14} />
            </button>
          </div>
        )}
      </header>

      {/* ─── Viewbar ───────────────────────────────────── */}
      <div className="argos-area-viewbar flex items-center px-4 gap-3">
        <div className="view-tabs" role="tablist">
          {CASE_VIEWS.map((v) => {
            const on = v.id === activeView
            return (
              <button
                key={v.id}
                type="button"
                role="tab"
                aria-selected={on}
                className={on ? 'on' : ''}
                onClick={() => onChangeView(v.id)}
                title={`${v.label} · ${v.kbd}`}
              >
                {v.icon({ size: 12 })}
                <span>{v.label}</span>
                <span className="kbd">{v.kbd}</span>
              </button>
            )
          })}
        </div>
        <span className="text-[11px] text-[color:var(--fg-subtle)] ml-auto">
          5 vistas · misma investigación
        </span>
      </div>

      {/* ─── Pistas sidebar ────────────────────────────── */}
      <aside className="argos-area-pistas flex flex-col">{pistas}</aside>

      {/* ─── Main canvas ───────────────────────────────── */}
      <main className="argos-area-main relative flex flex-col">{main}</main>

      {/* ─── AI sidebar ────────────────────────────────── */}
      <aside className="argos-area-ai flex flex-col">{aiSidebar}</aside>
    </div>
  )
}
