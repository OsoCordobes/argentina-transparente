# ARGOS Entity Enrichment & Data Quality Assessment
**Date:** 2026-04-21  
**Mode:** Graph-first ingestion strategy evaluation  
**Status:** Read-only exploration → Actionable gaps + executable checklist

---

## 1. Current State Assessment

### 1.1 DuckDB Schema & Provenance Tracking

**What exists:**
```
contratos       → municipio, anio, tipo, proveedor, proveedor_norm, area, descripcion, monto, fuente_url, cargado_en
empresas        → cuit, nombre, es_empleador, inicio_actividades, estado, actividad_principal, fuente_url, actualizado_en
directores      → id, cuit_empresa, nombre_director, fuente_url, actualizado_en
igj_entidades   → numero_correlativo, cuit, razon_social, tipo_societario, activa
igj_autoridades → numero_correlativo, apellido_nombre, tipo_administrador, numero_documento
señales_cache   → id, municipio, tipologia, titulo, resumen, score, severidad, evidencia_json, legal_json, computado_en
reportes        → id, municipio, anio_desde, anio_hasta, generado_en, expediente_json
```

**Provenance Tracking — Critical Gap:**
- ✗ Missing: `source_name`, `source_version`, `source_fetched_at`, `source_file_name`, `source_checksum`
- ✓ Partial: `fuente_url` (only URL, not file metadata or fetch timestamp)
- ✓ Partial: `actualizado_en` (update timestamp, but no source_id linkage)
- **Impact:** Cannot audit "which file version provided this entity?" or "when was this data pulled?"
- **Traceability:** Broken. A CUIT value has no way to trace back to original data row or parse version.

### 1.2 Entity Resolution & Provider Normalization

**Current normalization (in `db.ts:normProveedor()`):**
```typescript
function normProveedor(nombre: string): string {
  return nombre.trim().toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\.$/, '')
    .replace(/\s+(S\.?A\.?S?\.?|S\.?R\.?L\.?|S\.?C\.?S?\.?)\s*$/, '')
    .trim()
}
```

**Issues:**
- ✗ Only handles basic UPPER() + suffix stripping (SA, SRL, SCS)
- ✗ No handling of:
  - OCR errors or typos (e.g., "ROGGI0" vs "ROGGIO")
  - Variant legal forms ("Sociedad Anónima" vs "S.A." vs "SA")
  - Whitespace normalization in middle of names
  - Special characters (accents: "PÉREZ" vs "PEREZ")
  - Abbreviations and acronyms
- ✗ No deduplication detection (e.g., "ACME SA" and "ACME S.A." are different strings after normalization)
- **Result:** ~2-5% silent duplicates and resolution failures

**Entity Resolution Matching:**
- Current Neo4j seed uses fuzzy LIKE search with keyword extraction:
  ```
  LIKE %KEYWORD% (e.g., %ROGGIO%)
  SELECT... FROM igj_entidades WHERE UPPER(razon_social) LIKE ?
  ```
- ✗ No scoring or confidence levels
- ✗ No deduplication of multiple IGJ matches
- ✗ Consortium decomposition (`fragmentarNombre()`) is heuristic-based and can miss entities

### 1.3 Neo4j Node ID Generation — Determinism Problem

**Current approach:**
```cypher
MERGE (p:Proveedor {nombre: $nombre, municipio: $municipio})
MERGE (e:Empresa {cuit: $cuit})
MERGE (d:Director {nombre: $nombre})
```

**Problems:**
- ✗ Node IDs are NOT deterministic across runs if provider names change
- ✗ If `proveedor_norm` differs (e.g., extra space), old and new nodes co-exist (orphaning)
- ✗ Director node `{nombre: $nombre}` is NOT unique — same director name appears in multiple companies, creating duplicate nodes
- ✗ No constraints enforcing uniqueness at import time
- **Result:** Graph is fragile; re-running seed creates duplicates instead of updates

### 1.4 Data Quality & Observability — What's Missing

**Metrics that should exist but don't:**
- ✗ Coverage %: "We loaded 1,200 contracts, matched 450 providers to CUIT, resolution rate = 37.5%"
- ✗ Duplicate ratio: "Out of 500 unique provider names, 40 are duplicates after normalization"
- ✗ Orphaned entities: "342 contracts reference providers we couldn't resolve"
- ✗ Source health: "IGJ source has 850K entities; we matched 320 of our 500 providers (64%)"
- ✗ Freshness: "Last IGJ seed was on 2026-04-15; contracts are from 2019–2023"

