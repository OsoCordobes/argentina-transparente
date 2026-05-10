/**
 * Fuentes.tsx — V4 forensic. Tabla densa con CÓDIGO/FUENTE/URL/TIER/SINC/REGISTROS/ESTADO.
 *
 * Datos vivos de /api/cruce/fuentes. Mapea la respuesta al shape forense:
 * - código corto: deriva de id (toma primeras letras de cada palabra de id, max 6)
 * - tier: deriva de nivel_confianza (alto=1, medio=2, bajo=3)
 * - estado: ok | stale | manual | (derivado de ultimo_crawl + tipo)
 *
 * Disclaimer top con explicación tier (T1/T2/T3).
 *
 * Wave 3.C — design tokens canónicos + primitives:
 *   - hex/legacy alias → var(--token) canónicos
 *   - LoadingState/EmptyState/ErrorState reemplazan ad-hoc divs
 *   - TierBadge consistente por confianza (en columna TIER)
 *   - health indicator (estado scraper) usa --semantic-success/warn/danger
 */
import { useEffect, useMemo, useState } from 'react'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { EmptyState, LoadingState, ErrorState, TierBadge } from '@/components/argos/primitives'

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

type EstadoTone = 'ok' | 'stale' | 'manual'

function estadoFromTipoSync(tipo: string, ultimoCrawl: string | null, registrado: string): { label: string; tone: EstadoTone } {
  const ref = ultimoCrawl ?? registrado
  if (!ref) return { label: 'MANUAL', tone: 'manual' }
  const days = (Date.now() - new Date(ref).getTime()) / (1000 * 60 * 60 * 24)
  if (tipo === 'scraping' || tipo === 'pdf_ocr') return { label: 'MANUAL', tone: 'manual' }
  if (days < 7) return { label: 'OK', tone: 'ok' }
  return { label: 'STALE', tone: 'stale' }
}

/** Color semántico del health indicator de scraper. */
function estadoColor(tone: EstadoTone): string {
  if (tone === 'ok') return 'var(--semantic-success)'
  if (tone === 'stale') return 'var(--semantic-warn)'
  return 'var(--text-muted)'
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
      <div style={{ margin: 'calc(-1 * var(--space-6)) calc(-1 * var(--space-8)) calc(-1 * var(--space-12))' }}>
        {/* Disclaimer top con explicación tier */}
        <div
          style={{
            padding: 'var(--space-4) var(--space-6)',
            borderBottom: '1px solid var(--hairline-1)',
            background: 'var(--surface-raised)',
            fontSize: 'var(--text-base)',
            color: 'var(--text-secondary)',
            lineHeight: 'var(--leading-normal)',
            fontFamily: 'var(--font-sans)',
          }}
        >
          ARGOS describe lo que cargó.{' '}
          <span style={{ color: 'var(--text-primary)' }}>Toda cifra, vínculo y señal trae link a la fuente original.</span>{' '}
          El tier indica método y verificabilidad:{' '}
          <span style={{ color: 'var(--semantic-success)' }}>T1</span> oficial verificado ·{' '}
          <span style={{ color: 'var(--semantic-warn)' }}>T2</span> oficial inferido ·{' '}
          <span style={{ color: 'var(--semantic-danger)' }}>T3</span> scraped sujeto a revisión.
        </div>

        {error && (
          <div style={{ padding: 'var(--space-4) var(--space-6)' }}>
            <ErrorState
              title="No se pudieron cargar las fuentes"
              detail={error}
              onRetry={() => window.location.reload()}
              compact
            />
          </div>
        )}

        {loading && !error && (
          <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
            <LoadingState mode="block" lines={5} label="Cargando fuentes" />
          </div>
        )}

        {/* Tabla densa */}
        {rows.length > 0 && (
          <div style={{ padding: 'var(--space-5) var(--space-6)' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: 'var(--surface-raised)', borderBottom: '1px solid var(--hairline-1)' }}>
                  {['CÓDIGO', 'JURISDICCIÓN', 'URL', 'TIER', 'ÚLTIMA SINC', 'FORMATO', 'ESTADO'].map((h, i) => (
                    <th
                      key={i}
                      style={{
                        padding: '10px var(--space-4)',
                        fontSize: 9,
                        color: 'var(--text-muted)',
                        letterSpacing: 'var(--tracking-wider)',
                        fontFamily: 'var(--font-mono)',
                        fontWeight: 'var(--weight-medium)',
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
                  <tr key={f.id} style={{ borderBottom: '1px solid var(--hairline-1)' }}>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-secondary)',
                        letterSpacing: 'var(--tracking-wide)',
                      }}
                    >
                      {f.code}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontSize: 'var(--text-base)',
                        color: 'var(--text-primary)',
                        fontFamily: 'var(--font-sans)',
                      }}
                    >
                      {f.jurisdiccion}
                      {f.notas && (
                        <div
                          style={{
                            fontSize: 'var(--text-xs)',
                            color: 'var(--text-muted)',
                            marginTop: 'var(--space-0-5)',
                            fontFamily: 'var(--font-mono)',
                          }}
                        >
                          {f.notas.length > 90 ? f.notas.slice(0, 88) + '…' : f.notas}
                        </div>
                      )}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                      }}
                    >
                      <a
                        href={f.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        style={{ color: 'var(--text-secondary)', textDecoration: 'none' }}
                      >
                        {f.hostname}
                      </a>
                    </td>
                    <td style={{ padding: 'var(--space-3) var(--space-4)' }}>
                      <TierBadge tier={f.tier} size="sm" />
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-secondary)',
                      }}
                    >
                      {f.sinc}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontSize: 'var(--text-sm)',
                        color: 'var(--text-secondary)',
                        fontFamily: 'var(--font-mono)',
                      }}
                    >
                      {f.formato}
                    </td>
                    <td
                      style={{
                        padding: 'var(--space-3) var(--space-4)',
                        fontFamily: 'var(--font-mono)',
                        fontSize: 'var(--text-xs)',
                        color: estadoColor(f.estado.tone),
                        letterSpacing: 'var(--tracking-wide)',
                      }}
                    >
                      <span aria-hidden style={{ marginRight: 'var(--space-1)' }}>●</span>
                      {f.estado.label}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div
              style={{
                marginTop: 'var(--space-4)',
                fontSize: 'var(--text-xs)',
                color: 'var(--text-muted)',
                fontFamily: 'var(--font-mono)',
                letterSpacing: 'var(--tracking-wide)',
              }}
            >
              {rows.length} fuentes registradas · {rows.filter(r => r.tier === 1).length} T1 · {rows.filter(r => r.tier === 2).length} T2 · {rows.filter(r => r.tier === 3).length} T3
            </div>
          </div>
        )}

        {fuentes && fuentes.length === 0 && !error && !loading && (
          <EmptyState
            eyebrow="FUENTES · 0 REGISTRADAS"
            title="Sin fuentes registradas"
            body="Las fuentes se cargan automáticamente al ejecutar los seeds del backend."
          />
        )}
      </div>
    </ArgosShell>
  )
}
