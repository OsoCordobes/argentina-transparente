import { Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Database, ExternalLink, ShieldCheck } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useFuentes } from '@/lib/queries'
import { fmtFecha } from '@/lib/format'

const TIPO_LABEL: Record<string, string> = {
  api_estructurada: 'API estructurada',
  scraper_html: 'Scraper HTML',
  ocr_pdf: 'OCR de PDF',
  dataset_internacional: 'Dataset internacional',
}

export default function Fuentes() {
  const { data, isLoading, error } = useFuentes()

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Database className="h-6 w-6" />
          Fuentes de datos
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Procedencia de la información que alimenta ARGOS. Cada fuente queda
          registrada con tipo, formato, licencia y nivel de confianza
          (CLAUDE.md sección 4 — trazabilidad).
        </p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error cargando fuentes</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      )}

      {data && data.fuentes.length === 0 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sin fuentes registradas</AlertTitle>
          <AlertDescription>
            El backend aún no registró ninguna fuente. Las fuentes se registran
            automáticamente al iniciar el server (ver{' '}
            <code className="text-xs">backend/src/index.ts</code>).
          </AlertDescription>
        </Alert>
      )}

      {data && data.fuentes.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {data.fuentes.map((f) => (
            <Card key={f.id}>
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div>
                    <CardTitle className="text-base">{f.jurisdiccion}</CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {TIPO_LABEL[f.tipo] ?? f.tipo} · {f.formato}
                    </CardDescription>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {f.oficial && (
                      <Badge variant="outline" className="gap-1">
                        <ShieldCheck className="h-3 w-3" />
                        oficial
                      </Badge>
                    )}
                    <Badge
                      variant={
                        f.nivel_confianza === 'alto'
                          ? 'default'
                          : f.nivel_confianza === 'medio'
                            ? 'secondary'
                            : 'outline'
                      }
                    >
                      confianza {f.nivel_confianza}
                    </Badge>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <a
                  href={f.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline inline-flex items-start gap-1 break-all text-xs"
                >
                  <ExternalLink className="h-3 w-3 mt-0.5 shrink-0" />
                  <span>{f.url}</span>
                </a>
                {f.notas && (
                  <p className="text-xs text-muted-foreground">{f.notas}</p>
                )}
                <div className="grid grid-cols-2 gap-2 text-xs text-muted-foreground pt-1 border-t">
                  {f.licencia && (
                    <div>
                      <span className="text-muted-foreground/70">Licencia:</span>{' '}
                      {f.licencia}
                    </div>
                  )}
                  {f.frecuencia && (
                    <div>
                      <span className="text-muted-foreground/70">Frecuencia:</span>{' '}
                      {f.frecuencia}
                    </div>
                  )}
                  <div>
                    <span className="text-muted-foreground/70">Registrada:</span>{' '}
                    {fmtFecha(f.registrado_en)}
                  </div>
                  {f.ultimo_crawl && (
                    <div>
                      <span className="text-muted-foreground/70">Último crawl:</span>{' '}
                      {fmtFecha(f.ultimo_crawl)}
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}
