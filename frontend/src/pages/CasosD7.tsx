/**
 * CasosD7.tsx — "Mis casos": lista local de investigaciones del usuario.
 *
 * Cada caso es un workspace en localStorage que agrupa señales, personas
 * y empresas con notas, hasta que el usuario lo exporta como denuncia PDF
 * o JSON portable. (Histórico: la pestaña se llamó "Expedientes" hasta
 * 2026-04-30; rebranded a "Mis casos" porque era jerga de fiscalía y
 * confundía a usuarios civiles.)
 *
 * También maneja la query ?adjuntar=ids&kind=signals|pf|pj que viene
 * desde otros módulos para anexar material a un caso existente o uno nuevo.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { EmptyState } from '@/components/argos/primitives'
import {
  getCasos, newCaso, saveCaso, deleteCaso, exportCaso, importCaso,
  type CasoLS,
} from '@/lib/argos/caso-storage'

type SortKey = 'modificado' | 'titulo' | 'creado'

export default function CasosD7() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [casos, setCasos] = useState<CasoLS[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
  const [filtro, setFiltro] = useState('')
  const [sortKey, setSortKey] = useState<SortKey>('modificado')
  const navigate = useNavigate()

  useEffect(() => {
    const refresh = () => setCasos(getCasos())
    refresh()
    window.addEventListener('argos:casos-changed', refresh)
    return () => window.removeEventListener('argos:casos-changed', refresh)
  }, [])

  const adjuntarIds = searchParams.get('adjuntar')
  const adjuntarKind = searchParams.get('kind') as 'signals' | 'pf' | 'pj' | null

  function attachAndOpen(c: CasoLS) {
    if (!adjuntarIds || !adjuntarKind) return
    const ids = adjuntarIds.split(',').filter(Boolean)
    const next = { ...c }
    if (adjuntarKind === 'signals') {
      next.senalIds = Array.from(new Set([...next.senalIds, ...ids]))
    } else if (adjuntarKind === 'pf') {
      next.personaDnis = Array.from(new Set([...next.personaDnis, ...ids]))
    } else if (adjuntarKind === 'pj') {
      next.entidadCuits = Array.from(new Set([...next.entidadCuits, ...ids]))
    }
    saveCaso(next)
    // Limpiar query params y navegar al caso
    setSearchParams({})
    navigate(`/caso/${c.id}`)
  }

  function createCaso() {
    const ids = adjuntarIds ? adjuntarIds.split(',').filter(Boolean) : []
    const seed: Partial<CasoLS> = {
      titulo: ids.length > 0 ? `Caso (${ids.length} elementos)` : 'Nuevo caso',
    }
    if (adjuntarKind === 'signals') seed.senalIds = ids
    else if (adjuntarKind === 'pf') seed.personaDnis = ids
    else if (adjuntarKind === 'pj') seed.entidadCuits = ids
    const c = newCaso(seed)
    saveCaso(c)
    setSearchParams({})
    navigate(`/caso/${c.id}`)
  }

  function handleDelete(id: string) {
    if (!confirm('¿Eliminar este caso? La acción no se puede deshacer.')) return
    deleteCaso(id)
  }

  function handleImport() {
    setImportError(null)
    const c = importCaso(importText)
    if (!c) {
      setImportError('JSON inválido o no es un caso ARGOS')
      return
    }
    saveCaso(c)
    setShowImport(false); setImportText('')
  }

  function downloadCaso(c: CasoLS) {
    const blob = new Blob([exportCaso(c)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `${c.titulo.replace(/[^\w]+/g, '_')}.argos-caso.json`
    a.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
  }

  // Lista filtrada + ordenada para la tabla.
  const casosListados = useMemo(() => {
    const q = filtro.trim().toLowerCase()
    const base = q
      ? casos.filter(c =>
          c.titulo.toLowerCase().includes(q) ||
          (c.descripcion ?? '').toLowerCase().includes(q),
        )
      : casos
    const sorted = [...base]
    if (sortKey === 'titulo') {
      sorted.sort((a, b) => a.titulo.localeCompare(b.titulo, 'es'))
    } else if (sortKey === 'creado') {
      sorted.sort((a, b) => new Date(b.creadoEn).getTime() - new Date(a.creadoEn).getTime())
    } else {
      sorted.sort((a, b) => new Date(b.modificadoEn).getTime() - new Date(a.modificadoEn).getTime())
    }
    return sorted
  }, [casos, filtro, sortKey])

  return (
    <ArgosShell title="Mis casos">
      <p style={s.subtitle}>
        Workspace local para armar tus investigaciones. Cada caso agrupa
        señales, personas y empresas con tus notas. Vive en tu navegador
        hasta que lo exportás como denuncia PDF o JSON portable.
      </p>

        {adjuntarIds && (
          <div style={s.attachBanner}>
            <span style={{ fontSize: 'var(--text-base)', color: 'var(--semantic-success)' }}>
              Adjuntar {adjuntarIds.split(',').length} elemento{adjuntarIds.split(',').length === 1 ? '' : 's'}
              {' '}({adjuntarKind}) a un caso:
            </span>
            <button onClick={createCaso} className="fx-btn-subtle">+ Crear caso nuevo</button>
            <button onClick={() => setSearchParams({})} className="fx-btn-subtle">Cancelar</button>
          </div>
        )}

        <div style={s.actions}>
          <button onClick={() => createCaso()} className="fx-btn-primary">+ Nuevo caso</button>
          <button onClick={() => setShowImport(!showImport)} className="fx-btn-subtle">Importar JSON</button>
          {casos.length > 0 && (
            <>
              <input
                type="search"
                placeholder="Buscar caso…"
                value={filtro}
                onChange={e => setFiltro(e.target.value)}
                style={s.searchInput}
              />
              <select
                value={sortKey}
                onChange={e => setSortKey(e.target.value as SortKey)}
                style={s.sortSelect}
                aria-label="Ordenar"
              >
                <option value="modificado">Modificado ↓</option>
                <option value="creado">Creado ↓</option>
                <option value="titulo">Título A→Z</option>
              </select>
            </>
          )}
        </div>

        {showImport && (
          <div style={s.importBox}>
            <textarea
              value={importText}
              onChange={e => setImportText(e.target.value)}
              placeholder="Pegá aquí el JSON exportado…"
              rows={6}
              style={s.textarea}
            />
            {importError && <div style={s.error}>{importError}</div>}
            <div style={{ display: 'flex', gap: 'var(--space-2)' }}>
              <button onClick={handleImport} className="fx-btn-primary">Importar</button>
              <button onClick={() => { setShowImport(false); setImportText(''); setImportError(null) }} className="fx-btn-subtle">Cancelar</button>
            </div>
          </div>
        )}

        {casos.length === 0 && (
          <EmptyState
            eyebrow="MIS CASOS · 0 ABIERTOS"
            title="Cuando una señal merece investigación, abrís un caso."
            body="Un caso agrupa señales, empresas, personas y tus notas en un sumario citable. Vive acá hasta que lo exportes como denuncia PDF o JSON portable."
            primaryAction={
              <button onClick={() => createCaso()} className="fx-btn-primary">
                + ABRIR CASO
              </button>
            }
            secondaryAction={
              <button onClick={() => setShowImport(!showImport)} className="fx-btn-subtle">
                IMPORTAR JSON
              </button>
            }
          />
        )}

        {casos.length > 0 && casosListados.length === 0 && (
          <EmptyState
            eyebrow="0 RESULTADOS"
            title="Ningún caso coincide con la búsqueda"
            body={`No hay casos que coincidan con "${filtro}". Probá con otra palabra o limpiá el filtro.`}
            secondaryAction={
              <button onClick={() => setFiltro('')} className="fx-btn-subtle">
                Limpiar filtro
              </button>
            }
          />
        )}

      {casosListados.length > 0 && (
        <div style={s.tableWrap}>
          <table style={s.table}>
            <thead>
              <tr>
                <th style={s.th}>Título</th>
                <th style={s.th}>Estado</th>
                <th style={s.th}>Material</th>
                <th style={s.th}>Modificado</th>
                <th style={s.th}>Acciones</th>
              </tr>
            </thead>
            <tbody>
              {casosListados.map(c => (
                  <tr key={c.id} style={s.tr}>
                    <td style={s.td}>
                      {adjuntarIds ? (
                        <button onClick={() => attachAndOpen(c)} style={s.linkBtn}>
                          {c.titulo}
                        </button>
                      ) : (
                        <Link to={`/caso/${c.id}`} style={s.link}>{c.titulo}</Link>
                      )}
                      {c.descripcion && <div style={s.tdSub}>{c.descripcion.slice(0, 80)}</div>}
                    </td>
                    <td style={s.td}>
                      <span style={{ ...s.estadoBadge, ...estadoStyle(c.estado) }}>
                        {estadoLabel(c.estado)}
                      </span>
                    </td>
                    <td style={{ ...s.td, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
                      {c.senalIds.length} señales · {c.entidadCuits.length} PJ · {c.personaDnis.length} PF
                    </td>
                    <td style={{ ...s.td, fontSize: 'var(--text-sm)', color: 'var(--text-secondary)' }}>
                      {new Date(c.modificadoEn).toLocaleString('es-AR')}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 'var(--space-1-5)' }}>
                        <button onClick={() => downloadCaso(c)} style={s.tinyBtn} title="Exportar como JSON">
                          ↓
                        </button>
                        <button onClick={() => handleDelete(c.id)} style={{ ...s.tinyBtn, color: 'var(--semantic-danger)' }} title="Eliminar">
                          ×
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      )}
    </ArgosShell>
  )
}

function estadoLabel(e: CasoLS['estado']): string {
  return e === 'borrador' ? 'Borrador' : e === 'listo' ? 'Listo' : 'Generado'
}

function estadoStyle(e: CasoLS['estado']): React.CSSProperties {
  const c =
    e === 'borrador'
      ? 'var(--text-secondary)'
      : e === 'listo'
        ? 'var(--semantic-warn)'
        : 'var(--semantic-success)'
  // Background usa color-mix para que matchee la transparencia ~13% del original (#xx22).
  return {
    background: `color-mix(in oklab, ${c} 13%, transparent)`,
    color: c,
    borderColor: c,
  }
}

const s: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: 'var(--surface-base)', color: 'var(--text-primary)',
    fontFamily: 'var(--font-sans)',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: 'var(--space-6)' },
  head: { marginBottom: 'var(--space-5)', paddingBottom: 'var(--space-4)', borderBottom: '1px solid var(--hairline-2)' },
  h1: { fontSize: 'var(--text-xl)', margin: 0, color: 'var(--text-primary)', fontWeight: 'var(--weight-semibold)' },
  subtitle: { fontSize: 'var(--text-base)', color: 'var(--text-secondary)', marginTop: 'var(--space-1-5)', maxWidth: 720 },

  attachBanner: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', padding: 'var(--space-3) var(--space-3)',
    background: 'var(--surface-overlay)', border: '1px solid var(--semantic-success)',
    borderRadius: 'var(--radius-md)', marginBottom: 'var(--space-3)',
  },
  actions: {
    display: 'flex', gap: 'var(--space-2)', marginBottom: 'var(--space-4)', alignItems: 'center',
    flexWrap: 'wrap' as const,
  },
  searchInput: {
    background: 'var(--surface-base)', border: '1px solid var(--hairline-2)', color: 'var(--text-primary)',
    padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)',
    fontFamily: 'inherit', minWidth: 220, marginLeft: 'auto',
  },
  sortSelect: {
    background: 'var(--surface-base)', border: '1px solid var(--hairline-2)', color: 'var(--text-primary)',
    padding: 'var(--space-1-5) var(--space-2)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)',
    cursor: 'pointer',
  },

  importBox: {
    background: 'var(--surface-overlay)', border: '1px solid var(--hairline-2)',
    padding: 'var(--space-3)', borderRadius: 'var(--radius-md)',
    marginBottom: 'var(--space-4)',
  },
  textarea: {
    width: '100%', background: 'var(--surface-base)', border: '1px solid var(--hairline-2)',
    color: 'var(--text-primary)', padding: 'var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)',
    fontFamily: 'var(--font-mono)', boxSizing: 'border-box' as const,
    marginBottom: 'var(--space-2)', resize: 'vertical' as const,
  },

  empty: {
    background: 'var(--surface-overlay)', border: '1px solid var(--hairline-2)', borderRadius: 'var(--radius-md)',
    padding: 'var(--space-8)', textAlign: 'center' as const,
  },
  primaryBtn: {
    background: 'color-mix(in oklab, var(--semantic-success) 13%, transparent)',
    border: '1px solid var(--semantic-success)', color: 'var(--semantic-success)',
    padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)', cursor: 'pointer',
  },
  bulkBtn: {
    background: 'transparent', border: '1px solid var(--hairline-2)', color: 'var(--text-primary)',
    padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)',
    cursor: 'pointer',
  },
  tinyBtn: {
    background: 'transparent', border: '1px solid var(--hairline-2)', color: 'var(--text-secondary)',
    width: 24, height: 24, borderRadius: 'var(--radius-sm)', fontSize: 14, cursor: 'pointer',
    padding: 0,
  },

  tableWrap: {
    background: 'var(--surface-overlay)', border: '1px solid var(--hairline-2)',
    borderRadius: 'var(--radius-md)', overflow: 'hidden',
  },
  table: { width: '100%', borderCollapse: 'collapse' as const, fontSize: 'var(--text-base)' },
  th: {
    padding: 'var(--space-3) var(--space-3)', textAlign: 'left' as const,
    fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', letterSpacing: 'var(--tracking-wider)',
    textTransform: 'uppercase' as const, fontWeight: 'var(--weight-semibold)',
    borderBottom: '1px solid var(--hairline-2)',
  },
  tr: { borderBottom: '1px solid var(--hairline-2)' },
  td: { padding: 'var(--space-3) var(--space-3)', color: 'var(--text-primary)' },
  tdSub: { fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', marginTop: 2 },
  link: { color: 'var(--text-primary)', textDecoration: 'none' },
  linkBtn: {
    background: 'transparent', border: 'none', color: 'var(--semantic-success)',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0,
  },
  estadoBadge: {
    fontSize: 'var(--text-xs)', padding: '2px 7px', borderRadius: 'var(--radius-sm)', border: '1px solid',
    fontWeight: 'var(--weight-semibold)', letterSpacing: 0.5,
  },
  error: {
    padding: 'var(--space-2)', background: 'color-mix(in oklab, var(--semantic-danger) 22%, var(--surface-base))',
    color: 'var(--semantic-danger)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)', marginBottom: 'var(--space-2)',
  },
}
