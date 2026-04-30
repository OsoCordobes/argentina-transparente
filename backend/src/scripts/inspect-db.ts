// Script temporal para inspeccionar el estado de las tablas DuckDB
// Uso: npx ts-node src/scripts/inspect-db.ts
import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

async function main() {
  await initDb()

  const tablas = [
    'contratos', 'licitaciones_llamado', 'agentes_publicos',
    'presupuesto_ejecucion', 'empresas', 'opensanctions_matches',
    'icij_entidades', 'señales_cache', 'reportes', 'fuentes_datos',
    'obras_publicas', 'proveedores_padron', 'transferencias',
    'auditorias_tribunal_cuentas', 'boe_cba_pdfs', 'ocr_jobs', 'alertas',
    'igj_entidades', 'igj_autoridades', 'directores',
    'fuentes_publicas_catalogo', 'scrapers_health',
    'rns_personas_juridicas', 'empresas_padron_provincial',
    'declaraciones_juradas', 'aportantes_campanas',
  ]

  console.log('Tabla'.padEnd(40), 'Filas'.padStart(10))
  console.log('─'.repeat(52))

  for (const t of tablas) {
    try {
      const rows = await dbAll<{ cnt: number }>(`SELECT COUNT(*) as cnt FROM "${t}"`)
      const n = Number(rows[0]?.cnt ?? 0)
      console.log(t.padEnd(40), n.toString().padStart(10))
    } catch (e) {
      console.log(t.padEnd(40), 'N/A')
    }
  }

  // Detalle por año en contratos cordoba-capital
  try {
    const rows = await dbAll<{ anio: number; cnt: number }>(
      `SELECT anio, COUNT(*) as cnt FROM contratos WHERE municipio='cordoba-capital' GROUP BY anio ORDER BY anio`
    )
    if (rows.length > 0) {
      console.log('\nContratos Córdoba Capital por año:')
      for (const r of rows) {
        console.log(`  ${r.anio}: ${Number(r.cnt).toString().padStart(6)}`)
      }
    }
  } catch (e) {
    /* tabla vacía */
  }

  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
