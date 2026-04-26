import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams, Link } from 'react-router-dom'
import { ArrowLeft, AlertTriangle, Network, Loader2, Users, Info } from 'lucide-react'
import CytoscapeComponent from 'react-cytoscapejs'
import cytoscape from 'cytoscape'
import dagre from 'cytoscape-dagre'

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { useRed, type CytoEdge, type CytoNode } from '@/lib/queries'

// Registrar layout dagre una sola vez (idempotente; cytoscape ignora doble registro)
try {
  cytoscape.use(dagre)
} catch {
  /* layout ya registrado */
}

const STYLE = [
  {
    selector: 'node[type="empresa"]',
    style: {
      'background-color': 'hsl(276 87% 53%)',
      label: 'data(label)',
      color: 'hsl(220 13% 96%)',
      'font-size': '11px',
      'font-weight': 600,
      'text-wrap': 'wrap',
      'text-max-width': '120px',
      'text-valign': 'bottom',
      'text-margin-y': '6px',
      'text-outline-color': 'hsl(220 13% 10%)',
      'text-outline-width': '2px',
      width: 36,
      height: 36,
      'border-width': 2,
      'border-color': 'hsl(276 87% 70%)',
    },
  },
  {
    selector: 'node:selected',
    style: {
      'border-color': 'hsl(38 92% 50%)',
      'border-width': 4,
    },
  },
  {
    selector: 'edge',
    style: {
      width: 'mapData(weight, 1, 5, 1, 6)',
      'line-color': 'hsl(220 13% 50%)',
      'curve-style': 'bezier',
      label: 'data(label)',
      'font-size': '9px',
      color: 'hsl(220 13% 70%)',
      'text-rotation': 'autorotate',
      'text-background-color': 'hsl(220 13% 10%)',
      'text-background-opacity': 0.8,
      'text-background-padding': '2px',
    },
  },
  {
    selector: 'edge:selected',
    style: {
      'line-color': 'hsl(38 92% 50%)',
      width: 'mapData(weight, 1, 5, 3, 8)',
    },
  },
] as const

const DEFAULT_MUNICIPIO = 'cordoba-capital'

