import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Briefcase, Users, FileText, Loader2 } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import { useActoresSearch, type ActorSearchHit, type ActorTipo } from '@/lib/queries'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

const TIPO_HEADING: Record<ActorTipo, string> = {
  funcionario: 'Funcionarios públicos',
  director: 'Directores y administradores',
  empresa: 'Personas jurídicas',
  proveedor: 'Proveedores con contratos',
}

const TIPO_ICON: Record<ActorTipo, React.ComponentType<{ className?: string }>> = {
  funcionario: Briefcase,
  director: Users,
  empresa: Building2,
  proveedor: FileText,
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const debounced = useDebounced(query, 200)

  // Búsqueda unificada (Iter5 análisis-datos): consulta /api/actores/search
  // que junta funcionarios + directores + empresas + proveedores en una
  // sola llamada. Antes solo se buscaba en proveedores de contratos.
  const { data, isFetching } = useActoresSearch(debounced, 'todos')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const goToHit = (hit: ActorSearchHit) => {
    onOpenChange(false)
    navigate(hit.href)
  }

  // Agrupar hits por tipo manteniendo el orden de score
  const grupos: Record<ActorTipo, ActorSearchHit[]> = {
    funcionario: [],
    director: [],
    empresa: [],
    proveedor: [],
  }
  for (const h of data?.hits ?? []) {
    grupos[h.tipo].push(h)
  }

  // Orden de presentación: proveedor (los que tienen contratos primero — más
  // accionables), luego empresa, luego funcionario, luego director.
  const ordenTipos: ActorTipo[] = ['proveedor', 'empresa', 'funcionario', 'director']

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar funcionario, empresa, director o CUIT…"
        value={query}
        onValueChange={setQuery}
      />
      <CommandList>
        {debounced.length < 2 && (
          <CommandEmpty>Escribí al menos 2 caracteres para buscar.</CommandEmpty>
        )}
        {debounced.length >= 2 && isFetching && (
          <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
            <Loader2 className="h-4 w-4 animate-spin" /> Buscando…
          </div>
        )}
        {debounced.length >= 2 && !isFetching && data && data.hits.length === 0 && (
          <CommandEmpty>Sin resultados para "{debounced}".</CommandEmpty>
        )}
        {data && data.hits.length > 0 && ordenTipos.map((tipo, idx) => {
          const items = grupos[tipo]
          if (items.length === 0) return null
          const Icon = TIPO_ICON[tipo]
          return (
            <div key={tipo}>
              {idx > 0 && <CommandSeparator />}
              <CommandGroup heading={TIPO_HEADING[tipo]}>
                {items.slice(0, 6).map((h, i) => (
                  <CommandItem
                    key={`${tipo}-${h.identificador ?? h.nombre}-${i}`}
                    value={`${tipo}|${h.nombre}|${h.identificador ?? ''}|${i}`}
                    onSelect={() => goToHit(h)}
                    className="flex items-center gap-2"
                  >
                    <Icon className="h-4 w-4 text-muted-foreground shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="truncate">{h.nombre}</div>
                      {h.detalle && (
                        <div className="text-xs text-muted-foreground truncate">
                          {h.detalle}
                        </div>
                      )}
                    </div>
                    {h.identificador && (
                      <span className="text-[10px] font-mono text-muted-foreground shrink-0">
                        {h.identificador}
                      </span>
                    )}
                  </CommandItem>
                ))}
              </CommandGroup>
            </div>
          )
        })}
      </CommandList>
    </CommandDialog>
  )
}

function useDebounced<T>(value: T, delay = 200): T {
  const [debounced, setDebounced] = useState(value)
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay)
    return () => clearTimeout(t)
  }, [value, delay])
  return debounced
}
