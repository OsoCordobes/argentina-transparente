import { Link } from 'react-router-dom'
import {
  AlertTriangle,
  Building2,
  FileSignature,
  MapPin,
  ChevronRight,
  ShieldAlert,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useDashboard, type SeñalDashboard, type Severidad } from '@/lib/queries'
import { fmtCompactARS, fmtNumber } from '@/lib/format'

export default function Dashboard() {
  const { data, isLoading, error } = useDashboard()

  return (
    <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            Dashboard de inteligencia
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Resumen cross-municipio · señales activas · entidades de mayor exposición
          </p>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar el dashboard</AlertTitle>
          <AlertDescription>
            {(error as Error).message ?? 'Error desconocido.'} ¿Está corriendo el backend?
          </AlertDescription>
        </Alert>
      )}

      <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <KpiCard
          icon={<FileSignature className="h-4 w-4" />}
          label="Contratos analizados"
          value={isLoading ? null : fmtNumber(data?.totalContratos ?? 0)}
        />
        <KpiCard
          icon={<ShieldAlert className="h-4 w-4" />}
          label="Señales detectadas"
          value={isLoading ? null : fmtNumber(data?.totalSeñales ?? 0)}
        />
        <KpiCard
          icon={<Building2 className="h-4 w-4" />}
          label="Entidades en foco"
          value={isLoading ? null : fmtNumber(data?.topEntidades?.length ?? 0)}
        />
        <KpiCard
          icon={<MapPin className="h-4 w-4" />}
          label="Jurisdicciones"
          value={isLoading ? null : fmtNumber(data?.municipios?.length ?? 0)}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Top entidades por exposición</CardTitle>
            <CardDescription>Ordenadas por monto total contratado</CardDescription>
          </CardHeader>
          <CardContent className="px-0">
            {isLoading ? (
              <div className="space-y-2 px-6 pb-2">
                {[...Array(6)].map((_, i) => (
                  <Skeleton key={i} className="h-9 w-full" />
                ))}
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="text-xs text-muted-foreground uppercase tracking-wide">
                    <tr className="border-b">
                      <th className="text-left font-medium px-6 py-2">Proveedor</th>
                      <th className="text-left font-medium px-3 py-2 hidden md:table-cell">
                        Municipio
                      </th>
                      <th className="text-right font-medium px-3 py-2">Monto</th>
                      <th className="text-right font-medium px-3 py-2 hidden sm:table-cell">
                        Contratos
                      </th>
                      <th className="text-right font-medium px-3 py-2 hidden md:table-cell">
                        Años
                      </th>
                      <th className="text-right font-medium px-6 py-2">Señales</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data?.topEntidades?.slice(0, 12).map((e) => (
                      <tr
                        key={`${e.proveedor}-${e.municipio}`}
                        className="border-b last:border-b-0 hover:bg-accent/40"
                      >
                        <td className="px-6 py-2">
                          <Link
                            to={`/entidad/${encodeURIComponent(e.proveedor)}`}
                            className="font-medium hover:underline truncate block max-w-[28ch] md:max-w-none"
                            title={e.proveedor}
                          >
                            {e.proveedor}
                          </Link>
                        </td>
                        <td className="px-3 py-2 text-muted-foreground hidden md:table-cell">
                          {e.municipio}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums">
                          {fmtCompactARS(e.monto_total)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums hidden sm:table-cell">
                          {fmtNumber(e.total_contratos)}
                        </td>
                        <td className="px-3 py-2 text-right tabular-nums hidden md:table-cell">
                          {e.anio_min === e.anio_max
                            ? e.anio_min
                            : `${e.anio_min}–${e.anio_max}`}
                        </td>
                        <td className="px-6 py-2 text-right">
                          {e.señales > 0 ? (
                            <Badge variant="destructive" className="tabular-nums">
                              {e.señales}
                            </Badge>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                    {!data?.topEntidades?.length && (
                      <tr>
                        <td
                          colSpan={6}
                          className="px-6 py-8 text-center text-sm text-muted-foreground"
                        >
                          Sin datos. Ejecutá el seed del backend.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Jurisdicciones</CardTitle>
            <CardDescription>Cobertura cargada en el datalake</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {isLoading ? (
              [...Array(3)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)
            ) : (
              data?.municipios?.map((m) => (
                <div
                  key={m.municipio}
                  className="flex items-center justify-between border rounded-md px-3 py-2"
                >
                  <div className="min-w-0">
                    <div className="font-medium truncate">{m.municipio}</div>
                    <div className="text-xs text-muted-foreground tabular-nums">
                      {m.anio_min}–{m.anio_max} · {fmtNumber(m.total_contratos)} contratos
                    </div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm tabular-nums">{fmtCompactARS(m.monto_total)}</div>
                    {m.total_señales > 0 && (
                      <Badge variant="destructive" className="text-xs mt-1">
                        {m.total_señales} señales
                      </Badge>
                    )}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </section>

      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold">Señales activas</h2>
          <span className="text-xs text-muted-foreground">
            {data?.señales?.length ? `${data.señales.length} señales` : ''}
          </span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {isLoading
            ? [...Array(6)].map((_, i) => <Skeleton key={i} className="h-32 w-full" />)
            : data?.señales?.slice(0, 12).map((s) => <SeñalCard key={s.id} señal={s} />)}
          {!isLoading && data?.señales?.length === 0 && (
            <Card className="md:col-span-2 xl:col-span-3">
              <CardContent className="py-10 text-center text-sm text-muted-foreground">
                Sin señales en cache. Corré el motor en el backend.
              </CardContent>
            </Card>
          )}
        </div>
      </section>
    </div>
  )
}

function KpiCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode
  label: string
  value: string | null
}) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center gap-2 text-muted-foreground text-xs uppercase tracking-wide">
          {icon}
          <span>{label}</span>
        </div>
        <div className="mt-2 text-2xl font-semibold tabular-nums">
          {value ?? <Skeleton className="h-7 w-20" />}
        </div>
      </CardContent>
    </Card>
  )
}

function SeñalCard({ señal }: { señal: SeñalDashboard }) {
  return (
    <Card className="hover:border-foreground/20 transition-colors">
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <Badge variant={severidadVariant(señal.severidad)} className="mb-2">
              {señal.severidad}
            </Badge>
            <CardTitle className="text-sm leading-snug">{señal.titulo}</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            score {señal.score}
          </span>
        </div>
        <CardDescription className="text-xs">
          {señal.municipio} · {señal.tipologia.replace(/_/g, ' ')}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground line-clamp-3">
        {señal.resumen}
      </CardContent>
      <div className="px-6 pb-3 -mt-1 flex items-center gap-1 text-xs text-muted-foreground">
        <ChevronRight className="h-3 w-3" />
        <span>{señal.evidencia.length} pieza(s) de evidencia</span>
      </div>
    </Card>
  )
}

function severidadVariant(s: Severidad): 'destructive' | 'secondary' | 'outline' {
  if (s === 'grave') return 'destructive'
  if (s === 'moderada') return 'secondary'
  return 'outline'
}