export default function Red() {
  const [params, setParams] = useSearchParams()
  const municipio = params.get('m') ?? DEFAULT_MUNICIPIO
  const { data, isLoading, error } = useRed(municipio)
  const cyRef = useRef<cytoscape.Core | null>(null)
  const navigate = useNavigate()
  const [selected, setSelected] = useState<{
    type: 'node' | 'edge'
    node?: CytoNode['data']
    edge?: CytoEdge['data']
  } | null>(null)

  const elements = useMemo(() => {
    if (!data?.elements) return []
    return [
      ...data.elements.nodes.map((n) => ({ data: n.data })),
      ...data.elements.edges.map((e) => ({ data: e.data })),
    ]
  }, [data])

  // Wire eventos cuando cy se monta o cambian elementos
  useEffect(() => {
    const cy = cyRef.current
    if (!cy) return
    cy.removeAllListeners()
    cy.on('tap', 'node', (evt) => {
      const node = evt.target.data() as CytoNode['data']
      setSelected({ type: 'node', node })
    })
    cy.on('tap', 'edge', (evt) => {
      const edge = evt.target.data() as CytoEdge['data']
      setSelected({ type: 'edge', edge })
    })
    cy.on('tap', (evt) => {
      if (evt.target === cy) setSelected(null)
    })
  }, [elements])

  return (
    <div className="mx-auto max-w-screen-2xl px-4 md:px-6 py-6 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div>
          <Link
            to="/"
            className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Dashboard
          </Link>
          <h1 className="text-xl md:text-2xl font-semibold tracking-tight mt-1 flex items-center gap-2">
            <Network className="h-5 w-5" />
            Red de empresas
          </h1>
          <p className="text-sm text-muted-foreground">
            {municipio} · vinculaciones por directores en común (IGJ)
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select
            value={municipio}
            onChange={(e) => setParams({ m: e.target.value })}
            className="h-9 rounded-md border bg-background px-3 text-sm"
          >
            <option value="cordoba-capital">Córdoba Capital</option>
          </select>
        </div>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>No se pudo cargar la red</AlertTitle>
          <AlertDescription>
            {(error as Error).message}. Verificá que Neo4j esté corriendo y que el grafo
            esté seedeado (npm run seed:neo4j).
          </AlertDescription>
        </Alert>
      )}

      {isLoading && <Skeleton className="h-[500px] w-full" />}

      {data && data.elements.nodes.length === 0 && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertTitle>Sin vinculaciones detectadas</AlertTitle>
          <AlertDescription>
            No hay empresas con directores compartidos en este municipio. Esto puede
            deberse a que IGJ aún no fue cargado completo, o a que efectivamente no
            existen pares con director común detectables.
          </AlertDescription>
        </Alert>
      )}

      {data && data.elements.nodes.length > 0 && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
          <Card className="lg:col-span-3 overflow-hidden">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <CardTitle className="text-base">Grafo dirigido por directores</CardTitle>
                  <CardDescription>
                    {data.stats.nodes} empresas · {data.stats.edges} vinculaciones
                  </CardDescription>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => cyRef.current?.fit(undefined, 30)}
                >
                  Centrar
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              <div className="h-[600px] w-full bg-muted/20">
                {elements.length > 0 && (
                  <CytoscapeComponent
                    elements={elements}
                    layout={{
                      name: 'cose',
                      animate: false,
                      padding: 30,
                      randomize: false,
                      idealEdgeLength: 120,
                      nodeRepulsion: 8000,
                    }}
                    stylesheet={STYLE as unknown as cytoscape.StylesheetCSS[]}
                    style={{ width: '100%', height: '100%' }}
                    cy={(cy: cytoscape.Core) => {
                      cyRef.current = cy
                    }}
                  />
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Detalle</CardTitle>
              <CardDescription>
                {selected
                  ? selected.type === 'node'
                    ? 'Empresa seleccionada'
                    : 'Vínculo seleccionado'
                  : 'Click en un nodo o arista'}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {!selected && (
                <div className="text-sm text-muted-foreground space-y-2">
                  <p>
                    Cada nodo es una empresa proveedora del municipio. Cada arista
                    representa al menos un director en común con otra empresa.
                  </p>
                  <p className="text-xs">
                    Click en empresa → ficha de entidad. Click en arista → directores
                    compartidos.
                  </p>
                </div>
              )}
              {selected?.type === 'node' && selected.node && (
                <>
                  <div>
                    <div className="text-xs text-muted-foreground">Empresa</div>
                    <div className="font-medium">{selected.node.label}</div>
                  </div>
                  {selected.node.cuit && (
                    <div>
                      <div className="text-xs text-muted-foreground">CUIT</div>
                      <code className="font-mono text-xs">{selected.node.cuit}</code>
                    </div>
                  )}
                  <Button
                    size="sm"
                    className="w-full"
                    onClick={() =>
                      navigate(
                        `/entidad/${encodeURIComponent(selected.node!.label)}`
                      )
                    }
                  >
                    Ver ficha completa
                  </Button>
                </>
              )}
              {selected?.type === 'edge' && selected.edge && (
                <>
                  <div className="flex items-center gap-2 text-xs">
                    <Badge variant="destructive">
                      <Users className="h-3 w-3 mr-1" />
                      {selected.edge.weight ?? selected.edge.sharedDirectors?.length ?? 1}{' '}
                      directores en común
                    </Badge>
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Empresas</div>
                    <div className="text-xs space-y-1 mt-1">
                      <div>{selected.edge.source}</div>
                      <div className="text-muted-foreground">↕</div>
                      <div>{selected.edge.target}</div>
                    </div>
                  </div>
                  {selected.edge.sharedDirectors &&
                    selected.edge.sharedDirectors.length > 0 && (
                      <div>
                        <div className="text-xs text-muted-foreground mb-1">
                          Directores compartidos
                        </div>
                        <ul className="text-xs space-y-1">
                          {selected.edge.sharedDirectors.map((d) => (
                            <li key={d} className="flex items-start gap-1.5">
                              <Users className="h-3 w-3 mt-0.5 text-muted-foreground" />
                              <span>{d}</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                  <div className="rounded-md bg-muted/40 p-2 text-xs text-muted-foreground">
                    Patrón "directores compartidos" → potencial colusión / grupo no
                    declarado. Marco legal: Ley 27.442 art. 1, LGS art. 33.
                  </div>
                </>
              )}
              {isLoading && (
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Cargando…
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
