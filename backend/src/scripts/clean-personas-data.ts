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
  const args = process.argv.slice(2)
  const apply = args.includes('--apply')
  // Audit fix WARNING #1: este script casi borró 1.2M filas con regex
  // defectuosa una vez. Ahora exige una segunda flag explícita para
  // aplicar — eso garantiza que un --apply accidental siempre quede en
  // dry-run.
  const confirmed = args.includes('--i-understand-this-deletes-data')
  console.log('=== ARGOS R1.3 — Clean personas_data ===\n')
  if (apply && !confirmed) {
    console.error('⚠ --apply requiere también --i-understand-this-deletes-data')
    console.error('  (este script borra filas; sin la flag de confirmación queda en dry-run)')
    process.exit(2)
  }
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
    console.log('\n[dry-run] Pasá --apply --i-understand-this-deletes-data para borrar.')
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