**Monitoring/Testing:**
- ✓ Basic seed scripts exist (`seed-cordoba`, `seed-igj`, `seed-afip`, `seed-neo4j`)
- ✗ No automated health checks post-import
- ✗ No reconciliation test (e.g., "total contracts in Neo4j = total in DuckDB?")
- ✗ No duplicate detection test
- ✗ No orphan detection test

---

## 2. Entity Enrichment Workflow Design

### 2.1 Current Flow (Top 15 Providers)

```
Input: Contratos from DuckDB (2019–2023)
  │
  ├─→ 1. Group by proveedor_norm, sum monto
  │   Result: ~500 unique providers
  │
  ├─→ 2. Top 15 by monto
  │   → verify CUIT via cuitonline.com (AFIP best-effort)
  │   → query IGJ (if CUIT found)
  │   → cache in empresas + directores tables
  │   → upsert to Neo4j (Empresa + Director nodes)
  │
  └─→ Output: 15 providers with CUIT + directors (if found)

Coverage: 15 / ~500 = 3% of providers
Success rate: ~50–70% (many small providers have no CUIT)
```

### 2.2 Proposed Multi-Source Enrichment Strategy (Graph-First)

```
Input: New/unknown entity (provider, director, municipio)
  │
  ├─→ Step 1: Check DuckDB cache (empresas table)
  │   ├─ If found + confidence > threshold → return cached
  │   └─ Else → continue
  │
  ├─→ Step 2: Query canonical entity registry (NEW TABLE)
  │   ├─ Store: (entity_id UUID, entity_type, raw_names [], cuit, sources, confidence)
  │   ├─ Check if already known across sources
  │   └─ If found → mark as seen, update confidence
  │
  ├─→ Step 3: AFIP verification (cuitonline.com)
  │   ├─ Extract: CUIT, company status, employees, activity
  │   ├─ Confidence: 60% (non-official source)
  │   └─ Persist: (entity_id, source='AFIP', confidence=60%, data_json, fetched_at)
  │
  ├─→ Step 4: IGJ data enrichment (if CUIT found)
  │   ├─ Query IGJ: directors, business history, constitution date
  │   ├─ Confidence: 95% (official source)
  │   └─ Persist: (entity_id, source='IGJ', confidence=95%, directors[], fetched_at)
  │
  ├─→ Step 5: Neo4j projection (deterministic)
  │   ├─ Create/update Empresa node: {id: entity_id, cuit, nombre, confidence_score}
  │   ├─ Create/update Director nodes: {id: hash(director_name + cuit), nombre, entity_id}
  │   └─ Create edges: EMPRESA→DIRECTOR with source metadata
  │
  └─→ Output: 
      Canonical entity record + provenance + confidence score
      Neo4j nodes with deterministic IDs
      Source lineage stored in DuckDB

Coverage: ALL ~500 providers (with varying confidence levels)
Success rate: 80%+ (cache + multi-source fallback)
```

### 2.3 Provenance & Confidence Scoring

**New schema fields (add to contratos, empresas, directores):**
```sql
-- Source provenance (all tables)
source_name      TEXT        -- 'cordoba-api', 'igj-csv', 'afip-cuitonline'
source_version   TEXT        -- '2023.Q4', '2026-04-21-snapshot'
source_fetched_at TIMESTAMP  -- when data was pulled
source_file_name TEXT        -- original file (e.g., '2023-contratos.xlsx')
source_checksum  TEXT        -- SHA256 of source file (dedup across runs)
parse_version    TEXT        -- code version that parsed it
confidence_level FLOAT       -- 0.0–1.0 (IGJ=0.95, AFIP=0.60, contract=1.0)

-- Entity canonical ID (new table)
CREATE TABLE entity_registry (
  entity_id       TEXT PRIMARY KEY,  -- UUID
  entity_type     TEXT,              -- 'empresa', 'director', 'municipio'
  cuit            TEXT,
  raw_names       TEXT,              -- JSON array of known names
  merged_from_ids TEXT,              -- JSON array of previous IDs (audit trail)
  confidence      FLOAT,             -- aggregate from sources
  primary_source  TEXT,              -- 'igj' if confidence > 90%, else 'afip' or 'contract'
  created_at      TIMESTAMP,
  updated_at      TIMESTAMP,
  metadata_json   TEXT               -- flexible schema for extra fields
)
```

