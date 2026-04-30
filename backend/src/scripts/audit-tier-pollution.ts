// audit-tier-pollution.ts — Detecta y limpia test data filtrada en
// identity_matches productiva. Hallazgo: 43 Tier 4 con sufijo __TEST_F3_*.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

async function main() {
  await initDb()

  console.log('=== ARGOS — Audit identity_matches: test data pollution ===\n')

  // 1. Contar test pollution por tier
  const stats = await dbAll<any>(`
    SELECT tier,
           COUNT(*) AS total,
           SUM(CASE WHEN proveedor_norm LIKE '%__TEST_%' THEN 1 ELSE 0 END) AS test_count
      FROM identity_matches
     GROUP BY tier
     ORDER BY tier
  `)

  console.log('Pollution por tier:')
  for (const r of stats) {
    const tot = Number(r.total)
    const tc = Number(r.test_count)
    const pct = tot > 0 ? ((tc / tot) * 100).toFixed(1) : '0.0'
    console.log(`  Tier ${r.tier}: ${tot} totales, ${tc} con __TEST_ (${pct}%)`)
  }

  // 2. Buscar otros patrones de test pollution
  console.log('\n=== Otros patrones sospechosos ===')
  const otrosPatrones = await dbAll<any>(`
    SELECT COUNT(*) AS n FROM identity_matches
     WHERE proveedor_norm LIKE '%TEST%'
        OR proveedor_norm LIKE 'fixture%'
        OR proveedor_norm LIKE 'mock%'
        OR cuit_resuelto LIKE '991%'
        OR cuit_resuelto LIKE '999%'
        OR cuit_resuelto LIKE '111%'
  `)
  console.log(`  Filas con TEST/fixture/mock/CUIT 991-999-111: ${otrosPatrones[0].n}`)

  // 3. Buscar tablas relacionadas con polución similar
  console.log('\n=== Pollution en otras tablas ===')
  for (const tabla of ['contratos', 'empresas', 'igj_entidades', 'señales_cache']) {
    try {
      const cols = await dbAll<{ name: string }>(`PRAGMA table_info('${tabla}')`)
      const colsStr = cols.map(c => c.name).join(', ')
      // Buscar columna típica para nombre/proveedor
      const candCol = ['proveedor', 'proveedor_norm', 'razon_social', 'titulo'].find(c =>
        cols.some(x => x.name === c)
      )
      if (!candCol) {
        console.log(`  ${tabla}: sin columna nombre detectable (cols: ${colsStr.slice(0, 80)})`)
        continue
      }
      const r = await dbAll<{ n: number }>(
        `SELECT COUNT(*) AS n FROM "${tabla}" WHERE "${candCol}" LIKE '%__TEST_%' OR "${candCol}" LIKE '%TEST_F%'`
      )
      console.log(`  ${tabla}.${candCol}: ${r[0].n} filas test`)
    } catch (e) {
      console.log(`  ${tabla}: error - ${(e as Error).message.slice(0, 80)}`)
    }
  }

  // 4. Aplicar cleanup
  console.log('\n=== Cleanup ===')
  const before = (await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM identity_matches`))[0].n
  await dbRun(`
    DELETE FROM identity_matches
     WHERE proveedor_norm LIKE '%__TEST_%'
        OR proveedor_norm LIKE '%TEST_F%'
        OR cuit_resuelto = '99100000004'
  `)
  const after = (await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM identity_matches`))[0].n
  console.log(`  Eliminadas: ${Number(before) - Number(after)} filas (de ${before} a ${after})`)

  // 5. Distribución final post-cleanup
  console.log('\n=== Distribución final ===')
  const final = await dbAll<{ tier: number; n: number }>(
    `SELECT tier, COUNT(*) AS n FROM identity_matches GROUP BY tier ORDER BY tier`
  )
  for (const r of final) console.log(`  Tier ${r.tier}: ${r.n}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
