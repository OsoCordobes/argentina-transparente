# Data → Neo4j → Corruption Patterns — Comprehensive Execution Plan
**Date:** 2026-04-21  
**Status:** Ready for execution  
**Scope:** Close data quality gaps → stabilize Neo4j graph → implement correlation-based pattern detection  
**Timeline:** 6-8 weeks (April 21 — June 10)  
**Prerequisite:** Source Registry v0 + Entity Enrichment Assessment complete

---

## Problem Statement

### Current Situation
- **Entity Resolution Broken:** 2-5% provider duplicates (silent), director relationships fragmented
- **Neo4j Unstable:** Non-deterministic node IDs → orphaned entities on re-runs
- **Provenance Lost:** No source lineage tracking → unauditable graph
- **Pattern Detection Absent:** 8 rule-based signals exist; but NO correlation/relationship-based fraud detection
- **Graph-First Product Blocked:** Cannot launch with degraded entity data

### Why This Matters
1. **Audit Trail:** Every entity decision must be traceable to source
2. **Deduplication:** Same provider appearing as 3+ nodes breaks network analysis
3. **Director Network:** Cross-company director connections are invisible
4. **Fraud Detection:** Corruption patterns (shell companies, carousel schemes) invisible without clean graph
5. **Confidence:** If we don't trust the data, we can't claim to detect anything

### Success Criteria
- ✅ Zero orphaned Neo4j entities post-re-run
- ✅ All providers matched across sources with confidence score
- ✅ 100% provenance tracking (source, timestamp, checksum)
- ✅ 5+ correlation-based pattern detectors (beyond rule-based signals)
- ✅ Graph query latency <200ms for landing page snapshot
- ✅ All results reproducible from raw source data

---

## Phase 0: Data Problem Definition & Audit (2 days)

### 0.1 Schema Audit
**Deliverable:** Detailed audit document of current schema gaps

```
DuckDB Tables Current State:

contracts
├─ id, tipo_contrato, descripcion, monto_final, fecha_firma
├─ proveedor_id (FK → providers)
├─ municipio_id
├─ estado_id
├─ ✗ MISSING: source_name, source_checksum, confidence_level
├─ ✗ MISSING: provenance_json (raw parsed fields)

providers
├─ id, nombre_normalizado, razon_social
├─ cuit (optional, inconsistent)
├─ ✗ MISSING: entity_id (UUID canonical)
├─ ✗ MISSING: source_origin (which source found this?)
├─ ✗ MISSING: discovered_at, last_verified_at
├─ ✗ MISSING: confidence_scores (AFIP, IGJ, contract history)

directors
├─ id, nombre, empresa_id
├─ ✗ MISSING: source_origin (IGJ vs inference)
├─ ✗ MISSING: canonical_director_id
├─ ✗ MISSING: relationship_confidence
```

**Action:** Run query against actual schema:
```sql
-- Quantify duplicates
SELECT nombre_normalizado, COUNT(*) cnt
FROM providers
GROUP BY nombre_normalizado
HAVING cnt > 1
ORDER BY cnt DESC LIMIT 50;

-- Find orphaned directors
SELECT COUNT(*) orphaned
FROM directors d
LEFT JOIN providers p ON d.empresa_id = p.id
WHERE p.id IS NULL;

-- Check provenance coverage
SELECT COUNT(CASE WHEN cuit IS NULL THEN 1 END) no_cuit_count
FROM providers;
```

**Outcome:** Quantified duplicate/orphan count; identified missing columns

---

### 0.2 Source Fragmentation Audit
**Deliverable:** Map of provider discovery sources and conflict resolution rules

| Provider | Found in Contracts | Found in IGJ | Found in AFIP | CUIT Match? | Recommendation |
|----------|-------------------|-------------|---------------|------------|---|
| ACME S.A. | YES (3 variants) | YES (formal) | YES | ✓ | Merge to canonical |
| Shell Corp | YES (1 record) | NO | NO | ✗ | Flag as unverified |
| Director Corp | NO (inferred) | YES (director only) | NO | ? | Requires investigation |

**Action:** Manual spot-check of 20-30 providers to identify normalization failures

**Outcome:** Concrete examples of what breaks (accents, LLC vs S.A., abbreviations, etc.)

---

## Phase 1: Entity Registry & Provenance Schema (3-4 days)

### 1.1 New Tables: Entity Registry

