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
 *
 * M2 (graph-context-everywhere): split vertical 50/50 — tabla a la izquierda
 * con todos los filtros + bulk actions intactos, GraphCanvas a la derecha
 * con el backbone Estado→Reparticion→Empresa. Click en señal:
 *   - Selecciona la fila + resalta los nodos cuyos CUITs aparecen en
 *     `entidades_cuit` de la señal (vía `highlighted` set en el grafo).
 *   - Muestra el panel "por qué" inline debajo de la fila con el resumen,
 *     tipología, articulado legal y evidencia.
 *
 * Reemplaza al toggle TABLA/GRAFO previo: ahora siempre se ve grafo + tabla.
 */
import { Fragment, useEffect, useMemo, useState, useCallback } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import { SevPill } from '@/components/argos/forensic/Primitives'
import { GraphSplitLayout } from '@/components/argos/GraphSplitLayout'
import { GraphCanvas } from '@/components/argos/GraphCanvas'
import { useGraphSelection } from '@/hooks/useGraphSelection'
import { useGrafoJerarquia } from '@/lib/queries'
import { graphFromJerarquia } from '@/lib/argos/graphFromData'
import type { ArgosGraph } from '@/lib/argos/types'
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
  /** M2: CUITs/DNIs involucrados — populado desde señales_cache.entidades_cuit */
  cuits: string[]
}

interface ListResp {
  items: Senal[]
  paginacion: { total: number; limit: number; offset: number; hayMas: boolean }
}

const PAGE_SIZE = 50
const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

