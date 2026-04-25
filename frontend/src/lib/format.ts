const ARS = new Intl.NumberFormat('es-AR', {
  style: 'currency',
  currency: 'ARS',
  maximumFractionDigits: 0,
})

const COMPACT = new Intl.NumberFormat('es-AR', {
  notation: 'compact',
  maximumFractionDigits: 1,
})

export function fmtARS(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return ARS.format(n)
}

export function fmtCompactARS(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `$${COMPACT.format(n)}`
}

export function fmtNumber(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return new Intl.NumberFormat('es-AR').format(n)
}

export function fmtPct(n: number | null | undefined, fractionDigits = 1): string {
  if (n == null || !Number.isFinite(n)) return '—'
  return `${(n * 100).toFixed(fractionDigits)}%`
}

export function fmtFecha(s: string | null | undefined): string {
  if (!s) return '—'
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return s
  return d.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
