/**
 * Dinero.tsx — superficie /dinero (PLAN-UI Módulo #2).
 *
 * Misión: responder "¿adónde fue cada peso?" siguiendo el ciclo
 * presupuestario hasta el pago efectivo. Drill-down URL-driven.
 *
 * Componentes:
 *   - Filtros sticky (jurisdicción, año)
 *   - Sankey de 4 etapas (Crédito → Comprometido → Devengado → Pagado)
 *     con gap% por tramo
 *   - Tabla de partidas con sparkline 2015-2025 + gap%
 *
 * Sankey custom SVG (sin librería extra) — barras proporcionales con
 * curvas Bezier entre etapas que representan el flujo.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useParams, useNavigate } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface SankeyData {
  filtro: { jurisdiccion: string | null; anio: number | null }
  etapas: Array<{ id: string; label: string; monto: number }>
  gaps: Array<{ de: string; a: string; absoluto: number; pct: number }>
}

interface PartidasData {
  filtro: { jurisdiccion: string | null; anio: number | null; programa: string | null }
  partidas: Array<{
    id: string; jurisdiccion: string; anio: number;
    programa: string | null; partida: string | null; partidaNombre: string | null;
    creditoVigente: number | null; compromiso: number; pagado: number;
    gapPct: number;
    sparkline: Array<{ anio: number; monto: number }>;
    fuenteUrl: string;
  }>
}

interface JurisdiccionesData {
  jurisdicciones: Array<{
    id: string; rangoAnios: { desde: number; hasta: number }; cantidad: number;
  }>
}

export default function Dinero() {
  // URL-driven filters: /dinero/:jurisdiccion?/:anio?
  const params = useParams<{ jurisdiccion?: string; anio?: string }>()
  const navigate = useNavigate()
  const [sankey, setSankey] = useState<SankeyData | null>(null)
  const [partidas, setPartidas] = useState<PartidasData | null>(null)
  const [jurisdicciones, setJurisdicciones] = useState<JurisdiccionesData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const jurisdiccion = params.jurisdiccion ?? 'cordoba-capital'
  const anio = params.anio ? Number(params.anio) : null

  useEffect(() => {
    const ac = new AbortController()
    setLoading(true); setError(null)
    const qs = (extra: Record<string, string | number | undefined>) => {
      const p = new URLSearchParams()
      if (jurisdiccion) p.set('jurisdiccion', jurisdiccion)
      if (anio !== null) p.set('anio', String(anio))
      Object.entries(extra).forEach(([k, v]) => { if (v !== undefined) p.set(k, String(v)) })
      return p.toString()
    }
    // Audit fix FE-W1 + EH-W1: chequear r.ok antes de json() para que un 500
    // con body HTML no rompa el parser silenciosamente. allSettled en lugar
    // de all para que la falla de un endpoint no tumbe los otros dos.
    const fetchJson = async <T,>(url: string): Promise<T> => {
      const r = await fetch(url, { signal: ac.signal })
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      return r.json() as Promise<T>
    }
    Promise.allSettled([
      fetchJson<SankeyData>(`${API_URL}/api/dinero/sankey?${qs({})}`),
      fetchJson<PartidasData>(`${API_URL}/api/dinero/partidas?${qs({ limit: 30 })}`),
      fetchJson<JurisdiccionesData>(`${API_URL}/api/dinero/jurisdicciones`),
    ])
      .then(([skR, paR, juR]) => {
        if (ac.signal.aborted) return
        if (skR.status === 'fulfilled') setSankey(skR.value); else setSankey(null)
        if (paR.status === 'fulfilled') setPartidas(paR.value); else setPartidas(null)
        if (juR.status === 'fulfilled') setJurisdicciones(juR.value); else setJurisdicciones(null)
        const errs = [skR, paR, juR]
          .filter(r => r.status === 'rejected')
          .map(r => (r as PromiseRejectedResult).reason?.message ?? 'error')
        if (errs.length > 0) setError(errs.join(' · '))
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [jurisdiccion, anio])

  function setFiltro(jur: string | null, an: number | null) {
    const j = jur ?? 'cordoba-capital'
    const path = an !== null ? `/dinero/${j}/${an}` : `/dinero/${j}`
    navigate(path)
  }

  return (
    <ArgosShell title="Dinero · ciclo presupuestario">
      <Filtros
        jurisdiccion={jurisdiccion}
        anio={anio}
        jurisdicciones={jurisdicciones?.jurisdicciones ?? []}
        onChange={setFiltro}
      />
      {error && <div style={s.error}>Error cargando datos: {error}</div>}
      {loading && !sankey && <div style={s.muted}>Cargando…</div>}
      {sankey && <Sankey data={sankey} />}
      {partidas && partidas.partidas.length > 0 && (
        <PartidasTable data={partidas.partidas} />
      )}
      {partidas && partidas.partidas.length === 0 && !loading && (
        <div style={s.muted}>
          No hay partidas para los filtros actuales. Cambiá jurisdicción o año.
        </div>
      )}
    </ArgosShell>
  )
}

function Filtros({
  jurisdiccion, anio, jurisdicciones, onChange,
}: {
  jurisdiccion: string
  anio: number | null
  jurisdicciones: JurisdiccionesData['jurisdicciones']
  onChange: (jur: string | null, an: number | null) => void
}) {
  const jurInfo = jurisdicciones.find(j => j.id === jurisdiccion)
  const aniosDisponibles: number[] = []
  if (jurInfo) {
    for (let a = jurInfo.rangoAnios.desde; a <= jurInfo.rangoAnios.hasta; a++) aniosDisponibles.push(a)
  }
  return (
    <div style={s.filtros}>
      <label style={s.filtroLabel}>
        Jurisdicción:
        <select
          value={jurisdiccion}
          onChange={e => onChange(e.target.value, anio)}
          style={s.select}
        >
          {jurisdicciones.map(j => (
            <option key={j.id} value={j.id}>{j.id} ({j.cantidad})</option>
          ))}
          {jurisdicciones.length === 0 && <option value={jurisdiccion}>{jurisdiccion}</option>}
        </select>
      </label>
      <label style={s.filtroLabel}>
        Año:
        <select
          value={anio ?? ''}
          onChange={e => onChange(jurisdiccion, e.target.value ? Number(e.target.value) : null)}
          style={s.select}
        >
          <option value="">Todos los años</option>
          {aniosDisponibles.map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </label>
    </div>
  )
}

function Sankey({ data }: { data: SankeyData }) {
  const max = Math.max(...data.etapas.map(e => e.monto), 1)
  const W = 1100, H = 280
  const colW = 180
  const gapBetween = (W - colW * 4) / 3
  const cx = (i: number) => i * (colW + gapBetween) + colW / 2

  const heightFor = (monto: number) => Math.max(8, (monto / max) * 220)

  return (
    <section style={s.section}>
      <h2 style={s.sectionTitle}>Ciclo presupuestario</h2>
      <div style={s.sankeyWrap}>
        <svg width="100%" viewBox={`0 0 ${W} ${H}`} style={{ display: 'block' }}>
          {/* Connectors entre etapas */}
          {data.etapas.slice(0, -1).map((etapa, i) => {
            const next = data.etapas[i + 1]
            const h1 = heightFor(etapa.monto)
            const h2 = heightFor(next.monto)
            const x1 = cx(i) + colW / 2
            const x2 = cx(i + 1) - colW / 2
            const y1c = H / 2 - h1 / 2
            const y2c = H / 2 - h2 / 2
            // Path entre las dos barras (área Bezier)
            const top = `M ${x1} ${y1c}
                         C ${x1 + (x2 - x1) / 2} ${y1c},
                           ${x1 + (x2 - x1) / 2} ${y2c},
                           ${x2} ${y2c}`
            const bottom = `L ${x2} ${y2c + h2}
                           C ${x1 + (x2 - x1) / 2} ${y2c + h2},
                             ${x1 + (x2 - x1) / 2} ${y1c + h1},
                             ${x1} ${y1c + h1} Z`
            return (
              <g key={`flow-${i}`}>
                <path d={top + ' ' + bottom} fill="#62C7A0" fillOpacity={0.18} />
              </g>
            )
          })}

          {/* Barras de cada etapa */}
          {data.etapas.map((etapa, i) => {
            const h = heightFor(etapa.monto)
            const x = cx(i) - colW / 2
            const y = H / 2 - h / 2
            return (
              <g key={etapa.id}>
                <rect x={x} y={y} width={colW} height={h} fill="#62C7A0" fillOpacity={0.85} rx={2} />
                <text
                  x={cx(i)} y={y - 12}
                  textAnchor="middle" fontSize={11}
                  fill="#9BA3B4" letterSpacing="1.5"
                >{etapa.label.toUpperCase()}</text>
                <text
                  x={cx(i)} y={H / 2 + 5}
                  textAnchor="middle" fontSize={16}
                  fill="#0d1117" fontFamily="ui-monospace, monospace" fontWeight={700}
                >{formatPesos(etapa.monto)}</text>
              </g>
            )
          })}

          {/* Gap labels entre etapas */}
          {data.gaps.map((gap, i) => {
            const x = cx(i) + colW / 2 + gapBetween / 2
            return (
              <g key={`gap-${i}`}>
                <text
                  x={x} y={H / 2 + 60}
                  textAnchor="middle" fontSize={10}
                  fill={gap.pct > 30 ? '#E25656' : gap.pct > 10 ? '#F5B544' : '#9BA3B4'}
                  letterSpacing="1"
                >gap {gap.pct.toFixed(1)}%</text>
                <text
                  x={x} y={H / 2 + 78}
                  textAnchor="middle" fontSize={9}
                  fill="#9BA3B4" fontFamily="ui-monospace, monospace"
                >{formatPesos(gap.absoluto)}</text>
              </g>
            )
          })}
        </svg>
      </div>
    </section>
  )
}

