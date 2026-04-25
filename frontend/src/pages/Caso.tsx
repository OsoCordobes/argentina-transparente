import { useEffect, useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  AlertTriangle,
  FolderOpen,
  Loader2,
  Trash2,
  ShieldAlert,
  Building2,
  FileSignature,
  ExternalLink,
  FileText,
  Save,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { useAuth } from '@/lib/auth'
import { useCaso, useGuardarNotas, useQuitarBookmark } from '@/lib/casoQueries'
import { fmtARS, fmtFecha } from '@/lib/format'
import { toast } from 'sonner'

export default function Caso() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { data, isLoading, error } = useCaso(id)
  const guardarNotas = useGuardarNotas()
  const quitar = useQuitarBookmark()

  const [notas, setNotas] = useState('')
  const [notasDirty, setNotasDirty] = useState(false)
  const [savingHint, setSavingHint] = useState<'idle' | 'saving' | 'saved'>('idle')

  useEffect(() => {
    if (data?.notas?.contenido != null) {
      setNotas(data.notas.contenido)
      setNotasDirty(false)
    }
  }, [data?.notas?.contenido])

  // Autosave 800ms tras último keystroke
  useEffect(() => {
    if (!notasDirty || !id) return
    setSavingHint('saving')
    const t = setTimeout(async () => {
      try {
        await guardarNotas.mutateAsync({ casoId: id, contenido: notas })
        setSavingHint('saved')
        setNotasDirty(false)
        setTimeout(() => setSavingHint('idle'), 1500)
      } catch (err) {
        toast.error((err as Error).message)
        setSavingHint('idle')
      }
    }, 800)
    return () => clearTimeout(t)
  }, [notas, notasDirty, id, guardarNotas])

  if (authLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin" />
      </div>
    )
  }
  if (!user) {
    return <Navigate to="/login" state={{ from: `/caso/${id}` }} replace />
  }

  if (isLoading) {
    return (
      <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-6 space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6">
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error cargando el caso</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      </div>
    )
  }

  if (!data) return null

  const totalBookmarks =
    data.entidades.length +
    data.contratos.length +
    data.directores.length +
    data.señales.length

  return (
    <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-6 space-y-4">
      <Link
        to="/casos"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Mis casos
      </Link>

      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="min-w-0 flex-1">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
            <FolderOpen className="h-6 w-6 inline mr-2 -mt-0.5" />
            {data.caso.titulo}
          </h1>
          {data.caso.descripcion && (
            <p className="text-sm text-muted-foreground mt-1">{data.caso.descripcion}</p>
          )}
          <div className="flex items-center gap-2 text-xs text-muted-foreground mt-2">
            <Badge variant="outline">{data.caso.estado}</Badge>
            <span>·</span>
            <span>creado {fmtFecha(data.caso.creado_en)}</span>
            <span>·</span>
            <span>{totalBookmarks} bookmarks</span>
          </div>
        </div>
        <Link to={`/caso/${id}/denuncia`}>
          <Button>
            <FileText className="h-4 w-4 mr-2" />
            Generar denuncia formal
          </Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 space-y-4">
          <Tabs defaultValue="entidades">
            <TabsList>
              <TabsTrigger value="entidades">
                Entidades
                <Badge variant="secondary" className="ml-2">
                  {data.entidades.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="contratos">
                Contratos
                <Badge variant="secondary" className="ml-2">
                  {data.contratos.length}
                </Badge>
              </TabsTrigger>
              <TabsTrigger value="señales">
                Señales
                <Badge variant="secondary" className="ml-2">
                  {data.señales.length}
                </Badge>
              </TabsTrigger>
            </TabsList>

            <TabsContent value="entidades" className="space-y-2 mt-4">
              {data.entidades.length === 0 ? (
                <EmptyHint
                  icon={<Building2 className="h-6 w-6" />}
                  text="Sin entidades. Andá al dashboard, abrí una entidad y hacé click en 'Agregar al caso'."
                />
              ) : (
                data.entidades.map((e) => (
                  <Card key={e.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <Building2 className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/entidad/${encodeURIComponent(e.nombre)}`}
                          className="font-medium hover:underline truncate block"
                        >
                          {e.nombre}
                        </Link>
                        <div className="text-xs text-muted-foreground">
                          {e.cuit && <code className="font-mono">{e.cuit}</code>}
                          {e.cuit && e.municipio && ' · '}
                          {e.municipio}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          quitar.mutate({ tipo: 'entidad', id: e.id, casoId: id! })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="contratos" className="space-y-2 mt-4">
              {data.contratos.length === 0 ? (
                <EmptyHint
                  icon={<FileSignature className="h-6 w-6" />}
                  text="Sin contratos. Abrí una ficha de contrato y agregalo al caso."
                />
              ) : (
                data.contratos.map((c) => (
                  <Card key={c.id}>
                    <CardContent className="p-3 flex items-center gap-3">
                      <FileSignature className="h-4 w-4 text-muted-foreground shrink-0" />
                      <div className="min-w-0 flex-1">
                        <Link
                          to={`/contrato/${c.hash}`}
                          className="font-medium hover:underline truncate block text-sm"
                        >
                          {c.tipo} · {c.proveedor}
                        </Link>
                        <div className="text-xs text-muted-foreground tabular-nums">
                          {c.anio} · {fmtARS(c.monto)}
                        </div>
                      </div>
                      {c.fuente_url && (
                        <a
                          href={c.fuente_url}
                          target="_blank"
                          rel="noreferrer"
                          className="text-muted-foreground hover:text-primary"
                          title="Fuente oficial"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          quitar.mutate({ tipo: 'contrato', id: c.id, casoId: id! })
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </CardContent>
                  </Card>
                ))
              )}
            </TabsContent>

            <TabsContent value="señales" className="space-y-2 mt-4">
              {data.señales.length === 0 ? (
                <EmptyHint
                  icon={<ShieldAlert className="h-6 w-6" />}
                  text="Sin señales. Andá a una entidad o al dashboard y agregá señales relevantes."
                />
              ) : (
                data.señales.map((s) => (
                  <Card key={s.id}>
                    <CardHeader className="pb-2">
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
                            {s.severidad ?? 'leve'}
                          </Badge>
                          <CardTitle className="text-sm mt-2 leading-snug">
                            {s.titulo}
                          </CardTitle>
                          <CardDescription className="text-xs mt-1">
                            {s.tipologia.replace(/_/g, ' ')}
                          </CardDescription>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-xs text-muted-foreground tabular-nums">
                            score {s.score}
                          </span>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() =>
                              quitar.mutate({ tipo: 'senal', id: s.id, casoId: id! })
                            }
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardHeader>
                    {s.resumen && (
                      <CardContent className="text-sm text-muted-foreground line-clamp-2">
                        {s.resumen}
                      </CardContent>
                    )}
                  </Card>
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>

        <Card className="lg:sticky lg:top-20 self-start">
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Notas</CardTitle>
              <span className="text-xs text-muted-foreground inline-flex items-center gap-1">
                {savingHint === 'saving' && (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" /> Guardando…
                  </>
                )}
                {savingHint === 'saved' && (
                  <>
                    <Save className="h-3 w-3 text-green-500" /> Guardado
                  </>
                )}
                {savingHint === 'idle' && notasDirty && '• sin guardar'}
              </span>
            </div>
            <CardDescription>
              Markdown. Autosave a los 800ms tras detener edición.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Textarea
              value={notas}
              onChange={(e) => {
                setNotas(e.target.value)
                setNotasDirty(true)
              }}
              placeholder="# Hipótesis&#10;&#10;- Patrón observado: ...&#10;- Evidencia clave: ...&#10;- Próximo paso: ..."
              className="min-h-[400px] font-mono text-sm"
            />
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function EmptyHint({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <Card>
      <CardContent className="py-8 text-center text-sm text-muted-foreground">
        <div className="flex items-center justify-center mb-2 opacity-50">{icon}</div>
        {text}
      </CardContent>
    </Card>
  )
}
