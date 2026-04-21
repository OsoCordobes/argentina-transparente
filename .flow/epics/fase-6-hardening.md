# Epic: Fase 6 — Hardening

**Status:** open
**Priority:** P5 (last phase)

## Tasks

### Task 1: Neo4j indexes
Create indexes for fast lookups:
- `CREATE INDEX ON :Empresa(cuit)`
- `CREATE INDEX ON :Empresa(nombre)`
- `CREATE INDEX ON :Persona(nombre)`
- `CREATE INDEX ON :Contrato(municipio_id)`

### Task 2: DuckDB query optimization
Run `EXPLAIN ANALYZE` on the top 5 slowest API queries, add indexes where needed.

### Task 3: Rate limiting + auth on /analizar
Basic auth token or simple password for the API (local-first, no OAuth needed yet).
Rate limit `/api/ai/query` to 10 req/min to prevent runaway Claude costs.

### Task 4: Playwright E2E full coverage
Expand `apps/board/e2e/` to cover:
- Export flows (PDF, denuncia, dataset)
- AI chat with tool calls
- Case management (create, rename, delete)
- Timeline filter

### Task 5: User documentation
`docs/guia-investigacion.md` — step-by-step for a journalist:
1. Cómo arrancar ARGOS
2. Cómo buscar una empresa
3. Cómo leer las señales
4. Cómo usar el chat de IA
5. Cómo exportar una denuncia

### Task 6: Architecture documentation
`docs/ARCHITECTURE.md` — technical overview for developers:
- Package dependency graph
- Data flow diagram
- Signal plugin API
- How to add a new connector
- How to add a new signal

### Task 7: DDJJ connector (P2)
`packages/ingestion/src/connectors/ddjj/` — PDF parsing of OA declarations.

### Task 8: CIJ connector (P2)
`packages/ingestion/src/connectors/cij/` — scraping of CIJ judicial cases.

## Acceptance Criteria

- [ ] All queries under 500ms (measured)
- [ ] Full Playwright E2E suite passes
- [ ] User guide covers all core workflows
- [ ] ARCHITECTURE.md explains how to add a connector + signal
