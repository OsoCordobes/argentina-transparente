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

      // Schema W1 — nodos raíz Estado + Programa presupuestario
      await session.run(`CREATE CONSTRAINT estado_id IF NOT EXISTS FOR (e:Estado) REQUIRE e.id IS UNIQUE`)
      await session.run(`CREATE INDEX estado_tipo IF NOT EXISTS FOR (e:Estado) ON (e.tipo)`)
      await session.run(`CREATE CONSTRAINT programa_id IF NOT EXISTS FOR (p:Programa) REQUIRE p.id IS UNIQUE`)
      await session.run(`CREATE INDEX programa_anio IF NOT EXISTS FOR (p:Programa) ON (p.anio)`)

      // Schema W4 Iter#5 — :Conflicto como nodo (no solo arista)
      // Permite UI navegable que liste/filtre conflictos por tipologia/score/jurisdiccion
      // sin reconstruir el match cada vez. Aristas :DETECTADO_EN conectan
      // Funcionario, Empresa (y opcionalmente PersonaFisica si DNI conocido)
      // al nodo :Conflicto.
      await session.run(`CREATE CONSTRAINT conflicto_id IF NOT EXISTS FOR (c:Conflicto) REQUIRE c.id IS UNIQUE`)
      await session.run(`CREATE INDEX conflicto_jurisdiccion IF NOT EXISTS FOR (c:Conflicto) ON (c.jurisdiccion)`)
      await session.run(`CREATE INDEX conflicto_tipologia IF NOT EXISTS FOR (c:Conflicto) ON (c.tipologia)`)

      // ─── B6: índices para hop expansion con cap por relevancia (PLAN-UI §6) ───
      // La expansión 1°/2°/3° del UI necesita ORDER BY <relevancia> DESC LIMIT 500
      // para cumplir el cap de nodos visibles. Sin índices sobre las propiedades
      // de orden, las queries multi-hop hacen full scan.
      //
      // Relevancia por tipo de nodo:
      //   - Conflicto: score (severidad numérica)
      //   - Señal: score
      //   - Contrato: monto (tamaño absoluto)
      //   - Empresa: monto agregado de contratos firmados (no indexable directo —
      //     se mantiene como propiedad cacheada vía detector cuando aplique)
      await session.run(`CREATE INDEX conflicto_score IF NOT EXISTS FOR (c:Conflicto) ON (c.score)`)
      await session.run(`CREATE INDEX conflicto_severidad IF NOT EXISTS FOR (c:Conflicto) ON (c.severidad)`)
      await session.run(`CREATE INDEX senal_score IF NOT EXISTS FOR (s:Señal) ON (s.score)`)
      await session.run(`CREATE INDEX senal_severidad IF NOT EXISTS FOR (s:Señal) ON (s.severidad)`)
      await session.run(`CREATE INDEX contrato_monto IF NOT EXISTS FOR (c:Contrato) ON (c.monto)`)
      await session.run(`CREATE INDEX empresa_total_contratado IF NOT EXISTS FOR (e:Empresa) ON (e.totalContratado)`)

      // Relationship indexes (Neo4j 5.x+) para tier sobre DIRIGE
      // Útil cuando expandimos PersonaFisica → Empresa y queremos priorizar
      // direcciones de Tier 1 (CUIT exacto) sobre Tier 2-5 (inferencia).
      // Wrappeado en try/catch: si el server es Neo4j 4.x este sintaxis falla
      // pero las queries siguen funcionando, solo más lentas.
      try {
        await session.run(`CREATE INDEX dirige_tier IF NOT EXISTS FOR ()-[r:DIRIGE]-() ON (r.tier)`)
      } catch (e) {
        console.warn('[graph] B6 relationship index DIRIGE.tier no creado (Neo4j 4.x?):', String(e).split('\n')[0])
      }
      try {
        await session.run(`CREATE INDEX detectado_en_rol IF NOT EXISTS FOR ()-[r:DETECTADO_EN]-() ON (r.rol)`)
      } catch (e) {
        console.warn('[graph] B6 relationship index DETECTADO_EN.rol no creado (Neo4j 4.x?):', String(e).split('\n')[0])
      }
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

// ─── W4 Iter#5: nodo :Conflicto + aristas :DETECTADO_EN ─────────────────────

export interface ConflictoNodeData {
  id: string                          // sha256(funcionario_norm + cuit_empresa? + jurisdiccion + tipologia)
  tipologia: string                   // 'conflicto_funcionario_proveedor' | 'conflicto_funcionario_multiproveedor' | …
  jurisdiccion: string
  funcionarioNombre: string
  funcionarioNorm: string
  funcionarioDni?: string | null      // si conocido
  score: number                       // 0-100
  severidad: 'grave' | 'moderada' | 'leve'
  contratosTotal: number
  montoTotal: number
  empresasCount: number               // 1 para individual, ≥2 para sistémico
  detectadoEn: string                 // ISO timestamp
  snapshotId: string
  fuenteUrls?: string[]
}

export interface ConflictoEmpresaLink {
  cuitEmpresa: string
  empresaNombre: string
  dniDirector: string | null
  contratos: number
  monto: number
}

