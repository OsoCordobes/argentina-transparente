import { useParams, Link } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  Building2,
  ExternalLink,
  Hash,
  ShieldAlert,
  CalendarDays,
  Briefcase,
  MapPin,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useContrato, type SeñalAsociada } from '@/lib/queries'
import { fmtARS } from '@/lib/format'
import { AddToCase } from '@/components/caso/AddToCase'

export default function Contrato() {
  const { hash } = useParams<{ hash: string }>()
  const { data, isLoading, error } = useContrato(hash)

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-6">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar el contrato</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && <Skeleton className="h-40 w-full" />}

      {data && (
        <>
          <div className="space-y-2">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Hash className="h-3.5 w-3.5" />
              <code className="font-mono">{data.contrato.hash}</code>
              <span>·</span>
              <span>cadena de custodia</span>
            </div>
            <div className="flex items-start gap-3 justify-between flex-wrap">
              <div className="min-w-0 flex-1">
                <h1 className="text-xl md:text-2xl font-semibold tracking-tight">
                  {data.contrato.tipo} · {data.contrato.anio}
                </h1>
                <p className="text-base text-muted-foreground line-clamp-3 mt-1">
                  {data.contrato.descripcion}
                </p>
              </div>
              {data.contrato.hash && (
                <AddToCase
                  payload={{
                    tipo: 'contrato',
                    hash: data.contrato.hash,
                    proveedor: data.contrato.proveedor,
                    monto: data.contrato.monto,
                    anio: data.contrato.anio,
                    tipo_contrato: data.contrato.tipo,
                    area: data.contrato.area,
                    fuenteUrl: data.contrato.fuenteUrl,
                  }}
                />
              )}
            </div>
          </div>

          <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Datos del contrato</CardTitle>
                <CardDescription>Información publicada en fuente oficial</CardDescription>
              </CardHeader>
              <CardContent className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <KV
                  label="Proveedor"
                  value={
                    <Link
                      to={`/entidad/${encodeURIComponent(data.contrato.proveedor)}`}
                      className="text-primary hover:underline inline-flex items-center gap-1"
                    >
                      <Building2 className="h-3.5 w-3.5" />
                      {data.contrato.proveedor}
                    </Link>
                  }
                />
                <KV
                  label="Monto"
                  value={
                    <span className="font-mono text-base font-medium">
                      {fmtARS(data.contrato.monto)}
                    </span>
                  }
                />
                <KV
                  label="Año fiscal"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <CalendarDays className="h-3.5 w-3.5 text-muted-foreground" />
                      {data.contrato.anio}
                    </span>
                  }
                />
                <KV
                  label="Modalidad"
                  value={<Badge variant="outline">{data.contrato.tipo}</Badge>}
                />
                <KV
                  label="Área contratante"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Briefcase className="h-3.5 w-3.5 text-muted-foreground" />
                      {data.contrato.area}
                    </span>
                  }
                />
                <KV
                  label="Jurisdicción"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-muted-foreground" />
                      {data.contrato.municipio ?? '—'}
                    </span>
                  }
                />
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Cadena de custodia</CardTitle>
                <CardDescription>Trazabilidad forense del dato</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <div>
                  <div className="text-xs text-muted-foreground">Hash del contrato</div>
                  <code className="font-mono text-xs break-all">
                    {data.cadenaCustodia.hashContrato}
                  </code>
                </div>
                <div>
                  <div className="text-xs text-muted-foreground">Fuente oficial</div>
                  <a
                    href={data.cadenaCustodia.fuenteUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-xs text-primary hover:underline break-all"
                  >
                    <ExternalLink className="h-3 w-3 shrink-0" />
                    <span className="truncate">{data.cadenaCustodia.fuenteUrl}</span>
                  </a>
                </div>
                <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                  Toda señal o hallazgo derivado puede reconstruirse desde esta URL
                  + hash. Cumple sección 4 de las instrucciones fijas (trazabilidad).
                </div>
              </CardContent>
            </Card>
          </section>

          {data.afip && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm">AFIP / ARCA — proveedor</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                <KV
                  label="CUIT"
                  value={<code className="font-mono text-xs">{data.afip.cuit}</code>}
                />
                <KV label="Empleador" value={data.afip.esEmpleador ? 'Sí' : 'No declara'} />
                <KV label="Estado" value={data.afip.estado ?? '—'} />
                <KV label="Inicio" value={data.afip.inicioActividades ?? '—'} />
                {data.afip.actividadPrincipal && (
                  <div className="col-span-2 md:col-span-4 text-xs text-muted-foreground">
                    <span className="font-medium">Actividad:</span>{' '}
                    {data.afip.actividadPrincipal}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <section>
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <ShieldAlert className="h-5 w-5" />
                Señales asociadas
              </h2>
              <span className="text-xs text-muted-foreground">
                {data.señales.length === 0
                  ? 'Sin señales asociadas al CUIT'
                  : `${data.señales.length} señal(es)`}
              </span>
            </div>
            {data.señales.length === 0 ? (
              <div className="border border-dashed rounded-md p-6 text-center text-sm text-muted-foreground">
                No se detectaron señales asociadas al proveedor de este contrato.
                {!data.afip && (
                  <div className="mt-2 text-xs">
                    Sin enriquecimiento AFIP — no fue posible cruzar por CUIT.
                  </div>
                )}
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {data.señales.map((s) => (
                  <SeñalCard key={s.id} señal={s} />
                ))}
              </div>
            )}
          </section>
        </>
      )}
    </div>
  )
}

function KV({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="space-y-0.5">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className="text-sm">{value}</div>
    </div>
  )
}

function SeñalCard({ señal }: { señal: SeñalAsociada }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-start justify-between gap-2">
          <div>
            <Badge
              variant={
                señal.severidad === 'grave'
                  ? 'destructive'
                  : señal.severidad === 'moderada'
                    ? 'secondary'
                    : 'outline'
              }
            >
              {señal.severidad}
            </Badge>
            <CardTitle className="text-sm mt-2 leading-snug">{señal.titulo}</CardTitle>
          </div>
          <span className="text-xs text-muted-foreground tabular-nums shrink-0">
            score {señal.score}
          </span>
        </div>
        <CardDescription className="text-xs">
          {señal.tipologia.replace(/_/g, ' ')} · {señal.municipio}
        </CardDescription>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground line-clamp-3">
        {señal.resumen}
      </CardContent>
    </Card>
  )
}
