// seed-licitaciones-historicas.ts — Carga 2,777 llamados a licitación de
// Córdoba Capital 2005-2018 desde el dataset 2 versión 4747.
//
// Estos NO son adjudicaciones (no tienen proveedor adjudicatario): son
// llamados públicos con presupuesto oficial estimado. Van a la tabla separada
// `licitaciones_llamado`, no a `contratos`, para no confundir el motor de
// señales que mide concentración por proveedor.
//
// Uso:
//   npm run seed:licitaciones-historicas
//   npm run seed:licitaciones-historicas -- --dry-run

import 'dotenv/config'
import { initDb, registrarFuente, dbAll } from '../lib/db'
import {
  cargarLicitacionesHistoricas, insertarLlamados,
} from '../lib/licitaciones-cordoba-2005-2018'
import type { FuenteMetadata } from '../types'

async function main() {
  console.log('=== ARGOS — Seed Licitaciones Históricas Córdoba 2005-2018 ===\n')

  const dryRun = process.argv.includes('--dry-run')

  await initDb()

  const fuente: FuenteMetadata = {
    id: 'cordoba-capital-licitaciones-2005-2018',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/economia-y-finanzas/compras-y-contrataciones/2',
    formato: 'XLSX (Dataset CKAN versión 4747)',
    oficial: true,
    nivelConfianza: 'alto',  // datos verbatim del XLSX oficial
    notas: '2,777 llamados a licitación de Córdoba Capital entre 2005 y mayo 2018. ' +
           'Incluye presupuesto_oficial (estimación) pero NO adjudicatario. ' +
           'Se almacenan en tabla licitaciones_llamado (separada de contratos). ' +
           'Para conseguir adjudicatario: cruzar por número de expediente con normas del CSV histórico.',
  }
  if (!dryRun) await registrarFuente(fuente)

  const llamados = await cargarLicitacionesHistoricas()

  // Distribución por año
  const porAnio = new Map<number, number>()
  let presupuestoTotal = 0
  for (const l of llamados) {
    porAnio.set(l.anio, (porAnio.get(l.anio) ?? 0) + 1)
    presupuestoTotal += l.presupuestoOficial ?? 0
  }

  console.log('\nDistribución por año:')
  for (const [a, c] of [...porAnio.entries()].sort((x, y) => x[0] - y[0])) {
    console.log(`  ${a}: ${c.toString().padStart(4)} llamados`)
  }
  console.log(`\nPresupuesto oficial total: $${presupuestoTotal.toLocaleString('es-AR', { maximumFractionDigits: 0 })}`)

  if (dryRun) {
    console.log('\n--dry-run: terminando sin insertar.')
    process.exit(0)
  }

  console.log('\nInsertando en DuckDB...')
  const inserted = await insertarLlamados(llamados)
  console.log(`✓ ${inserted} llamados insertados (${llamados.length - inserted} duplicados omitidos)`)

  // Cruzar por expediente con contratos existentes
  const cruces = await dbAll<{ cnt: number }>(
    `SELECT COUNT(DISTINCT l.id) as cnt
     FROM licitaciones_llamado l
     INNER JOIN contratos c
       ON c.numero_expediente IS NOT NULL
       AND l.expediente IS NOT NULL
       AND l.expediente = c.numero_expediente
     WHERE l.municipio = 'cordoba-capital'`
  )
  console.log(`\n✓ Cruces detectados: ${Number(cruces[0]?.cnt ?? 0)} llamados tienen contrato adjudicado en la tabla contratos (vía expediente)`)

  console.log('\nPróximos pasos:')
  console.log('  1. Después del extractor de normas, los expedientes deberían cruzar más')
  console.log('  2. Implementar señal "diferencia presupuesto vs adjudicado" en otro round')

  process.exit(0)
}

main().catch(err => { console.error('\nError:', err); process.exit(1) })
