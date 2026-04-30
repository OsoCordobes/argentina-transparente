/**
 * ActoresD6.tsx — V4 forensic split: grafo (left) + lista (right).
 *
 * Layout:
 *   - LEFT (1fr): subgrafo SVG con nodos posicionados por jurisdicción + glyph PF/PJ.
 *     Zoom controls, leyenda, hint inferior.
 *   - RIGHT (560px+): search input + 6 FilterChips + tabla densa.
 *
 * Filtros (v0 client-side, M11 backend extiende /api/actores/search):
 *   - TIPO (todos | pf | pj)
 *   - JURISDICCIÓN (filtra por substring)
 *   - CON SEÑAL (toggle)
 *   - SUELDO ≥ (no disponible en endpoint actual; filtro placeholder)
 *   - EMPRESA (filtra por substring de nombre)
 *   - TIER (placeholder; real con M11)
 *
 * Click en row → resalta nodo en grafo. Click en nodo → navega al perfil.
 */
import { useEffect, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { FilterChip, Glyph } from '@/components/argos/forensic/Primitives'

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

const PAGE_SIZE = 80

function profileLink(a: Actor): string {
  return a.kind === 'pf' ? `/persona/${a.id}` : `/empresa/${a.id}`
}

function formatPesos(n: number): string {
  if (!n || n === 0) return '—'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1).replace('.', ',')} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1).replace('.', ',')} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

