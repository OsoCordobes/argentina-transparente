/**
 * Comparar.tsx — superficie /comparar (PLAN-UI Módulo #9).
 *
 * Compara 2 empresas lado a lado con métricas idénticas + diff col.
 * Output: URL shareable, agregar a caso, exportar CSV.
 */
import { useEffect, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { EmptyState, LoadingState } from '@/components/argos/primitives'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface MetricasEmpresa {
  cuit: string
  razonSocial: string
  domFiscalProvincia: string | null
  tipoSocietario: string | null
  cantidadContratos: number
  montoTotal: number
  cantidadSenales: number
  primerContratoAnio: number | null
  ultimoContratoAnio: number | null
  jurisdicciones: string[]
  sparkline: Array<{ anio: number; monto: number }>
}

export default function Comparar() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const cuitA = searchParams.get('a') ?? ''
  const cuitB = searchParams.get('b') ?? ''

  const [a, setA] = useState<MetricasEmpresa | null>(null)
  const [b, setB] = useState<MetricasEmpresa | null>(null)
  const [errorA, setErrorA] = useState<string | null>(null)
  const [errorB, setErrorB] = useState<string | null>(null)
  const [shareToast, setShareToast] = useState<string | null>(null)

  useEffect(() => {
    if (!cuitA) { setA(null); return }
    const ac = new AbortController()
    setErrorA(null)
    fetch(`${API_URL}/api/comparar/empresa?cuit=${encodeURIComponent(cuitA)}`, { signal: ac.signal })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { if (!ac.signal.aborted) setA(d) })
      .catch(e => { if (!ac.signal.aborted) setErrorA((e as Error).message) })
    return () => ac.abort()
  }, [cuitA])

  useEffect(() => {
    if (!cuitB) { setB(null); return }
    const ac = new AbortController()
    setErrorB(null)
    fetch(`${API_URL}/api/comparar/empresa?cuit=${encodeURIComponent(cuitB)}`, { signal: ac.signal })
      .then(async r => { if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json() })
      .then(d => { if (!ac.signal.aborted) setB(d) })
      .catch(e => { if (!ac.signal.aborted) setErrorB((e as Error).message) })
    return () => ac.abort()
  }, [cuitB])

  function setSlot(slot: 'a' | 'b', cuit: string | null) {
    const next = new URLSearchParams(searchParams)
    if (cuit) next.set(slot, cuit); else next.delete(slot)
    setSearchParams(next)
  }

  async function shareUrl() {
    // Audit fix EH-W4: feedback fiel al resultado.
    try {
      await navigator.clipboard.writeText(window.location.href)
      setShareToast('URL copiada')
    } catch {
      setShareToast('No se pudo copiar (HTTPS requerido)')
    }
    setTimeout(() => setShareToast(null), 2000)
  }

  function exportCsv() {
    if (!a || !b) return
    const rows = [
      ['Métrica', a.razonSocial, b.razonSocial, 'Diff'],
      ['CUIT', a.cuit, b.cuit, ''],
      ['Razón social', a.razonSocial, b.razonSocial, ''],
      ['Domicilio fiscal', a.domFiscalProvincia ?? '', b.domFiscalProvincia ?? '', ''],
      ['Cantidad contratos', String(a.cantidadContratos), String(b.cantidadContratos), diffNum(a.cantidadContratos, b.cantidadContratos)],
      ['Monto total', String(a.montoTotal), String(b.montoTotal), diffNum(a.montoTotal, b.montoTotal)],
      ['Cantidad señales', String(a.cantidadSenales), String(b.cantidadSenales), diffNum(a.cantidadSenales, b.cantidadSenales)],
      ['Primer contrato', String(a.primerContratoAnio ?? ''), String(b.primerContratoAnio ?? ''), ''],
      ['Último contrato', String(a.ultimoContratoAnio ?? ''), String(b.ultimoContratoAnio ?? ''), ''],
      ['Jurisdicciones', a.jurisdicciones.join('; '), b.jurisdicciones.join('; '), ''],
    ]
    const csv = rows.map(row => row.map(escape).join(',')).join('\n')
    const blob = new Blob([csv], { type: 'text/csv' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url; link.download = `comparar_${a.cuit}_vs_${b.cuit}.csv`
    link.click()
    setTimeout(() => URL.revokeObjectURL(url), 0)
    function escape(s: string) {
      if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`
      }
      return s
    }
  }

  function addToCase() {
    if (!a || !b) return
    // Audit fix FE-W3: usar SPA navigation en lugar de window.location.href
    // (que recargaba la página entera y perdía estado).
    const ids = [a.cuit, b.cuit].join(',')
    navigate(`/casos?adjuntar=${encodeURIComponent(ids)}&kind=pj`)
  }

  // Loading durante comparación = ambos slots tienen cuit pero no terminamos
  // de cargar la métrica de al menos uno (y no hay error en ese slot).
  const loadingComparacion =
    Boolean(cuitA && cuitB) && ((cuitA && !a && !errorA) || (cuitB && !b && !errorB))

  return (
    <ArgosShell title="Comparar · empresa vs empresa">
      <p style={s.subtitle}>
        Comparación lado a lado de dos empresas con métricas idénticas.
        Útil para investigar "X vs Y" — ¿quién recibió más?, ¿en qué
        jurisdicciones?, ¿cuándo empezaron a contratar?
      </p>

        <div style={s.slots}>
          <SlotPicker label="Empresa A" cuit={cuitA} m={a} error={errorA} onPick={c => setSlot('a', c)} />
          <SlotPicker label="Empresa B" cuit={cuitB} m={b} error={errorB} onPick={c => setSlot('b', c)} />
        </div>

        {loadingComparacion && (
          <div style={{
            position: 'relative',
            minHeight: 240,
            background: 'var(--surface-overlay)',
            border: '1px solid var(--hairline-2)',
            borderRadius: 'var(--radius-md)',
            marginBottom: 'var(--space-4)',
          }}>
            <LoadingState mode="overlay" label="Cruzando datos…" />
          </div>
        )}

        {a && b && (
          <>
            <div style={s.actionBar}>
              <button onClick={shareUrl} style={s.bulkBtn}>Copiar URL</button>
              <button onClick={addToCase} style={s.bulkBtn}>+ Caso (ambas)</button>
              <button onClick={exportCsv} style={s.bulkBtn}>↓ Exportar CSV</button>
              {shareToast && (
                <span style={{ fontSize: 'var(--text-sm)', color: 'var(--semantic-success)' }}>
                  {shareToast}
                </span>
              )}
            </div>

            <div style={s.tableWrap}>
              <table style={s.table}>
                <thead>
                  <tr>
                    <th style={s.th}>Métrica</th>
                    <th style={s.th}>{a.razonSocial}</th>
                    <th style={s.th}>{b.razonSocial}</th>
                    <th style={s.th}>Δ</th>
                  </tr>
                </thead>
                <tbody>
                  <Row label="CUIT" a={a.cuit} b={b.cuit} mono />
                  <Row label="Tipo societario" a={a.tipoSocietario ?? '—'} b={b.tipoSocietario ?? '—'} />
                  <Row label="Domicilio fiscal" a={a.domFiscalProvincia ?? '—'} b={b.domFiscalProvincia ?? '—'} />
                  <RowNum label="$ Total contratado" aN={a.montoTotal} bN={b.montoTotal} format={formatPesos} />
                  <RowNum label="# Contratos" aN={a.cantidadContratos} bN={b.cantidadContratos} />
                  <RowNum label="# Señales" aN={a.cantidadSenales} bN={b.cantidadSenales} />
                  <Row label="Primer contrato" a={a.primerContratoAnio ?? '—'} b={b.primerContratoAnio ?? '—'} mono />
                  <Row label="Último contrato" a={a.ultimoContratoAnio ?? '—'} b={b.ultimoContratoAnio ?? '—'} mono />
                  <Row
                    label="Jurisdicciones"
                    a={a.jurisdicciones.join(', ') || '—'}
                    b={b.jurisdicciones.join(', ') || '—'}
                  />
                  <tr style={s.tr}>
                    <td style={s.td}>Evolución 2015–presente</td>
                    <td style={s.td}><SparkInline data={a.sparkline} /></td>
                    <td style={s.td}><SparkInline data={b.sparkline} /></td>
                    <td style={s.td}>{diffSpark(a.sparkline, b.sparkline)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </>
        )}

      {(!a || !b) && !loadingComparacion && (
        <EmptyState
          title="Compará 2 empresas"
          body="Buscá una empresa en cada panel para ver sus diferencias. Compará monto contratado, jurisdicciones, evolución temporal y señales detectadas."
        />
      )}
    </ArgosShell>
  )
}

function Row({ label, a, b, mono = false }: {
  label: string; a: string | number; b: string | number; mono?: boolean
}) {
  const same = String(a) === String(b)
  return (
    <tr style={s.tr}>
      <td style={s.td}>{label}</td>
      <td style={{ ...s.td, ...(mono ? { fontFamily: 'var(--font-mono)' } : null) }}>{a}</td>
      <td style={{ ...s.td, ...(mono ? { fontFamily: 'var(--font-mono)' } : null) }}>{b}</td>
      <td style={{
        ...s.td,
        color: same ? 'var(--text-muted)' : 'var(--text-primary)',
        fontFamily: 'var(--font-mono)',
      }}>
        {same ? '=' : '≠'}
      </td>
    </tr>
  )
}

function RowNum({ label, aN, bN, format }: {
  label: string; aN: number; bN: number; format?: (n: number) => string
}) {
  const f = format ?? ((n: number) => n.toLocaleString('es-AR'))
  const diffStr = diffNum(aN, bN)
  const aMore = aN > bN
  const color = aN === bN ? 'var(--text-muted)' : 'var(--semantic-success)'
  return (
    <tr style={s.tr}>
      <td style={s.td}>{label}</td>
      <td style={{ ...s.td, fontFamily: 'var(--font-mono)' }}>{f(aN)}</td>
      <td style={{ ...s.td, fontFamily: 'var(--font-mono)' }}>{f(bN)}</td>
      <td style={{ ...s.td, color, fontFamily: 'var(--font-mono)' }}>
        {diffStr}{aMore ? ' (A)' : aN < bN ? ' (B)' : ''}
      </td>
    </tr>
  )
}

function SparkInline({ data }: { data: Array<{ anio: number; monto: number }> }) {
  if (!data || data.length === 0) {
    return <span style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>—</span>
  }
  const max = Math.max(...data.map(d => d.monto), 1)
  const blocks = '▁▂▃▄▅▆▇█'
  const chars = data.map(d => blocks[Math.min(blocks.length - 1, Math.floor((d.monto / max) * blocks.length))]).join('')
  return (
    <span
      style={{ fontFamily: 'var(--font-mono)', color: 'var(--semantic-success)' }}
      title={data.map(d => `${d.anio}: ${formatPesos(d.monto)}`).join('\n')}
    >{chars}</span>
  )
}

function SlotPicker({
  label, cuit, m, error, onPick,
}: {
  label: string
  cuit: string
  m: MetricasEmpresa | null
  error: string | null
  onPick: (cuit: string | null) => void
}) {
  const [search, setSearch] = useState('')
  const [results, setResults] = useState<Array<{ cuit: string; label: string }>>([])
  const [lookupError, setLookupError] = useState<string | null>(null)
  useEffect(() => {
    if (search.trim().length < 2) { setResults([]); setLookupError(null); return }
    const ac = new AbortController()
    const t = setTimeout(() => {
      fetch(`${API_URL}/api/comparar/empresas-lookup?q=${encodeURIComponent(search)}`, { signal: ac.signal })
        // Audit fix EH-3: chequear r.ok antes de json() — un 500 con body
        // HTML rompe el parser y caía silenciado al catch.
        .then(async r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`)
          return r.json()
        })
        .then(d => {
          if (ac.signal.aborted) return
          setResults(Array.isArray(d.items) ? d.items : [])
          setLookupError(null)
        })
        .catch(e => {
          if (ac.signal.aborted) return
          setLookupError((e as Error).message || 'error de red')
          setResults([])
        })
    }, 220)
    return () => { clearTimeout(t); ac.abort() }
  }, [search])

  if (m) {
    return (
      <div style={s.slot}>
        <div style={s.slotLabel}>{label}</div>
        <div style={s.slotName}>{m.razonSocial}</div>
        <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
          {m.cuit}
        </div>
        <div style={{ marginTop: 'var(--space-3)', display: 'flex', gap: 'var(--space-1-5)' }}>
          <Link to={`/empresa/${m.cuit}`} style={s.slotLink}>Ver perfil →</Link>
          <button onClick={() => { onPick(null); setSearch('') }} style={s.slotBtn}>cambiar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.slot}>
      <div style={s.slotLabel}>{label}</div>
      {error && <div style={{ ...s.error, marginBottom: 'var(--space-2)' }}>{error}</div>}
      <input
        type="text"
        value={search}
        onChange={e => setSearch(e.target.value)}
        placeholder="Buscar empresa…"
        style={s.input}
      />
      {results.length > 0 && (
        <div style={s.suggestions}>
          {results.map(r => (
            <button
              key={r.cuit}
              onClick={() => { onPick(r.cuit); setSearch('') }}
              style={s.suggestionItem}
            >
              <span style={{ flex: 1 }}>{r.label}</span>
              <span style={s.suggestionId}>{r.cuit}</span>
            </button>
          ))}
        </div>
      )}
      {lookupError && (
        <div style={{ ...s.error, marginTop: 'var(--space-1-5)', fontSize: 'var(--text-sm)' }}>
          Buscador no disponible: {lookupError}
        </div>
      )}
      {cuit && !m && (
        <div style={{ ...s.muted, fontSize: 'var(--text-sm)', marginTop: 'var(--space-1-5)' }}>
          Cargando empresa {cuit}…
        </div>
      )}
    </div>
  )
}

