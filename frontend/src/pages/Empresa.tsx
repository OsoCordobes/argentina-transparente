/**
 * Empresa.tsx — Profile canónico de Persona Jurídica, graph-first.
 *
 * Ruta: /empresa/:cuit
 *
 * Mismo patrón que Persona.tsx: la página no tiene shell propio. Reusa
 * ExplorarLayout con el grafo ego-centrado en la empresa (vía
 * /api/grafo/expand/empresa:CUIT) y NodeDetailPanel abierto con la info
 * del actor (contratos, pagos, directores, aportes, transferencias,
 * señales, fuentes) servida por /api/profile/empresa/:cuit.
 */
import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'
import { graphFromNeo4j } from '@/lib/argos/graphFromData'
import { getPersonaJuridicaStub } from '@/lib/argos/fixtures/personas-stub'
import type { PersonaJuridica, ArgosGraph, ArgosNode, ArgosEdge } from '@/lib/argos/types'

/**
 * Grafo mínimo construido desde la data del profile.
 *
 * Se usa como fallback cuando /api/grafo/expand devuelve vacío (típico:
 * empresas que existen en personas_juridicas/IGJ pero no tienen aristas
 * en Neo4j cordobés todavía). Toma directores del profile y los pone
 * como vecinos del actor — todo trazable, sin alucinaciones.
 */
function buildEgoGraphFromEmpresa(pj: PersonaJuridica): ArgosGraph {
  const cuitRaw = pj.cuit.replace(/-/g, '')
  const empresaId = `empresa:${cuitRaw}`
  const empresaNode: ArgosNode = {
    id: empresaId,
    type: 'empresa',
    label: pj.razonSocial,
    subtitle: pj.cuit,
    weight: 0.85,
  }
  const seenDni = new Set<string>()
  const directorNodes: ArgosNode[] = []
  for (const d of pj.directores) {
    if (!d.dni || seenDni.has(d.dni)) continue
    seenDni.add(d.dni)
    directorNodes.push({
      id: `persona:${d.dni}`,
      type: 'persona',
      label: d.apellidoNombre,
      subtitle: `DNI ${d.dni}`,
      weight: 0.5,
    })
    if (directorNodes.length >= 20) break
  }
  const edges: ArgosEdge[] = directorNodes.map((n) => ({
    source: empresaId,
    target: n.id,
    kind: 'tiene_director',
  }))
  return { nodes: [empresaNode, ...directorNodes], edges }
}

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'
const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

interface Neo4jExpandResponse {
  nodes: Array<{ id: string; type: string; label: string; subtitle?: string; weight?: number; data?: Record<string, unknown> }>
  edges: Array<{ source: string; target: string; kind?: string; weight?: number }>
  graphAvailable?: boolean
}

export default function Empresa() {
  const { cuit } = useParams<{ cuit: string }>()
  const [pj, setPj] = useState<PersonaJuridica | null>(null)
  const [graph, setGraph] = useState<ArgosGraph>(EMPTY_GRAPH)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [dataSource, setDataSource] = useState<'backend' | 'fixture' | null>(null)

  useEffect(() => {
    if (!cuit) {
      setLoading(false)
      return
    }
    const ac = new AbortController()
    setLoading(true)
    setError(null)
    setDataSource(null)

    const profileReq = fetch(
      `${API_URL}/api/profile/empresa/${encodeURIComponent(cuit)}`,
      { signal: ac.signal },
    )
      .then(async (r) => {
        if (r.status === 404) {
          const stub = getPersonaJuridicaStub(cuit)
          if (stub) {
            setPj(stub)
            setDataSource('fixture')
            return
          }
          throw new Error('Empresa no encontrada')
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        const data = (await r.json()) as PersonaJuridica
        if (ac.signal.aborted) return
        setPj(data)
        setDataSource('backend')
      })
      .catch((e) => {
        if (ac.signal.aborted) return
        const stub = getPersonaJuridicaStub(cuit)
        if (stub) {
          setPj(stub)
          setDataSource('fixture')
        } else {
          setError((e as Error).message)
        }
      })

    // Neo4j almacena CUITs sin guiones (formato 30715423681), pero la
    // URL canónica los lleva con guiones (30-71542368-1). Normalizo para
    // que el endpoint expand encuentre el nodo.
    const cuitRaw = cuit.replace(/-/g, '')
    const graphReq = fetch(
      `${API_URL}/api/grafo/expand/${encodeURIComponent(`empresa:${cuitRaw}`)}`,
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
  }, [cuit])

  // Fallback: cuando terminó el load y el grafo Neo4j vino vacío (empresa
  // sin aristas en el grafo cordobés), armá el ego desde la data del
  // profile. Todo trazable: directores que ya vinieron de IGJ.
  useEffect(() => {
    if (loading) return
    if (graph.nodes.length > 0) return
    if (!pj) return
    setGraph(buildEgoGraphFromEmpresa(pj))
  }, [loading, graph.nodes.length, pj])

  if (!cuit) return <NotFound cuit="(sin parámetro)" />
  if (loading && !pj) return <ProfileLoading />
  if (error || !pj) return <NotFound cuit={cuit} />

  return (
    <>
      {dataSource === 'fixture' && <FixtureBanner />}
      <ExplorarLayout
        graph={graph}
        isLoading={loading}
        initialFocusedNodeId={`empresa:${cuit.replace(/-/g, '')}`}
      />
    </>
  )
}

function FixtureBanner() {
  return (
    <div
      style={{
        background: '#3a2d1d',
        color: '#F5B544',
        padding: '8px 16px',
        fontSize: 12,
        fontFamily: 'ui-monospace, monospace',
        borderBottom: '1px solid #F5B544',
        position: 'sticky',
        top: 0,
        zIndex: 100,
      }}
    >
      ⚠ DATOS SINTÉTICOS DE PRUEBA — sin conexión con backend o CUIT inexistente.
      La información mostrada NO refleja la realidad y NO debe usarse para denuncias.
    </div>
  )
}

function ProfileLoading() {
  return (
    <div
      style={{
        background: '#0d1117',
        color: '#9BA3B4',
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 13,
      }}
    >
      Cargando empresa…
    </div>
  )
}

function NotFound({ cuit }: { cuit: string }) {
  return (
    <div
      style={{
        background: '#0d1117',
        color: '#dde3ee',
        minHeight: '100vh',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <h1 style={{ fontSize: 22, color: '#eef2f9', margin: 0 }}>Empresa no encontrada</h1>
      <p style={{ fontSize: 13, color: '#9aa5bb', maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
        CUIT{' '}
        <code
          style={{
            background: '#171b24',
            padding: '1px 6px',
            borderRadius: 3,
            fontFamily: 'ui-monospace, monospace',
          }}
        >
          {cuit}
        </code>{' '}
        no figura en backend ni en fixtures.
      </p>
      <Link to="/" style={{ color: '#5a8ad6', fontSize: 13 }}>
        ← Volver al inicio
      </Link>
    </div>
  )
}
