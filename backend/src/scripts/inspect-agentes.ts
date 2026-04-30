import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

async function main() {
  await initDb()
  const split = await dbAll<{j:string,c:bigint}>(
    `SELECT jurisdiccion AS j, COUNT(*)::BIGINT AS c FROM agentes_publicos GROUP BY jurisdiccion ORDER BY c DESC`
  )
  console.log('=== agentes_publicos por jurisdicción ===')
  for (const row of split) console.log(`  ${row.j.padEnd(25)} ${Number(row.c).toLocaleString().padStart(10)}`)

  const conCuit = await dbAll<{c:bigint}>(
    `SELECT COUNT(*)::BIGINT AS c FROM agentes_publicos WHERE cuit IS NOT NULL AND cuit != ''`
  )
  console.log(`\nCon CUIT: ${Number(conCuit[0].c).toLocaleString()}`)

  const conApellido = await dbAll<{c:bigint}>(
    `SELECT COUNT(DISTINCT apellido_nombre)::BIGINT AS c FROM agentes_publicos WHERE apellido_nombre IS NOT NULL`
  )
  console.log(`Apellidos únicos: ${Number(conApellido[0].c).toLocaleString()}`)

  // Sample CUIT non-null
  const sample = await dbAll<{j:string,c:string|null,cargo:string|null,a:number}>(
    `SELECT jurisdiccion AS j, cuit AS c, cargo, anio AS a FROM agentes_publicos WHERE cuit IS NOT NULL AND cuit != '' LIMIT 10`
  )
  if (sample.length > 0) {
    console.log('\nSample con CUIT:')
    for (const s of sample) console.log(`  ${s.j} ${s.c} ${(s.cargo ?? '?').slice(0,30)} ${s.a}`)
  } else {
    console.log('\nNINGUN registro con CUIT.')
  }

  // Top apellidos en agentes (por cantidad)
  const top = await dbAll<{n:string,c:bigint}>(
    `SELECT apellido_nombre AS n, COUNT(*)::BIGINT AS c FROM agentes_publicos
     WHERE jurisdiccion IN ('cordoba-capital', 'cordoba-provincia')
       AND apellido_nombre IS NOT NULL
     GROUP BY apellido_nombre ORDER BY c DESC LIMIT 10`
  )
  console.log('\nTop apellidos cordobeses:')
  for (const r of top) console.log(`  ${r.n.padEnd(40)} ${Number(r.c).toString().padStart(4)}`)

  process.exit(0)
}
main().catch(e=>{console.error(e);process.exit(1)})