```sql
-- Canonical entity registry (single source of truth)
CREATE TABLE entity_registry (
  entity_id TEXT PRIMARY KEY,  -- UUID
  entity_type TEXT,            -- 'provider' | 'director' | 'municipal_area'
  canonical_name TEXT,         -- authoritative name
  
  -- Source provenance
  source_primary TEXT,         -- 'contracts' | 'igj' | 'afip' | 'budget'
  discovered_at TIMESTAMP,
  last_verified_at TIMESTAMP,
  
  -- Confidence & status
  confidence_level DECIMAL,    -- 0.0-1.0 (AFIP=0.95, IGJ=0.85, contracts=0.6)
  resolution_status TEXT,      -- 'canonical' | 'merged' | 'uncertain' | 'orphaned'
  
  -- Deduplication metadata
  merge_parent_id TEXT,        -- if merged, points to canonical
  alternate_names TEXT[],      -- ['ACME', 'ACME S.A.', 'ACME SA']
  
  -- Audit trail
  created_by TEXT,             -- 'seed:contracts' | 'enrich:afip' | 'merge:manual'
  metadata_json JSON,          -- {sources: [...], conflicts: [...], notes: "..."}
  
  INDEX idx_canonical_name ON canonical_name,
  INDEX idx_source_primary ON source_primary
);

-- Source provenance for each data point
CREATE TABLE provenance (
  id TEXT PRIMARY KEY,
  table_name TEXT,             -- 'contracts' | 'providers' | 'directors'
  record_id TEXT,              -- FK to original record
  entity_id TEXT,              -- FK to entity_registry
  
  field_name TEXT,             -- 'nombre', 'cuit', 'razon_social'
  source_value TEXT,           -- original value from source
  source_name TEXT,            -- 'cordoba_capital_2023' | 'igj_2026q1'
  extracted_at TIMESTAMP,
  extraction_method TEXT,      -- 'api_rest' | 'xlsx_parse' | 'ocr' | 'manual'
  
  confidence_score DECIMAL,    -- 0-1, extraction quality
  validation_status TEXT,      -- 'unvalidated' | 'verified' | 'conflict'
  
  INDEX idx_entity_id ON entity_id,
  INDEX idx_source_name ON source_name,
  FOREIGN KEY (entity_id) REFERENCES entity_registry(entity_id)
);
```

**Action:** Apply schema migration (add columns to existing tables + create new tables)

### 1.2 Provider ID Refactor

**Current:**
```
providers.id = AUTO_INCREMENT (1, 2, 3, ...)
```

**New:**
```
providers.entity_id = UUID (6f4d8e2a-..., deterministic from {name, cuit, source})
providers.local_id = keep for backward compat

-- Deterministic UUID generation
entity_id = UUID5(
  namespace=NAMESPACE_PROVIDER,
  name = normalize(name) + ':' + (cuit OR source)
)
```

**Why:** Re-running ingestion produces same UUID → Neo4j can match/update nodes instead of creating duplicates

**Action:** 
1. Generate UUIDs for existing 500 providers
2. Add column, backfill
3. Update FK relationships in contracts/directors

### 1.3 Backtrace Existing Data

**Action:** Retroactively populate `provenance` table for existing records:
```sql
-- For each contract, record which XLSX file it came from
INSERT INTO provenance (...)
SELECT 
  uuid_generate_v4(),
  'contracts' table_name,
  contracts.id,
  entity_registry.entity_id,
  'monto_final' field_name,
  contracts.monto_final source_value,
  'cordoba_capital_2023' source_name,
  NOW() extracted_at,
  'xlsx_parse' extraction_method,
  0.9 confidence_score,  -- XLSX parse generally reliable
  'verified' validation_status
FROM contracts
JOIN providers ON contracts.proveedor_id = providers.id
JOIN entity_registry ON providers.entity_id = entity_registry.entity_id;
```

**Deliverable:** Full provenance trail for all existing records

---

## Phase 2: Provider Normalization & Deduplication (2-3 days)

### 2.1 Enhanced Normalization Function

**Current (too simple):**
```typescript
const normProveedor = (name: string) => 
  name.toUpperCase()
    .replace(/ S\.?A\.?$|INC|LLC/g, '')
    .trim();
```

