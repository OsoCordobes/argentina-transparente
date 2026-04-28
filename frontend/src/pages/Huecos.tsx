/**
 * Huecos.tsx — W5: página /huecos
 *
 * Lista categorizada de áreas con baja cobertura, ordenadas por monto
 * declarado faltante de trazar. Útil para que ciudadanos / periodistas
 * vean dónde ARGOS todavía no llega.
 *
 * Honestidad: ESTOS son los datos faltantes — no inventamos cobertura
 * donde no hay. Cada hueco es accionable: mostrar qué fuente cargar.
 */

import { useCobertura, type CoberturaResponse } from '@/lib/queries'
import { useState } from 'react'

const JURISDICCIONES = [
  'cordoba-capital',
  'cordoba-provincia',
  'argentina-compra',
  'caba',
  'santa-fe',
]

const NIVEL_COLOR = {
  alta:  '#62C7A0',
  media: '#F5B544',
  baja:  '#E85D75',
} as const

function formatARS(n: number): string {
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}MM`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${Math.round(n)}`
}

function HuecosDeJurisdiccion({ jurisdiccion }: { jurisdiccion: string }) {
  const { data, isLoading } = useCobertura(jurisdiccion)

  if (isLoading) {
    return <div className="text-xs text-muted-foreground">Cargando {jurisdiccion}...</div>
  }
  if (!data || data.error || !data.huecos_principales) return null

  const cob: CoberturaResponse = data
  if (cob.huecos_principales!.length === 0 && cob.monto_declarado_oficial === 0) {
    return (
      <div className="rounded-md border border-border bg-card p-4">
        <h3 className="text-sm font-semibold mb-1">{jurisdiccion}</h3>
        <p className="text-xs text-muted-foreground">
          Sin presupuesto declarado cargado. Cargar fuente oficial para calcular huecos.
        </p>
      </div>
    )
  }

  return (
    <div className="rounded-md border border-border bg-card p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h3 className="text-sm font-semibold">{jurisdiccion}</h3>
        <span className="text-xs" style={{ color: NIVEL_COLOR[cob.nivel] }}>
          Cobertura {cob.nivel} · {(cob.pct_cobertura * 100).toFixed(1)}%
        </span>
      </div>

      {cob.huecos_principales!.length === 0 ? (
        <p className="text-xs text-muted-foreground">Sin huecos identificados — todas las reparticiones tienen contratos trazados.</p>
      ) : (
        <ul className="space-y-2">
          {cob.huecos_principales!.map(h => (
            <li
              key={h.nombre}
              className="text-sm p-2 rounded bg-muted/30 border border-border"
            >
              <div className="flex justify-between items-baseline">
                <span className="font-medium">{h.nombre}</span>
                <span className="text-xs text-muted-foreground">
                  {(h.pct_trazado * 100).toFixed(0)}% trazado
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {formatARS(h.monto_trazado)} de {formatARS(h.monto_declarado)} declarados
                · faltan {formatARS(h.monto_declarado - h.monto_trazado)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

export default function Huecos() {
  const [filtroJurisdiccion, setFiltroJurisdiccion] = useState<string | 'todas'>('todas')

  const jurisdicciones = filtroJurisdiccion === 'todas'
    ? JURISDICCIONES
    : [filtroJurisdiccion]

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-4">
      <header>
        <h1 className="text-2xl font-bold mb-1">Huecos de cobertura</h1>
        <p className="text-sm text-muted-foreground">
          Áreas donde ARGOS todavía no traza el gasto público declarado oficialmente.
          Estos son los datos por cargar.
        </p>
      </header>

      <div className="flex gap-2">
        <select
          value={filtroJurisdiccion}
          onChange={e => setFiltroJurisdiccion(e.target.value as string)}
          className="px-2 py-1 rounded border border-border bg-background text-sm"
          aria-label="Filtrar por jurisdicción"
        >
          <option value="todas">Todas las jurisdicciones</option>
          {JURISDICCIONES.map(j => (
            <option key={j} value={j}>{j}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {jurisdicciones.map(j => (
          <HuecosDeJurisdiccion key={j} jurisdiccion={j} />
        ))}
      </div>

      <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm mt-6">
        <h3 className="font-semibold mb-2">¿Cómo aporto?</h3>
        <p className="text-muted-foreground">
          Si conocés una fuente de datos pública para alguno de estos huecos, abrí
          un issue en el repositorio o contactá al equipo. Cada conexión nueva
          aumenta la cobertura del sistema.
        </p>
      </section>
    </div>
  )
}
