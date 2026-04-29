// populate-personas-fisicas.ts — F1.R1.1
//
// Proyecta el universo de DNIs únicos hacia la tabla canónica personas_fisicas.
// Fuentes en orden de preferencia (DDJJ > agentes > IGJ):
//   1. declaraciones_juradas.dni (post-OCR, Tier 1 — fuente externa con PDF)
//   2. agentes_publicos.dni (post-A4 backfill, Tier 1 — match único con DDJJ)
//   3. igj_autoridades.numero_documento (Tier 2 — directores societarios)
//
// Para cada DNI único:
//   - apellido_nombre: el mejor disponible (DDJJ > agentes > IGJ)
//   - cuit: si alguna fuente lo tiene y validarCUIT pasa
//   - fuentes_url: union de todas las URLs encontradas
//
// Usa upsertPersonaFisica que ya existe (PLAN-DATOS A1 review #2).
// Ejecuta en batches de 1000 para no agotar memoria con 200k+ DNIs.
//
// Uso:
//   npm run populate:pf                 # dry-run (cuenta candidatos)
//   npm run populate:pf -- --apply      # ejecuta upserts

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'
import { upsertPersonaFisica } from '../lib/personas-fisicas'
import { validarDNI, validarCUIT } from '../lib/identidad-validator'

interface Candidato {
  dni: string
  apellido_nombre: string
  cuit: string | null
  fuente_url: string
  source: 'ddjj' | 'agente' | 'igj'
  source_priority: number  // 1 = best
}