**Enhanced (aggressive):**
```typescript
const normProveedor = (name: string): string => {
  // 1. Diacritics
  let n = name.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  
  // 2. Punctuation & spacing
  n = n.replace(/[.,;:\-–—]/g, ' ')
       .replace(/\s+/g, ' ')
       .trim()
       .toUpperCase();
  
  // 3. Legal suffixes (preserve for now, deduplicate in service layer)
  const suffixes = ['S.A.', 'SA', 'LLC', 'INC', 'LTDA', 'SRL', 'SP', 'SAIC', 'SCA'];
  suffixes.forEach(s => n = n.replace(new RegExp(`\\s${s}$`), ''));
  
  // 4. Common abbreviations
  const abbrev = {
    'Y CIA': ' Y COMPANIA',
    'HNOS': ' HERMANOS',
    'INMO': ' INMOBILIARIA',
    'CONS': ' CONSULTORÍA',
  };
  Object.entries(abbrev).forEach(([k, v]) => {
    n = n.replace(new RegExp(`\\b${k}\\b`), v);
  });
  
  // 5. OCR errors (common in XLSX/PDF)
  const ocrFixes = {
    '0': 'O', '1': 'I', '3': 'B', '5': 'S', '7': 'T',
  };
  // Only replace in unlikely positions (not first 2 chars)
  
  // 6. Whitelist known variants
  const variants = {
    'AECOM': ['AECOM', 'AECOM ARGENTINA', 'AECOM TECHNOLOGY'],
    'IBM': ['IBM', 'IBM ARGENTINA', 'IBM TECHNOLOGY'],
  };
  
  return n;
};

// Test suite (50+ cases)
const normalizationTests = [
  { input: 'ACME S.A.', expected: 'ACME' },
  { input: 'acme s.a.', expected: 'ACME' },
  { input: 'ACME, S.A.', expected: 'ACME' },
  { input: 'Acmé S.A.', expected: 'ACME' },
  { input: 'ACME y Cia.', expected: 'ACME Y COMPANIA' },
  { input: 'ACME Hermanos', expected: 'ACME HERMANOS' },
  // ... 44 more edge cases
];
```

**Deliverable:** Updated `norm.ts` + test file with 50+ cases passing

### 2.2 CUIT-Based Deduplication

**Strategy:** Use CUIT (tax ID) as primary dedup key, supplement with normalized names

```typescript
// Step 1: Cluster by CUIT (highest confidence)
const cuitClusters = groupBy(providers, p => p.cuit);

// Step 2: For providers without CUIT, cluster by normalized name
const nameClusters = providers
  .filter(p => !p.cuit)
  .reduce((clusters, p) => {
    const norm = normProveedor(p.nombre);
    if (!clusters[norm]) clusters[norm] = [];
    clusters[norm].push(p);
    return clusters;
  }, {});

// Step 3: Merge clusters with >2 members + high name similarity
const dedupClusters = [];
for (const [normName, group] of Object.entries(nameClusters)) {
  if (group.length > 1 && stringSimilarity(group[0].nombre, group[1].nombre) > 0.85) {
    dedupClusters.push({
      canonical: group[0],  // pick oldest/most_verified
      duplicates: group.slice(1),
    });
  }
}

// Step 4: Write to entity_registry + update FK chains
for (const cluster of dedupClusters) {
  const entityId = uuidv5(normalize(cluster.canonical.nombre), NAMESPACE_PROVIDER);
  
  // Mark canonical
  INSERT INTO entity_registry (entity_id, ..., resolution_status)
  VALUES (entityId, ..., 'canonical');
  
  // Mark duplicates as merged
  for (const dup of cluster.duplicates) {
    INSERT INTO entity_registry (..., merge_parent_id, resolution_status)
    VALUES (..., entityId, 'merged');
  }
  
  // Repoint contracts
  UPDATE contracts 
  SET proveedor_id = cluster.canonical.id
  WHERE proveedor_id IN (cluster.duplicates.map(d => d.id));
}
```

**Deliverable:** Deduplication report: X duplicates merged → Y unique canonical entities

---

## Phase 3: Neo4j Deterministic IDs & Graph Stability (2-3 days)

### 3.1 Neo4j Data Model (Revised)

**Current Problem:** Node IDs are sequential; re-runs create duplicates

**Solution:** Use UUIDs based on canonical entity identifiers + deterministic relationships

```cypher
-- Node creation with UUIDs
MERGE (p:Provider {
  entity_id: $entity_id,        -- UUID from entity_registry
  canonical_name: $name,
  cuit: $cuit
})
ON CREATE SET 
  p.created_at = timestamp(),
  p.source_primary = $source_primary,
  p.confidence = $confidence_level
ON MATCH SET
  p.last_updated = timestamp(),
  p.matches_count = p.matches_count + 1;

-- Contract node (also deterministic)
MERGE (c:Contract {
  id: $contract_uuid,  -- UUID5(source + source_id)
  monto: $monto,
  fecha: $fecha
})
ON CREATE SET
  c.source = $source_name,
  c.confidence = 0.9;

-- Relationship with temporal metadata
MERGE (p)-[rel:HAS_CONTRACT]->(c)
ON CREATE SET
  rel.contract_order = $order,
  rel.source = $source_name;
```

**Key Changes:**
1. Use `entity_id` (UUID) as PRIMARY identifier, not sequential ID
2. All nodes deterministic from input data
3. Relationships include source + metadata
4. Use `ON MATCH SET` to accumulate verification counts

### 3.2 Graph Constraints for Deduplication

