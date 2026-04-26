// seed-neo4j-actores.ts — Vuelca el universo cordobés de DuckDB a Neo4j
// como un grafo navegable de actores: PersonaFisica, Funcionario, Empresa,
// Reparticion, Contrato, con todas sus aristas.
//
// Uso UNWIND batch para que el seed termine en minutos, no horas.
//
// Uso:
//   npm run seed:neo4j-actores
//   npm run seed:neo4j-actores -- --reset             # borra el grafo y reconstruye
//   npm run seed:neo4j-actores -- --limit-personas 100000

import 'dotenv/config'
import crypto from 'crypto'
import { initDb, dbAll } from '../lib/db'
import { initGraph, isGraphAvailable, marcarConflictosFuncionarioProveedor, closeGraph, normalizarNombrePersona } from '../lib/graph'
import neo4j, { Driver, Session } from 'neo4j-driver'

const NEO4J_URI = process.env.NEO4J_URI ?? 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j'
const NEO4J_PASS = process.env.NEO4J_PASS ?? 'argos_local'

const BATCH = 1000

interface Args {
  reset: boolean
  limitPersonas: number | null
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const args: Args = { reset: false, limitPersonas: null }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--reset') args.reset = true
    else if (a[i] === '--limit-personas') args.limitPersonas = parseInt(a[++i])
  }
  return args
}

function reparticionId(jurisdiccion: string, nombre: string): string {
  const slug = nombre.toUpperCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Z0-9]/g, '_').replace(/_+/g, '_').slice(0, 80)
  return `${jurisdiccion}:${slug}`
}

function funcionarioIdFor(j: string, nombre: string, cargo: string | null, reparticion: string | null, anio: number): string {
  return crypto.createHash('sha256').update([j, nombre, cargo ?? '', reparticion ?? '', anio].join('|')).digest('hex').slice(0, 24)
}

