/**
 * WatchlistD8.tsx — superficie /watchlist (PLAN-UI Módulo #10).
 *
 * Lista de actores observados (localStorage) + feed de alertas vivas
 * sobre ellos (POST /api/watchlist-d8/feed).
 */
import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { EmptyState, LoadingState } from '@/components/argos/primitives'
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

  // V4 — empty state forense cuando watchlist totalmente vacía
  if (items.length === 0 && alertas.length === 0) {
    return (
      <ArgosShell title="Watchlist · monitoreo personal">
        <EmptyState
          eyebrow="WATCHLIST · 0 ITEMS"
          title="Marcá entidades para ver sus cambios."
          body="Cuando alguna entidad de la watchlist cambia (nuevo contrato, nueva señal, nuevo vínculo), te aparece en el header como Δ. Agregás desde cualquier entidad con el botón ★ Watchlist en el panel."
          primaryAction={
            <Link
              to="/"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                padding: 'var(--space-1-5) var(--space-3)',
                background: 'color-mix(in oklab, var(--accent-primary) 13%, transparent)',
                border: '1px solid var(--accent-primary)',
                color: 'var(--accent-primary)',
                borderRadius: 'var(--radius-sm)',
                fontSize: 'var(--text-base)',
                fontFamily: 'var(--font-sans)',
                textDecoration: 'none',
              }}
            >
              Buscar entidades
            </Link>
          }
        />
      </ArgosShell>
    )
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
                {items.map(it => {
                  // Cuenta de alertas activas para este actor → usa pulse halo
                  // como indicador visual de "tiene novedades sin leer".
                  const nuevasSenales = alertas.filter(a => a.actorId === it.id).length
                  return (
                    <li key={it.id} style={s.item}>
                      <span
                        style={{
                          position: 'relative',
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 18,
                          height: 18,
                          marginRight: 'var(--space-3)',
                        }}
                      >
                        {nuevasSenales > 0 && (
                          <span
                            style={{
                              position: 'absolute',
                              inset: -4,
                              borderRadius: '50%',
                              background: glyphColor(it.kind),
                              opacity: 0.45,
                              animation: 'argos-pulse-halo 1.6s var(--ease-in-out) infinite',
                              pointerEvents: 'none',
                            }}
                            aria-hidden
                          />
                        )}
                        <span
                          style={{
                            color: glyphColor(it.kind),
                            position: 'relative',
                            fontSize: 14,
                          }}
                        >
                          {glyph(it.kind)}
                        </span>
                      </span>
                      <Link to={profileLink(it)} style={{ ...s.link, flex: 1 }}>
                        {it.label}
                      </Link>
                      {nuevasSenales > 0 && (
                        <span
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--semantic-warn)',
                            fontFamily: 'var(--font-mono)',
                            letterSpacing: 'var(--tracking-wider)',
                            marginRight: 'var(--space-2)',
                          }}
                        >
                          {nuevasSenales} Δ
                        </span>
                      )}
                      <span style={s.itemMeta}>
                        desde {new Date(it.addedAt).toLocaleDateString('es-AR')}
                      </span>
                      <button onClick={() => handleRemove(it.id)} style={s.removeBtn} title="Remover">
                        ×
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>

          <div style={s.col}>
            <h2 style={s.colTitle}>
              Alertas {loadingFeed ? '(cargando…)' : `(${alertas.length})`}
            </h2>
            {loadingFeed && (
              <div style={{ padding: 'var(--space-4)' }}>
                <LoadingState mode="block" lines={3} label="Cruzando watchlist con señales activas…" />
              </div>
            )}
            {feedError && !loadingFeed && (
              <div style={{ ...s.empty, color: 'var(--semantic-danger)' }}>
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
            {alertas.length > 0 && !loadingFeed && (
              <ul style={s.list}>
                {alertas.map((a, i) => (
                  <li key={`${a.actorId}-${a.refId}-${i}`} style={s.alert}>
                    <div style={s.alertHeader}>
                      <span style={{ color: glyphColor(a.actorKind), marginRight: 'var(--space-2)' }}>
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
  // Coherente con la taxonomía visual ARGOS (entity-* tokens).
  return k === 'pf'
    ? 'var(--accent-primary)'
    : k === 'pj'
      ? 'var(--entity-empresa)'
      : 'var(--semantic-danger)'
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
    background: 'var(--surface-base)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: 'var(--space-6)' },
  head: { marginBottom: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--hairline-2)' },
  h1: { fontSize: 'var(--text-xl)', margin: 0, color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' },
  subtitle: {
    fontSize: 'var(--text-base)', color: 'var(--text-secondary)', marginTop: 'var(--space-1-5)',
    maxWidth: 720, lineHeight: 'var(--leading-normal)',
  },

  actions: { display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)' },
  bulkBtn: {
    background: 'transparent', border: '1px solid var(--hairline-2)', color: 'var(--text-primary)',
    padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)', cursor: 'pointer',
  },
  primaryBtn: {
    background: 'color-mix(in oklab, var(--semantic-success) 13%, transparent)',
    border: '1px solid var(--semantic-success)', color: 'var(--semantic-success)',
    padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)', cursor: 'pointer',
  },
  importBox: {
    background: 'var(--surface-overlay)', border: '1px solid var(--hairline-2)',
    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },
  textarea: {
    width: '100%', background: 'var(--surface-base)', border: '1px solid var(--hairline-2)',
    color: 'var(--text-primary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)', fontFamily: 'var(--font-mono)',
    boxSizing: 'border-box' as const, resize: 'vertical' as const,
  },

  split: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)',
  },
  col: {
    background: 'var(--surface-overlay)', border: '1px solid var(--hairline-2)', borderRadius: 'var(--radius-md)',
    overflow: 'hidden', display: 'flex', flexDirection: 'column' as const,
  },
  colTitle: {
    fontSize: 'var(--text-sm)', letterSpacing: 'var(--tracking-wider)', color: 'var(--text-secondary)',
    fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' as const,
    padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--hairline-2)', margin: 0,
  },
  empty: {
    padding: 'var(--space-6)', color: 'var(--text-secondary)',
    fontSize: 'var(--text-base)', lineHeight: 'var(--leading-normal)',
  },
  list: { listStyle: 'none', padding: 0, margin: 0 },
  item: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
    padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--hairline-2)',
    fontSize: 'var(--text-base)',
  },
  itemMeta: { fontSize: 'var(--text-xs)', color: 'var(--text-secondary)' },
  removeBtn: {
    background: 'transparent', border: 'none', color: 'var(--text-secondary)',
    cursor: 'pointer', fontSize: 14, padding: '0 var(--space-1-5)',
  },

  alert: {
    padding: 'var(--space-3) var(--space-4)', borderBottom: '1px solid var(--hairline-2)',
  },
  alertHeader: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-1-5)',
    marginBottom: 'var(--space-1)',
  },
  alertTipo: {
    fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wider)', color: 'var(--semantic-warn)',
    fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-semibold)',
  },
  alertTs: { fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', marginLeft: 'auto' },
  alertTitulo: { fontSize: 'var(--text-base)', color: 'var(--text-primary)', marginBottom: 'var(--space-1-5)' },
  alertActions: { display: 'flex', gap: 'var(--space-3)', fontSize: 'var(--text-sm)' },

  link: { color: 'var(--accent-primary)', textDecoration: 'none' },
}