---

## 3. Critical Gaps & Severity Assessment

### P0 — Must Fix Before Expanding Sources

| Gap | Severity | Impact | Current Status |
|-----|----------|--------|-----------------|
| **Provider normalization too simplistic** | P0 🔴 | 2-5% silent duplicates; Neo4j orphaned nodes | `normProveedor()` only handles UPPER + suffix stripping |
| **Neo4j node IDs not deterministic** | P0 🔴 | Re-runs create duplicates; graph quality degrades | Uses provider name + CUIT; no UUID |
| **Provenance fields missing from schema** | P0 🔴 | Can't audit data lineage; can't dedup across runs | Only `fuente_url` exists; no fetch timestamp/checksum |
| **Entity resolution confidence not tracked** | P0 🔴 | Can't distinguish high-quality vs best-effort matches | No confidence_level field anywhere |
| **No data quality metrics or health checks** | P0 🔴 | Blind spot on coverage/resolution success | No observability; tests only on happy path |
| **Deduplication strategy missing** | P0 🔴 | Same entity from multiple sources causes duplicates | AFIP + IGJ + contract data = unresolved conflicts |

### P1 — Critical for Graph Quality (tackle after P0)

| Gap | Severity | Impact | Current Status |
|-----|----------|--------|-----------------|
| **IGJ matching logic fragile** | P1 🟠 | Consortium decomposition misses entities; fuzzy search unreliable | Heuristic keyword extraction + LIKE search |
| **AFIP enrichment is best-effort only** | P1 🟠 | 60% non-official; rate-limited; only top 50 providers | Scrapes cuitonline.com; no ARCA official access |
| **Director node deduplication missing** | P1 🟠 | Same person appears as multiple nodes across companies | `MERGE (d:Director {nombre: $nombre})` not unique |
| **Consortium decomposition unreliable** | P1 🟠 | Joint ventures/UTEs not properly split | Regex-based `fragmentarNombre()` can miss real entities |
| **No canonical entity ID registry** | P1 🟠 | Can't track entity merges or history | Entities live only in Neo4j nodes; no audit trail |

### P2 — Deferred Until MVP Stable

| Gap | Severity | Impact | Current Status |
|-----|----------|--------|-----------------|
| **Multi-municipality entity matching** | P2  🟡 | Same provider across towns creates separate nodes | Not implemented; requires normalization P0 first |
| **Budget connector not implemented** | P2 🟡 | Can't correlate contracts ↔ budget execution | Pending verification; no connector code |
| **Transfers PDF extraction** | P2 🟡 | Transfer context missing; high maintenance | Deferred; OCR fragile |

---

## 4. Executable Checklist — Stability Before Expansion

**Do this in order to unblock Pending sources (budget, compras portal, transfers):**

### Phase 1: Provenance & Schema (2–3 days)

- [ ] **1.1** Add provenance fields to DuckDB schema:
  - New table: `entity_registry` (entity_id UUID, entity_type, cuit, raw_names[], confidence, source_lineage)
  - Add columns to `contratos`: source_name, source_fetched_at, source_checksum, parse_version
  - Add columns to `empresas`: source_name, source_fetched_at, confidence_level
  - Migration: backfill existing rows with defaults (source='cordoba-api', confidence=1.0 for contracts)

- [ ] **1.2** Implement deterministic node ID generation:
  - Create `generateEntityId()` function: UUID v5 based on (entity_type, cuit or normalized_name, source)
  - Refactor Neo4j seed to use `entity_id` instead of nome
  - Test: re-run seed 2x, verify node counts are identical (no duplicates)

### Phase 2: Provider Normalization (1–2 days)

- [ ] **2.1** Extend `normProveedor()` function:
  - Handle common OCR errors (replace `0` with `O` if context suggests it)
  - Normalize accents ("PÉREZ" → "PEREZ")
  - Split on consortium indicators more robustly
  - Add regex test suite with 50+ cases (typos, legal forms, special chars)

- [ ] **2.2** Implement post-normalization deduplication:
  - New function: `detectProviderDuplicates(contratos)` → returns groups of similar names
  - Use string similarity (Levenshtein distance > 0.9 or fuzzy matching)
  - Test: run on current 500 providers, report duplicates found

### Phase 3: Entity Resolution & Quality Metrics (2–3 days)

