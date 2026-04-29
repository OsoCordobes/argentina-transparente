/**
 * ProfileTwoPane.tsx — Layout reusable para Profile (PF y PJ).
 *
 * PLAN-UI Módulo #4. Two-pane sticky header:
 *   ┌── Cabecera sticky con nombre/ID/badges/CTAs ──┐
 *   │                                              │
 *   │  [Nav izq]      [Contenido der]              │
 *   │  (secciones)    (scroll independiente)       │
 *   └──────────────────────────────────────────────┘
 *
 * CTAs cabecera (decisión brainstorm):
 *   - + Watchlist (toggle, persiste en localStorage)
 *   - + Caso (drawer con casos del usuario o crear nuevo)
 *   - Compartir (copia URL al clipboard)
 *
 * Sigue el sistema visual Premium Forensic dark.
 */
import { useState, useEffect, useMemo, useRef } from 'react'

export interface ProfileSection {
  id: string
  label: string
  /** Badge numérico opcional (ej. count de señales). */
  badge?: number
  content: React.ReactNode
}

export interface ProfileHeaderInfo {
  /** Nombre/razón social principal. */
  title: string
  /** Identificador (DNI o CUIT). */
  identityLabel: string
  identityValue: string
  /** Glyph (● PF, ■ PJ). */
  glyph: string
  glyphColor: string
  /** Badge de identidad (✓ verificada, etc). */
  badge?: React.ReactNode
  /** Tagline secundario (jurisdicción, tipo societario, etc). */
  subtitle?: string
}

interface Props {
  header: ProfileHeaderInfo
  sections: ProfileSection[]
  /** ID del actor (DNI o CUIT) para watchlist y caso. */
  actorId: string
  /** Tipo de actor para watchlist persistido. */
  actorKind: 'pf' | 'pj'
}

