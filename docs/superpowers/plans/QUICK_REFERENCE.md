# Quick Reference: Data Layers Strategy
**Print this. Pin it.**

---

## The Problem in 30 Seconds

✗ **Now:** 2-5% hidden duplicate providers → Neo4j orphaned nodes on re-runs → No correlation patterns → Graph-first product blocked

✓ **Goal (May 25):** Zero duplicates + deterministic Neo4j + 5 correlation patterns + graph renders <200ms

---

## The Solution: 3 Layers

### Layer 1: Clean Data (Weeks 1-2)
```
Providers:   500 → deduplicate → 480 (UUID-based, deterministic)
Coverage:    60% → enrich AFIP → 95%
Provenance:  0% → track sources → 100% lineage
```
**Key:** All old data gets UUID + source origin retroactively

### Layer 2: Stable Neo4j (Week 3)
```
Node IDs:    Sequential (1,2,3) → UUID (deterministic)
Re-runs:     Orphaned duplicates → Zero orphans (same ID = same node)
Constraints: None → Uniqueness + indexes (prevent accidents)
```
**Key:** UUID = f(canonical_name + cuit + source) = idempotent

### Layer 3: Correlation Patterns (Week 4)
```
5 patterns in Neo4j:
  1. Director Carousel (same person → 3+ providers → big spend)
  2. Shell Companies (1-2 contracts, high monto, no AFIP verification)
  3. Monopoly Networks (director controls >50% of category)
  4. Temporal Clustering (spending spikes unusual for provider)
  5. Cross-Muni Carousel (synchronized contracts across jurisdictions)

Scoring: 0-100 (high=risk), with evidence + recommendations
```
**Key:** Visible in /analizar response + landing graph

---

## The Execution: 5-Week Sprint

| Week | What | Owner | Risk |
|------|------|-------|------|
| **1** | Schema + entity_registry + backfill | Backend | Low |
| **2** | Normalization + dedup + AFIP | Backend | **MEDIUM** |
| **3** | Neo4j refactor + deterministic IDs | Backend | **HIGH** |
| **4** | Correlation patterns | Backend | **MEDIUM** |
| **5** | Validation + launch gate | QA + Product | Low |

**Critical Path:** Week 2 → Week 3 (depends on Week 2 dedup quality)

---

## New Tables (Schema)

```sql
-- Canonical entities (single source of truth)
CREATE TABLE entity_registry (
  entity_id TEXT PRIMARY KEY,     -- UUID (deterministic)
  entity_type TEXT,               -- 'provider' | 'director' | 'area'
  canonical_name TEXT,
  source_primary TEXT,            -- which source found this first
  confidence_level DECIMAL,       -- 0-1 (AFIP=0.95, IGJ=0.85, contracts=0.6)
  resolution_status TEXT,         -- 'canonical' | 'merged' | 'uncertain'
  metadata_json JSON              -- {sources: [...], conflicts: [...]}
);

-- All data provenance (complete audit trail)
CREATE TABLE provenance (
  id TEXT PRIMARY KEY,
  table_name TEXT,               -- which table this field comes from
  record_id TEXT,                -- FK to original record
  entity_id TEXT FK,             -- which canonical entity this belongs to
  field_name TEXT,               -- 'nombre', 'cuit', etc
  source_value TEXT,             -- original value from source
  source_name TEXT,              -- 'cordoba_capital_2023', 'igj_2026q1'
  extracted_at TIMESTAMP,
  extraction_method TEXT,        -- 'api_rest', 'xlsx_parse', 'ocr', 'manual'
  confidence_score DECIMAL       -- 0-1 extraction quality
);
```

---

## New Neo4j Strategy

```cypher
-- BEFORE: Sequential IDs (breaks on re-run)
CREATE (p:Provider {id: 1, name: "ACME"})

-- AFTER: UUID-based (deterministic & idempotent)
MERGE (p:Provider {entity_id: "6f4d8e2a-...", canonical_name: "ACME"})
ON CREATE SET p.source = "contracts", p.created_at = timestamp()
ON MATCH SET p.verified_count = coalesce(p.verified_count, 0) + 1

-- CONSTRAINT: Prevent accidental duplicates
CREATE CONSTRAINT unique_provider_entity_id FOR (p:Provider) REQUIRE p.entity_id IS UNIQUE
```