```cypher
-- Uniqueness constraints (prevent accidental duplicates)
CREATE CONSTRAINT unique_provider_entity_id 
  FOR (p:Provider) REQUIRE p.entity_id IS UNIQUE;

CREATE CONSTRAINT unique_director_entity_id 
  FOR (d:Director) REQUIRE d.entity_id IS UNIQUE;

CREATE CONSTRAINT unique_contract_id 
  FOR (c:Contract) REQUIRE c.id IS UNIQUE;

-- Must-exist constraints
CREATE CONSTRAINT required_provider_cuit 
  FOR (p:Provider) REQUIRE p.cuit IS NOT NULL 
  WHEN EXISTS p.source_primary = 'afip';

-- Index for fast lookups
CREATE INDEX idx_provider_canonical_name 
  FOR (p:Provider) ON p.canonical_name;

CREATE INDEX idx_contract_monto 
  FOR (c:Contract) ON c.monto;

CREATE INDEX idx_director_provider 
  FOR (r:HAS_DIRECTOR) ON r.provider_id;
```

### 3.3 Idempotent Seed Script

**Key property:** Running seed script 3x produces identical graph

```typescript
// backend/src/scripts/seed-neo4j-v2.ts

async function seedNeo4j(forceRecreate = false) {
  const session = driver.session();
  
  if (forceRecreate) {
    await session.run('MATCH (n) DETACH DELETE n;');
  }
  
  // Step 1: Load from entity_registry (canonical entities)
  const providers = await db
    .selectFrom('entity_registry')
    .where('entity_type', '=', 'provider')
    .selectAll()
    .execute();
  
  // Step 2: Deterministic UUID creation
  for (const provider of providers) {
    const entityId = uuidv5(
      normalize(provider.canonical_name) + ':' + (provider.cuit || provider.source_primary),
      NAMESPACE_PROVIDER
    );
    
    // Step 3: Merge (idempotent)
    await session.run(`
      MERGE (p:Provider {entity_id: $entityId})
      ON CREATE SET 
        p.canonical_name = $name,
        p.cuit = $cuit,
        p.created_at = timestamp()
      ON MATCH SET
        p.verified_count = coalesce(p.verified_count, 0) + 1,
        p.last_sync = timestamp()
    `, {
      entityId,
      name: provider.canonical_name,
      cuit: provider.cuit,
    });
  }
  
  // Step 4: Relationships (contracts → providers)
  const contracts = await db
    .selectFrom('contracts')
    .innerJoin('providers', 'contracts.proveedor_id', 'providers.id')
    .selectAll()
    .execute();
  
  for (const contract of contracts) {
    await session.run(`
      MATCH (p:Provider {entity_id: $provider_entity_id})
      MERGE (c:Contract {id: $contract_id})
      MERGE (p)-[r:HAS_CONTRACT]->(c)
      SET r.monto = $monto, r.source = $source
    `, {
      provider_entity_id: contract.providers.entity_id,
      contract_id: contract.id,
      monto: contract.monto_final,
      source: contract.source_name,
    });
  }
  
  // Step 5: Validate (no orphans, all nodes have entities)
  const orphans = await session.run(`
    MATCH (n) 
    WHERE NOT EXISTS(n.entity_id) AND labels(n) IN [['Provider'], ['Director']]
    RETURN count(n) as orphan_count
  `);
  
  if (orphans.records[0].get('orphan_count') > 0) {
    throw new Error('Graph has orphaned entities after sync');
  }
  
  console.log('✓ Graph sync complete (idempotent)');
}

// Test: Run 3x, verify identical graph
await seedNeo4j();
const graph1 = await getGraphChecksum();
await seedNeo4j();
const graph2 = await getGraphChecksum();
assert(graph1 === graph2, 'Graph is not deterministic');
```

**Deliverable:** Idempotent seed script + validation tests passing

---

## Phase 4: Data Quality Observability (2 days)

### 4.1 Quality Metrics Dashboard