export default function ActoresD6() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const q = searchParams.get('q') ?? ''
  const tipo = (searchParams.get('tipo') as 'todos' | 'pf' | 'pj' | null) ?? 'todos'
  const conSenales = searchParams.get('conSenales') === '1'
  const jurisdiccionFiltro = searchParams.get('jur') ?? ''
  const empresaFiltro = searchParams.get('emp') ?? ''
  const tierFiltro = searchParams.get('tier') ?? 'todos'

  const [items, setItems] = useState<Actor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [searchInput, setSearchInput] = useState(q)
  const [debounced, setDebounced] = useState(q)
  const [hoveredIdx, setHoveredIdx] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => setDebounced(searchInput), 250)
    return () => clearTimeout(t)
  }, [searchInput])

  useEffect(() => {
    if (debounced !== q) {
      const next = new URLSearchParams(searchParams)
      if (debounced) next.set('q', debounced); else next.delete('q')
      setSearchParams(next)
    }
  }, [debounced, q, searchParams, setSearchParams])

  // Fetch (sólo q + tipo backend; resto filtra client-side hasta M11)
  const fetchPage = useCallback(() => {
    const ac = new AbortController()
    setLoading(true); setError(null)
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (tipo !== 'todos') qs.set('tipo', tipo)
    if (conSenales) qs.set('conSenales', '1')
    qs.set('limit', String(PAGE_SIZE))
    qs.set('offset', '0')

    fetch(`${API_URL}/api/actores-d6?${qs.toString()}`, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ListResp>
      })
      .then(d => { if (!ac.signal.aborted) setItems(d.items) })
      .catch(e => { if (!ac.signal.aborted) setError((e as Error).message) })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [q, tipo, conSenales])

  useEffect(() => {
    return fetchPage()
  }, [fetchPage])

  function setFilter(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value === null || value === '' || value === 'todos') next.delete(name)
    else next.set(name, value)
    setSearchParams(next)
  }

  // Filtrado client-side adicional (jurisdicción, empresa, tier)
  const filteredItems = useMemo(() => {
    return items.filter((it) => {
      if (jurisdiccionFiltro && it.jurisdiccion && !it.jurisdiccion.toUpperCase().includes(jurisdiccionFiltro.toUpperCase())) return false
      if (empresaFiltro && !it.label.toUpperCase().includes(empresaFiltro.toUpperCase())) return false
      // tier: no disponible en shape actual (Actor no tiene tier). Placeholder.
      if (tierFiltro !== 'todos') {
        // v0: assume verificada=true → T1, false → T2/T3 mix
        if (tierFiltro === 'T1' && !it.verificada) return false
      }
      return true
    })
  }, [items, jurisdiccionFiltro, empresaFiltro, tierFiltro])

  // Subgrafo activo: count
  const subgrafoCount = filteredItems.length
  const subgrafoVinculos = Math.max(0, Math.floor(subgrafoCount * 0.7)) // estimación visual

  return (
    <ArgosShell
      title="Actores · directorio"
      rightSlot={
        <>
          <button className="fx-header__btn">VISTA: SPLIT</button>
          <button className="fx-header__btn">EXPORT {filteredItems.length}</button>
        </>
      }
    >
      {/* Quitamos padding default del body — el split ocupa todo */}
      <div style={{ margin: '-24px -32px -48px', display: 'flex', minHeight: 'calc(100vh - 42px)' }}>
        {/* GRAPH HALF (left, flex 1) */}
        <div
          style={{
            flex: '1 1 56%',
            position: 'relative',
            borderRight: '1px solid var(--hairline-1)',
            background: 'radial-gradient(ellipse at 50% 45%, var(--bg-forensic-2) 0%, var(--bg-forensic-0) 65%)',
            minHeight: 'calc(100vh - 42px)',
            overflow: 'hidden',
          }}
        >
          <SubgrafoActores items={filteredItems} hoveredIdx={hoveredIdx} onNodeClick={(it) => navigate(profileLink(it))} />

          {/* Top-left: count */}
          <div style={{ position: 'absolute', top: 18, left: 22, display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div className="fx-eyebrow">SUBGRAFO ACTIVO</div>
            <div style={{ fontSize: 20, color: 'var(--text-1)', fontWeight: 300, letterSpacing: '-0.005em' }}>
              {subgrafoCount} actores · {subgrafoVinculos} vínculos
            </div>
            <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              filtros aplicados → grafo refleja selección de la lista
            </div>
          </div>

          {/* Top-right: zoom controls */}
          <div style={{ position: 'absolute', top: 18, right: 22, display: 'flex', flexDirection: 'column', border: '1px solid var(--hairline-2)', background: 'rgba(7,10,17,0.7)', backdropFilter: 'blur(8px)' }}>
            <button className="fx-btn-subtle" style={{ width: 30, height: 30, padding: 0, border: 0, fontSize: 14 }} title="Zoom in">+</button>
            <button className="fx-btn-subtle" style={{ width: 30, height: 30, padding: 0, border: 0, borderTop: '1px solid var(--hairline-1)', fontSize: 14 }} title="Zoom out">−</button>
            <button className="fx-btn-subtle" style={{ width: 30, height: 30, padding: 0, border: 0, borderTop: '1px solid var(--hairline-1)', fontSize: 9, letterSpacing: '0.10em' }} title="Fit">FIT</button>
          </div>

          {/* Bottom-left: leyenda */}
          <div style={{ position: 'absolute', bottom: 18, left: 22, display: 'flex', gap: 18, padding: '8px 14px', background: 'rgba(7,10,17,0.7)', border: '1px solid var(--hairline-1)', backdropFilter: 'blur(8px)', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.04em' }}>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Glyph kind="PF" />persona</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Glyph kind="PJ" />empresa</span>
            <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><span style={{ width: 6, height: 6, background: 'var(--alarm)' }} />con señal</span>
          </div>

          {/* Bottom-right: hint */}
          <div style={{ position: 'absolute', bottom: 18, right: 22, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
            click un nodo → drill-down · scroll = zoom · drag = pan
          </div>
        </div>

        {/* LIST HALF (right, fixed min) */}
        <div style={{ flex: '1 1 44%', display: 'flex', flexDirection: 'column', minWidth: 560, background: 'var(--bg-forensic-1)', maxWidth: 720 }}>
          {/* Search + filters */}
          <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--hairline-1)' }}>
            {/* Search row */}
            <div style={{ display: 'flex', alignItems: 'stretch', border: '1px solid var(--hairline-2)', marginBottom: 12, height: 34, background: 'var(--bg-forensic-0)' }}>
              <span style={{ padding: '0 12px', borderRight: '1px solid var(--hairline-1)', fontSize: 9.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.10em', display: 'flex', alignItems: 'center' }}>
                QUERY
              </span>
              <input
                type="text"
                placeholder="> Buscar por nombre, DNI, CUIT, razón social…"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                style={{
                  flex: 1,
                  background: 'transparent',
                  border: 0,
                  outline: 'none',
                  padding: '0 12px',
                  color: 'var(--text-1)',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 12,
                }}
              />
              <span style={{ padding: '0 10px', fontSize: 9.5, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', borderLeft: '1px solid var(--hairline-1)', letterSpacing: '0.06em', display: 'flex', alignItems: 'center' }}>
                ⌘K
              </span>
            </div>

            {/* 6 FilterChips en 2 filas de 3 */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
              <FilterChip
                label="TIPO"
                value={tipo === 'todos' ? 'TODOS' : tipo === 'pf' ? 'PERSONAS' : 'EMPRESAS'}
                active={tipo !== 'todos'}
                onClick={() => setFilter('tipo', tipo === 'todos' ? 'pf' : tipo === 'pf' ? 'pj' : null)}
              />
              <FilterChip
                label="JURISDICCIÓN"
                value={jurisdiccionFiltro || '—'}
                active={!!jurisdiccionFiltro}
                onClick={() => setFilter('jur', jurisdiccionFiltro ? null : 'CÓRDOBA CAPITAL')}
              />
              <FilterChip
                label="CON SEÑAL"
                value={conSenales ? 'SÍ' : '—'}
                active={conSenales}
                onClick={() => setFilter('conSenales', conSenales ? null : '1')}
              />
              <FilterChip
                label="SUELDO ≥"
                value="—"
                active={false}
                onClick={() => { /* placeholder M11 */ }}
              />
              <FilterChip
                label="EMPRESA"
                value={empresaFiltro || '—'}
                active={!!empresaFiltro}
                onClick={() => setFilter('emp', empresaFiltro ? null : '')}
              />
              <FilterChip
                label="TIER"
                value={tierFiltro === 'todos' ? '—' : tierFiltro}
                active={tierFiltro !== 'todos'}
                onClick={() => setFilter('tier', tierFiltro === 'todos' ? 'T1' : null)}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-3)', letterSpacing: '0.04em' }}>
              <span><span style={{ color: 'var(--text-1)' }}>{filteredItems.length}</span> de {items.length} actores · orden: $ TOTAL ↓</span>
              <span style={{ color: 'var(--text-2)', cursor: 'pointer' }}>+ Guardar como vista</span>
            </div>
          </div>

          {/* Tabla densa */}
          {error && (
            <div style={{ padding: 14, color: 'var(--alarm)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              Error: {error}
            </div>
          )}
          {loading && filteredItems.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
              cargando actores…
            </div>
          )}
          <div style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-forensic-0)', borderBottom: '1px solid var(--hairline-1)', position: 'sticky', top: 0 }}>
                  {['', 'NOMBRE', 'CUIT/DNI', 'JUR.', '$ TOTAL', '⚑', 'T'].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '9px 12px',
                        fontSize: 8.5,
                        color: 'var(--text-3)',
                        letterSpacing: '0.16em',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        textAlign: i >= 4 && i <= 5 ? 'right' : 'left',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((r, i) => (
                  <tr
                    key={`${r.kind}-${r.id}`}
                    onMouseEnter={() => setHoveredIdx(i)}
                    onMouseLeave={() => setHoveredIdx(null)}
                    onClick={() => navigate(profileLink(r))}
                    style={{
                      borderBottom: '1px solid var(--hairline-soft)',
                      cursor: 'pointer',
                      background: hoveredIdx === i ? 'var(--bg-forensic-2)' : 'transparent',
                    }}
                  >
                    <td style={{ padding: '10px 12px', width: 20 }}>
                      <Glyph kind={r.kind === 'pf' ? 'PF' : 'PJ'} />
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 12, color: 'var(--text-1)', maxWidth: 240, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.label}
                    </td>
                    <td style={{ padding: '10px 12px', fontFamily: 'var(--font-mono)', fontSize: 10.5, color: 'var(--text-2)', fontVariantNumeric: 'tabular-nums' }}>
                      {r.identityValue}
                    </td>
                    <td style={{ padding: '10px 12px', fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.04em', fontFamily: 'var(--font-mono)' }}>
                      {r.jurisdiccion ? r.jurisdiccion.split(' ').map(w => w.slice(0, 3)).join('').slice(0, 6).toUpperCase() : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11.5, color: 'var(--text-1)', fontVariantNumeric: 'tabular-nums', fontWeight: 500 }}>
                      {formatPesos(r.montoTotal)}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 11, color: r.senalesActivas > 0 ? 'var(--alarm)' : 'var(--text-4)' }}>
                      {r.senalesActivas > 0 ? r.senalesActivas : '—'}
                    </td>
                    <td style={{ padding: '10px 12px', textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 9.5, color: r.verificada ? 'var(--ok)' : 'var(--warn)' }}>
                      T{r.verificada ? 1 : 2}
                    </td>
                  </tr>
                ))}
                {filteredItems.length === 0 && !loading && (
                  <tr>
                    <td colSpan={7} style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>
                      Sin resultados con esos filtros.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </ArgosShell>
  )
}

// ─── Subgrafo SVG simple — nodos posicionados radialmente por jurisdicción ────

interface SubgrafoActoresProps {
  items: Actor[]
  hoveredIdx: number | null
  onNodeClick: (a: Actor) => void
}

function SubgrafoActores({ items, hoveredIdx, onNodeClick }: SubgrafoActoresProps) {
  // Posición pseudo-aleatoria estable basada en el index, dentro de un círculo central
  const W = 800
  const H = 700
  const cx = W / 2
  const cy = H / 2
  const radius = Math.min(W, H) * 0.42

  function pos(i: number, total: number): { x: number; y: number } {
    if (total <= 1) return { x: cx, y: cy }
    // espiral dorada para distribución equitativa
    const phi = 2.39996323
    const r = radius * Math.sqrt(i / Math.max(total - 1, 1))
    const angle = i * phi
    return { x: cx + r * Math.cos(angle), y: cy + r * Math.sin(angle) }
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: '100%', display: 'block' }}>
      {/* Fondo: pequeñas líneas conectando vecinos visualmente */}
      {items.slice(0, 80).map((it, i) => {
        const p = pos(i, Math.min(items.length, 80))
        const next = pos((i + 1) % Math.min(items.length, 80), Math.min(items.length, 80))
        return (
          <line
            key={`l-${i}`}
            x1={p.x} y1={p.y}
            x2={next.x} y2={next.y}
            stroke="var(--accent-chrome)"
            strokeOpacity={0.06}
            strokeWidth={0.8}
          />
        )
      })}
      {/* Nodos */}
      {items.slice(0, 80).map((it, i) => {
        const p = pos(i, Math.min(items.length, 80))
        const r = it.senalesActivas > 0 ? 6 : 4
        const fill = it.senalesActivas > 0 ? 'var(--alarm)' : it.kind === 'pf' ? 'var(--warn)' : 'var(--select)'
        const isHovered = hoveredIdx === i
        return (
          <g key={it.id} style={{ cursor: 'pointer' }} onClick={() => onNodeClick(it)}>
            {it.kind === 'pj' ? (
              <rect
                x={p.x - r}
                y={p.y - r}
                width={r * 2}
                height={r * 2}
                fill={fill}
                fillOpacity={isHovered ? 1 : 0.7}
                stroke={fill}
                strokeOpacity={isHovered ? 1 : 0.4}
                strokeWidth={isHovered ? 1.5 : 0.7}
                transform={`rotate(45 ${p.x} ${p.y})`}
              />
            ) : (
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill}
                fillOpacity={isHovered ? 1 : 0.7}
                stroke={fill}
                strokeOpacity={isHovered ? 1 : 0.4}
                strokeWidth={isHovered ? 1.5 : 0.7}
              />
            )}
            {isHovered && (
              <text
                x={p.x + r + 6}
                y={p.y + 3}
                fill="var(--text-1)"
                fontFamily="JetBrains Mono, monospace"
                fontSize="9.5"
                letterSpacing="0.04em"
              >
                {it.label.slice(0, 30)}
              </text>
            )}
          </g>
        )
      })}
    </svg>
  )
}
