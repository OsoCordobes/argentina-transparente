import { useMemo, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  Building2,
  CalendarDays,
  Briefcase,
  MapPin,
  AlertTriangle,
  Search as SearchIcon,
  ExternalLink,
  Construction,
} from 'lucide-react'
import {
  ColumnDef,
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  SortingState,
  useReactTable,
} from '@tanstack/react-table'
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
} from 'recharts'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useEntidad, type ContratoDetalle } from '@/lib/queries'
import { fmtARS, fmtCompactARS, fmtNumber, fmtFecha } from '@/lib/format'

export default function Entidad() {
  const { nombre } = useParams<{ nombre: string }>()
  const decoded = nombre ? decodeURIComponent(nombre) : ''
  const { data, isLoading, error } = useEntidad(decoded)

  const entidad = data?.entidad

  return (
    <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-6 space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar la entidad</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-4">
          <Skeleton className="h-10 w-1/2" />
          <Skeleton className="h-24 w-full" />
        </div>
      )}

      {entidad && (
        <>
          <header className="space-y-3">
            <div className="flex items-start gap-3 flex-wrap">
              <Building2 className="h-6 w-6 mt-1 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight break-words">
                  {entidad.nombre}
                </h1>
                <div className="flex flex-wrap gap-2 mt-2 text-xs text-muted-foreground">
                  {entidad.municipios.map((m) => (
                    <span
                      key={m}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted"
                    >
                      <MapPin className="h-3 w-3" /> {m}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Stat label="Monto total" value={fmtCompactARS(entidad.montoTotal)} />
              <Stat label="Contratos" value={fmtNumber(entidad.totalContratos)} />
              <Stat
                label="Período"
                value={
                  entidad.anios.length
                    ? `${Math.min(...entidad.anios)}–${Math.max(...entidad.anios)}`
                    : '—'
                }
              />
              <Stat label="Áreas" value={fmtNumber(entidad.areas.length)} />
            </div>

            {entidad.afip ? (
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm">Datos AFIP / ARCA</CardTitle>
                  <CardDescription>
                    Verificación CUIT vía registro público
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                  <KV label="CUIT" value={entidad.afip.cuit} mono />
                  <KV
                    label="Empleador"
                    value={entidad.afip.esEmpleador ? 'Sí' : 'No declara'}
                  />
                  <KV label="Estado" value={entidad.afip.estado ?? '—'} />
                  <KV
                    label="Inicio actividades"
                    value={entidad.afip.inicioActividades ?? '—'}
                  />
                  {entidad.afip.actividadPrincipal && (
                    <div className="col-span-2 md:col-span-4 text-xs text-muted-foreground">
                      <span className="font-medium">Actividad:</span>{' '}
                      {entidad.afip.actividadPrincipal}
                    </div>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Sin datos AFIP</AlertTitle>
                <AlertDescription>
                  No se pudo verificar CUIT en registros públicos. Esta entidad puede no estar
                  enriquecida aún.
                </AlertDescription>
              </Alert>
            )}
          </header>

          <Tabs defaultValue="resumen" className="space-y-4">
            <TabsList className="grid grid-cols-4 w-full md:w-auto md:inline-flex">
              <TabsTrigger value="resumen">Resumen</TabsTrigger>
              <TabsTrigger value="contratos">
                Contratos
                <Badge variant="secondary" className="ml-2 tabular-nums">
                  {entidad.contratos.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="timeline">Timeline</TabsTrigger>
              <TabsTrigger value="señales">Señales</TabsTrigger>
            </TabsList>

            <TabsContent value="resumen" className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Distribución por tipo de proceso</CardTitle>
                  <CardDescription>
                    Cantidad y monto agrupado por modalidad de contratación
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <table className="w-full text-sm">
                    <thead className="text-xs text-muted-foreground uppercase">
                      <tr className="border-b">
                        <th className="text-left font-medium py-2">Tipo</th>
                        <th className="text-right font-medium py-2">Cantidad</th>
                        <th className="text-right font-medium py-2">Monto</th>
                        <th className="text-right font-medium py-2 hidden md:table-cell">
                          % del total
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {entidad.tipos.map((t) => (
                        <tr key={t.tipo} className="border-b last:border-b-0">
                          <td className="py-2">{t.tipo}</td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtNumber(t.cantidad)}
                          </td>
                          <td className="py-2 text-right tabular-nums">
                            {fmtARS(t.monto)}
                          </td>
                          <td className="py-2 text-right tabular-nums hidden md:table-cell">
                            {((t.monto / Math.max(entidad.montoTotal, 1)) * 100).toFixed(1)}%
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Áreas contratantes</CardTitle>
                  <CardDescription>
                    Reparticiones que han adjudicado contratos a esta entidad
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-wrap gap-1.5">
                    {entidad.areas.map((a) => (
                      <Badge key={a} variant="outline" className="text-xs">
                        <Briefcase className="h-3 w-3 mr-1" /> {a}
                      </Badge>
                    ))}
                    {!entidad.areas.length && (
                      <span className="text-sm text-muted-foreground">Sin datos</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="contratos">
              <ContratosTable contratos={entidad.contratos} />
            </TabsContent>

            <TabsContent value="timeline">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Evolución anual</CardTitle>
                  <CardDescription>
                    Contratos y monto adjudicado por año fiscal
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-72">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={entidad.timeline}
                        margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                        <XAxis
                          dataKey="anio"
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                        />
                        <YAxis
                          stroke="hsl(var(--muted-foreground))"
                          fontSize={12}
                          tickFormatter={(v) => fmtCompactARS(v)}
                        />
                        <Tooltip
                          formatter={(value: number, name: string) => {
                            if (name === 'monto') return [fmtARS(value), 'Monto']
                            return [fmtNumber(value), 'Contratos']
                          }}
                          labelFormatter={(l) => `Año ${l}`}
                          contentStyle={{
                            background: 'hsl(var(--background))',
                            border: '1px solid hsl(var(--border))',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        />
                        <Bar dataKey="monto" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <table className="w-full text-sm mt-4">
                    <thead className="text-xs text-muted-foreground uppercase">
                      <tr className="border-b">
                        <th className="text-left py-2 font-medium">Año</th>
                        <th className="text-right py-2 font-medium">Contratos</th>
                        <th className="text-right py-2 font-medium">Monto</th>
                      </tr>
                    </thead>
                    <tbody>
                      {entidad.timeline.map((row) => (
                        <tr key={row.anio} className="border-b last:border-b-0">
                          <td className="py-1.5">
                            <CalendarDays className="h-3 w-3 inline mr-1" />
                            {row.anio}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmtNumber(row.cantidad)}
                          </td>
                          <td className="py-1.5 text-right tabular-nums">
                            {fmtARS(row.monto)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="señales">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Señales asociadas</CardTitle>
                  <CardDescription>
                    {entidad.señales && entidad.señales.length > 0
                      ? `${entidad.señales.length} señal(es) cruzando por CUIT`
                      : 'Sin señales asociadas al CUIT de esta entidad'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {!entidad.afip && (
                    <Alert>
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Sin enriquecimiento AFIP</AlertTitle>
                      <AlertDescription>
                        No se encontró CUIT para esta entidad — no es posible asociar
                        señales. Ejecutá <code className="text-xs">npm run seed:afip</code>{' '}
                        en el backend.
                      </AlertDescription>
                    </Alert>
                  )}
                  {entidad.afip && (!entidad.señales || entidad.señales.length === 0) && (
                    <div className="border border-dashed rounded-md p-8 text-center text-sm text-muted-foreground">
                      <Construction className="h-6 w-6 mx-auto mb-2 opacity-50" />
                      No se detectaron señales asociadas al CUIT{' '}
                      <code className="text-xs">{entidad.afip.cuit}</code>. Si esperás
                      ver señales, recorré <code className="text-xs">npm run analyze --force</code>{' '}
                      en el backend para repoblar <code className="text-xs">entidades_cuit</code>.
                    </div>
                  )}
                  {entidad.señales && entidad.señales.length > 0 && (
                    <div className="space-y-3">
                      {entidad.señales.map((s) => (
                        <div
                          key={s.id}
                          className="border rounded-md p-4 space-y-2 hover:border-foreground/20 transition-colors"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div>
                              <Badge
                                variant={
                                  s.severidad === 'grave'
                                    ? 'destructive'
                                    : s.severidad === 'moderada'
                                      ? 'secondary'
                                      : 'outline'
                                }
                              >
                                {s.severidad}
                              </Badge>
                              <h3 className="text-sm font-medium mt-2">{s.titulo}</h3>
                              <p className="text-xs text-muted-foreground mt-0.5">
                                {s.tipologia.replace(/_/g, ' ')} · {s.municipio}
                              </p>
                            </div>
                            <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                              score {s.score}
                            </span>
                          </div>
                          <p className="text-sm text-muted-foreground">{s.resumen}</p>
                          {s.evidencia.length > 0 && (
                            <details className="text-xs">
                              <summary className="cursor-pointer text-muted-foreground">
                                {s.evidencia.length} pieza(s) de evidencia
                              </summary>
                              <ul className="mt-2 space-y-1 ml-4 list-disc">
                                {s.evidencia.map((ev, i) => (
                                  <li key={i}>
                                    {ev.descripcion}
                                    {ev.fuenteUrl && (
                                      <>
                                        {' '}
                                        <a
                                          href={ev.fuenteUrl}
                                          target="_blank"
                                          rel="noreferrer"
                                          className="text-primary hover:underline inline-flex items-center gap-0.5"
                                        >
                                          <ExternalLink className="h-2.5 w-2.5" />
                                          fuente
                                        </a>
                                      </>
                                    )}
                                  </li>
                                ))}
                              </ul>
                            </details>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </>
      )}
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
        <div className="text-lg md:text-xl font-semibold tabular-nums mt-1">{value}</div>
      </CardContent>
    </Card>
  )
}

function KV({
  label,
  value,
  mono,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className={mono ? 'font-mono text-sm' : 'text-sm'}>{value}</div>
    </div>
  )
}

function ContratosTable({ contratos }: { contratos: ContratoDetalle[] }) {
  const [sorting, setSorting] = useState<SortingState>([{ id: 'monto', desc: true }])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<ContratoDetalle>[]>(
    () => [
      {
        accessorKey: 'anio',
        header: 'Año',
        cell: (c) => <span className="tabular-nums">{c.getValue<number>()}</span>,
      },
      {
        accessorKey: 'tipo',
        header: 'Tipo',
        cell: (c) => (
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {c.getValue<string>()}
          </Badge>
        ),
      },
      {
        accessorKey: 'area',
        header: 'Área',
        cell: (c) => (
          <span className="text-xs text-muted-foreground line-clamp-2">
            {c.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'descripcion',
        header: 'Descripción',
        cell: (c) => (
          <span className="text-sm line-clamp-2 max-w-md">
            {c.getValue<string>()}
          </span>
        ),
      },
      {
        accessorKey: 'monto',
        header: () => <div className="text-right">Monto</div>,
        cell: (c) => (
          <div className="text-right font-mono tabular-nums">
            {fmtARS(c.getValue<number>())}
          </div>
        ),
        sortingFn: 'basic',
      },
      {
        accessorKey: 'fechaContrato',
        header: 'Fecha',
        cell: (c) => (
          <span className="text-xs text-muted-foreground whitespace-nowrap">
            {fmtFecha(c.getValue<string>())}
          </span>
        ),
      },
      {
        id: 'acciones',
        header: '',
        cell: (c) => (
          <div className="flex items-center gap-2">
            {c.row.original.hash && (
              <Link
                to={`/contrato/${c.row.original.hash}`}
                className="text-xs text-primary hover:underline whitespace-nowrap"
                title="Ver ficha individual del contrato"
              >
                Ver ficha
              </Link>
            )}
            <a
              href={c.row.original.fuenteUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
              title="Abrir dataset oficial"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        ),
      },
    ],
    []
  )

  const table = useReactTable({
    data: contratos,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  })

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-base">Contratos individuales</CardTitle>
            <CardDescription>
              Hasta 100 contratos más recientes · click en fuente para verificar
            </CardDescription>
          </div>
          <div className="relative w-full sm:w-72">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Filtrar por descripción, área, tipo…"
              value={globalFilter}
              onChange={(e) => setGlobalFilter(e.target.value)}
              className="pl-8"
            />
          </div>
        </div>
      </CardHeader>
      <CardContent className="px-0 pb-3">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-muted-foreground uppercase tracking-wide">
              {table.getHeaderGroups().map((hg) => (
                <tr key={hg.id} className="border-y">
                  {hg.headers.map((h) => (
                    <th
                      key={h.id}
                      className="px-4 py-2 text-left font-medium select-none"
                      onClick={h.column.getToggleSortingHandler()}
                      style={{ cursor: h.column.getCanSort() ? 'pointer' : 'default' }}
                    >
                      <span className="inline-flex items-center gap-1">
                        {flexRender(h.column.columnDef.header, h.getContext())}
                        {h.column.getIsSorted() === 'asc' && '↑'}
                        {h.column.getIsSorted() === 'desc' && '↓'}
                      </span>
                    </th>
                  ))}
                </tr>
              ))}
            </thead>
            <tbody>
              {table.getRowModel().rows.length === 0 && (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-8 text-center text-sm text-muted-foreground"
                  >
                    Sin contratos para mostrar.
                  </td>
                </tr>
              )}
              {table.getRowModel().rows.map((row) => (
                <tr key={row.id} className="border-b last:border-b-0 hover:bg-accent/30">
                  {row.getVisibleCells().map((cell) => (
                    <td key={cell.id} className="px-4 py-2 align-top">
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
      {table.getPageCount() > 1 && (
        <div className="border-t px-4 py-3 flex items-center justify-between text-xs text-muted-foreground">
          <span>
            Página {table.getState().pagination.pageIndex + 1} de {table.getPageCount()} ·{' '}
            {table.getFilteredRowModel().rows.length} contratos
          </span>
          <div className="flex gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.previousPage()}
              disabled={!table.getCanPreviousPage()}
            >
              Anterior
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => table.nextPage()}
              disabled={!table.getCanNextPage()}
            >
              Siguiente
            </Button>
          </div>
        </div>
      )}
    </Card>
  )
}
