// migrate-neo4j-estados.ts — Crea nodos :Estado raíz + migra Reparticion existentes.
//
// W1: crea Nación, Provincia Córdoba, Capital Córdoba.
// Conecta cada :Reparticion existente con su Estado padre vía :CONTIENE.
// Carga los entes_estatales_cordoba como :Reparticion también (los que no estén ya).

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import os from 'os'
import DuckDB from 'duckdb'
import {
  initGraph, isGraphAvailable, closeGraph,
  upsertEstado, upsertReparticion, upsertContieneReparticion,
} from '../lib/graph'

// W1 nota: el DB principal puede estar lockeado por otro proceso (Task 6 en
// paralelo). Hacemos un snapshot file copy a tmp y leemos desde ahí en
// READ_ONLY. Solo leemos `entes_estatales_cordoba` — no necesitamos
// initDb() (que crea/altera tablas).
const DB_PATH = path.join(process.cwd(), 'data', 'argos.duckdb')

interface EnteRow {
  id: string; cuit: string | null; nombre: string;
  jurisdiccion: string; tipo: string; poder: string;
  fuente_url: string;
}

function readEntesEstatalesCordoba(): Promise<EnteRow[]> {
  // Snapshot copy a tmp para evitar lock contention con writers paralelos.
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'argos-w1-'))
  const tmpDb = path.join(tmpDir, 'snapshot.duckdb')
  fs.copyFileSync(DB_PATH, tmpDb)
  const walSrc = `${DB_PATH}.wal`
  const walDst = `${tmpDb}.wal`
  if (fs.existsSync(walSrc)) {
    try { fs.copyFileSync(walSrc, walDst) } catch { /* WAL puede estar lockeado, seguir sin él */ }
  }

  return new Promise((resolve, reject) => {
    const db = new DuckDB.Database(tmpDb, { access_mode: 'READ_ONLY' }, (err) => {
      if (err) { reject(err); return }
      const conn = db.connect()
      conn.all(
        `SELECT id, cuit, nombre, jurisdiccion, tipo, poder, fuente_url
         FROM entes_estatales_cordoba`,
        (e: Error | null, rows: unknown[]) => {
          db.close(() => {
            try { fs.rmSync(tmpDir, { recursive: true, force: true }) } catch { /* ignore */ }
          })
          if (e) reject(e)
          else resolve(rows as EnteRow[])
        }
      )
    })
  })
}

const ESTADOS_RAIZ = [
  {
    id: 'nacion-ar',
    nombre: 'República Argentina',
    tipo: 'nacion' as const,
    nivel: 0 as const,
    cuit: '30-71034970-4',
    fuenteUrl: 'https://www.argentina.gob.ar',
  },
  {
    id: 'cordoba-provincia',
    nombre: 'Provincia de Córdoba',
    tipo: 'provincia' as const,
    nivel: 1 as const,
    cuit: '30-99921020-3',
    fuenteUrl: 'https://www.cba.gov.ar',
  },
  {
    id: 'cordoba-capital',
    nombre: 'Municipalidad de Córdoba',
    tipo: 'municipio' as const,
    nivel: 2 as const,
    cuit: '30-99905722-3',
    fuenteUrl: 'https://www.cordoba.gob.ar',
  },
]

async function connectAllReparticionesToEstado(): Promise<void> {
  const { default: neo4j } = await import('neo4j-driver')
  const driver = neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? 'neo4j',
      process.env.NEO4J_PASS ?? 'argos_local',
    )
  )
  const s = driver.session()
  try {
    const r = await s.run(
      `MATCH (r:Reparticion)
       WHERE NOT EXISTS { (e:Estado)-[:CONTIENE]->(r) }
       OPTIONAL MATCH (e:Estado {id: r.jurisdiccion})
       WITH r, e WHERE e IS NOT NULL
       MERGE (e)-[c:CONTIENE]->(r)
       ON CREATE SET c.tipoRelacion = 'dependencia_directa', c.fuenteUrl = 'derivada_de_jurisdiccion_property'
       RETURN count(c) AS creadas`
    )
    const creadas = r.records[0]?.get('creadas') ?? 0
    const n = (typeof creadas === 'object' && creadas !== null && 'toNumber' in creadas)
      ? (creadas as { toNumber: () => number }).toNumber()
      : Number(creadas)
    console.log(`   ✓ ${n} aristas CONTIENE creadas para Reparticiones huérfanas`)
  } finally {
    await s.close()
    await driver.close()
  }
}

async function main() {
  console.log('=== ARGOS — Migración Neo4j: nodos :Estado raíz (W1) ===\n')
  await initGraph()

  if (!isGraphAvailable()) {
    console.error('✗ Neo4j no disponible. Iniciar el container y reintentar:')
    console.error('  docker start argos-neo4j')
    process.exit(1)
  }

  console.log('1) Creando nodos :Estado raíz...')
  for (const e of ESTADOS_RAIZ) {
    await upsertEstado(e)
    console.log(`   ✓ ${e.id} (${e.nombre})`)
  }

  console.log('\n2) Cargando entes_estatales_cordoba como :Reparticion + arista CONTIENE...')
  const entes = await readEntesEstatalesCordoba()

  let ents = 0
  for (const e of entes) {
    await upsertReparticion({
      id: e.id,
      nombre: e.nombre,
      jurisdiccion: e.jurisdiccion,
      tipo: e.tipo,
    })
    await upsertContieneReparticion({
      estadoId: e.jurisdiccion,
      reparticionId: e.id,
      tipoRelacion: e.poder === 'descentralizado' ? 'organo_descentralizado' : 'dependencia_directa',
      fuenteUrl: e.fuente_url,
    })
    ents++
  }
  console.log(`   ✓ ${ents} entes pivote conectados`)

  console.log('\n3) Conectando :Reparticion existentes (no en entes_estatales) con su Estado por jurisdicción...')
  await connectAllReparticionesToEstado()

  await closeGraph()
  console.log('\n✓ Migración Neo4j completada')
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