function PartidasTable({ data }: { data: PartidasData['partidas'] }) {
  return (
    <section style={s.section}>
      <h2 style={s.sectionTitle}>Partidas con gap material</h2>
      <div style={s.tableWrap}>
        <table style={s.table}>
          <thead>
            <tr>
              <th style={s.th}>Programa / Partida</th>
              <th style={s.th}>Año</th>
              <th style={s.th}>Comprometido</th>
              <th style={s.th}>Pagado</th>
              <th style={s.th}>Gap %</th>
              <th style={s.th}>Evolución</th>
              <th style={s.th}>Fuente</th>
            </tr>
          </thead>
          <tbody>
            {data.map(p => (
              <tr key={p.id} style={s.tr}>
                <td style={s.td}>
                  <div style={{ color: '#dde3ee' }}>{p.partidaNombre ?? p.partida ?? '(sin nombre)'}</div>
                  <div style={s.tdSub}>{p.programa ?? '—'}</div>
                </td>
                <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{p.anio}</td>
                <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{formatPesos(p.compromiso)}</td>
                <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{formatPesos(p.pagado)}</td>
                <td style={{
                  ...s.td, fontFamily: 'ui-monospace, monospace',
                  color: p.gapPct > 50 ? '#E25656' : p.gapPct > 20 ? '#F5B544' : '#9BA3B4',
                }}>{p.gapPct.toFixed(0)}%</td>
                <td style={s.td}>
                  <Spark data={p.sparkline} />
                </td>
                <td style={s.td}>
                  <a href={p.fuenteUrl} target="_blank" rel="noreferrer noopener" style={s.link}>↗</a>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  )
}

function Spark({ data }: { data: Array<{ anio: number; monto: number }> }) {
  if (!data || data.length === 0) {
    return <span style={{ color: '#3a4150', fontFamily: 'ui-monospace, monospace' }}>—</span>
  }
  const max = Math.max(...data.map(d => d.monto), 1)
  const blocks = '▁▂▃▄▅▆▇█'
  const sparkChars = data.map(d => {
    const idx = Math.min(blocks.length - 1, Math.floor((d.monto / max) * blocks.length))
    return blocks[idx]
  }).join('')
  return (
    <span
      style={{ fontFamily: 'ui-monospace, monospace', color: '#62C7A0' }}
      title={data.map(d => `${d.anio}: ${formatPesos(d.monto)}`).join('\n')}
    >{sparkChars}</span>
  )
}

function formatPesos(n: number): string {
  if (!n || n === 0) return '$0'
  const abs = Math.abs(n)
  if (abs >= 1e9) return `$${(n / 1e9).toFixed(2).replace('.', ',')} mil M`
  if (abs >= 1e6) return `$${(n / 1e6).toFixed(1).replace('.', ',')} M`
  if (abs >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '24px' },
  filtros: {
    display: 'flex', gap: 16, marginBottom: 20, paddingBottom: 12,
    borderBottom: '1px solid #1f2937',
  },
  filtroLabel: {
    fontSize: 12, color: '#9BA3B4', display: 'flex', alignItems: 'center', gap: 8,
  },
  select: {
    background: '#161b22', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '5px 8px', borderRadius: 3, fontSize: 12,
  },
  section: { padding: '24px 0', borderBottom: '1px solid #1f2937' },
  sectionTitle: {
    fontSize: 11, letterSpacing: 2, color: '#9BA3B4',
    textTransform: 'uppercase' as const, fontWeight: 600,
    marginBottom: 14,
  },
  sankeyWrap: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: '20px 24px',
  },
  tableWrap: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    overflowX: 'auto' as const,
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th: {
    padding: '10px 12px', textAlign: 'left' as const,
    fontSize: 10, color: '#9BA3B4', letterSpacing: 1.5,
    textTransform: 'uppercase' as const, fontWeight: 600,
    borderBottom: '1px solid #1f2937',
  },
  tr: { borderBottom: '1px solid #1f2937' },
  td: { padding: '10px 12px', color: '#dde3ee', verticalAlign: 'top' as const },
  tdSub: { fontSize: 10, color: '#9BA3B4', marginTop: 2 },
  link: { color: '#7da3ff', textDecoration: 'none', fontSize: 14 },
  error: { padding: 14, background: '#3a1d1d', color: '#E25656', borderRadius: 4 },
  muted: { color: '#9BA3B4', fontSize: 13, padding: 24, textAlign: 'center' as const },
}