/**
 * Persiste un :Conflicto como nodo del grafo + aristas :DETECTADO_EN
 * desde Funcionario, Empresas y opcionalmente PersonaFisica.
 *
 * Idempotente vía MERGE por id. Si Neo4j no está disponible, noop.
 *
 * Modelo:
 *   (Funcionario {nombreNorm: X})-[:DETECTADO_EN {rol:'sospechoso'}]->(Conflicto)
 *   (Empresa {cuit: Y})-[:DETECTADO_EN {rol:'proveedor'}]->(Conflicto)
 *   (PersonaFisica {dni: Z})-[:DETECTADO_EN {rol:'director'}]->(Conflicto)  // si DNI conocido
 *
 * El Funcionario se matchea por nombreNorm + jurisdiccion (no por id, que es
 * por-cargo) — así un mismo conflicto agrupa todos los registros del funcionario.
 */
export async function upsertConflicto(
  data: ConflictoNodeData,
  empresas: ConflictoEmpresaLink[],
): Promise<void> {
  if (!_available) return
  await withSession(async s => {
    // 1) Upsert :Conflicto node
    await s.run(
      `MERGE (c:Conflicto {id: $id})
       SET c.tipologia       = $tipologia,
           c.jurisdiccion    = $jurisdiccion,
           c.funcionarioNombre = $funcionarioNombre,
           c.funcionarioNorm   = $funcionarioNorm,
           c.funcionarioDni    = $funcionarioDni,
           c.score           = $score,
           c.severidad       = $severidad,
           c.contratosTotal  = $contratosTotal,
           c.montoTotal      = $montoTotal,
           c.empresasCount   = $empresasCount,
           c.detectadoEn     = $detectadoEn,
           c.snapshotId      = $snapshotId,
           c.fuenteUrls      = $fuenteUrls`,
      {
        ...data,
        funcionarioDni: data.funcionarioDni ?? null,
        fuenteUrls: data.fuenteUrls ?? [],
      }
    )

    // 2) Aristas Funcionario → Conflicto. Match por nombreNorm + jurisdiccion
    // (todos los registros de cargo del funcionario conectan al mismo conflicto).
    await s.run(
      `MATCH (c:Conflicto {id: $id})
       MATCH (f:Funcionario {nombreNorm: $funcionarioNorm, jurisdiccion: $jurisdiccion})
       MERGE (f)-[:DETECTADO_EN {rol: 'sospechoso'}]->(c)`,
      { id: data.id, funcionarioNorm: data.funcionarioNorm, jurisdiccion: data.jurisdiccion }
    )

    // 3) PersonaFisica → Conflicto si DNI conocido
    if (data.funcionarioDni) {
      await s.run(
        `MATCH (c:Conflicto {id: $id})
         MATCH (p:PersonaFisica {dni: $dni})
         MERGE (p)-[:DETECTADO_EN {rol: 'sospechoso'}]->(c)`,
        { id: data.id, dni: data.funcionarioDni }
      )
    }

    // 4) Aristas Empresa → Conflicto + DNI del director si conocido
    for (const e of empresas) {
      await s.run(
        `MATCH (c:Conflicto {id: $id})
         MATCH (em:Empresa {cuit: $cuit})
         MERGE (em)-[link:DETECTADO_EN {rol: 'proveedor'}]->(c)
         SET link.contratos = $contratos, link.monto = $monto`,
        { id: data.id, cuit: e.cuitEmpresa, contratos: e.contratos, monto: e.monto }
      )
      if (e.dniDirector) {
        await s.run(
          `MATCH (c:Conflicto {id: $id})
           MERGE (p:PersonaFisica {dni: $dni})
           ON CREATE SET p.nombre = $empresaNombre  // placeholder, mejor data llega vía seed-igj
           MERGE (p)-[:DETECTADO_EN {rol: 'director'}]->(c)`,
          { id: data.id, dni: e.dniDirector, empresaNombre: e.empresaNombre }
        )
      }
    }
  })
}

export interface ConflictoListItem {
  id: string
  tipologia: string
  jurisdiccion: string
  funcionarioNombre: string
  score: number
  severidad: string
  empresasCount: number
  montoTotal: number
  detectadoEn: string
}

