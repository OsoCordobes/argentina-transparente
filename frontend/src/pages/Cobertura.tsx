/**
 * Cobertura.tsx — W5: página /cobertura
 *
 * North Star metric: "ARGOS traza el X% del gasto público de Córdoba".
 * Compara presupuesto declarado vs monto trazado por jurisdicción.
 *
 * NO inventa cobertura cuando no hay presupuesto cargado — la página lo
 * muestra explícitamente como "sin denominador" en lugar de fingir 100%.
 */

import { useCoberturaGlobal } from '@/lib/queries'
import { CoberturaBannerView } from '@/components/argos/CoberturaBanner'

function formatARS(n: number): string {
  if (n >= 1e12) return `$${(n / 1e12).toFixed(1)}B`
  if (n >= 1e9) return `$${(n / 1e9).toFixed(1)}MM`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)}M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)}k`
  return `$${Math.round(n)}`
}

function clasificarNivel(pct: number): 'alta' | 'media' | 'baja' {
  if (pct >= 0.9) return 'alta'
  if (pct >= 0.7) return 'media'
  return 'baja'
}

export default function Cobertura() {
  const { data, isLoading, error } = useCoberturaGlobal()

  if (isLoading) {
    return <div className="p-6 text-muted-foreground">Calculando cobertura...</div>
  }

  if (error || !data) {
    return (
      <div className="p-6 text-destructive">
        Error cargando cobertura: {(error as Error)?.message ?? 'desconocido'}
      </div>
    )
  }

  const totalDeclarado = data.jurisdicciones.reduce((s, j) => s + j.monto_declarado_oficial, 0)
  const totalTrazado = data.jurisdicciones.reduce((s, j) => s + j.monto_trazado, 0)
  const pctTotal = totalDeclarado > 0 ? totalTrazado / totalDeclarado : 0

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <header>
        <h1 className="text-2xl font-bold mb-1">Cobertura del gasto público</h1>
        <p className="text-sm text-muted-foreground">
          Cuánto del gasto declarado oficialmente está efectivamente trazado por ARGOS contra fuentes verificables.
        </p>
      </header>

      {/* North Star Metric — KPI grande */}
      <div className="rounded-lg border border-border bg-card p-6">
        <div className="text-xs uppercase tracking-wide text-muted-foreground mb-1">
          Cobertura agregada
        </div>
        <div className="flex items-baseline gap-3">
          <span className="text-4xl font-bold">
            {(pctTotal * 100).toFixed(1)}%
          </span>
          <span className="text-sm text-muted-foreground">
            {formatARS(totalTrazado)} de {formatARS(totalDeclarado)} declarados
          </span>
        </div>
      </div>

      {/* Por jurisdicción */}
      <section>
        <h2 className="text-lg font-semibold mb-3">Por jurisdicción</h2>
        <div className="space-y-3">
          {data.jurisdicciones.map(j => (
            <CoberturaBannerView
              key={j.jurisdiccion}
              data={{
                jurisdiccion: j.jurisdiccion,
                monto_declarado_oficial: j.monto_declarado_oficial,
                monto_trazado: j.monto_trazado,
                pct_cobertura: j.pct_cobertura,
                nivel: clasificarNivel(j.pct_cobertura),
                huecos_principales: [],
              }}
            />
          ))}
        </div>
      </section>

      {/* Disclaimer metodológico — CLAUDE.md §5: distinguir señal vs interpretación */}
      <section className="rounded-lg border border-border bg-muted/30 p-4 text-sm">
        <h3 className="font-semibold mb-2">¿Cómo se calcula?</h3>
        <ul className="list-disc list-inside space-y-1 text-muted-foreground">
          <li>
            <strong>Declarado oficial:</strong> suma de devengado en{' '}
            <code className="text-xs">presupuesto_ejecucion</code> (fuente: portales oficiales de transparencia).
          </li>
          <li>
            <strong>Trazado:</strong> suma de monto en <code className="text-xs">contratos</code>{' '}
            con fuente_url verificable.
          </li>
          <li>
            <strong>Limitación:</strong> el presupuesto declarado incluye personal y transferencias
            (~70% del total), mientras los contratos rastreados son sólo compras de bienes y servicios.
            La cobertura visible es por tanto una <em>cota inferior</em> de qué tan completa es la
            trazabilidad efectiva. Cumple CLAUDE.md §5: "señal detectada" ≠ "auditoría completa".
          </li>
        </ul>
      </section>
    </div>
  )
}
