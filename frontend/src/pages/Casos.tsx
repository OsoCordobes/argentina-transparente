import { useState } from 'react'
import { Link, Navigate } from 'react-router-dom'
import { Plus, FolderOpen, Trash2, AlertTriangle, Loader2 } from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { useAuth } from '@/lib/auth'
import { useCasos, useCrearCaso, useBorrarCaso } from '@/lib/casoQueries'
import { fmtFecha } from '@/lib/format'
import { toast } from 'sonner'

export default function Casos() {
  const { user, configured, loading: authLoading } = useAuth()
  const { data: casos, isLoading, error } = useCasos()
  const crear = useCrearCaso()
  const borrar = useBorrarCaso()
  const [open, setOpen] = useState(false)
  const [titulo, setTitulo] = useState('')
  const [descripcion, setDescripcion] = useState('')

  if (authLoading) {
    return (
      <div className="min-h-[40vh] flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    )
  }

  if (!user) {
    return <Navigate to="/login" state={{ from: '/casos' }} replace />
  }

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-6">
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Mis casos</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Carpetas de investigación con bookmarks y notas
          </p>
        </div>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" /> Nuevo caso
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Crear caso</DialogTitle>
              <DialogDescription>
                Un caso agrupa entidades, contratos y señales para una investigación
                específica.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium block mb-1.5">Título</label>
                <Input
                  value={titulo}
                  onChange={(e) => setTitulo(e.target.value)}
                  placeholder="Ej: Concentración en obras públicas Córdoba 2022"
                />
              </div>
              <div>
                <label className="text-sm font-medium block mb-1.5">
                  Descripción <span className="text-muted-foreground">(opcional)</span>
                </label>
                <Textarea
                  value={descripcion}
                  onChange={(e) => setDescripcion(e.target.value)}
                  placeholder="Hipótesis o contexto del caso"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancelar
              </Button>
              <Button
                disabled={titulo.trim().length < 3 || crear.isPending}
                onClick={async () => {
                  try {
                    const caso = await crear.mutateAsync({
                      titulo: titulo.trim(),
                      descripcion: descripcion.trim() || undefined,
                    })
                    toast.success('Caso creado')
                    setOpen(false)
                    setTitulo('')
                    setDescripcion('')
                    window.location.assign(`/caso/${caso.id}`)
                  } catch (err) {
                    toast.error((err as Error).message)
                  }
                }}
              >
                {crear.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Crear
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      {!configured && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Supabase no configurado</AlertTitle>
          <AlertDescription>
            La persistencia de casos requiere Supabase. Aplicá la migración{' '}
            <code className="text-xs">supabase/migrations/0001_casos.sql</code> y
            definí <code className="text-xs">VITE_SUPABASE_URL</code> +{' '}
            <code className="text-xs">VITE_SUPABASE_ANON_KEY</code>.
          </AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error cargando casos</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-28 w-full" />
          ))}
        </div>
      ) : casos && casos.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
          {casos.map((c) => (
            <Card key={c.id} className="hover:border-foreground/20 transition-colors">
              <CardHeader className="pb-2">
                <div className="flex items-start justify-between gap-2">
                  <Link to={`/caso/${c.id}`} className="min-w-0 flex-1">
                    <CardTitle className="text-base hover:underline truncate">
                      <FolderOpen className="h-4 w-4 inline mr-1.5 -mt-0.5" />
                      {c.titulo}
                    </CardTitle>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground hover:text-destructive shrink-0 -mr-2 -mt-1"
                    onClick={async () => {
                      if (!confirm(`¿Borrar caso "${c.titulo}"?`)) return
                      try {
                        await borrar.mutateAsync(c.id)
                        toast.success('Caso borrado')
                      } catch (err) {
                        toast.error((err as Error).message)
                      }
                    }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {c.descripcion && (
                  <CardDescription className="line-clamp-2">
                    {c.descripcion}
                  </CardDescription>
                )}
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground flex items-center justify-between">
                <span>Actualizado {fmtFecha(c.actualizado_en)}</span>
                <span className="capitalize">{c.estado}</span>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="py-10 text-center text-sm text-muted-foreground">
            <FolderOpen className="h-8 w-8 mx-auto mb-3 opacity-50" />
            Aún no creaste ningún caso. Empezá uno arriba.
          </CardContent>
        </Card>
      )}
    </div>
  )
}
