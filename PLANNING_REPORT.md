# ARGOS — Audit Report & Migration Plan
**Audit Date:** 2026-04-09
**Session Mode:** Read-only planning. No files modified.
**Execute in:** Next session with --dangerously-skip-permissions

---

## Context

ARGOS is a public spending corruption detection system targeting Argentine
municipal procurement data. Target: operational before Córdoba provincial
elections, September 2026. Findings may be used in legal proceedings.

This audit derives all conclusions from source code only. Every claim is
cited. Documentation is treated as potentially outdated until contradicted
or confirmed by code.

---

## 1. REPOSITORY INVENTORY

### Layer: API / Backend (`backend/src/`)

| File | What it actually does |
|------|----------------------|
| `index.ts:1-46` | Express server, 4 routes: GET /health, GET /municipios, POST /analizar, GET /historial. CORS wildcard. Port 3001. |
| `routes/analizar.ts` | POST /analizar — validates input (municipioId, anioDesde, anioHasta), runs connector → signals → claude pipeline, returns Expediente JSON |
| `routes/historial.ts:1-24` | GET /historial — **imports `../lib/supabase` which does not exist** → build-breaking |
| `connectors/interface.ts:1-15` | Registry pattern: maps 'cordoba-capital' → cordobaCapitalConnector. Hardcoded single entry. |
| `connectors/cordoba-capital/fetcher.ts` | Downloads XLSX from gobiernoabierto.cordoba.gob.ar. Static map: 2019→ID2, 2020→5977, 2021→5978, 2022→6466, 2023→6467. 30s API timeout, 60s XLSX timeout. |
| `connectors/cordoba-capital/parser.ts` | Maps hardcoded XLSX column names → Contrato[]. Filters empty/invalid rows. |
| `connectors/cordoba-capital/index.ts` | Orchestrates fetch + parse for year range. Exports `cordobaCapitalConnector`. |
| `engine/signals.ts:1-372` | 8 anti-corruption detectors. Each returns `Señal | null`. `calcularSeñales()` runs all, catches errors silently, sorts by score. |
| `engine/report.ts` | **Stub.** Returns Expediente with resumenEjecutivo = 'En construcción'. Superseded by lib/claude.ts but still present. |
| `lib/claude.ts:1-184` | Calls claude-sonnet-4-20250514. Builds prompt from contract data + AFIP enrichment. Returns full Expediente with guiaDenuncia + comoVerificar. |
| `lib/afip.ts` | Scrapes cuitonline.com (third-party) for CUIT lookup. In-memory cache. Promise.allSettled for top-5 providers. |
| `types/index.ts:1-70` | Contrato, Señal, ComoVerificar, Expediente, MunicipioConnector interfaces. |
| `test-e2e.ts` | **Manual script**, not a test suite. POSTs to localhost:3001/analizar. |
| `test-production.ts` | **Manual script**. Tests Railway production URL. |
| `test-signals.ts` | **Manual script**. Runs signal detection without server. |

### Layer: Frontend (`frontend/src/`)

| File | What it actually does |
|------|----------------------|
| `pages/Landing.tsx` | Municipality selector + date range form. Calls POST /analizar. Stores expediente in sessionStorage. Shows /historial results. |
| `pages/Report.tsx` | Reads expediente from sessionStorage. Renders risk score, signals, top providers, guiaDenuncia, comoVerificar. Export to .txt. |
| `pages/ProviderProfile.tsx` | Reads expediente from sessionStorage. Shows single provider detail, AFIP badges. Yearly distribution section is a **placeholder with no data**. |
| `lib/api.ts` | API client: analizarMunicipio(), getMunicipios(), getHistorial(). VITE_API_URL env var. |
| `lib/format-utils.ts` | Currency/date formatters. Constants: SALARIO_MINIMO=286000, JUBILACION=285000, UMBRAL_LICITACION=50M. |
| `data/municipios-cordoba.ts` | Hardcoded 13 municipalities. Only 'cordoba-capital' has working data portal URLs. Last verified 2026-03-17. |
| `hooks/useRealLocalityData.ts` | **Broken.** Imports `@/contexts/LocalityContext` → file does not exist. Not called by any active page. |
| `integrations/supabase/client.ts` | Creates Supabase client from VITE_SUPABASE_URL + VITE_SUPABASE_PUBLISHABLE_KEY. **Neither env var is defined** in .env.development or .env.production. |
| `integrations/supabase/types.ts` | Auto-generated DB types for project `ogeqneeevsevhsjowppm`. Not used by active pages. |
| `App.tsx` | React Router: `/` → Landing, `/report` → Report, `/provider/:nombre` → ProviderProfile. |

