# 7-Week Execution Roadmap: Data → Neo4j → Patterns → Frontend
**Start Date:** April 21, 2026  
**Graph-First Launch Gate:** May 25, 2026  
**Status:** Ready to execute

---

## Week 1: Data Audit & Schema Foundation (Apr 21-27)

### Day 1-2: Schema Audit (2 dev-days)
**Owner:** Data Lead  
**Deliverable:** `docs/audit/schema-gap-analysis.md`

- [ ] Run duplicate detection queries (quantify 2-5%)
- [ ] Find orphaned directors
- [ ] Check CUIT coverage %
- [ ] Identify all missing provenance columns
- [ ] Create baseline metrics CSV

**Test:**
```bash
npm run audit:schema  # Outputs report with numbers
```

---

### Day 3: Entity Registry Schema (1 dev-day)
**Owner:** Backend  
**Files to modify:** `backend/src/lib/db.ts`

- [ ] Add `entity_registry` table with UUID + confidence + provenance
- [ ] Add `provenance` table for data lineage
- [ ] Create migration script `backend/src/migrations/001-add-entity-registry.ts`
- [ ] Add indexes on `entity_id`, `source_primary`, `canonical_name`

**Test:**
```bash
npm run migrate:up
SELECT COUNT(*) FROM entity_registry;  # Should be 0 initially
```

---

### Day 4: Backfill Existing Data (1 dev-day)
**Owner:** Backend  
**Files to create:** `backend/src/scripts/backfill-entity-registry.ts`

- [ ] Generate UUIDs for all 500 providers (UUID5 deterministic)
- [ ] INSERT into entity_registry with source origin
- [ ] INSERT into provenance for all existing records
- [ ] Verify 100% backfill

**Test:**
```bash
npm run backfill:entity-registry
SELECT COUNT(*) FROM entity_registry;  # Should be ~500
SELECT COUNT(*) FROM provenance;  # Should be ~100k
```

---

### Day 5: Provider ID Refactor (1 dev-day)
**Owner:** Backend  
**Files to modify:** `backend/src/lib/db.ts`, `backend/src/scripts/seed-cordoba.ts`

- [ ] Add `entity_id` column to `providers` table
- [ ] Backfill from entity_registry
- [ ] Add FK constraint `providers.entity_id → entity_registry.entity_id`
- [ ] Update seed script to generate UUIDs on-insert

**Test:**
```bash
SELECT COUNT(DISTINCT entity_id) FROM providers;  # Should be < COUNT(*)
# Verify dedup count
```

---

## Week 2: Normalization & Deduplication (Apr 28-May 4)

### Day 1: Enhanced Normalization Function (1 dev-day)
**Owner:** Backend  
**Files to create:** `backend/src/lib/normalization.ts`

```typescript
// Implement with test suite (50+ cases)
export function normProveedor(name: string): string
export const normalizationTests: TestCase[] = [
  { input: 'ACME S.A.', expected: 'ACME' },
  // ... 49 more
]
```

- [ ] Handle diacritics (é → e)
- [ ] Handle punctuation & spacing
- [ ] Handle legal suffixes (S.A., LLC, etc)
- [ ] Handle OCR errors (0→O, 1→I)
- [ ] Handle common abbreviations

**Test:**
```bash
npm run test:normalization  # All 50+ cases pass
```

---

### Day 2: CUIT-Based Deduplication (1.5 dev-days)
**Owner:** Backend  
**Files to create:** `backend/src/scripts/deduplicate-providers.ts`

- [ ] Cluster by CUIT (primary)
- [ ] Cluster by normalized name (secondary)
- [ ] Calculate string similarity scores
- [ ] Mark canonical vs merged
- [ ] Update entity_registry.resolution_status
- [ ] Repoint contracts via UPDATE FK

**Output:**
```
Total duplicates found: X
Merged into Y canonical providers
Confidence: Z%
```

