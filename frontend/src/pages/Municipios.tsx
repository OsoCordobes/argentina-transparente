import { Link } from 'react-router-dom'
import {
  ArrowLeft, Building2, AlertTriangle, TrendingUp,
  Database, CheckCircle, XCircle, AlertCircle,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Progress } from '@/components/ui/progress'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell,
} from 'recharts'
import { useDashboard, useScrapersHealth } from '@/lib/queries'
import { fmtCompactARS, fmtNumber, fmtFecha } from '@/lib/format'

const MUNICIPIO_LABEL: Record<string, string> = {
  'cordoba-capital':  'Córdoba Capital',
  'argentina-compra': 'Nación (Argentina Compra)',
  'caba':             'CABA',
  'santa-fe':         'Santa Fe',
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981']

function nombreMunicipio(id: string): string {
  return MUNICIPIO_LABEL[id] ?? id
}

export default function Municipios() {
  const { data: dashboard, isLoading: loadingDash, error: errorDash } = useDashboard()
  const { data: health } = useScrapersHealth()

  const municipios = dashboard?.municipios ?? []
  const totalMonto = municipios.reduce((sum, m) => sum + m.monto_total, 0)

  const chartData = municipios.map((m, i) => ({
    name: nombreMunicipio(m.municipio).split(' ')[0],
    monto: m.monto_total,
    contratos: m.total_contratos,
    señales: m.total_señales,
    color: COLORS[i % COLORS.length],
  }))

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          Comparativo por jurisdicción
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Vista cruzada de todas las jurisdicciones con datos cargados en ARGOS.
        </p>
      </div>

      {errorDash && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error cargando datos</AlertTitle>
          <AlertDescription>{(errorDash as Error).message}</AlertDescription>
        </Alert>
      )}

      {loadingDash ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40 w-full" />)}
        </div>
      ) : municipios.length === 0 ? (
        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>Sin datos comparativos</AlertTitle>
          <AlertDescription>
            Ejecutá <code className="text-xs">npm run seed:cordoba</code> u otro
            seed para cargar datos de una jurisdicción.
          </AlertDescription>
        </Alert>
      ) : (
        <>
          {/* Gráfico comparativo */}
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <TrendingUp className="h-4 w-4" />
                Monto contratado por jurisdicción
              </CardTitle>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={chartData} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis
                    dataKey="name"
                    tick={{ fontSize: 11 }}
                    className="text-muted-foreground"
                  />
                  <YAxis
                    tick={{ fontSize: 10 }}
                    tickFormatter={(v) => fmtCompactARS(v)}
                    className="text-muted-foreground"
                    width={72}
                  />
                  <Tooltip
                    formatter={(v: number) => [fmtCompactARS(v), 'Monto']}
                    contentStyle={{ fontSize: 12 }}
                  />
                  <Bar dataKey="monto" radius={[4, 4, 0, 0]}>
                    {chartData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>

          {/* Cards por municipio */}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {municipios.map((m, i) => {
              const pct = totalMonto > 0 ? (m.monto_total / totalMonto) * 100 : 0
              return (
                <Card key={m.municipio}>
                  <CardHeader className="pb-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <CardTitle className="text-base">
                          {nombreMunicipio(m.municipio)}
                        </CardTitle>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {m.anio_min}–{m.anio_max}
                        </p>
                      </div>
                      <div
                        className="w-3 h-3 rounded-full mt-1 shrink-0"
                        style={{ backgroundColor: COLORS[i % COLORS.length] }}
                      />
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Contratos</p>
                        <p className="font-semibold">{fmtNumber(m.total_contratos)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Monto total</p>
                        <p className="font-semibold">{fmtCompactARS(m.monto_total)}</p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">Señales</p>
                        <p className="font-semibold">
                          {m.total_señales > 0 ? (
                            <span className="text-destructive">{m.total_señales}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs text-muted-foreground">% del total</p>
                        <p className="font-semibold">{pct.toFixed(1)}%</p>
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Progress value={pct} className="h-1.5" />
                    </div>
                    <Link
                      to={`/?municipio=${encodeURIComponent(m.municipio)}`}
                      className="text-xs text-primary hover:underline"
                    >
                      Ver señales de {nombreMunicipio(m.municipio)} →
                    </Link>
                  </CardContent>
                </Card>
              )
            })}
          </div>
        </>
      )}

      {/* Scraper health */}
      {health && (
        <div className="space-y-3">
          <h2 className="text-lg font-semibold flex items-center gap-2">
            <Database className="h-4 w-4" />
            Estado de scrapers
            <Badge variant="secondary" className="text-xs">
              {health.resumen.total} scrapers · {health.resumen.ok} ok
              {health.resumen.error > 0 && ` · ${health.resumen.error} error`}
            </Badge>
          </h2>

          {health.scrapers.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Ningún scraper ha sido ejecutado aún.
              Los scrapers registran su estado en DuckDB.scrapers_health
              cuando se ejecutan manualmente o via cron.
            </p>
          ) : (
            <div className="space-y-2">
              {health.scrapers.map(s => (
                <div
                  key={s.id}
                  className="flex items-center gap-3 p-3 rounded-lg border bg-card text-sm"
                >
                  {s.status === 'ok' ? (
                    <CheckCircle className="h-4 w-4 text-green-500 shrink-0" />
                  ) : s.status === 'warning' ? (
                    <AlertCircle className="h-4 w-4 text-yellow-500 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-destructive shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{s.id}</p>
                    {s.errorMsg && (
                      <p className="text-xs text-destructive truncate">{s.errorMsg}</p>
                    )}
                  </div>
                  <div className="text-right text-xs text-muted-foreground shrink-0">
                    {s.contratosCount !== null && (
                      <p>{fmtNumber(s.contratosCount)} contratos</p>
                    )}
                    {s.ejecutadoEn && <p>{fmtFecha(s.ejecutadoEn)}</p>}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
