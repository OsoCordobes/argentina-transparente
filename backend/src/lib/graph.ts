// Cliente Neo4j para ARGOS — grafo de relaciones entre empresas y directores
// Neo4j corre en Docker: argos-neo4j (bolt://localhost:7687)

import neo4j, { Driver, Session } from 'neo4j-driver'

const NEO4J_URI  = process.env.NEO4J_URI  ?? 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j'
const NEO4J_PASS = process.env.NEO4J_PASS ?? 'argos_local'

let _driver: Driver | null = null
let _available = false

export async function initGraph(): Promise<void> {
  try {
    _driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS), {
      connectionAcquisitionTimeout: 3000,
      maxConnectionPoolSize: 10,
    })
    await _driver.verifyConnectivity()
    _available = true

    // Constraints e índices
    const session = _driver.session()
    try {
      await session.run(`CREATE CONSTRAINT empresa_cuit IF NOT EXISTS FOR (e:Empresa) REQUIRE e.cuit IS UNIQUE`)
      await session.run(`CREATE INDEX empresa_municipio IF NOT EXISTS FOR (e:Empresa) ON (e.municipio)`)
      await session.run(`CREATE INDEX director_nombre IF NOT EXISTS FOR (d:Director) ON (d.nombre)`)
    } finally {
      await session.close()
    }

    console.log('[graph] Neo4j conectado:', NEO4J_URI)
  } catch (err) {
    _available = false
    console.warn('[graph] Neo4j no disponible — señales de red deshabilitadas:', String(err).split('\n')[0])
  }
}

export function isGraphAvailable(): boolean {
  return _available
}

function getDriver(): Driver {
  if (!_driver || !_available) throw new Error('Grafo no disponible')
  return _driver
}

async function withSession<T>(fn: (s: Session) => Promise<T>): Promise<T> {
  const session = getDriver().session()
  try {
    return await fn(session)
  } finally {
    await session.close()
  }
}

// ─── Upsert ───────────────────────────────────────────────────────────────────

export async function upsertEmpresaGrafo(data: {
  cuit: string
  nombre: string
  esEmpleador: boolean
  municipio: string
  inicioActividades?: string | null
  estado?: string | null
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MERGE (e:Empresa {cuit: $cuit})
     SET e.nombre = $nombre,
         e.esEmpleador = $esEmpleador,
         e.municipio = $municipio,
         e.inicioActividades = $inicioActividades,
         e.estado = $estado`,
    { ...data, inicioActividades: data.inicioActividades ?? null, estado: data.estado ?? null }
  ))
}

export async function upsertDirectoresGrafo(cuit: string, directores: string[]): Promise<void> {
  if (!_available || directores.length === 0) return
  await withSession(async s => {
    for (const nombre of directores) {
      await s.run(
        `MERGE (d:Director {nombre: $nombre})
         WITH d
         MATCH (e:Empresa {cuit: $cuit})
         MERGE (e)-[:TIENE_DIRECTOR]->(d)`,
        { nombre: nombre.trim().toUpperCase(), cuit }
      )
    }
  })
}

export async function upsertContratoGrafo(data: {
  id: string
  cuit: string
  monto: number
  tipo: string
  anio: number
  area: string
  municipio: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MERGE (c:Contrato {id: $id})
     SET c.monto = $monto, c.tipo = $tipo, c.anio = $anio, c.area = $area, c.municipio = $municipio
     WITH c
     MATCH (e:Empresa {cuit: $cuit})
     MERGE (e)-[:GANÓ]->(c)`,
    data
  ))
}

// ─── Queries ──────────────────────────────────────────────────────────────────

export interface DirectoresCompartidosResult {
  empresa1: string
  empresa2: string
  cuit1: string
  cuit2: string
  directores: string[]
}

export async function getDirectoresCompartidos(municipio: string): Promise<DirectoresCompartidosResult[]> {
  if (!_available) return []
  return withSession(async s => {
    const result = await s.run(
      `MATCH (e1:Empresa {municipio: $municipio})-[:TIENE_DIRECTOR]->(d:Director)
             <-[:TIENE_DIRECTOR]-(e2:Empresa {municipio: $municipio})
       WHERE e1.cuit < e2.cuit
       WITH e1, e2, collect(d.nombre) AS directores
       WHERE size(directores) >= 1
       RETURN e1.nombre AS empresa1, e2.nombre AS empresa2,
              e1.cuit AS cuit1, e2.cuit AS cuit2, directores
       ORDER BY size(directores) DESC
       LIMIT 20`,
      { municipio }
    )
    return result.records.map(r => ({
      empresa1:   r.get('empresa1') as string,
      empresa2:   r.get('empresa2') as string,
      cuit1:      r.get('cuit1') as string,
      cuit2:      r.get('cuit2') as string,
      directores: r.get('directores') as string[],
    }))
  })
}

