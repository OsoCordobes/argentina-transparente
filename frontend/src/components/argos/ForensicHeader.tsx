/**
 * ForensicHeader.tsx — header global de las superficies Premium Forensic
 * (D1-D10 del PLAN-UI). Reemplaza AppShell para los módulos nuevos; las
 * páginas legacy siguen usando AppShell hasta que se migren.
 *
 * Diseño: dark forensic, monospace en métricas, glyphs PF/PJ consistentes.
 * Watchlist count: lee localStorage del usuario.
 */
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

export function ForensicHeader() {
  const [watchCount, setWatchCount] = useState(0)
  const navigate = useNavigate()

  useEffect(() => {
    function refresh() {
      try {
        const raw = localStorage.getItem('argos_watchlist_v1')
        const arr = raw ? JSON.parse(raw) : []
        setWatchCount(Array.isArray(arr) ? arr.length : 0)
      } catch { setWatchCount(0) }
    }
    refresh()
    window.addEventListener('storage', refresh)
    window.addEventListener('argos:watchlist-changed', refresh)
    return () => {
      window.removeEventListener('storage', refresh)
      window.removeEventListener('argos:watchlist-changed', refresh)
    }
  }, [])

  return (
    <header style={hdr.bar}>
      <div style={hdr.inner}>
        <Link to="/" style={hdr.brand}>
          <span style={hdr.brandName}>ARGOS</span>
          <span style={hdr.brandSub}>· transparencia argentina</span>
        </Link>

        <nav style={hdr.nav}>
          <Item to="/dinero">Dinero</Item>
          <Item to="/actores">Actores</Item>
          <Item to="/senales">Señales</Item>
          <Item to="/mapa">Mapa</Item>
          <Item to="/casos">Casos</Item>
          <Item to="/comparar">Comparar</Item>
          <Item to="/metodologia">Metodología</Item>
        </nav>

        <div style={hdr.spacer} />

        <button
          type="button"
          onClick={() => navigate('/watchlist')}
          style={hdr.watch}
          title="Watchlist personal"
        >
          <span aria-hidden>★</span>
          <span style={{ fontSize: 11, fontFamily: 'ui-monospace, monospace' }}>
            {watchCount}
          </span>
        </button>
      </div>
    </header>
  )
}

function Item({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <NavLink
      to={to}
      style={({ isActive }) => ({
        ...hdr.navItem,
        color: isActive ? '#dde3ee' : '#9BA3B4',
        borderBottom: isActive ? '2px solid #62C7A0' : '2px solid transparent',
      })}
    >
      {children}
    </NavLink>
  )
}

export function ForensicFooter() {
  return (
    <footer style={ftr.bar}>
      <div style={ftr.inner}>
        <span style={ftr.muted}>ARGOS · motor de detección de patrones · cobertura: Córdoba Capital 2015–2025</span>
        <span style={ftr.dot}>·</span>
        <Link to="/metodologia" style={ftr.link}>¿Cómo funciona ARGOS?</Link>
        <span style={ftr.dot}>·</span>
        <span style={ftr.muted}>Toda señal con fuente trazable · La plataforma describe, no acusa.</span>
      </div>
    </footer>
  )
}

const hdr = {
  bar: {
    background: '#0d1117',
    borderBottom: '1px solid #1f2937',
    position: 'sticky' as const, top: 0, zIndex: 30,
  },
  inner: {
    maxWidth: 1480, margin: '0 auto',
    display: 'flex', alignItems: 'center', gap: 24,
    padding: '0 24px', height: 52,
  },
  brand: {
    display: 'flex', alignItems: 'baseline', gap: 8,
    color: '#dde3ee', textDecoration: 'none', fontWeight: 600,
  },
  brandName: { fontSize: 16, letterSpacing: 0.5 },
  brandSub: { fontSize: 11, color: '#9BA3B4' },
  nav: { display: 'flex', alignItems: 'center', gap: 4 },
  navItem: {
    padding: '0 10px',
    height: 51, display: 'inline-flex', alignItems: 'center',
    fontSize: 13, fontWeight: 500, textDecoration: 'none',
    transition: 'color 120ms',
  } as React.CSSProperties,
  spacer: { flex: 1 },
  watch: {
    background: 'transparent', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '5px 10px', borderRadius: 3,
    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
    fontSize: 12,
  } as React.CSSProperties,
}

const ftr = {
  bar: {
    background: '#0d1117',
    borderTop: '1px solid #1f2937',
    marginTop: 'auto',
  } as React.CSSProperties,
  inner: {
    maxWidth: 1480, margin: '0 auto',
    padding: '14px 24px',
    display: 'flex', flexWrap: 'wrap' as const, alignItems: 'center', gap: 8,
    fontSize: 11,
  },
  muted: { color: '#9BA3B4' },
  dot: { color: '#3a4150' },
  link: { color: '#7da3ff', textDecoration: 'none' },
}
