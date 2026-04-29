/**
 * WatchlistD8.tsx — superficie /watchlist (PLAN-UI Módulo #10).
 *
 * Lista de actores observados (localStorage) + feed de alertas vivas
 * sobre ellos (POST /api/watchlist-d8/feed).
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import {
  getWatchlist, removeFromWatchlist, exportWatchlist, importWatchlist,
  markAllSeen, type WatchlistItem,
} from '@/lib/argos/watchlist-storage'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface AlertaItem {
  actorId: string
  actorKind: 'pf' | 'pj' | 'signal'
  tipo: 'nueva_senal' | 'cambio_estado' | 'nuevo_contrato'
  refId: string
  titulo: string
  ts: string
}

export default function WatchlistD8() {
  const [items, setItems] = useState<WatchlistItem[]>([])
  const [alertas, setAlertas] = useState<AlertaItem[]>([])
  const [loadingFeed, setLoadingFeed] = useState(false)
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')

  const refresh = useCallback(() => {
    setItems(getWatchlist())
  }, [])

  useEffect(() => {
    refresh()
    window.addEventListener('argos:watchlist-changed', refresh)
    return () => window.removeEventListener('argos:watchlist-changed', refresh)
  }, [refresh])

  const [feedError, setFeedError] = useState<string | null>(null)

  // Fetch feed cuando hay items.
  // Audit fix EH-1: NO silenciar errores. Antes catch swallow + sin r.ok.
  // Ahora distinguimos OK / 5xx / red caída y mostramos banner.
  // Audit fix W2: la dep era [items] (referencia que cambia siempre); ahora
  // dependemos del set de IDs serializado, así no re-fetcheamos en cada
  // refresh de la misma watchlist.
  const idsKey = items.map(i => `${i.kind}:${i.id}:${i.lastSeenAt ?? ''}`).sort().join('|')
  useEffect(() => {
    if (items.length === 0) {
      setAlertas([]); setFeedError(null)
      return
    }
    const ac = new AbortController()
    setLoadingFeed(true); setFeedError(null)
    fetch(`${API_URL}/api/watchlist-d8/feed`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ items }),
      signal: ac.signal,
    })
      .then(async r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(d => { if (!ac.signal.aborted) setAlertas(d.alertas ?? []) })
      .catch(e => {
        if (ac.signal.aborted) return
        setFeedError((e as Error).message || 'error de red')
      })
      .finally(() => { if (!ac.signal.aborted) setLoadingFeed(false) })
    return () => ac.abort()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [idsKey])

  function handleRemove(id: string) {
    removeFromWatchlist(id)
  }

  function handleMarkAllSeen() {
    markAllSeen()
  }

  function handleExport() {
    const blob = new Blob([exportWatchlist()], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = 'argos-watchlist.json'
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  function handleImport() {
    const r = importWatchlist(importText)
    if (r.ok === true) {
      setShowImport(false); setImportText('')
    } else {
      alert(`No se pudo importar: ${(r as { ok: false; reason: string }).reason}`)
    }
  }

  return (
    <ArgosShell title="Watchlist · monitoreo personal">
      <p style={s.subtitle}>
        Actores que estás monitoreando. Recibís alertas en este feed
        cuando aparecen señales nuevas que los mencionan. La lista vive
        en tu navegador (localStorage) y es exportable como JSON.
      </p>

        <div style={s.actions}>
          <button onClick={handleMarkAllSeen} style={s.bulkBtn}>Marcar todo como visto</button>
          <button onClick={handleExport} style={s.bulkBtn}>↓ Exportar JSON</button>
          <button onClick={() => setShowImport(!showImport)} style={s.bulkBtn}>Importar JSON</button>
        </div>

        {showImport && (
          <div style={s.importBox}>
            <textarea
              value={importText} onChange={e => setImportText(e.target.value)}
              placeholder="Pegá aquí un JSON exportado…" rows={5}
              style={s.textarea}
            />
            <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
              <button onClick={handleImport} style={s.primaryBtn}>Importar</button>
              <button onClick={() => { setShowImport(false); setImportText('') }} style={s.bulkBtn}>Cancelar</button>
            </div>
          </div>
        )}

        <section style={s.split}>
          <div style={s.col}>
            <h2 style={s.colTitle}>Actores observados ({items.length})</h2>
            {items.length === 0 ? (
              <div style={s.empty}>
                Sin actores en watchlist. Agregalos desde un perfil con el
                botón <strong>★ Watchlist</strong>, o desde <Link to="/senales" style={s.link}>/senales</Link>.
              </div>
            ) : (
              <ul style={s.list}>
                {items.map(it => (
                  <li key={it.id} style={s.item}>
                    <span style={{ color: glyphColor(it.kind), marginRight: 10 }}>
                      {glyph(it.kind)}
                    </span>
                    <Link to={profileLink(it)} style={{ ...s.link, flex: 1 }}>
                      {it.label}
                    </Link>
                    <span style={s.itemMeta}>
                      desde {new Date(it.addedAt).toLocaleDateString('es-AR')}
                    </span>
                    <button onClick={() => handleRemove(it.id)} style={s.removeBtn} title="Remover">
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div style={s.col}>
            <h2 style={s.colTitle}>
              Alertas {loadingFeed ? '(cargando…)' : `(${alertas.length})`}
            </h2>
            {feedError && (
              <div style={{ ...s.empty, color: '#E25656' }}>
                No se pudo cargar el feed: {feedError}
                {' '}(reintentaremos cuando cambies la watchlist).
              </div>
            )}
            {alertas.length === 0 && !loadingFeed && !feedError && (
              <div style={s.empty}>
                {items.length === 0
                  ? 'Agregá actores para empezar a recibir alertas.'
                  : 'Sin alertas pendientes para tus actores.'}
              </div>
            )}
            {alertas.length > 0 && (
              <ul style={s.list}>
                {alertas.map((a, i) => (
                  <li key={`${a.actorId}-${a.refId}-${i}`} style={s.alert}>
                    <div style={s.alertHeader}>
                      <span style={{ color: glyphColor(a.actorKind), marginRight: 8 }}>
                        {glyph(a.actorKind)}
                      </span>
                      <span style={s.alertTipo}>{tipoLabel(a.tipo)}</span>
                      <span style={s.alertTs}>{relativeTime(a.ts)}</span>
                    </div>
                    <div style={s.alertTitulo}>{a.titulo}</div>
                    <div style={s.alertActions}>
                      <Link to={profileLinkFromAlert(a)} style={s.link}>Ver actor →</Link>
                      <Link to={`/senales?focus=${a.refId}`} style={s.link}>Ver señal →</Link>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>
    </ArgosShell>
  )
}

function glyph(k: WatchlistItem['kind']): string {
  return k === 'pf' ? '●' : k === 'pj' ? '■' : '⚐'
}
function glyphColor(k: WatchlistItem['kind']): string {
  return k === 'pf' ? '#7da3ff' : k === 'pj' ? '#ff9b5c' : '#E25656'
}
function profileLink(it: WatchlistItem): string {
  if (it.kind === 'pf') return `/persona/${it.id}`
  if (it.kind === 'pj') return `/empresa/${it.id}`
  return `/senales?focus=${it.id.replace(/^signal:/, '')}`
}
function profileLinkFromAlert(a: AlertaItem): string {
  if (a.actorKind === 'pf') return `/persona/${a.actorId}`
  if (a.actorKind === 'pj') return `/empresa/${a.actorId}`
  return `/senales?focus=${a.refId}`
}
function tipoLabel(t: string): string {
  if (t === 'nueva_senal') return 'NUEVA SEÑAL'
  if (t === 'cambio_estado') return 'CAMBIO DE ESTADO'
  if (t === 'nuevo_contrato') return 'NUEVO CONTRATO'
  return t.toUpperCase()
}
function relativeTime(iso: string): string {
  const d = new Date(iso)
  const ms = Date.now() - d.getTime()
  const min = Math.floor(ms / 60000)
  if (min < 60) return `hace ${min}min`
  const h = Math.floor(min / 60)
  if (h < 24) return `hace ${h}h`
  const days = Math.floor(h / 24)
  if (days < 7) return `hace ${days}d`
  return d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '24px' },
  head: { marginBottom: 16, paddingBottom: 14, borderBottom: '1px solid #1f2937' },
  h1: { fontSize: 20, margin: 0, color: '#dde3ee', fontWeight: 600 },
  subtitle: { fontSize: 12, color: '#9BA3B4', marginTop: 6, maxWidth: 720, lineHeight: 1.5 },

  actions: { display: 'flex', gap: 8, marginBottom: 16 },
  bulkBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#dde3ee',
    padding: '6px 12px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
  },
  primaryBtn: {
    background: '#62C7A022', border: '1px solid #62C7A0', color: '#62C7A0',
    padding: '6px 14px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
  },
  importBox: {
    background: '#161b22', border: '1px solid #2a3140', padding: 14, borderRadius: 4,
    marginBottom: 16,
  },
  textarea: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: 10, borderRadius: 3, fontSize: 12,
    fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' as const,
    resize: 'vertical' as const,
  },

  split: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16,
  },
  col: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    overflow: 'hidden', display: 'flex', flexDirection: 'column' as const,
  },
  colTitle: {
    fontSize: 11, letterSpacing: 1.5, color: '#9BA3B4', fontWeight: 600,
    textTransform: 'uppercase' as const,
    padding: '12px 16px', borderBottom: '1px solid #1f2937', margin: 0,
  },
  empty: { padding: 24, color: '#9BA3B4', fontSize: 13, lineHeight: 1.5 },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    display: 'flex', alignItems: 'center', gap: 8,
    padding: '10px 16px', borderBottom: '1px solid #1f2937', fontSize: 12,
  },
  itemMeta: { fontSize: 10, color: '#9BA3B4' },
  removeBtn: {
    background: 'transparent', border: 'none', color: '#9BA3B4',
    cursor: 'pointer', fontSize: 14, padding: '0 6px',
  },

  alert: {
    padding: '12px 16px', borderBottom: '1px solid #1f2937',
  },
  alertHeader: { display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 },
  alertTipo: {
    fontSize: 9, letterSpacing: 1.5, color: '#F5B544',
    fontFamily: 'ui-monospace, monospace', fontWeight: 600,
  },
  alertTs: { fontSize: 10, color: '#9BA3B4', marginLeft: 'auto' },
  alertTitulo: { fontSize: 12, color: '#dde3ee', marginBottom: 6 },
  alertActions: { display: 'flex', gap: 12, fontSize: 11 },

  link: { color: '#7da3ff', textDecoration: 'none' },
}