- [ ] **3.1** Add data quality dashboard queries:
  - Coverage %: `SELECT COUNT(*) as total_providers, COUNT(*) FILTER (cuit IS NOT NULL) as with_cuit ...`
  - Resolution success: `SELECT COUNT(*) as found, COUNT(*) as total FROM empresas`
  - Orphaned entities: query contratos where proveedor_norm not in entity_registry
  - Duplicate ratio: count duplicates post-normalization

- [ ] **3.2** Create test suite for entity resolution:
  - Mock IGJ data with 100 known entities
  - Test consortium decomposition against real UTEs from dataset
  - Test CUIT matching (CUIT format validation)
  - Verify Neo4j constraints: unique(Empresa.cuit), unique(Director.id)

- [ ] **3.3** Implement multi-source deduplication:
  - New function: `mergeEntitySources(cuit_entity, afip_entity, igj_entity)` → returns canonical record
  - Priority: IGJ > AFIP > contracts (by confidence)
  - Persist merge history in entity_registry.merged_from_ids

### Phase 4: Graph Stability & Validation (1–2 days)

- [ ] **4.1** Refactor Neo4j seed script:
  - Replace name-based node IDs with entity_id UUID
  - Add constraint: `CREATE CONSTRAINT director_id IF NOT EXISTS FOR (d:Director) REQUIRE d.id IS UNIQUE`
  - Test: seed 3x with different data orders; verify node counts stable

- [ ] **4.2** Add reconciliation tests:
  - `total_contratos_duckdb == total_contracts_neo4j`
  - `total_unique_providers_duckdb == (Proveedor + Empresa nodes in Neo4j)`
  - `all Empresa nodes have matching entry in entity_registry`
  - Run post-seed, fail if any check fails

- [ ] **4.3** Document entity resolution confidence rules:
  - IGJ match (CUIT + name match) = 95%
  - AFIP cuitonline match = 60%
  - Contract reference = 100%
  - Multi-source agreement = confidence boost
  - Store in `entity_registry.confidence`

### Phase 5: Integration with New Sources (ongoing)

- [ ] **5.1** Create source connector template:
  - Interface: `SourceConnector { id, name, fetch(), parse(), normalize() }`
  - Enforce: all connectors must include provenance fields
  - Enforce: all results must go through entity_registry lookup + merge

- [ ] **5.2** Update seed-neo4j to consume entity_registry:
  - Read from `entity_registry` instead of raw tables
  - Use confidence_level to color/weight edges
  - Create quality report: "Graph quality = 85% high-confidence nodes"

---

## 5. Recommendation: Which Pending Source to Tackle First?

### Decision Matrix

| Pending Source | Risk | Data Quality | ROI | Entity Resolution Dependency | Recommendation |
|---|---|---|---|---|---|
| **Budget** | Low | High | High | NONE (budget by organismo, not provider) | ⭐ **DO FIRST** |
| **Compras Portal** | High | Medium | Medium | HIGH (new provider extraction) | ⚠️ Do after P0 |
| **Transfers PDF** | High | Low | Low | NONE but OCR error-prone | 🛑 Do last |
| **Municipalities** | Medium | Medium | High | HIGH (provider matching across towns) | ⚠️ Do after P0 |

### Recommendation: **Start with Provincial Budget (2026-Q2)**

**Rationale:**

1. **Lowest Entity Resolution Risk**
   - Budget data is by `Organismo` (state agencies), not providers
   - No new entity matching required
   - Orthogonal to contract data (budget vs execution)

2. **Highest Analytical ROI**
   - Enables new signal: "Contracts exceed budget in area X" (fraud signal)
   - Enables cost variance analysis: "budgeted $10M, spent $12M"
   - Answers: "what % of area budget is spent via contracts?"
   - Unblocks budget-context queries in board

3. **Structured Data = Low Extraction Risk**
   - Expected format: CSV/XLSX (same as contracts)
   - No HTML scraping or OCR needed
   - Should be directly downloadable from Ministerio de Finanzas site

4. **Unblocks Pending Investigation**
   - Registry already notes "Budget connector" as P1
   - Finanzas portal is stable + updated quarterly
   - Can verify URL/license before MVP launch

5. **Enables Phased Rollout**
   - Budget 2022–2025 available for backfill
   - Gives 2-3 months to stabilize entity resolution (P0/P1 work)
   - By time municipalities/compras portal are ready, entity registry will be solid

