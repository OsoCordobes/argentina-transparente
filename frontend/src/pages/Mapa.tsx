/**
 * Mapa.tsx — superficie /mapa fullscreen (PLAN-UI Módulo #7).
 *
 * Misión: red gráfica exploratoria del universo. Top centralidad al entrar,
 * search omnibox para focar, panel detalle al click, expansión por grados.
 *
 * Reusa GraphCanvas (d3-force ya implementado en /explorar v2).
 * La animación cinematográfica de "sequential stagger" se logra combinando
 * la simulación física de GraphCanvas con un fade-in escalonado sobre los
 * nodos cuando aparecen.
 */
import { useEffect, useState, useMemo, useRef } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import GraphCanvas from '@/components/argos/GraphCanvas'
import { ForensicHeader } from '@/components/argos/ForensicHeader'
import type { ArgosGraph, ArgosNode } from '@/lib/argos/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface BackendGraph {
  nodes: Array<{
    id: string; type: string; label: string; subtitle?: string; weight?: number;
    flags?: { verificadoAfip?: boolean; severidad?: 'grave' | 'moderada' | 'leve' };
    data?: Record<string, unknown>;
  }>
  edges: Array<{ source: string; target: string; kind: string; weight?: number }>
  graphAvailable: boolean
}

export default function Mapa() {
  const navigate = useNavigate()
  const [snapshot, setSnapshot] = useState<ArgosGraph | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const wrapRef = useRef<HTMLDivElement | null>(null)

  // Fetch núcleo
  useEffect(() => {
    const ac = new AbortController()
    fetch(`${API_URL}/api/grafo/nucleo?limite=50`, { signal: ac.signal })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<BackendGraph>
      })
      .then(data => {
        if (ac.signal.aborted) return
        if (!data.graphAvailable) {
          setError('Neo4j no disponible — el mapa requiere el grafo cargado en Neo4j')
          return
        }
        setSnapshot(toArgosGraph(data))
      })
      .catch(e => { if (!ac.signal.aborted) setError((e as Error).message) })
    return () => ac.abort()
  }, [])

  // Resize observer
  useEffect(() => {
    if (!wrapRef.current) return
    const el = wrapRef.current
    const ro = new ResizeObserver(() => {
      setSize({ w: el.clientWidth, h: el.clientHeight })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const filtered = useMemo(() => {
    if (!snapshot || !search.trim()) return null
    const q = search.toLowerCase()
    return snapshot.nodes.filter(n =>
      n.label.toLowerCase().includes(q) || n.id.toLowerCase().includes(q)
    ).slice(0, 5)
  }, [snapshot, search])

  const focusedNode: ArgosNode | null = useMemo(() => {
    if (!snapshot || !focusedId) return null
    return snapshot.nodes.find(n => n.id === focusedId) ?? null
  }, [snapshot, focusedId])

  return (
    <div style={s.page}>
      <ForensicHeader />
      <div ref={wrapRef} style={s.canvasWrap}>
        {snapshot ? (
          <GraphCanvas
            snapshot={snapshot}
            focusedId={focusedId}
            hoveredId={hoveredId}
            highlighted={new Set()}
            idle={false}
            heroNodeId={null}
            labelsMode="minimal"
            labelsDepth={2}
            onSelect={(id) => setFocusedId(id)}
            onHover={(id) => setHoveredId(id)}
          />
        ) : (
          <div style={s.loadingCenter}>
            {error ? (
              <div style={s.errorBox}>
                <div style={{ fontSize: 13, color: '#E25656', marginBottom: 8 }}>
                  Mapa no disponible: {error}
                </div>
                <Link to="/actores" style={s.linkInline}>
                  Ir a /actores ↗
                </Link>
              </div>
            ) : (
              <div style={{ color: '#9BA3B4', fontSize: 13 }}>Cargando red…</div>
            )}
          </div>
        )}

        {/* Overlay Search top-left */}
        <div style={s.searchOverlay}>
          <div style={s.searchLabel}>BUSCAR EN LA RED</div>
          <input
            type="text"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Nombre, CUIT, DNI…"
            style={s.searchInput}
          />
          {filtered && filtered.length > 0 && (
            <div style={s.searchResults}>
              {filtered.map(n => (
                <button
                  key={n.id}
                  onClick={() => { setFocusedId(n.id); setSearch('') }}
                  style={s.searchItem}
                >
                  <span style={{ color: typeColor(n.type), marginRight: 8 }}>
                    {typeGlyph(n.type)}
                  </span>
                  <span style={{ color: '#dde3ee' }}>{n.label}</span>
                  {n.subtitle && (
                    <span style={{ color: '#9BA3B4', fontSize: 10, marginLeft: 8 }}>
                      {n.subtitle}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}
          {filtered && filtered.length === 0 && (
            <div style={{ ...s.searchItem, color: '#9BA3B4', fontSize: 11, padding: '8px 12px' }}>
              Sin coincidencias
            </div>
          )}
        </div>

        {/* Right drawer detalle */}
        {focusedNode && (
          <aside style={s.drawer}>
            <div style={s.drawerHead}>
              <span style={{ color: typeColor(focusedNode.type), fontSize: 18 }}>
                {typeGlyph(focusedNode.type)}
              </span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={s.drawerTitle}>{focusedNode.label}</div>
                {focusedNode.subtitle && (
                  <div style={s.drawerSubtitle}>{focusedNode.subtitle}</div>
                )}
              </div>
              <button onClick={() => setFocusedId(null)} style={s.drawerClose} aria-label="Cerrar">×</button>
            </div>
            <div style={s.drawerBody}>
              <div style={s.kpi}>
                <span style={s.kpiLabel}>TIPO</span>
                <span style={s.kpiValue}>{focusedNode.type.toUpperCase()}</span>
              </div>
              <div style={s.kpi}>
                <span style={s.kpiLabel}>PESO</span>
                <span style={s.kpiValue}>{(focusedNode.weight * 100).toFixed(0)}%</span>
              </div>
              {focusedNode.flags?.severidad && (
                <div style={s.kpi}>
                  <span style={s.kpiLabel}>SEVERIDAD</span>
                  <span style={{ ...s.kpiValue, color: sevColor(focusedNode.flags.severidad) }}>
                    {focusedNode.flags.severidad.toUpperCase()}
                  </span>
                </div>
              )}
              {focusedNode.flags?.verificadoAfip && (
                <div style={{ fontSize: 11, color: '#62C7A0', marginTop: 8 }}>
                  ✓ identidad verificada
                </div>
              )}
              <div style={s.actions}>
                <button
                  onClick={() => navigateToProfile(navigate, focusedNode)}
                  style={s.action}
                >
                  Abrir perfil completo →
                </button>
              </div>
            </div>
          </aside>
        )}

        {/* Bottom info: cantidad de nodos */}
        {snapshot && (
          <div style={s.statusBar}>
            <span>● {snapshot.nodes.length} nodos · {snapshot.edges.length} aristas · top centralidad</span>
            <span style={{ marginLeft: 'auto', fontSize: 10 }}>
              Click en un nodo para ver detalle · escapa para deseleccionar
            </span>
          </div>
        )}
      </div>
    </div>
  )
}

function toArgosGraph(data: BackendGraph): ArgosGraph {
  const nodes: ArgosNode[] = data.nodes.map(n => ({
    id: n.id,
    type: (n.type as ArgosNode['type']) ?? 'persona',
    label: n.label,
    subtitle: n.subtitle,
    weight: n.weight ?? 0.5,
    flags: n.flags,
    data: n.data ?? {},
  }))
  const edges: ArgosGraph['edges'] = data.edges.map(e => ({
    source: e.source,
    target: e.target,
    kind: (e.kind as ArgosGraph['edges'][number]['kind']) ?? 'opera_en',
    weight: e.weight ?? 0.5,
  }))
  return { nodes, edges }
}

function navigateToProfile(navigate: ReturnType<typeof useNavigate>, n: ArgosNode) {
  if (n.type === 'persona' || n.type === 'funcionario') {
    const dni = String(n.data?.dni ?? n.id.replace(/^pf:/, ''))
    if (dni) navigate(`/persona/${dni}`)
    return
  }
  if (n.type === 'empresa' || n.type === 'proveedor') {
    const cuit = String(n.data?.cuit ?? n.id.replace(/^pj:/, ''))
    if (cuit) navigate(`/empresa/${cuit}`)
    return
  }
  // Otros tipos: por ahora no tienen profile dedicado
}

function typeColor(t: string): string {
  switch (t) {
    case 'persona': case 'funcionario': case 'director': return '#7da3ff'
    case 'empresa': case 'proveedor': return '#ff9b5c'
    case 'señal': return '#E25656'
    case 'contrato': return '#9BA3B4'
    case 'jurisdiccion': case 'reparticion': return '#62C7A0'
    default: return '#dde3ee'
  }
}

function typeGlyph(t: string): string {
  switch (t) {
    case 'persona': case 'funcionario': case 'director': return '●'
    case 'empresa': case 'proveedor': return '■'
    case 'señal': return '⚐'
    case 'contrato': return '□'
    case 'jurisdiccion': case 'reparticion': return '★'
    default: return '◆'
  }
}

function sevColor(sev: 'grave' | 'moderada' | 'leve'): string {
  return sev === 'grave' ? '#E25656' : sev === 'moderada' ? '#F5B544' : '#9BA3B4'
}

const s: Record<string, React.CSSProperties> = {
  page: {
    background: '#0d1117', color: '#dde3ee',
    minHeight: '100vh',
    display: 'flex', flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  canvasWrap: { flex: 1, position: 'relative', overflow: 'hidden' },
  loadingCenter: {
    position: 'absolute', inset: 0,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  },
  errorBox: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: 16, maxWidth: 360, textAlign: 'center' as const,
  },
  linkInline: { color: '#7da3ff', textDecoration: 'none', fontSize: 12 },

  searchOverlay: {
    position: 'absolute', top: 16, left: 16, width: 320,
    background: 'rgba(13,17,23,0.85)',
    backdropFilter: 'blur(8px)' as const,
    border: '1px solid #2a3140', borderRadius: 4, padding: 14,
    zIndex: 10,
  },
  searchLabel: {
    fontSize: 9, letterSpacing: 1.5, color: '#9BA3B4',
    textTransform: 'uppercase' as const, marginBottom: 6, fontWeight: 600,
  },
  searchInput: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '7px 10px', borderRadius: 3, fontSize: 13,
    boxSizing: 'border-box' as const,
  },
  searchResults: {
    marginTop: 8, display: 'flex', flexDirection: 'column' as const, gap: 2,
    maxHeight: 240, overflowY: 'auto' as const,
  },
  searchItem: {
    background: 'transparent', border: 'none', textAlign: 'left' as const,
    padding: '6px 10px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
    color: '#dde3ee', display: 'flex', alignItems: 'center',
  },

  drawer: {
    position: 'absolute', top: 0, right: 0, height: '100%', width: 340,
    background: '#0d1117', borderLeft: '1px solid #1f2937',
    zIndex: 10, display: 'flex', flexDirection: 'column',
  },
  drawerHead: {
    display: 'flex', alignItems: 'center', gap: 12,
    padding: '14px 16px', borderBottom: '1px solid #1f2937',
  },
  drawerTitle: { fontSize: 14, color: '#dde3ee', fontWeight: 600 },
  drawerSubtitle: { fontSize: 11, color: '#9BA3B4', marginTop: 2 },
  drawerClose: {
    background: 'transparent', border: 'none', color: '#9BA3B4',
    fontSize: 22, cursor: 'pointer', padding: 0, lineHeight: 1,
  },
  drawerBody: { padding: 16, flex: 1 },
  kpi: {
    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 8, marginBottom: 8, borderBottom: '1px solid #1f2937',
  },
  kpiLabel: { fontSize: 10, color: '#9BA3B4', letterSpacing: 1 },
  kpiValue: { fontFamily: 'ui-monospace, monospace', fontSize: 13, color: '#dde3ee' },
  actions: { marginTop: 16 },
  action: {
    width: '100%', background: 'transparent', border: '1px solid #62C7A0',
    color: '#62C7A0', padding: '8px 12px', borderRadius: 3,
    fontSize: 12, cursor: 'pointer', textAlign: 'left' as const,
  },

  statusBar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    padding: '6px 16px', background: 'rgba(13,17,23,0.85)',
    backdropFilter: 'blur(8px)' as const,
    fontSize: 11, color: '#9BA3B4',
    display: 'flex', alignItems: 'center', gap: 8,
    borderTop: '1px solid #1f2937',
  },
}