interface Args { apply: boolean; limit: number }
function parseArgs(): Args {
  const a = process.argv.slice(2)
  const li = a.indexOf('--limit')
  return {
    apply: a.includes('--apply'),
    limit: li >= 0 ? Number(a[li + 1]) || 0 : 0,
  }
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS R1.1 — Populate personas_fisicas ===\n')
  await initDb()

  // Limpiar testdata existente (cualquier fila marcada como test del MVP).
  // Identificamos los DNI sintéticos que veníamos usando.
  if (args.apply) {
    await dbRun(`DELETE FROM personas_fisicas WHERE dni IN ('12345678', '14289301', '11111111', '20123456')`)
  }

  // 1. DDJJ — fuente preferida (post-OCR con dni populado)
  const ddjj = await dbAll<Candidato>(`
    SELECT dni, apellido_nombre, cuit, fuente_url,
           'ddjj' AS source, 1 AS source_priority
      FROM declaraciones_juradas
     WHERE dni IS NOT NULL
       AND apellido_nombre IS NOT NULL
       AND LENGTH(dni) BETWEEN 6 AND 8
  `)
  console.log(`Candidatos DDJJ: ${ddjj.length}`)

  // 2. agentes_publicos con DNI (post-A4)
  const agentes = await dbAll<Candidato>(`
    SELECT dni, apellido_nombre, cuit, fuente_url,
           'agente' AS source, 2 AS source_priority
      FROM agentes_publicos
     WHERE dni IS NOT NULL
       AND apellido_nombre IS NOT NULL
       AND LENGTH(dni) BETWEEN 6 AND 8
  `)
  console.log(`Candidatos agentes_publicos: ${agentes.length}`)

  // 3. IGJ autoridades (sólo donde numero_documento parece DNI argentino).
  // Hay 2.3M autoridades; aplicamos LIMIT para no agotar memoria si --limit
  // se pasa. Sin limit, traemos todo (DuckDB lo maneja).
  const igjLimit = args.limit > 0 ? `LIMIT ${args.limit}` : ''
  const igj = await dbAll<Candidato>(`
    SELECT numero_documento AS dni,
           apellido_nombre,
           NULL AS cuit,
           'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c' AS fuente_url,
           'igj' AS source, 3 AS source_priority
      FROM igj_autoridades
     WHERE numero_documento IS NOT NULL
       AND apellido_nombre IS NOT NULL
       AND LENGTH(numero_documento) BETWEEN 6 AND 8
       AND numero_documento ~ '^[0-9]+$'
    ${igjLimit}
  `)
  console.log(`Candidatos IGJ autoridades: ${igj.length}`)

  // Dedup por DNI con preferencia source_priority ASC (1 mejor que 3)
  const porDni = new Map<string, {
    apellido_nombre: string
    cuit: string | null
    fuentes: Set<string>
    sources: Set<string>
    bestPrio: number
  }>()

  function pushCandidatos(arr: Candidato[]) {
    for (const c of arr) {
      const dniNorm = String(c.dni).replace(/\D/g, '')
      if (!validarDNI(dniNorm)) continue
      let entry = porDni.get(dniNorm)
      if (!entry) {
        entry = {
          apellido_nombre: c.apellido_nombre,
          cuit: c.cuit && validarCUIT(c.cuit) ? c.cuit : null,
          fuentes: new Set([c.fuente_url].filter(Boolean)),
          sources: new Set([c.source]),
          bestPrio: c.source_priority,
        }
        porDni.set(dniNorm, entry)
      } else {
        entry.fuentes.add(c.fuente_url)
        entry.sources.add(c.source)
        if (c.source_priority < entry.bestPrio) {
          entry.bestPrio = c.source_priority
          entry.apellido_nombre = c.apellido_nombre
        }
        // Acumular cuit si una fuente lo trajo válido y no había
        if (!entry.cuit && c.cuit && validarCUIT(c.cuit)) entry.cuit = c.cuit
      }
    }
  }
  pushCandidatos(ddjj)
  pushCandidatos(agentes)
  pushCandidatos(igj)
  console.log(`\nDNIs únicos válidos: ${porDni.size}`)

  // Breakdown por source-mix
  const mix = new Map<string, number>()
  for (const e of porDni.values()) {
    const k = [...e.sources].sort().join('+')
    mix.set(k, (mix.get(k) ?? 0) + 1)
  }
  console.log('Source mix:')
  for (const [k, n] of [...mix.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k.padEnd(20)} ${n}`)
  }

  if (!args.apply) {
    console.log('\n[dry-run] Pasá --apply para ejecutar el bulk insert.')
    return
  }

  // Bulk INSERT...SELECT en una sola operación.
  // Para 776k DNIs el patrón JS upsertPersonaFisica × N era inviable
  // (multi-hour). Hacemos la deduplicación + normalización en SQL puro
  // y delegamos a ON CONFLICT (dni) para idempotencia.
  //
  // Trade-off: no aplicamos validarCUIT en SQL (lo dejamos NULL si no
  // viene de DDJJ/agentes); el cuit se popula después por el resolver
  // o por seeds posteriores que sepan el género.
  console.log('\nEjecutando bulk INSERT...SELECT (DuckDB SQL)...')
  const start = Date.now()

  await dbRun(`
    CREATE OR REPLACE TEMPORARY TABLE tmp_pf_universe AS
    WITH unioned AS (
      -- DDJJ (priority 1)
      SELECT dni AS dni_raw,
             apellido_nombre,
             cuit,
             fuente_url,
             1 AS priority
        FROM declaraciones_juradas
       WHERE dni IS NOT NULL AND apellido_nombre IS NOT NULL
         AND LENGTH(dni) BETWEEN 6 AND 8
      UNION ALL
      -- agentes_publicos (priority 2)
      SELECT dni, apellido_nombre, cuit, fuente_url, 2
        FROM agentes_publicos
       WHERE dni IS NOT NULL AND apellido_nombre IS NOT NULL
         AND LENGTH(dni) BETWEEN 6 AND 8
      UNION ALL
      -- IGJ autoridades (priority 3)
      SELECT numero_documento,
             apellido_nombre,
             NULL,
             'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c',
             3
        FROM igj_autoridades
       WHERE numero_documento IS NOT NULL AND apellido_nombre IS NOT NULL
         AND LENGTH(numero_documento) BETWEEN 6 AND 8
         AND numero_documento ~ '^[0-9]+$'
    ),
    -- Filter only purely-numeric dni_raw and remove leading zeros
    cleaned AS (
      SELECT REGEXP_REPLACE(dni_raw, '^0+', '') AS dni_norm,
             apellido_nombre, cuit, fuente_url, priority
        FROM unioned
       WHERE dni_raw ~ '^[0-9]+$'
    )
    -- Dedup por dni_norm con preferencia priority ASC
    SELECT dni_norm AS dni,
           ARG_MIN(apellido_nombre, priority) AS apellido_nombre,
           regexp_replace(strip_accents(UPPER(ARG_MIN(apellido_nombre, priority))), '[^A-Z\\s]', ' ', 'g')
             AS apellido_nombre_norm,
           ANY_VALUE(cuit)                    AS cuit,
           TO_JSON(LIST_DISTINCT(LIST(fuente_url)))   AS fuentes_url_json
      FROM cleaned
     GROUP BY dni_norm
  `)
  const cnt = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM tmp_pf_universe`)
  console.log(`tmp_pf_universe: ${cnt[0]?.n ?? 0} filas`)

  // Bulk INSERT con ON CONFLICT
  await dbRun(`
    INSERT INTO personas_fisicas
      (dni, cuit, apellido_nombre, apellido_nombre_norm, fuentes_url_json,
       fuente_dni_url, primer_visto, ultimo_visto, t_efectivo, t_publicado,
       snapshot_id, superseded_by_id)
    SELECT
      dni,
      cuit,
      apellido_nombre,
      apellido_nombre_norm,
      fuentes_url_json,
      NULL,
      CAST(now() AS VARCHAR),
      CAST(now() AS VARCHAR),
      CAST(now() AS VARCHAR),
      CAST(now() AS VARCHAR),
      NULL,
      NULL
    FROM tmp_pf_universe
    ON CONFLICT (dni) DO UPDATE SET
      cuit                = COALESCE(personas_fisicas.cuit, EXCLUDED.cuit),
      apellido_nombre     = EXCLUDED.apellido_nombre,
      apellido_nombre_norm= EXCLUDED.apellido_nombre_norm,
      fuentes_url_json    = EXCLUDED.fuentes_url_json,
      ultimo_visto        = EXCLUDED.ultimo_visto,
      t_efectivo          = EXCLUDED.t_efectivo,
      t_publicado         = EXCLUDED.t_publicado
  `)

  await dbRun(`DROP TABLE IF EXISTS tmp_pf_universe`)

  const finalCnt = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_fisicas`)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n✓ Bulk insert completo en ${elapsed}s. Total personas_fisicas: ${finalCnt[0]?.n ?? 0}`)
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
