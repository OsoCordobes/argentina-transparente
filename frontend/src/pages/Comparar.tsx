/**
 * Comparar.tsx — superficie /comparar (PLAN-UI Módulo #9).
 *
 * Compara 2 empresas lado a lado con métricas idénticas + diff col.
 * Output: URL shareable, agregar a caso, exportar CSV.
 */
import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams, useNavigate } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'

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

        {a && b && (
          <>
            <div style={s.actionBar}>
              <button onClick={shareUrl} style={s.bulkBtn}>Copiar URL</button>
              <button onClick={addToCase} style={s.bulkBtn}>+ Caso (ambas)</button>
              <button onClick={exportCsv} style={s.bulkBtn}>↓ Exportar CSV</button>
              {shareToast && <span style={{ fontSize: 11, color: '#62C7A0' }}>{shareToast}</span>}
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

      {(!a || !b) && (
        <div style={s.muted}>
          Seleccioná dos empresas (slot A y slot B) para empezar a comparar.
        </div>
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
      <td style={{ ...s.td, ...(mono ? { fontFamily: 'ui-monospace, monospace' } : null) }}>{a}</td>
      <td style={{ ...s.td, ...(mono ? { fontFamily: 'ui-monospace, monospace' } : null) }}>{b}</td>
      <td style={{ ...s.td, color: same ? '#3a4150' : '#dde3ee', fontFamily: 'ui-monospace, monospace' }}>
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
  const color = aN === bN ? '#3a4150' : '#62C7A0'
  return (
    <tr style={s.tr}>
      <td style={s.td}>{label}</td>
      <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{f(aN)}</td>
      <td style={{ ...s.td, fontFamily: 'ui-monospace, monospace' }}>{f(bN)}</td>
      <td style={{ ...s.td, color, fontFamily: 'ui-monospace, monospace' }}>
        {diffStr}{aMore ? ' (A)' : aN < bN ? ' (B)' : ''}
      </td>
    </tr>
  )
}

function SparkInline({ data }: { data: Array<{ anio: number; monto: number }> }) {
  if (!data || data.length === 0) {
    return <span style={{ color: '#3a4150', fontFamily: 'ui-monospace, monospace' }}>—</span>
  }
  const max = Math.max(...data.map(d => d.monto), 1)
  const blocks = '▁▂▃▄▅▆▇█'
  const chars = data.map(d => blocks[Math.min(blocks.length - 1, Math.floor((d.monto / max) * blocks.length))]).join('')
  return (
    <span
      style={{ fontFamily: 'ui-monospace, monospace', color: '#62C7A0' }}
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
        <div style={{ fontSize: 11, color: '#9BA3B4', fontFamily: 'ui-monospace, monospace' }}>
          {m.cuit}
        </div>
        <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
          <Link to={`/empresa/${m.cuit}`} style={s.slotLink}>Ver perfil →</Link>
          <button onClick={() => { onPick(null); setSearch('') }} style={s.slotBtn}>cambiar</button>
        </div>
      </div>
    )
  }

  return (
    <div style={s.slot}>
      <div style={s.slotLabel}>{label}</div>
      {error && <div style={{ ...s.error, marginBottom: 8 }}>{error}</div>}
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
        <div style={{ ...s.error, marginTop: 6, fontSize: 11 }}>
          Buscador no disponible: {lookupError}
        </div>
      )}
      {cuit && !m && (
        <div style={{ ...s.muted, fontSize: 11, marginTop: 6 }}>
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
  page: {
    minHeight: '100vh', display: 'flex', flexDirection: 'column',
    background: '#0d1117', color: '#dde3ee',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
  },
  main: { flex: 1, maxWidth: 1480, width: '100%', margin: '0 auto', padding: '24px' },
  head: { marginBottom: 20, paddingBottom: 14, borderBottom: '1px solid #1f2937' },
  h1: { fontSize: 20, margin: 0, color: '#dde3ee', fontWeight: 600 },
  subtitle: { fontSize: 12, color: '#9BA3B4', marginTop: 6, maxWidth: 720, lineHeight: 1.5 },

  slots: {
    display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 18,
  },
  slot: {
    background: '#161b22', border: '1px solid #2a3140', borderRadius: 4, padding: 14,
    minHeight: 120,
  },
  slotLabel: {
    fontSize: 10, color: '#9BA3B4', letterSpacing: 1.5, fontWeight: 600,
    textTransform: 'uppercase' as const, marginBottom: 8,
  },
  slotName: { fontSize: 16, color: '#dde3ee', fontWeight: 600, marginBottom: 4 },
  slotLink: {
    color: '#7da3ff', textDecoration: 'none', fontSize: 11,
  },
  slotBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#9BA3B4',
    padding: '2px 8px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
  },
  input: {
    width: '100%', background: '#0d1117', border: '1px solid #2a3140',
    color: '#dde3ee', padding: '7px 10px', borderRadius: 3, fontSize: 12,
    boxSizing: 'border-box' as const,
  },
  suggestions: {
    marginTop: 6, background: '#0d1117', border: '1px solid #2a3140',
    borderRadius: 3, padding: 4,
  },
  suggestionItem: {
    background: 'transparent', border: 'none', textAlign: 'left' as const,
    width: '100%', padding: '6px 10px', borderRadius: 3, fontSize: 12,
    cursor: 'pointer', color: '#dde3ee', display: 'flex', alignItems: 'center',
  },
  suggestionId: { color: '#9BA3B4', fontFamily: 'ui-monospace, monospace', fontSize: 10, marginLeft: 8 },

  actionBar: {
    display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  bulkBtn: {
    background: 'transparent', border: '1px solid #2a3140', color: '#dde3ee',
    padding: '5px 12px', borderRadius: 3, fontSize: 11, cursor: 'pointer',
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
  td: { padding: '10px 12px', color: '#dde3ee' },
  error: { padding: 8, background: '#3a1d1d', color: '#E25656', borderRadius: 3, fontSize: 11 },
  muted: { color: '#9BA3B4', fontSize: 13, padding: 24, textAlign: 'center' as const },
}
