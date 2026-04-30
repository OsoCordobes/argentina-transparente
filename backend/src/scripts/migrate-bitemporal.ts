// migrate-bitemporal.ts — Agrega columnas bitemporal idempotentes a tablas core.
//
// Modelo:
//   t_efectivo  = fecha real del hecho (cuándo ocurrió)
//   t_publicado = fecha de extracción (cuándo lo supimos en ARGOS)
//   snapshot_id = FK a tabla snapshots
//   superseded_by_id = FK a la fila que reemplaza esta (correcciones oficiales)
//
// DuckDB no soporta IF NOT EXISTS en ADD COLUMN; capturamos error de columna
// duplicada para que sea idempotente.

import 'dotenv/config'
import { initDb, dbRun, dbAll } from '../lib/db'

const TABLAS_CORE = [
  'contratos',
  'agentes_publicos',
  'igj_entidades',
  'igj_autoridades',
  'rns_personas_juridicas',
  'licitaciones_llamado',
  'obras_publicas',
  'transferencias',
  'presupuesto_ejecucion',
  // boletin_actos ya nace con columnas bitemporal (creadas en initDb), pero
  // listamos aquí para que addColumnIfMissing las trate como existentes y
  // mantengamos consistencia con el listado de tablas core bitemporales.
  'boletin_actos',
  // M1 (W3) — tablas nuevas con bitemporal nativo. Listadas aquí para auditoría.
  'declaraciones_juradas',
  'aportantes_campanas',
] as const

async function tableExists(name: string): Promise<boolean> {
  const rows = await dbAll<{ n: number | bigint }>(
    `SELECT COUNT(*) as n FROM information_schema.tables WHERE table_schema='main' AND table_name = ?`,
    [name]
  )
  return Number(rows[0]?.n ?? 0) > 0
}

async function addColumnIfMissing(table: string, col: string, def: string): Promise<'added' | 'exists'> {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
    return 'added'
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.toLowerCase().includes('duplicate') || msg.toLowerCase().includes('already exists')) return 'exists'
    throw err
  }
}

async function main() {
  console.log('=== ARGOS — Migración bitemporal ===\n')
  await initDb()

  for (const tabla of TABLAS_CORE) {
    if (!await tableExists(tabla)) {
      console.log(`  ${tabla}: tabla no existe, saltando`)
      continue
    }
    const a = await addColumnIfMissing(tabla, 't_efectivo', 'TEXT')
    const b = await addColumnIfMissing(tabla, 't_publicado', 'TEXT')
    const c = await addColumnIfMissing(tabla, 'snapshot_id', 'TEXT')
    const d = await addColumnIfMissing(tabla, 'superseded_by_id', 'TEXT')
    console.log(`  ${tabla}: t_efectivo=${a}, t_publicado=${b}, snapshot_id=${c}, superseded_by_id=${d}`)

    try {
      await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla}_snapshot ON ${tabla}(snapshot_id) WHERE snapshot_id IS NOT NULL`)
      await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla}_superseded ON ${tabla}(superseded_by_id) WHERE superseded_by_id IS NULL`)
    } catch { /* ignore */ }
  }

  console.log('\n✓ Migración bitemporal completada')
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
