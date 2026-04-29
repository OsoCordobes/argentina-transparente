// flag-sociedades-estado.ts — F8.5
// Marca como es_ente_estatal=TRUE las PJ del catálogo curado de Sociedades
// del Estado argentinas. Si la PJ NO existe en BD (porque RNS/IGJ no la
// trajeron), la INSERTA con datos del catálogo. Sin esto la herramienta no
// puede mostrar perfil de actores estatales fundamentales (Banco Nación,
// AFIP, UNC, Municipalidad Córdoba). Idempotente.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'
import { SOCIEDADES_DEL_ESTADO_ARG } from '../lib/sociedades-del-estado-arg'

async function main() {
  await initDb()
  console.log('=== Flag + Insert Sociedades del Estado conocidas ===\n')

  const before = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM personas_juridicas WHERE es_ente_estatal = TRUE`,
  )
  console.log(`Antes: ${before[0].n} PJ marcadas como ente estatal`)

  let actualizadas = 0, insertadas = 0
  const now = new Date().toISOString()

  for (const ente of SOCIEDADES_DEL_ESTADO_ARG) {
    const exists = await dbAll<{ cuit: string }>(
      `SELECT cuit FROM personas_juridicas WHERE cuit = ?`, [ente.cuit],
    )
    if (exists.length === 0) {
      // No existe — insertar desde el catálogo curado.
      const provincia = ente.jurisdiccion === 'provincial' ? 'CORDOBA'
                       : ente.jurisdiccion === 'municipal' ? 'CORDOBA'
                       : ente.jurisdiccion === 'nacional' ? 'CIUDAD AUTONOMA DE BUENOS AIRES'
                       : null
      await dbRun(
        `INSERT INTO personas_juridicas
           (cuit, razon_social, razon_social_norm, alias_json, tipo_societario,
            fecha_constitucion, dom_fiscal_provincia, dom_fiscal_localidad,
            dom_legal_provincia, dom_legal_localidad, estado, es_empleador,
            actividad_principal, fuentes_url_json, primer_visto, ultimo_visto,
            t_efectivo, t_publicado, snapshot_id, superseded_by_id, es_ente_estatal)
         VALUES (?, ?, ?, ?, ?, NULL, ?, NULL, NULL, NULL, 'activa', NULL, NULL,
                 ?, ?, ?, ?, ?, NULL, NULL, TRUE)`,
        [
          ente.cuit,
          ente.nombre,
          ente.nombre.toUpperCase().replace(/[^A-Z\s]/g, ' ').replace(/\s+/g, ' ').trim(),
          JSON.stringify([ente.nombre]),
          ente.tipo,
          provincia,
          JSON.stringify(['argos://catalogo-curado/sociedades-del-estado-arg/v1']),
          now, now, now, now,
        ],
      )
      insertadas++
    } else {
      await dbRun(
        `UPDATE personas_juridicas SET es_ente_estatal = TRUE WHERE cuit = ?`,
        [ente.cuit],
      )
      actualizadas++
    }
  }

  const after = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM personas_juridicas WHERE es_ente_estatal = TRUE`,
  )
  console.log(`\n  Actualizadas:  ${actualizadas}`)
  console.log(`  Insertadas:    ${insertadas}`)
  console.log(`Total entes estatales (post): ${after[0].n}`)
}

main().catch(e => { console.error(e); process.exit(1) })