### Layer: Dead / Legacy (`frontend/supabase/`, `frontend/Other files/`)

| File | Status |
|------|--------|
| `supabase/functions/` (11 edge functions) | Legacy Lovable/n8n architecture. n8n URLs hardcoded to `osocordobes.app.n8n.cloud`. Uses LOVABLE_API_KEY (Gemini), FIRECRAWL_API_KEY, ELEVENLABS_API_KEY, STRIPE_SECRET_KEY. Not called by active pages. |
| `supabase/migrations/` (4 SQL files) | Schema for project `ogeqneeevsevhsjowppm`. 25+ tables. Inconsistent with CLAUDE.md description. |
| `supabase/config.toml` | project_id = `ogeqneeevsevhsjowppm`. All functions have verify_jwt=false. |
| `Other files/files/ARCHITECTURE.md` | Contains literally: "En reconstrucción — arquitectura n8n eliminada." |
| `Other files/files/n8n-config.ts` | N8N client pointing to `osocordobes.app.n8n.cloud`. Dead code. |
| `Other files/files/signals-schema.json` | Defines 7 typologies: supplier_concentration, amount_outliers, network_centrality, document_similarity, proveedor_reciente, proveedor_inactivo, coverage_limitations. **Not implemented in backend.** |
| `Other files/files/municipios-cordoba.ts` | Duplicate of `frontend/src/data/municipios-cordoba.ts`. |
| `frontend/tmp_*.json` (7 files) | n8n workflow node patches for document discovery pipeline. Dead code. |
| `LA_BESTIA_CONTEXT.md` | "En reconstrucción — arquitectura n8n eliminada. Backend nuevo: TypeScript/Express en Railway." |

### Layer: Configuration

| File | Content |
|------|---------|
| `backend/package.json` | `la-bestia-backend` v2.0.0. Deps: @anthropic-ai/sdk, express, xlsx, node-fetch, dotenv. **No @supabase/supabase-js listed.** |
| `backend/railway.json` | startCommand: `node dist/index.js`. Nixpacks builder. |
| `backend/tsconfig.json` | strict: true. target ES2022. |
| `frontend/package.json` | React 18.3.1, Vite 5.4.19. Has @supabase/supabase-js. |
| `frontend/.env.development` | Only: `VITE_API_URL=http://localhost:3001` |
| `frontend/.env.production` | Only: `VITE_API_URL=https://bestia-backend-....railway.app` |

---

## 2. VERIFIED WORKING

**Verified by code existence + manual test scripts (not automated tests):**

| Component | Evidence |
|-----------|----------|
| `/health` endpoint | `index.ts:17` returns `{ok:true, version:'2.0.0'}` |
| `/municipios` endpoint | `index.ts:21-27` returns hardcoded 'cordoba-capital' with metadata |
| `/analizar` pipeline | `routes/analizar.ts` — complete orchestration flow exists |
| Cordoba XLSX fetch | `fetcher.ts` — dataset IDs verified static for 2019-2023 |
| XLSX parse → Contrato[] | `parser.ts` — column mapping present, filtering logic present |
| 8 signal detectors | `engine/signals.ts:1-372` — all 8 functions exist with logic |
| Claude Sonnet integration | `lib/claude.ts` — API call present, model: `claude-sonnet-4-20250514` |
| AFIP enrichment | `lib/afip.ts` — best-effort via Promise.allSettled, won't crash pipeline |
| Frontend Landing page | `pages/Landing.tsx` — form, progress animation, historial section |
| Frontend Report page | `pages/Report.tsx` — renders all Expediente fields |
| Frontend ProviderProfile | `pages/ProviderProfile.tsx` — renders provider detail (yearly section is stub) |
| Railway deployment config | `backend/railway.json` + `frontend/.env.production` with Railway URLs |

