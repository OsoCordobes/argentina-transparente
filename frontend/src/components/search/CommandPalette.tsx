import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Building2, Loader2 } from 'lucide-react'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import { useEntidadSearch } from '@/lib/queries'
import { fmtARS } from '@/lib/format'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function CommandPalette({ open, onOpenChange }: Props) {
  const [query, setQuery] = useState('')
  const navigate = useNavigate()
  const debounced = useDebounced(query, 200)
  const { data, isFetching } = useEntidadSearch(debounced)

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  const goToEntidad = (nombre: string) => {
    onOpenChange(false)
    navigate(`/entidad/${encodeURIComponent(nombre)}`)
  }

  return (
    <CommandDialog open={open} onOpenChange={onOpenChange}>
      <CommandInput
        placeholder="Buscar proveedor por nombre…"
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
        {debounced.length >= 2 && !isFetching && data?.entidades.length === 0 && (
          <CommandEmpty>Sin resultados para "{debounced}".</CommandEmpty>
        )}
        {data?.entidades && data.entidades.length > 0 && (
          <CommandGroup heading="Entidades">
            {data.entidades.map((e) => (
              <CommandItem
                key={`${e.proveedor}-${e.municipio}`}
                value={e.proveedor}
                onSelect={() => goToEntidad(e.proveedor)}
                className="flex items-center gap-2"
              >
                <Building2 className="h-4 w-4 text-muted-foreground" />
                <span className="truncate flex-1">{e.proveedor}</span>
                <span className="text-xs text-muted-foreground tabular-nums">
                  {fmtARS(e.monto_total)} · {e.total_contratos} contratos
                </span>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
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
