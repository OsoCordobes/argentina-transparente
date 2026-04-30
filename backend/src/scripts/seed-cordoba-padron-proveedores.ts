// seed-cordoba-padron-proveedores.ts — Carga el padrón provincial de
// proveedores de Córdoba Capital (dataset 281) en `empresas_padron_provincial`
// y popula `empresas` para que el identity resolver Tier 1 use estos CUITs
// como fuente verificada.
//
// Distinto de `seed-proveedores-padron.ts` (que carga el catálogo agregado
// `proveedores_padron`): este script enfoca específicamente en el padrón
// provincial Córdoba como source-of-truth para identity matching.

import 'dotenv/config'
import { initDb, dbRun } from '../lib/db'
import { descargarPadronProveedoresCordoba } from '../lib/cordoba-padron-proveedores'

async function main() {
  await initDb()
  console.log('=== ARGOS — Seed Padrón Provincial Proveedores Córdoba ===\n')

  const proveedores = await descargarPadronProveedoresCordoba()
  console.log(`${proveedores.length.toLocaleString()} proveedores únicos en padrón provincial`)

  if (proveedores.length === 0) {
    console.warn('Sin proveedores parseados — revisar dataset 281 en el portal.')
    process.exit(1)
  }

  const now = new Date().toISOString()
  let insertados = 0
  for (const p of proveedores) {
    await dbRun(
      `INSERT OR REPLACE INTO empresas_padron_provincial
       (cuit, razon_social, rubro, inicio_inscripcion, fuente_url, cargado_en)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [p.cuit, p.razon_social, p.rubro ?? null, p.inicio ?? null, p.fuente_url, now]
    )

    // También popular `empresas` con CUIT para que el identity resolver lo
    // encuentre (Tier 1: cuit_exact). INSERT OR IGNORE para no pisar datos
    // de seed:afip si ya cargaron este CUIT con info más rica.
    await dbRun(
      `INSERT OR IGNORE INTO empresas
       (cuit, nombre, es_empleador, inicio_actividades, estado,
        actividad_principal, fuente_url, actualizado_en, fuente_padron)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        p.cuit,
        p.razon_social,
        null, // desconocido por este padrón
        p.inicio ?? null,
        'habilitado',
        p.rubro ?? null,
        p.fuente_url,
        now,
        'cordoba_padron_proveedores',
      ]
    )
    insertados++
  }

  console.log(`✓ ${insertados.toLocaleString()} proveedores cargados en empresas_padron_provincial.`)
  console.log(`  (también populados en \`empresas\` con fuente_padron='cordoba_padron_proveedores')`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
