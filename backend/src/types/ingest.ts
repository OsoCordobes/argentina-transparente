// Tipos compartidos por todos los seeds para reportar resultado.
// Los seeds heredan IngestReport y lo emiten al stdout + lo registran en
// tabla `snapshots`.

export interface IngestOpts {
  /** Año mínimo a procesar (inclusivo). */
  desde?: number
  /** Año máximo a procesar (inclusivo). Default: año actual. */
  hasta?: number
  /** Si true, ignora hash de snapshot previo y re-procesa. */
  force?: boolean
  /** Si true, ejecuta sin escribir a la DB (útil para testing/debug). */
  dryRun?: boolean
}

export type IngestStatus = 'success' | 'partial' | 'failed' | 'skipped_unchanged'

export interface IngestReport {
  /** UUID generado al inicio de la corrida. */
  snapshotId: string
  /** ID del seed que generó el snapshot. ej. 'seed:cordoba'. */
  seedId: string
  /** URL del archivo origen descargado. */
  fuenteUrl: string
  /** Timestamp ISO de inicio de la corrida. */
  fechaCorrida: string
  /** sha256 del payload origen. */
  hashArchivo: string
  filasLeidas: number
  filasInsertadas: number
  filasQuarantined: number
  errores: { fila: number; motivo: string }[]
  duracionMs: number
  status: IngestStatus
}

export interface QuarantineRow {
  id: string                  // UUID
  snapshotId: string          // FK
  tablaDestino: string        // 'contratos', 'agentes_publicos', etc.
  motivo: string              // 'schema_validation' | 'integrity' | 'sanity_check'
  detalle: string             // JSON con info diagnóstica
  filaJson: string            // JSON serializado del row original
  creadoEn: string            // ISO timestamp
  resueltoEn?: string | null
  resolucion?: string | null  // 'inserted' | 'discarded' | 'pending'
}
