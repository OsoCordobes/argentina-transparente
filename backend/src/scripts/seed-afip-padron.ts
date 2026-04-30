// seed-afip-padron.ts — Carga padrón nacional de empresas con CUIT desde
// datos.jus.gob.ar (Registro Nacional de Sociedades — reemplazo del SSPM PUC
// que está dado de baja). Cada empresa se inserta en `empresas` con
// `fuente_padron='afip_padron'` para que el identity resolver Tier 1+2 pueda
// confiar en el match exacto por CUIT.
//
// Uso:
//   npm run seed:afip-padron                # skip si ya cargado
//   npm run seed:afip-padron -- --force     # recargar desde cero
//
// IMPORTANTE: el bulk completo (~hundreds of MB) tarda varios minutos en
// descargar y parsear. Para smoke tests usar el muestreo público (default URL).

import 'dotenv/config'
import path from 'path'
import os from 'os'
import { initDb, dbRun, dbAll } from '../lib/db'
import { descargarPadron, parsearPadronStream } from '../lib/afip-padron-empleadores'

async function main() {
  await initDb()
  const force = process.argv.includes('--force')

  const existing = await dbAll<{ n: number }>(
    `SELECT COUNT(*) as n FROM empresas WHERE fuente_padron = 'afip_padron'`
  )
  const existingN = Number(existing[0]?.n ?? 0)
  if (existingN > 0 && !force) {
    console.log(`Padrón ya cargado (${existingN.toLocaleString()} filas). Use --force para recargar.`)
    process.exit(0)
  }

  const tmpFile = path.join(os.tmpdir(), 'afip-padron.csv')
  console.log('Descargando AFIP padrón (Registro Nacional de Sociedades)...')
  await descargarPadron(tmpFile)
  console.log('Parseando + insertando...')

  let n = 0
  const now = new Date().toISOString()
  for await (const emp of parsearPadronStream(tmpFile)) {
    // Named columns para sobrevivir a ALTERs futuros del schema empresas.
    await dbRun(
      `INSERT OR REPLACE INTO empresas
       (cuit, nombre, es_empleador, inicio_actividades, estado,
        actividad_principal, fuente_url, actualizado_en, fuente_padron)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        emp.cuit,
        emp.razon_social || `EMPRESA ${emp.cuit}`,
        true,
        emp.inicio_actividades,
        emp.estado,
        emp.actividad,
        'https://datos.jus.gob.ar/dataset/justicia-registro-nacional-sociedades',
        now,
        'afip_padron',
      ]
    )
    n++
    if (n % 10000 === 0) console.log(`  ${n.toLocaleString()} empresas insertadas...`)
  }
  console.log(`✓ ${n.toLocaleString()} empresas insertadas desde AFIP padrón.`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
