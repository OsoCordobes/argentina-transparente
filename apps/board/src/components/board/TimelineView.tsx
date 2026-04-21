import { useEffect, useState }           from 'react'
import { Calendar, ExternalLink, Clock } from 'lucide-react'
import { ScrollArea }                    from '@/components/ui/scroll-area'
import { Badge }                         from '@/components/ui/badge'
import { api, type TimelineEvent }       from '@/lib/api'
import { useBoardStore, type EntityNode }from '@/store/useBoardStore'

// ─── Types ─────────────────────────────────────────────────────────────────

interface EntityEvent extends TimelineEvent {
  entityId:   string
  entityName: string
  color:      string
}

// Stable color palette for entities
const ENTITY_COLORS = [
  '#3b82f6', // blue
  '#10b981', // emerald
  '#f59e0b', // amber
  '#8b5cf6', // violet
  '#ef4444', // red
  '#06b6d4', // cyan
  '#f97316', // orange
  '#84cc16', // lime
]

function colorFor(index: number): string {
  return ENTITY_COLORS[index % ENTITY_COLORS.length]
}

// ─── Sub-components ─────────────────────────────────────────────────────────

function EventCard({ event, color }: { event: EntityEvent; color: string }) {
  return (
    <div className="flex gap-3 group">
      {/* Dot + line */}
      <div className="flex flex-col items-center">
        <div
          className="h-3 w-3 rounded-full shrink-0 mt-0.5 ring-2 ring-background"
          style={{ backgroundColor: color }}
        />
        <div className="flex-1 w-px bg-border" />
      </div>

      {/* Content */}
      <div className="pb-4 flex-1 min-w-0">
        <div className="flex items-start gap-2 flex-wrap">
          <span className="text-xs font-medium leading-tight">{event.titulo}</span>
          {event.fuente_url && (
            <a
              href={event.fuente_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground transition-colors shrink-0"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>

        <div className="flex items-center gap-2 mt-1 flex-wrap">
          <Badge
            variant="outline"
            className="text-[10px] px-1.5 py-0 h-4"
            style={{ borderColor: color, color }}
          >
            {event.entityName}
          </Badge>
          {event.descripcion && (
            <span className="text-[10px] text-muted-foreground truncate max-w-[300px]">
              {event.descripcion}
            </span>
          )}
        </div>
      </div>
    </div>
  )
}

function YearGroup({ year, events }: { year: number; events: EntityEvent[] }) {
  const totalByEntity = events.reduce<Record<string, number>>((acc, e) => {
    acc[e.entityId] = (acc[e.entityId] ?? 0) + 1
    return acc
  }, {})

  return (
    <div className="mb-6">
      {/* Year header */}
      <div className="flex items-center gap-3 mb-3 sticky top-0 bg-background/95 backdrop-blur py-1 z-10">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-bold">{year}</span>
        </div>
        <div className="flex-1 h-px bg-border" />
        <span className="text-[10px] text-muted-foreground shrink-0">
          {events.length} contrato{events.length !== 1 ? 's' : ''} ·{' '}
          {Object.keys(totalByEntity).length} proveedor{Object.keys(totalByEntity).length !== 1 ? 'es' : ''}
        </span>
      </div>

      {/* Events */}
      <div className="pl-2">
        {events.map((ev) => (
          <EventCard key={ev.id} event={ev} color={ev.color} />
        ))}
      </div>
    </div>
  )
}

// ─── Main component ──────────────────────────────────────────────────────────

export default function TimelineView() {
  const { pinnedEntities } = useBoardStore()
  const [events,  setEvents]  = useState<EntityEvent[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const pinnedList = Object.values(pinnedEntities)

  useEffect(() => {
    if (pinnedList.length === 0) {
      setEvents([])
      return
    }

    let cancelled = false
    setLoading(true)
    setError(null)

    Promise.all(
      pinnedList.map((entity: EntityNode, idx: number) =>
        api.timeline(entity.entityId)
          .then(({ events }) =>
            events.map((ev: TimelineEvent): EntityEvent => ({
              ...ev,
              entityId:   entity.entityId,
              entityName: entity.nombre,
              color:      colorFor(idx),
            }))
          )
          .catch(() => [] as EntityEvent[])
      )
    ).then((results) => {
      if (cancelled) return
      const all = results
        .flat()
        .sort((a, b) => a.fecha - b.fecha)
      setEvents(all)
      setLoading(false)
    })

    return () => { cancelled = true }
  }, [pinnedList.map(e => e.entityId).join(',')])

  // Group by year
  const byYear = events.reduce<Record<number, EntityEvent[]>>((acc, ev) => {
    ;(acc[ev.fecha] ??= []).push(ev)
    return acc
  }, {})

  const years = Object.keys(byYear)
    .map(Number)
    .sort((a, b) => a - b)

  // ─── Empty / loading states ────────────────────────────────────────────────

  if (pinnedList.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Clock className="h-8 w-8 mx-auto mb-3 opacity-30" />
          <p className="text-sm font-medium">Sin entidades en el canvas</p>
          <p className="text-xs mt-1">Anclá una empresa o persona para ver su línea de tiempo</p>
        </div>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <div className="text-center">
          <Clock className="h-6 w-6 mx-auto mb-2 animate-pulse" />
          <p className="text-xs">Cargando contratos…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 flex items-center justify-center text-destructive">
        <p className="text-xs">{error}</p>
      </div>
    )
  }

  if (events.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-muted-foreground">
        <p className="text-xs">No se encontraron contratos para las entidades ancladas.</p>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Legend */}
      <div className="px-4 py-2 border-b flex items-center gap-3 flex-wrap">
        {pinnedList.map((entity, idx) => (
          <div key={entity.entityId} className="flex items-center gap-1.5">
            <div
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: colorFor(idx) }}
            />
            <span className="text-[10px] text-muted-foreground truncate max-w-[120px]">
              {entity.nombre}
            </span>
          </div>
        ))}
        <span className="text-[10px] text-muted-foreground ml-auto">
          {events.length} contratos · {years.length} años
        </span>
      </div>

      <ScrollArea className="flex-1">
        <div className="px-4 py-4">
          {years.map((year) => (
            <YearGroup key={year} year={year} events={byYear[year]} />
          ))}
        </div>
      </ScrollArea>
    </div>
  )
}