**Test:**
```bash
npm run dedupe:providers
# Verify: COUNT(DISTINCT entity_id) < COUNT(DISTINCT id)
```

---

### Day 3-4: Provider Enrichment with AFIP (1.5 dev-days)
**Owner:** Backend  
**Files to modify:** `backend/src/lib/afip.ts`, `backend/src/scripts/enrich-providers.ts`

- [ ] For each provider without CUIT, query AFIP
- [ ] Record confidence score (0.95 if exact match)
- [ ] INSERT/UPDATE entity_registry with source='afip'
- [ ] INSERT into provenance table
- [ ] Handle rate limits + timeouts

**Test:**
```bash
npm run enrich:afip 2023
# Check: SELECT COUNT(*) FROM entity_registry WHERE source_primary = 'afip'
```

---

### Day 5: Validation & Metrics (0.5 dev-day)
**Owner:** Data Lead  
**Deliverable:** `docs/audit/dedup-results.md`

- [ ] Duplicate rate now < 0.5%?
- [ ] CUIT coverage improved?
- [ ] Confidence distribution (high/med/low)?
- [ ] Success rate for AFIP enrichment?

---

## Week 3: Neo4j Stability & Constraints (May 5-11)

### Day 1-2: Neo4j Graph Model Refactor (2 dev-days)
**Owner:** Backend  
**Files to modify:** `backend/src/lib/graph.ts`, `backend/src/scripts/seed-neo4j.ts`

- [ ] Use `entity_id` (UUID) as PRIMARY identifier
- [ ] Change all node MERGE queries to use entity_id
- [ ] Add `ON CREATE` for first sync + metadata
- [ ] Add `ON MATCH` to accumulate verification counts
- [ ] Test all relationship types (HAS_CONTRACT, HAS_DIRECTOR, etc)

**Cypher example:**
```cypher
MERGE (p:Provider {entity_id: $entity_id})
ON CREATE SET p.created_at = timestamp(), p.source = $source_primary
ON MATCH SET p.verified_count = coalesce(p.verified_count, 0) + 1
```

**Test:**
```bash
npm run seed:neo4j -- --force
# Verify: MATCH (n) WHERE NOT n.entity_id RETURN count(n);  # Should be 0
```

---

### Day 3: Uniqueness Constraints (1 dev-day)
**Owner:** Backend  
**Files to create:** `backend/src/scripts/graph-constraints.cypher`

- [ ] CREATE CONSTRAINT unique_provider_entity_id
- [ ] CREATE CONSTRAINT unique_director_entity_id
- [ ] CREATE CONSTRAINT unique_contract_id
- [ ] CREATE INDEX idx_provider_canonical_name
- [ ] CREATE INDEX idx_contract_monto
- [ ] Run constraints validation script

**Test:**
```bash
npm run graph:validate-constraints
# SHOW CONSTRAINTS;  # All applied
```

---

### Day 4: Idempotency & Determinism (1 dev-day)
**Owner:** Backend  
**Files to create:** `backend/src/test/graph-determinism.test.ts`

- [ ] Run seed-neo4j 3 times
- [ ] Generate graph checksum after each run
- [ ] Assert checksums are identical
- [ ] Check for orphaned/duplicate nodes

**Test:**
```bash
npm run test:graph:determinism
# ✓ Run 1 == Run 2 == Run 3
```

---

### Day 5: Graph Validation Suite (1 dev-day)
**Owner:** Backend  
**Files to create:** `backend/src/scripts/graph-health-check.cypher`

- [ ] Count nodes by type (Provider, Director, Contract)
- [ ] Detect orphaned nodes (not connected)
- [ ] Verify all edges have sources
- [ ] Check constraint violations
- [ ] Calculate graph density metrics

**Test:**
```bash
npm run graph:health-check
# Output: { providers: 500, directors: 800, contracts: 10000, orphans: 0, ... }
```

---