```sql
-- Coverage: What % of contracts have verified providers?
CREATE OR REPLACE VIEW vw_quality_coverage AS
SELECT 
  COUNT(DISTINCT c.id) total_contracts,
  COUNT(DISTINCT CASE 
    WHEN er.resolution_status = 'canonical' 
    THEN c.id 
  END) verified_contracts,
  COUNT(DISTINCT CASE 
    WHEN er.resolution_status = 'canonical' AND er.confidence_level > 0.9
    THEN c.id 
  END) high_confidence_contracts,
  ROUND(
    100.0 * COUNT(DISTINCT CASE 
      WHEN er.resolution_status = 'canonical' 
      THEN c.id 
    END) / COUNT(DISTINCT c.id),
    2
  ) pct_verified
FROM contracts c
LEFT JOIN providers p ON c.proveedor_id = p.id
LEFT JOIN entity_registry er ON p.entity_id = er.entity_id;

-- Provider deduplication success
CREATE OR REPLACE VIEW vw_dedup_efficiency AS
SELECT 
  COUNT(DISTINCT id) original_count,
  COUNT(DISTINCT entity_id) canonical_count,
  ROUND(100.0 * (1 - COUNT(DISTINCT entity_id)::FLOAT / COUNT(DISTINCT id)), 2) dedup_pct,
  COUNT(CASE WHEN resolution_status = 'merged' THEN 1 END) merged_duplicates
FROM providers;

-- Confidence distribution
CREATE OR REPLACE VIEW vw_confidence_distribution AS
SELECT 
  CASE 
    WHEN confidence_level >= 0.9 THEN 'HIGH (0.9+)'
    WHEN confidence_level >= 0.7 THEN 'MEDIUM (0.7-0.9)'
    WHEN confidence_level >= 0.5 THEN 'LOW (0.5-0.7)'
    ELSE 'UNCERTAIN (<0.5)'
  END confidence_tier,
  COUNT(*) entity_count,
  ROUND(100.0 * COUNT(*) / SUM(COUNT(*)) OVER(), 2) pct
FROM entity_registry
GROUP BY confidence_tier
ORDER BY confidence_level DESC;

-- Source diversity
CREATE OR REPLACE VIEW vw_source_diversity AS
SELECT 
  source_primary,
  COUNT(*) entity_count,
  COUNT(DISTINCT CASE WHEN confidence_level > 0.9 THEN 1 END) verified_count
FROM entity_registry
GROUP BY source_primary
ORDER BY entity_count DESC;
```

**Deliverable:** Metrics views + query results showing baseline

### 4.2 Health Check Endpoint

```typescript
// backend/src/routes/health.ts

app.get('/health/data-quality', async (req, res) => {
  const coverage = await db.selectFrom('vw_quality_coverage').selectAll().executeTakeOne();
  const dedup = await db.selectFrom('vw_dedup_efficiency').selectAll().executeTakeOne();
  const confidence = await db.selectFrom('vw_confidence_distribution').selectAll().execute();
  const sources = await db.selectFrom('vw_source_diversity').selectAll().execute();
  
  const status = {
    timestamp: new Date(),
    coverage: {
      total_contracts: coverage.total_contracts,
      verified_pct: coverage.pct_verified,
      status: coverage.pct_verified >= 95 ? '✓ PASS' : '⚠ CHECK',
    },
    deduplication: {
      original: dedup.original_count,
      canonical: dedup.canonical_count,
      dedup_pct: dedup.dedup_pct,
      status: dedup.dedup_pct >= 2 ? '✓ GOOD' : '⚠ LOW',
    },
    confidence: {
      high: confidence.find(c => c.confidence_tier === 'HIGH (0.9+)')?.entity_count || 0,
      medium: confidence.find(c => c.confidence_tier === 'MEDIUM (0.7-0.9)')?.entity_count || 0,
      low: confidence.find(c => c.confidence_tier === 'LOW (0.5-0.7)')?.entity_count || 0,
    },
    neo4j_sync: {
      last_sync: ..., // from metadata
      orphan_nodes: await checkGraphOrphans(),
      status: orphan_nodes === 0 ? '✓ OK' : '🔴 CORRUPTED',
    },
  };
  
  res.json(status);
});
```

**Deliverable:** Health endpoint returning overall data quality score

---

## Phase 5: Neo4j Correlation-Based Pattern Detection (4-5 days)

This is where the magic happens: relationships reveal corruption.

### 5.1 Corruption Pattern Types

Define 5+ detectable patterns in graph structure:

#### Pattern A: Director Carousel
**Signal:** Same person directs competing companies that all contract with government

```cypher
-- Find directors with suspicious overlap
MATCH (d:Director)-[:DIRECTS]->(p1:Provider),
      (d)-[:DIRECTS]->(p2:Provider),
      (p1)-[:HAS_CONTRACT]->(c1:Contract),
      (p2)-[:HAS_CONTRACT]->(c2:Contract)
WHERE p1.entity_id <> p2.entity_id
  AND c1.fecha >= date('2022-01-01')
  AND c2.fecha >= date('2022-01-01')
RETURN d.entity_id, d.name, count(DISTINCT p1) provider_count, sum(c1.monto) total_monto
HAVING provider_count >= 3 AND total_monto > 100000000
ORDER BY total_monto DESC
```

**Scoring:** 
- Base: director directs N companies (N >= 3)
- Multiplier: all companies contract with same buyer
- Multiplier: contracts awarded close in time
- Result: Carousel Risk Score = base * multipliers

#### Pattern B: Shell Company Network
**Signal:** New company with 1-2 contracts then disappears, replacements appear

