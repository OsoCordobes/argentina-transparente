/**
 * Landing.tsx — superficie /  (PLAN-UI Módulo #1).
 *
 * Misión única: en 5 segundos, un periodista/fiscal entiende qué hace
 * ARGOS y va a la superficie correcta. NO es para explorar.
 *
 * Componentes:
 *   - Hero con North Star metric ($X AUDITADOS) en monospace XL
 *   - SEÑALES DETECTADAS DEL MES (1 featured + 4 compactas)
 *   - 5 CTAs grandes hacia las superficies internas
 *   - Footer con disclaimer + cobertura
 *
 * Visual: Premium Forensic dark.
 */
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ForensicHeader, ForensicFooter } from '@/components/argos/ForensicHeader'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import type { EstadoVerificacionSeñal } from '@/lib/argos/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface LandingData {
  hero: {
    montoAuditado: number
    cantidadContratos: number
    cantidadAgentes: number
    jurisdiccionPrimaria: string
    rangoAnios: { desde: number; hasta: number }
    signalsGraves: number
    casosGenerados: number
  }
  feed: Array<{
    id: string
    tipologia: string
    titulo: string
    resumen: string
    score: number
    severidad: 'grave' | 'moderada' | 'leve'
    estadoVerificacion: EstadoVerificacionSeñal
    computadoEn: string
    cuitsAsociados: string[]
  }>
  sumario: {
    total: number
    porEstado: Record<string, number>
    porSeveridad: Record<string, number>
  }
}

export default function Landing() {
  const [data, setData] = useState<LandingData | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`${API_URL}/api/landing`, { signal: ac.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { if (!ac.signal.aborted) setData(d) })
      .catch(e => { if (!ac.signal.aborted) setError((e as Error).message) })
    return () => ac.abort()
  }, [])

  return (
    <div style={s.page}>
      <ForensicHeader />
      <main style={s.main}>
        <Hero data={data} />
        <SignalsDelMes data={data} error={error} />
        <Surfaces />
        <FuentesPreview data={data} />
      </main>
      <ForensicFooter />
    </div>
  )
}

function Hero({ data }: { data: LandingData | null }) {
  const monto = data?.hero.montoAuditado ?? 0
  const contratos = data?.hero.cantidadContratos ?? 0
  const graves = data?.hero.signalsGraves ?? 0
  const casos = data?.hero.casosGenerados ?? 0
  const desde = data?.hero.rangoAnios.desde ?? 2015
  const hasta = data?.hero.rangoAnios.hasta ?? 2025
  const jurisdiccion = data?.hero.jurisdiccionPrimaria ?? 'Córdoba Capital'

  return (
    <section style={s.hero}>
      <div style={s.heroAmount}>{formatPesos(monto)}</div>
      <div style={s.heroLabel}>AUDITADOS</div>
      <div style={s.heroSub}>
        en <span style={s.mono}>{contratos.toLocaleString('es-AR')}</span> contratos ·{' '}
        {jurisdiccion} · <span style={s.mono}>{desde}–{hasta}</span>
      </div>
      <div style={s.heroDivider} />
      <div style={s.heroSub}>
        <span style={s.mono}>{graves}</span> señales graves ·{' '}
        <span style={s.mono}>{casos}</span> tipologías con casos potenciales
      </div>
    </section>
  )
}

function SignalsDelMes({ data, error }: { data: LandingData | null; error: string | null }) {
  if (error) {
    return <SectionWrap title="Señales detectadas">
      <div style={s.error}>Error cargando señales: {error}</div>
    </SectionWrap>
  }
  if (!data) {
    return <SectionWrap title="Señales detectadas"><div style={s.muted}>Cargando…</div></SectionWrap>
  }
  if (data.feed.length === 0) {
    return <SectionWrap title="Señales detectadas">
      <div style={s.muted}>El motor todavía no detectó señales para mostrar.</div>
    </SectionWrap>
  }

  const [featured, ...rest] = data.feed
  const compactas = rest.slice(0, 4)

  return (
    <SectionWrap title={`Señales detectadas · ${formatMes(data.feed[0].computadoEn)}`}>
      <FeaturedCard sig={featured} />
      {compactas.length > 0 && (
        <div style={s.compactGrid}>
          {compactas.map(sig => <CompactCard key={sig.id} sig={sig} />)}
        </div>
      )}
      <div style={s.feedFooter}>
        <Link to="/senales" style={s.link}>Ver todas las señales →</Link>
      </div>
    </SectionWrap>
  )
}

