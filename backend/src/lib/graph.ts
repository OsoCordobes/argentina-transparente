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
      // Schema original (Empresa + Director + Contrato)
      await session.run(`CREATE CONSTRAINT empresa_cuit IF NOT EXISTS FOR (e:Empresa) REQUIRE e.cuit IS UNIQUE`)
      await session.run(`CREATE INDEX empresa_municipio IF NOT EXISTS FOR (e:Empresa) ON (e.municipio)`)
      await session.run(`CREATE INDEX director_nombre IF NOT EXISTS FOR (d:Director) ON (d.nombre)`)

      // Schema ampliado (mapa-neural-cordobés) — Iter6 análisis-datos.
      // PersonaFisica = persona real con DNI (canonicalizada).
      // Funcionario   = registro de cargo público (apellido_nombre + jurisdicción + año).
      // Reparticion   = ministerio / secretaría / dependencia.
      // Señal         = detección del motor de signals.
      await session.run(`CREATE CONSTRAINT persona_dni IF NOT EXISTS FOR (p:PersonaFisica) REQUIRE p.dni IS UNIQUE`)
      await session.run(`CREATE INDEX persona_nombre_norm IF NOT EXISTS FOR (p:PersonaFisica) ON (p.nombreNorm)`)
      await session.run(`CREATE INDEX funcionario_nombre_norm IF NOT EXISTS FOR (f:Funcionario) ON (f.nombreNorm)`)
      await session.run(`CREATE CONSTRAINT funcionario_id IF NOT EXISTS FOR (f:Funcionario) REQUIRE f.id IS UNIQUE`)
      await session.run(`CREATE CONSTRAINT reparticion_id IF NOT EXISTS FOR (r:Reparticion) REQUIRE r.id IS UNIQUE`)
      await session.run(`CREATE INDEX reparticion_jurisdiccion IF NOT EXISTS FOR (r:Reparticion) ON (r.jurisdiccion)`)
      await session.run(`CREATE CONSTRAINT senal_id IF NOT EXISTS FOR (s:Señal) REQUIRE s.id IS UNIQUE`)
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

// ─── Upsert ampliado (mapa-neural) ──────────────────────────────────────────

/**
 * Normaliza nombre de persona para matching inter-fuentes:
 *   "Pérez, Juan Carlos"  → "PEREZ JUAN CARLOS"
 *   "JUAN CARLOS PEREZ"   → "JUAN CARLOS PEREZ"
 *
 * Suficiente para detectar dupes evidentes; el matcher upstream debe usar
 * Levenshtein o similar para los casos ambiguos.
 */
