/**
 * Quarantine — aislamiento de filas inválidas durante seeds (W1).
 *
 * Política ARGOS: una corrida nocturna nunca aborta por una fila sucia.
 * Las filas que fallan validación de schema, sanity check o normalización
 * se guardan acá vinculadas al snapshot que las produjo. El operador puede
 * inspeccionarlas, decidir si reintentarlas (resolucion='inserted') o
 * descartarlas (resolucion='discarded').
 *
 * Cumple §2 (cero alucinaciones), §4 (trazabilidad), §6 (no continuar
 * sobre supuestos) del CLAUDE.md.
 */

import crypto from 'crypto'
import { dbRun, dbAll } from './db'

export interface QuarantineEntry {
  id: string
  snapshotId: string
  tablaDestino: string
  motivo: string
  detalle: unknown
  filaJson: unknown
  creadoEn: string
  resueltoEn: string | null
  resolucion: 'pending' | 'inserted' | 'discarded'
}

interface QuarantineRow {
  id: string
  snapshot_id: string
  tabla_destino: string
  motivo: string
  detalle: string | null
  fila_json: string | null
  creado_en: string
  resuelto_en: string | null
  resolucion: string
}

function fromRow(r: QuarantineRow): QuarantineEntry {
  return {
    id: r.id,
    snapshotId: r.snapshot_id,
    tablaDestino: r.tabla_destino,
    motivo: r.motivo,
    detalle: r.detalle ? JSON.parse(r.detalle) : null,
    filaJson: r.fila_json ? JSON.parse(r.fila_json) : null,
    creadoEn: r.creado_en,
    resueltoEn: r.resuelto_en,
    resolucion: r.resolucion as QuarantineEntry['resolucion'],
  }
}

export async function enquarantine(input: {
  snapshotId: string
  tablaDestino: string
  motivo: string
  detalle: unknown
  filaJson: unknown
}): Promise<string> {
  const id = crypto.randomUUID()
  await dbRun(
    `INSERT INTO quarantine (id, snapshot_id, tabla_destino, motivo, detalle, fila_json, creado_en, resolucion)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      id, input.snapshotId, input.tablaDestino, input.motivo,
      JSON.stringify(input.detalle ?? null),
      JSON.stringify(input.filaJson ?? null),
      new Date().toISOString(),
    ]
  )
  return id
}

export async function getQuarantine(filter: {
  tablaDestino?: string
  snapshotId?: string
  resolucion?: 'pending' | 'inserted' | 'discarded'
  limit?: number
}): Promise<QuarantineEntry[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.tablaDestino) { where.push('tabla_destino = ?'); params.push(filter.tablaDestino) }
  if (filter.snapshotId)   { where.push('snapshot_id = ?');   params.push(filter.snapshotId) }
  if (filter.resolucion)   { where.push('resolucion = ?');    params.push(filter.resolucion) }
  const sql = `SELECT * FROM quarantine ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY creado_en DESC LIMIT ?`
  params.push(filter.limit ?? 100)
  const rows = await dbAll<QuarantineRow>(sql, params)
  return rows.map(fromRow)
}

export async function resolverQuarantine(
  id: string,
  resolucion: 'inserted' | 'discarded',
  notas?: string
): Promise<void> {
  if (notas) {
    await dbRun(
      `UPDATE quarantine SET resolucion = ?, resuelto_en = ?, motivo = motivo || ' | ' || ? WHERE id = ?`,
      [resolucion, new Date().toISOString(), notas, id]
    )
  } else {
    await dbRun(
      `UPDATE quarantine SET resolucion = ?, resuelto_en = ? WHERE id = ?`,
      [resolucion, new Date().toISOString(), id]
    )
  }
}

export async function countQuarantine(filter: {
  resolucion?: 'pending' | 'inserted' | 'discarded'
  tablaDestino?: string
}): Promise<number> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.resolucion)   { where.push('resolucion = ?');    params.push(filter.resolucion) }
  if (filter.tablaDestino) { where.push('tabla_destino = ?'); params.push(filter.tablaDestino) }
  const sql = `SELECT COUNT(*) as n FROM quarantine ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`
  const rows = await dbAll<{ n: number | bigint }>(sql, params)
  return Number(rows[0]?.n ?? 0)
}