export interface RedDeEmpresasResult {
  empresa1: string
  empresa2: string
  cuit1: string
  cuit2: string
  directoresCompartidos: string[]
}

// Pairs sharing ≥minShared directors — stronger signal than directores_compartidos (≥1)
export async function getRedDeEmpresas(municipio: string, minShared = 2): Promise<RedDeEmpresasResult[]> {
  if (!_available) return []
  return withSession(async s => {
    const result = await s.run(
      `MATCH (e1:Empresa {municipio: $municipio})-[:TIENE_DIRECTOR]->(d:Director)
             <-[:TIENE_DIRECTOR]-(e2:Empresa {municipio: $municipio})
       WHERE e1.cuit < e2.cuit
       WITH e1, e2, collect(d.nombre) AS directores
       WHERE size(directores) >= $min
       RETURN e1.nombre AS empresa1, e2.nombre AS empresa2,
              e1.cuit AS cuit1, e2.cuit AS cuit2, directores
       ORDER BY size(directores) DESC
       LIMIT 20`,
      { municipio, min: neo4j.int(minShared) }
    )
    return result.records.map(r => ({
      empresa1:            r.get('empresa1') as string,
      empresa2:            r.get('empresa2') as string,
      cuit1:               r.get('cuit1') as string,
      cuit2:               r.get('cuit2') as string,
      directoresCompartidos: r.get('directores') as string[],
    }))
  })
}

// ─── Cytoscape export ─────────────────────────────────────────────────────────

export interface CytoNode {
  data: {
    id: string
    label: string
    type: 'empresa' | 'director'
    cuit?: string
    municipio?: string
    sharedDirectors?: number
  }
}

export interface CytoEdge {
  data: {
    id: string
    source: string
    target: string
    label?: string
    weight?: number
    sharedDirectors?: string[]
  }
}

export interface CytoElements {
  nodes: CytoNode[]
  edges: CytoEdge[]
}

// Devuelve elementos Cytoscape de la red empresa↔director↔empresa para un municipio.
// Cada empresa aparece como nodo. Cada director compartido genera un edge directo
// empresa↔empresa con label = nombre del director (más limpio para investigación
// que el bipartito empresa→director→empresa).
export async function getRedCytoscape(municipio: string): Promise<CytoElements> {
  if (!_available) return { nodes: [], edges: [] }

  return withSession(async s => {
    const result = await s.run(
      `MATCH (e1:Empresa {municipio: $municipio})-[:TIENE_DIRECTOR]->(d:Director)
             <-[:TIENE_DIRECTOR]-(e2:Empresa {municipio: $municipio})
       WHERE e1.cuit < e2.cuit
       WITH e1, e2, collect(d.nombre) AS directores
       WHERE size(directores) >= 1
       RETURN e1.cuit AS cuit1, e1.nombre AS nombre1,
              e2.cuit AS cuit2, e2.nombre AS nombre2,
              directores
       ORDER BY size(directores) DESC
       LIMIT 200`,
      { municipio }
    )

    const nodeMap = new Map<string, CytoNode>()
    const edges: CytoEdge[] = []

    for (const r of result.records) {
      const cuit1 = r.get('cuit1') as string
      const cuit2 = r.get('cuit2') as string
      const nombre1 = r.get('nombre1') as string
      const nombre2 = r.get('nombre2') as string
      const directores = r.get('directores') as string[]

      if (!nodeMap.has(cuit1)) {
        nodeMap.set(cuit1, {
          data: { id: cuit1, label: nombre1, type: 'empresa', cuit: cuit1, municipio },
        })
      }
      if (!nodeMap.has(cuit2)) {
        nodeMap.set(cuit2, {
          data: { id: cuit2, label: nombre2, type: 'empresa', cuit: cuit2, municipio },
        })
      }

      edges.push({
        data: {
          id: `${cuit1}__${cuit2}`,
          source: cuit1,
          target: cuit2,
          label: directores.length === 1
            ? directores[0]
            : `${directores.length} directores`,
          weight: directores.length,
          sharedDirectors: directores,
        },
      })
    }

    return { nodes: Array.from(nodeMap.values()), edges }
  })
}

export async function closeGraph(): Promise<void> {
  if (_driver) {
    await _driver.close()
    _driver = null
    _available = false
  }
}
