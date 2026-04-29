/**
 * Fuentes.tsx — superficie /fuentes en tema graph-first dark.
 *
 * Reemplaza la versión Phase D (light AppShell) que se borró en el commit
 * de unificación. Mismo endpoint /api/cruce/fuentes; layout coherente con
 * el resto de ARGOS (sidebar dark + grid de cards).
 */
import { useEffect, useState } from 'react'
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

  return (
    <ArgosShell title="Fuentes · procedencia de los datos">
      <p style={s.subtitle}>
        Toda la información de ARGOS lleva su <code style={s.code}>fuente_url</code>{' '}
        al portal oficial. La plataforma no publica nada sin origen verificable
        (CLAUDE.md §4 — trazabilidad).
      </p>

      {error && <div style={s.error}>Error cargando fuentes: {error}</div>}
      {loading && <div style={s.muted}>Cargando…</div>}

      {fuentes && fuentes.length > 0 && (
        <div style={s.grid}>
          {fuentes.map(f => (
            <article key={f.id} style={s.card}>
              <div style={s.cardHead}>
                <h3 style={s.cardTitle}>{f.jurisdiccion}</h3>
                <div style={{ display: 'flex', gap: 6 }}>
                  {f.oficial && <span style={{ ...s.tag, ...s.tagOficial }}>oficial</span>}
                  <span style={{ ...s.tag, ...tagConfianza(f.nivel_confianza) }}>
                    confianza {f.nivel_confianza}
                  </span>
                </div>
              </div>
              <div style={s.cardSub}>
                <span style={{ color: 'var(--text-2)' }}>{tipoLabel(f.tipo)}</span>
                {' · '}
                <span style={{ color: 'var(--text-3)' }}>{f.formato}</span>
              </div>
              <a href={f.url} target="_blank" rel="noreferrer noopener" style={s.urlLink}>
                ↗ {hostname(f.url)}
              </a>
              {f.notas && <p style={s.notas}>{f.notas}</p>}
              <div style={s.meta}>
                {f.licencia && <span>Licencia: <code style={s.code}>{f.licencia}</code></span>}
                {f.frecuencia && <span>Frecuencia: {f.frecuencia}</span>}
                <span>Registrada: {new Date(f.registrado_en).toLocaleDateString('es-AR')}</span>
              </div>
            </article>
          ))}
        </div>
      )}

      {fuentes && fuentes.length === 0 && (
        <div style={s.muted}>Sin fuentes registradas todavía.</div>
      )}
    </ArgosShell>
  )
}

function tipoLabel(t: string): string {
  if (t === 'api_estructurada') return 'API estructurada'
  if (t === 'scraping') return 'Scraping'
  if (t === 'pdf_ocr') return 'PDF / OCR'
  return t
}

function hostname(url: string): string {
  try { return new URL(url).hostname } catch { return url }
}

function tagConfianza(nivel: string): React.CSSProperties {
  if (nivel === 'alto') return { background: 'rgba(74,222,128,0.12)', color: '#4ADE80', borderColor: 'rgba(74,222,128,0.3)' }
  if (nivel === 'medio') return { background: 'rgba(245,181,68,0.12)', color: '#F5B544', borderColor: 'rgba(245,181,68,0.3)' }
  return { background: 'rgba(229,72,77,0.12)', color: '#E5484D', borderColor: 'rgba(229,72,77,0.3)' }
}

const s: Record<string, React.CSSProperties> = {
  subtitle: { fontSize: 13, color: 'var(--text-2)', maxWidth: 640, marginBottom: 28, lineHeight: 1.6 },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fill, minmax(360px, 1fr))',
    gap: 16,
  },
  card: {
    background: 'rgba(255,255,255,0.025)',
    border: '1px solid var(--stroke)',
    borderRadius: 8,
    padding: 18,
    display: 'flex',
    flexDirection: 'column' as const,
    gap: 10,
  },
  cardHead: { display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 },
  cardTitle: { fontSize: 14, fontWeight: 600, color: 'var(--text)', margin: 0 },
  cardSub: { fontSize: 12 },
  urlLink: {
    color: 'var(--celeste)',
    textDecoration: 'none',
    fontSize: 12,
    fontFamily: 'JetBrains Mono, monospace',
    wordBreak: 'break-all' as const,
  },
  notas: { fontSize: 12, color: 'var(--text-2)', margin: 0, lineHeight: 1.5 },
  meta: {
    fontSize: 11, color: 'var(--text-3)', display: 'flex', flexWrap: 'wrap' as const, gap: 14,
    paddingTop: 8, borderTop: '1px solid var(--stroke)',
  },
  tag: {
    fontSize: 10, padding: '2px 7px', borderRadius: 999,
    border: '1px solid var(--stroke)', textTransform: 'uppercase' as const, letterSpacing: 0.5,
  },
  tagOficial: { background: 'rgba(111,184,232,0.12)', color: '#6FB8E8', borderColor: 'rgba(111,184,232,0.3)' },
  code: {
    fontFamily: 'JetBrains Mono, monospace',
    fontSize: 11, padding: '1px 6px',
    background: 'rgba(255,255,255,0.04)', borderRadius: 3,
    color: 'var(--celeste)',
  },
  muted: { color: 'var(--text-3)', fontSize: 13, padding: 24, textAlign: 'center' as const },
  error: { padding: 14, background: 'rgba(229,72,77,0.1)', color: '#E5484D', borderRadius: 4, marginBottom: 16 },
}
