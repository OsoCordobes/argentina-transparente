/**
 * Senales.tsx — superficie /senales (PLAN-UI Módulo #5).
 *
 * Misión: feed exploratorio read-only de todas las señales detectadas.
 * Default: Top 50 por score, todos los estados visibles.
 * NO cambia estado de señales (eso es responsabilidad de /cola-verificacion).
 *
 * Acciones inline (estado del usuario, no del sistema):
 *   - + Caso (redirige a /casos con la señal seleccionada)
 *   - + Watchlist (agrega CUITs asociados)
 *   - Share URL (copia URL con focus=signal_id)
 *   - Bulk select para acciones masivas
 *
 * Filtros: severidad, estado, tipología, jurisdicción, min monto, min score.
 * URL state: filtros + paginación (compartibles).
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import type { EstadoVerificacionSeñal } from '@/lib/argos/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

type Severidad = 'grave' | 'moderada' | 'leve'

interface Senal {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: Severidad
  estadoVerificacion: EstadoVerificacionSeñal
  computadoEn: string
  evidencia: Array<{ descripcion: string; fuenteUrl: string }>
  legal: { articulos?: string[]; denunciarAnte?: string[] }
}

interface ListResp {
  items: Senal[]
  paginacion: { total: number; limit: number; offset: number; hayMas: boolean }
}

const PAGE_SIZE = 50

export default function Senales() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const estadoFiltro = searchParams.get('estado') ?? 'todas'
  const severidadFiltro = (searchParams.get('severidad') as Severidad | 'todas' | null) ?? 'todas'
  const tipologiaFiltro = searchParams.get('tipologia') ?? ''
  const minScoreFiltro = searchParams.get('minScore') ? Number(searchParams.get('minScore')) : null
  const page = Number(searchParams.get('page') ?? '0')

  const [items, setItems] = useState<Senal[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [shareToast, setShareToast] = useState<string | null>(null)

  const fetchPage = useCallback(() => {
    const ac = new AbortController()
    setLoading(true); setError(null)
    const qs = new URLSearchParams()
    qs.set('estado', estadoFiltro)
    if (severidadFiltro !== 'todas') qs.set('severidad', severidadFiltro)
    if (tipologiaFiltro) qs.set('tipologia', tipologiaFiltro)
    if (minScoreFiltro !== null) qs.set('minScore', String(minScoreFiltro))
    qs.set('limit', String(PAGE_SIZE))
    qs.set('offset', String(page * PAGE_SIZE))

    fetch(`${API_URL}/api/cola-verificacion?${qs.toString()}`, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<ListResp>
      })
      .then(d => {
        if (ac.signal.aborted) return
        setItems(d.items); setTotal(d.paginacion.total)
      })
      .catch(e => { if (!ac.signal.aborted) setError((e as Error).message) })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [estadoFiltro, severidadFiltro, tipologiaFiltro, minScoreFiltro, page])

  useEffect(() => {
    return fetchPage()
  }, [fetchPage])

  function setFilter(name: string, value: string | null) {
    const next = new URLSearchParams(searchParams)
    if (value === null || value === '' || value === 'todas') next.delete(name)
    else next.set(name, value)
    next.delete('page') // reset
    setSearchParams(next)
    setSelected(new Set())
  }

  function setPageNum(p: number) {
    const next = new URLSearchParams(searchParams)
    if (p === 0) next.delete('page'); else next.set('page', String(p))
    setSearchParams(next)
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))
  const filterChips = useMemo(() => {
    const chips: Array<{ key: string; label: string }> = []
    if (estadoFiltro !== 'todas') chips.push({ key: 'estado', label: `estado: ${estadoFiltro}` })
    if (severidadFiltro !== 'todas') chips.push({ key: 'severidad', label: `severidad: ${severidadFiltro}` })
    if (tipologiaFiltro) chips.push({ key: 'tipologia', label: `tipo: ${tipologiaFiltro}` })
    if (minScoreFiltro !== null) chips.push({ key: 'minScore', label: `score ≥ ${minScoreFiltro}` })
    return chips
  }, [estadoFiltro, severidadFiltro, tipologiaFiltro, minScoreFiltro])

  function toggleSelected(id: string) {
    const next = new Set(selected)
    if (next.has(id)) next.delete(id); else next.add(id)
    setSelected(next)
  }

  function selectAll() {
    if (selected.size === items.length) setSelected(new Set())
    else setSelected(new Set(items.map(it => it.id)))
  }

  function addToCaseBulk() {
    if (selected.size === 0) return
    const ids = [...selected].join(',')
    navigate(`/casos?adjuntar=${encodeURIComponent(ids)}&kind=signals`)
  }

  function addToWatchlistBulk() {
    if (selected.size === 0) return
    // Audit fix EH-2: NO mostrar toast de éxito sobre fallo. Detectamos errores
    // de localStorage explícitamente y avisamos al usuario.
    let raw: string | null
    try { raw = localStorage.getItem('argos_watchlist_v1') } catch (e) {
      setShareToast(`Error: ${(e as Error).message || 'storage no disponible'}`)
      setTimeout(() => setShareToast(null), 3000)
      return
    }
    let arr: Array<{ id: string; kind: 'pf' | 'pj' | 'signal'; label: string; addedAt: string }> = []
    try { arr = raw ? JSON.parse(raw) : [] } catch {
      arr = []  // storage corrupto — sobreescribimos
    }
    const existing = new Set(arr.map(x => x.id))
    const toAdd = items.filter(it => selected.has(it.id))
      .map(it => ({
        id: `signal:${it.id}`,
        kind: 'signal' as const,
        label: it.titulo.slice(0, 80),
        addedAt: new Date().toISOString(),
      }))
      .filter(x => !existing.has(x.id))
    if (toAdd.length === 0) {
      setShareToast('Ya estaban en watchlist'); setTimeout(() => setShareToast(null), 1800)
      return
    }
    try {
      localStorage.setItem('argos_watchlist_v1', JSON.stringify([...arr, ...toAdd]))
    } catch (e) {
      // QuotaExceededError o private mode bloqueado.
      setShareToast(`No se pudo guardar: ${(e as Error).message || 'storage lleno'}`)
      setTimeout(() => setShareToast(null), 3000)
      return
    }
    window.dispatchEvent(new Event('argos:watchlist-changed'))
    setShareToast(`+${toAdd.length} a watchlist`); setTimeout(() => setShareToast(null), 1800)
    setSelected(new Set())
  }

  async function shareBulk() {
    // Audit fix EH-W4: el toast de "URL copiada" se mostraba aunque la
    // copia hubiera fallado (HTTP / iframe / browser viejo). Ahora
    // esperamos el await y mostramos toast distinto si falla.
    const url = selected.size === 0
      ? window.location.href
      : `${window.location.origin}${window.location.pathname}?focus=${[...selected].join(',')}`
    try {
      await navigator.clipboard.writeText(url)
      setShareToast(selected.size === 0 ? 'URL copiada' : `URL copiada (${selected.size} sel.)`)
    } catch {
      setShareToast('No se pudo copiar (HTTPS requerido)')
    }
    setTimeout(() => setShareToast(null), 2000)
  }

  return (
    <ArgosShell title="Señales detectadas">
      <p style={s.subtitle}>
        Patrones marcados por el motor ARGOS sobre el universo cargado.
        La plataforma describe, no acusa: cada señal requiere verificación
        humana antes de citar como evidencia.
      </p>

        <section style={s.filtros}>
          <Filtro
            label="Estado"
            value={estadoFiltro}
            options={[
              { value: 'todas', label: 'Todos' },
              { value: 'sin_verificar', label: 'Sin verificar' },
              { value: 'verificada', label: 'Verificadas' },
              { value: 'descartada', label: 'Descartadas' },
              { value: 'bloqueada', label: 'Bloqueadas' },
            ]}
            onChange={v => setFilter('estado', v)}
          />
          <Filtro
            label="Severidad"
            value={severidadFiltro}
            options={[
              { value: 'todas', label: 'Todas' },
              { value: 'grave', label: 'Grave' },
              { value: 'moderada', label: 'Moderada' },
              { value: 'leve', label: 'Leve' },
            ]}
            onChange={v => setFilter('severidad', v)}
          />
          <Filtro
            label="Score mínimo"
            value={minScoreFiltro !== null ? String(minScoreFiltro) : ''}
            options={[
              { value: '', label: 'Cualquiera' },
              { value: '50', label: '≥ 50' },
              { value: '70', label: '≥ 70' },
              { value: '85', label: '≥ 85' },
            ]}
            onChange={v => setFilter('minScore', v)}
          />
          <input
            type="text"
            placeholder="Tipología (ej. conflicto_…)"
            value={tipologiaFiltro}
            onChange={e => setFilter('tipologia', e.target.value)}
            style={s.input}
          />
        </section>

        {filterChips.length > 0 && (
          <div style={s.chipRow}>
            {filterChips.map(c => (
              <button key={c.key} onClick={() => setFilter(c.key, null)} style={s.chip}>
                {c.label} ×
              </button>
            ))}
          </div>
        )}

        {selected.size > 0 && (
          <div style={s.bulkBar}>
            <span style={{ fontSize: 12, color: '#62C7A0' }}>{selected.size} seleccionadas</span>
            <button onClick={addToCaseBulk} style={s.bulkBtn}>+ Caso</button>
            <button onClick={addToWatchlistBulk} style={s.bulkBtn}>+ Watchlist</button>
            <button onClick={shareBulk} style={s.bulkBtn}>Copiar URL</button>
            <button onClick={() => setSelected(new Set())} style={s.bulkBtn}>Limpiar</button>
            {shareToast && <span style={{ fontSize: 11, color: '#62C7A0', marginLeft: 8 }}>{shareToast}</span>}
          </div>
        )}

        {error && <div style={s.error}>Error cargando señales: {error}</div>}
        {loading && items.length === 0 && <div style={s.muted}>Cargando…</div>}

        {items.length > 0 && (
          <div style={s.tableWrap}>
            <table style={s.table}>
              <thead>
                <tr>
                  <th style={s.th}>
                    <input
                      type="checkbox"
                      checked={selected.size === items.length && items.length > 0}
                      onChange={selectAll}
                    />
                  </th>
                  <th style={s.th}>Severidad</th>
                  <th style={s.th}>Tipología</th>
                  <th style={s.th}>Título</th>
                  <th style={s.th}>Score</th>
                  <th style={s.th}>Estado</th>
                  <th style={s.th}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => (
                  <tr key={it.id} style={s.tr}>
                    <td style={s.td}>
                      <input
                        type="checkbox"
                        checked={selected.has(it.id)}
                        onChange={() => toggleSelected(it.id)}
                      />
                    </td>
                    <td style={s.td}>
                      <span style={{
                        ...s.sevBadge,
                        background: sevColor(it.severidad) + '22',
                        color: sevColor(it.severidad),
                        borderColor: sevColor(it.severidad),
                      }}>{it.severidad.toUpperCase()}</span>
                    </td>
                    <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace', color: '#9BA3B4', fontSize: 11 }}>
                      {it.tipologia}
                    </td>
                    <td style={s.td}>
                      <div style={{ color: '#dde3ee', maxWidth: 480 }}>{it.titulo}</div>
                      <div style={s.tdSub}>
                        {it.resumen.length > 130 ? it.resumen.slice(0, 127) + '…' : it.resumen}
                      </div>
                    </td>
                    <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{it.score}</td>
                    <td style={s.td}>
                      <VerificacionBadge estado={it.estadoVerificacion} compact />
                    </td>
                    <td style={s.td}>
                      <Link to={`/senales?focus=${it.id}`} style={s.action} onClick={async (e) => {
                        e.preventDefault()
                        // Audit fix EH-W4: feedback fiel al resultado real.
                        try {
                          await navigator.clipboard.writeText(`${window.location.origin}/senales?focus=${it.id}`)
                          setShareToast('URL copiada')
                        } catch {
                          setShareToast('No se pudo copiar')
                        }
                        setTimeout(() => setShareToast(null), 1500)
                      }}>copiar URL</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <div style={s.pagination}>
          <button disabled={page === 0} onClick={() => setPageNum(page - 1)} style={s.pagBtn}>‹ anterior</button>
          <span style={{ color: '#9BA3B4', fontSize: 11 }}>
            Página {page + 1} de {totalPages} · {total} totales
          </span>
          <button
            disabled={page >= totalPages - 1}
            onClick={() => setPageNum(page + 1)}
            style={s.pagBtn}
          >siguiente ›</button>
        </div>
    </ArgosShell>
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

function sevColor(sev: Severidad): string {
  return sev === 'grave' ? '#E25656' : sev === 'moderada' ? '#F5B544' : '#9BA3B4'
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
  subtitle: { fontSize: 12, color: '#9BA3B4', marginTop: 6, maxWidth: 720, lineHeight: 1.5 },
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
  input: {
    background: '#161b22', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '5px 10px', borderRadius: 3, fontSize: 12, minWidth: 200,
  },
  chipRow: { display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' as const },
  chip: {
    background: '#1f2937', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '4px 9px', borderRadius: 12, fontSize: 11, cursor: 'pointer',
  },
  bulkBar: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    background: '#161b22', border: '1px solid #62C7A0',
    borderRadius: 4, marginBottom: 12,
  },
  bulkBtn: {
    background: 'transparent', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '4px 11px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
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
  td: { padding: '10px 12px', color: '#dde3ee', verticalAlign: 'top' as const },
  tdSub: { fontSize: 11, color: '#9BA3B4', marginTop: 4, maxWidth: 480 },
  sevBadge: {
    fontSize: 10, padding: '2px 7px', borderRadius: 3, border: '1px solid',
    fontWeight: 600, letterSpacing: 0.5,
  },
  action: {
    color: '#7da3ff', textDecoration: 'none', fontSize: 11,
  },

  pagination: {
    display: 'flex', justifyContent: 'center', alignItems: 'center',
    gap: 16, marginTop: 16, padding: 12,
  },
  pagBtn: {
    background: 'transparent', border: '1px solid #2a3140',
    color: '#9BA3B4', padding: '5px 11px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
  },
  error: { padding: 14, background: '#3a1d1d', color: '#E25656', borderRadius: 4 },
  muted: { color: '#9BA3B4', fontSize: 13, padding: 24, textAlign: 'center' as const },
}