export function ProfileTwoPane({ header, sections, actorId, actorKind }: Props) {
  const [activeId, setActiveId] = useState(sections[0]?.id ?? '')
  const [inWatchlist, setInWatchlist] = useState(false)
  const [shareToast, setShareToast] = useState(false)
  const sectionRefs = useRef<Record<string, HTMLDivElement | null>>({})

  // Load watchlist state
  useEffect(() => {
    try {
      const raw = localStorage.getItem('argos_watchlist_v1')
      const arr: Array<{ id: string }> = raw ? JSON.parse(raw) : []
      setInWatchlist(arr.some(item => item.id === actorId))
    } catch { /* ignore */ }
  }, [actorId])

  function toggleWatchlist() {
    try {
      const raw = localStorage.getItem('argos_watchlist_v1')
      const arr: Array<{ id: string; kind: 'pf' | 'pj'; label: string; addedAt: string }> =
        raw ? JSON.parse(raw) : []
      const exists = arr.some(x => x.id === actorId)
      const next = exists
        ? arr.filter(x => x.id !== actorId)
        : [...arr, { id: actorId, kind: actorKind, label: header.title, addedAt: new Date().toISOString() }]
      localStorage.setItem('argos_watchlist_v1', JSON.stringify(next))
      setInWatchlist(!exists)
      window.dispatchEvent(new Event('argos:watchlist-changed'))
    } catch { /* ignore */ }
  }

  function copyShareUrl() {
    try {
      navigator.clipboard.writeText(window.location.href)
      setShareToast(true)
      setTimeout(() => setShareToast(false), 1800)
    } catch { /* ignore */ }
  }

  function addToCaso() {
    // MVP: redirige a /casos con la entidad seleccionada como query param.
    // El módulo D7 (Caso) leerá ese query y permitirá adjuntar al caso elegido.
    window.location.href = `/casos?adjuntar=${encodeURIComponent(actorId)}&kind=${actorKind}`
  }

  const sectionList = useMemo(() => sections, [sections])

  function jumpTo(id: string) {
    setActiveId(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <div style={s.shell}>
      <div style={s.headerSticky}>
        <div style={s.headerInner}>
          <div style={s.headerLeft}>
            <span style={{ ...s.glyph, color: header.glyphColor, borderColor: header.glyphColor }}>
              {header.glyph}
            </span>
            <div>
              <h1 style={s.title}>{header.title}</h1>
              <div style={s.subtitle}>
                <span style={s.idLabel}>{header.identityLabel}</span>
                <span style={s.idValue}>{header.identityValue}</span>
                {header.badge && <span style={{ marginLeft: 12 }}>{header.badge}</span>}
                {header.subtitle && <span style={s.subText}>· {header.subtitle}</span>}
              </div>
            </div>
          </div>
          <div style={s.headerCTAs}>
            <button
              onClick={toggleWatchlist}
              style={{ ...s.cta, ...(inWatchlist ? s.ctaActive : null) }}
              title={inWatchlist ? 'Remover de watchlist' : 'Agregar a watchlist'}
            >
              {inWatchlist ? '★ En watchlist' : '☆ Watchlist'}
            </button>
            <button onClick={addToCaso} style={s.cta} title="Agregar a un caso">
              + Caso
            </button>
            <button onClick={copyShareUrl} style={s.cta} title="Copiar URL al clipboard">
              {shareToast ? '✓ Copiado' : 'Compartir'}
            </button>
          </div>
        </div>
      </div>

      <div style={s.body}>
        <nav style={s.sidenav}>
          {sectionList.map(sec => (
            <button
              key={sec.id}
              onClick={() => jumpTo(sec.id)}
              style={{
                ...s.navBtn,
                ...(activeId === sec.id ? s.navBtnActive : null),
              }}
            >
              {activeId === sec.id ? '» ' : '  '}{sec.label}
              {sec.badge !== undefined && sec.badge > 0 && (
                <span style={s.navBadge}>{sec.badge}</span>
              )}
            </button>
          ))}
        </nav>
        <div style={s.content}>
          {sectionList.map(sec => (
            <div
              key={sec.id}
              ref={el => { sectionRefs.current[sec.id] = el }}
              style={s.contentBlock}
              id={`section-${sec.id}`}
            >
              <h2 style={s.sectionTitle}>{sec.label}</h2>
              {sec.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  shell: {
    background: '#0d1117', color: '#dde3ee', minHeight: '100vh',
    display: 'flex', flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  headerSticky: {
    position: 'sticky', top: 0, zIndex: 20,
    background: '#0d1117', borderBottom: '1px solid #1f2937',
  },
  headerInner: {
    maxWidth: 1480, margin: '0 auto',
    padding: '18px 24px',
    display: 'flex', alignItems: 'flex-start', gap: 24,
  },
  headerLeft: { display: 'flex', alignItems: 'center', gap: 16, flex: 1 },
  glyph: {
    fontSize: 22, width: 38, height: 38,
    border: '1px solid', borderRadius: 4,
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: 'ui-monospace, monospace',
  },
  title: { fontSize: 20, margin: 0, fontWeight: 600, color: '#dde3ee' },
  subtitle: {
    fontSize: 12, color: '#9BA3B4', marginTop: 4,
    display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6,
  },
  idLabel: { letterSpacing: 1, textTransform: 'uppercase' as const, fontSize: 10 },
  idValue: { fontFamily: 'ui-monospace, monospace', color: '#dde3ee' },
  subText: { color: '#9BA3B4' },
  headerCTAs: { display: 'flex', gap: 8 },
  cta: {
    background: 'transparent', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '6px 12px', borderRadius: 3,
    fontSize: 12, cursor: 'pointer', whiteSpace: 'nowrap' as const,
  },
  ctaActive: { borderColor: '#62C7A0', color: '#62C7A0' },

  body: {
    maxWidth: 1480, width: '100%', margin: '0 auto',
    display: 'grid', gridTemplateColumns: '200px 1fr',
    gap: 24, padding: '20px 24px', flex: 1,
  },
  sidenav: {
    position: 'sticky', top: 110, alignSelf: 'flex-start',
    display: 'flex', flexDirection: 'column', gap: 2,
    paddingTop: 6,
  },
  navBtn: {
    background: 'transparent', border: 'none',
    color: '#9BA3B4', textAlign: 'left' as const,
    padding: '7px 10px', borderRadius: 3, fontSize: 13, cursor: 'pointer',
    fontFamily: 'inherit',
    display: 'flex', alignItems: 'center', gap: 6,
  },
  navBtnActive: {
    color: '#dde3ee', background: '#161b22',
  },
  navBadge: {
    marginLeft: 'auto',
    fontFamily: 'ui-monospace, monospace', fontSize: 10,
    background: '#1f2937', color: '#9BA3B4',
    padding: '1px 6px', borderRadius: 8, minWidth: 18, textAlign: 'center' as const,
  },
  content: { minWidth: 0 }, // grid prevents overflow on long content
  contentBlock: { marginBottom: 28 },
  sectionTitle: {
    fontSize: 11, letterSpacing: 2, color: '#9BA3B4',
    textTransform: 'uppercase' as const, fontWeight: 600,
    marginBottom: 12, paddingBottom: 8, borderBottom: '1px solid #1f2937',
  },
}