export function normalizarNombrePersona(s: string): string {
  return s
    .toUpperCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function upsertPersonaFisica(data: {
  dni: string
  nombre: string
}): Promise<void> {
  if (!_available) return
  const nombreNorm = normalizarNombrePersona(data.nombre)
  await withSession(s => s.run(
    `MERGE (p:PersonaFisica {dni: $dni})
     SET p.nombre = $nombre, p.nombreNorm = $nombreNorm`,
    { ...data, nombreNorm }
  ))
}

export async function upsertReparticion(data: {
  id: string                  // slug estable: '<jurisdiccion>:<nombre_norm>'
  nombre: string
  jurisdiccion: string        // 'cordoba-capital' | 'cordoba-provincia' | etc.
  tipo?: string               // 'ministerio' | 'secretaria' | 'dependencia' | etc.
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MERGE (r:Reparticion {id: $id})
     SET r.nombre = $nombre, r.jurisdiccion = $jurisdiccion, r.tipo = $tipo`,
    { ...data, tipo: data.tipo ?? null }
  ))
}

/**
 * Funcionario es UN registro de cargo. Si la misma persona ocupa varios
 * cargos, hay varios Funcionario. La canonicalización vía
 * PersonaFisica se hace por la arista [:ES_LA_MISMA_PERSONA] (cuando hay DNI
 * o match Tier 2 por nombre).
 */
export async function upsertFuncionario(data: {
  id: string                  // sha256(jurisdiccion + apellido_nombre + cargo + anio + reparticion)
  nombre: string
  jurisdiccion: string
  reparticionId: string | null
  cargo: string | null
  anio: number
  bruto: number | null
  cuit: string | null
  dni: string | null
}): Promise<void> {
  if (!_available) return
  const nombreNorm = normalizarNombrePersona(data.nombre)
  await withSession(async s => {
    await s.run(
      `MERGE (f:Funcionario {id: $id})
       SET f.nombre = $nombre,
           f.nombreNorm = $nombreNorm,
           f.jurisdiccion = $jurisdiccion,
           f.cargo = $cargo,
           f.anio = $anio,
           f.bruto = $bruto,
           f.cuit = $cuit,
           f.dni = $dni`,
      { ...data, nombreNorm }
    )
    if (data.reparticionId) {
      await s.run(
        `MATCH (f:Funcionario {id: $id}), (r:Reparticion {id: $reparticionId})
         MERGE (f)-[:TRABAJA_EN]->(r)`,
        { id: data.id, reparticionId: data.reparticionId }
      )
    }
    if (data.dni) {
      // Linkear con PersonaFisica si la conocemos por DNI.
      await s.run(
        `MATCH (f:Funcionario {id: $id})
         MERGE (p:PersonaFisica {dni: $dni})
         ON CREATE SET p.nombre = $nombre, p.nombreNorm = $nombreNorm
         MERGE (f)-[:ES_LA_MISMA_PERSONA {tier: 1, metodo: 'dni_exact'}]->(p)`,
        { id: data.id, dni: data.dni, nombre: data.nombre, nombreNorm }
      )
    }
  })
}

/**
 * Une un Funcionario con una PersonaFisica por nombre normalizado cuando no
 * hay DNI común. Tier 2 = match menos confiable, requiere verificación.
 */
export async function linkFuncionarioPersonaPorNombre(funcionarioId: string, personaDni: string): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (f:Funcionario {id: $funcionarioId}), (p:PersonaFisica {dni: $personaDni})
     MERGE (f)-[:ES_LA_MISMA_PERSONA {tier: 2, metodo: 'nombre_norm'}]->(p)`,
    { funcionarioId, personaDni }
  ))
}

/**
 * Una persona física puede dirigir muchas empresas. Esta es la conexión
 * principal del mapa de poder cordobés.
 */
