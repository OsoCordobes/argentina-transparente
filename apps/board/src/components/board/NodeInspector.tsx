import { useEffect, useState }               from 'react'
import { X, AlertTriangle, ExternalLink }    from 'lucide-react'
import { Button }                            from '@/components/ui/button'
import { Badge }                             from '@/components/ui/badge'
import { ScrollArea }                        from '@/components/ui/scroll-area'
import { Separator }                         from '@/components/ui/separator'
import { Textarea }                          from '@/components/ui/textarea'
import { useBoardStore, Hallazgo }           from '@/store/useBoardStore'
import { api, EntidadProfile, TimelineEvent } from '@/lib/api'

const SEVERIDAD_COLORS: Record<string, string> = {
  grave:    'bg-red-100 text-red-800 border-red-300',
  moderada: 'bg-amber-100 text-amber-800 border-amber-300',
  leve:     'bg-yellow-50 text-yellow-700 border-yellow-200',
}

export default function NodeInspector() {
  const { selectedNodeId, selectNode, pinnedEntities, setNota, hallazgos } = useBoardStore()
  const entity = selectedNodeId ? pinnedEntities[selectedNodeId] : null

  const [profile,  setProfile]  = useState<EntidadProfile | null>(null)
  const [timeline, setTimeline] = useState<TimelineEvent[]>([])
  const [nota,     setNotaLocal] = useState('')
  const [tab,      setTab]      = useState<'señales' | 'contratos' | 'notas'>('señales')
  const [loading,  setLoading]  = useState(false)

  // Sync nota from store
  useEffect(() => {
    if (entity) setNotaLocal(entity.nota ?? '')
  }, [entity?.entityId]) // eslint-disable-line

  // Load profile when entity changes
  useEffect(() => {
    if (!entity) return
    setLoading(true)
    setProfile(null)
    setTimeline([])

    Promise.all([
      api.entidad(entity.entityId).catch(() => null),
      api.timeline(entity.entityId).catch(() => ({ events: [] })),
    ]).then(([prof, tl]) => {
      setProfile(prof)
      setTimeline(tl.events)
    }).finally(() => setLoading(false))
  }, [entity?.entityId]) // eslint-disable-line

  if (!entity) return null

  // Filter hallazgos relevant to this entity
  const entityHallazgos = hallazgos.filter((h: Hallazgo) =>
    h.entidades_afectadas.some(
      e => e.id === entity.entityId || e.nombre.toUpperCase().includes(entity.nombre.toUpperCase().slice(0, 8))
    )
  )

  const saveNota = () => setNota(entity.entityId, nota)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-3 border-b flex items-start justify-between gap-2">
        <div className="min-w-0">
          <Badge variant="outline" className="text-[10px] mb-1">{entity.entityType}</Badge>
          <h2 className="text-sm font-semibold leading-tight break-words">{entity.nombre}</h2>
        </div>
        <Button
          size="icon" variant="ghost" className="h-6 w-6 shrink-0"
          onClick={() => selectNode(null)}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Tabs */}
      <div className="flex border-b text-xs">
        {(['señales', 'contratos', 'notas'] as const).map((t) => (
          <button
            key={t}
            className={`px-3 py-2 capitalize transition-colors ${
              tab === t
                ? 'border-b-2 border-primary font-medium'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            onClick={() => setTab(t)}
          >
            {t}
            {t === 'señales' && entityHallazgos.length > 0 && (
              <span className="ml-1 bg-destructive text-destructive-foreground rounded-full px-1.5 py-0.5 text-[9px]">
                {entityHallazgos.length}
              </span>
            )}
          </button>
        ))}
      </div>

      <ScrollArea className="flex-1">
        <div className="p-3">
          {loading && <p className="text-xs text-muted-foreground text-center py-4">Cargando…</p>}

          {/* Señales tab */}
          {tab === 'señales' && (
            <div className="space-y-3">
              {entityHallazgos.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground text-center py-4">
                  Sin señales detectadas para esta entidad.
                </p>
              )}
              {entityHallazgos.map((h: Hallazgo) => (
                <div key={h.id} className="rounded-md border p-2.5 space-y-1.5">
                  <div className="flex items-start gap-2">
                    <AlertTriangle className="h-3.5 w-3.5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="min-w-0">
                      <Badge
                        variant="outline"
                        className={`text-[10px] mb-1 ${SEVERIDAD_COLORS[h.severidad] ?? ''}`}
                      >
                        {h.severidad} · score {h.score}
                      </Badge>
                      <p className="text-xs font-medium leading-snug">{h.titulo}</p>
                    </div>
                  </div>
                  <p className="text-[11px] text-muted-foreground leading-relaxed">{h.resumen}</p>
                  {h.evidencia.length > 0 && (
                    <div className="space-y-0.5">
                      {h.evidencia.slice(0, 2).map((ev, i) => (
                        <a
                          key={i}
                          href={ev.fuente_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="flex items-center gap-1 text-[10px] text-primary hover:underline"
                        >
                          <ExternalLink className="h-2.5 w-2.5 shrink-0" />
                          <span className="truncate">{ev.descripcion.slice(0, 60)}</span>
                        </a>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* Contratos tab */}
          {tab === 'contratos' && (
            <div className="space-y-2">
              {timeline.length === 0 && !loading && (
                <p className="text-xs text-muted-foreground text-center py-4">Sin contratos registrados.</p>
              )}
              {timeline.map((ev) => (
                <div key={ev.id} className="rounded-md border p-2 space-y-0.5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-muted-foreground">{ev.fecha}</span>
                    <a
                      href={ev.fuente_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[10px] text-primary hover:underline flex items-center gap-0.5"
                    >
                      <ExternalLink className="h-2.5 w-2.5" /> Fuente
                    </a>
                  </div>
                  <p className="text-xs font-medium">{ev.titulo}</p>
                  {ev.descripcion && (
                    <p className="text-[10px] text-muted-foreground truncate">{ev.descripcion}</p>
                  )}
                </div>
              ))}

              {/* Profile directors */}
              {profile?.directores && profile.directores.length > 0 && (
                <>
                  <Separator className="my-2" />
                  <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                    Directores / Socios
                  </p>
                  {profile.directores.map((d) => (
                    <div key={d} className="text-xs px-1 py-0.5 rounded bg-muted/50">{d}</div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* Notas tab */}
          {tab === 'notas' && (
            <div className="space-y-2">
              <Textarea
                placeholder="Agregar nota de investigación sobre esta entidad…"
                className="text-xs min-h-[120px] resize-none"
                value={nota}
                onChange={(e) => setNotaLocal(e.target.value)}
              />
              <Button size="sm" className="w-full text-xs" onClick={saveNota}>
                Guardar nota
              </Button>
              {entity.nota && (
                <div className="mt-2 p-2 rounded-md bg-muted text-xs text-muted-foreground whitespace-pre-wrap">
                  {entity.nota}
                </div>
              )}
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