**Claimed but NOT verified by any test infrastructure:**
- Signal threshold correctness (8 detectors exist; thresholds are code assertions, not tested)
- Year-range edge cases in analizar.ts validation
- Multi-year contract aggregation correctness

---

## 3. BROKEN OR INCOMPLETE

### Critical / Build-Breaking

**`backend/src/routes/historial.ts:2`**
```typescript
import { supabase } from '../lib/supabase'
```
→ `backend/src/lib/supabase.ts` does NOT exist (verified: `backend/src/lib/` contains only `afip.ts` and `claude.ts`).
→ TypeScript strict mode will fail to compile.
→ `npm run build` will fail. Current Railway deployment is likely running a stale pre-compiled `dist/`.

**`frontend/src/hooks/useRealLocalityData.ts:4`**
```typescript
import { useLocality } from '@/contexts/LocalityContext'
```
→ `frontend/src/contexts/` directory does NOT exist.
→ Not called by any active page, so frontend still builds.
→ Dead broken code.

### Incomplete / Stubs

**`backend/src/engine/report.ts`**
Returns `resumenEjecutivo: 'En construcción'`. Never deleted after claude.ts took over. Dead stub compiled into bundle.

**`frontend/src/pages/ProviderProfile.tsx`** — "Distribución anual" section explicitly shows placeholder "Datos históricos no disponibles" with no implementation path.

**AFIP integration (`lib/afip.ts`)**
Scrapes cuitonline.com — unaffiliated third-party. No SLA, no API contract, regex-fragile.

**Static dataset IDs in fetcher.ts**
Hardcoded for 2019-2023 only. 2024 data requires manual code update. Fallback API search is untested.

**`signals-schema.json`** (Other files) — defines typologies `network_centrality`, `document_similarity`, `proveedor_reciente`, `proveedor_inactivo`, `amount_outliers` → none implemented in backend signals.ts.

**historial endpoint** — even if supabase.ts were added, the Supabase `reports` table expects columns `period`, `executive_summary`, `total_contracts`, `total_amount`, `signals_found` — but the actual migration schema has `title`, `executive_summary`, `full_content` with no `total_contracts` column. Schema mismatch.

### Security Issues

- CORS wildcard in `index.ts:12` (`Access-Control-Allow-Origin: *`)
- No rate limiting on `/analizar` (Claude API call + XLSX download — expensive per request)
- All Supabase edge functions have `verify_jwt = false`
- `lib/claude.ts:73-107`: provider names from XLSX embedded directly into Claude prompt without sanitization (low-severity prompt injection vector)

---

## 4. DOCUMENTATION DRIFT

Every contradiction between documentation and actual code:

