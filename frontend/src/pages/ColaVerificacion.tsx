/**
 * ColaVerificacion.tsx — PLAN-DATOS Fase E2.
 *
 * Cola de "señales para verificación humana". Workflow:
 *   - Lista paginada de señales con badge de estado universal.
 *   - Filtros por estado (sin_verificar default), severidad, tipología.
 *   - Acciones inline por fila: ✓ verificar / ✗ descartar / ⚠ bloquear / ↺ reset.
 *   - Cada acción pregunta "¿quién verifica?" para auditoría — no se procesa
 *     sin auditor identificado (excepto reset que es administrativo).
 *
 * Endpoints consumidos:
 *   GET  /api/cola-verificacion?estado=&severidad=&limit=&offset=
 *   GET  /api/cola-verificacion/resumen
 *   POST /api/cola-verificacion/:id   body {estado, auditor}
 *
 * Diseño visual: alineado con Persona/Empresa stubs (dark forensic).
 */
import { useEffect, useMemo, useState, useCallback } from 'react'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import type { EstadoVerificacionSeñal } from '@/lib/argos/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

type EstadoFiltro = EstadoVerificacionSeñal | 'todas'
type Severidad = 'grave' | 'moderada' | 'leve'

interface SeñalCola {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: Severidad
  estadoVerificacion: EstadoVerificacionSeñal
  verificadoPor: string | null
  verificadoEn: string | null
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: { articulos?: string[]; denunciarAnte?: string[] }
  computadoEn: string
}

interface Resumen {
  porEstadoYSeveridad: Record<EstadoVerificacionSeñal, Record<Severidad, number>>
  totalesPorEstado: Record<EstadoVerificacionSeñal, number>
  totalesPorSeveridad: Record<Severidad, number>
  total: number
}

const PAGE_SIZE = 25

