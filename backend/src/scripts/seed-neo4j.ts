// seed-neo4j.ts — Carga el grafo de empresas y directores desde DuckDB → Neo4j
//
// Estrategia:
//   1. Lee los proveedores únicos de la tabla contratos
//   2. Descompone consorcios ("ROGGIO SA - RIVA U.T.") en empresas individuales
//   3. Busca cada fragmento en igj_entidades (LIKE fuzzy)
//   4. Carga cada empresa encontrada + sus directores en Neo4j
//   5. Vincula la empresa IGJ al nodo proveedor original del municipio
//
// Prerequisitos: npm run seed:cordoba && npm run seed:igj
// Ejecutar:      npm run seed:neo4j

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'
import { initGraph, isGraphAvailable } from '../lib/graph'
import neo4j from 'neo4j-driver'

const NEO4J_URI  = process.env.NEO4J_URI  ?? 'bolt://localhost:7687'
const NEO4J_USER = process.env.NEO4J_USER ?? 'neo4j'
const NEO4J_PASS = process.env.NEO4J_PASS ?? 'argos_local'

// Separadores típicos en consorcios argentinos
const SEPARATORS = / - | U\.? ?T\.?$| UTE$| CONSORCIO DE COOPERACI[OÓ]N$| Y OTROS$| Y ASOCIADOS$/i

function fragmentarNombre(nombre: string): string[] {
  // Split on common consortium separators
  const partes = nombre
    .replace(/ U\.? ?T\.?\s*$/i, '')
    .replace(/ UTE\s*$/i, '')
    .replace(/ CONSORCIO DE COOPERACI[OÓ]N\s*$/i, '')
    .replace(/ Y OTROS\s*$/i, '')
    .split(/ - | \/ /)
    .map(p => p.trim())
    .filter(p => p.length >= 3)

  return [...new Set(partes)]
}

function extractKeyword(fragment: string): string {
  // Take the most distinctive word (longest, skip legal suffixes)
  const SKIP = new Set(['SA', 'SRL', 'SAS', 'SACIFI', 'SAICICI', 'SACIICF', 'SCA', 'SCE',
    'DE', 'DEL', 'LA', 'LAS', 'LOS', 'EL', 'Y', 'E', 'EN', 'CON'])
  const words = fragment
    .replace(/[.]/g, '')
    .split(/\s+/)
    .map(w => w.toUpperCase())
    .filter(w => w.length >= 4 && !SKIP.has(w))
  if (words.length === 0) return fragment.slice(0, 10).toUpperCase()
  // Prefer longer words (more distinctive)
  return words.sort((a, b) => b.length - a.length)[0]
}

interface IGJEmpresa {
  cuit: string
  razon_social: string
  numero_correlativo: number
}

interface IGJDirector {
  apellido_nombre: string
  tipo_administrador: string
  numero_documento: string
}

async function buscarEnIGJ(keyword: string): Promise<IGJEmpresa[]> {
  return dbAll<IGJEmpresa>(`
    SELECT cuit, razon_social, numero_correlativo
    FROM igj_entidades
    WHERE UPPER(razon_social) LIKE ?
      AND cuit IS NOT NULL AND TRIM(cuit) != ''
    LIMIT 5
  `, [`%${keyword}%`])
}

async function getDirectoresIGJ(numerosCorrelativos: number[]): Promise<IGJDirector[]> {
  if (numerosCorrelativos.length === 0) return []
  const placeholders = numerosCorrelativos.map(() => '?').join(', ')
  return dbAll<IGJDirector>(`
    SELECT apellido_nombre, tipo_administrador, numero_documento
    FROM igj_autoridades
    WHERE numero_correlativo IN (${placeholders})
      AND apellido_nombre IS NOT NULL AND TRIM(apellido_nombre) != ''
  `, numerosCorrelativos)
}