```cypher
-- Find short-lived suppliers (shells)
MATCH (p:Provider)-[:HAS_CONTRACT]->(c:Contract)
WHERE p.source_primary = 'contracts'  -- not independently verified
WITH p, COUNT(DISTINCT c) contract_count, 
     min(c.fecha) first_date, 
     max(c.fecha) last_date
WHERE contract_count <= 2
  AND (last_date - first_date) <= duration('P90D')  -- 90-day window
  AND sum(c.monto) > 50000000
RETURN p.entity_id, p.canonical_name, contract_count, sum(c.monto) as monto
ORDER BY monto DESC
```

**Scoring:**
- Base: contract count 1-2
- Multiplier: high monto in short window
- Multiplier: never appears in IGJ or AFIP
- Result: Shell Risk = base * multipliers

#### Pattern C: Monopoly with Related Entities
**Signal:** Single director-controlled network captures >50% of spending in category

```cypher
-- Find director networks monopolizing categories
MATCH (d:Director)-[:DIRECTS]->(p:Provider)-[:HAS_CONTRACT]->(c:Contract)
WITH d, p, c, c.categoria as categoria
  MATCH (c2:Contract) WHERE c2.categoria = categoria
WITH d.entity_id as director_id, categoria, 
     sum(c.monto) as director_spend,
     sum(c2.monto) as total_spend
WHERE (1.0 * director_spend / total_spend) >= 0.5
RETURN director_id, categoria, 
       ROUND(100.0 * director_spend / total_spend, 2) as pct_monopoly,
       director_spend, total_spend
ORDER BY pct_monopoly DESC
```

**Scoring:**
- Base: monopoly % (0.5 = 50%)
- Multiplier: director's history (recurring patterns)
- Multiplier: category market size (large categories = higher risk)
- Result: Monopoly Risk = base * multipliers

#### Pattern D: Temporal Clustering (Emergency Spending)
**Signal:** Unusual spike in spending to same provider in short window

```cypher
-- Find suspicious temporal patterns
MATCH (p:Provider)-[:HAS_CONTRACT]->(c:Contract)
GROUP BY p.entity_id, DATE_TRUNC('week', c.fecha)
WITH p.entity_id, 
     DATE_TRUNC('week', c.fecha) as week,
     count(*) as contract_count,
     sum(c.monto) as weekly_monto,
     avg(c.monto) as avg_monto
WHERE contract_count > 5 AND weekly_monto > 500000000
RETURN p.entity_id, week, contract_count, weekly_monto
ORDER BY weekly_monto DESC
```

**Scoring:**
- Base: contract count in window
- Multiplier: deviation from provider's historical average
- Result: Clustering Risk = base * multipliers

#### Pattern E: Cross-Municipality Carousel
**Signal:** Same director network contracts across multiple municipalities in sync

```cypher
-- Find synchronized spending across municipalities
MATCH (d:Director)-[:DIRECTS]->(p:Provider)-[:HAS_CONTRACT]->(c:Contract)
WITH d.entity_id as director_id, 
     c.municipio_id as municipio,
     DATE_TRUNC('month', c.fecha) as month,
     count(*) as contract_count,
     sum(c.monto) as monthly_monto
WHERE contract_count >= 2
WITH director_id, count(DISTINCT municipio) as municipality_count,
     count(DISTINCT month) as active_months
WHERE municipality_count >= 3 AND active_months >= 6
RETURN director_id, municipality_count, active_months
ORDER BY municipality_count DESC
```

**Scoring:**
- Base: municipality count (>= 3)
- Multiplier: sustained across time (>= 6 months)
- Result: Multi-Muni Risk = base * multipliers

#### Pattern F: Relationship Debt (Financial Instability)
**Signal:** Provider wins contracts then disappears from AFIP records (bankruptcy/shell)

```cypher
-- Find disappeared providers
MATCH (p:Provider)-[:HAS_CONTRACT]->(c:Contract)
WHERE c.fecha >= date('2023-01-01')
WITH p.entity_id, p.cuit, max(c.fecha) as last_contract_date
WHERE (date(now()) - last_contract_date) > duration('P6M')
  AND NOT EXISTS (
    MATCH (p2:Provider) 
    WHERE p2.cuit = p.cuit 
      AND p2.entity_id <> p.entity_id
      AND EXISTS ((p2)-[:HAS_CONTRACT]->(c2:Contract) 
                  WHERE c2.fecha > last_contract_date)
  )
RETURN p.entity_id, p.cuit, last_contract_date, 
       (date(now()) - last_contract_date).days as days_inactive
ORDER BY days_inactive DESC
```

**Scoring:**
- Base: days inactive
- Multiplier: monto of recent contracts (high spend = higher risk)
- Result: Disappearance Risk = base * multipliers

### 5.2 Correlation Detection Engine

