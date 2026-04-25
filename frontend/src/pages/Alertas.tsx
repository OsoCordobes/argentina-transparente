import { Link } from 'react-router-dom'
import { useState } from 'react'
import {
  ArrowLeft, Bell, AlertCircle, AlertTriangle, Info,
  CheckCheck, Database, Link2, X,
} from 'lucide-react'
import { useQueryClient } from '@tanstack/react-query'
import { Card, CardContent } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  useAlertas, marcarAlertaLeida, marcarTodasAlertasLeidas,
  type Alerta,
} from '@/lib/queries'
import { fmtFecha } from '@/lib/format'

const TIPO_LABEL: Record<Alerta['tipo'], string> = {
  scraper_roto:          'Scraper roto',
  fuente_desactualizada: 'Fuente sin actualizar',
  datos_nuevos:          'Datos nuevos',
}

const TIPO_ICON: Record<Alerta['tipo'], typeof AlertCircle> = {
  scraper_roto:          AlertCircle,
  fuente_desactualizada: AlertTriangle,
  datos_nuevos:          Info,
}

function severidadColor(s: Alerta['severidad']): string {
  if (s === 'critical') return 'text-destructive'
  if (s === 'warning')  return 'text-yellow-500'
  return 'text-blue-500'
}

export default function Alertas() {
  const [soloNoLeidas, setSoloNoLeidas] = useState(true)
  const { data, isLoading, error } = useAlertas(soloNoLeidas)
  const qc = useQueryClient()

  async function handleMarcarLeida(id: string) {
    await marcarAlertaLeida(id)
    qc.invalidateQueries({ queryKey: ['alertas'] })
  }

  async function handleMarcarTodas() {
    await marcarTodasAlertasLeidas()
    qc.invalidateQueries({ queryKey: ['alertas'] })
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-4">
      <Link
        to="/"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      <div className="flex items-start justify-between gap-2 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Bell className="h-6 w-6" />
            Alertas
            {data && data.count.total > 0 && (
              <Badge variant="destructive" className="text-xs">
                {data.count.total} sin leer
              </Badge>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Eventos detectados automáticamente: scrapers rotos, fuentes
            desactualizadas y datos nuevos. Refrescado por{' '}
            <code className="text-xs">npm run alertas:check</code> (configurar
            como cron).
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setSoloNoLeidas(!soloNoLeidas)}
          >
            {soloNoLeidas ? 'Ver todas' : 'Solo no leídas'}
          </Button>
          {data && data.count.total > 0 && (
            <Button size="sm" onClick={handleMarcarTodas} className="gap-1">
              <CheckCheck className="h-4 w-4" />
              Marcar todas leídas
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error cargando alertas</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
        </div>
      )}

      {data && data.alertas.length === 0 && (
        <Alert>
          <Database className="h-4 w-4" />
          <AlertTitle>
            {soloNoLeidas ? 'Sin alertas pendientes' : 'Sin alertas registradas'}
          </AlertTitle>
          <AlertDescription>
            {soloNoLeidas
              ? 'Todo en orden. Las alertas aparecen acá cuando se detectan scrapers rotos, fuentes desactualizadas o datos nuevos.'
              : 'Ejecutá npm run alertas:check para correr el detector ahora.'}
          </AlertDescription>
        </Alert>
      )}

      {data && data.alertas.length > 0 && (
        <div className="space-y-2">
          {data.alertas.map(a => {
            const Icon = TIPO_ICON[a.tipo]
            return (
              <Card key={a.id} className={a.leida ? 'opacity-60' : ''}>
                <CardContent className="p-3 flex items-start gap-3">
                  <Icon className={`h-5 w-5 mt-0.5 shrink-0 ${severidadColor(a.severidad)}`} />
                  <div className="flex-1 min-w-0 space-y-1">
                    <div className="flex items-start justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className="font-medium text-sm">{a.titulo}</p>
                        <Badge variant="outline" className="text-[10px] py-0 h-5">
                          {TIPO_LABEL[a.tipo]}
                        </Badge>
                      </div>
                      <p className="text-xs text-muted-foreground shrink-0">
                        {fmtFecha(a.detectadoEn)}
                      </p>
                    </div>
                    {a.detalle && (
                      <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-mono">
                        {a.detalle}
                      </pre>
                    )}
                    <div className="flex items-center gap-2 pt-1">
                      {a.fuenteId && (
                        <Link
                          to="/fuentes"
                          className="text-xs text-primary hover:underline inline-flex items-center gap-1"
                        >
                          <Link2 className="h-3 w-3" />
                          Ver fuente
                        </Link>
                      )}
                      {!a.leida && (
                        <button
                          onClick={() => handleMarcarLeida(a.id)}
                          className="text-xs text-muted-foreground hover:text-foreground inline-flex items-center gap-1"
                        >
                          <X className="h-3 w-3" />
                          Marcar leída
                        </button>
                      )}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