export default function ColaVerificacion() {
  const [estado, setEstado] = useState<EstadoFiltro>('sin_verificar')
  const [severidad, setSeveridad] = useState<Severidad | 'todas'>('todas')
  const [page, setPage] = useState(0)
  const [items, setItems] = useState<SeñalCola[]>([])
  const [total, setTotal] = useState(0)
  const [resumen, setResumen] = useState<Resumen | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [auditor, setAuditor] = useState(() => localStorage.getItem('argos_auditor') ?? '')

  const fetchPagina = useCallback(async () => {
    setLoading(true); setError(null)
    try {
      const params = new URLSearchParams({
        estado,
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      })
      if (severidad !== 'todas') params.set('severidad', severidad)
      const r = await fetch(`${API_URL}/api/cola-verificacion?${params.toString()}`)
      if (!r.ok) throw new Error(`HTTP ${r.status}`)
      const data = await r.json()
      setItems(data.items)
      setTotal(data.paginacion.total)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [estado, severidad, page])

  const fetchResumen = useCallback(async () => {
    try {
      const r = await fetch(`${API_URL}/api/cola-verificacion/resumen`)
      if (!r.ok) return
      const data = await r.json()
      setResumen(data)
    } catch { /* silencioso — resumen es informativo */ }
  }, [])

  useEffect(() => { fetchPagina() }, [fetchPagina])
  useEffect(() => { fetchResumen() }, [fetchResumen])

  // Persistir auditor en localStorage para no preguntarlo en cada acción.
  useEffect(() => { if (auditor) localStorage.setItem('argos_auditor', auditor) }, [auditor])

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  async function aplicarAccion(id: string, nuevoEstado: EstadoVerificacionSeñal) {
    if (nuevoEstado !== 'sin_verificar' && (!auditor || auditor.trim() === '')) {
      alert('Identificate como auditor antes de verificar (campo arriba a la derecha).')
      return
    }
    try {
      const r = await fetch(`${API_URL}/api/cola-verificacion/${encodeURIComponent(id)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ estado: nuevoEstado, auditor }),
      })
      if (!r.ok) {
        const txt = await r.text()
        alert(`Error: ${txt}`)
        return
      }
      await fetchPagina()
      await fetchResumen()
    } catch (e) {
      alert(`Error de red: ${(e as Error).message}`)
    }
  }

  return (
    <div style={s.page}>
      <Header auditor={auditor} setAuditor={setAuditor} resumen={resumen} />
      <Filtros
        estado={estado} setEstado={(e) => { setEstado(e); setPage(0) }}
        severidad={severidad} setSeveridad={(sv) => { setSeveridad(sv); setPage(0) }}
      />
      {error && <div style={s.error}>Error cargando cola: {error}</div>}
      {loading && <div style={s.loading}>Cargando…</div>}
      {!loading && items.length === 0 && (
        <div style={s.empty}>Sin señales que coincidan con los filtros actuales.</div>
      )}
      {items.map(it => (
        <SeñalCard key={it.id} señal={it} onAccion={aplicarAccion} />
      ))}
      <Paginacion page={page} totalPages={totalPages} setPage={setPage} total={total} />
    </div>
  )
}

function Header({ auditor, setAuditor, resumen }: {
  auditor: string
  setAuditor: (s: string) => void
  resumen: Resumen | null
}) {
  return (
    <div style={s.header}>
      <div>
        <h1 style={s.h1}>Cola de verificación</h1>
        <p style={s.subtitle}>
          Señales generadas por los detectores. Verificá DNI/CUIT contra DDJJ/boletín antes
          de marcar como ✓ verificada. Si es homonimia confirmada → ✗ descartada.
        </p>
        {resumen && (
          <div style={s.resumenRow}>
            <Pill label="Sin verificar" n={resumen.totalesPorEstado.sin_verificar} color="#F5B544" />
            <Pill label="Verificadas" n={resumen.totalesPorEstado.verificada} color="#62C7A0" />
            <Pill label="Descartadas" n={resumen.totalesPorEstado.descartada} color="#9BA3B4" />
            <Pill label="Bloqueadas" n={resumen.totalesPorEstado.bloqueada} color="#E25656" />
            <Pill label="Total" n={resumen.total} color="#dde3ee" />
          </div>
        )}
      </div>
      <label style={s.auditorWrap}>
        <span style={s.auditorLabel}>Auditor</span>
        <input
          type="text" value={auditor} onChange={e => setAuditor(e.target.value)}
          placeholder="email@dominio"
          style={s.auditorInput}
        />
      </label>
    </div>
  )
}

function Filtros({ estado, setEstado, severidad, setSeveridad }: {
  estado: EstadoFiltro; setEstado: (e: EstadoFiltro) => void
  severidad: Severidad | 'todas'; setSeveridad: (s: Severidad | 'todas') => void
}) {
  return (
    <div style={s.filtros}>
      <label style={s.filtroLabel}>
        Estado:
        <select value={estado} onChange={e => setEstado(e.target.value as EstadoFiltro)} style={s.select}>
          <option value="sin_verificar">Sin verificar</option>
          <option value="verificada">Verificada</option>
          <option value="descartada">Descartada</option>
          <option value="bloqueada">Bloqueada</option>
          <option value="todas">Todas</option>
        </select>
      </label>
      <label style={s.filtroLabel}>
        Severidad:
        <select value={severidad} onChange={e => setSeveridad(e.target.value as Severidad | 'todas')} style={s.select}>
          <option value="todas">Todas</option>
          <option value="grave">Grave</option>
          <option value="moderada">Moderada</option>
          <option value="leve">Leve</option>
        </select>
      </label>
    </div>
  )
}

function SeñalCard({ señal, onAccion }: {
  señal: SeñalCola
  onAccion: (id: string, e: EstadoVerificacionSeñal) => Promise<void>
}) {
  const sevColor = señal.severidad === 'grave' ? '#E25656'
                 : señal.severidad === 'moderada' ? '#F5B544' : '#9BA3B4'
  return (
    <div style={s.card}>
      <div style={s.cardHead}>
        <div style={s.cardHeadLeft}>
          <span style={{ ...s.severidadBadge, background: sevColor + '22', color: sevColor, borderColor: sevColor }}>
            {señal.severidad.toUpperCase()}
          </span>
          <span style={s.tipologia}>{señal.tipologia}</span>
          <span style={s.score}>score {señal.score}</span>
        </div>
        <VerificacionBadge
          estado={señal.estadoVerificacion}
          verificadoPor={señal.verificadoPor}
          verificadoEn={señal.verificadoEn}
        />
      </div>
      <div style={s.titulo}>{señal.titulo}</div>
      <div style={s.resumen}>{señal.resumen}</div>
      {señal.evidencia.length > 0 && (
        <ul style={s.evidenciaList}>
          {señal.evidencia.slice(0, 3).map((ev, i) => (
            <li key={i} style={s.evidenciaItem}>
              {ev.descripcion}{' '}
              <a href={ev.fuenteUrl} target="_blank" rel="noreferrer noopener" style={s.link}>
                fuente ↗
              </a>
            </li>
          ))}
        </ul>
      )}
      <div style={s.acciones}>
        <Btn label="✓ Verificar" color="#62C7A0" onClick={() => onAccion(señal.id, 'verificada')} disabled={señal.estadoVerificacion === 'verificada'} />
        <Btn label="✗ Descartar" color="#9BA3B4" onClick={() => onAccion(señal.id, 'descartada')} disabled={señal.estadoVerificacion === 'descartada'} />
        <Btn label="⚠ Bloquear" color="#E25656" onClick={() => onAccion(señal.id, 'bloqueada')} disabled={señal.estadoVerificacion === 'bloqueada'} />
        <Btn label="↺ Reset" color="#9BA3B4" onClick={() => onAccion(señal.id, 'sin_verificar')} disabled={señal.estadoVerificacion === 'sin_verificar'} />
      </div>
    </div>
  )
}

function Btn({ label, color, onClick, disabled }: {
  label: string; color: string; onClick: () => void; disabled?: boolean
}) {
  return (
    <button onClick={onClick} disabled={disabled} style={{
      background: disabled ? 'transparent' : color + '22',
      color: disabled ? '#5a6373' : color,
      border: `1px solid ${disabled ? '#3a4150' : color}`,
      padding: '5px 11px',
      borderRadius: 3,
      fontSize: 11,
      cursor: disabled ? 'default' : 'pointer',
      fontWeight: 500,
    }}>{label}</button>
  )
}

function Pill({ label, n, color }: { label: string; n: number; color: string }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#9BA3B4' }}>
      <span style={{ width: 8, height: 8, borderRadius: 4, background: color, display: 'inline-block' }} />
      {label}: <strong style={{ color: '#dde3ee', fontFamily: 'ui-monospace, monospace' }}>{n}</strong>
    </span>
  )
}

function Paginacion({ page, totalPages, setPage, total }: {
  page: number; totalPages: number; setPage: (p: number) => void; total: number
}) {
  return (
    <div style={s.paginacion}>
      <button disabled={page === 0} onClick={() => setPage(page - 1)} style={s.pagBtn}>‹ anterior</button>
      <span style={{ color: '#9BA3B4', fontSize: 12 }}>
        Página {page + 1} de {totalPages} · {total} total
      </span>
      <button disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)} style={s.pagBtn}>siguiente ›</button>
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    background: '#0d1117', color: '#dde3ee', minHeight: '100vh',
    padding: '24px 28px',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  header: { display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 24 },
  h1: { fontSize: 22, margin: '0 0 6px', fontWeight: 600 },
  subtitle: { fontSize: 13, color: '#9BA3B4', maxWidth: 700, margin: 0 },
  resumenRow: { display: 'flex', gap: 16, marginTop: 12, flexWrap: 'wrap' },
  auditorWrap: { display: 'flex', flexDirection: 'column', minWidth: 220 },
  auditorLabel: { fontSize: 10, color: '#9BA3B4', marginBottom: 3, textTransform: 'uppercase', letterSpacing: 0.5 },
  auditorInput: {
    background: '#161b22', border: '1px solid #2a3140', color: '#dde3ee',
    padding: '6px 9px', borderRadius: 3, fontSize: 12,
  },
  filtros: { display: 'flex', gap: 16, marginBottom: 16, paddingBottom: 12, borderBottom: '1px solid #1f2937' },
  filtroLabel: { fontSize: 12, color: '#9BA3B4', display: 'flex', alignItems: 'center', gap: 8 },
  select: {
    background: '#161b22', border: '1px solid #2a3140', color: '#dde3ee',
    padding: '5px 8px', borderRadius: 3, fontSize: 12,
  },
  loading: { padding: 16, color: '#9BA3B4', fontSize: 13 },
  error: { padding: 12, background: '#3a1d1d', color: '#E25656', borderRadius: 4, marginBottom: 12 },
  empty: { padding: 32, textAlign: 'center', color: '#9BA3B4', fontSize: 13 },
  card: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4,
    padding: 14, marginBottom: 10,
  },
  cardHead: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  cardHeadLeft: { display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' },
  severidadBadge: {
    fontSize: 10, padding: '2px 7px', borderRadius: 3, border: '1px solid', fontWeight: 600, letterSpacing: 0.5,
  },
  tipologia: { fontSize: 11, color: '#9BA3B4', fontFamily: 'ui-monospace, monospace' },
  score: { fontSize: 11, color: '#9BA3B4', fontFamily: 'ui-monospace, monospace' },
  titulo: { fontSize: 14, fontWeight: 500, marginBottom: 4 },
  resumen: { fontSize: 12, color: '#9BA3B4', lineHeight: 1.45, marginBottom: 8 },
  evidenciaList: { fontSize: 11, color: '#9BA3B4', margin: '0 0 10px', paddingLeft: 18 },
  evidenciaItem: { marginBottom: 3 },
  link: { color: '#7da3ff', textDecoration: 'none' },
  acciones: { display: 'flex', gap: 6, paddingTop: 8, borderTop: '1px solid #1f2937' },
  paginacion: { display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 16, marginTop: 16, padding: 12 },
  pagBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#9BA3B4',
    padding: '5px 11px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
  },
}