---

## New Signals: Corruption Patterns

**Detection happens in Neo4j (graph queries):**

```cypher
-- Pattern A: Director Carousel (3+ providers, same director, big spend)
MATCH (d:Director)-[:DIRECTS]->(p:Provider)-[:HAS_CONTRACT]->(c:Contract)
WHERE ... total_spend > 100000000
RETURN d.name, count(DISTINCT p) provider_count, sum(c.monto) total_monto
→ Risk Score = (provider_count * total_monto) / baseline

-- Pattern B: Shell Companies (unverified, 1-2 contracts, high monto)
MATCH (p:Provider)-[:HAS_CONTRACT]->(c:Contract)
WHERE p.source = "contracts" AND NOT EXISTS(p.cuit) AND contract_count <= 2
→ Risk Score = 1 - verification_rate

-- Pattern C: Monopoly + Related Entities (>50% category spend)
[director_network controls category] → Risk Score = monopoly_pct

-- Pattern D: Temporal Clustering (spending spikes)
[high contracts in short window] → Risk Score = deviation_from_baseline

-- Pattern E: Cross-Muni Carousel (synchronized across municipalities)
[same director, 3+ cities, 6+ months] → Risk Score = coordination_evidence
```

**All patterns scored 0-100, displayed in expediente with evidence + recommendations**

---

## Key Decisions Already Made

| Decision | Why | Approved |
|----------|-----|----------|
| **UUIDs for node IDs** | Deterministic + idempotent re-runs | ✓ Data Architecture |
| **Confidence scores mandatory** | Distinguish verified vs inferred | ✓ Data Architecture |
| **5 correlation patterns (not unlimited)** | High ROI + maintainability | ✓ Engineering |
| **Graph-first product launch** | Real Neo4j data on day 1, not mock | ✓ Product |
| **Health endpoint public** | Transparency → user trust | ✓ Product |

---

## Blockers to Unblock First

1. **Entity resolution quality** (Week 2) — everything depends on this
2. **Neo4j deterministic IDs** (Week 3) — graph stability depends on this
3. **Correlation pattern accuracy** (Week 4) — product credibility depends on this

---

## Success: Before You Launch

- [ ] `curl http://localhost:3001/health/data-quality` → all ✓
- [ ] `npm run test:graph:determinism` → Run 1 == Run 2 == Run 3
- [ ] `/analizar` response includes `análisis_correlativo` section
- [ ] Graph renders 500 nodes in <200ms
- [ ] Top 3 correlation patterns manually reviewed + credible
- [ ] Provenance UI shows "Source: AFIP", "Source: Contracts", etc

---

## Handoff: Week 6 (Post-Launch)

- [✓ This week] Collect production data quality metrics
- [✓ This week] Monitor for false positives in patterns
- [Next] Refine correlation thresholds based on real data
- [Next] Add new municipality connector (already architected)
- [Next] Frontend: neural landing with graph interaction

---

## Reference Documents

| Doc | Purpose | Update Frequency |
|-----|---------|------------------|
| [2026-04-21-data-neo4j-corruption-pattern-plan.md](./2026-04-21-data-neo4j-corruption-pattern-plan.md) | **Comprehensive** 7-phase plan | Weekly |
| [2026-04-21-roadmap-executable.md](./2026-04-21-roadmap-executable.md) | **Task-level** assignments by week | Daily |
| [2026-04-21-entity-enrichment-assessment.md](./2026-04-21-entity-enrichment-assessment.md) | **Current state** audit (agent output) | Once |
| [2026-04-21-cordoba-source-registry-mvp.md](./2026-04-21-cordoba-source-registry-mvp.md) | **Data sources** with confidence levels | Once |

---

## Sprint Standup Template

**Monday 9am:**
- [ ] Blockers from last week?
- [ ] This week's critical path on track?
- [ ] Do we still hit May 25?

**Wednesday 2pm (midpoint):**
- [ ] Deliverable on track for Friday EOD?
- [ ] Quality concerns?
- [ ] Need to descope?

**Friday 4pm (sign-off):**
- [ ] Week complete? Sign me off.
- [ ] Next week kickoff ready?
- [ ] Carry-overs documented?