## Week 4: Data Quality Observability (May 12-18)

### Day 1: Metrics Views (1 dev-day)
**Owner:** Backend  
**Files to create:** `backend/src/lib/quality-metrics.sql`

- [ ] vw_quality_coverage (verified %)
- [ ] vw_dedup_efficiency (duplicate reduction %)
- [ ] vw_confidence_distribution (high/med/low)
- [ ] vw_source_diversity (which sources contribute most)
- [ ] vw_orphaned_entities (quality issues)

**Test:**
```bash
SELECT * FROM vw_quality_coverage;
# Expected: pct_verified >= 95
```

---

### Day 2: Health Endpoint (1 dev-day)
**Owner:** Backend  
**Files to create/modify:** `backend/src/routes/health.ts`

Add GET `/health/data-quality` returning:
```json
{
  "timestamp": "2026-05-12T...",
  "coverage": { "total_contracts": 10000, "verified_pct": 96.2, "status": "✓ PASS" },
  "deduplication": { "original": 500, "canonical": 480, "dedup_pct": 4, "status": "✓ GOOD" },
  "confidence": { "high": 350, "medium": 120, "low": 10 },
  "neo4j_sync": { "last_sync": "...", "orphan_nodes": 0, "status": "✓ OK" }
}
```

**Test:**
```bash
curl http://localhost:3001/health/data-quality
# All "status" fields should be ✓
```

---

### Day 3-4: Correlation Pattern Detection (2 dev-days)
**Owner:** Backend  
**Files to create:** `backend/src/engine/correlation-patterns.ts`

Implement 5 patterns:
1. **Director Carousel** - same person directs competing providers
2. **Shell Companies** - new companies with 1-2 big contracts then disappear
3. **Monopoly + Related Entities** - director network controls category
4. **Temporal Clustering** - unusual spending spikes
5. **Cross-Municipality Carousel** - synchronized contracts across jurisdictions

**For each pattern:**
- [ ] Cypher query
- [ ] Scoring function (0-100)
- [ ] Evidence collection
- [ ] Recommendation generation

**Test:**
```bash
npm run test:patterns:director_carousel -- 2023
# Expected: {pattern_type, score, entities, evidence, recommendation}
```

---

### Day 5: Correlation Integration (1 dev-day)
**Owner:** Backend  
**Files to modify:** `backend/src/routes/analizar.ts`

- [ ] Call detectCorrelationPatterns() in /analizar endpoint
- [ ] Merge with existing rule-based signals
- [ ] Add "análisis_correlativo" section to response
- [ ] Rank all signals by score (combined)

**Test:**
```bash
curl -X POST http://localhost:3001/analizar \
  -d '{"municipio_id":"córdoba", "desde":"2023-01-01", "hasta":"2023-12-31"}'

# Response should include:
# {
#   "señales": [..., {pattern_type: "director_carousel", score: 85, ...}],
#   "análisis_correlativo": { score: 72, patterns_detected: 3 }
# }
```

---

## Week 5: Validation & QA (May 19-25)

### Day 1: Full Test Suite (1.5 dev-days)
**Owner:** QA  
**Files:** `backend/tests/`

```bash
npm run test:normalization         # 50+ cases
npm run test:patterns:*            # All 5 patterns
npm run test:pipeline:2023         # Single year
npm run test:pipeline:2019-2023    # Multi-year
npm run test:graph:determinism     # 3x consistency
npm run test:e2e:production        # Against real data
```

- [ ] All tests passing
- [ ] No warnings or skip()'d tests
- [ ] Coverage >= 85%

---

### Day 2: Data Quality Sign-Off (0.5 dev-day)
**Owner:** Data Lead  
**Deliverable:** `docs/audit/data-quality-sign-off.md`

