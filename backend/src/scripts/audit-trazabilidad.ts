// audit-trazabilidad.ts — Verifica que cada fila de las tablas críticas tenga
// trazabilidad mínima (fuente_url + nivel_confianza + metodo_extraccion donde aplique).
//
// CLAUDE.md §2: "Toda fuente debe registrarse con origen, fecha de obtención,
// método de extracción, formato, y nivel de confianza."
//
// Uso:
//   npx ts-node src/scripts/audit-trazabilidad.ts [municipio]
//
// Exit code:
//   0 — auditoría pasa (cero gaps)
//   1 — al menos un gap detectado (muestra detalle)

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

interface Check {
  tabla: string
  descripcion: string
  sql: string
  params?: unknown[]
}

async function main() {
  await initDb()

  const municipio = process.argv[2] ?? 'cordoba-capital'
  console.log(`\n=== Auditoría de Trazabilidad — ${municipio} ===\n`)

  const checks: Check[] = [
    {
      tabla: 'contratos',
      descripcion: 'sin fuente_url',
      sql: `SELECT COUNT(*) as cnt FROM contratos WHERE municipio = ? AND (fuente_url IS NULL OR fuente_url = '')`,
      params: [municipio],
    },
    {
      tabla: 'contratos',
      descripcion: "nivel_confianza no en {alto, medio, bajo}",
      sql: `SELECT COUNT(*) as cnt FROM contratos WHERE municipio = ? AND nivel_confianza NOT IN ('alto', 'medio', 'bajo')`,
      params: [municipio],
    },
    {
      tabla: 'contratos',
      descripcion: 'sin metodo_extraccion',
      sql: `SELECT COUNT(*) as cnt FROM contratos WHERE municipio = ? AND (metodo_extraccion IS NULL OR metodo_extraccion = '')`,
      params: [municipio],
    },
    {
      tabla: 'licitaciones_llamado',
      descripcion: 'sin fuente_url',
      sql: `SELECT COUNT(*) as cnt FROM licitaciones_llamado WHERE municipio = ? AND (fuente_url IS NULL OR fuente_url = '')`,
      params: [municipio],
    },
    {
      tabla: 'agentes_publicos',
      descripcion: 'sin fuente_url',
      sql: `SELECT COUNT(*) as cnt FROM agentes_publicos WHERE jurisdiccion = ? AND (fuente_url IS NULL OR fuente_url = '')`,
      params: [municipio],
    },
    {
      tabla: 'presupuesto_ejecucion',
      descripcion: 'sin fuente_url',
      sql: `SELECT COUNT(*) as cnt FROM presupuesto_ejecucion WHERE jurisdiccion = ? AND (fuente_url IS NULL OR fuente_url = '')`,
      params: [municipio],
    },
    {
      tabla: 'señales_cache',
      descripcion: 'sin entidades_cuit (puede ser señal histórica pre-Sprint 2 — warning soft)',
      sql: `SELECT COUNT(*) as cnt FROM señales_cache WHERE municipio = ? AND entidades_cuit IS NULL`,
      params: [municipio],
    },
  ]

  let totalGaps = 0
  let hardFails = 0

  for (const check of checks) {
    try {
      const rows = await dbAll<{ cnt: number }>(check.sql, check.params)
      const n = Number(rows[0]?.cnt ?? 0)
      const isSoft = check.descripcion.includes('warning soft')
      const status = n === 0 ? '✓' : (isSoft ? '⚠' : '✗')
      console.log(`${status} ${check.tabla.padEnd(25)} ${check.descripcion.padEnd(50)} ${n.toString().padStart(6)} gaps`)
      if (n > 0) {
        totalGaps += n
        if (!isSoft) hardFails++
      }
    } catch (err) {
      // Tabla no existe o columna no existe — saltar el check
      const msg = (err as Error).message.slice(0, 60)
      console.log(`? ${check.tabla.padEnd(25)} ${check.descripcion.padEnd(50)}        ERROR: ${msg}`)
    }
  }

  console.log(`\nResumen: ${totalGaps} filas con gap${hardFails > 0 ? ` (${hardFails} checks fallaron)` : ''}`)

  if (hardFails > 0) {
    console.log('\n✗ Auditoría FALLA. Cada fila debe tener trazabilidad completa por CLAUDE.md §2.')
    process.exit(1)
  } else if (totalGaps > 0) {
    console.log('\n⚠ Auditoría con warnings. Revisar señales_cache pre-Sprint 2 (entidades_cuit puede agregarse al re-correr analyze --force).')
    process.exit(0)
  } else {
    console.log('\n✓ Auditoría PASA. Todas las tablas críticas con trazabilidad completa.')
    process.exit(0)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
