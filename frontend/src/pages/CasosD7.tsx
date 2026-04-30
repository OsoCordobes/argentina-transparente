/**
 * CasosD7.tsx — lista de casos del usuario en localStorage (PLAN-UI D7).
 *
 * También maneja la query ?adjuntar=ids&kind=signals|pf|pj que viene
 * desde otros módulos para anexar material a un caso existente o uno nuevo.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { EmptyStateForensic } from '@/components/argos/forensic/EmptyStateForensic'
import {
  getCasos, newCaso, saveCaso, deleteCaso, exportCaso, importCaso,
  type CasoLS,
} from '@/lib/argos/caso-storage'

export default function CasosD7() {
  const [searchParams, setSearchParams] = useSearchParams()
  const [casos, setCasos] = useState<CasoLS[]>([])
  const [showImport, setShowImport] = useState(false)
  const [importText, setImportText] = useState('')
  const [importError, setImportError] = useState<string | null>(null)
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

  return (
    <ArgosShell title="Expedientes · workspace local">
      <p style={s.subtitle}>
        Workspace local para armar denuncias. Cada caso es un JSON en
        tu navegador (no comparte cross-device).
      </p>

        {adjuntarIds && (
          <div style={s.attachBanner}>
            <span style={{ fontSize: 12, color: '#62C7A0' }}>
              Adjuntar {adjuntarIds.split(',').length} elemento{adjuntarIds.split(',').length === 1 ? '' : 's'}
              {' '}({adjuntarKind}) a un caso:
            </span>
            <button onClick={createCaso} style={s.bulkBtn}>+ Crear caso nuevo</button>
            <button onClick={() => setSearchParams({})} style={s.bulkBtn}>Cancelar</button>
          </div>
        )}

        <div style={s.actions}>
          <button onClick={() => createCaso()} style={s.primaryBtn}>+ Nuevo caso</button>
          <button onClick={() => setShowImport(!showImport)} style={s.bulkBtn}>Importar JSON</button>
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
            <div style={{ display: 'flex', gap: 8 }}>
              <button onClick={handleImport} style={s.primaryBtn}>Importar</button>
              <button onClick={() => { setShowImport(false); setImportText(''); setImportError(null) }} style={s.bulkBtn}>Cancelar</button>
            </div>
          </div>
        )}

        {casos.length === 0 && (
          <EmptyStateForensic
            eyebrow="EXPEDIENTES · 0 ABIERTOS"
            title="Cuando una señal merece investigación, abrís un expediente."
            body="Un expediente agrupa nodos, señales, fuentes y notas en un sumario citable. Quedan acá hasta que los archives o los exportes como PDF court-ready."
            primaryAction={
              <button onClick={() => createCaso()} className="fx-btn-primary">
                + ABRIR EXPEDIENTE
              </button>
            }
            secondaryAction={
              <button onClick={() => setShowImport(!showImport)} className="fx-btn-subtle">
                IMPORTAR JSON
              </button>
            }
          />
        )}

      {casos.length > 0 && (
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
              {casos.map(c => (
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
                    <td style={{ ...s.td, fontSize: 11, color: '#9BA3B4', fontFamily: 'ui-monospace, monospace' }}>
                      {c.senalIds.length} señales · {c.entidadCuits.length} PJ · {c.personaDnis.length} PF
                    </td>
                    <td style={{ ...s.td, fontSize: 11, color: '#9BA3B4' }}>
                      {new Date(c.modificadoEn).toLocaleString('es-AR')}
                    </td>
                    <td style={s.td}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button onClick={() => downloadCaso(c)} style={s.tinyBtn} title="Exportar como JSON">
                          ↓
                        </button>
                        <button onClick={() => handleDelete(c.id)} style={{ ...s.tinyBtn, color: '#E25656' }} title="Eliminar">
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
  const c = e === 'borrador' ? '#9BA3B4' : e === 'listo' ? '#F5B544' : '#62C7A0'
  return { background: c + '22', color: c, borderColor: c }
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

  attachBanner: {
    display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px',
    background: '#161b22', border: '1px solid #62C7A0', borderRadius: 4, marginBottom: 14,
  },
  actions: { display: 'flex', gap: 8, marginBottom: 16 },

  importBox: {
    background: '#161b22', border: '1px solid #2a3140', padding: 14, borderRadius: 4,
    marginBottom: 16,
  },
  textarea: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: 10, borderRadius: 3, fontSize: 12,
    fontFamily: 'ui-monospace, monospace', boxSizing: 'border-box' as const,
    marginBottom: 8, resize: 'vertical' as const,
  },

  empty: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: 32, textAlign: 'center' as const,
  },
  primaryBtn: {
    background: '#62C7A022', border: '1px solid #62C7A0', color: '#62C7A0',
    padding: '6px 14px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
  },
  bulkBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#dde3ee',
    padding: '6px 12px', borderRadius: 3, fontSize: 12, cursor: 'pointer',
  },
  tinyBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#9BA3B4',
    width: 24, height: 24, borderRadius: 3, fontSize: 14, cursor: 'pointer',
    padding: 0,
  },

  tableWrap: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4, overflow: 'hidden',
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
  tdSub: { fontSize: 11, color: '#9BA3B4', marginTop: 2 },
  link: { color: '#dde3ee', textDecoration: 'none' },
  linkBtn: {
    background: 'transparent', border: 'none', color: '#62C7A0',
    cursor: 'pointer', fontFamily: 'inherit', fontSize: 'inherit', padding: 0,
  },
  estadoBadge: {
    fontSize: 10, padding: '2px 7px', borderRadius: 3, border: '1px solid',
    fontWeight: 600, letterSpacing: 0.5,
  },
  error: { padding: 8, background: '#3a1d1d', color: '#E25656', borderRadius: 3, fontSize: 11, marginBottom: 8 },
}
