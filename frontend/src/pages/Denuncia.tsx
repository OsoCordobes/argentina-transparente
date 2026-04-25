import { useState } from 'react'
import { Link, Navigate, useParams } from 'react-router-dom'
import { z } from 'zod'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  ArrowLeft,
  AlertTriangle,
  Loader2,
  FileText,
  Building2,
  CheckCircle2,
  Download,
} from 'lucide-react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { useAuth } from '@/lib/auth'
import { useCaso } from '@/lib/casoQueries'
import { fmtARS } from '@/lib/format'
import { toast } from 'sonner'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

const DESTINATARIOS = [
  {
    id: 'tribunal_cuentas',
    label: 'Tribunal de Cuentas',
    descripcion: 'Control externo sobre la administración pública',
  },
  {
    id: 'fiscalia',
    label: 'Fiscalía / Ministerio Público Fiscal',
    descripcion: 'Persecución penal de delitos contra la administración pública',
  },
  {
    id: 'cndc',
    label: 'CNDC — Comisión Nacional de Defensa de la Competencia',
    descripcion: 'Colusión, cartelización y distorsión de competencia',
  },
  {
    id: 'arca',
    label: 'ARCA (ex-AFIP)',
    descripcion: 'Evasión, simulación, facturación apócrifa',
  },
  {
    id: 'defensoria',
    label: 'Defensoría del Pueblo',
    descripcion: 'Vulneración de derechos colectivos',
  },
] as const

const schema = z.object({
  destinatario: z.string().min(1, 'Seleccioná un destinatario'),
  denuncianteNombre: z.string().min(2, 'Nombre requerido'),
  denuncianteDni: z.string().min(7, 'DNI requerido').max(12),
  denuncianteEmail: z.string().email('Email inválido'),
  denuncianteTelefono: z.string().optional(),
  denuncianteDomicilio: z.string().min(5, 'Domicilio requerido'),
  hechos: z.string().min(50, 'Mínimo 50 caracteres describiendo los hechos'),
  petitorio: z.string().min(20, 'Petitorio requerido'),
})

type FormValues = z.infer<typeof schema>

