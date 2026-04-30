/**
 * Fuentes.tsx — V4 forensic. Tabla densa con CÓDIGO/FUENTE/URL/TIER/SINC/REGISTROS/ESTADO.
 *
 * Datos vivos de /api/cruce/fuentes. Mapea la respuesta al shape forense:
 * - código corto: deriva de id (toma primeras letras de cada palabra de id, max 6)
 * - tier: deriva de nivel_confianza (alto=1, medio=2, bajo=3)
 * - estado: ok | stale | manual | (derivado de ultimo_crawl + tipo)
 *
 * Disclaimer top con explicación tier (T1/T2/T3).
 */
import { useEffect, useMemo, useState } from 'react'
import { ArgosShell } from '@/components/argos/ArgosShell'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

interface Fuente {
  id: string
  jurisdiccion: string
  tipo: string
  url: string
  formato: string
  oficial: boolean
  licencia: string | null
  frecuencia: string | null
  nivel_confianza: 'alto' | 'medio' | 'bajo' | string
  notas: string | null
  registrado_en: string
  ultimo_crawl: string | null
}

function tierFromConfianza(n: string): 1 | 2 | 3 {
  if (n === 'alto') return 1
  if (n === 'medio') return 2
  return 3
}

function codigoCorto(id: string): string {
  // ej: cordoba-capital-boletin-api → CCBA
  return id
    .split('-')
    .map((s) => s.charAt(0).toUpperCase())
    .join('')
    .slice(0, 6)
}

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function formatSinc(iso: string | null, registrado: string): string {
  const d = iso ?? registrado
  if (!d) return '—'
  try {
    const date = new Date(d)
    return date.toLocaleString('es-AR', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit',
    }).replace(',', '')
  } catch {
    return d
  }
}

function estadoFromTipoSync(tipo: string, ultimoCrawl: string | null, registrado: string): { label: string; tone: 'ok' | 'stale' | 'manual' } {
  const ref = ultimoCrawl ?? registrado
  if (!ref) return { label: 'MANUAL', tone: 'manual' }
  const days = (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24)
  if (tipo === 'scraping' || tipo === 'pdf_ocr') return { label: 'MANUAL', tone: 'manual' }
  if (days < 7) return { label: 'OK', tone: 'ok' }
  return { label: 'STALE', tone: 'stale' }
}

export default function Fuentes() {
  const [fuentes, setFuentes] = useState<Fuente[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const ac = new AbortController()
    fetch(`${API_URL}/api/cruce/fuentes`, { signal: ac.signal })
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json() as Promise<{ ok: boolean; fuentes: Fuente[] }>
      })
      .then(data => setFuentes(data.fuentes))
      .catch(e => { if (!ac.signal.aborted) setError((e as Error).message) })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [])

  const rows = useMemo(() => {
    if (!fuentes) return []
    return fuentes.map((f) => ({
      ...f,
      code: codigoCorto(f.id),
      tier: tierFromConfianza(f.nivel_confianza),
      sinc: formatSinc(f.ultimo_crawl, f.registrado_en),
      estado: estadoFromTipoSync(f.tipo, f.ultimo_crawl, f.registrado_en),
      hostname: hostname(f.url),
    }))
  }, [fuentes])

  return (
    <ArgosShell title="Fuentes · procedencia">
      <div style={{ margin: '-24px -32px -48px' }}>
        {/* Disclaimer top con explicación tier */}
        <div
          style={{
            padding: '18px 26px',
            borderBottom: '1px solid var(--hairline-1)',
            background: 'var(--bg-forensic-1)',
            fontSize: 12.5,
            color: 'var(--text-2)',
            lineHeight: 1.55,
          }}
        >
          ARGOS describe lo que cargó. <span style={{ color: 'var(--text-1)' }}>Toda cifra, vínculo y señal trae link a la fuente original.</span>{' '}
          El tier indica método y verificabilidad:{' '}
          <span style={{ color: 'var(--ok)' }}>T1</span> oficial verificado ·{' '}
          <span style={{ color: 'var(--warn)' }}>T2</span> oficial inferido ·{' '}
          <span style={{ color: 'var(--alarm)' }}>T3</span> scraped sujeto a revisión.
        </div>

        {error && (
          <div style={{ padding: 14, color: 'var(--alarm)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
            Error: {error}
          </div>
        )}
        {loading && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--font-mono)' }}>
            cargando fuentes…
          </div>
        )}

        {/* Tabla densa */}
        {rows.length > 0 && (
          <div style={{ padding: '20px 26px' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--bg-forensic-1)', borderBottom: '1px solid var(--hairline-1)' }}>
                  {['CÓDIGO', 'JURISDICCIÓN', 'URL', 'TIER', 'ÚLTIMA SINC', 'FORMATO', 'ESTADO'].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px 16px',
                        fontSize: 9,
                        color: 'var(--text-3)',
                        letterSpacing: '0.18em',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 500,
                        textAlign: 'left',
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((f) => (
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)', letterSpacing: '0.04em' }}>
                      {f.code}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: 'var(--text-1)' }}>
                      {f.jurisdiccion}
                      {f.notas && (
                        <div style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--font-mono)' }}>
                          {f.notas.length > 90 ? f.notas.slice(0, 88) + '…' : f.notas}
                        </div>
                      )}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--accent-chrome)' }}>
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ color: 'var(--accent-chrome)', textDecoration: 'none' }}
                      >
                        {f.hostname}
                      </a>
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 11,
                        color: f.tier === 1 ? 'var(--ok)' : f.tier === 2 ? 'var(--warn)' : 'var(--alarm)',
                      }}
                    >
                      T{f.tier}
                    </td>
                    <td style={{ padding: '12px 16px', fontFamily: 'var(--font-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                      {f.sinc}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--font-mono)' }}>
                      {f.formato}
                    </td>
                    <td
                      style={{
                        padding: '12px 16px',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 10,
                        color: f.estado.tone === 'ok' ? 'var(--ok)' : f.estado.tone === 'stale' ? 'var(--warn)' : 'var(--text-3)',
                        letterSpacing: '0.06em',
                      }}
                    >
                      ● {f.estado.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div style={{ marginTop: 16, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
              {rows.length} fuentes registradas · {rows.filter(r => r.tier === 1).length} T1 · {rows.filter(r => r.tier === 2).length} T2 · {rows.filter(r => r.tier === 3).length} T3
            </div>
          </div>
        )}

        {fuentes && fuentes.length === 0 && (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)' }}>
            Sin fuentes registradas todavía.
          </div>
        )}
      </div>
    </ArgosShell>
  )
}
