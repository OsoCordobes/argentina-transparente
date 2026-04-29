/**
 * ProfileShared.tsx — componentes y helpers compartidos entre /persona/:dni
 * y /empresa/:cuit. Review iteración #1 sobre Stub-4/Stub-5.
 *
 * Antes: Persona.tsx y Empresa.tsx duplicaban ~150 líneas idénticas:
 *   - Section, EmptyState, Table, SourceLink, StubFooter components
 *   - rowStyle, cellStyle, linkStyle constants
 *   - formatDNI, formatPesos, humanJurisdiccion, humanProvincia,
 *     humanVigencia, formatFecha, severidadColor helpers
 *
 * Ahora: una sola fuente de verdad. Cualquier ajuste de estética del
 * Profile (cambio de paleta, formato de fechas, etc.) se propaga a las
 * dos páginas con un solo Edit.
 */
import React from 'react'
import type { ArgosSeveridad } from '@/lib/argos/types'

// ─── Layout components ──────────────────────────────────────────────────────

export function Section({
  title,
  emptyText,
  children,
}: {
  title: string
  emptyText?: string
  children: React.ReactNode
}) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: '#7c8aa3', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>
        {title}
      </h2>
      {children ?? <EmptyState text={emptyText ?? '—'} />}
    </section>
  )
}

export function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13, color: '#5a6478', padding: '16px 0', fontStyle: 'italic' }}>
      {text}
    </div>
  )
}

export function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', background: '#171b24', border: '1px solid #232938', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '1px solid #232938',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#7c8aa3',
                  fontWeight: 600,
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export const rowStyle: React.CSSProperties = { borderBottom: '1px solid #1c2230' }
export const cellStyle: React.CSSProperties = { padding: '10px 12px', color: '#dde3ee', verticalAlign: 'top' }
export const linkStyle: React.CSSProperties = { color: '#5a8ad6', textDecoration: 'none', fontWeight: 500 }

export function SourceLink({ url, text }: { url: string; text?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      style={{ color: '#5a8ad6', textDecoration: 'none', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
    >
      {text ?? '↗ ver'}
    </a>
  )
}

export function StubFooter({ apiHint, fixturesHint }: { apiHint: string; fixturesHint: string }) {
  return (
    <footer style={{ marginTop: 40, padding: '16px 0', borderTop: '1px solid #1f2532', fontSize: 11, color: '#5a6478' }}>
      ⓘ Datos sintéticos del stub Profile ({fixturesHint}). En Fase D se reemplazan por
      <code style={{ margin: '0 4px', padding: '1px 4px', background: '#171b24', borderRadius: 2 }}>{apiHint}</code>
      cuando termine el backfill DNI de Fase A4-A5.
    </footer>
  )
}

// ─── Format helpers ─────────────────────────────────────────────────────────

/** Formatea DNI con puntos cada 3 dígitos. "12345678" → "12.345.678" */
export function formatDNI(dni: string): string {
  return dni.replace(/(\d)(?=(\d{3})+$)/g, '$1.')
}

/** Formatea monto en ARS con sufijos K/M para legibilidad. */
export function formatPesos(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)} K`
  return `$${n.toLocaleString('es-AR')}`
}

/** Mapea código de jurisdicción a nombre humano. */
export function humanJurisdiccion(j: string): string {
  const map: Record<string, string> = {
    'cordoba-capital': 'Córdoba Capital',
    'cordoba-provincia': 'Provincia de Córdoba',
    'nacion': 'Gobierno Nacional',
  }
  return map[j] ?? j
}

/** Mapea provincia a nombre humano (resuelve CABA, abreviatura BA, etc.). */
export function humanProvincia(p: string): string {
  const map: Record<string, string> = {
    'CORDOBA': 'Córdoba',
    'CIUDAD AUTONOMA DE BUENOS AIRES': 'CABA',
    'BUENOS AIRES': 'Buenos Aires',
  }
  return map[p] ?? p
}

/** Renderiza vigencia "desde → hasta" con texto humano. */
export function humanVigencia(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return '—'
  const d = desde ? formatFecha(desde) : '?'
  const h = hasta ? formatFecha(hasta) : 'vigente'
  return `${d} → ${h}`
}

/** Formatea fecha ISO YYYY-MM-DD a "Mes-AAAA". Acepta solo año si es lo único. */
export function formatFecha(iso: string): string {
  if (/^\d{4}$/.test(iso)) return iso
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { year: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

/** Color de severidad para barras laterales y badges de señal. */
export function severidadColor(s: ArgosSeveridad): string {
  return s === 'grave' ? '#e25656' : s === 'moderada' ? '#f5b544' : '#9aa5bb'
}