| Claim (file) | Reality (code) |
|--------------|----------------|
| CLAUDE.md: "Signal engine: TypeScript (types.ts, stats.ts, detectors.ts)" | Actual: `engine/signals.ts`. No `stats.ts` or `detectors.ts` exist. |
| CLAUDE.md: "42/42 passing Vitest tests" | No `.test.ts`, `.spec.ts`, or `vitest.config` anywhere. **Zero automated tests.** |
| CLAUDE.md: "T17–T21: Benford's Law, split purchasing, short submission periods, holiday/weekend awards, fiscal year-end concentration" | Does not exist in code. Only 8 detectors in signals.ts. None are Benford's Law. |
| CLAUDE.md: "Schema: 9 tables — entities, data_sources, suppliers, procurement_records, signals, reports, report_signals, pipeline_runs, signal_typologies (21 typologies: T01–T21)" | Actual schema: 25+ tables with entirely different names (localities, companies, contracts, officials, red_flags, sources, documents, fragments, actors, procedures, relations, signals, jobs, job_steps, reports, profiles, stripe_customers, user_entitlements, chat_messages, analysis_runs). No match. |
| CLAUDE.md: "Database: PostgreSQL via Supabase (project ID: dkqvrjehpxfziwasfgmh)" | `frontend/supabase/config.toml`: `project_id = "ogeqneeevsevhsjowppm"`. Different project ID. |
| CLAUDE.md: "Orchestration: n8n Cloud — claimed scoped to cron jobs only" | n8n was the **entire 9-step analysis pipeline** per edge functions. LA_BESTIA_CONTEXT.md confirms removal. |
| CLAUDE.md describes Supabase integration as active | Frontend `.env` files have NO Supabase env vars. Supabase client cannot initialize. |
| `Other files/ARCHITECTURE.md` | Contains only: "En reconstrucción — arquitectura n8n eliminada." Literal placeholder. |
| signals-schema.json defines 7 typologies | 0 of the 7 are implemented in backend signals.ts. |
| `engine/report.ts` implied as active | Superseded by `lib/claude.ts`. Returns 'En construcción' stub. |

---

## 5. ARCHITECTURAL ASSESSMENT

### Rating by Layer

**Ingestion** — NEEDS WORK
Only Córdoba Capital (XLSX). Static dataset IDs. No retry. No caching. No schema versioning. Hardcoded column names = brittle. One source for one city is not a foundation for national scale.

**Domain Model** — NEEDS WORK
`Contrato` is minimal but functional. No canonical identifiers: no CUIT on Contrato, no decree number, no document hash. `fuenteUrl` points to the year's XLSX file, not the specific contract document — fails the "traceable to decree number + URL" absolute constraint. `Señal.evidencia` is free-text, not machine-verifiable.

**Signal Engine** — SOLID for v1 / MUST EXTEND
8 heuristic detectors are well-implemented and legally grounded. Error isolation per detector is good. Missing: network/relationship-based detection (required to detect patterns like Causa Vialidad). An isolated-row engine cannot detect shell company networks. No unit tests — thresholds cannot be validated.

**Report Generation** — NEEDS WORK
Claude Sonnet narrative generation is good for citizens. Hard constraint: 600 max_tokens truncates complex multi-year analyses. Hardcodes Córdoba-specific contacts in guiaDenuncia — not portable. Model version hardcoded as string.

**API Layer** — NEEDS WORK
Routes are simple and functional except for build-breaking historial. No auth, no rate limiting, no audit logging. Not designed for concurrent analyses.

**Frontend** — SOLID for v1 scope
Landing/Report/ProviderProfile cover the core citizen use case. sessionStorage makes sharing impossible. 51 unused shadcn/ui components add bulk. ~3000 lines of dead code (useRealLocalityData, Supabase integration, n8n artifacts).

**Testing** — MUST REPLACE
Zero automated tests. A system targeting legal proceedings with zero test coverage is not production-ready. "42/42 Vitest tests" claim is false.

**Database** — MUST DECIDE
Two Supabase projects with inconsistent schemas, neither used by active pages. For national-scale multi-year OLAP: DuckDB embedded. For relationship detection: Neo4j required — cannot be done with row-level aggregation alone.

**Infrastructure** — SOLID for current scope
Railway deployments are clean. Budget headroom exists.

---

## 6. MIGRATION PLAN

### What to Preserve (exact files)

