import { Plus, FolderPlus, Loader2 } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import {
  useCasos,
  useAgregarEntidadACaso,
  useAgregarContratoACaso,
  useAgregarSeñalACaso,
} from '@/lib/casoQueries'
import { toast } from 'sonner'
import { useNavigate } from 'react-router-dom'

type Payload =
  | { tipo: 'entidad'; nombre: string; cuit?: string; municipio?: string }
  | {
      tipo: 'contrato'
      hash: string
      proveedor: string
      monto: number
      anio: number
      tipo_contrato: string
      area?: string
      fuenteUrl?: string
    }
  | {
      tipo: 'señal'
      señalId: string
      tipologia: string
      titulo: string
      resumen: string
      score: number
      severidad: 'grave' | 'moderada' | 'leve'
      cuits: string[]
      evidencia: { descripcion: string; fuenteUrl: string }[]
      legal: object
    }

interface Props {
  payload: Payload
  size?: 'sm' | 'default'
  variant?: 'default' | 'outline' | 'ghost' | 'secondary'
  label?: string
}

export function AddToCase({ payload, size = 'sm', variant = 'outline', label }: Props) {
  const { user, configured } = useAuth()
  const { data: casos } = useCasos()
  const navigate = useNavigate()
  const agregarEntidad = useAgregarEntidadACaso()
  const agregarContrato = useAgregarContratoACaso()
  const agregarSeñal = useAgregarSeñalACaso()

  const pending =
    agregarEntidad.isPending ||
    agregarContrato.isPending ||
    agregarSeñal.isPending

  const buttonLabel = label ?? 'Agregar a caso'

  if (!configured || !user) {
    return (
      <Button
        size={size}
        variant={variant}
        className="gap-1.5"
        onClick={() => navigate('/login')}
      >
        <FolderPlus className="h-3.5 w-3.5" />
        {buttonLabel}
      </Button>
    )
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size={size} variant={variant} className="gap-1.5" disabled={pending}>
          {pending ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <FolderPlus className="h-3.5 w-3.5" />
          )}
          {buttonLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Agregar a un caso</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {!casos || casos.length === 0 ? (
          <DropdownMenuItem onClick={() => navigate('/casos')}>
            <Plus className="h-4 w-4 mr-2" /> Crear primer caso
          </DropdownMenuItem>
        ) : (
          casos.map((c) => (
            <DropdownMenuItem
              key={c.id}
              onClick={async () => {
                try {
                  if (payload.tipo === 'entidad') {
                    await agregarEntidad.mutateAsync({
                      casoId: c.id,
                      nombre: payload.nombre,
                      cuit: payload.cuit,
                      municipio: payload.municipio,
                    })
                  } else if (payload.tipo === 'contrato') {
                    await agregarContrato.mutateAsync({
                      casoId: c.id,
                      hash: payload.hash,
                      proveedor: payload.proveedor,
                      monto: payload.monto,
                      anio: payload.anio,
                      tipo: payload.tipo_contrato,
                      area: payload.area,
                      fuenteUrl: payload.fuenteUrl,
                    })
                  } else if (payload.tipo === 'señal') {
                    await agregarSeñal.mutateAsync({
                      casoId: c.id,
                      señalId: payload.señalId,
                      tipologia: payload.tipologia,
                      titulo: payload.titulo,
                      resumen: payload.resumen,
                      score: payload.score,
                      severidad: payload.severidad,
                      cuits: payload.cuits,
                      evidencia: payload.evidencia,
                      legal: payload.legal,
                    })
                  }
                  toast.success(`Agregado a "${c.titulo}"`)
                } catch (err) {
                  toast.error((err as Error).message)
                }
              }}
            >
              <span className="truncate">{c.titulo}</span>
            </DropdownMenuItem>
          ))
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate('/casos')}>
          <Plus className="h-4 w-4 mr-2" /> Ver todos los casos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