export async function upsertDireccion(data: {
  personaDni: string
  empresaCuit: string
  tipoAdministrador: string  // 'PRESIDENTE' | 'DIRECTOR' | 'A' (administrador) | 'S' (síndico) | etc.
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (p:PersonaFisica {dni: $personaDni}), (e:Empresa {cuit: $empresaCuit})
     MERGE (p)-[d:DIRIGE]->(e)
     SET d.tipo = $tipoAdministrador`,
    data
  ))
}

/**
 * Aristas EMITE (Reparticion → Contrato) y OPERA_EN (Empresa → Reparticion).
 * Permite Cypher: una empresa "contrata con" una repartición vía cualquier
 * número de contratos.
 */
export async function upsertContratoConReparticion(data: {
  contratoId: string
  empresaCuit: string
  reparticionId: string
  monto: number
}): Promise<void> {
  if (!_available) return
  await withSession(async s => {
    await s.run(
      `MATCH (c:Contrato {id: $contratoId}), (r:Reparticion {id: $reparticionId})
       MERGE (r)-[:EMITE]->(c)`,
      { contratoId: data.contratoId, reparticionId: data.reparticionId }
    )
    await s.run(
      `MATCH (e:Empresa {cuit: $empresaCuit}), (r:Reparticion {id: $reparticionId})
       MERGE (e)-[op:OPERA_EN]->(r)
       ON CREATE SET op.contratos = 1, op.monto = $monto
       ON MATCH  SET op.contratos = op.contratos + 1, op.monto = op.monto + $monto`,
      data
    )
  })
}

/**
 * Marca una arista CONFLICTO_CON entre Funcionario ↔ Empresa cuando:
 *   El funcionario trabaja_en una repartición que opera_en con la empresa,
 *   y la persona detrás del funcionario dirige esa empresa.
 *
 * Esto se calcula con un solo Cypher en `marcarConflictosFuncionarioProveedor`.
 */
export interface ConflictoEdge {
  funcionarioId: string
  empresaCuit: string
  funcionarioNombre: string
  empresaNombre: string
  reparticionId: string | null
  reparticionNombre: string | null
  via: 'dni' | 'nombre_norm'
}

export async function marcarConflictosFuncionarioProveedor(): Promise<ConflictoEdge[]> {
  if (!_available) return []
  return withSession(async s => {
    const result = await s.run(
      `MATCH (f:Funcionario)-[:TRABAJA_EN]->(r:Reparticion)<-[:OPERA_EN]-(e:Empresa)<-[:DIRIGE]-(p:PersonaFisica)
       MATCH (f)-[link:ES_LA_MISMA_PERSONA]->(p)
       MERGE (f)-[c:CONFLICTO_CON]->(e)
       SET c.viaReparticion = r.id,
           c.tier = link.tier,
           c.metodo = link.metodo
       RETURN f.id AS funcionarioId, f.nombre AS funcionarioNombre,
              e.cuit AS empresaCuit, e.nombre AS empresaNombre,
              r.id AS reparticionId, r.nombre AS reparticionNombre,
              link.metodo AS metodo`
    )
    return result.records.map(r => ({
      funcionarioId: r.get('funcionarioId') as string,
      empresaCuit: r.get('empresaCuit') as string,
      funcionarioNombre: r.get('funcionarioNombre') as string,
      empresaNombre: r.get('empresaNombre') as string,
      reparticionId: r.get('reparticionId') as string | null,
      reparticionNombre: r.get('reparticionNombre') as string | null,
      via: (r.get('metodo') as string) === 'dni_exact' ? 'dni' : 'nombre_norm',
    }))
  })
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

// ─── Mapa-neural cordobés ──────────────────────────────────────────────────
//
// Estos endpoints son los que alimentan el grafo de /explorar (Argos v2).
// La estrategia es lazy: el initial render trae solo el "núcleo caliente"
// (señales activas + actores con alta exposición), y el frontend pide
// vecinos al hacer click vía expandNodo.

export interface GrafoNode {
  id: string
  type: 'empresa' | 'persona' | 'funcionario' | 'reparticion' | 'contrato' | 'señal'
  label: string
  subtitle?: string
  weight: number
  data: Record<string, unknown>
}

export interface GrafoEdge {
  source: string
  target: string
  kind: 'dirige' | 'trabaja_en' | 'gano' | 'opera_en' | 'es_la_misma_persona' | 'comparte_director' | 'conflicto_con' | 'señalada_por' | 'tiene_director'
  weight: number
  data?: Record<string, unknown>
}

export interface Grafo {
  nodes: GrafoNode[]
  edges: GrafoEdge[]
}

/**
 * Núcleo caliente — devuelve los actores destacados del universo cordobés:
 *   - Empresas con CONFLICTO_CON Funcionario (top prioridad)
 *   - Empresas con señales activas
 *   - Personas Físicas que dirigen ≥3 empresas
 *   - Funcionarios cruzados con esas empresas
 *   - Las reparticiones que las conectan
 *
 * Cap configurable. Default ~150 nodos para que el render inicial sea fluido.
 */
export async function getGrafoNucleo(opts?: { limite?: number; municipio?: string }): Promise<Grafo> {
  if (!_available) return { nodes: [], edges: [] }
  const limite = opts?.limite ?? 150
  const municipio = opts?.municipio ?? 'cordoba-capital'

  return withSession(async s => {
    // Conflictos primero — son las aristas CONFLICTO_CON ya marcadas
    const conflictos = await s.run(
      `MATCH (f:Funcionario)-[c:CONFLICTO_CON]->(e:Empresa)
       OPTIONAL MATCH (f)-[:TRABAJA_EN]->(r:Reparticion)
       OPTIONAL MATCH (p:PersonaFisica)-[:DIRIGE]->(e)
       RETURN DISTINCT f, c, e, r, p
       LIMIT $limite`,
      { limite: neo4j.int(limite) }
    )

    // Empresas con más operaciones (top 30 por monto)
    const topEmpresas = await s.run(
      `MATCH (e:Empresa {municipio: $municipio})-[op:OPERA_EN]->(r:Reparticion)
       WITH e, sum(op.monto) AS total, collect(r) AS reparticiones
       ORDER BY total DESC
       LIMIT 30
       OPTIONAL MATCH (p:PersonaFisica)-[:DIRIGE]->(e)
       WITH e, total, reparticiones, collect(p)[0..3] AS dirigentes
       RETURN e, reparticiones, dirigentes, total`,
      { municipio }
    )

    // Personas que dirigen ≥3 empresas (poder visible)
    const topDirigentes = await s.run(
      `MATCH (p:PersonaFisica)-[:DIRIGE]->(e:Empresa)
       WITH p, count(e) AS cnt, collect(e)[0..5] AS empresas
       WHERE cnt >= 3
       RETURN p, empresas, cnt
       ORDER BY cnt DESC
       LIMIT 20`
    )

    const nodeMap = new Map<string, GrafoNode>()
    const edges: GrafoEdge[] = []

    const pushEmpresa = (e: { properties: Record<string, unknown> }) => {
      const cuit = e.properties.cuit as string
      if (!cuit) return
      if (!nodeMap.has(`empresa:${cuit}`)) {
        nodeMap.set(`empresa:${cuit}`, {
          id: `empresa:${cuit}`,
          type: 'empresa',
          label: (e.properties.nombre as string) ?? cuit,
          subtitle: cuit,
          weight: 0.7,
          data: e.properties,
        })
      }
    }
    const pushPersona = (p: { properties: Record<string, unknown> }) => {
      const dni = p.properties.dni as string
      if (!dni) return
      if (!nodeMap.has(`persona:${dni}`)) {
        nodeMap.set(`persona:${dni}`, {
          id: `persona:${dni}`,
          type: 'persona',
          label: (p.properties.nombre as string) ?? dni,
          subtitle: `DNI ${dni}`,
          weight: 0.5,
          data: p.properties,
        })
      }
    }
    const pushFuncionario = (f: { properties: Record<string, unknown> }) => {
      const id = f.properties.id as string
      if (!id) return
      if (!nodeMap.has(`funcionario:${id}`)) {
        nodeMap.set(`funcionario:${id}`, {
          id: `funcionario:${id}`,
          type: 'funcionario',
          label: (f.properties.nombre as string) ?? id,
          subtitle: (f.properties.cargo as string) ?? undefined,
          weight: 0.4,
          data: f.properties,
        })
      }
    }
    const pushReparticion = (r: { properties: Record<string, unknown> }) => {
      const id = r.properties.id as string
      if (!id) return
      if (!nodeMap.has(`reparticion:${id}`)) {
        nodeMap.set(`reparticion:${id}`, {
          id: `reparticion:${id}`,
          type: 'reparticion',
          label: (r.properties.nombre as string) ?? id,
          subtitle: (r.properties.jurisdiccion as string) ?? undefined,
          weight: 0.6,
          data: r.properties,
        })
      }
    }

    for (const rec of conflictos.records) {
      const f = rec.get('f')
      const e = rec.get('e')
      const r = rec.get('r')
      const p = rec.get('p')
      pushFuncionario(f); pushEmpresa(e)
      if (r) pushReparticion(r)
      if (p) pushPersona(p)
      edges.push({
        source: `funcionario:${f.properties.id}`,
        target: `empresa:${e.properties.cuit}`,
        kind: 'conflicto_con',
        weight: 1,
        data: { tier: rec.get('c').properties.tier },
      })
      if (r) {
        edges.push({ source: `funcionario:${f.properties.id}`, target: `reparticion:${r.properties.id}`, kind: 'trabaja_en', weight: 0.5 })
        edges.push({ source: `empresa:${e.properties.cuit}`, target: `reparticion:${r.properties.id}`, kind: 'opera_en', weight: 0.5 })
      }
      if (p) edges.push({ source: `persona:${p.properties.dni}`, target: `empresa:${e.properties.cuit}`, kind: 'dirige', weight: 0.7 })
    }

    for (const rec of topEmpresas.records) {
      const e = rec.get('e')
      pushEmpresa(e)
      const reparticiones = rec.get('reparticiones') as Array<{ properties: Record<string, unknown> }>
      for (const r of reparticiones) {
        pushReparticion(r)
        edges.push({ source: `empresa:${e.properties.cuit}`, target: `reparticion:${r.properties.id}`, kind: 'opera_en', weight: 0.4 })
      }
      const dirigentes = rec.get('dirigentes') as Array<{ properties: Record<string, unknown> }>
      for (const p of dirigentes) {
        pushPersona(p)
        edges.push({ source: `persona:${p.properties.dni}`, target: `empresa:${e.properties.cuit}`, kind: 'dirige', weight: 0.6 })
      }
    }

    for (const rec of topDirigentes.records) {
      const p = rec.get('p')
      pushPersona(p)
      const empresas = rec.get('empresas') as Array<{ properties: Record<string, unknown> }>
      for (const e of empresas) {
        pushEmpresa(e)
        edges.push({ source: `persona:${p.properties.dni}`, target: `empresa:${e.properties.cuit}`, kind: 'dirige', weight: 0.5 })
      }
    }

    return { nodes: Array.from(nodeMap.values()), edges }
  })
}

/**
 * Carga vecinos del nodo enfocado. Funciona para todos los tipos.
 * IDs son `<tipo>:<clave>` (ej. "empresa:30707285504", "persona:14012698").
 */
export async function expandirNodo(nodeId: string, depth = 1): Promise<Grafo> {
  if (!_available) return { nodes: [], edges: [] }
  const [tipo, ...rest] = nodeId.split(':')
  const clave = rest.join(':')

  return withSession(async s => {
    let cypher = ''
    let params: Record<string, unknown> = { clave }

    if (tipo === 'empresa') {
      cypher = `
        MATCH (e:Empresa {cuit: $clave})
        OPTIONAL MATCH (p:PersonaFisica)-[d:DIRIGE]->(e)
        OPTIONAL MATCH (e)-[op:OPERA_EN]->(r:Reparticion)
        OPTIONAL MATCH (e)-[:GANÓ]->(c:Contrato)
        OPTIONAL MATCH (f:Funcionario)-[conf:CONFLICTO_CON]->(e)
        RETURN e, collect(DISTINCT p) AS personas, collect(DISTINCT r) AS reparticiones,
               collect(DISTINCT c)[0..10] AS contratos, collect(DISTINCT f) AS funcionarios`
    } else if (tipo === 'persona') {
      cypher = `
        MATCH (p:PersonaFisica {dni: $clave})
        OPTIONAL MATCH (p)-[d:DIRIGE]->(e:Empresa)
        OPTIONAL MATCH (p)<-[:ES_LA_MISMA_PERSONA]-(f:Funcionario)
        OPTIONAL MATCH (f)-[:TRABAJA_EN]->(r:Reparticion)
        RETURN p, collect(DISTINCT e) AS empresas, collect(DISTINCT f) AS funcionarios,
               collect(DISTINCT r) AS reparticiones`
    } else if (tipo === 'funcionario') {
      cypher = `
        MATCH (f:Funcionario {id: $clave})
        OPTIONAL MATCH (f)-[:TRABAJA_EN]->(r:Reparticion)
        OPTIONAL MATCH (f)-[:ES_LA_MISMA_PERSONA]->(p:PersonaFisica)
        OPTIONAL MATCH (p)-[:DIRIGE]->(e:Empresa)
        OPTIONAL MATCH (f)-[:CONFLICTO_CON]->(eConf:Empresa)
        RETURN f, collect(DISTINCT r) AS reparticiones, collect(DISTINCT p) AS personas,
               collect(DISTINCT e) AS empresas, collect(DISTINCT eConf) AS empresasConflicto`
    } else if (tipo === 'reparticion') {
      cypher = `
        MATCH (r:Reparticion {id: $clave})
        OPTIONAL MATCH (e:Empresa)-[op:OPERA_EN]->(r)
        OPTIONAL MATCH (f:Funcionario)-[:TRABAJA_EN]->(r)
        WITH r, collect(DISTINCT {e: e, monto: op.monto, contratos: op.contratos}) AS empresasOp,
             collect(DISTINCT f)[0..50] AS funcionarios
        RETURN r, empresasOp, funcionarios`
    } else {
      return { nodes: [], edges: [] }
    }

    const result = await s.run(cypher, params)
    const nodeMap = new Map<string, GrafoNode>()
    const edges: GrafoEdge[] = []

    const addEmpresa = (e: { properties: Record<string, unknown> } | null) => {
      if (!e?.properties.cuit) return null as string | null
      const id = `empresa:${e.properties.cuit}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'empresa', label: (e.properties.nombre as string) ?? '', subtitle: e.properties.cuit as string, weight: 0.7, data: e.properties })
      return id
    }
    const addPersona = (p: { properties: Record<string, unknown> } | null) => {
      if (!p?.properties.dni) return null as string | null
      const id = `persona:${p.properties.dni}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'persona', label: (p.properties.nombre as string) ?? '', subtitle: `DNI ${p.properties.dni}`, weight: 0.5, data: p.properties })
      return id
    }
    const addFunc = (f: { properties: Record<string, unknown> } | null) => {
      if (!f?.properties.id) return null as string | null
      const id = `funcionario:${f.properties.id}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'funcionario', label: (f.properties.nombre as string) ?? '', subtitle: (f.properties.cargo as string) ?? undefined, weight: 0.4, data: f.properties })
      return id
    }
    const addRep = (r: { properties: Record<string, unknown> } | null) => {
      if (!r?.properties.id) return null as string | null
      const id = `reparticion:${r.properties.id}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'reparticion', label: (r.properties.nombre as string) ?? '', subtitle: (r.properties.jurisdiccion as string) ?? undefined, weight: 0.6, data: r.properties })
      return id
    }

    for (const rec of result.records) {
      if (tipo === 'empresa') {
        const eId = addEmpresa(rec.get('e'))
        if (!eId) continue
        for (const p of (rec.get('personas') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const pId = addPersona(p); if (pId) edges.push({ source: pId, target: eId, kind: 'dirige', weight: 0.6 })
        }
        for (const r of (rec.get('reparticiones') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const rId = addRep(r); if (rId) edges.push({ source: eId, target: rId, kind: 'opera_en', weight: 0.4 })
        }
        for (const f of (rec.get('funcionarios') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const fId = addFunc(f); if (fId) edges.push({ source: fId, target: eId, kind: 'conflicto_con', weight: 1 })
        }
      } else if (tipo === 'persona') {
        const pId = addPersona(rec.get('p'))
        if (!pId) continue
        for (const e of (rec.get('empresas') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const eId = addEmpresa(e); if (eId) edges.push({ source: pId, target: eId, kind: 'dirige', weight: 0.6 })
        }
        for (const f of (rec.get('funcionarios') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const fId = addFunc(f); if (fId) edges.push({ source: fId, target: pId, kind: 'es_la_misma_persona', weight: 1 })
        }
        for (const r of (rec.get('reparticiones') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const rId = addRep(r); if (rId) edges.push({ source: rId, target: pId, kind: 'trabaja_en', weight: 0.4 })
        }
      } else if (tipo === 'funcionario') {
        const fId = addFunc(rec.get('f'))
        if (!fId) continue
        for (const r of (rec.get('reparticiones') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const rId = addRep(r); if (rId) edges.push({ source: fId, target: rId, kind: 'trabaja_en', weight: 0.5 })
        }
        for (const p of (rec.get('personas') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const pId = addPersona(p); if (pId) edges.push({ source: fId, target: pId, kind: 'es_la_misma_persona', weight: 1 })
        }
        for (const e of (rec.get('empresas') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          addEmpresa(e)
        }
        for (const e of (rec.get('empresasConflicto') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const eId = addEmpresa(e); if (eId) edges.push({ source: fId, target: eId, kind: 'conflicto_con', weight: 1 })
        }
      } else if (tipo === 'reparticion') {
        const rId = addRep(rec.get('r'))
        if (!rId) continue
        const empresasOp = (rec.get('empresasOp') ?? []) as Array<{ e: { properties: Record<string, unknown> } | null; monto: number; contratos: number }>
        for (const item of empresasOp.slice(0, 30)) {
          const eId = addEmpresa(item.e)
          if (eId) edges.push({ source: eId, target: rId, kind: 'opera_en', weight: 0.4, data: { monto: item.monto, contratos: item.contratos } })
        }
        for (const f of (rec.get('funcionarios') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const fId = addFunc(f); if (fId) edges.push({ source: fId, target: rId, kind: 'trabaja_en', weight: 0.4 })
        }
      }
    }

    return { nodes: Array.from(nodeMap.values()), edges }
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