function FeaturedCard({ sig }: { sig: LandingData['feed'][0] }) {
  const sevColor = sevColorMap[sig.severidad]
  const cuit = sig.cuitsAsociados[0]
  const linkTarget = cuit ? `/empresa/${cuit}` : `/senales?focus=${sig.id}`
  return (
    <article style={s.featured}>
      <div style={s.featuredHead}>
        <span style={{ ...s.sevBadge, background: sevColor + '22', color: sevColor, borderColor: sevColor }}>
          ★ TOP SCORE · severidad {sig.severidad} · score {sig.score}
        </span>
        <VerificacionBadge estado={sig.estadoVerificacion} compact />
      </div>
      <div style={s.featuredTitle}>{sig.titulo}</div>
      <div style={s.featuredResumen}>{sig.resumen}</div>
      <Link to={linkTarget} style={s.cta}>Ver detalle →</Link>
    </article>
  )
}

function CompactCard({ sig }: { sig: LandingData['feed'][0] }) {
  const sevColor = sevColorMap[sig.severidad]
  const cuit = sig.cuitsAsociados[0]
  const linkTarget = cuit ? `/empresa/${cuit}` : `/senales?focus=${sig.id}`
  return (
    <Link to={linkTarget} style={s.compact}>
      <div style={s.compactHead}>
        <span style={{ ...s.sevDot, background: sevColor }} />
        <span style={s.compactScore}>{sig.score}</span>
        <VerificacionBadge estado={sig.estadoVerificacion} compact />
      </div>
      <div style={s.compactTipologia}>{prettifyTipologia(sig.tipologia)}</div>
      <div style={s.compactTitle}>{sig.titulo}</div>
    </Link>
  )
}

function Surfaces() {
  const items = [
    { to: '/dinero', title: 'DINERO', sub: '¿Adónde fue cada peso?', glyph: '$' },
    { to: '/actores', title: 'ACTORES', sub: 'Personas y empresas del universo', glyph: '⚭' },
    { to: '/senales', title: 'SEÑALES', sub: 'Patrones detectados por el motor', glyph: '⚐' },
    { to: '/mapa', title: 'MAPA', sub: 'Red de relaciones interactiva', glyph: '◉' },
    { to: '/metodologia', title: 'MÉTODO', sub: '¿Cómo funciona ARGOS?', glyph: '?' },
  ]
  return (
    <SectionWrap title="Superficies">
      <div style={s.surfaceGrid}>
        {items.map(it => (
          <Link key={it.to} to={it.to} style={s.surface}>
            <div style={s.surfaceGlyph}>{it.glyph}</div>
            <div style={s.surfaceTitle}>{it.title}</div>
            <div style={s.surfaceSub}>{it.sub}</div>
          </Link>
        ))}
      </div>
    </SectionWrap>
  )
}

function FuentesPreview({ data }: { data: LandingData | null }) {
  if (!data) return null
  const totalContratos = data.hero.cantidadContratos
  const totalAgentes = data.hero.cantidadAgentes
  return (
    <SectionWrap title="Cobertura del dataset">
      <div style={s.coverageGrid}>
        <Stat label="Contratos auditados" value={totalContratos.toLocaleString('es-AR')} />
        <Stat label="Agentes públicos cargados" value={totalAgentes.toLocaleString('es-AR')} />
        <Stat label="Señales totales" value={data.sumario.total.toLocaleString('es-AR')} />
        <Stat label="Verificadas" value={String(data.sumario.porEstado.verificada ?? 0)} />
      </div>
      <div style={s.coverageNote}>
        Cobertura en MVP: {data.hero.jurisdiccionPrimaria} · {data.hero.rangoAnios.desde}–{data.hero.rangoAnios.hasta}.
        Toda fila lleva URL trazable a su fuente original.
      </div>
    </SectionWrap>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div style={s.stat}>
      <div style={s.statValue}>{value}</div>
      <div style={s.statLabel}>{label}</div>
    </div>
  )
}

function SectionWrap({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={s.section}>
      <h2 style={s.sectionTitle}>{title}</h2>
      {children}
    </section>
  )
}

