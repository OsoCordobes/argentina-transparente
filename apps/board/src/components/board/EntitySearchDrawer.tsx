import { useState, useCallback }              from 'react'
import { Search, Pin, Building2, User, FileText } from 'lucide-react'
import { Input }                               from '@/components/ui/input'
import { Button }                              from '@/components/ui/button'
import { Badge }                               from '@/components/ui/badge'
import { ScrollArea }                          from '@/components/ui/scroll-area'
import { api, SearchResult }                   from '@/lib/api'
import { useBoardStore, EntityType }           from '@/store/useBoardStore'
import type { Node }                           from '@xyflow/react'

const TIPO_ICONS: Record<string, typeof Building2> = {
  Empresa:  Building2,
  Persona:  User,
  Contrato: FileText,
}

function iconForTipo(tipo: string) {
  const Icon = TIPO_ICONS[tipo] ?? FileText
  return <Icon className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
}

export default function EntitySearchDrawer() {
  const [query,   setQuery]   = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [error,   setError]   = useState<string | null>(null)

  const { pinEntity, pinnedEntities, nodes, setNodes } = useBoardStore()

  const search = useCallback(async (q: string) => {
    if (q.trim().length < 2) { setResults([]); return }
    setLoading(true); setError(null)
    try {
      const data = await api.search(q)
      setResults(data.results)
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(false)
    }
  }, [])

  const handlePin = (result: SearchResult) => {
    const entityId = result.id
    if (pinnedEntities[entityId]) return

    pinEntity({
      entityId,
      entityType: result.tipo as EntityType,
      nombre:     result.nombre,
      pinnedAt:   Date.now(),
    })

    // Add a node to the canvas
    const existing = nodes.length
    const newNode: Node = {
      id:       entityId,
      type:     'entity',
      position: {
        x: 120 + (existing % 5) * 200,
        y: 100 + Math.floor(existing / 5) * 140,
      },
      data: {
        label:      result.nombre,
        entityType: result.tipo,
        entityId,
      },
    }
    setNodes([...nodes, newNode])
  }

  return (
    <div className="flex flex-col h-full">
      <div className="p-3 border-b">
        <h2 className="text-sm font-semibold mb-2 text-foreground">Buscar entidad</h2>
        <div className="relative">
          <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Empresa, persona, contrato…"
            className="pl-8 h-9 text-xs"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              search(e.target.value)
            }}
          />
        </div>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loading && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">Buscando…</p>
          )}
          {error && (
            <p className="text-xs text-destructive px-2 py-2">{error}</p>
          )}
          {!loading && results.length === 0 && query.length >= 2 && (
            <p className="text-xs text-muted-foreground px-2 py-4 text-center">Sin resultados</p>
          )}

          {results.map((r) => {
            const isPinned = Boolean(pinnedEntities[r.id])
            return (
              <div
                key={r.id}
                className="flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-accent group"
              >
                {iconForTipo(r.tipo)}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium truncate">{r.nombre}</p>
                  <Badge variant="outline" className="text-[10px] py-0 px-1 h-4 mt-0.5">
                    {r.tipo}
                  </Badge>
                </div>
                <Button
                  size="icon"
                  variant={isPinned ? 'secondary' : 'ghost'}
                  className="h-6 w-6 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  onClick={() => handlePin(r)}
                  title={isPinned ? 'Ya en el canvas' : 'Agregar al canvas'}
                >
                  <Pin className={`h-3 w-3 ${isPinned ? 'fill-current' : ''}`} />
                </Button>
              </div>
            )
          })}

          {/* Pinned entities list */}
          {Object.keys(pinnedEntities).length > 0 && (
            <>
              <div className="pt-3 pb-1">
                <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground px-2">
                  En el canvas ({Object.keys(pinnedEntities).length})
                </p>
              </div>
              {Object.values(pinnedEntities).map((e) => (
                <div
                  key={e.entityId}
                  className="flex items-center gap-2 rounded-md px-2 py-1.5 bg-accent/50"
                >
                  {iconForTipo(e.entityType)}
                  <p className="text-xs truncate flex-1">{e.nombre}</p>
                  <Pin className="h-3 w-3 fill-current text-primary shrink-0" />
                </div>
              ))}
            </>
          )}
        </div>
      </ScrollArea>
    </div>
  )
}
