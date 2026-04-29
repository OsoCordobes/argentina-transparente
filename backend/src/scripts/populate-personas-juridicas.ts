// populate-personas-juridicas.ts — F1.R1.2
//
// Proyecta el universo de CUITs de PJ hacia personas_juridicas.
// Fuentes en orden de preferencia:
//   1. rns_personas_juridicas (priority 1) — RNS oficial con dom_fiscal
//   2. igj_entidades (priority 2) — IGJ nacional con tipo_societario
//   3. empresas legacy (priority 3) — derivadas de contratos
//   4. empresas_padron_provincial (priority 4) — proveedores Córdoba
//
// Para cada CUIT único:
//   - razon_social: el mejor disponible (RNS > IGJ > empresas)
//   - tipo_societario, dom_fiscal_*, fecha_constitucion: de RNS si está
//   - estado, es_empleador, actividad_principal: de empresas legacy si está
//   - alias: razones sociales alternativas
//   - fuentes_url: union
//
// Bulk SQL — el patrón JS upsertPersonaJuridica × N era inviable para
// >200k empresas.
//
// Uso:
//   npm run populate:pj                 # dry-run (cuenta candidatos)
//   npm run populate:pj -- --apply      # ejecuta bulk insert

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

interface Args { apply: boolean }
function parseArgs(): Args {
  return { apply: process.argv.slice(2).includes('--apply') }
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS R1.2 — Populate personas_juridicas ===\n')
  await initDb()

  // Conteos por fuente
  const counts = await Promise.all([
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM rns_personas_juridicas WHERE cuit IS NOT NULL AND LENGTH(REGEXP_REPLACE(cuit, '\\D', '', 'g')) = 11`),
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM igj_entidades WHERE cuit IS NOT NULL AND LENGTH(REGEXP_REPLACE(cuit, '\\D', '', 'g')) = 11`),
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM empresas WHERE cuit IS NOT NULL AND LENGTH(REGEXP_REPLACE(cuit, '\\D', '', 'g')) = 11`),
    dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM empresas_padron_provincial WHERE cuit IS NOT NULL AND LENGTH(REGEXP_REPLACE(cuit, '\\D', '', 'g')) = 11`),
  ])
  console.log(`RNS:                  ${counts[0][0]?.n ?? 0}`)
  console.log(`IGJ entidades:        ${counts[1][0]?.n ?? 0}`)
  console.log(`empresas legacy:      ${counts[2][0]?.n ?? 0}`)
  console.log(`empresas padrón prov: ${counts[3][0]?.n ?? 0}`)

  if (!args.apply) {
    console.log('\n[dry-run] Pasá --apply para ejecutar el bulk insert.')
    return
  }

  console.log('\nConstruyendo tmp_pj_universe...')
  const start = Date.now()

  // El normalizador de CUIT es: quitar no-dígitos, validar 11 dígitos,
  // formatear como XX-DDDDDDDD-V. El prefijo PJ es 30/33/34. Filtramos en
  // la WHERE clause para descartar PFs que se cuelan en empresas legacy.
  await dbRun(`
    CREATE OR REPLACE TEMPORARY TABLE tmp_pj_universe AS
    WITH unioned AS (
      SELECT cuit AS cuit_raw,
             razon_social,
             tipo_societario,
             fecha_contrato_social AS fecha_constitucion,
             dom_fiscal_provincia,
             dom_fiscal_localidad,
             dom_legal_provincia,
             dom_legal_localidad,
             NULL AS estado,
             NULL::BOOLEAN AS es_empleador,
             NULL AS actividad_principal,
             fuente_url,
             1 AS priority
        FROM rns_personas_juridicas
       WHERE cuit IS NOT NULL AND razon_social IS NOT NULL
      UNION ALL
      SELECT cuit, razon_social, tipo_societario,
             NULL, NULL, NULL, NULL, NULL,
             CASE WHEN activa THEN 'activa' ELSE 'inactiva' END,
             NULL::BOOLEAN, NULL,
             'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c',
             2
        FROM igj_entidades
       WHERE cuit IS NOT NULL AND razon_social IS NOT NULL
      UNION ALL
      SELECT cuit, nombre, NULL, inicio_actividades,
             NULL, NULL, NULL, NULL,
             estado, es_empleador, actividad_principal,
             COALESCE(fuente_url, 'internal://empresas-legacy'),
             3
        FROM empresas
       WHERE cuit IS NOT NULL AND nombre IS NOT NULL
      UNION ALL
      SELECT cuit, razon_social, NULL, inicio_inscripcion,
             NULL, NULL, NULL, NULL,
             NULL, NULL, rubro, fuente_url, 4
        FROM empresas_padron_provincial
       WHERE cuit IS NOT NULL AND razon_social IS NOT NULL
    ),
    cleaned AS (
      SELECT
        REGEXP_REPLACE(cuit_raw, '\\D', '', 'g') AS cuit_digits,
        *
      FROM unioned
      WHERE LENGTH(REGEXP_REPLACE(cuit_raw, '\\D', '', 'g')) = 11
        AND SUBSTRING(REGEXP_REPLACE(cuit_raw, '\\D', '', 'g'), 1, 2) IN ('30', '33', '34')
    )
    SELECT
      SUBSTRING(cuit_digits, 1, 2) || '-' || SUBSTRING(cuit_digits, 3, 8) || '-' || SUBSTRING(cuit_digits, 11, 1)
        AS cuit,
      ARG_MIN(razon_social, priority) AS razon_social,
      regexp_replace(strip_accents(UPPER(ARG_MIN(razon_social, priority))), '[^A-Z\\s]', ' ', 'g')
        AS razon_social_norm,
      ARG_MIN(tipo_societario, priority) FILTER (WHERE tipo_societario IS NOT NULL) AS tipo_societario,
      ARG_MIN(fecha_constitucion, priority) FILTER (WHERE fecha_constitucion IS NOT NULL) AS fecha_constitucion,
      ARG_MIN(dom_fiscal_provincia, priority) FILTER (WHERE dom_fiscal_provincia IS NOT NULL) AS dom_fiscal_provincia,
      ARG_MIN(dom_fiscal_localidad, priority) FILTER (WHERE dom_fiscal_localidad IS NOT NULL) AS dom_fiscal_localidad,
      ARG_MIN(dom_legal_provincia, priority) FILTER (WHERE dom_legal_provincia IS NOT NULL) AS dom_legal_provincia,
      ARG_MIN(dom_legal_localidad, priority) FILTER (WHERE dom_legal_localidad IS NOT NULL) AS dom_legal_localidad,
      ARG_MIN(estado, priority) FILTER (WHERE estado IS NOT NULL) AS estado,
      BOOL_OR(es_empleador) AS es_empleador,
      ARG_MIN(actividad_principal, priority) FILTER (WHERE actividad_principal IS NOT NULL) AS actividad_principal,
      TO_JSON(LIST_DISTINCT(LIST(razon_social))) AS alias_json,
      TO_JSON(LIST_DISTINCT(LIST(fuente_url))) AS fuentes_url_json
    FROM cleaned
    GROUP BY cuit_digits
  `)
  const cnt = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM tmp_pj_universe`)
  console.log(`tmp_pj_universe: ${cnt[0]?.n ?? 0} filas`)

  await dbRun(`
    INSERT INTO personas_juridicas
      (cuit, razon_social, razon_social_norm, alias_json, tipo_societario,
       fecha_constitucion, dom_fiscal_provincia, dom_fiscal_localidad,
       dom_legal_provincia, dom_legal_localidad, estado, es_empleador,
       actividad_principal, fuentes_url_json, primer_visto, ultimo_visto,
       t_efectivo, t_publicado, snapshot_id, superseded_by_id)
    SELECT
      cuit, razon_social, razon_social_norm, alias_json, tipo_societario,
      fecha_constitucion, dom_fiscal_provincia, dom_fiscal_localidad,
      dom_legal_provincia, dom_legal_localidad, estado, es_empleador,
      actividad_principal, fuentes_url_json,
      CAST(now() AS VARCHAR), CAST(now() AS VARCHAR),
      CAST(now() AS VARCHAR), CAST(now() AS VARCHAR),
      NULL, NULL
    FROM tmp_pj_universe
    ON CONFLICT (cuit) DO UPDATE SET
      razon_social         = EXCLUDED.razon_social,
      razon_social_norm    = EXCLUDED.razon_social_norm,
      alias_json           = EXCLUDED.alias_json,
      tipo_societario      = COALESCE(personas_juridicas.tipo_societario, EXCLUDED.tipo_societario),
      fecha_constitucion   = COALESCE(personas_juridicas.fecha_constitucion, EXCLUDED.fecha_constitucion),
      dom_fiscal_provincia = COALESCE(personas_juridicas.dom_fiscal_provincia, EXCLUDED.dom_fiscal_provincia),
      dom_fiscal_localidad = COALESCE(personas_juridicas.dom_fiscal_localidad, EXCLUDED.dom_fiscal_localidad),
      dom_legal_provincia  = COALESCE(personas_juridicas.dom_legal_provincia, EXCLUDED.dom_legal_provincia),
      dom_legal_localidad  = COALESCE(personas_juridicas.dom_legal_localidad, EXCLUDED.dom_legal_localidad),
      estado               = COALESCE(personas_juridicas.estado, EXCLUDED.estado),
      es_empleador         = COALESCE(personas_juridicas.es_empleador, EXCLUDED.es_empleador),
      actividad_principal  = COALESCE(personas_juridicas.actividad_principal, EXCLUDED.actividad_principal),
      fuentes_url_json     = EXCLUDED.fuentes_url_json,
      ultimo_visto         = EXCLUDED.ultimo_visto,
      t_efectivo           = EXCLUDED.t_efectivo,
      t_publicado          = EXCLUDED.t_publicado
  `)

  await dbRun(`DROP TABLE IF EXISTS tmp_pj_universe`)
  const finalCnt = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM personas_juridicas`)
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)
  console.log(`\n✓ Bulk insert completo en ${elapsed}s. Total personas_juridicas: ${finalCnt[0]?.n ?? 0}`)
}

if (require.main === module) {
  main().catch(e => { console.error(e); process.exit(1) })
}
