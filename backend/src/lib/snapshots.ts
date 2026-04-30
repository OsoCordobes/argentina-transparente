import crypto from 'crypto'
import { dbRun, dbAll } from './db'
import type { IngestStatus } from '../types/ingest'

export interface Snapshot {
  id: string
  seedId: string
  fuenteUrl: string
  fechaCorrida: string
  hashArchivo: string
  filasLeidas: number
  filasInsertadas: number
  filasQuarantined: number
  duracionMs: number | null
  status: IngestStatus
  supersededBy: string | null
  notas: string | null
}

interface SnapshotRow {
  id: string
  seed_id: string
  fuente_url: string
  fecha_corrida: string
  hash_archivo: string
  filas_leidas: number
  filas_insertadas: number
  filas_quarantined: number
  duracion_ms: number | null
  status: string
  superseded_by: string | null
  notas: string | null
}

function fromRow(r: SnapshotRow): Snapshot {
  return {
    id: r.id,
    seedId: r.seed_id,
    fuenteUrl: r.fuente_url,
    fechaCorrida: r.fecha_corrida,
    hashArchivo: r.hash_archivo,
    filasLeidas: Number(r.filas_leidas),
    filasInsertadas: Number(r.filas_insertadas),
    filasQuarantined: Number(r.filas_quarantined),
    duracionMs: r.duracion_ms === null ? null : Number(r.duracion_ms),
    status: (r.status as IngestStatus),
    supersededBy: r.superseded_by,
    notas: r.notas,
  }
}

export async function crearSnapshot(input: {
  seedId: string
  fuenteUrl: string
  hashArchivo: string
  filasLeidas: number
  filasInsertadas?: number
  filasQuarantined?: number
  duracionMs?: number
  status?: IngestStatus
  notas?: string
}): Promise<Snapshot> {
  const id = crypto.randomUUID()
  const fechaCorrida = new Date().toISOString()
  await dbRun(
    `INSERT INTO snapshots
      (id, seed_id, fuente_url, fecha_corrida, hash_archivo,
       filas_leidas, filas_insertadas, filas_quarantined, duracion_ms, status, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.seedId, input.fuenteUrl, fechaCorrida, input.hashArchivo,
      input.filasLeidas, input.filasInsertadas ?? 0, input.filasQuarantined ?? 0,
      input.duracionMs ?? null, input.status ?? 'success', input.notas ?? null,
    ]
  )
  return {
    id, seedId: input.seedId, fuenteUrl: input.fuenteUrl, fechaCorrida,
    hashArchivo: input.hashArchivo,
    filasLeidas: input.filasLeidas,
    filasInsertadas: input.filasInsertadas ?? 0,
    filasQuarantined: input.filasQuarantined ?? 0,
    duracionMs: input.duracionMs ?? null,
    status: input.status ?? 'success',
    supersededBy: null,
    notas: input.notas ?? null,
  }
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const rows = await dbAll<SnapshotRow>(`SELECT * FROM snapshots WHERE id = ?`, [id])
  return rows.length === 0 ? null : fromRow(rows[0])
}

export async function listSnapshots(seedId?: string, limit = 50): Promise<Snapshot[]> {
  const rows = seedId
    ? await dbAll<SnapshotRow>(`SELECT * FROM snapshots WHERE seed_id = ? ORDER BY fecha_corrida DESC LIMIT ?`, [seedId, limit])
    : await dbAll<SnapshotRow>(`SELECT * FROM snapshots ORDER BY fecha_corrida DESC LIMIT ?`, [limit])
  return rows.map(fromRow)
}

export async function marcarSupersededBy(viejoId: string, nuevoId: string): Promise<void> {
  await dbRun(`UPDATE snapshots SET superseded_by = ? WHERE id = ?`, [nuevoId, viejoId])
}

/**
 * Devuelve el snapshot previo del mismo seedId+fuenteUrl si existe (para
 * comparar hash y decidir si saltar la corrida nueva).
 */
export async function getUltimoSnapshot(seedId: string, fuenteUrl: string): Promise<Snapshot | null> {
  const rows = await dbAll<SnapshotRow>(
    `SELECT * FROM snapshots
     WHERE seed_id = ? AND fuente_url = ? AND superseded_by IS NULL
     ORDER BY fecha_corrida DESC LIMIT 1`,
    [seedId, fuenteUrl]
  )
  return rows.length === 0 ? null : fromRow(rows[0])
}