export async function listarConflictos(opts: {
  jurisdiccion?: string
  tipologia?: string
  minScore?: number
  limit?: number
} = {}): Promise<ConflictoListItem[]> {
  if (!_available) return []
  return withSession(async s => {
    const params: Record<string, unknown> = { limit: opts.limit ?? 100 }
    const where: string[] = []
    if (opts.jurisdiccion) {
      where.push('c.jurisdiccion = $jurisdiccion')
      params.jurisdiccion = opts.jurisdiccion
    }
    if (opts.tipologia) {
      where.push('c.tipologia = $tipologia')
      params.tipologia = opts.tipologia
    }
    if (opts.minScore != null) {
      where.push('c.score >= $minScore')
      params.minScore = opts.minScore
    }
    const whereSql = where.length > 0 ? `WHERE ${where.join(' AND ')}` : ''

    const result = await s.run(
      `MATCH (c:Conflicto)
       ${whereSql}
       RETURN c.id AS id, c.tipologia AS tipologia, c.jurisdiccion AS jurisdiccion,
              c.funcionarioNombre AS funcionarioNombre, c.score AS score,
              c.severidad AS severidad, c.empresasCount AS empresasCount,
              c.montoTotal AS montoTotal, c.detectadoEn AS detectadoEn
       ORDER BY c.score DESC
       LIMIT $limit`,
      params
    )
    return result.records.map(r => ({
      id: r.get('id') as string,
      tipologia: r.get('tipologia') as string,
      jurisdiccion: r.get('jurisdiccion') as string,
      funcionarioNombre: r.get('funcionarioNombre') as string,
      score: Number(r.get('score')),
      severidad: r.get('severidad') as string,
      empresasCount: Number(r.get('empresasCount')),
      montoTotal: Number(r.get('montoTotal')),
      detectadoEn: r.get('detectadoEn') as string,
    }))
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
    // Schema nuevo (Iter 8.x): PersonaFisica-DIRIGE-Empresa.
    // El schema viejo (Empresa-TIENE_DIRECTOR-Director) sigue soportado
    // como fallback con UNION para que no quede nada huérfano si el seed
    // antiguo coexiste con el nuevo.
    const result = await s.run(
      `MATCH (e1:Empresa {municipio: $municipio})<-[:DIRIGE]-(p:PersonaFisica)
             -[:DIRIGE]->(e2:Empresa {municipio: $municipio})
       WHERE e1.cuit < e2.cuit
       WITH e1, e2, collect(p.nombre) AS directores
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
    // Schema nuevo: PersonaFisica-DIRIGE-Empresa (Iter 8.x)
    const result = await s.run(
      `MATCH (e1:Empresa {municipio: $municipio})<-[:DIRIGE]-(p:PersonaFisica)
             -[:DIRIGE]->(e2:Empresa {municipio: $municipio})
       WHERE e1.cuit < e2.cuit
       WITH e1, e2, collect(p.nombre) AS directores
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

// ─── Señales en el grafo ─────────────────────────────────────────────────
// Cada señal del motor (señales_cache en DuckDB) se representa como un nodo
// Señal en Neo4j. Conectada a las empresas implicadas vía SEÑALA. Esto hace
// que el grafo del landing /explorar muestre los hallazgos como puntos
// destacados, no como tablas separadas.

export async function upsertSeñalGrafo(data: {
  id: string
  tipologia: string
  titulo: string
  score: number
  severidad: 'grave' | 'moderada' | 'leve'
  cuitsImplicados: string[]
}): Promise<void> {
  if (!_available) return
  await withSession(async s => {
    await s.run(
      `MERGE (sn:Señal {id: $id})
       SET sn.tipologia = $tipologia,
           sn.titulo = $titulo,
           sn.score = $score,
           sn.severidad = $severidad`,
      data
    )
    if (data.cuitsImplicados.length > 0) {
      await s.run(
        `MATCH (sn:Señal {id: $id})
         UNWIND $cuits AS cuit
         OPTIONAL MATCH (e:Empresa {cuit: cuit})
         FOREACH (emp IN CASE WHEN e IS NULL THEN [] ELSE [e] END |
           MERGE (sn)-[:SEÑALA]->(emp)
         )`,
        { id: data.id, cuits: data.cuitsImplicados }
      )
    }
  })
}

/**
 * Convierte propiedades de un nodo Neo4j a formato JSON-friendly:
 * Neo4j Integer → number (via toNumber()).
 * Aplicar siempre antes de meter properties en el field `data` de un
 * GrafoNode, sino el frontend recibe `{low, high, ...}` y los chequeos
 * `typeof === 'number'` fallan.
 */
function serializeProps(props: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(props)) {
    if (v == null) { out[k] = null; continue }
    if (typeof v === 'object' && 'toNumber' in (v as { toNumber?: () => number })) {
      out[k] = (v as { toNumber: () => number }).toNumber()
    } else if (Array.isArray(v)) {
      out[k] = v.map(item =>
        item != null && typeof item === 'object' && 'toNumber' in (item as { toNumber?: () => number })
          ? (item as { toNumber: () => number }).toNumber()
          : item
      )
    } else {
      out[k] = v
    }
  }
  return out
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
  kind: 'dirige' | 'trabaja_en' | 'gano' | 'opera_en' | 'es_la_misma_persona' | 'comparte_director' | 'conflicto_con' | 'señalada_por' | 'tiene_director' | 'señala'
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
       WITH e, sum(op.monto) AS total, count(DISTINCT r) AS nrep,
            collect(r) AS reparticiones
       ORDER BY nrep DESC, total DESC
       LIMIT 60
       OPTIONAL MATCH (p:PersonaFisica)-[:DIRIGE]->(e)
       WITH e, total, nrep, reparticiones, collect(p)[0..3] AS dirigentes
       RETURN e, reparticiones, dirigentes, total, nrep`,
      { municipio }
    )

    // Personas con ≥2 empresas dirigidas (más coverage). Bajamos el threshold
    // de 3 a 2 porque incluso dirigir 2 empresas es señal de poder visible
    // y aumenta la densidad del grafo.
    const topDirigentes = await s.run(
      `MATCH (p:PersonaFisica)-[:DIRIGE]->(e:Empresa)
       WITH p, count(e) AS cnt, collect(e)[0..5] AS empresas
       WHERE cnt >= 2
       RETURN p, empresas, cnt
       ORDER BY cnt DESC
       LIMIT 40`
    )

    // Señales activas con sus empresas implicadas
    const señales = await s.run(
      `MATCH (sn:Señal)
       OPTIONAL MATCH (sn)-[:SEÑALA]->(e:Empresa)
       RETURN sn, collect(e) AS empresas
       ORDER BY sn.score DESC
       LIMIT 30`
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
          data: serializeProps(e.properties),
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
          data: serializeProps(p.properties),
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
          data: serializeProps(f.properties),
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
          data: serializeProps(r.properties),
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

    // Señales como nodos destacados — el corazón de ARGOS visible en el grafo.
    for (const rec of señales.records) {
      const sn = rec.get('sn')
      const props = sn.properties as Record<string, unknown>
      const id = props.id as string
      const score = (props.score as { toNumber?: () => number } | number | null)
      const scoreNum = (score && typeof (score as { toNumber?: () => number }).toNumber === 'function')
        ? (score as { toNumber: () => number }).toNumber()
        : Number(score ?? 0)
      const sevRaw = (props.severidad as string | null) ?? 'leve'
      const sevValid: 'grave' | 'moderada' | 'leve' =
        sevRaw === 'grave' || sevRaw === 'moderada' || sevRaw === 'leve' ? sevRaw : 'leve'
      void sevValid
      const señalId = `señal:${id}`
      if (!nodeMap.has(señalId)) {
        nodeMap.set(señalId, {
          id: señalId,
          type: 'señal',
          label: (props.titulo as string) ?? (props.tipologia as string) ?? id,
          subtitle: (props.tipologia as string) ?? undefined,
          weight: Math.min(0.95, Math.max(0.5, scoreNum / 100)),
          data: { ...props, score: scoreNum },
        })
      }
      const empresas = rec.get('empresas') as Array<{ properties: Record<string, unknown> } | null>
      for (const e of empresas ?? []) {
        if (!e?.properties?.cuit) continue
        pushEmpresa(e)
        edges.push({
          source: señalId,
          target: `empresa:${e.properties.cuit}`,
          kind: 'señala',
          weight: 0.7,
        })
      }
    }

    return { nodes: Array.from(nodeMap.values()), edges }
  })
}

/**
 * Stats globales del grafo Neo4j cordobés. Útil para el dashboard del
 * landing — muestra "X funcionarios, Y empresas, Z conexiones, K
 * conflictos potenciales" sin necesidad de cargar todo el subgrafo.
 */
export interface GrafoStats {
  nodos: { empresa: number; persona: number; funcionario: number; reparticion: number; contrato: number; señal: number }
  aristas: { dirige: number; trabaja_en: number; gano: number; opera_en: number; emite: number; es_la_misma_persona: number; conflicto_con: number; señala: number }
  topPersonasPorEmpresas: Array<{ dni: string; nombre: string; empresas: number }>
  topEmpresasPorOpera: Array<{ cuit: string; nombre: string; reparticiones: number; monto: number }>
  conflictosPotenciales: Array<{
    funcionario: string
    funcionarioReparticion: string | null
    empresa: string
    empresaOperaEn: string
    tier: 1 | 2 | null
    metodo: string | null
    homonimos: number
  }>
  señalesActivas: Array<{
    id: string
    tipologia: string
    titulo: string
    score: number
    severidad: 'grave' | 'moderada' | 'leve'
    empresasImplicadas: number
  }>
}

export async function getGrafoStats(): Promise<GrafoStats | null> {
  if (!_available) return null
  return withSession(async s => {
    const toNum = (v: unknown): number => {
      if (v == null) return 0
      if (typeof v === 'object' && 'toNumber' in (v as { toNumber?: () => number })) {
        return (v as { toNumber: () => number }).toNumber()
      }
      return Number(v)
    }

    // Conteo por label en una sola query
    const labelsR = await s.run(
      `MATCH (n)
       RETURN labels(n)[0] AS label, count(n) AS cnt`
    )
    const nodos = { empresa: 0, persona: 0, funcionario: 0, reparticion: 0, contrato: 0, señal: 0 }
    for (const r of labelsR.records) {
      const lbl = (r.get('label') as string) ?? ''
      const cnt = toNum(r.get('cnt'))
      if (lbl === 'Empresa') nodos.empresa = cnt
      else if (lbl === 'PersonaFisica') nodos.persona = cnt
      else if (lbl === 'Funcionario') nodos.funcionario = cnt
      else if (lbl === 'Reparticion') nodos.reparticion = cnt
      else if (lbl === 'Contrato') nodos.contrato = cnt
      else if (lbl === 'Señal') nodos.señal = cnt
    }

    const relsR = await s.run(
      `MATCH ()-[r]->()
       RETURN type(r) AS rel, count(r) AS cnt`
    )
    const aristas = { dirige: 0, trabaja_en: 0, gano: 0, opera_en: 0, emite: 0, es_la_misma_persona: 0, conflicto_con: 0, señala: 0 }
    for (const r of relsR.records) {
      const rel = (r.get('rel') as string) ?? ''
      const cnt = toNum(r.get('cnt'))
      if (rel === 'DIRIGE') aristas.dirige = cnt
      else if (rel === 'TRABAJA_EN') aristas.trabaja_en = cnt
      else if (rel === 'GANÓ') aristas.gano = cnt
      else if (rel === 'OPERA_EN') aristas.opera_en = cnt
      else if (rel === 'EMITE') aristas.emite = cnt
      else if (rel === 'ES_LA_MISMA_PERSONA') aristas.es_la_misma_persona = cnt
      else if (rel === 'CONFLICTO_CON') aristas.conflicto_con = cnt
      else if (rel === 'SEÑALA') aristas.señala = cnt
    }

    // Top personas por # empresas dirigidas
    const topP = await s.run(
      `MATCH (p:PersonaFisica)-[:DIRIGE]->(e:Empresa)
       WITH p, count(e) AS empresas
       WHERE empresas >= 2
       RETURN p.dni AS dni, p.nombre AS nombre, empresas
       ORDER BY empresas DESC LIMIT 10`
    )
    const topPersonasPorEmpresas = topP.records.map(r => ({
      dni: (r.get('dni') as string) ?? '',
      nombre: (r.get('nombre') as string) ?? '',
      empresas: toNum(r.get('empresas')),
    }))

    // Top empresas por reparticiones donde operan
    const topE = await s.run(
      `MATCH (e:Empresa)-[op:OPERA_EN]->(r:Reparticion)
       WITH e, count(DISTINCT r) AS nrep, sum(op.monto) AS monto
       RETURN e.cuit AS cuit, e.nombre AS nombre, nrep, monto
       ORDER BY nrep DESC, monto DESC LIMIT 10`
    )
    const topEmpresasPorOpera = topE.records.map(r => ({
      cuit: (r.get('cuit') as string) ?? '',
      nombre: (r.get('nombre') as string) ?? '',
      reparticiones: toNum(r.get('nrep')),
      monto: toNum(r.get('monto')),
    }))

    // Conflictos potenciales: Funcionario ES_LA_MISMA_PERSONA →
    // PersonaFisica → DIRIGE → Empresa → OPERA_EN → Reparticion. Si
    // además el Funcionario TRABAJA_EN la misma reparticion, es Tier
    // verificado. Si no, es potencial.
    //
    // Filtros anti-homonimia (post-audit 2026-04-26):
    // 1) tier=2 + nombreNorm con >3 PersonaFisica distintos → descarta
    //    (homonimia razonable, no apuntable). Tier 1 (CUIT/DNI exact) pasa siempre.
    // 2) DISTINCT por (funcionario, empresa) para no duplicar pares iguales por
    //    diferentes reparticiones operadoras.
    const confR = await s.run(
      `MATCH (f:Funcionario)-[link:ES_LA_MISMA_PERSONA]->(p:PersonaFisica)
            -[:DIRIGE]->(e:Empresa)-[:OPERA_EN]->(r2:Reparticion)
       WITH f, link, p, e, r2,
            CASE WHEN link.tier = 1 THEN 1 ELSE
              size([(otro:PersonaFisica) WHERE otro.nombreNorm = p.nombreNorm | otro])
            END AS homonimos
       WHERE homonimos <= 3
       OPTIONAL MATCH (f)-[:TRABAJA_EN]->(r1:Reparticion)
       WITH f, e, link, homonimos, head(collect(r1.nombre)) AS funcRep, head(collect(r2.nombre)) AS empOpera
       RETURN f.nombre AS funcionario, funcRep,
              e.nombre AS empresa, empOpera,
              link.tier AS tier, link.metodo AS metodo,
              homonimos
       ORDER BY link.tier ASC, homonimos ASC
       LIMIT 20`
    )
    const conflictosPotenciales = confR.records.map(r => {
      const tierRaw = toNum(r.get('tier'))
      const tier: 1 | 2 | null = tierRaw === 1 ? 1 : tierRaw === 2 ? 2 : null
      return {
        funcionario: (r.get('funcionario') as string) ?? '',
        funcionarioReparticion: (r.get('funcRep') as string | null) ?? null,
        empresa: (r.get('empresa') as string) ?? '',
        empresaOperaEn: (r.get('empOpera') as string) ?? '',
        tier,
        metodo: (r.get('metodo') as string | null) ?? null,
        homonimos: toNum(r.get('homonimos')),
      }
    })

    // Señales activas con conteo de empresas implicadas
    const señalesR = await s.run(
      `MATCH (sn:Señal)
       OPTIONAL MATCH (sn)-[:SEÑALA]->(e:Empresa)
       WITH sn, count(e) AS empresasCnt
       RETURN sn, empresasCnt
       ORDER BY sn.score DESC`
    )
    const señalesActivas = señalesR.records.map(rec => {
      const sn = rec.get('sn') as { properties: Record<string, unknown> }
      const props = sn.properties
      const sevRaw = (props.severidad as string | null) ?? 'leve'
      const sev: 'grave' | 'moderada' | 'leve' =
        sevRaw === 'grave' || sevRaw === 'moderada' || sevRaw === 'leve' ? sevRaw : 'leve'
      return {
        id: (props.id as string) ?? '',
        tipologia: (props.tipologia as string) ?? '',
        titulo: (props.titulo as string) ?? '',
        score: toNum(props.score),
        severidad: sev,
        empresasImplicadas: toNum(rec.get('empresasCnt')),
      }
    })

    return { nodos, aristas, topPersonasPorEmpresas, topEmpresasPorOpera, conflictosPotenciales, señalesActivas }
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
    } else if (tipo === 'señal') {
      // Click en señal → trae empresas señaladas + sus directores y reparticiones
      // (un nivel de expansión que aterriza al usuario en los actores reales).
      cypher = `
        MATCH (sn:Señal {id: $clave})
        OPTIONAL MATCH (sn)-[:SEÑALA]->(e:Empresa)
        OPTIONAL MATCH (p:PersonaFisica)-[:DIRIGE]->(e)
        OPTIONAL MATCH (e)-[:OPERA_EN]->(r:Reparticion)
        RETURN sn, collect(DISTINCT e) AS empresas,
               collect(DISTINCT p)[0..10] AS personas,
               collect(DISTINCT r) AS reparticiones`
    } else {
      return { nodes: [], edges: [] }
    }

    const result = await s.run(cypher, params)
    const nodeMap = new Map<string, GrafoNode>()
    const edges: GrafoEdge[] = []

    const addEmpresa = (e: { properties: Record<string, unknown> } | null) => {
      if (!e?.properties.cuit) return null as string | null
      const id = `empresa:${e.properties.cuit}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'empresa', label: (e.properties.nombre as string) ?? '', subtitle: e.properties.cuit as string, weight: 0.7, data: serializeProps(e.properties) })
      return id
    }
    const addPersona = (p: { properties: Record<string, unknown> } | null) => {
      if (!p?.properties.dni) return null as string | null
      const id = `persona:${p.properties.dni}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'persona', label: (p.properties.nombre as string) ?? '', subtitle: `DNI ${p.properties.dni}`, weight: 0.5, data: serializeProps(p.properties) })
      return id
    }
    const addFunc = (f: { properties: Record<string, unknown> } | null) => {
      if (!f?.properties.id) return null as string | null
      const id = `funcionario:${f.properties.id}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'funcionario', label: (f.properties.nombre as string) ?? '', subtitle: (f.properties.cargo as string) ?? undefined, weight: 0.4, data: serializeProps(f.properties) })
      return id
    }
    const addRep = (r: { properties: Record<string, unknown> } | null) => {
      if (!r?.properties.id) return null as string | null
      const id = `reparticion:${r.properties.id}`
      if (!nodeMap.has(id)) nodeMap.set(id, { id, type: 'reparticion', label: (r.properties.nombre as string) ?? '', subtitle: (r.properties.jurisdiccion as string) ?? undefined, weight: 0.6, data: serializeProps(r.properties) })
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
      } else if (tipo === 'señal') {
        const sn = rec.get('sn')
        if (!sn?.properties?.id) continue
        const señalId = `señal:${sn.properties.id}`
        if (!nodeMap.has(señalId)) {
          const score = sn.properties.score
          const scoreNum = (score && typeof (score as { toNumber?: () => number }).toNumber === 'function')
            ? (score as { toNumber: () => number }).toNumber()
            : Number(score ?? 0)
          nodeMap.set(señalId, {
            id: señalId,
            type: 'señal',
            label: (sn.properties.titulo as string) ?? (sn.properties.tipologia as string) ?? sn.properties.id as string,
            subtitle: (sn.properties.tipologia as string) ?? undefined,
            weight: Math.min(0.95, Math.max(0.5, scoreNum / 100)),
            data: { ...sn.properties, score: scoreNum },
          })
        }
        for (const e of (rec.get('empresas') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          const eId = addEmpresa(e); if (eId) edges.push({ source: señalId, target: eId, kind: 'señala', weight: 0.7 })
        }
        for (const p of (rec.get('personas') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          addPersona(p)
        }
        for (const r of (rec.get('reparticiones') ?? []) as Array<{ properties: Record<string, unknown> }>) {
          addRep(r)
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

// ─── Mapa estatal — nodos raíz Estado y Programa (W1) ───────────────────────

export async function upsertEstado(data: {
  id: string
  nombre: string
  tipo: 'nacion' | 'provincia' | 'municipio'
  nivel: 0 | 1 | 2
  cuit?: string | null
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MERGE (e:Estado {id: $id})
     SET e.nombre = $nombre, e.tipo = $tipo, e.nivel = $nivel,
         e.cuit = $cuit, e.fuenteUrl = $fuenteUrl`,
    { ...data, cuit: data.cuit ?? null }
  ))
}

export async function upsertContieneReparticion(data: {
  estadoId: string
  reparticionId: string
  tipoRelacion?: 'dependencia_directa' | 'organo_descentralizado'
  fuenteUrl?: string | null
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (e:Estado {id: $estadoId}), (r:Reparticion {id: $reparticionId})
     MERGE (e)-[c:CONTIENE]->(r)
     SET c.tipoRelacion = $tipoRelacion, c.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      tipoRelacion: data.tipoRelacion ?? 'dependencia_directa',
      fuenteUrl: data.fuenteUrl ?? null,
    }
  ))
}

export async function upsertTransferencia(data: {
  origenEstadoId: string
  destinoEstadoId: string
  anio: number
  monto: number
  concepto?: string | null
  leyMarco?: string | null
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (a:Estado {id: $origenEstadoId}), (b:Estado {id: $destinoEstadoId})
     MERGE (a)-[t:TRANSFIERE {anio: $anio, concepto: $concepto}]->(b)
     SET t.monto = $monto, t.leyMarco = $leyMarco, t.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      concepto: data.concepto ?? '',
      leyMarco: data.leyMarco ?? null,
    }
  ))
}

export async function upsertPrograma(data: {
  id: string
  nombre: string
  anio: number
  estadoId: string
  reparticionId?: string | null
  montoAsignado?: number | null
  montoDevengado?: number | null
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(async s => {
    await s.run(
      `MERGE (p:Programa {id: $id})
       SET p.nombre = $nombre, p.anio = $anio, p.estadoId = $estadoId,
           p.fuenteUrl = $fuenteUrl`,
      data
    )
    await s.run(
      `MATCH (p:Programa {id: $id}), (e:Estado {id: $estadoId})
       MERGE (e)-[:CONTIENE_PROGRAMA]->(p)`,
      { id: data.id, estadoId: data.estadoId }
    )
    if (data.reparticionId && (data.montoAsignado != null || data.montoDevengado != null)) {
      await s.run(
        `MATCH (r:Reparticion {id: $reparticionId}), (p:Programa {id: $programaId})
         MERGE (r)-[rel:RECIBE_PRESUPUESTO {anio: $anio}]->(p)
         SET rel.montoAsignado = $montoAsignado,
             rel.montoDevengado = $montoDevengado,
             rel.fuenteUrl = $fuenteUrl`,
        {
          reparticionId: data.reparticionId,
          programaId: data.id,
          anio: data.anio,
          montoAsignado: data.montoAsignado ?? null,
          montoDevengado: data.montoDevengado ?? null,
          fuenteUrl: data.fuenteUrl,
        }
      )
    }
  })
}

export async function upsertOcupaCargo(data: {
  personaDni: string
  reparticionId: string
  cargo: string
  desde?: string | null
  hasta?: string | null
  electivo?: boolean
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (p:PersonaFisica {dni: $personaDni}), (r:Reparticion {id: $reparticionId})
     MERGE (p)-[oc:OCUPA_CARGO {cargo: $cargo, desde: $desde}]->(r)
     SET oc.hasta = $hasta, oc.electivo = $electivo, oc.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      desde: data.desde ?? null,
      hasta: data.hasta ?? null,
      electivo: data.electivo ?? false,
    }
  ))
}

export async function upsertPagaNominaResumen(data: {
  reparticionId: string
  personaDni: string
  anio: number
  cargo?: string | null
  status?: 'activo' | 'pasivo'
  montoTotal: number
  mesesPagados: number
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (r:Reparticion {id: $reparticionId}), (p:PersonaFisica {dni: $personaDni})
     MERGE (r)-[pn:PAGA_NOMINA {anio: $anio}]->(p)
     SET pn.cargo = $cargo, pn.status = $status,
         pn.montoTotal = $montoTotal, pn.mesesPagados = $mesesPagados,
         pn.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      cargo: data.cargo ?? null,
      status: data.status ?? 'activo',
    }
  ))
}

// ─── B6: Hop expansion con cap por relevancia (PLAN-UI §6) ──────────────────
// Habilita la expansión 1°/2°/3° desde un nodo seleccionado en Profile o
// landing, con cap duro de 500 nodos visibles y priorización por relevancia.

export type HopRoot =
  | { type: 'persona'; dni: string }
  | { type: 'empresa'; cuit: string }
  | { type: 'funcionario'; id: string }
  | { type: 'conflicto'; id: string }
  | { type: 'señal'; id: string }

/**
 * Expande el ego-graph desde un nodo central a N hops (1-3) con cap por
 * relevancia. Aprovecha los índices de B6 sobre score, severidad, monto.
 *
 * Estrategia:
 *   1. Match path de longitud 1..hops desde el centro
 *   2. Para cada nodo destino calcula score de relevancia agregado
 *      (severidad de señales tocadas + monto de contratos + jerarquía cargo)
 *   3. ORDER BY relevancia DESC LIMIT cap
 *
 * Si Neo4j no está disponible, devuelve grafo vacío.
 */
export async function expandirEgo(opts: {
  root: HopRoot
  hops: 1 | 2 | 3
  cap?: number
}): Promise<Grafo & { capExcedido: boolean }> {
  if (!_available) return { nodes: [], edges: [], capExcedido: false }
  const cap = Math.min(opts.cap ?? 500, 500) // hard cap defensivo
  const hops = Math.max(1, Math.min(3, opts.hops))

  // Helper local: Neo4j devuelve algunos counters como BigInt (driver 5.x).
  const toNumLocal = (v: unknown): number => {
    if (typeof v === 'number') return v
    if (typeof v === 'bigint') return Number(v)
    if (v && typeof v === 'object' && 'toNumber' in v && typeof (v as { toNumber: () => number }).toNumber === 'function') {
      return (v as { toNumber: () => number }).toNumber()
    }
    return Number(v ?? 0)
  }

  return withSession(async s => {
    // Construir el match del nodo raíz según su tipo
    let rootMatch = ''
    let rootParam: Record<string, unknown> = {}
    switch (opts.root.type) {
      case 'persona':
        rootMatch = `(root:PersonaFisica {dni: $rootKey})`
        rootParam = { rootKey: opts.root.dni }
        break
      case 'empresa':
        rootMatch = `(root:Empresa {cuit: $rootKey})`
        rootParam = { rootKey: opts.root.cuit }
        break
      case 'funcionario':
        rootMatch = `(root:Funcionario {id: $rootKey})`
        rootParam = { rootKey: opts.root.id }
        break
      case 'conflicto':
        rootMatch = `(root:Conflicto {id: $rootKey})`
        rootParam = { rootKey: opts.root.id }
        break
      case 'señal':
        rootMatch = `(root:Señal {id: $rootKey})`
        rootParam = { rootKey: opts.root.id }
        break
    }

    // Query: descubre nodos a 1..hops y agrega score de relevancia.
    // - Conflicto/Señal: score directo
    // - Contrato: monto / 1e6 (escala razonable)
    // - PersonaFisica/Funcionario: 50 (peso moderado por defecto)
    // - Empresa: 30 + sum(contratos vinculados) escala
    const r = await s.run(
      `MATCH path = ${rootMatch}-[*1..${hops}]-(target)
       WITH DISTINCT target, length(path) AS distancia
       OPTIONAL MATCH (target)-[:GANÓ|OPERA_EN]->(co:Contrato)
       WITH target, distancia, COALESCE(SUM(co.monto), 0) AS montoVinculado
       WITH target, distancia, montoVinculado,
         CASE labels(target)[0]
           WHEN 'Conflicto' THEN COALESCE(target.score, 50)
           WHEN 'Señal'     THEN COALESCE(target.score, 50)
           WHEN 'Contrato'  THEN COALESCE(target.monto, 0) / 1000000.0
           WHEN 'Empresa'   THEN 30 + (montoVinculado / 1000000.0)
           WHEN 'PersonaFisica' THEN 50
           WHEN 'Funcionario'   THEN 50
           ELSE 20
         END AS relevancia
       ORDER BY relevancia DESC, distancia ASC
       LIMIT $cap
       RETURN target, distancia, relevancia`,
      { ...rootParam, cap: neo4j.int(cap) },
    )

    const nodes: GrafoNode[] = []
    const seenIds = new Set<string>()
    for (const rec of r.records) {
      const t = rec.get('target') as { labels: string[]; properties: Record<string, unknown> }
      const lbl = t.labels[0]
      const props = t.properties
      const id =
        (props.dni as string) ??
        (props.cuit as string) ??
        (props.id as string) ??
        ''
      if (!id || seenIds.has(id)) continue
      seenIds.add(id)
      nodes.push({
        id,
        type: (lbl?.toLowerCase() ?? 'empresa') as GrafoNode['type'],
        label: (props.nombre as string) ?? (props.razon_social as string) ?? (props.titulo as string) ?? id,
        subtitle: (props.cuit as string | undefined) ?? (props.dni as string | undefined),
        weight: toNumLocal(rec.get('relevancia')),
        data: { ...props, distancia: toNumLocal(rec.get('distancia')) },
      })
    }

    // Recolectar aristas entre los nodos del set (evitamos otra MATCH costosa
    // — solo aristas con ambos endpoints en el set ya cap-limitado).
    const ids = nodes.map(n => n.id)
    const edges: GrafoEdge[] = []
    if (ids.length > 0) {
      const re = await s.run(
        `MATCH (a)-[r]-(b)
         WHERE (a.dni IN $ids OR a.cuit IN $ids OR a.id IN $ids)
           AND (b.dni IN $ids OR b.cuit IN $ids OR b.id IN $ids)
           AND id(a) < id(b)
         RETURN a, type(r) AS rel, b, properties(r) AS props
         LIMIT 5000`,
        { ids },
      )
      const seenEdges = new Set<string>()
      for (const rec of re.records) {
        const a = rec.get('a') as { properties: Record<string, unknown> }
        const b = rec.get('b') as { properties: Record<string, unknown> }
        const sourceId =
          (a.properties.dni as string) ??
          (a.properties.cuit as string) ??
          (a.properties.id as string)
        const targetId =
          (b.properties.dni as string) ??
          (b.properties.cuit as string) ??
          (b.properties.id as string)
        if (!sourceId || !targetId) continue
        const key = `${sourceId}|${targetId}|${rec.get('rel')}`
        if (seenEdges.has(key)) continue
        seenEdges.add(key)
        const rel = String(rec.get('rel')).toLowerCase() as GrafoEdge['kind']
        edges.push({
          source: sourceId,
          target: targetId,
          kind: rel,
          weight: 1,
          data: rec.get('props') as Record<string, unknown>,
        })
      }
    }

    // Detectar si excedimos el cap (señal de "X nodos ocultos por relevancia")
    const totalR = await s.run(
      `MATCH path = ${rootMatch}-[*1..${hops}]-(target)
       RETURN count(DISTINCT target) AS total`,
      rootParam,
    )
    const total = toNumLocal(totalR.records[0]?.get('total') ?? 0)
    const capExcedido = total > nodes.length

    return { nodes, edges, capExcedido }
  })
}

export async function closeGraph(): Promise<void> {
  if (_driver) {
    await _driver.close()
    _driver = null
    _available = false
  }
}