const sevColorMap: Record<'grave' | 'moderada' | 'leve', string> = {
  grave: '#E25656', moderada: '#F5B544', leve: '#9BA3B4',
}

function formatPesos(n: number): string {
  if (n === 0) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2).replace('.', ',')} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1).replace('.', ',')} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

function formatMes(iso: string): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (isNaN(d.getTime())) return ''
  return d.toLocaleDateString('es-AR', { month: 'long', year: 'numeric' }).toUpperCase()
}

function prettifyTipologia(t: string): string {
  return t.replace(/_/g, ' ').toUpperCase()
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '0 24px' },

  // Hero
  hero: { padding: '80px 0 56px', borderBottom: '1px solid #1f2937' },
  heroAmount: {
    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
    fontSize: 'clamp(48px, 8vw, 96px)', fontWeight: 700, lineHeight: 1, letterSpacing: -1,
    color: '#dde3ee',
  },
  heroLabel: {
    fontSize: 14, letterSpacing: 4, marginTop: 14, color: '#9BA3B4',
  },
  heroSub: { fontSize: 13, color: '#9BA3B4', marginTop: 18 },
  heroDivider: {
    width: 80, height: 1, background: '#3a4150', margin: '20px 0',
  },
  mono: { fontFamily: 'ui-monospace, monospace', color: '#dde3ee' },

  // Sections
  section: { padding: '40px 0', borderBottom: '1px solid #1f2937' },
  sectionTitle: {
    fontSize: 12, letterSpacing: 2, color: '#9BA3B4', fontWeight: 600,
    textTransform: 'uppercase' as const, marginBottom: 16,
  },

  // Featured señal
  featured: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: 22, marginBottom: 12,
  },
  featuredHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sevBadge: {
    fontSize: 10, padding: '3px 8px', borderRadius: 3, border: '1px solid', fontWeight: 600, letterSpacing: 0.5,
  },
  featuredTitle: { fontSize: 18, fontWeight: 600, marginBottom: 8, color: '#dde3ee' },
  featuredResumen: { fontSize: 13, color: '#9BA3B4', lineHeight: 1.5, marginBottom: 14 },
  cta: {
    display: 'inline-block', color: '#62C7A0', textDecoration: 'none', fontSize: 12,
    fontWeight: 500,
  },

  // Compact cards
  compactGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 8,
  },
  compact: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: 12, textDecoration: 'none', color: '#dde3ee', display: 'block',
    transition: 'border-color 120ms',
  },
  compactHead: { display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 },
  sevDot: { width: 8, height: 8, borderRadius: 4, display: 'inline-block' },
  compactScore: {
    fontFamily: 'ui-monospace, monospace', fontSize: 12, color: '#9BA3B4', marginRight: 'auto',
  },
  compactTipologia: {
    fontSize: 9, color: '#9BA3B4', letterSpacing: 1, marginBottom: 4, fontFamily: 'ui-monospace, monospace',
  },
  compactTitle: { fontSize: 12, color: '#dde3ee', lineHeight: 1.4 },
  feedFooter: { marginTop: 16, textAlign: 'right' as const },
  link: { color: '#7da3ff', textDecoration: 'none', fontSize: 12 },

  // Surfaces grid
  surfaceGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 8,
  },
  surface: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: '20px 16px', textDecoration: 'none', color: '#dde3ee',
    display: 'flex', flexDirection: 'column', gap: 6,
  },
  surfaceGlyph: { fontSize: 22, color: '#62C7A0', fontFamily: 'ui-monospace, monospace' },
  surfaceTitle: { fontSize: 13, fontWeight: 600, letterSpacing: 1 },
  surfaceSub: { fontSize: 11, color: '#9BA3B4' },

  // Coverage stats
  coverageGrid: {
    display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12,
  },
  stat: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4, padding: '14px 16px',
  },
  statValue: { fontFamily: 'ui-monospace, monospace', fontSize: 22, color: '#dde3ee', fontWeight: 600 },
  statLabel: { fontSize: 11, color: '#9BA3B4', marginTop: 4 },
  coverageNote: { fontSize: 11, color: '#9BA3B4', marginTop: 14, lineHeight: 1.5 },

  // Generic
  error: { padding: 14, background: '#3a1d1d', color: '#E25656', borderRadius: 4 },
  muted: { color: '#9BA3B4', fontSize: 13 },
}
