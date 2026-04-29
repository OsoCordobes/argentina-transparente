// fix-pj-data-quality.ts — F8.5 Fix #1
//
// Hallazgo del audit-conexiones: 30+ PJ con razon_social="undefined" pasaron
// el filter de calidad embebido (cumple length>=4 + 3 letras). Estos vienen
// del parser de RNS/IGJ donde un campo opcional no parseado se serializó
// como string "undefined".
//
// Fix: borrar las filas con marcadores claros de basura. Idempotente.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

const TRASH_MARKERS = [
  'undefined', 'null', 'NaN', 'None', '(null)', '(undefined)',
  '...', '---', '???', 'N/A', 'NA', 'NaN NaN',
]

async function main() {
  await initDb()
  console.log('=== Fix PJ data quality — borrar marcadores de basura ===\n')

  const before = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_juridicas`)
  console.log(`PJ antes: ${before[0].n}`)

  // Conteo por marker
  for (const marker of TRASH_MARKERS) {
    const r = await dbAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM personas_juridicas
        WHERE LOWER(razon_social) = LOWER(?)
           OR LOWER(razon_social) LIKE LOWER(?) || ' %'
           OR LOWER(razon_social) LIKE '% ' || LOWER(?)`,
      [marker, marker, marker],
    )
    if (r[0].n > 0) console.log(`  "${marker}": ${r[0].n} filas`)
  }

  // Borrar
  const placeholders = TRASH_MARKERS.map(() => 'LOWER(?)').join(',')
  await dbRun(
    `DELETE FROM personas_juridicas
      WHERE LOWER(razon_social) IN (${placeholders})`,
    TRASH_MARKERS,
  )

  // Bonus: PJ con razon_social puramente numérica (otro tipo de basura)
  await dbRun(
    `DELETE FROM personas_juridicas
      WHERE razon_social ~ '^[0-9]+$'`,
  )

  const after = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_juridicas`)
  console.log(`\nPJ después: ${after[0].n} (borrados: ${before[0].n - after[0].n})`)

  // Mismo trato a PF
  console.log('\n=== Fix PF data quality ===')
  const pfBefore = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_fisicas`)
  console.log(`PF antes: ${pfBefore[0].n}`)
  await dbRun(
    `DELETE FROM personas_fisicas
      WHERE LOWER(apellido_nombre) IN (${placeholders})`,
    TRASH_MARKERS,
  )
  await dbRun(
    `DELETE FROM personas_fisicas
      WHERE apellido_nombre ~ '^[0-9]+$'`,
  )
  const pfAfter = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_fisicas`)
  console.log(`PF después: ${pfAfter[0].n} (borrados: ${pfBefore[0].n - pfAfter[0].n})`)
}

main().catch(e => { console.error(e); process.exit(1) })
