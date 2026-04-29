// backfill-agentes-via-pf.ts — F10 extension de A4
//
// El backfill original (backfill-agentes-dni.ts) cruza agentes_publicos
// con declaraciones_juradas.dni post-OCR. En la BD actual DDJJ.dni está
// NULL → 0 matches.
//
// Este script complementa: cruza agentes_publicos.apellido_nombre con
// personas_fisicas.apellido_nombre (que viene de IGJ + DDJJ + agentes
// post-A4). Reglas Tier 1 estrictas:
//   - Match Tier 1: una sola PF coincide → backfill DNI
//   - Match ambiguo (>1 PF): no se toca
//   - Sin match: no se toca
//
// Idempotente: solo opera donde dni IS NULL.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

interface Args { apply: boolean; jurisdiccion?: string }
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const j = a.indexOf('--jurisdiccion')
  return {
    apply: a.includes('--apply'),
    jurisdiccion: j >= 0 ? a[j + 1] : undefined,
  }
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS F10 — Backfill agentes_publicos.dni vía personas_fisicas ===\n')
  await initDb()

  const wherejur = args.jurisdiccion ? ` AND a.jurisdiccion = '${args.jurisdiccion.replace(/'/g, "''")}'` : ''

  // tmp_pf_norm: PF con su nombre normalizado para JOIN.
  await dbRun(`
    CREATE OR REPLACE TEMPORARY TABLE tmp_pf_norm AS
    SELECT dni,
           regexp_replace(strip_accents(UPPER(apellido_nombre)), '[^A-Z\\s]', ' ', 'g') AS norm
      FROM personas_fisicas
  `)

  // Para cada agente sin dni: contar cuántas PF coinciden por nombre
  // normalizado dentro de la misma jurisdicción. Si exactamente 1 → match.
  await dbRun(`
    CREATE OR REPLACE TEMPORARY TABLE tmp_agente_match AS
    WITH agentes_norm AS (
      SELECT a.id AS agente_id,
             a.jurisdiccion,
             regexp_replace(strip_accents(UPPER(a.apellido_nombre)), '[^A-Z\\s]', ' ', 'g') AS norm
        FROM agentes_publicos a
       WHERE a.dni IS NULL
         AND a.apellido_nombre IS NOT NULL
         ${wherejur}
    ),
    matches AS (
      SELECT an.agente_id,
             ANY_VALUE(p.dni)            AS dni_candidato,
             COUNT(DISTINCT p.dni)       AS cnt_dnis
        FROM agentes_norm an
        JOIN tmp_pf_norm p ON p.norm = an.norm
       GROUP BY an.agente_id
    )
    SELECT agente_id, dni_candidato
      FROM matches
     WHERE cnt_dnis = 1
  `)

  const totalNull = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM agentes_publicos WHERE dni IS NULL${
      args.jurisdiccion ? ` AND jurisdiccion = '${args.jurisdiccion.replace(/'/g, "''")}'` : ''
    }`,
  )
  const matched = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM tmp_agente_match`)
  console.log(`Total agentes con dni NULL: ${totalNull[0].n}`)
  console.log(`Match único PF (Tier 1):   ${matched[0].n}`)
  console.log(`Cobertura:                  ${totalNull[0].n > 0 ? ((Number(matched[0].n) / Number(totalNull[0].n)) * 100).toFixed(1) : '0.0'}%`)

  if (!args.apply) {
    console.log('\n[dry-run] Pasá --apply para aplicar.')
    await dbRun(`DROP TABLE IF EXISTS tmp_agente_match`)
    await dbRun(`DROP TABLE IF EXISTS tmp_pf_norm`)
    return
  }

  // UPDATE bulk
  await dbRun(`
    UPDATE agentes_publicos AS a
       SET dni = m.dni_candidato,
           fuente_dni_url = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c'
      FROM tmp_agente_match m
     WHERE a.id = m.agente_id
  `)
  await dbRun(`DROP TABLE IF EXISTS tmp_agente_match`)
  await dbRun(`DROP TABLE IF EXISTS tmp_pf_norm`)

  const final = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM agentes_publicos WHERE dni IS NOT NULL`)
  console.log(`\n✓ agentes_publicos con dni populado ahora: ${final[0].n}`)
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