function diffNum(a: number, b: number): string {
  const diff = a - b
  if (diff === 0) return '0'
  const sign = diff > 0 ? '+' : ''
  if (Math.abs(diff) >= 1e9) return `${sign}${(diff / 1e9).toFixed(2).replace('.', ',')} mil M`
  if (Math.abs(diff) >= 1e6) return `${sign}${(diff / 1e6).toFixed(1).replace('.', ',')} M`
  if (Math.abs(diff) >= 1e3) return `${sign}${(diff / 1e3).toFixed(0)} mil`
  return `${sign}${diff}`
}

function diffSpark(a: Array<{ anio: number; monto: number }>, b: Array<{ anio: number; monto: number }>): string {
  if (a.length === 0 && b.length === 0) return '—'
  const totA = a.reduce((s, x) => s + x.monto, 0)
  const totB = b.reduce((s, x) => s + x.monto, 0)
  if (totA === totB) return '='
  return totA > totB ? 'A crece más' : 'B crece más'
}

function formatPesos(n: number): string {
  if (!n || n === 0) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2).replace('.', ',')} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1).replace('.', ',')} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n).toLocaleString('es-AR')}`
}

const s: Record<string, React.CSSProperties> = {
  subtitle: {
    fontSize: 'var(--text-base)', color: 'var(--text-secondary)',
    marginTop: 'var(--space-1-5)', maxWidth: 720, lineHeight: 'var(--leading-normal)',
  },

  slots: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 'var(--space-4)',
    marginBottom: 'var(--space-4)',
  },
  slot: {
    background: 'var(--surface-overlay)', border: '1px solid var(--hairline-2)',
    borderRadius: 'var(--radius-md)', padding: 'var(--space-3)',
    minHeight: 120,
  },
  slotLabel: {
    fontSize: 'var(--text-xs)', color: 'var(--text-secondary)', letterSpacing: 'var(--tracking-wider)',
    fontWeight: 'var(--weight-semibold)', textTransform: 'uppercase' as const,
    marginBottom: 'var(--space-2)',
  },
  slotName: {
    fontSize: 'var(--text-lg)', color: 'var(--text-primary)',
    fontWeight: 'var(--weight-semibold)', marginBottom: 'var(--space-1)',
  },
  slotLink: {
    color: 'var(--accent-primary)', textDecoration: 'none', fontSize: 'var(--text-sm)',
  },
  slotBtn: {
    background: 'transparent', border: '1px solid var(--hairline-2)', color: 'var(--text-secondary)',
    padding: '2px var(--space-2)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)', cursor: 'pointer',
  },
  input: {
    width: '100%', background: 'var(--surface-base)', border: '1px solid var(--hairline-2)',
    color: 'var(--text-primary)', padding: 'var(--space-1-5) var(--space-3)',
    borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-base)',
    boxSizing: 'border-box' as const,
  },
  suggestions: {
    marginTop: 'var(--space-1-5)', background: 'var(--surface-base)',
    border: '1px solid var(--hairline-2)', borderRadius: 'var(--radius-sm)',
    padding: 'var(--space-1)',
  },
  suggestionItem: {
    background: 'transparent', border: 'none', textAlign: 'left' as const,
    width: '100%', padding: 'var(--space-1-5) var(--space-3)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-base)', cursor: 'pointer', color: 'var(--text-primary)',
    display: 'flex', alignItems: 'center',
  },
  suggestionId: {
    color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)',
    fontSize: 'var(--text-xs)', marginLeft: 'var(--space-2)',
  },

  actionBar: {
    display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-3)',
  },
  bulkBtn: {
    background: 'transparent', border: '1px solid var(--hairline-2)', color: 'var(--text-primary)',
    padding: 'var(--space-1) var(--space-3)', borderRadius: 'var(--radius-sm)',
    fontSize: 'var(--text-sm)', cursor: 'pointer',
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
  error: {
    padding: 'var(--space-2)', background: 'color-mix(in oklab, var(--semantic-danger) 22%, var(--surface-base))',
    color: 'var(--semantic-danger)', borderRadius: 'var(--radius-sm)', fontSize: 'var(--text-sm)',
  },
  muted: {
    color: 'var(--text-secondary)', fontSize: 'var(--text-base)',
    padding: 'var(--space-6)', textAlign: 'center' as const,
  },
}