export default function Denuncia() {
  const { id } = useParams<{ id: string }>()
  const { user, loading: authLoading } = useAuth()
  const { data, isLoading } = useCaso(id)
  const [step, setStep] = useState(0)
  const [generated, setGenerated] = useState<{
    pdfUrl: string
    sha256: string
    timestamp: string
  } | null>(null)
  const [submitting, setSubmitting] = useState(false)

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      destinatario: '',
      denuncianteNombre: '',
      denuncianteDni: '',
      denuncianteEmail: '',
      denuncianteTelefono: '',
      denuncianteDomicilio: '',
      hechos: '',
      petitorio:
        'Solicito se dé curso a la presente denuncia, se investiguen los hechos descriptos y se determinen las responsabilidades administrativas y/o penales que correspondan. Pido se tenga por presentada toda la prueba documental anexa, cuya cadena de custodia obra en autos.',
    },
  })

  if (authLoading) {
    return <div className="flex items-center justify-center min-h-[40vh]"><Loader2 className="h-6 w-6 animate-spin" /></div>
  }
  if (!user) return <Navigate to="/login" state={{ from: `/caso/${id}/denuncia` }} replace />
  if (isLoading) {
    return (
      <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-3">
        <Skeleton className="h-8 w-1/3" />
        <Skeleton className="h-40 w-full" />
      </div>
    )
  }
  if (!data) return null

  const hasEvidence =
    data.entidades.length + data.contratos.length + data.señales.length > 0

  const submit = async (values: FormValues) => {
    if (!hasEvidence) {
      toast.error('No hay evidencia en el caso. Agregá entidades, contratos o señales antes.')
      return
    }
    setSubmitting(true)
    try {
      const res = await fetch(`${API_URL}/api/denuncia`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...values,
          casoTitulo: data.caso.titulo,
          casoDescripcion: data.caso.descripcion,
          entidades: data.entidades,
          contratos: data.contratos,
          señales: data.señales,
        }),
      })
      if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`)
      const sha256 = res.headers.get('x-document-sha256') ?? ''
      const timestamp = res.headers.get('x-document-timestamp') ?? new Date().toISOString()
      const blob = await res.blob()
      const pdfUrl = URL.createObjectURL(blob)
      setGenerated({ pdfUrl, sha256, timestamp })
      toast.success('PDF generado con cadena de custodia')
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      setSubmitting(false)
    }
  }

  if (generated) {
    return (
      <div className="mx-auto max-w-2xl px-4 md:px-6 py-8 space-y-4">
        <Link
          to={`/caso/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" /> Volver al caso
        </Link>
        <Alert>
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>Denuncia generada</AlertTitle>
          <AlertDescription>
            El PDF tiene cadena de custodia: hash SHA256 del documento + timestamp ISO
            del servidor + URLs de fuente de cada contrato citado.
          </AlertDescription>
        </Alert>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trazabilidad forense</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div>
              <div className="text-xs text-muted-foreground">SHA256 del PDF</div>
              <code className="font-mono text-xs break-all">{generated.sha256 || '—'}</code>
            </div>
            <div>
              <div className="text-xs text-muted-foreground">Timestamp servidor</div>
              <code className="font-mono text-xs">{generated.timestamp}</code>
            </div>
            <div className="pt-2">
              <a href={generated.pdfUrl} download={`denuncia-${id}.pdf`}>
                <Button className="w-full">
                  <Download className="h-4 w-4 mr-2" />
                  Descargar PDF
                </Button>
              </a>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-3xl px-4 md:px-6 py-6 space-y-4">
      <Link
        to={`/caso/${id}`}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-3.5 w-3.5" /> Volver al caso
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <FileText className="h-6 w-6" /> Generar denuncia formal
        </h1>
        <p className="text-sm text-muted-foreground mt-1">
          Caso: <strong>{data.caso.titulo}</strong>
        </p>
      </div>

      {!hasEvidence && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Caso sin evidencia</AlertTitle>
          <AlertDescription>
            Tenés que agregar al menos una entidad, contrato o señal al caso antes de
            generar denuncia.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2 text-sm">
        {['Destinatario', 'Denunciante', 'Hechos', 'Evidencia', 'Petitorio'].map((label, i) => (
          <div key={label} className="flex items-center gap-2">
            <span
              className={`h-6 w-6 rounded-full flex items-center justify-center text-xs ${
                i <= step
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {i + 1}
            </span>
            <span
              className={
                i === step
                  ? 'font-medium'
                  : i < step
                    ? 'text-muted-foreground'
                    : 'text-muted-foreground/50'
              }
            >
              {label}
            </span>
            {i < 4 && <span className="text-muted-foreground/50 mx-1">·</span>}
          </div>
        ))}
      </div>

      <Card>
        <CardContent className="pt-6 space-y-4">
          {step === 0 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Destinatario de la denuncia</h2>
              <div className="grid grid-cols-1 gap-2">
                {DESTINATARIOS.map((d) => (
                  <label
                    key={d.id}
                    className={`border rounded-md p-3 cursor-pointer hover:bg-accent/50 ${
                      form.watch('destinatario') === d.id
                        ? 'border-primary bg-accent/30'
                        : ''
                    }`}
                  >
                    <input
                      type="radio"
                      value={d.id}
                      {...form.register('destinatario')}
                      className="mr-2"
                    />
                    <span className="font-medium">{d.label}</span>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {d.descripcion}
                    </p>
                  </label>
                ))}
              </div>
              {form.formState.errors.destinatario && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.destinatario.message}
                </p>
              )}
            </div>
          )}

          {step === 1 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Datos del denunciante</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <Field label="Nombre completo" error={form.formState.errors.denuncianteNombre?.message}>
                  <Input {...form.register('denuncianteNombre')} />
                </Field>
                <Field label="DNI" error={form.formState.errors.denuncianteDni?.message}>
                  <Input {...form.register('denuncianteDni')} placeholder="00.000.000" />
                </Field>
                <Field label="Email" error={form.formState.errors.denuncianteEmail?.message}>
                  <Input type="email" {...form.register('denuncianteEmail')} />
                </Field>
                <Field label="Teléfono (opcional)" error={form.formState.errors.denuncianteTelefono?.message}>
                  <Input {...form.register('denuncianteTelefono')} />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Domicilio constituido" error={form.formState.errors.denuncianteDomicilio?.message}>
                    <Input {...form.register('denuncianteDomicilio')} placeholder="Calle, número, ciudad, provincia" />
                  </Field>
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Relato de los hechos</h2>
              <p className="text-sm text-muted-foreground">
                Describí los hechos de manera cronológica y específica. La narrativa
                automática que arma ARGOS te puede servir como base — pegala y editala.
              </p>
              <Textarea
                rows={10}
                placeholder="Que vengo por el presente a denunciar formalmente los hechos descriptos a continuación..."
                {...form.register('hechos')}
              />
              {form.formState.errors.hechos && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.hechos.message}
                </p>
              )}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  form.setValue(
                    'hechos',
                    construirNarrativa(data.caso.titulo, data.entidades, data.contratos, data.señales)
                  )
                }}
                type="button"
              >
                Generar narrativa desde el caso
              </Button>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Evidencia anexa</h2>
              <p className="text-sm text-muted-foreground">
                Esta evidencia se anexará al PDF con cadena de custodia (URL de fuente
                + hash + fecha de descarga).
              </p>
              <div className="space-y-2">
                {data.entidades.map((e) => (
                  <div key={e.id} className="border rounded-md p-2 text-sm flex items-center gap-2">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>{e.nombre}</span>
                    {e.cuit && <Badge variant="outline">{e.cuit}</Badge>}
                  </div>
                ))}
                {data.contratos.map((c) => (
                  <div key={c.id} className="border rounded-md p-2 text-sm">
                    <div className="font-medium">{c.tipo} — {c.proveedor}</div>
                    <div className="text-xs text-muted-foreground">
                      {c.anio} · {fmtARS(c.monto)} · hash <code className="font-mono">{c.hash.slice(0, 8)}…</code>
                    </div>
                  </div>
                ))}
                {data.señales.map((s) => (
                  <div key={s.id} className="border rounded-md p-2 text-sm">
                    <Badge
                      variant={s.severidad === 'grave' ? 'destructive' : 'secondary'}
                      className="mb-1"
                    >
                      {s.severidad ?? 'leve'}
                    </Badge>
                    <div className="font-medium">{s.titulo}</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <h2 className="font-semibold">Petitorio</h2>
              <p className="text-sm text-muted-foreground">
                Lo que pedís al organismo. Por defecto cargamos un petitorio genérico
                — editá según corresponda.
              </p>
              <Textarea rows={8} {...form.register('petitorio')} />
              {form.formState.errors.petitorio && (
                <p className="text-xs text-destructive">
                  {form.formState.errors.petitorio.message}
                </p>
              )}
            </div>
          )}

          <div className="flex justify-between pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              disabled={step === 0}
              onClick={() => setStep((s) => s - 1)}
            >
              Anterior
            </Button>
            {step < 4 ? (
              <Button
                type="button"
                onClick={async () => {
                  const fields: (keyof FormValues)[][] = [
                    ['destinatario'],
                    ['denuncianteNombre', 'denuncianteDni', 'denuncianteEmail', 'denuncianteDomicilio'],
                    ['hechos'],
                    [],
                    [],
                  ]
                  const ok = await form.trigger(fields[step])
                  if (ok) setStep((s) => s + 1)
                }}
              >
                Siguiente
              </Button>
            ) : (
              <Button
                type="button"
                disabled={submitting || !hasEvidence}
                onClick={form.handleSubmit(submit)}
              >
                {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                Generar PDF
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

function Field({
  label,
  error,
  children,
}: {
  label: string
  error?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-sm font-medium block mb-1">{label}</label>
      {children}
      {error && <p className="text-xs text-destructive mt-1">{error}</p>}
    </div>
  )
}

function construirNarrativa(
  casoTitulo: string,
  entidades: { nombre: string; cuit: string | null }[],
  contratos: { proveedor: string; monto: number; anio: number; tipo: string }[],
  señales: { titulo: string; severidad: 'grave' | 'moderada' | 'leve' | null }[]
): string {
  const ARS = (n: number) =>
    new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 }).format(n)
  const partes: string[] = []
  partes.push(`Que en el marco del caso "${casoTitulo}" he relevado los siguientes hechos:`)
  partes.push('')
  if (entidades.length > 0) {
    partes.push(`I. ENTIDADES INVOLUCRADAS`)
    entidades.forEach((e, i) => {
      partes.push(
        `${i + 1}. ${e.nombre}${e.cuit ? ` (CUIT ${e.cuit})` : ''}, identificada como contraparte del Estado en uno o más actos administrativos analizados.`
      )
    })
    partes.push('')
  }
  if (contratos.length > 0) {
    partes.push(`II. ACTOS ADMINISTRATIVOS DENUNCIADOS`)
    contratos.forEach((c, i) => {
      partes.push(
        `${i + 1}. Contrato ${c.tipo} año ${c.anio} adjudicado a "${c.proveedor}" por un monto de ${ARS(c.monto)}. Toda la información obra en el dataset oficial citado en el anexo.`
      )
    })
    partes.push('')
  }
  if (señales.length > 0) {
    partes.push(`III. SEÑALES DE RIESGO DETECTADAS`)
    señales.forEach((s, i) => {
      partes.push(`${i + 1}. [${(s.severidad ?? 'leve').toUpperCase()}] ${s.titulo}`)
    })
    partes.push('')
  }
  partes.push(
    'Que las pruebas documentales que se acompañan al presente, así como los enlaces a los datasets oficiales y los hashes SHA256 de cada pieza de evidencia, garantizan la cadena de custodia y permiten la verificación independiente de los hechos descriptos.'
  )
  return partes.join('\n')
}