/** Clave estable de selección por señal. */
function senalKey(id: string): string {
  return `senal:${id}`
}

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

  // Selección bidireccional grafo↔fila — usa el mismo hook que ActoresD6.
  // selectedKey = senal:<id> de la señal con detalle abierto.
  const selection = useGraphSelection()

  // Backbone del grafo: Estado → Reparticion → Empresa (todas las
  // jurisdicciones cordobesas). El usuario ve siempre la estructura general
  // y los nodos involucrados se resaltan al seleccionar una señal.
  const grafoQuery = useGrafoJerarquia({
    jurisdiccion: 'all',
    maxReparticiones: 12,
    maxEmpresasPorReparticion: 4,
  })

  const graphSnapshot = useMemo<ArgosGraph>(() => {
    const resp = grafoQuery.data
    if (!resp || resp.nodes.length === 0) return EMPTY_GRAPH
    return graphFromJerarquia(resp)
  }, [grafoQuery.data])

  /**
   * Highlighted set: cuando hay una señal seleccionada, resaltamos en el grafo
   * todos los nodos empresa cuyo CUIT aparece en `cuits` de la señal.
   *
   * El id del nodo empresa en graphFromJerarquia es típicamente `empresa:<cuit>`
   * — buscamos por inclusion de cualquier cuit del array sobre los node ids
   * y subtitle (que suele contener el cuit). Esto es robusto al esquema
   * exacto de id que el backend emita.
   */
  const highlighted = useMemo<Set<string>>(() => {
    const sel = selection.selectedKey
    if (!sel || !sel.startsWith('senal:')) return new Set()
    const senalId = sel.slice('senal:'.length)
    const senal = items.find((it) => it.id === senalId)
    if (!senal || senal.cuits.length === 0) return new Set()
    const cuitsSet = new Set(senal.cuits.map((c) => c.replace(/\D/g, '')))
    const highlightedNodes = new Set<string>()
    for (const node of graphSnapshot.nodes) {
      // Coincidencia por id (formato típico empresa:<cuit>)
      const idDigits = node.id.replace(/\D/g, '')
      if (idDigits.length >= 11 && cuitsSet.has(idDigits)) {
        highlightedNodes.add(node.id)
        continue
      }
      // Fallback: subtitle suele incluir CUIT en formato "CUIT XX-XXXXXXXX-X"
      if (node.subtitle) {
        const subDigits = node.subtitle.replace(/\D/g, '')
        if (subDigits.length >= 11 && cuitsSet.has(subDigits)) {
          highlightedNodes.add(node.id)
          continue
        }
      }
      // Fallback: el data del nodo puede tener cuit explícito
      const dataCuit = (node.data as { cuit?: string } | undefined)?.cuit
      if (dataCuit) {
        const dCuit = String(dataCuit).replace(/\D/g, '')
        if (dCuit.length >= 11 && cuitsSet.has(dCuit)) {
          highlightedNodes.add(node.id)
        }
      }
    }
    return highlightedNodes
  }, [selection.selectedKey, items, graphSnapshot])

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
        // Backwards-compat: si el backend antiguo no envía cuits[], lo
        // normalizamos a array vacío para no romper el highlight.
        const normalized = d.items.map((it) => ({
          ...it,
          cuits: Array.isArray(it.cuits) ? it.cuits : [],
        }))
        setItems(normalized); setTotal(d.paginacion.total)
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
    let raw: string | null
    try { raw = localStorage.getItem('argos_watchlist_v1') } catch (e) {
      setShareToast(`Error: ${(e as Error).message || 'storage no disponible'}`)
      setTimeout(() => setShareToast(null), 3000)
      return
    }
    let arr: Array<{ id: string; kind: 'pf' | 'pj' | 'signal'; label: string; addedAt: string }> = []
    try { arr = raw ? JSON.parse(raw) : [] } catch {
      arr = []
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
      setShareToast(`No se pudo guardar: ${(e as Error).message || 'storage lleno'}`)
      setTimeout(() => setShareToast(null), 3000)
      return
    }
    window.dispatchEvent(new Event('argos:watchlist-changed'))
    setShareToast(`+${toAdd.length} a watchlist`); setTimeout(() => setShareToast(null), 1800)
    setSelected(new Set())
  }

  async function shareBulk() {
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

  // ─── Pane primary (tabla con filtros + bulk actions) ────────────────────
  const primaryPane = (
    <div
      onClick={(e) => {
        // Click en fondo de la tabla → limpia selección. Excluye filas y
        // elementos interactivos para que filtros/checkboxes/links no
        // limpien por accidente. Incluye table/thead/tbody/td/th para
        // que clicks en chrome de la tabla no disparen clear (alineado
        // con la intención del spec: solo el fondo vacío del pane).
        const t = e.target as Element | null
        if (!t?.closest('tr, table, thead, tbody, td, th, button, input, select, label, a, summary')) {
          selection.clear()
        }
      }}
      style={{ flex: 1, padding: '24px 24px 24px 26px', overflow: 'auto', minHeight: 0 }}
    >
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
              {items.map(it => {
                const key = senalKey(it.id)
                const isSelected = selection.isSelected(key)
                return (
                  // Fragment con key explícita: evita warning de React por keys
                  // en el array y mantiene <tr> + detail row como hijos
                  // hermanos directos del <tbody> (válido en HTML).
                  <Fragment key={it.id}>
                    <tr
                      data-senal-key={key}
                      onClick={() => selection.select(key)}
                      onMouseEnter={() => selection.hover(key)}
                      onMouseLeave={() => selection.hover(null)}
                      style={{
                        ...s.tr,
                        background: isSelected ? 'rgba(94,182,255,0.08)' : 'transparent',
                        cursor: 'pointer',
                      }}
                    >
                      <td style={s.td} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          checked={selected.has(it.id)}
                          onChange={() => toggleSelected(it.id)}
                        />
                      </td>
                      <td style={s.td}>
                        <SevPill kind={it.severidad === 'leve' ? 'baja' : it.severidad} />
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
                      <td style={{
                        ...s.td,
                        fontFamily: 'var(--font-mono)',
                        fontVariantNumeric: 'tabular-nums',
                        fontSize: 13,
                        fontWeight: 500,
                        color: it.score >= 80 ? 'var(--alarm)' : it.score >= 60 ? 'var(--warn)' : 'var(--text-2)',
                      }}>{it.score}</td>
                      <td style={s.td}>
                        <VerificacionBadge estado={it.estadoVerificacion} compact />
                      </td>
                      <td style={s.td} onClick={(e) => e.stopPropagation()}>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await navigator.clipboard.writeText(`${window.location.origin}/senales?focus=${it.id}`)
                              setShareToast('URL copiada')
                            } catch {
                              setShareToast('No se pudo copiar')
                            }
                            setTimeout(() => setShareToast(null), 1500)
                          }}
                          style={{
                            ...s.action,
                            background: 'transparent',
                            border: 0,
                            cursor: 'pointer',
                            padding: 0,
                          }}
                        >
                          copiar URL
                        </button>
                      </td>
                    </tr>
                    {isSelected && <SignalDetailRow senal={it} />}
                  </Fragment>
                )
              })}
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
      <div style={{
        marginTop: 14,
        padding: '8px 0',
        borderTop: '1px solid var(--hairline-1)',
        fontSize: 10,
        color: 'var(--text-3)',
        fontFamily: 'var(--font-mono)',
        letterSpacing: '0.04em',
        display: 'flex',
        justifyContent: 'space-between',
      }}>
        <div>{items.length} señales · {items.filter(i => i.severidad === 'grave').length} graves · {items.filter(i => i.severidad === 'moderada').length} moderadas · {items.filter(i => i.severidad === 'leve').length} leves</div>
        <div>SHIFT+CLICK selección múltiple · ⌘E exportar · Δ ver cambios</div>
      </div>
    </div>
  )

  // ─── Pane graph (backbone con highlight de involucrados) ────────────────
  const graphPane = (
    <div
      onClick={(e) => {
        // Click en fondo del grafo (no en un nodo) → limpia selección.
        const target = e.target as Element | null
        if (!target?.closest('.node')) selection.clear()
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      {grafoQuery.isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' }}>
          cargando grafo backbone…
        </div>
      )}
      {!grafoQuery.isLoading && graphSnapshot.nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' }}>
          sin datos para mostrar el grafo
        </div>
      )}
      {graphSnapshot.nodes.length > 0 && (
        <GraphCanvas
          snapshot={graphSnapshot}
          focusedId={null}
          hoveredId={null}
          highlighted={highlighted}
          idle={false}
          heroNodeId={null}
          labelsMode="minimal"
          labelsDepth={1}
          onHover={() => { /* hover en grafo no afecta tabla por ahora */ }}
          onSelect={() => { /* click en nodo: dejamos pasar al GraphCanvas (no abrimos popover) */ }}
        />
      )}

      {/* Eyebrow */}
      <div style={{ position: 'absolute', top: 14, left: 18, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
        <div className="fx-eyebrow">CONTEXTO ESTRUCTURAL · BACKBONE</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          {graphSnapshot.nodes.length} nodos · {highlighted.size > 0 ? `${highlighted.size} resaltados` : 'click una señal para resaltar'}
        </div>
      </div>

      {/* Hint inferior */}
      {selection.selectedKey && highlighted.size === 0 && (
        <div style={{
          position: 'absolute', bottom: 14, left: 18, right: 18, padding: '8px 12px',
          background: 'rgba(7,10,17,0.85)',
          border: '1px solid var(--hairline-2)',
          fontFamily: 'var(--font-mono)', fontSize: 10,
          color: 'var(--text-3)', letterSpacing: '0.04em',
          textAlign: 'center',
        }}>
          señal seleccionada sin CUITs cargados (re-correr <code>analyze --force</code>)
        </div>
      )}
    </div>
  )

  return (
    <ArgosShell title="Señales detectadas">
      <GraphSplitLayout
        orientation="vertical"
        ratio="50/50"
        primary={primaryPane}
        graph={graphPane}
      />
    </ArgosShell>
  )
}

// ─── Panel "por qué" inline debajo de la fila seleccionada ──────────────────

interface SignalDetailRowProps {
  senal: Senal
}

function SignalDetailRow({ senal }: SignalDetailRowProps) {
  const articulos = senal.legal?.articulos ?? []
  const denunciarAnte = senal.legal?.denunciarAnte ?? []
  return (
    <tr>
      <td colSpan={7} style={{
        padding: '14px 22px 18px',
        background: 'rgba(94,182,255,0.04)',
        borderBottom: '1px solid var(--hairline-1)',
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, fontSize: 12 }}>
          <div>
            <span style={{ fontFamily: 'var(--font-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.16em', textTransform: 'uppercase' }}>
              POR QUÉ ESTÁ MARCADA
            </span>
            <div style={{ marginTop: 6, color: 'var(--text-1)', lineHeight: 1.55, maxWidth: 720 }}>
              {senal.resumen}
            </div>
          </div>

          <div style={{ display: 'flex', gap: 32, flexWrap: 'wrap', fontFamily: 'var(--font-mono)', fontSize: 11 }}>
            <div>
              <div style={{ color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.10em', marginBottom: 3 }}>TIPOLOGÍA</div>
              <div style={{ color: 'var(--text-1)' }}>{senal.tipologia}</div>
            </div>
            {articulos.length > 0 && (
              <div>
                <div style={{ color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.10em', marginBottom: 3 }}>NORMA CITADA</div>
                <div style={{ color: 'var(--text-1)' }}>{articulos.join(' · ')}</div>
              </div>
            )}
            {denunciarAnte.length > 0 && (
              <div>
                <div style={{ color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.10em', marginBottom: 3 }}>DENUNCIAR ANTE</div>
                <div style={{ color: 'var(--text-1)' }}>{denunciarAnte.join(' · ')}</div>
              </div>
            )}
            <div>
              <div style={{ color: 'var(--text-3)', fontSize: 9, letterSpacing: '0.10em', marginBottom: 3 }}>CUITS INVOLUCRADOS</div>
              <div style={{ color: 'var(--text-1)' }}>
                {senal.cuits.length > 0 ? `${senal.cuits.length} (resaltados en grafo →)` : 'sin CUITs cargados'}
              </div>
            </div>
          </div>

          {senal.evidencia.length > 0 && (
            <details style={{ fontSize: 11, color: 'var(--text-2)' }}>
              <summary style={{ cursor: 'pointer', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.10em' }}>
                EVIDENCIA · {senal.evidencia.length} ítems
              </summary>
              <ul style={{ marginTop: 6, paddingLeft: 18, lineHeight: 1.6 }}>
                {senal.evidencia.slice(0, 5).map((e, i) => (
                  <li key={i}>
                    {e.descripcion}
                    {e.fuenteUrl && (
                      <> · <a href={e.fuenteUrl} target="_blank" rel="noreferrer" style={{ color: 'var(--select)' }}>fuente</a></>
                    )}
                  </li>
                ))}
                {senal.evidencia.length > 5 && (
                  <li style={{ color: 'var(--text-3)' }}>+{senal.evidencia.length - 5} más</li>
                )}
              </ul>
            </details>
          )}
        </div>
      </td>
    </tr>
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

const s: Record<string, React.CSSProperties> = {
  subtitle: { fontSize: 12, color: '#9BA3B4', marginTop: 0, marginBottom: 18, maxWidth: 720, lineHeight: 1.5 },
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
