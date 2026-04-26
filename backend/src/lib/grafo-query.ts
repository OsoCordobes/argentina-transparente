// lib/grafo-query.ts — Read-only Cypher executor para tool use del LLM.
//
// El chat de ARGOS le da al modelo (Sonnet 4.6) una tool `consultar_grafo`
// que ejecuta Cypher contra Neo4j. Si dejamos pasar cualquier query, el
// modelo podría borrar el grafo o crear nodos falsos. El guard whitelist
// solo permite operaciones de lectura: MATCH, OPTIONAL MATCH, WITH, WHERE,
// RETURN, ORDER BY, LIMIT, SKIP, UNWIND, CALL (solo db.* y procedures
// listadas), CREATE/MERGE/SET/DELETE/DETACH/REMOVE/DROP están prohibidas.

import neo4j, { Driver } from 'neo4j-driver'

const FORBIDDEN_KEYWORDS = [
  /\bCREATE\b/i,
  /\bMERGE\b/i,
  /\bDELETE\b/i,
  /\bDETACH\s+DELETE\b/i,
  /\bSET\b/i,
  /\bREMOVE\b/i,
  /\bDROP\b/i,
  /\bSTART\b/i,
  /\bFOREACH\b/i,
  /\bLOAD\s+CSV\b/i,
]

const ALLOWED_CALL_PROCEDURES = [
  /^db\./i,                  // db.labels, db.schema, db.indexes, etc.
  /^apoc\.path\./i,          // apoc.path.expand etc. (solo lectura)
  /^apoc\.coll\./i,
  /^apoc\.text\./i,
]

export interface GrafoQueryResult {
  records: Record<string, unknown>[]
  truncated: boolean
}

export class GrafoQueryError extends Error {
  constructor(public reason: string, msg: string) {
    super(msg)
    this.name = 'GrafoQueryError'
  }
}

let _driver: Driver | null = null

function getReadDriver(): Driver {
  if (_driver) return _driver
  _driver = neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASS ?? 'argos_local'),
    { connectionAcquisitionTimeout: 3000 }
  )
  return _driver
}

export function validarCypherReadOnly(query: string): { ok: true } | { ok: false; razon: string } {
  if (!query || query.length > 5000) {
    return { ok: false, razon: 'Query vacía o demasiado larga (>5000 chars)' }
  }
  // Quitar comentarios para que las prohibiciones no se evadan
  const limpio = query.replace(/\/\/[^\n]*/g, ' ').replace(/\/\*[\s\S]*?\*\//g, ' ')
  for (const re of FORBIDDEN_KEYWORDS) {
    if (re.test(limpio)) {
      return { ok: false, razon: `keyword prohibida: ${re.source}` }
    }
  }
  // Validar CALL: solo procedures de la whitelist
  const callMatches = limpio.match(/\bCALL\s+([a-zA-Z][a-zA-Z0-9._]*)/gi)
  if (callMatches) {
    for (const m of callMatches) {
      const proc = m.replace(/^CALL\s+/i, '')
      const allowed = ALLOWED_CALL_PROCEDURES.some(re => re.test(proc))
      if (!allowed) return { ok: false, razon: `CALL ${proc} no permitido` }
    }
  }
  // Asegurar que tiene al menos un RETURN (las read queries lo necesitan)
  if (!/\bRETURN\b/i.test(limpio)) {
    return { ok: false, razon: 'falta RETURN — solo aceptamos queries con RETURN' }
  }
  return { ok: true }
}

/**
 * Ejecuta Cypher read-only. Cap de 50 records para evitar drenar contexto.
 * Convierte Neo4j Integers a JS numbers para JSON.
 */
export async function runReadOnlyCypher(
  query: string,
  params: Record<string, unknown> = {},
  maxRecords = 50,
): Promise<GrafoQueryResult> {
  const v = validarCypherReadOnly(query)
  if (!v.ok) throw new GrafoQueryError('forbidden', v.razon)

  const driver = getReadDriver()
  const session = driver.session({ defaultAccessMode: neo4j.session.READ })
  try {
    const result = await session.run(query, params)
    const records = result.records.slice(0, maxRecords).map(rec => {
      const obj: Record<string, unknown> = {}
      for (const key of rec.keys) {
        const k = String(key)
        obj[k] = serializeNeo4jValue(rec.get(k))
      }
      return obj
    })
    return { records, truncated: result.records.length > maxRecords }
  } finally {
    await session.close()
  }
}

function serializeNeo4jValue(v: unknown): unknown {
  if (v == null) return null
  if (typeof v === 'object' && 'low' in (v as Record<string, unknown>) && 'high' in (v as Record<string, unknown>)) {
    // Neo4j Integer
    return Number((v as { toNumber: () => number }).toNumber())
  }
  // Neo4j Node / Relationship → expose properties
  if (typeof v === 'object' && 'properties' in (v as Record<string, unknown>)) {
    const node = v as { properties: Record<string, unknown>; labels?: string[] }
    const props: Record<string, unknown> = {}
    for (const [k, val] of Object.entries(node.properties)) props[k] = serializeNeo4jValue(val)
    return node.labels ? { _labels: node.labels, ...props } : props
  }
  if (Array.isArray(v)) return v.map(serializeNeo4jValue)
  return v
}

export async function closeGrafoQuery(): Promise<void> {
  if (_driver) {
    await _driver.close()
    _driver = null
  }
}
