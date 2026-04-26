/**
 * Actores.tsx — Mapa del poder unificado.
 *
 * Tres vistas en una página según URL:
 *   /actores                       → buscador (Iter 3 análisis-datos)
 *   /actores/persona/:nombre       → perfil persona física
 *   /actores/empresa/:cuit         → perfil persona jurídica
 *
 * Backend: /api/actores/* (definido en routes/actores.ts).
 * Tablas que activa: agentes_publicos (178K), igj_autoridades (2.29M),
 * igj_entidades (420K), rns_personas_juridicas (196K). Esas filas estaban
 * dormidas hasta hoy.
 */
import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import {
  ArrowLeft, Search, Users, Building2, Briefcase, FileText,
  AlertTriangle, ExternalLink, Network, ShieldAlert, MapPin,
  Calendar,
} from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  useActoresSearch, useActorPersona, useActorEmpresa,
  type ActorSearchHit, type ActorTipo,
} from '@/lib/queries'
import { fmtARS, fmtFecha } from '@/lib/format'

// ─── Vista raíz: enrutamiento por URL ──────────────────────────────────────

export default function Actores() {
  const { nombre, cuit } = useParams<{ nombre?: string; cuit?: string }>()
  if (cuit) return <PerfilEmpresa cuit={cuit} />
  if (nombre) return <PerfilPersona nombre={decodeURIComponent(nombre)} />
  return <BusquedaActores />
}

// ─── Vista 1: buscador unificado ───────────────────────────────────────────

const TIPOS_FILTRO: { value: ActorTipo | 'todos'; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { value: 'todos', label: 'Todos', icon: Search },
  { value: 'funcionario', label: 'Funcionarios', icon: Briefcase },
  { value: 'director', label: 'Directores', icon: Users },
  { value: 'empresa', label: 'Empresas', icon: Building2 },
]

function BusquedaActores() {
  const [q, setQ] = useState('')
  const [debouncedQ, setDebouncedQ] = useState('')
  const [tipo, setTipo] = useState<ActorTipo | 'todos'>('todos')

  useEffect(() => {
    const t = setTimeout(() => setDebouncedQ(q), 250)
    return () => clearTimeout(t)
  }, [q])

  const { data, isLoading } = useActoresSearch(debouncedQ, tipo)

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-5">
      <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Network className="h-6 w-6" />
          Mapa del poder
        </h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-3xl">
          Busca funcionarios públicos (178K agentes municipales y provinciales
          de Córdoba), directores de empresas (2,29M registros IGJ nacional)
          y personas jurídicas (196K RNS, 191K cordobesas). Cada perfil unifica
          cargos, entidades dirigidas y contratos vinculados.
        </p>
      </div>

      <div className="space-y-3">
        <div className="relative max-w-2xl">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscá un nombre, una razón social, un CUIT…"
            className="pl-9 h-11"
            autoFocus
          />
        </div>

        <div className="flex flex-wrap gap-2">
          {TIPOS_FILTRO.map(({ value, label, icon: Icon }) => (
            <Button
              key={value}
              size="sm"
              variant={tipo === value ? 'default' : 'outline'}
              onClick={() => setTipo(value)}
              className="gap-1.5"
            >
              <Icon className="h-3.5 w-3.5" />
              {label}
            </Button>
          ))}
        </div>
      </div>

      {q.trim().length > 0 && q.trim().length < 2 && (
        <p className="text-xs text-muted-foreground">Escribí al menos 2 caracteres.</p>
      )}

      {isLoading && (
        <div className="space-y-2">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
        </div>
      )}

      {data && data.hits.length === 0 && q.trim().length >= 2 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Sin resultados</AlertTitle>
          <AlertDescription>
            No encontramos a <code>{q}</code> en agentes_publicos, igj_autoridades,
            igj_entidades, rns_personas_juridicas, ni en contratos. Probá con
            apellidos en mayúsculas, parte del nombre, o el CUIT.
          </AlertDescription>
        </Alert>
      )}

      {data && data.hits.length > 0 && (
        <div className="space-y-2">
          <p className="text-xs text-muted-foreground">
            {data.total} resultado{data.total === 1 ? '' : 's'}
          </p>
          {data.hits.map((hit, i) => (
            <ResultadoCard key={`${hit.fuente}-${hit.identificador ?? hit.nombre}-${i}`} hit={hit} />
          ))}
        </div>
      )}
    </div>
  )
}