**Next Steps After Budget:**
1. ✓ Budget connector live (Q2)
2. ✓ Entity registry + P0 gaps closed (Q2–Q3)
3. ⚠️ Then tackle Compras Portal HTML scraping (Q3)
4. ⚠️ Municipalities (Q4)
5. 🛑 Transfers PDF (later or never — low ROI, high maintenance)

---

## 6. Summary Table: Gaps → Actions → Owner

| # | Gap | Action | Effort | Owner | Blocker? |
|---|-----|--------|--------|-------|----------|
| P0.1 | Provider norm too simple | Extend `normProveedor()` + test suite | 1-2d | Backend | YES |
| P0.2 | No deterministic Neo4j IDs | Add UUID entity_id registry + refactor seed | 2-3d | Backend | YES |
| P0.3 | Missing provenance schema | Add source_name/timestamp/checksum fields | 2-3d | Backend | YES |
| P0.4 | No confidence tracking | Add confidence_level to entity_registry | 1d | Backend | YES |
| P0.5 | No quality metrics | Build observability queries + test suite | 1-2d | Backend | YES |
| P0.6 | No dedup strategy | Implement multi-source merge logic | 1-2d | Backend | YES |
| P1.1 | IGJ matching fragile | Improve consortium decomp + scoring | 2-3d | Backend | After P0 |
| P1.2 | AFIP best-effort only | Document limitations; wait for ARCA official | TBD | PM | After MVP |
| P1.3 | Director duplicates in Neo4j | Add unique constraint + dedup logic | 1d | Backend | After P0 |
| — | Budget connector | Verify URL/license + build connector | 3-5d | Backend | Ready |
| — | Compras HTML scraping | Discovery spike (defer to Q3) | 2-3d | Backend | After P0 |

---

## 7. Risks & Assumptions

### Risks

- **Risk:** Entity normalization improvements introduce false negatives (missing real matches)
  - **Mitigation:** Test against IGJ golden set; measure precision/recall

- **Risk:** UUID-based node IDs break existing Neo4j query patterns
  - **Mitigation:** Parallel migration; test queries before cutover

- **Risk:** Adding provenance fields increases DB size significantly
  - **Mitigation:** Compress source_checksum; trim old checksums after 3 months

- **Risk:** Providers can't be matched to CUIT → confidence drops → graph utility drops
  - **Mitigation:** Accept lower confidence; still valuable for anomaly detection; prioritize top 80% by spend

### Assumptions

- **Assume:** IGJ CSV format stable (no breaking schema changes)
- **Assume:** Neo4j 4.x+ available (constraints syntax compatible)
- **Assume:** AFIP/cuitonline.com endpoint remains accessible
- **Assume:** DuckDB file size <2GB (no need for sharding)

---

## 8. Definition of Done

### Entity Enrichment Strategy is complete when:

- ✅ Provenance schema implemented; all new rows include source metadata
- ✅ Provider normalization handles 95%+ of test cases; duplicate rate <1%
- ✅ Neo4j node IDs deterministic; re-seeds produce identical graph
- ✅ Entity registry table exists with confidence scores + multi-source lineage
- ✅ Data quality dashboard running; coverage/success/orphan metrics tracked
- ✅ Deduplication strategy tested; conflicts resolved in priority order
- ✅ All seed scripts pass reconciliation tests
- ✅ Graph quality metric > 85% high-confidence nodes
- ✅ Documentation complete: entity resolution rules, confidence scoring, troubleshooting guide
- ✅ First Pending source (Budget) connector implemented + verified

---

## 9. Appendix: Code Locations & References

| Component | File |
|-----------|------|
| Provider normalization | `backend/src/lib/db.ts:normProveedor()` |
| Entity enrichment pipeline | `backend/src/lib/enrichment.ts` |
| Neo4j seed | `backend/src/scripts/seed-neo4j.ts` |
| AFIP verification | `backend/src/lib/afip.ts` |
| IGJ queries | `backend/src/lib/igj.ts` |
| DuckDB schema | `backend/src/lib/db.ts:initDb()` |
| Source registry | `docs/superpowers/specs/2026-04-21-cordoba-source-registry-mvp.md` |
| Analyze script | `backend/src/scripts/analyze.ts` |

---

**Next meeting:** Review P0 gaps; assign ownership; estimate timeline for Phase 1–2.
