import type { Contrato, Empresa, Persona, Organismo } from '@argos/model'

// ─── Raw snapshot from a fetch ────────────────────────────────────────────────
export interface RawPayload {
  data:          Buffer | string
  content_type:  string
  source_url:    string
  fetched_at:    Date
  sha256:        string
  archive_path:  string  // relative to data/snapshots/
}

// ─── Snapshot service interface ───────────────────────────────────────────────
// Implementado en apps/api — inmutable, nunca sobrescribe.
// Ruta final: data/snapshots/{connector_id}/{timestamp}_{sha256}.{ext}
export interface SnapshotService {
  save(connectorId: string, raw: Buffer | string, ext: string, sourceUrl: string): Promise<RawPayload>
  exists(sha256: string): Promise<boolean>
  load(archivePath: string): Promise<Buffer>
}

// ─── Base connector interface ─────────────────────────────────────────────────
// Toda fuente de datos implementa esta interfaz.
// fetchRaw: descarga + crea snapshot inmutable
// parse:    transforma raw payload en entidades normalizadas
// upsert:   persiste en DuckDB (idempotente por hash)
export interface Connector<TRaw, TEntity> {
  id:          string
  description: string
  fetchRaw(params: Record<string, unknown>): Promise<RawPayload>
  parse(raw: RawPayload): TEntity[]
  upsert(entities: TEntity[]): Promise<{ inserted: number; skipped: number }>
}

// ─── Municipio connector (legacy compatible) ───────────────────────────────────
// Extiende Connector para el caso específico de contratos municipales.
export interface MunicipioConnector extends Connector<unknown, Contrato> {
  municipio_id:       string
  nombre:             string
  anios_disponibles:  number[]
  getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]>
}

// ─── Registry helper ──────────────────────────────────────────────────────────
export class ConnectorRegistry {
  private connectors = new Map<string, MunicipioConnector>()

  register(connector: MunicipioConnector): void {
    this.connectors.set(connector.municipio_id, connector)
  }

  get(municipioId: string): MunicipioConnector {
    const c = this.connectors.get(municipioId)
    if (!c) {
      throw new Error(
        `Municipio '${municipioId}' no disponible. Disponibles: ${[...this.connectors.keys()].join(', ')}`
      )
    }
    return c
  }

  list(): MunicipioConnector[] {
    return [...this.connectors.values()]
  }
}

export const connectorRegistry = new ConnectorRegistry()
