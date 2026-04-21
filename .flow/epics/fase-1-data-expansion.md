# Epic: Fase 1 — Data Expansion

**Status:** open
**Priority:** P0

## Context

ARGOS v3 monorepo is scaffolded (Fase 0 complete). Foundation packages exist:
- `packages/model` — Zod schemas for all entities (Persona, Empresa, Contrato, Organismo, Cargo, Donacion, DDJJ, Causa, Obra, Hallazgo)
- `packages/ingestion` — Connector/SnapshotService interfaces
- `packages/engine` — SignalDetector/GraphContext/runEngine types
- `packages/kb` — Knowledge base stub
- `apps/api` — stub (needs real implementation)
- `apps/board` — investigation board skeleton with shadcn/ui

Legacy `backend/` (Express + DuckDB + Neo4j) still runs at localhost:3001. 89/89 tests passing.

## Objective

Implement the snapshot service, expand data sources, and wire connectors to `@argos/ingestion`.

## Tasks

### Task 1: Snapshot Service
**File:** `packages/ingestion/src/snapshot.ts`

Implement `SnapshotService` interface (already defined in `packages/ingestion/src/connector.ts`):
- `save(connectorId, raw, ext, sourceUrl)`: hash raw with SHA-256, save to `data/snapshots/{connectorId}/{ISO_timestamp}_{sha256}.{ext}` (never overwrite)
- `exists(sha256)`: check if any snapshot with that hash exists
- `load(archivePath)`: read and return buffer

Tests (in `packages/ingestion/src/__tests__/snapshot.test.ts`):
- saving same payload twice does NOT create a duplicate file
- returned `archive_path` is reproducible from sha256
- `load()` returns identical bytes to what was saved

### Task 2: Córdoba Capital 2024/2025/2026 connector
**File:** `packages/ingestion/src/connectors/cordoba-capital/`

Investigate and implement dataset IDs for 2024, 2025, 2026 on gobiernoabierto.cordoba.gob.ar.
Known dataset IDs: 2019→`2`, 2020→`5977`, 2021→`5978`, 2022→`6466`, 2023→`6467`.
Use the existing connector pattern from `backend/src/connectors/cordoba-capital/` as reference.

Implement `MunicipioConnector` from `@argos/ingestion` returning `Contrato[]` from `@argos/model`.

### Task 3: IGJ reloader with complete schema
**File:** `packages/ingestion/src/connectors/igj/`

Port and extend `backend/src/lib/igj.ts`. The full schema should populate:
- `Empresa.fecha_constitucion`
- `Empresa.domicilio`
- `Empresa.estado`

Tests: parse fixture responses, verify all fields populated.

### Task 4: Neo4j sync batch job
**File:** `apps/api/src/scripts/sync-neo4j.ts`

Read `Empresa[]` and `Persona[]` (directors) from DuckDB, upsert to Neo4j:
- Nodes: `(:Empresa {cuit, nombre})`, `(:Persona {nombre, cuit})`
- Relations: `(:Persona)-[:DIRECTOR_DE]->(:Empresa)`, `(:Empresa)-[:GANÓ {monto, anio}]->(:Contrato)`

Idempotent (safe to run multiple times). Uses neo4j-driver.

## Acceptance Criteria

- [ ] Snapshot service: 3 tests pass (no duplicates, reproducible path, load roundtrip)
- [ ] Córdoba 2024+ connector: downloads real data or verifies dataset unavailable (document finding)
- [ ] IGJ connector: parses fecha_constitucion + domicilio + estado from live or fixture data
- [ ] Neo4j sync: inserts companies + directors + won contracts; running twice = same result

## Notes

- All connectors must use snapshot service — no raw network calls without archiving
- `data/snapshots/` goes in `.gitignore` (already there via `backend/data/`)
- Legacy `backend/` stays untouched — new connectors live in `packages/ingestion/`