| Component | Files | What to Keep |
|-----------|-------|--------------|
| Signal engine | `backend/src/engine/signals.ts` | All 8 detectors + calcularSeñales() |
| Domain types | `backend/src/types/index.ts` | All interfaces (extend, don't replace) |
| Cordoba connector | `backend/src/connectors/cordoba-capital/` | All three files |
| Analizar route | `backend/src/routes/analizar.ts` | Pipeline orchestration pattern |
| Claude integration | `backend/src/lib/claude.ts` | generarExpediente() as narrative layer |
| Frontend pages | `frontend/src/pages/{Landing,Report,ProviderProfile}.tsx` | Core UI |
| Municipality data | `frontend/src/data/municipios-cordoba.ts` | 13 verified municipalities |
| Format utilities | `frontend/src/lib/format-utils.ts` | All formatters and constants |
| Signals schema reference | `frontend/Other files/files/signals-schema.json` | Typology definitions (move to canonical location) |

### What to Delete

| What | Why |
|------|-----|
| `frontend/supabase/` (entire) | Dead Lovable/n8n architecture, 11 edge functions, wrong project |
| `frontend/Other files/` (entire) | n8n-config.ts, duplicate municipios, stale ARCHITECTURE.md |
| `frontend/tmp_*.json` (7 files) | n8n workflow patches, no integration path |
| `frontend/src/integrations/supabase/` | Not connected (missing env vars), dead |
| `frontend/src/hooks/useRealLocalityData.ts` | Broken import, unused |
| `backend/src/engine/report.ts` | Stub superseded by claude.ts |
| Unused shadcn/ui components | Keep: button, card, badge, progress, separator, table, tabs, toast, tooltip, accordion, select, input, label. Delete: calendar, carousel, resizable, drawer, command, menubar, etc. |

### What to Rewrite

| Component | Reason | Target |
|-----------|--------|--------|
| `routes/historial.ts` | Missing dependency, schema mismatch | Rewrite against DuckDB |
| `connectors/interface.ts` | Hardcoded single entry | Async plugin registry |
| `lib/afip.ts` | Third-party scraping | Official AFIP API or explicit best-effort disclaimer |
| `types/index.ts` | Missing CUIT, decree number, document hash | Extend Contrato |
| Frontend state | sessionStorage prevents sharing | URL-based report IDs + DuckDB persistence |

### Component Dependency Order

```
DuckDB schema          → connector writes to it
DuckDB schema          → historial reads from it
DuckDB schema          → Evidence.dev reads from it
Ollama + embeddings    → Qdrant entity resolution
Qdrant entity res.     → Neo4j deduplication
Neo4j graph ingestion  → graph-based signal detectors
graph signal detectors → GNN training labels
GNN training           → GNN inference service
GNN inference          → Claude report includes ML scores
```

---

## 7. SPRINT PLAN — NEXT 6 SPRINTS

### Sprint 1 — Stabilize (no new external services required)
**Goal:** Backend builds cleanly, real unit tests exist, dead code removed.

**Tasks:**
1. Create `backend/src/lib/supabase.ts` — null export stub. Fixes build.
2. Rewrite `backend/src/routes/historial.ts` — return empty array until DuckDB is wired.
3. Delete all dead code listed in "What to Delete" section above.
4. Install Vitest. Create `backend/src/engine/signals.test.ts`:
   - Fixture contracts (≥20 rows, covers each of 8 detectors)
   - Unit test each detector individually
   - Edge cases: empty array, single contract, all-same-provider
5. Add 2024 dataset ID to fetcher.ts (or implement + test the fallback API search path).
6. Remove ProviderProfile yearly distribution stub — either implement or delete section.
7. Update CLAUDE.md to reflect actual state.

**Definition of done:**
- `npm run build` succeeds with zero TS errors
- `npm test` runs ≥16 unit tests, all pass
- Frontend dev server: Landing → analysis → Report → ProviderProfile all work
- Zero broken imports in TypeScript compilation

**Packages:** `vitest`, `@vitest/coverage-v8`

---

### Sprint 2 — DuckDB persistence
**Goal:** Reports survive page refresh. History works. No sessionStorage for data.

**Tasks:**
1. `npm install @duckdb/node-api` in backend
2. Create `backend/src/lib/db.ts`:
   - Schema: `contratos(id, municipio, anio, proveedor, cuit, area, tipo, monto, hash_fila, fuente_url)`
   - Schema: `reportes(id, municipio, anio_desde, anio_hasta, generado_en, resumen_ejecutivo, señales_json, datos_json, fuentes_json)`
   - Functions: insertContratos(), insertReporte(), getHistorial(), getReporte(id)
3. Update `routes/analizar.ts`: persist to DuckDB, return report ID
4. Update `routes/historial.ts`: query DuckDB
5. Add `GET /reporte/:id` route
6. Update frontend: navigate to `/report?id=UUID`, fetch from backend by ID
7. Test: generate report → refresh page → report still visible

**Definition of done:**
- Reports persist across page refresh
- `/historial` returns last 20 from DuckDB
- No sessionStorage for report data

**Packages:** `@duckdb/node-api`

---

### Sprint 3 — Entity resolution (Qdrant + Ollama)
**Goal:** Normalize provider names. "CONSTRUCTORA SA" and "CONSTRUCTORA S.A." resolve to one entity.

**Tasks:**
1. Install Ollama locally. Pull multilingual sentence-transformers model.
2. Deploy Qdrant via Docker.
3. Create `backend/src/lib/embeddings.ts` — Ollama embedding endpoint wrapper
4. Create `backend/src/lib/qdrant.ts` — upsert/search vector store
5. Create `backend/src/lib/entity-resolution.ts`:
   - For each unique provider name: embed → search Qdrant (threshold 0.92)
   - If match: use canonical name. If no match: insert new canonical entity.
   - Output: Map<rawName, canonicalName>
6. Integrate into connector pipeline: run entity resolution before signal detection
7. Add optional `cuitProveedor` field to Contrato type (populated from AFIP)
8. Test: 50 synthetic providers → verify deduplication

**Definition of done:**
- Entity resolution runs on every analysis
- Provider names in signals use canonical form
- Qdrant collection persists across restarts

**Packages:** `@qdrant/js-client-rest`
**Local:** Ollama (ollama.ai), Docker (Qdrant)

---

### Sprint 4 — Knowledge graph (Neo4j) + relationship signals
**Goal:** Detect networks of related providers. First signals based on relationships.

**Tasks:**
1. Deploy Neo4j Community via Docker
2. Create `backend/src/lib/neo4j.ts` — driver + CRUD helpers
3. Graph schema:
   - `(:Proveedor)`, `(:Area)`, `(:Municipio)`, `(:Contrato)`
   - `(:Proveedor)-[:RECIBIO]->(:Contrato)`, `(:Area)-[:ADJUDICO]->(:Contrato)`
4. Ingest pipeline: after entity resolution, load contracts into Neo4j
5. Add 3 graph-based detectors to `engine/signals.ts`:
   - `red_proveedores_relacionados`: multiple providers sharing address/CUIT digits receiving contracts from same area
   - `exclusividad_cruzada`: provider active only in this municipality + ≥50% concentration
   - `rotacion_coordinada`: 2+ providers alternating contracts in same category
6. Update `calcularSeñales()` to run graph detectors (skip gracefully if Neo4j unavailable)
7. Add provider network visualization to Report.tsx

**Definition of done:**
- Graph populated after each analysis
- ≥2 graph signals produce output on Córdoba 2019-2023 test data
- Tests cover all 3 new detectors

**Packages:** `neo4j-driver`
**Local:** Docker (Neo4j Community)

---

### Sprint 5 — GNN anomaly scoring (PyTorch Geometric on RTX 4070)
**Goal:** ML-derived anomaly scores on procurement graphs. Trained on landmark case ground truth.

**Tasks:**
1. Set up `backend/python/` environment:
   - `requirements.txt`: torch, torch_geometric, fastapi, uvicorn, duckdb, networkx, scikit-learn
2. Create `backend/python/graph_features.py`:
   - Load contracts from DuckDB
   - Build NetworkX bipartite graph (provider-contract-area)
   - Extract node features: total_monto, gini_monto, num_contratos, num_areas, max_concentration, years_active
3. Create `backend/python/train_gnn.py`:
   - Manual labels: corrupt subgraphs from Causa Vialidad ground truth
   - Architecture: 3-layer GraphSAGE, binary classification
   - Save to `backend/python/models/gnn_v1.pt`
4. Create `backend/python/serve.py` — FastAPI on localhost:8000, POST /score
5. Integrate in `routes/analizar.ts`: call GNN service after signal detection, add gnnScore to Señal
6. Update `lib/claude.ts` prompt to include GNN scores

**Definition of done:**
- GNN trains to >75% precision on labeled data
- FastAPI service responds on localhost:8000
- Signals include optional `gnnScore` field
- GNN scores visible in Report.tsx

**Packages (Python):** torch (CUDA 12.1), torch_geometric, fastapi, uvicorn, duckdb, networkx, scikit-learn

---

### Sprint 6 — Evidence.dev public report publishing
**Goal:** Static auditable public reports. Journalists can share URLs. No server required for reading.

**Tasks:**
1. Create `reports/` Evidence.dev project
2. Configure DuckDB as data source
3. Create pages: index (all analyses), municipio/[id], proveedor/[nombre], señal/[tipologia]
4. Add legal disclaimer component (required on every page)
5. Deploy to Railway static service
6. Add `POST /publish` endpoint in Express: triggers Evidence.dev build
7. Update Report.tsx: add "Ver reporte público" link

**Definition of done:**
- `npm run build` in reports/ produces static HTML with real data
- Public URL loads without server
- All data traces to official source URL
- Legal disclaimer on every page

**Packages:** evidence (via npx)

---

## 8. TOOLS AND ENVIRONMENT SETUP

### MCP Servers (verify before installing: ≥200 stars, ≤6 months last commit)

| Tool | Purpose for ARGOS |
|------|-------------------|
| `@modelcontextprotocol/server-postgres` | Direct Supabase/PostgreSQL queries during debugging |
| `mcp-server-neo4j` (neo4j-contrib/mcp-server-neo4j) | Cypher queries against knowledge graph during development |
| DuckDB MCP server (verify current best) | DuckDB schema development and debugging |

### npm Packages (backend)

| Package | Sprint | Purpose |
|---------|--------|---------|
| `vitest` | 1 | Unit tests |
| `@vitest/coverage-v8` | 1 | Coverage |
| `@duckdb/node-api` | 2 | OLAP persistence |
| `@qdrant/js-client-rest` | 3 | Entity resolution |
| `neo4j-driver` | 4 | Knowledge graph |

### Python Environment (Sprint 5)

```
torch==2.6.0+cu121
torch_geometric==2.7.0
fastapi==0.115.0
uvicorn==0.34.0
duckdb==1.2.0
networkx==3.5
scikit-learn==1.6.1
numpy==2.2.0
```

### Local Infrastructure (Docker)

```bash
# Qdrant (Sprint 3)
docker run -d -p 6333:6333 -p 6334:6334 \
  -v $(pwd)/qdrant_storage:/qdrant/storage:z \
  qdrant/qdrant

# Neo4j Community (Sprint 4)
docker run -d -p 7474:7474 -p 7687:7687 \
  -e NEO4J_AUTH=neo4j/argos_local_pw \
  -v $(pwd)/neo4j_data:/data \
  neo4j:5-community

# Ollama (Sprint 3) — install from ollama.ai
ollama pull paraphrase-multilingual-minilm-l12-v2
```

---

## 9. COST AND INFRASTRUCTURE PLAN

Budget: ~500 DKK/week (~$280 USD/month)

| Component | Location | Monthly Cost | Notes |
|-----------|----------|-------------|-------|
| Frontend (Railway) | Cloud | ~$5 | Static Vite build |
| Backend Express (Railway) | Cloud | ~$5 | Node.js, minimal RAM |
| DuckDB | Local | $0 | Embedded file |
| Qdrant | Local Docker | $0 | RTX 4070 machine |
| Neo4j Community | Local Docker | $0 | RTX 4070 machine |
| Ollama (embeddings + Llama 3.1 8B) | RTX 4070 | $0 | ~5.5GB VRAM total |
| GNN training + inference (PyTorch Geometric) | RTX 4070 | $0 | ~1-2GB VRAM |
| Claude Haiku (document classification) | API | ~$10-20/mo | Minimize with Ollama for bulk |
| Claude Sonnet (final reports only) | API | ~$5-10/mo | One call per analysis |
| Evidence.dev reports | GitHub Pages / Railway | $0-5 | Static HTML |
| Cloud GPU (GNN fine-tuning, one-time only) | RunPod/Vast.ai | $10-20 one-time | Only if local training insufficient |
| **Total** | | **~$35-65/mo** | Well within $280/mo budget |

**Remaining budget (~$215-245/mo):** Reserved for Firecrawl (if scraping expands), Claude API bursts during active investigation periods.

**NOT recommended:**
- Managed Neo4j Aura ($65/mo) — runs free locally
- Supabase paid tier — architecture is moving away from it
- Cloud GPU for ongoing inference — RTX 4070 handles it

---

## 10. OPEN QUESTIONS

Decisions required before or during execution:

**Q1: Supabase — keep or retire?**
The Lovable project (`ogeqneeevsevhsjowppm`) has auth, Stripe subscriptions, chat. Are there active paying users relying on it?
→ NO active users → delete all Supabase code in Sprint 1 (saves ~3000 lines)
→ YES active users → must plan migration before deletion

**Q2: Does Railway backend currently build?**
`historial.ts` imports missing `supabase.ts`. Current Railway deployment may be running stale compiled `dist/` from before this import was added. Need to verify when the last successful Railway build occurred.

**Q3: AFIP official API access**
AFIP Padrón Alcance 4 requires institutional registration. Is this in progress? Rejected?
→ If no access: AFIP remains best-effort, must be labeled "fuente no oficial" in all reports.
→ If access available: replace afip.ts with official endpoint.

**Q4: Ground truth data for GNN training**
Sprint 5 requires labeled corrupt subgraphs. For Causa Vialidad, Causa Cuadernos, Skanska, Odebrecht — is there structured data (company names, contract IDs, amounts, relationships) from court filings or journalism investigations already available, or does that labeling work need to be done from scratch?
→ Without labels, GNN training produces no reliable model.

**Q5: 2024 Córdoba data**
Dataset IDs only cover 2019-2023. Has the 2024 XLSX been published at gobiernoabierto.cordoba.gob.ar? If so, what is the dataset version ID?

**Q6: Next municipality connector**
Which of the 13 municipalities in `municipios-cordoba.ts` should be targeted after Córdoba Capital? Do any publish XLSX or CSV through open data portals?

**Q7: PDF export vs Evidence.dev**
CLAUDE.md roadmap mentions "Exportar expediente a PDF." Sprint 6 proposes Evidence.dev static HTML instead (more auditable, URL-shareable). Is PDF export required as a deliverable, or does Evidence.dev replace it?

---

## EXECUTION CHECKLIST FOR NEXT SESSION

Run these first thing in the next session (in order):

```bash
# 1. Verify current build state
cd backend && npm run build

# 2. Verify current test state
cd backend && npm test

# 3. Confirm dead files to delete
ls frontend/supabase/
ls "frontend/Other files/"
ls frontend/tmp_*.json

# 4. Then begin Sprint 1 tasks
```

---

*All claims in this document derived from source code only.*
*Documentation treated as non-authoritative until confirmed by code.*
*No files were modified during this audit session.*
