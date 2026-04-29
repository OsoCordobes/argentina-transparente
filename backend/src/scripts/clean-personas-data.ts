// clean-personas-data.ts — F1.R1.3
//
// Limpieza post-populate. IGJ trajo basura (labels '.', '-', caracteres de
// control, strings de 1-2 chars). Borramos lo que claramente no es un
// nombre real.
//
// Criterios de basura para PF:
//   - LENGTH(apellido_nombre) < 4
//   - apellido_nombre NO contiene letras (ej: '12345', '...')
//   - apellido_nombre tiene caracteres de control U+0000..U+001F
//
// Criterios para PJ:
//   - LENGTH(razon_social) < 4
//   - razon_social NO contiene letras
//
// Idempotente. Imprime el conteo antes/después.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

async function main() {
  const apply = process.argv.slice(2).includes('--apply')
  console.log('=== ARGOS R1.3 — Clean personas_data ===\n')
  await initDb()

  const before = await Promise.all([
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_fisicas`),
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_juridicas`),
  ])
  console.log(`Antes: PF=${before[0][0].n} PJ=${before[1][0].n}`)

  // Conteo de candidatos a basura
  const trashPF = await dbAll<{ n: number }>(`
    SELECT COUNT(*) AS n FROM personas_fisicas
     WHERE LENGTH(apellido_nombre) < 4
        OR apellido_nombre !~ '[A-Za-zÁÉÍÓÚáéíóúñÑ]'
        OR LENGTH(REGEXP_REPLACE(apellido_nombre, '[A-Za-zÁÉÍÓÚáéíóúñÑ]', '', 'g')) > LENGTH(apellido_nombre) - 2
  `)
  const trashPJ = await dbAll<{ n: number }>(`
    SELECT COUNT(*) AS n FROM personas_juridicas
     WHERE LENGTH(razon_social) < 4
        OR razon_social !~ '[A-Za-zÁÉÍÓÚáéíóúñÑ]'
  `)
  console.log(`Basura detectada: PF=${trashPF[0].n} PJ=${trashPJ[0].n}`)

  if (!apply) {
    console.log('\n[dry-run] Pasá --apply para borrar.')
    return
  }

  await dbRun(`
    DELETE FROM personas_fisicas
     WHERE LENGTH(apellido_nombre) < 4
        OR apellido_nombre !~ '[A-Za-zÁÉÍÓÚáéíóúñÑ]'
        OR LENGTH(REGEXP_REPLACE(apellido_nombre, '[A-Za-zÁÉÍÓÚáéíóúñÑ]', '', 'g')) > LENGTH(apellido_nombre) - 2
  `)
  await dbRun(`
    DELETE FROM personas_juridicas
     WHERE LENGTH(razon_social) < 4
        OR razon_social !~ '[A-Za-zÁÉÍÓÚáéíóúñÑ]'
  `)

  const after = await Promise.all([
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_fisicas`),
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_juridicas`),
  ])
  console.log(`\nDespués: PF=${after[0][0].n} PJ=${after[1][0].n}`)
  console.log(`Borrados: PF=${before[0][0].n - after[0][0].n} PJ=${before[1][0].n - after[1][0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