```typescript
// backend/src/engine/correlation-patterns.ts

interface CorrelationSignal {
  pattern_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  score: number;  // 0-100
  entities: {
    type: string;
    entity_id: string;
    canonical_name: string;
    role: string;  // 'director', 'provider', 'buyer'
  }[];
  evidence: {
    metric: string;
    value: any;
    threshold: any;
  }[];
  recommendation: string;
}

async function detectCorrelationPatterns(
  municipio_id?: string,
  from_date?: Date,
  to_date?: Date
): Promise<CorrelationSignal[]> {
  const signals: CorrelationSignal[] = [];
  
  // Pattern A: Director Carousel
  const carousels = await detectDirectorCarousel(municipio_id, from_date, to_date);
  for (const carousel of carousels) {
    signals.push({
      pattern_type: 'director_carousel',
      severity: carousel.score > 80 ? 'critical' : carousel.score > 60 ? 'high' : 'medium',
      score: carousel.score,
      entities: [
        { type: 'director', entity_id: carousel.director_id, canonical_name: carousel.director_name, role: 'nexus' },
        ...carousel.providers.map(p => ({ 
          type: 'provider', 
          entity_id: p.entity_id, 
          canonical_name: p.canonical_name,
          role: 'connected' 
        })),
      ],
      evidence: [
        { metric: 'Provider count', value: carousel.providers.length, threshold: '> 3' },
        { metric: 'Total monto', value: carousel.total_monto, threshold: '> $100M' },
        { metric: 'Time span', value: carousel.days, threshold: '< 365 days' },
      ],
      recommendation: `Investigate director ${carousel.director_name} and network of ${carousel.providers.length} providers. Consider financial sanctions or audit.`
    });
  }
  
  // Pattern B: Shell Companies
  const shells = await detectShellCompanies(municipio_id, from_date, to_date);
  for (const shell of shells) {
    signals.push({
      pattern_type: 'shell_company_network',
      severity: shell.score > 85 ? 'critical' : 'high',
      score: shell.score,
      entities: [
        ...shell.providers.map(p => ({
          type: 'provider',
          entity_id: p.entity_id,
          canonical_name: p.canonical_name,
          role: 'suspected_shell'
        })),
      ],
      evidence: [
        { metric: 'Unverified (not in IGJ/AFIP)', value: shell.verification_rate, threshold: '< 20%' },
        { metric: 'Contracts in 90 days', value: shell.contract_velocity, threshold: '> 2' },
        { metric: 'Monto per contract', value: shell.avg_monto, threshold: '> $50M' },
      ],
      recommendation: `Cross-reference ${shell.providers.length} providers with national suspicious shell lists. Request AFIP verification.`
    });
  }
  
  // Pattern C-F: (similar structure for monopoly, clustering, cross-muni, disappearance)
  
  return signals.sort((a, b) => b.score - a.score);
}

// Scoring function
function calculatePatternScore(
  baseMetric: number,
  thresholds: { low: number; medium: number; high: number },
  multipliers: number[] = []
): number {
  let score = Math.min(100, (baseMetric / thresholds.high) * 100);
  multipliers.forEach(m => score *= m);
  return Math.round(Math.min(100, score));
}
```

**Deliverable:** Correlation detection engine with 5+ patterns

### 5.3 Integration with Reports

```typescript
// backend/src/routes/analizar.ts (existing POST /analizar endpoint)

app.post('/analizar', async (req, res) => {
  const { municipio_id, desde, hasta } = req.body;
  
  // Existing logic: fetch contracts, calculate rule-based signals
  const contratos = await getContratos(municipio_id, desde, hasta);
  const señalesBasicas = await calcularSeñales(contratos);
  
  // NEW: Correlation patterns
  const señalesCorrelacion = await detectCorrelationPatterns(
    municipio_id,
    desde,
    hasta
  );
  
  // Combine and rank
  const todasLasSeñales = [
    ...señalesBasicas.map(s => ({ ...s, source: 'rule_based' })),
    ...señalesCorrelacion.map(s => ({ ...s, source: 'correlation' })),
  ].sort((a, b) => b.score - a.score);
  
  // NEW: Add meta-scores
  const correlationScore = Math.round(
    todasLasSeñales
      .filter(s => s.source === 'correlation')
      .reduce((sum, s) => sum + s.score, 0) / señalesCorrelacion.length
  );
  
  const expediente = {
    municipio: ...,
    periodo: { desde, hasta },
    stats: { total_contratos: contratos.length, ... },
    señales: todasLasSeñales,
    análisis_correlativo: {
      score: correlationScore,
      patterns_detected: señalesCorrelacion.length,
      top_patterns: señalesCorrelacion.slice(0, 3),
    },
  };
  
  res.json({ ok: true, expediente });
});
```

**Deliverable:** Integration test showing correlation patterns in /analizar response

---

## Phase 6: Quality Assurance & Validation (2 days)

### 6.1 Test Suite

