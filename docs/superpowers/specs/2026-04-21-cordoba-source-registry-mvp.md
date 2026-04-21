# Cordoba Public Spending Source Registry (MVP)
Date: 2026-04-21
Status: Draft for validation
Purpose: Convert external research notes into an actionable ingestion registry with explicit confidence levels.

## Scope
This registry is for graph-first ingestion planning in ARGOS. It separates:
- Verified in current codebase
- Plausible but not yet verified in this repository
- Out of MVP scope for initial release

## Confidence Legend
- Confirmed: validated in code and/or existing project docs
- Pending verification: appears plausible but needs source-level validation
- Deferred: not required for first launch gate

## Source Registry v0

### 1) Cordoba Capital procurement dataset via Gobierno Abierto API
- Status: Confirmed
- Role: Core contracts ingestion (current backbone)
- Access mode: API + XLSX resource download
- Frequency: yearly datasets available (lag possible)
- Current parser/integration: implemented
- Risks:
  - publication lag by year
  - schema drift across yearly files
- Code evidence:
  - backend/src/connectors/cordoba-capital/fetcher.ts
  - backend/src/connectors/cordoba-capital/parser.ts

### 2) IGJ entities and authorities (national justice data)
- Status: Confirmed
- Role: relationship enrichment (company and directors)
- Access mode: ZIP with CSV files
- Frequency: semester versions
- Current parser/integration: implemented
- Risks:
  - source URL changes by semester
  - partial identifier quality
- Code evidence:
  - backend/src/scripts/seed-igj.ts
  - backend/src/lib/db.ts

### 3) Neo4j graph projection from DuckDB + IGJ
- Status: Confirmed
- Role: graph-first relationship layer for landing and network signals
- Access mode: batch sync script and graph library
- Current parser/integration: implemented
- Risks:
  - requires stable identity resolution
  - requires production graph availability
- Code evidence:
  - backend/src/scripts/seed-neo4j.ts
  - backend/src/lib/graph.ts

### 4) Provincial execution budget dataset (Finanzas)
- Status: Pending verification
- Role: budget context to connect contracts vs budget execution
- Access mode: expected CSV/XLSX direct download
- Frequency: expected quarterly
- Risks:
  - confirm URL permanence and data dictionary
  - confirm licensing terms and update cadence
- Suggested MVP action:
  - create connector stub and schema map after verification

### 5) Provincial compras portal (HTML experience)
- Status: Pending verification
- Role: incremental contract detail coverage beyond current dataset
- Access mode: expected web scraping or undocumented endpoints
- Risks:
  - anti-bot and UI changes
  - unstable extraction fields
- Suggested MVP action:
  - discovery spike only, do not block first launch

### 6) Transferencias a municipios (PDF bulletins)
- Status: Pending verification
- Role: municipality transfer context layer
- Access mode: PDF extraction/OCR
- Risks:
  - extraction quality and table consistency
  - high maintenance burden
- Suggested MVP action:
  - defer from first graph launch unless source exposes structured files

### 7) Municipalidad de Cordoba compras portal
- Status: Pending verification
- Role: municipal extension after provincial MVP
- Access mode: expected CSV/XLSX or portal export
- Risks:
  - schema mismatch with current model
- Suggested MVP action:
  - evaluate as phase 2 connector after provincial launch gate

## Normalization Baseline (graph-first)
For all incoming sources, store raw provenance and canonical entities.

Canonical entities:
- Organismo
- Contrato
- Empresa
- Director
- Municipio

Canonical relationships:
- Organismo ADJUDICA Contrato
- Empresa GANA Contrato
- Empresa TIENE_DIRECTOR Director
- Municipio RECIBE Transferencia
- Contrato EJECUTA_EN Organismo

Mandatory provenance fields per record:
- source_name
- source_url
- source_fetched_at
- source_file_name
- source_checksum
- parse_version
- confidence_level

## Launch-Oriented Data Priorities (graph-first)
P0 (must-have before first publish):
1. Stable provider/company normalization for current Cordoba contracts.
2. Repeatable IGJ enrichment pipeline with measurable coverage.
3. Repeatable Neo4j projection with deterministic node and edge IDs.
4. Basic data quality report per run: rows ingested, duplicates filtered, entities resolved, graph nodes/edges created.

P1 (next):
1. Add budget execution connector if verified.
2. Add graph attributes for budget context (program, jurisdiction, period).

P2 (later):
1. Add transferencias PDF pipeline.
2. Add additional municipalities.

## Verification Checklist (for pending sources)
Before implementing any pending source:
1. Confirm official URL and long-term accessibility.
2. Confirm legal terms/license for reuse.
3. Capture a stable sample file and schema profile.
4. Define canonical mapping and confidence rules.
5. Add source-level tests and ingestion monitoring.

## Decision Log
- Decision: keep graph-first launch as product direction.
- Decision: do not ingest high-fragility sources until source verification passes.
- Decision: prioritize data quality and entity resolution over adding many new connectors.
