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

  // tmp_pf_norm: PF con su nombre normalizado + provincia inferida de las
  // empresas que dirige (vía v_persona_dirige_empresa). Si una PF dirige
  // empresas en varias provincias, marcamos múltiples filas para esa PF
  // (cada agente cordobés solo matchea PFs con al menos una empresa en
  // CORDOBA o sin provincia conocida).
  //
  // Audit fix critical #2: ANTES no había restricción geográfica → un
  // agente cordobés con nombre "JUAN PEREZ" podía recibir el DNI de un
  // JUAN PEREZ buenos-aires-resident contaminando v_persona_dirige_empresa.
  await dbRun(`
    CREATE OR REPLACE TEMPORARY TABLE tmp_pf_norm AS
    WITH provincias_de_pf AS (
      -- Provincias donde la PF dirige al menos una empresa
      SELECT DISTINCT pf.dni,
             UPPER(pj.dom_fiscal_provincia) AS provincia_pj
        FROM personas_fisicas pf
        JOIN v_persona_dirige_empresa v ON v.dni = pf.dni
        JOIN personas_juridicas pj ON pj.cuit = v.cuit
       WHERE pj.dom_fiscal_provincia IS NOT NULL
    )
    SELECT pf.dni,
           regexp_replace(strip_accents(UPPER(pf.apellido_nombre)), '[^A-Z\\s]', ' ', 'g') AS norm,
           COALESCE(pp.provincia_pj, '') AS provincia_pj
      FROM personas_fisicas pf
      LEFT JOIN provincias_de_pf pp ON pp.dni = pf.dni
  `)

  // Para cada agente sin dni: matchear con PF que dirija al menos una
  // empresa en su misma provincia O cuya provincia sea desconocida.
  // jurisdiccion del agente: 'cordoba-capital' / 'cordoba-provincia' →
  // mapeamos a provincia 'CORDOBA'.
  await dbRun(`
    CREATE OR REPLACE TEMPORARY TABLE tmp_agente_match AS
    WITH agentes_norm AS (
      SELECT a.id AS agente_id,
             a.jurisdiccion,
             CASE
               WHEN a.jurisdiccion LIKE 'cordoba%' THEN 'CORDOBA'
               WHEN a.jurisdiccion LIKE 'caba%'    THEN 'CIUDAD AUTONOMA DE BUENOS AIRES'
               WHEN a.jurisdiccion LIKE 'santa-fe%' THEN 'SANTA FE'
               ELSE NULL
             END AS provincia_agente,
             regexp_replace(strip_accents(UPPER(a.apellido_nombre)), '[^A-Z\\s]', ' ', 'g') AS norm
        FROM agentes_publicos a
       WHERE a.dni IS NULL
         AND a.apellido_nombre IS NOT NULL
         ${wherejur}
    ),
    candidates AS (
      SELECT an.agente_id, p.dni, p.provincia_pj
        FROM agentes_norm an
        JOIN tmp_pf_norm p ON p.norm = an.norm
        -- Sólo aceptamos PF cuya provincia coincide con la del agente
        -- O cuya provincia es desconocida (no descartamos por falta de data).
       WHERE an.provincia_agente IS NULL
          OR p.provincia_pj = ''
          OR p.provincia_pj = an.provincia_agente
    ),
    matches AS (
      SELECT agente_id,
             ANY_VALUE(dni)            AS dni_candidato,
             COUNT(DISTINCT dni)       AS cnt_dnis
        FROM candidates
       GROUP BY agente_id
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

  // UPDATE bulk.
  // Audit fix critical #2: la fuente NO es 'IGJ verificado' — es
  // 'backfill heurístico nombre+provincia'. La cita refleja el método
  // exacto para que un fiscal sepa que el DNI no fue confirmado contra
  // DDJJ post-OCR sino inferido por homonimia única. Eso lo deja en
  // Tier 2 (cap-60 en el detector C1, NO Tier 1 cap-95).
  await dbRun(`
    UPDATE agentes_publicos AS a
       SET dni = m.dni_candidato,
           fuente_dni_url = 'argos://backfill-heuristico/nombre+provincia/v1'
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