```bash
# Unit tests: Normalization
npm run test:normalization -- 50 cases

# Unit tests: Correlation patterns
npm run test:patterns:director_carousel
npm run test:patterns:shell_companies
npm run test:patterns:monopoly
npm run test:patterns:temporal_clustering
npm run test:patterns:cross_muni
npm run test:patterns:disappearance

# Integration tests: Full pipeline
npm run test:pipeline:cordoba_2023
npm run test:pipeline:cordoba_multiannual

# Graph consistency tests
npm run test:graph:deterministic_ids  # Run 3x, compare checksums
npm run test:graph:orphan_detection
npm run test:graph:uniqueness_constraints

# E2E: Production data
npm run test:e2e:production
```

### 6.2 Validation Checklist

- ✅ All 500+ providers have deterministic UUIDs
- ✅ Zero duplicate nodes in Neo4j (run seed 3x)
- ✅ 100% provenance coverage (every field tracked to source)
- ✅ Coverage >= 95% (contracts with verified providers)
- ✅ Confidence distribution: >= 70% high + medium confidence
- ✅ All 5+ correlation patterns passing unit tests
- ✅ Health endpoint shows all metrics passing
- ✅ E2E test against production data succeeds
- ✅ Graph visualization renders <200ms for 500 nodes

---

## Phase 7: Documentation & Handoff (1 day)

### 7.1 Data Dictionary

Document every table, column, confidence tier, source.

### 7.2 Operator Runbooks

- Daily ingestion troubleshooting
- How to investigate a specific corruption pattern
- How to add a new data source
- How to respond to data quality alerts

### 7.3 Frontend Data Contract

Specify:
- Max nodes for landing graph (500)
- Query latency SLA (< 200ms)
- Confidence score thresholds for display
- How to communicate data quality status to user

---

## Implementation Roadmap

### Week 1 (Apr 21-27): Phases 0-1
- Audit schema gaps
- Create entity_registry + provenance tables
- Backfill existing data

### Week 2 (Apr 28-May 4): Phase 2-3
- Implement enhanced normalization + test suite
- Refactor Neo4j seed for deterministic IDs
- Add uniqueness constraints

### Week 3 (May 5-11): Phase 4-5
- Build quality metrics views + health endpoint
- Implement correlation pattern detection (5 patterns)
- Integration tests

### Week 4 (May 12-18): Phase 6-7
- Full test suite passing
- Documentation + runbooks
- Validation checklist signed off

### Week 5+ (May 19+): Production Launch Gate
- Graph-first mandate: real data visible
- Correlation signals in /analizar response
- Frontend landing renders live graph

---

## Success Metrics (Hard Targets)

| Metric | Current | Target | By |
|--------|---------|--------|-----|
| Provider duplicate rate | 2-5% | < 0.5% | May 4 |
| Neo4j orphaned nodes | Yes | Zero | May 11 |
| Provenance coverage | 0% | 100% | Apr 27 |
| Data quality score | N/A | >= 90/100 | May 18 |
| Correlation patterns detected | 0 | >= 50 (real dataset) | May 18 |
| Graph render latency | N/A | < 200ms | May 25 |
| Health endpoint passing | No | Yes, all checks | May 18 |

---

## Blockers & Dependencies

- **Blocker:** Entity resolution quality is prerequisite for graph stability
  - **Mitigation:** Phases 0-3 must complete before Phase 5 opens
  
- **Blocker:** AFIP/IGJ source availability can vary
  - **Mitigation:** All patterns gracefully degrade if sources unavailable; Correlation engine works with contracts-only data
  
- **Blocker:** Frontend integration (landing graph rendering)
  - **Dependency:** Data layer must be stable + Correlation API exposed
  - **Timeline:** Deferred to Phase 8 (after graph-first launch gate)

---

## Decision Log

### Decision: Use UUIDs for Entity IDs
**Why:** Deterministic + collision-free + supports merging duplicates
**Alternative:** Sequential IDs (rejected: causes orphans on re-runs)
**Owner:** Data Architecture
**Date:** 2026-04-21

### Decision: Correlation patterns gated on Neo4j availability
**Why:** Neo4j queries most efficient for relationship analysis
**Alternative:** SQL-only detection (rejected: slower, harder to maintain)
**Fallback:** If Neo4j unavailable, use SQL approximation
**Owner:** Engineering
**Date:** 2026-04-21

### Decision: Confidence scores mandatory on all entities
**Why:** Must distinguish AFIP-verified from contract-inferred
**Impact:** Frontend can filter/highlight based on confidence
**Owner:** Data Architecture
**Date:** 2026-04-21

---

## References

- [Source Registry MVP](./2026-04-21-cordoba-source-registry-mvp.md)
- [Entity Enrichment Assessment](./2026-04-21-entity-enrichment-assessment.md)
- [Frontend Neo4j Landing Plan](../plans/2026-04-21-frontend-neo4j-landing-plan.md)

