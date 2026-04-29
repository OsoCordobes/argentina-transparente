/**
 * ActoresD6.tsx — superficie /actores (PLAN-UI Módulo #3).
 *
 * Misión: directorio searchable del universo PF + PJ con métricas que
 * indican relevancia. Punto de entrada al Profile correspondiente.
 *
 * Componentes:
 *   - Omnibox fuzzy con suggestions inline (top 5)
 *   - Filtros: tipo (PF/PJ), conSeñales, minMonto
 *   - Lista única monospace con glyph (● PF azul / ■ PJ naranja)
 *   - 3 columnas métricas: $ total, ⚑ señales activas, ✓ verificación
 *   - Paginación URL-driven
 */
import { useEffect, useState, useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ForensicHeader, ForensicFooter } from '@/components/argos/ForensicHeader'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface Actor {
  kind: 'pf' | 'pj'
  id: string
  label: string
  identityValue: string
  jurisdiccion: string | null
  montoTotal: number
  senalesActivas: number
  verificada: boolean
}

interface ListResp {
  items: Actor[]
  paginacion: { total: number; limit: number; offset: number }
}

const PAGE_SIZE = 50

export default function ActoresD6() {
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const tipo = (searchParams.get('tipo') as 'todos' | 'pf' | 'pj' | null) ?? 'todos'
  const conSenales = searchParams.get('conSenales') === '1'
  const minMonto = searchParams.get('minMonto') ? Number(searchParams.get('minMonto')) : 0
  const page = Number(searchParams.get('page') ?? '0')

  const [items, setItems] = useState<Actor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(q)
  const [debounced, setDebounced] = useState(q)

  // Debounce search input
  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  // Update URL when debounced search changes.
  // Audit fix: dependencias completas (incluye searchParams + setSearchParams).
  // setSearchParams es referencialmente estable según react-router; searchParams
  // es la fuente de verdad para `q`. La guard `debounced !== q` evita el loop
  // infinito ya que tras setSearchParams los dos valores quedan iguales.
  useEffect(() => {
    if (debounced !== q) {
      const next = new URLSearchParams(searchParams)
      if (debounced) next.set('q', debounced); else next.delete('q')
      next.delete('page')
      setSearchParams(next)
    }
  }, [debounced, q, searchParams, setSearchParams])

  const fetchPage = useCallback(() => {
    const ac = new AbortController()
    setLoading(true); setError(null)
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (tipo !== 'todos') qs.set('tipo', tipo)
    if (conSenales) qs.set('conSenales', '1')
    if (minMonto > 0) qs.set('minMonto', String(minMonto))
    qs.set('limit', String(PAGE_SIZE))
    qs.set('offset', String(page * PAGE_SIZE))

    fetch(`${API_URL}/api/actores-d6?${qs.toString()}`, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ListResp>
      })
      .then(d => { if (!ac.signal.aborted) setItems(d.items) })
      .catch(e => { if (!ac.signal.aborted) setError((e as Error).message) })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [q, tipo, conSenales, minMonto, page])

  useEffect(() => {
    return fetchPage()
  }, [fetchPage])

  function setFilter(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value === null || value === '' || value === 'todos') next.delete(name)
    else next.set(name, value)
    next.delete('page')
    setSearchParams(next)
  }

  const suggestions = useMemo(() => items.slice(0, 5), [items])

  return (
    <div style={s.page}>
      <ForensicHeader />
      <main style={s.main}>
        <header style={s.head}>
          <h1 style={s.h1}>Actores</h1>
          <p style={s.subtitle}>
            Directorio del universo cargado en ARGOS. Personas físicas (●)
            y personas jurídicas (■) con métricas combinadas.
          </p>
        </header>

        <div style={s.searchWrap}>
          <input
            type="text"
            placeholder="Buscar por nombre, DNI, CUIT, razón social…"
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
            style={s.search}
          />
          {searchInput && suggestions.length > 0 && q !== searchInput && (
            <div style={s.suggestions}>
              {suggestions.map(it => (
                <Link
                  key={`${it.kind}-${it.id}`}
                  to={profileLink(it)}
                  style={s.suggestionItem}
                >
                  <span style={{ color: glyphColor(it.kind), marginRight: 8 }}>
                    {glyph(it.kind)}
                  </span>
                  <span style={{ flex: 1 }}>{it.label}</span>
                  <span style={s.suggestionId}>{it.identityValue}</span>
                </Link>
              ))}
            </div>
          )}
        </div>

        <div style={s.filtros}>
          <Filtro
            label="Tipo" value={tipo}
            options={[
              { value: 'todos', label: 'Todos' },
              { value: 'pf', label: '● Personas físicas' },
              { value: 'pj', label: '■ Personas jurídicas' },
            ]}
            onChange={v => setFilter('tipo', v === 'todos' ? null : v)}
          />
          <label style={s.filtroLabel}>
            <input
              type="checkbox"
              checked={conSenales}
              onChange={e => setFilter('conSenales', e.target.checked ? '1' : null)}
              style={{ marginRight: 6 }}
            />
            Sólo con señales activas
          </label>
          <Filtro
            label="Monto mínimo" value={String(minMonto)}
            options={[
              { value: '0', label: 'Cualquiera' },
              { value: '1000000', label: '≥ $1 M' },
              { value: '10000000', label: '≥ $10 M' },
              { value: '100000000', label: '≥ $100 M' },
            ]}
            onChange={v => setFilter('minMonto', v === '0' ? null : v)}
          />
        </div>

        {error && <div style={s.error}>Error: {error}</div>}
        {loading && items.length === 0 && <div style={s.muted}>Cargando…</div>}

        {items.length > 0 && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}></th>
                  <th style={s.th}>Nombre / Razón social</th>
                  <th style={s.th}>DNI / CUIT</th>
                  <th style={s.th}>Jurisdicción</th>
                  <th style={s.th}>$ Total</th>
                  <th style={s.th}>⚑ Señales</th>
                  <th style={s.th}>✓ Verif.</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={`${it.kind}-${it.id}`} style={s.tr}>
                    <td style={{ ...s.td, color: glyphColor(it.kind), fontFamily: 'ui-monospace, monospace' }}>
                      {glyph(it.kind)}
                    </td>
                    <td style={s.td}>
                      <Link to={profileLink(it)} style={s.link}>{it.label}</Link>
                    </td>
                    <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace', color: '#9BA3B4' }}>
                      {it.identityValue}
                    </td>
                    <td style={{ ...s.td, color: '#9BA3B4', fontSize: 11 }}>
                      {it.jurisdiccion ?? '—'}
                    </td>
                    <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>
                      {it.montoTotal > 0 ? formatPesos(it.montoTotal) : '—'}
                    </td>
                    <td style={{
                      ...s.td, fontFamily: 'ui-monospace, monospace',
                      color: it.senalesActivas > 0 ? '#F5B544' : '#3a4150',
                    }}>
                      {it.senalesActivas > 0 ? it.senalesActivas : '·'}
                    </td>
                    <td style={s.td}>
                      <span style={{ color: it.verificada ? '#62C7A0' : '#3a4150' }}>
                        {it.verificada ? '✓' : '○'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {items.length === 0 && !loading && (
          <div style={s.muted}>Sin resultados para los filtros actuales</div>
        )}
      </main>
      <ForensicFooter />
    </div>
  )
}

