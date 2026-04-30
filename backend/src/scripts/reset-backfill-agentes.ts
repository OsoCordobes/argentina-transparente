// reset-backfill-agentes.ts — Audit fix CRITICAL #2.
//
// El backfill anterior usaba IGJ URL como fuente_dni_url para DNIs
// inferidos por nombre. Eso era engañoso (Tier 1 falsificado). Reseteamos
// todos los UPDATEs hechos por el backfill heurístico para que el script
// nuevo (con filtro provincial) repueble desde cero.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

async function main() {
  await initDb()
  const before = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM agentes_publicos
      WHERE fuente_dni_url = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c'`,
  )
  console.log(`Filas con DNI heurístico falso (URL IGJ): ${before[0].n}`)

  await dbRun(`
    UPDATE agentes_publicos
       SET dni = NULL, fuente_dni_url = NULL, name_only_unmatched = FALSE
     WHERE fuente_dni_url = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c'
  `)

  const after = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM agentes_publicos WHERE dni IS NOT NULL`)
  console.log(`agentes_publicos con dni populado ahora: ${after[0].n}`)
  console.log('Reset completo. Re-correr backfill-agentes-via-pf.ts --apply para repopular con filtro provincial.')
}

main().catch(e => { console.error(e); process.exit(1) })
