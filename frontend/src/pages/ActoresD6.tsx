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
 * Selección bidireccional (M3):
 *   - Hover en row → nodo crece + label en grafo.
 *   - Click en row → selección persistente (toggle); el nodo queda fijo brillante.
 *   - Click en nodo → selecciona y scrolls la fila correspondiente a la vista.
 *   - Click en fondo → limpia selección.
 *   - Para navegar al perfil hay un botón explícito "→" al final de la fila.
 */
import { useEffect, useRef, useState, useMemo, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { FilterChip, Glyph } from '@/components/argos/forensic/Primitives'
import { EmptyState, LoadingState, TierBadge } from '@/components/argos/primitives'
import { useGraphSelection } from '@/hooks/useGraphSelection'

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

/** Clave estable por actor para sincronizar selección tabla↔grafo. */
function actorKey(a: Actor): string {
  return `${a.kind}:${a.id}`
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

  // Selección compartida tabla↔grafo (hook reusable: ver hooks/useGraphSelection.ts).
  const selection = useGraphSelection()
  const { selectedKey, select, hover, clear } = selection

  // Refs para scroll-to-row cuando la selección viene del grafo.
  const tableScrollRef = useRef<HTMLDivElement | null>(null)
  // Track del origen del último select(): si vino del grafo, queremos scroll;
  // si vino de un click de fila, no hace falta (la fila ya está visible).
  const lastSelectSource = useRef<'graph' | 'row' | null>(null)

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
  // Bug fix BLOCKER 3 (página vacía): pasamos a guard explícito por
  // `cancelled` flag (en lugar de chequear `ac.signal.aborted` post-await,
  // que en algunas condiciones de red se reportaba inconsistente entre
  // navegadores). También agregamos console.error en el catch para que
  // futuras fallas sean visibles en DevTools — antes el componente
  // simplemente no renderizaba sin pista de qué pasó.
  const fetchPage = useCallback(() => {
    const ac = new AbortController()
    let cancelled = false
    setLoading(true); setError(null)
    const qs = new URLSearchParams()
    if (q) qs.set('q', q)
    if (tipo !== 'todos') qs.set('tipo', tipo)
    if (conSenales) qs.set('conSenales', '1')
    qs.set('limit', String(PAGE_SIZE))
    qs.set('offset', '0')

    const url = `${API_URL}/api/actores-d6?${qs.toString()}`

    fetch(url, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status} ${r.statusText}`)
        return r.json() as Promise<ListResp>
      })
      .then(d => {
        if (cancelled) return
        if (!d || !Array.isArray(d.items)) {
          console.error('[ActoresD6] respuesta inesperada del backend', { url, d })
          setError('Respuesta inesperada del servidor (items no es array)')
          return
        }
        setItems(d.items)
      })
      .catch(e => {
        if (cancelled) return
        // Una abort silenciosa NO es error de usuario: la silenciamos.
        if ((e as { name?: string }).name === 'AbortError') return
        console.error('[ActoresD6] fetch falló', { url, error: e })
        setError((e as Error).message)
      })
      .finally(() => {
        if (cancelled) return
        setLoading(false)
      })
    return () => {
      cancelled = true
      ac.abort()
    }
  }, [q, tipo, conSenales])

  useEffect(() => {
    return fetchPage()
  }, [fetchPage])

  // Cuando la selección cambia desde el grafo, scrollear la fila correspondiente
  // a la vista. Si vino de la tabla, no hace falta (la fila ya está visible).
  // Reset de lastSelectSource al final: el origin marker se consume exactamente
  // una vez — evita scroll redundante si StrictMode o un parent re-render
  // dispara el effect sin cambio real de selectedKey.
  useEffect(() => {
    if (!selectedKey) return
    const source = lastSelectSource.current
    lastSelectSource.current = null
    if (source !== 'graph') return
    const container = tableScrollRef.current
    if (!container) return
    const row = container.querySelector(`[data-actor-key="${CSS.escape(selectedKey)}"]`)
    if (row && 'scrollIntoView' in row) {
      ;(row as HTMLElement).scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedKey])

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
          onClick={(e) => {
            // Click en fondo del pane (no en un nodo o un control) → limpia selección.
            if (e.target === e.currentTarget) clear()
          }}
          style={{
            flex: '1 1 56%',
            position: 'relative',
            borderRight: '1px solid var(--hairline-1)',
            background: 'radial-gradient(ellipse at 50% 45%, var(--bg-forensic-2) 0%, var(--bg-forensic-0) 65%)',
            minHeight: 'calc(100vh - 42px)',
            overflow: 'hidden',
          }}
        >
          <SubgrafoActores
            items={filteredItems}
            selectedKey={selection.selectedKey}
            hoveredKey={selection.hoveredKey}
            onNodeClick={(a) => {
              lastSelectSource.current = 'graph'
              select(actorKey(a))
            }}
            onNodeHover={(key) => hover(key)}
            onBackgroundClick={() => clear()}
          />

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
            click nodo = seleccionar · → en fila = abrir perfil
          </div>
        </div>

        {/* LIST HALF (right, fixed min) */}
        <div
          onClick={(e) => {
            // Click en fondo del pane (no en una fila o un control) → limpia selección.
            if (e.target === e.currentTarget) clear()
          }}
          style={{ flex: '1 1 44%', display: 'flex', flexDirection: 'column', minWidth: 560, background: 'var(--bg-forensic-1)', maxWidth: 720 }}
        >
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
            <div style={{ padding: 'var(--space-4)', color: 'var(--semantic-danger)', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-base)' }}>
              Error: {error}
            </div>
          )}
          {loading && filteredItems.length === 0 && (
            <div style={{ padding: 'var(--space-6)' }}>
              <LoadingState mode="block" lines={4} label="Cargando actores" />
            </div>
          )}
          <div ref={tableScrollRef} style={{ flex: 1, overflow: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-forensic-0)', borderBottom: '1px solid var(--hairline-1)', position: 'sticky', top: 0 }}>
                  {['', 'NOMBRE', 'CUIT/DNI', 'JUR.', '$ TOTAL', '⚑', 'T', ''].map((h, i) => (
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
                {filteredItems.map((r) => {
                  const key = actorKey(r)
                  const isSelected = selection.isSelected(key)
                  const isHovered = selection.isHovered(key)
                  const bg = isSelected
                    ? 'color-mix(in srgb, var(--accent-secondary) 10%, transparent)'
                    : isHovered
                      ? 'var(--bg-forensic-2)'
                      : 'transparent'
                  return (
                    <tr
                      key={`${r.kind}-${r.id}`}
                      data-actor-key={key}
                      onMouseEnter={() => hover(key)}
                      onMouseLeave={() => hover(null)}
                      onClick={() => {
                        lastSelectSource.current = 'row'
                        select(key)
                      }}
                      style={{
                        borderBottom: '1px solid var(--hairline-soft)',
                        cursor: 'pointer',
                        background: bg,
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
                      <td style={{ padding: '10px 12px', textAlign: 'right' }}>
                        <TierBadge tier={r.verificada ? 1 : 2} size="sm" />
                      </td>
                      <td style={{ padding: '6px 8px', width: 28, textAlign: 'right' }}>
                        <button
                          type="button"
                          aria-label={`Abrir perfil de ${r.label}`}
                          title="Abrir perfil"
                          onClick={(e) => {
                            e.stopPropagation()
                            navigate(profileLink(r))
                          }}
                          onMouseDown={(e) => e.stopPropagation()}
                          style={{
                            width: 24,
                            height: 24,
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            color: 'var(--text-2)',
                            fontFamily: 'var(--font-mono)',
                            fontSize: 13,
                            lineHeight: 1,
                            padding: 0,
                          }}
                          onMouseOver={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-1)' }}
                          onMouseOut={(e) => { (e.currentTarget as HTMLButtonElement).style.color = 'var(--text-2)' }}
                        >
                          →
                        </button>
                      </td>
                    </tr>
                  )
                })}
                {filteredItems.length === 0 && !loading && (
                  <tr>
                    <td colSpan={8} style={{ padding: 0 }}>
                      {items.length === 0 ? (
                        <EmptyState
                          eyebrow="ACTORES · 0 ENCONTRADOS"
                          title={error ? 'Sin datos del backend' : 'Sin actores cargados'}
                          body={
                            error
                              ? `El backend respondió con un error: ${error}`
                              : 'El servicio no devolvió actores. Refrescá la página o revisá la conexión con el backend.'
                          }
                        />
                      ) : (
                        <EmptyState
                          eyebrow={`ACTORES · 0 DE ${items.length}`}
                          title="Sin resultados con esos filtros"
                          body="Probá quitar filtros (tipo, jurisdicción, señales) para ampliar la búsqueda."
                        />
                      )}
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
  /** Key del actor seleccionado (persistente) — null si ninguno. */
  selectedKey: string | null
  /** Key del actor hover (transitorio) — null si ninguno. */
  hoveredKey: string | null
  /** Click en un nodo: NO navega; selecciona en el estado compartido. */
  onNodeClick: (a: Actor) => void
  /** Hover sobre un nodo: pasa el key para sincronizar tabla→grafo. */
  onNodeHover: (key: string | null) => void
  /** Click sobre el fondo SVG (no un nodo): limpia selección. */
  onBackgroundClick: () => void
}

function SubgrafoActores({
  items,
  selectedKey,
  hoveredKey,
  onNodeClick,
  onNodeHover,
  onBackgroundClick,
}: SubgrafoActoresProps) {
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
    <svg
      viewBox={`0 0 ${W} ${H}`}
      style={{ width: '100%', height: '100%', display: 'block' }}
      onClick={(e) => {
        // Click en el SVG pero no sobre un nodo (los <g> hacen stopPropagation).
        if (e.target === e.currentTarget) onBackgroundClick()
      }}
    >
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
        const baseR = it.senalesActivas > 0 ? 6 : 4
        const baseFill = it.senalesActivas > 0 ? 'var(--alarm)' : it.kind === 'pf' ? 'var(--warn)' : 'var(--select)'
        const key = `${it.kind}:${it.id}`
        const isSelected = selectedKey === key
        const isHovered = hoveredKey === key

        // Selected gana sobre hovered. Selected: r * 1.4, fill solid, stroke 2.5px,
        // brighter color (var(--accent-secondary)), label always visible.
        const r = isSelected ? baseR * 1.4 : baseR
        const fill = isSelected ? 'var(--accent-secondary)' : baseFill
        const fillOpacity = isSelected ? 1 : isHovered ? 1 : 0.7
        const strokeColor = isSelected ? 'var(--accent-secondary)' : baseFill
        const strokeOpacity = isSelected ? 1 : isHovered ? 1 : 0.4
        const strokeWidth = isSelected ? 2.5 : isHovered ? 1.5 : 0.7
        const showLabel = isSelected || isHovered
        return (
          <g
            key={it.id}
            style={{ cursor: 'pointer' }}
            onClick={(e) => {
              e.stopPropagation()
              onNodeClick(it)
            }}
            onMouseEnter={() => onNodeHover(key)}
            onMouseLeave={() => onNodeHover(null)}
          >
            {it.kind === 'pj' ? (
              <rect
                x={p.x - r}
                y={p.y - r}
                width={r * 2}
                height={r * 2}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={strokeColor}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
                transform={`rotate(45 ${p.x} ${p.y})`}
              />
            ) : (
              <circle
                cx={p.x}
                cy={p.y}
                r={r}
                fill={fill}
                fillOpacity={fillOpacity}
                stroke={strokeColor}
                strokeOpacity={strokeOpacity}
                strokeWidth={strokeWidth}
              />
            )}
            {showLabel && (
              <text
                x={p.x + r + 6}
                y={p.y + 3}
                fill="var(--text-1)"
                fontFamily="var(--font-mono)"
                fontSize="9.5"
                letterSpacing="0.04em"
                style={{ pointerEvents: 'none' }}
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