async function main() {
  console.log('=== ARGOS — Seed Neo4j desde IGJ ===\n')

  await initDb()
  await initGraph()

  if (!isGraphAvailable()) {
    console.error('Neo4j no está disponible. Verificar que argos-neo4j está corriendo:')
    console.error('  docker start argos-neo4j')
    process.exit(1)
  }

  const driver = neo4j.driver(NEO4J_URI, neo4j.auth.basic(NEO4J_USER, NEO4J_PASS))

  // Limpiar grafo anterior
  const force = process.argv.includes('--force')
  if (force) {
    console.log('Limpiando grafo existente (--force)...')
    const s = driver.session()
    await s.run('MATCH (n) DETACH DELETE n')
    await s.close()
    console.log('Grafo limpiado.\n')
  }

  // ─── 1. Obtener proveedores únicos ────────────────────────────────────────
  const proveedores = await dbAll<{ proveedor_norm: string; monto_total: number; municipio: string }>(`
    SELECT proveedor_norm, SUM(monto) as monto_total, municipio
    FROM contratos
    GROUP BY proveedor_norm, municipio
    ORDER BY monto_total DESC
  `)
  console.log(`${proveedores.length} proveedores únicos en contratos\n`)

  // ─── 2. Crear nodos Proveedor en Neo4j ────────────────────────────────────
  console.log('Creando nodos Proveedor...')
  for (const prov of proveedores) {
    const s = driver.session()
    await s.run(
      `MERGE (p:Proveedor {nombre: $nombre, municipio: $municipio})
       SET p.montoTotal = $monto`,
      { nombre: prov.proveedor_norm, municipio: prov.municipio, monto: prov.monto_total }
    )
    await s.close()
  }
  console.log(`✓ ${proveedores.length} nodos Proveedor creados\n`)

  // ─── 3. Buscar cada proveedor (y sus fragmentos) en IGJ ───────────────────
  let empresasEncontradas = 0
  let directoresCreados = 0
  let vinculosCreados = 0

  const cuitsProcesados = new Set<string>()

  console.log('Buscando en IGJ y cargando directores...\n')

  for (const prov of proveedores) {
    const fragmentos = fragmentarNombre(prov.proveedor_norm)

    for (const fragmento of fragmentos) {
      const keyword = extractKeyword(fragmento)
      if (keyword.length < 4) continue

      const matches = await buscarEnIGJ(keyword)
      if (matches.length === 0) continue

      for (const empresa of matches) {
        if (cuitsProcesados.has(empresa.cuit)) {
          // Ya procesada — solo crear el vínculo Proveedor → Empresa
          const s = driver.session()
          await s.run(
            `MATCH (p:Proveedor {nombre: $provNombre, municipio: $municipio})
             MATCH (e:Empresa {cuit: $cuit})
             MERGE (p)-[:INCLUYE_EMPRESA]->(e)`,
            { provNombre: prov.proveedor_norm, municipio: prov.municipio, cuit: empresa.cuit }
          )
          await s.close()
          vinculosCreados++
          continue
        }
        cuitsProcesados.add(empresa.cuit)

        // Obtener directores desde IGJ
        const directores = await getDirectoresIGJ([empresa.numero_correlativo])

        // Crear nodo Empresa
        const se = driver.session()
        await se.run(
          `MERGE (e:Empresa {cuit: $cuit})
           SET e.nombre = $nombre, e.fuente = 'IGJ'`,
          { cuit: empresa.cuit, nombre: empresa.razon_social }
        )
        await se.close()
        empresasEncontradas++

        // Vincular Proveedor → Empresa
        const sv = driver.session()
        await sv.run(
          `MATCH (p:Proveedor {nombre: $provNombre, municipio: $municipio})
           MATCH (e:Empresa {cuit: $cuit})
           MERGE (p)-[:INCLUYE_EMPRESA]->(e)`,
          { provNombre: prov.proveedor_norm, municipio: prov.municipio, cuit: empresa.cuit }
        )
        await sv.close()
        vinculosCreados++

        // Crear directores y relaciones
        for (const dir of directores) {
          const nombre = dir.apellido_nombre.trim().toUpperCase()
          if (!nombre) continue
          const sd = driver.session()
          await sd.run(
            `MERGE (d:Director {nombre: $nombre})
             SET d.documento = $doc, d.rol = $rol
             WITH d
             MATCH (e:Empresa {cuit: $cuit})
             MERGE (e)-[:TIENE_DIRECTOR]->(d)`,
            { nombre, doc: dir.numero_documento ?? '', rol: dir.tipo_administrador ?? '', cuit: empresa.cuit }
          )
          await sd.close()
          directoresCreados++
        }

        if (directores.length > 0) {
          console.log(`  ✓ ${empresa.razon_social} (${empresa.cuit}): ${directores.length} directores`)
        }
      }
    }
  }

  // ─── 4. Resumen ──────────────────────────────────────────────────────────
  const s = driver.session()
  const counts = await s.run(`
    MATCH (n) RETURN labels(n)[0] AS tipo, count(*) AS cnt ORDER BY cnt DESC
  `)
  await s.close()
  await driver.close()

  console.log('\n=== Grafo Neo4j — estado final ===')
  counts.records.forEach(r => {
    console.log(`  ${r.get('cnt').toNumber()} nodos :${r.get('tipo')}`)
  })
  console.log(`\n  Empresas IGJ encontradas: ${empresasEncontradas}`)
  console.log(`  Directores cargados:      ${directoresCreados}`)
  console.log(`  Vínculos Proveedor→Emp:   ${vinculosCreados}`)
  console.log('\n✓ Seed Neo4j completado.')
  console.log('  Ver grafo en: http://localhost:7474')
  console.log('  Query de inicio:')
  console.log('    MATCH p=(prov:Proveedor)-[:INCLUYE_EMPRESA]->(e:Empresa)-[:TIENE_DIRECTOR]->(d:Director)')
  console.log('    RETURN p LIMIT 100')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
