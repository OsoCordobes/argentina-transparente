/**
 * ArgosShell.tsx
 *
 * Shell unificado dark graph-first para todas las superficies que NO son
 * el grafo principal (que vive en ExplorarLayout). Reemplaza ForensicHeader
 * y AppShell. Todas las páginas usan este shell.
 *
 * Estructura: sidebar fija (220px) + main (flex 1) con header sticky + body.
 * Tema: argos.css (dark, --bg-0/--bg-1, sin Tailwind dark/light bifurcation).
 *
 * Sidebar es route-based (NavLink). Diseño coherente con ExplorarLayout.
 */
import '@/styles/argos.css'
import '@/styles/argos-forensic.css'
import { ReactNode, useEffect, useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Ico } from './ArgosIcons'
import { ForensicHeader } from './forensic/Primitives'
import { DeltaPanel } from './forensic/DeltaPanel'
import { useDeltaSinceLastVisit } from '@/lib/argos/diff'
import { VERSION_LABEL } from '@/lib/argos/version'

interface NavSection {
  to: string
  label: string
  icon: typeof Ico.Home
  end?: boolean
}

const SECTIONS: NavSection[] = [
  { to: '/', label: 'Inicio', icon: Ico.Home, end: true },
  { to: '/dinero', label: 'Dinero', icon: Ico.Briefcase },
  { to: '/senales', label: 'Señales', icon: Ico.Alert },
  { to: '/actores', label: 'Actores', icon: Ico.User },
  { to: '/casos', label: 'Mis casos', icon: Ico.FileText },
  { to: '/watchlist', label: 'Watchlist', icon: Ico.Eye },
  { to: '/comparar', label: 'Comparar', icon: Ico.Network },
  { to: '/fuentes', label: 'Fuentes', icon: Ico.Database },
  { to: '/metodologia', label: 'Metodología', icon: Ico.Info },
]

function ArgosMark({ size = 30 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <radialGradient id="iris-shell" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#6FB8E8" stopOpacity="1" />
          <stop offset="100%" stopColor="#6FB8E8" stopOpacity="0" />
        </radialGradient>
      </defs>
      <polygon points="16,2 28,8 28,24 16,30 4,24 4,8" fill="none" stroke="#6FB8E8" strokeWidth="1.4" opacity="0.85" />
      <polygon points="16,6 25,10 25,22 16,26 7,22 7,10" fill="none" stroke="#6FB8E8" strokeOpacity="0.35" strokeWidth="0.8" />
      <ellipse cx="16" cy="16" rx="8" ry="5" fill="none" stroke="#F5F7FA" strokeWidth="1.2" />
      <circle cx="16" cy="16" r="3.2" fill="url(#iris-shell)" />
      <circle cx="16" cy="16" r="1.6" fill="#F5F7FA" />
      {[0, 1, 2, 3, 4, 5].map((i) => {
        const a = (i * Math.PI) / 3 + Math.PI / 6
        const x1 = 16 + Math.cos(a) * 9
        const y1 = 16 + Math.sin(a) * 9
        const x2 = 16 + Math.cos(a) * 12
        const y2 = 16 + Math.sin(a) * 12
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#6FB8E8" strokeOpacity="0.4" strokeWidth="0.7" />
      })}
    </svg>
  )
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <Link to="/" className="brand" style={{ textDecoration: 'none', color: 'inherit' }}>
        <ArgosMark size={30} />
        <div className="brand-text">
          <div className="name">ARGOS</div>
          <div className="tag" style={{ fontFamily: 'var(--font-mono)' }}>{VERSION_LABEL}</div>
        </div>
      </Link>
      <nav className="nav" aria-label="Secciones">
        {SECTIONS.map((s) => {
          const I = s.icon
          return (
            <NavLink
              key={s.to}
              to={s.to}
              end={s.end}
              className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
              title={s.label}
            >
              {({ isActive }) => (
                <>
                  <I size={16} stroke={isActive ? '#6FB8E8' : 'currentColor'} sw={1.7} />
                  <span className="l">{s.label}</span>
                </>
              )}
            </NavLink>
          )
        })}
      </nav>
      <div className="sidebar-foot" style={{ marginTop: 'auto', padding: '14px 16px', borderTop: '1px solid var(--stroke)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-3)', marginBottom: 4 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--verde)', boxShadow: '0 0 6px rgba(74,222,128,0.6)' }} />
          Backend conectado
        </div>
        <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)' }}>Córdoba 2018-2025</div>
      </div>
    </aside>
  )
}

interface ArgosShellProps {
  /** Texto de la zona izquierda del header (ej. "Señales detectadas") */
  title: string
  /** Acción opcional a la derecha del header */
  rightSlot?: ReactNode
  /** Cuerpo de la página (scroll vertical interno) */
  children: ReactNode
}

export function ArgosShell({ title, rightSlot, children }: ArgosShellProps) {
  const navigate = useNavigate()
  const { lastVisit, lastVisitShort } = useDeltaSinceLastVisit()
  const [deltaOpen, setDeltaOpen] = useState(false)
  // Sección mono uppercase derivada del title (toma la primera palabra antes de ·)
  const sectionLabel = title.split('·')[0].trim().toUpperCase()

  // Wave 4 — keyboard infra global: Esc dispara `argos:escape` event.
  // Cualquier componente puede subscribirse para cerrar panels/popups.
  // Solo expone el event; no modifica behavior existente.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        window.dispatchEvent(new CustomEvent('argos:escape'))
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="app">
      <Sidebar />
      <div className="main">
        <ForensicHeader
          section={sectionLabel}
          isGraphSurface={false}
          hasDelta={true}
          deltaSince={lastVisitShort}
          onClickDelta={() => setDeltaOpen(true)}
          onClickBackToGraph={() => navigate('/')}
          customRight={rightSlot}
        />
        <DeltaPanel
          open={deltaOpen}
          onClose={() => setDeltaOpen(false)}
          lastVisitIso={lastVisit}
        />
        <div
          className="argos-shell-body"
          style={{
            position: 'absolute',
            top: 'var(--header-h)',
            left: 0, right: 0, bottom: 0,
            overflowY: 'auto',
            padding: '24px 32px 48px',
            color: 'var(--text)',
          }}
        >
          {children}
        </div>
      </div>
    </div>
  )
}