function Filtro({ label, value, options, onChange }: {
  label: string
  value: string
  options: Array<{ value: string; label: string }>
  onChange: (v: string) => void
}) {
  return (
    <label style={s.filtroLabel}>
      {label}:
      <select value={value} onChange={e => onChange(e.target.value)} style={s.select}>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  )
}

function profileLink(a: Actor): string {
  return a.kind === 'pf' ? `/persona/${a.id}` : `/empresa/${a.id}`
}

function glyph(kind: 'pf' | 'pj'): string {
  return kind === 'pf' ? '●' : '■'
}

function glyphColor(kind: 'pf' | 'pj'): string {
  return kind === 'pf' ? '#7da3ff' : '#ff9b5c'
}

function formatPesos(n: number): string {
  if (!n || n === 0) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace('.', ',')} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1).replace('.', ',')} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '24px' },
  head: { marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid #1f2937' },
  h1: { fontSize: 20, margin: 0, color: '#dde3ee', fontWeight: 600 },
  subtitle: { fontSize: 12, color: '#9BA3B4', marginTop: 6, maxWidth: 720 },

  searchWrap: { position: 'relative', marginBottom: 16 },
  search: {
    width: '100%', background: '#161b22', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '10px 14px', borderRadius: 4, fontSize: 14,
    boxSizing: 'border-box' as const,
  },
  suggestions: {
    position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 4,
    background: '#0d1117', border: '1px solid #2a3140', borderRadius: 4,
    zIndex: 10, padding: 4,
  },
  suggestionItem: {
    display: 'flex', alignItems: 'center', padding: '6px 10px',
    color: '#dde3ee', textDecoration: 'none', fontSize: 12, borderRadius: 3,
  },
  suggestionId: { color: '#9BA3B4', fontFamily: 'ui-monospace, monospace', fontSize: 11 },

  filtros: {
    display: 'flex', gap: 16, marginBottom: 14, alignItems: 'center', flexWrap: 'wrap' as const,
  },
  filtroLabel: {
    fontSize: 11, color: '#9BA3B4', display: 'flex', alignItems: 'center', gap: 8,
  },
  select: {
    background: '#161b22', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '5px 8px', borderRadius: 3, fontSize: 12,
  },

  tableWrap: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 12 },
  th: {
    padding: '10px 12px', textAlign: 'left' as const,
    fontSize: 10, color: '#9BA3B4', letterSpacing: 1.5,
    textTransform: 'uppercase' as const, fontWeight: 600,
    borderBottom: '1px solid #1f2937',
  },
  tr: { borderBottom: '1px solid #1f2937' },
  td: { padding: '10px 12px', color: '#dde3ee' },
  link: { color: '#dde3ee', textDecoration: 'none' },
  error: { padding: 14, background: '#3a1d1d', color: '#E25656', borderRadius: 4 },
  muted: { color: '#9BA3B4', fontSize: 13, padding: 24, textAlign: 'center' as const },
}