async function batched<T>(arr: T[], size: number, fn: (chunk: T[]) => Promise<void>, label?: string): Promise<void> {
  let processed = 0
  for (let i = 0; i < arr.length; i += size) {
    await fn(arr.slice(i, i + size))
    processed += Math.min(size, arr.length - i)
    if (label) process.stdout.write(`\r    ${label}: ${processed.toLocaleString()}/${arr.length.toLocaleString()}…`)
  }
  if (label) process.stdout.write('\n')
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS — Seed Neo4j Actores (mapa-neural cordobés) ===\n')

  await initDb()
  await initGraph()
  if (!isGraphAvailable()) {
    console.error('Neo4j no disponible. docker compose -f docker-compose.neo4j.yml up -d')
    process.exit(1)
  }

  const drv: Driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS), {
    connectionAcquisitionTimeout: 5000,
    maxConnectionPoolSize: 10,
  })
  const session: Session = drv.session()

  try {
    if (args.reset) {
      console.log('--reset: borrando grafo entero...')
      await session.run('MATCH (n) DETACH DELETE n')
    }

    // ─── 1. Empresas con CUIT ──────────────────────────────────────────────
    console.log('[1/7] Cargando empresas con CUIT (DuckDB → Neo4j)...')
    const empresasDb = await dbAll<{
      cuit: string; nombre: string; es_empleador: boolean | null;
      inicio_actividades: string | null; estado: string | null;
    }>(`SELECT cuit, nombre, es_empleador, inicio_actividades, estado FROM empresas WHERE cuit IS NOT NULL`)
    await batched(empresasDb, BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (e:Empresa {cuit: row.cuit})
         SET e.nombre = row.nombre,
             e.esEmpleador = row.esEmpleador,
             e.municipio = 'cordoba-capital',
             e.inicioActividades = row.inicio_actividades,
             e.estado = row.estado`,
        { rows: chunk.map(e => ({ cuit: e.cuit, nombre: e.nombre, esEmpleador: !!e.es_empleador, inicio_actividades: e.inicio_actividades, estado: e.estado })) }
      )
    }, 'empresas')

    // ─── 1b. Empresas RNS (provincia=Córdoba) ──────────────────────────────
    console.log('[1b/7] Empresas RNS Córdoba...')
    const rnsRows = await dbAll<{
      cuit: string; razon_social: string; tipo_societario: string | null;
      fecha_contrato_social: string | null;
    }>(
      `SELECT DISTINCT cuit, razon_social, tipo_societario, fecha_contrato_social
       FROM rns_personas_juridicas
       WHERE cuit IS NOT NULL
         AND (UPPER(dom_legal_provincia) LIKE '%CORDOBA%' OR UPPER(dom_fiscal_provincia) LIKE '%CORDOBA%')`
    )
    await batched(rnsRows, BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (e:Empresa {cuit: row.cuit})
         ON CREATE SET e.nombre = row.razon_social,
                       e.tipoSocietario = row.tipo_societario,
                       e.inicioActividades = row.fecha_contrato_social,
                       e.municipio = 'cordoba-capital',
                       e.estado = 'activa',
                       e.esEmpleador = false
         ON MATCH SET e.tipoSocietario = coalesce(e.tipoSocietario, row.tipo_societario)`,
        { rows: chunk }
      )
    }, 'rns')

    // ─── 2. PersonaFisica desde igj_autoridades (todas con DNI) ───────────
    console.log('[2/7] Cargando personas físicas (autoridades IGJ con DNI)...')
    const personasLimit = args.limitPersonas ?? 800_000
    const personasRows = await dbAll<{
      numero_documento: string; apellido_nombre: string;
    }>(
      `SELECT numero_documento, ANY_VALUE(apellido_nombre) AS apellido_nombre
       FROM igj_autoridades
       WHERE numero_documento IS NOT NULL
         AND numero_documento != ''
         AND apellido_nombre IS NOT NULL
         AND length(numero_documento) BETWEEN 6 AND 12
       GROUP BY numero_documento
       LIMIT ${personasLimit}`
    )
    await batched(personasRows, BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (p:PersonaFisica {dni: row.dni})
         SET p.nombre = row.nombre, p.nombreNorm = row.nombreNorm`,
        { rows: chunk.map(r => ({ dni: r.numero_documento, nombre: r.apellido_nombre, nombreNorm: normalizarNombrePersona(r.apellido_nombre) })) }
      )
    }, 'personas')

    // ─── 3. DIRIGE: PersonaFisica → Empresa ────────────────────────────────
    console.log('[3/7] Aristas DIRIGE (autoridades de empresas conocidas)...')
    const cuitsConocidos = await session.run('MATCH (e:Empresa) RETURN e.cuit AS cuit')
    const cuitSet = new Set(cuitsConocidos.records.map(r => r.get('cuit') as string))
    console.log(`    ${cuitSet.size.toLocaleString()} empresas en grafo`)

    // Traer aristas IGJ filtradas a empresas conocidas. En chunks de CUITs.
    const cuitArr = [...cuitSet]
    let aristasDirige = 0
    for (let i = 0; i < cuitArr.length; i += 500) {
      const chunkCuits = cuitArr.slice(i, i + 500)
      const aristas = await dbAll<{
        cuit: string; numero_documento: string; tipo_administrador: string;
      }>(
        `SELECT ie.cuit, a.numero_documento, ANY_VALUE(a.tipo_administrador) AS tipo_administrador
         FROM igj_entidades ie
         JOIN igj_autoridades a ON a.numero_correlativo = ie.numero_correlativo
         WHERE ie.cuit IN (${chunkCuits.map(() => '?').join(',')})
           AND a.numero_documento IS NOT NULL
           AND a.numero_documento != ''
           AND length(a.numero_documento) BETWEEN 6 AND 12
         GROUP BY ie.cuit, a.numero_documento`,
        chunkCuits
      )
      if (aristas.length > 0) {
        await batched(aristas, BATCH, async chunk => {
          await session.run(
            `UNWIND $rows AS row
             MATCH (p:PersonaFisica {dni: row.dni})
             MATCH (e:Empresa {cuit: row.cuit})
             MERGE (p)-[d:DIRIGE]->(e)
             SET d.tipo = row.tipo`,
            { rows: chunk.map(r => ({ dni: r.numero_documento, cuit: r.cuit, tipo: r.tipo_administrador ?? 'A' })) }
          )
        })
        aristasDirige += aristas.length
      }
      process.stdout.write(`\r    DIRIGE: ${aristasDirige.toLocaleString()} aristas / cuits procesados ${Math.min(i + 500, cuitArr.length)}/${cuitArr.length}…`)
    }
    process.stdout.write('\n')

    // ─── 4. Contratos cordobeses + Reparticion + OPERA_EN ─────────────────
    console.log('[4/7] Contratos cordobeses → Reparticion / OPERA_EN / GANO...')
    const contratosDb = await dbAll<{
      hash: string; municipio: string; anio: number; tipo: string;
      proveedor: string; proveedor_norm: string; area: string;
      monto: number; cuit_resuelto: string | null;
    }>(
      `SELECT c.hash, c.municipio, c.anio, c.tipo, c.proveedor, c.proveedor_norm,
              c.area, c.monto, im.cuit_resuelto
       FROM contratos c
       LEFT JOIN identity_matches im ON im.proveedor_norm = c.proveedor_norm
       WHERE c.municipio = 'cordoba-capital'`
    )

    const reparticionesUnicas = new Map<string, { id: string; nombre: string; jurisdiccion: string }>()
    const empresasNombreToCuit = new Map<string, string>()
    for (const e of empresasDb) empresasNombreToCuit.set(e.nombre.toUpperCase(), e.cuit)

    const contratosEnriched: Array<{
      hash: string; cuit: string | null; tipo: string; anio: number; area: string;
      monto: number; municipio: string; reparticionId: string;
    }> = []

    for (const c of contratosDb) {
      const repName = c.area || 'SIN_AREA'
      const repId = reparticionId('cordoba-capital', repName)
      reparticionesUnicas.set(repId, { id: repId, nombre: repName, jurisdiccion: 'cordoba-capital' })
      const cuit = c.cuit_resuelto ?? empresasNombreToCuit.get(c.proveedor.toUpperCase()) ?? null
      contratosEnriched.push({
        hash: c.hash, cuit, tipo: c.tipo, anio: c.anio, area: c.area,
        monto: c.monto, municipio: c.municipio, reparticionId: repId,
      })
    }

    // Reparticiones first
    await batched([...reparticionesUnicas.values()], BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (r:Reparticion {id: row.id})
         SET r.nombre = row.nombre, r.jurisdiccion = row.jurisdiccion`,
        { rows: chunk }
      )
    }, 'reparticiones')

    // Contratos + GANO
    await batched(contratosEnriched.filter(c => c.cuit), BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (c:Contrato {id: row.hash})
         SET c.monto = row.monto, c.tipo = row.tipo, c.anio = row.anio,
             c.area = row.area, c.municipio = row.municipio
         WITH c, row
         MATCH (e:Empresa {cuit: row.cuit})
         MERGE (e)-[:GANÓ]->(c)`,
        { rows: chunk }
      )
    }, 'contratos GANO')

    // OPERA_EN agregada (suma monto y count)
    const operaEnAgg = new Map<string, { cuit: string; reparticionId: string; monto: number; contratos: number }>()
    for (const c of contratosEnriched) {
      if (!c.cuit) continue
      const k = `${c.cuit}|${c.reparticionId}`
      const cur = operaEnAgg.get(k) ?? { cuit: c.cuit, reparticionId: c.reparticionId, monto: 0, contratos: 0 }
      cur.monto += c.monto
      cur.contratos += 1
      operaEnAgg.set(k, cur)
    }
    await batched([...operaEnAgg.values()], BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MATCH (e:Empresa {cuit: row.cuit})
         MATCH (r:Reparticion {id: row.reparticionId})
         MERGE (e)-[op:OPERA_EN]->(r)
         SET op.monto = row.monto, op.contratos = row.contratos`,
        { rows: chunk }
      )
    }, 'OPERA_EN')

    // EMITE
    await batched(contratosEnriched.filter(c => c.cuit), BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MATCH (c:Contrato {id: row.hash})
         MATCH (r:Reparticion {id: row.reparticionId})
         MERGE (r)-[:EMITE]->(c)`,
        { rows: chunk }
      )
    }, 'EMITE')

    // ─── 5. Funcionarios cordobeses (todos los cargos formales) ───────────
    console.log('[5/7] Funcionarios cordobeses (cargos formales)...')
    const funcionariosDb = await dbAll<{
      apellido_nombre: string; jurisdiccion: string; reparticion: string | null;
      cargo: string | null; anio: number; bruto: number | null; cuit: string | null;
    }>(
      `SELECT apellido_nombre, jurisdiccion, reparticion, cargo,
              MAX(anio) AS anio,
              MAX(bruto) AS bruto,
              ANY_VALUE(cuit) AS cuit
       FROM agentes_publicos
       WHERE jurisdiccion IN ('cordoba-capital', 'cordoba-provincia')
         AND apellido_nombre IS NOT NULL
       GROUP BY apellido_nombre, jurisdiccion, reparticion, cargo`
    )
    console.log(`    ${funcionariosDb.length.toLocaleString()} cargos únicos`)

    // Crear todas las reparticiones nuevas
    const repNuevas = new Map<string, { id: string; nombre: string; jurisdiccion: string }>()
    for (const f of funcionariosDb) {
      if (!f.reparticion) continue
      const id = reparticionId(f.jurisdiccion, f.reparticion)
      if (!reparticionesUnicas.has(id)) {
        repNuevas.set(id, { id, nombre: f.reparticion, jurisdiccion: f.jurisdiccion })
      }
    }
    await batched([...repNuevas.values()], BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (r:Reparticion {id: row.id})
         SET r.nombre = row.nombre, r.jurisdiccion = row.jurisdiccion`,
        { rows: chunk }
      )
    }, 'reparticiones nuevas')

    // Funcionarios + TRABAJA_EN
    const funcEnriched = funcionariosDb.map(f => ({
      id: funcionarioIdFor(f.jurisdiccion, f.apellido_nombre, f.cargo, f.reparticion, f.anio),
      nombre: f.apellido_nombre,
      nombreNorm: normalizarNombrePersona(f.apellido_nombre),
      jurisdiccion: f.jurisdiccion,
      cargo: f.cargo,
      anio: f.anio,
      bruto: f.bruto,
      cuit: f.cuit,
      reparticionId: f.reparticion ? reparticionId(f.jurisdiccion, f.reparticion) : null,
    }))
    await batched(funcEnriched, BATCH, async chunk => {
      await session.run(
        `UNWIND $rows AS row
         MERGE (f:Funcionario {id: row.id})
         SET f.nombre = row.nombre,
             f.nombreNorm = row.nombreNorm,
             f.jurisdiccion = row.jurisdiccion,
             f.cargo = row.cargo,
             f.anio = row.anio,
             f.bruto = row.bruto,
             f.cuit = row.cuit
         WITH f, row
         OPTIONAL MATCH (r:Reparticion {id: row.reparticionId})
         FOREACH (rep IN CASE WHEN r IS NULL THEN [] ELSE [r] END | MERGE (f)-[:TRABAJA_EN]->(rep))`,
        { rows: chunk }
      )
    }, 'funcionarios')

    // ─── 6. ES_LA_MISMA_PERSONA (Tier 2 batch) ──────────────────────────
    console.log('[6/7] Linkeando Funcionario↔PersonaFisica por nombre normalizado (Tier 2)...')
    const linkResult = await session.run(
      `MATCH (f:Funcionario), (p:PersonaFisica)
       WHERE f.nombreNorm = p.nombreNorm
         AND NOT (f)-[:ES_LA_MISMA_PERSONA]->(p)
       MERGE (f)-[link:ES_LA_MISMA_PERSONA]->(p)
       ON CREATE SET link.tier = 2, link.metodo = 'nombre_norm'
       RETURN count(link) AS linked`
    )
    const linkedV = linkResult.records[0]?.get('linked')
    const linkedNum = (linkedV && typeof (linkedV as { toNumber?: () => number }).toNumber === 'function')
      ? (linkedV as { toNumber: () => number }).toNumber()
      : Number(linkedV ?? 0)
    console.log(`    ${linkedNum.toLocaleString()} aristas Tier 2 creadas`)

    // ─── 7. Marcar conflictos ──────────────────────────────────────────────
    console.log('[7/7] Marcando aristas CONFLICTO_CON...')
    const conflictos = await marcarConflictosFuncionarioProveedor()
    console.log(`    ${conflictos.length} conflictos detectados`)
    if (conflictos.length > 0) {
      console.log('\n    Top 10 conflictos:')
      for (const c of conflictos.slice(0, 10)) {
        console.log(`      ${c.funcionarioNombre} (${c.reparticionNombre ?? '—'}) ↔ ${c.empresaNombre} [${c.via}]`)
      }
    }

    // Stats finales
    const stats = await session.run(
      `MATCH (n)
       RETURN labels(n)[0] AS label, count(n) AS cnt
       ORDER BY cnt DESC`
    )
    console.log('\n=== Grafo final ===')
    for (const r of stats.records) {
      const cnt = r.get('cnt')
      const cntNum = (cnt && typeof cnt.toNumber === 'function') ? cnt.toNumber() : Number(cnt)
      console.log(`  ${(r.get('label') as string).padEnd(15)} ${cntNum.toLocaleString().padStart(10)}`)
    }
    const edgeStats = await session.run(
      `MATCH ()-[r]->() RETURN type(r) AS rel, count(r) AS cnt ORDER BY cnt DESC`
    )
    console.log('\n=== Aristas ===')
    for (const r of edgeStats.records) {
      const cnt = r.get('cnt')
      const cntNum = (cnt && typeof cnt.toNumber === 'function') ? cnt.toNumber() : Number(cnt)
      console.log(`  ${(r.get('rel') as string).padEnd(20)} ${cntNum.toLocaleString().padStart(10)}`)
    }
  } finally {
    await session.close()
    await drv.close()
    await closeGraph()
  }

  console.log('\n✓ Seed Neo4j actores completo.')
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
