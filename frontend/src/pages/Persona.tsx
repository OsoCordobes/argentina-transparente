/**
 * Persona.tsx — Profile canónico de Persona Física, graph-first.
 *
 * Ruta: /persona/:dni
 *
 * El profile no tiene shell propio: reusa ExplorarLayout (mismo home).
 * Cuando el usuario llega, el grafo arranca centrado en el ego del actor
 * (vía /api/grafo/expand/persona:DNI) y NodeDetailPanel se abre con la
 * info detallada (cargos, empresas dirigidas, DDJJ, aportes, señales,
 * fuentes) servida por /api/profile/persona/:dni.
 *
 * Para PF sin DNI verificable o casos de prueba, los fixtures stubs
 * todavía rellenan el panel — pero se muestra un banner amarillo arriba
 * indicándolo (CLAUDE.md §2: cero alucinaciones, datos sintéticos
 * siempre identificados).
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import { EmptyState, LoadingState } from '@/components/argos/primitives'
import { graphFromNeo4j } from '@/lib/argos/graphFromData'
import { getPersonaFisicaStub } from '@/lib/argos/fixtures/personas-stub'
import type { PersonaFisica, ArgosGraph, ArgosNode, ArgosEdge } from '@/lib/argos/types'

/**
 * Grafo ego mínimo construido desde la data del profile.
 *
 * Fallback cuando /api/grafo/expand devuelve vacío para esta persona
 * (típico: PFs cuyo DNI existe en IGJ como director pero no tienen
 * relaciones en el grafo Neo4j cordobés). Toma direcciones empresariales
 * + cargos públicos del profile y los pone como vecinos.
 */
function buildEgoGraphFromPersona(pf: PersonaFisica): ArgosGraph {
  const personaId = `persona:${pf.dni}`
  const personaNode: ArgosNode = {
    id: personaId,
    type: 'persona',
    label: pf.apellidoNombre,
    subtitle: `DNI ${pf.dni}`,
    weight: 0.85,
  }
  const seenCuit = new Set<string>()
  const empresaNodes: ArgosNode[] = []
  for (const d of pf.direccionesEmpresas) {
    if (!d.cuitEmpresa || seenCuit.has(d.cuitEmpresa)) continue
    seenCuit.add(d.cuitEmpresa)
    empresaNodes.push({
      id: `empresa:${d.cuitEmpresa.replace(/-/g, '')}`,
      type: 'empresa',
      label: d.razonSocial,
      subtitle: d.cuitEmpresa,
      weight: 0.6,
    })
    if (empresaNodes.length >= 25) break
  }
  const edges: ArgosEdge[] = empresaNodes.map((n) => ({
    source: personaId,
    target: n.id,
    kind: 'dirige',
  }))
  return { nodes: [personaNode, ...empresaNodes], edges }
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

interface Neo4jExpandResponse {
  nodes: Array<{ id: string; type: string; label: string; subtitle?: string; weight?: number; data?: Record<string, unknown> }>
  edges: Array<{ source: string; target: string; kind?: string; weight?: number }>
  graphAvailable?: boolean
}

export default function Persona() {
  const { dni } = useParams<{ dni: string }>()
  const [pf, setPf] = useState<PersonaFisica | null>(null)
  const [graph, setGraph] = useState<ArgosGraph>(EMPTY_GRAPH)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'backend' | 'fixture' | null>(null)

  useEffect(() => {
    if (!dni) {
      setLoading(false)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setDataSource(null)

    const profileReq = fetch(
      `${API_URL}/api/profile/persona/${encodeURIComponent(dni)}`,
      { signal: ac.signal },
    )
      .then(async (r) => {
        if (r.status === 404) {
          const stub = getPersonaFisicaStub(dni)
          if (stub) {
            setPf(stub)
            setDataSource('fixture')
            return
          }
          throw new Error('Persona no encontrada')
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as PersonaFisica
        if (ac.signal.aborted) return
        setPf(data)
        setDataSource('backend')
      })
      .catch((e) => {
        if (ac.signal.aborted) return
        const stub = getPersonaFisicaStub(dni)
        if (stub) {
          setPf(stub)
          setDataSource('fixture')
        } else {
          setError((e as Error).message)
        }
      })

    const graphReq = fetch(
      `${API_URL}/api/grafo/expand/${encodeURIComponent(`persona:${dni}`)}`,
      { signal: ac.signal },
    )
      .then((r) => (r.ok ? (r.json() as Promise<Neo4jExpandResponse>) : null))
      .then((g) => {
        if (ac.signal.aborted || !g) return
        if (g.graphAvailable === false) return
        if (g.nodes && g.nodes.length > 0) {
          setGraph(graphFromNeo4j(g))
        }
      })
      .catch(() => {
        /* fallback silencioso */
      })

    Promise.all([profileReq, graphReq]).finally(() => {
      if (!ac.signal.aborted) setLoading(false)
    })

    return () => ac.abort()
  }, [dni])

  // Fallback: si Neo4j no devolvió aristas, armá el ego desde el profile.
  useEffect(() => {
    if (loading) return
    if (graph.nodes.length > 0) return
    if (!pf) return
    setGraph(buildEgoGraphFromPersona(pf))
  }, [loading, graph.nodes.length, pf])

  if (!dni) return <NotFound dni="(sin parámetro)" />
  if (loading && !pf) return <ProfileLoading />
  if (error || !pf) return <NotFound dni={dni} />

  return (
    <>
      {dataSource === 'fixture' && <FixtureBanner />}
      <ExplorarLayout
        graph={graph}
        isLoading={loading}
        initialFocusedNodeId={`persona:${dni}`}
      />
    </>
  )
}

function FixtureBanner() {
  return (
    <div
      style={{
        background: 'color-mix(in srgb, var(--semantic-warn) 18%, var(--surface-base))',
        color: 'var(--semantic-warn)',
        padding: 'var(--space-2) var(--space-4)',
        fontSize: 'var(--text-base)',
        fontFamily: 'var(--font-mono)',
        borderBottom: '1px solid var(--semantic-warn)',
        position: 'sticky',
        top: 0,
        // var(--z-overlay): banner sticky sobre el contenido.
        zIndex: 100,
      }}
    >
      ⚠ DATOS SINTÉTICOS DE PRUEBA — sin conexión con backend o DNI inexistente.
      La información mostrada NO refleja la realidad y NO debe usarse para denuncias.
    </div>
  )
}

function ProfileLoading() {
  return (
    <div
      style={{
        position: 'relative',
        background: 'var(--surface-base)',
        color: 'var(--text-secondary)',
        minHeight: '100vh',
      }}
    >
      <LoadingState mode="overlay" label="Cargando perfil…" />
    </div>
  )
}

function NotFound({ dni }: { dni: string }) {
  return (
    <div
      style={{
        background: 'var(--surface-base)',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 'var(--space-6) var(--space-8)',
      }}
    >
      <EmptyState
        title="Persona no encontrada"
        body={`El DNI ${dni} no figura en backend ni en fixtures.`}
        secondaryAction={
          <Link
            to="/"
            style={{
              color: 'var(--accent-primary)',
              fontSize: 'var(--text-base)',
              fontFamily: 'var(--font-sans)',
              textDecoration: 'none',
            }}
          >
            ← Volver al inicio
          </Link>
        }
      />
    </div>
  )
}
