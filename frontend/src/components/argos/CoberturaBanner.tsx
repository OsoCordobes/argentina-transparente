/**
 * CoberturaBanner.tsx — W5: banner de cobertura monetaria por jurisdicción/repartición.
 *
 * Muestra al usuario qué porción del gasto declarado oficialmente está
 * efectivamente trazado por ARGOS contra fuentes verificables.
 *
 * Niveles:
 *   - alta  (≥90%) — verde
 *   - media (70-89%) — amarillo
 *   - baja  (<70%) — rojo
 *
 * El banner aparece en cada ficha (Reparticion, Empresa) para que el
 * usuario sepa que NO está mirando "todo el gasto" sino "lo que pudimos
 * trazar". Cumple CLAUDE.md §5 — distinguir "señal detectada" de "evidencia
 * total".
 */

import { useCobertura, type CoberturaResponse } from '@/lib/queries'

interface Props {
  jurisdiccion: string
  reparticion?: string                 // si quieren scope reparticion-específico
  className?: string
}

const NIVELES = {
  alta:  { color: '#62C7A0', bg: '#62C7A018', label: 'Cobertura alta' },
  media: { color: '#F5B544', bg: '#F5B54418', label: 'Cobertura parcial' },
  baja:  { color: '#E85D75', bg: '#E85D7518', label: 'Cobertura baja' },
} as const

function formatARS(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}MM`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${Math.round(n)}`
}

export function CoberturaBanner({ jurisdiccion, reparticion, className }: Props) {
  const { data, isLoading } = useCobertura(jurisdiccion, reparticion)

  if (isLoading) {
    return (
      <div
        className={className}
        style={{
          padding: 8,
          background: '#1A1F2E',
          borderRadius: 4,
          fontSize: 11,
          color: '#9BA3B4',
        }}
        role="status"
        aria-busy="true"
      >
        Calculando cobertura...
      </div>
    )
  }

  if (!data || data.error) {
    return null  // no banner si no hay datos
  }

  return <CoberturaBannerView data={data} className={className} />
}

// Vista pura — útil para reuso y para tests sin hook.
export function CoberturaBannerView({ data, className }: { data: CoberturaResponse; className?: string }) {
  const cfg = NIVELES[data.nivel]
  const pct = Math.round(data.pct_cobertura * 100)
  const widthPct = Math.min(100, Math.max(0, pct))

  return (
    <div
      className={className}
      role="region"
      aria-label="Cobertura de datos"
      style={{
        padding: 12,
        background: cfg.bg,
        border: `1px solid ${cfg.color}66`,
        borderRadius: 6,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 8, marginBottom: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: cfg.color }}>
          {cfg.label} · {pct}%
        </span>
        <span style={{ fontSize: 11, color: '#9BA3B4' }}>
          {formatARS(data.monto_trazado)} de {formatARS(data.monto_declarado_oficial)}
        </span>
      </div>

      {/* Barra de progreso */}
      <div
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        style={{ height: 6, background: '#0F1320', borderRadius: 3, overflow: 'hidden' }}
      >
        <div
          style={{
            height: '100%',
            width: `${widthPct}%`,
            background: cfg.color,
            transition: 'width 200ms ease',
          }}
        />
      </div>

      {/* Huecos principales (top 3 reparticiones con peor cobertura) */}
      {data.huecos_principales && data.huecos_principales.length > 0 && (
        <div style={{ marginTop: 8, fontSize: 11, color: '#9BA3B4' }}>
          <strong style={{ color: '#E8ECF5' }}>Huecos:</strong>{' '}
          {data.huecos_principales.slice(0, 3).map((h, idx) => (
            <span key={h.nombre}>
              {h.nombre} ({Math.round(h.pct_trazado * 100)}%)
              {idx < Math.min(2, data.huecos_principales!.length - 1) ? ', ' : ''}
            </span>
          ))}
        </div>
      )}

      {data.metodologia_url && (
        <div style={{ marginTop: 6, fontSize: 10 }}>
          <a
            href={data.metodologia_url}
            target="_blank"
            rel="noopener noreferrer"
            style={{ color: cfg.color, textDecoration: 'underline' }}
          >
            ¿Cómo se calcula?
          </a>
        </div>
      )}
    </div>
  )
}