- [ ] Provider duplicate rate: ✓ < 0.5%
- [ ] Entity coverage: ✓ >= 95%
- [ ] Provenance: ✓ 100% tracked
- [ ] Neo4j consistency: ✓ zero orphans post 3x re-run
- [ ] Confidence distribution: ✓ >= 70% high+medium
- [ ] Correlation patterns: ✓ 5+ working
- [ ] Health endpoint: ✓ all checks passing

---

### Day 3: Documentation (1 dev-day)
**Owner:** Technical Writer  
**Files:**
- `docs/runbooks/daily-ingestion-troubleshooting.md`
- `docs/runbooks/investigate-corruption-pattern.md`
- `docs/data-dictionary.md`
- `docs/frontend-data-contract.md`

---

### Day 4: Graph-First Launch Gate Validation (0.5 dev-day)
**Owner:** Product + Engineering  
**Checklist:**

- [ ] Landing page can query graph snapshot
- [ ] Neo4j renders 500+ nodes < 200ms
- [ ] Data comes from production (not mock)
- [ ] All correlation patterns visible in UI
- [ ] Confidence scores displayed
- [ ] Provenance traceable via UI

---

### Day 5: Go-Live (1 dev-day)
**Owner:** DevOps + Product

- [ ] Deploy v2 to production Railway
- [ ] Trigger daily ingestion workflow
- [ ] Monitor health endpoint for 24h
- [ ] Graph-first product launch announced

---

## Critical Path (Must Complete Before Gate)

```
Week 1: Schema audit → Entity registry + backfill
  ↓
Week 2: Normalization + dedup + AFIP enrichment
  ↓
Week 3: Neo4j refactor + deterministic IDs + constraints
  ↓
Week 4: Quality metrics + health endpoint + correlation patterns
  ↓
Week 5: Full validation + sign-off + production launch
```

**Slack:** ~3-5 days (Apr 28-May 4 has highest risk; can slip to May 11)

---

## Resource Requirements

| Role | Weeks | Notes |
|------|-------|-------|
| Backend Engineer | 4.5 | Core implementation |
| Data Lead | 1.5 | Audit + validation |
| QA | 1 | Test suite + sign-off |
| DevOps | 0.5 | Production deployment |
| Tech Writer | 1 | Docs |
| **Total** | **8.5 dev-weeks** | ~2 FTE at full time |

---

## Risk & Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|-----------|
| Entity resolution harder than estimated | Medium | Week 1-2 slip | Start Week 1 early; consider contracted data-cleaning if needed |
| Neo4j constraints cause re-runs to fail | Low | Critical blocker | Build in Week 3 validation; automated reconciliation tests |
| Correlation patterns have false positives | Medium | Credibility hit | Manual review of top 50; adjust thresholds |
| AFIP API rate limits / downtime | Low | Defers enrichment | Graceful fallback; use cached CUIT data |
| Production graph too large (>1000 nodes) | Low | Frontend latency | Implement streaming/pagination; start with subset |

---

## Success Criteria (Hard Targets)

| Metric | Current | Target | Date |
|--------|---------|--------|------|
| Duplicate rate | 2-5% | <0.5% | May 4 |
| Verified provider coverage | ~60% | >= 95% | May 4 |
| Provenance tracking | 0% | 100% | Apr 27 |
| Neo4j orphaned nodes | ~5-10 | 0 | May 11 |
| Correlation patterns (real data) | 0 | >= 30 | May 18 |
| Health endpoint all checks | No | Yes | May 18 |
| Graph render latency | N/A | < 200ms | May 25 |
| Production launch | No | Yes | May 25 |

---

## Weekly Sync Topics

- **Monday:** Week kickoff + blockers
- **Wednesday:** Midpoint check (50% complete?)
- **Friday:** Sign-off + next week prep

---

## Decision Log

- **UUID over sequential IDs:** Deterministic + idempotent graph syncs
- **5 correlation patterns (not more):** High ROI + maintainability
- **Confidence scoring mandatory:** Distinguish verified vs inferred data
- **Health endpoint public:** Transparency + observability

