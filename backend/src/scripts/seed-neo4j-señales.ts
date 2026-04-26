// seed-neo4j-señales.ts — Vuelca señales_cache (DuckDB) al grafo Neo4j
// como nodos Señal con aristas SEÑALA→Empresa para cada CUIT implicado.
//
// Idempotente. Borra señales viejas antes de insertar (`DETACH DELETE`)
// para que el grafo siempre refleje el último analyze.
//
// Pre-requisito:
//   npm run analyze --force        (computa señales en DuckDB)
//   docker compose -f docker-compose.neo4j.yml up -d
//
// Uso:
//   npm run seed:neo4j-señales

import 'dotenv/config'
import { initDb, getSeñalesCache } from '../lib/db'
import { initGraph, isGraphAvailable, upsertSeñalGrafo, closeGraph } from '../lib/graph'
import neo4j from 'neo4j-driver'

async function main() {
  console.log('=== ARGOS — Seed Señales en Neo4j ===\n')
  await initDb()
  await initGraph()
  if (!isGraphAvailable()) {
    console.error('Neo4j no disponible. docker compose -f docker-compose.neo4j.yml up -d')
    process.exit(1)
  }

  const señales = await getSeñalesCache()
  console.log(`${señales.length} señales en DuckDB`)

  // Limpiar señales viejas en Neo4j para reflejar exactamente el último analyze
  const drv = neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(process.env.NEO4J_USER ?? 'neo4j', process.env.NEO4J_PASS ?? 'argos_local')
  )
  const session = drv.session()
  try {
    const before = await session.run('MATCH (s:Señal) RETURN count(s) AS cnt')
    const beforeCnt = Number(before.records[0]?.get('cnt')?.toNumber?.() ?? before.records[0]?.get('cnt') ?? 0)
    console.log(`Limpiando ${beforeCnt} señales antiguas...`)
    await session.run('MATCH (s:Señal) DETACH DELETE s')
  } finally {
    await session.close()
    await drv.close()
  }

  let cargadas = 0
  let conCuits = 0
  for (const s of señales) {
    const cuits: string[] = s.entidades_cuit ? safeParse(s.entidades_cuit) : []
    await upsertSeñalGrafo({
      id: s.id,
      tipologia: s.tipologia,
      titulo: s.titulo,
      score: s.score,
      severidad: (s.severidad === 'grave' || s.severidad === 'moderada' || s.severidad === 'leve')
        ? s.severidad
        : 'leve',
      cuitsImplicados: cuits,
    })
    cargadas++
    if (cuits.length > 0) conCuits++
    console.log(`  [${s.score}] [${s.severidad}] ${s.tipologia.padEnd(30)} cuits=${cuits.length}`)
  }

  console.log(`\n✓ ${cargadas} señales cargadas (${conCuits} con CUITs implicados)`)
  await closeGraph()
  process.exit(0)
}

function safeParse(s: string): string[] {
  try {
    const parsed = JSON.parse(s)
    return Array.isArray(parsed) ? parsed.filter(x => typeof x === 'string') : []
  } catch {
    return []
  }
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