const TIPO_BADGE: Record<ActorTipo, { label: string; className: string; icon: React.ComponentType<{ className?: string }> }> = {
  funcionario: { label: 'Funcionario', className: 'bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30', icon: Briefcase },
  director: { label: 'Director', className: 'bg-purple-500/15 text-purple-600 dark:text-purple-400 border-purple-500/30', icon: Users },
  empresa: { label: 'Empresa', className: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 border-emerald-500/30', icon: Building2 },
  proveedor: { label: 'Proveedor', className: 'bg-orange-500/15 text-orange-600 dark:text-orange-400 border-orange-500/30', icon: FileText },
}

function ResultadoCard({ hit }: { hit: ActorSearchHit }) {
  const meta = TIPO_BADGE[hit.tipo]
  const Icon = meta.icon
  return (
    <Link
      to={hit.href}
      className="block group"
    >
      <div className="flex items-start gap-3 px-3 py-3 rounded-md border bg-card hover:bg-accent/50 transition-colors">
        <div className={`shrink-0 h-9 w-9 rounded-md border flex items-center justify-center ${meta.className}`}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline gap-2 flex-wrap">
            <span className="font-medium truncate">{hit.nombre}</span>
            <Badge variant="outline" className="text-[10px] uppercase tracking-wide">
              {meta.label}
            </Badge>
            {hit.identificador && (
              <span className="text-xs text-muted-foreground font-mono">{hit.identificador}</span>
            )}
          </div>
          {hit.detalle && (
            <p className="text-xs text-muted-foreground mt-0.5 truncate">{hit.detalle}</p>
          )}
          {hit.jurisdiccion && (
            <p className="text-[11px] text-muted-foreground/70 mt-0.5">
              {hit.jurisdiccion} · fuente: <code>{hit.fuente}</code>
            </p>
          )}
        </div>
      </div>
    </Link>
  )
}

// ─── Vista 2: perfil de persona física ─────────────────────────────────────

function PerfilPersona({ nombre }: { nombre: string }) {
  const { data, isLoading, error } = useActorPersona(nombre)

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-5">
      <Link to="/actores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Mapa del poder
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Users className="h-6 w-6" />
          {nombre}
        </h1>
        {data && (
          <p className="text-xs text-muted-foreground mt-1 font-mono">
            {data.identificadores.dnis.length > 0 && `DNIs: ${data.identificadores.dnis.join(', ')}`}
            {data.identificadores.cuits.length > 0 && ` · CUITs: ${data.identificadores.cuits.join(', ')}`}
          </p>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          {/* Banner de cruces */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <CruceBadge label="Funcionario" activo={data.cruces.es_funcionario} count={data.cargos_publicos.length} />
            <CruceBadge label="Director" activo={data.cruces.es_director} count={data.entidades_dirigidas.length} />
            <CruceBadge label="Proveedor" activo={data.cruces.es_proveedor} count={data.contratos_como_proveedor.length} />
            {data.cruces.conflicto_potencial && (
              <Alert variant="destructive" className="col-span-full md:col-span-1">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle className="text-sm">Conflicto potencial</AlertTitle>
                <AlertDescription className="text-xs">
                  Esta persona figura como funcionaria y como directora de empresas
                  simultáneamente. Revisar art. 13 Ley 25.188.
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Cargos públicos */}
          {data.cargos_publicos.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Briefcase className="h-4 w-4" />
                  Cargos públicos ({data.cargos_publicos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {data.cargos_publicos.slice(0, 30).map((c, i) => (
                    <div key={i} className="text-sm flex items-baseline justify-between gap-3 py-1.5 border-b last:border-0">
                      <div className="min-w-0 flex-1">
                        <span className="font-medium">{c.cargo ?? c.categoria}</span>
                        <span className="text-muted-foreground"> · {c.reparticion ?? c.jurisdiccion}</span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0 text-xs text-muted-foreground">
                        <span>{c.anio}{c.mes ? `-${String(c.mes).padStart(2, '0')}` : ''}</span>
                        {c.bruto && <span className="font-mono">{fmtARS(c.bruto)}</span>}
                      </div>
                    </div>
                  ))}
                  {data.cargos_publicos.length > 30 && (
                    <p className="text-xs text-muted-foreground pt-2">
                      … y {data.cargos_publicos.length - 30} cargos más.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Entidades dirigidas */}
          {data.entidades_dirigidas.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4" />
                  Empresas y entidades en las que figura como administrador
                  ({data.entidades_dirigidas.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-2">
                  {data.entidades_dirigidas.map((e, i) => (
                    <Link
                      key={`${e.cuit ?? e.razon_social}-${i}`}
                      to={e.cuit ? `/actores/empresa/${e.cuit}` : '#'}
                      className={`block px-3 py-2 rounded-md border bg-card text-sm ${e.cuit ? 'hover:bg-accent/50' : 'opacity-70 cursor-default'}`}
                    >
                      <div className="font-medium truncate">{e.razon_social}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap mt-0.5">
                        {e.cuit && <span className="font-mono">{e.cuit}</span>}
                        {e.tipo_societario && <span>{e.tipo_societario}</span>}
                        <Badge variant="outline" className="text-[10px]">{e.tipo_administrador}</Badge>
                      </div>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contratos como proveedor */}
          {data.contratos_como_proveedor.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contratos como proveedor ({data.contratos_como_proveedor.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {data.contratos_como_proveedor.map((c) => (
                    <Link
                      key={c.hash}
                      to={`/contrato/${c.hash}`}
                      className="text-sm flex items-baseline justify-between gap-3 py-1.5 border-b last:border-0 hover:bg-accent/30 -mx-2 px-2 rounded"
                    >
                      <span className="truncate">{c.proveedor}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.anio} · <span className="font-mono">{fmtARS(c.monto)}</span>
                      </span>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function CruceBadge({ label, activo, count }: { label: string; activo: boolean; count: number }) {
  return (
    <div className={`px-3 py-2 rounded-md border text-sm ${activo ? 'bg-card' : 'bg-muted/30 text-muted-foreground'}`}>
      <div className="font-medium">{label}</div>
      <div className="text-xs">
        {activo ? `${count} registro${count === 1 ? '' : 's'}` : 'sin registros'}
      </div>
    </div>
  )
}

// ─── Vista 3: perfil de persona jurídica ───────────────────────────────────

function PerfilEmpresa({ cuit }: { cuit: string }) {
  const cuitNorm = cuit.replace(/\D/g, '')
  const { data, isLoading, error } = useActorEmpresa(cuitNorm)

  return (
    <div className="mx-auto max-w-screen-xl px-4 md:px-6 py-6 space-y-5">
      <Link to="/actores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-3.5 w-3.5" /> Mapa del poder
      </Link>

      <div>
        <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
          <Building2 className="h-6 w-6" />
          {data?.canonico.nombre ?? cuitNorm}
        </h1>
        <p className="text-xs text-muted-foreground mt-1 font-mono">CUIT {cuitNorm}</p>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{(error as Error).message}</AlertDescription>
        </Alert>
      )}

      {isLoading && <Skeleton className="h-64 w-full" />}

      {data && (
        <>
          {/* Datos canónicos + cruce externo */}
          <div className="grid md:grid-cols-3 gap-3">
            {/* Tipo y estado */}
            <Card className="md:col-span-2">
              <CardHeader>
                <CardTitle className="text-base">Datos registrales</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <DatoFila label="Tipo societario" value={data.canonico.tipo_societario ?? '—'} />
                <DatoFila label="Estado" value={data.canonico.activa === null ? '—' : data.canonico.activa ? 'Activa' : 'Inactiva'} />
                {data.rns?.fecha_contrato_social && <DatoFila label="Constituida" value={data.rns.fecha_contrato_social.slice(0, 10)} />}
                {data.rns?.numero_inscripcion && <DatoFila label="N° inscripción" value={data.rns.numero_inscripcion} />}
                {data.rns?.dom_legal_provincia && (
                  <DatoFila
                    label="Domicilio legal"
                    value={`${data.rns.dom_legal_localidad ?? '—'}, ${data.rns.dom_legal_provincia}`}
                  />
                )}
                {data.empresas?.es_empleador !== null && data.empresas?.es_empleador !== undefined && (
                  <DatoFila label="Empleador AFIP" value={data.empresas.es_empleador ? 'Sí' : 'No'} />
                )}
                {data.empresas?.fuente_padron && (
                  <DatoFila label="Fuente padrón" value={data.empresas.fuente_padron} />
                )}
              </CardContent>
            </Card>

            {/* Cruce externo */}
            {data.cruce_externo && data.cruce_externo.matched && (
              <Alert variant="destructive" className="md:col-span-1">
                <ShieldAlert className="h-4 w-4" />
                <AlertTitle>Aparece en {data.cruce_externo.dataset_principal}</AlertTitle>
                <AlertDescription className="text-xs space-y-1">
                  <div>Riesgo: <strong>{data.cruce_externo.riesgo}</strong></div>
                  {data.cruce_externo.entidad_url && (
                    <a href={data.cruce_externo.entidad_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline">
                      Ver registro <ExternalLink className="h-3 w-3" />
                    </a>
                  )}
                </AlertDescription>
              </Alert>
            )}
          </div>

          {/* Autoridades */}
          {data.autoridades.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4" />
                  Autoridades / administradores ({data.autoridades.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid md:grid-cols-2 gap-1">
                  {data.autoridades.map((a, i) => (
                    <Link
                      key={`${a.numero_documento ?? a.apellido_nombre}-${i}`}
                      to={`/actores/persona/${encodeURIComponent(a.apellido_nombre)}`}
                      className="text-sm flex items-center justify-between py-1.5 px-2 rounded hover:bg-accent/30 border-b md:border-b-0"
                    >
                      <div className="min-w-0 flex-1 truncate">
                        <span className="font-medium">{a.apellido_nombre}</span>
                        {a.numero_documento && (
                          <span className="text-xs text-muted-foreground font-mono ml-2">DNI {a.numero_documento}</span>
                        )}
                      </div>
                      <Badge variant="outline" className="text-[10px] shrink-0">
                        {a.tipo_administrador}
                      </Badge>
                    </Link>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Contratos */}
          {data.contratos.length > 0 ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Contratos donde figura como proveedor ({data.contratos.length})
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-1">
                  {data.contratos.slice(0, 50).map((c) => (
                    <Link
                      key={c.hash}
                      to={`/contrato/${c.hash}`}
                      className="text-sm flex items-baseline justify-between gap-3 py-1.5 border-b last:border-0 hover:bg-accent/30 -mx-2 px-2 rounded"
                    >
                      <span className="truncate">{c.municipio} · {c.proveedor}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {c.anio} · <span className="font-mono">{fmtARS(c.monto)}</span>
                      </span>
                    </Link>
                  ))}
                  {data.contratos.length > 50 && (
                    <p className="text-xs text-muted-foreground pt-2">
                      … y {data.contratos.length - 50} contratos más.
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>
          ) : (
            <Alert>
              <FileText className="h-4 w-4" />
              <AlertTitle>Sin contratos cargados</AlertTitle>
              <AlertDescription className="text-xs">
                Esta empresa figura en los registros (RNS/IGJ) pero no apareció
                como proveedor en los contratos cargados de Córdoba/Nación/CABA/
                Santa Fe. Eso no significa que no contrate con el Estado — solo
                que ARGOS aún no captó esos contratos.
              </AlertDescription>
            </Alert>
          )}

          {/* Metadata RNS */}
          {data.rns && (
            <Card className="border-dashed">
              <CardHeader className="pb-2">
                <CardTitle className="text-xs uppercase tracking-wide text-muted-foreground flex items-center gap-1.5">
                  <MapPin className="h-3 w-3" />
                  Trazabilidad — Registro Nacional de Sociedades
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-muted-foreground space-y-1">
                {data.rns.dom_fiscal_provincia && (
                  <div>Domicilio fiscal: {data.rns.dom_fiscal_localidad ?? '—'}, {data.rns.dom_fiscal_provincia}</div>
                )}
                <div className="flex items-center gap-1.5">
                  <Calendar className="h-3 w-3" />
                  Última actualización en RNS: {fmtFecha(new Date().toISOString())}
                </div>
              </CardContent>
            </Card>
          )}
        </>
      )}
    </div>
  )
}

function DatoFila({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-3">
      <span className="text-xs text-muted-foreground w-32 shrink-0">{label}</span>
      <span className="font-medium">{value}</span>
    </div>
  )
}
