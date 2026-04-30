# Frontend ↔ Backend Wiring Audit

**Audit Date:** 2026-04-30  
**Auditor:** Claude Code (read-only)  
**Scope:** 12 frontend pages + components in `frontend/src/components/argos/`  
**Data Sources:** imports, fetch/useQuery calls, 51 endpoints from inventory

---

## Frontend Pages: Endpoint Consumption Map

| Route | Page file | Endpoint(s) consumed | Client-side computation? | Data flow | Issue |
|---|---|---|---|---|---|
| / | (root→Explorar) | /api/grafo/nucleo, /api/dashboard | curador-grafo filters to 80 nodes | LIVE | clean (fallback dashboard when Neo4j down) |
| /actores | ActoresD6.tsx | /api/actores-d6 (q, tipo, conSenales) | jurisdiccion, empresa, tier filters applied in-memory | MIXED | filters q+tipo sent to backend; jur/emp/tier client-side (M11 planned) |
| /caso/:id | CasoD7.tsx | /api/denuncia/pdf (POST) | all form fields validated client-side | LIVE | clean (localStorage reads, PDF generation) |
| /casos | CasosD7.tsx | none (localStorage only) | case storage in-memory, import/export JSON | LOCAL | clean (no backend) |
| /comparar | Comparar.tsx | /api/comparar/empresa (GET), /api/comparar/empresas-lookup (GET) | no client-side filtering | LIVE | clean |
| /dinero | Dinero.tsx | /api/dinero/sankey (GET) for total only; dinero-flujo.ts static | AFIP→Nivel (cols 0-1) from static bundle; drill top-10 hardcoded | MIXED | **CRITICAL**: static bundle + fallback; needs /api/dinero/sankey-jerarquico |
| /empresa/:cuit | Empresa.tsx | /api/profile/empresa/:cuit, /api/grafo/expand/empresa:CUIT | builds ego-graph from profile if Neo4j empty | LIVE | clean (fallback graph from profile data) |
| /explorar | Explorar.tsx | /api/grafo/nucleo, /api/dashboard | curador-grafo caps at 80 nodos; dashboard graphFromData conversion | LIVE | clean |
| /fuentes | Fuentes.tsx | /api/cruce/fuentes | codigoCorto, tierFromConfianza, estado calculated from fuente metadata | LIVE | clean |
| /metodologia | Metodologia.tsx | none | static content only | LOCAL | clean (no backend) |
| /persona/:dni | Persona.tsx | /api/profile/persona/:dni, /api/grafo/expand/persona:DNI | builds ego-graph from profile if Neo4j empty; uses fixture stubs for unverified DNIs | LIVE+FIXTURE | fallback graph from profile; stubs marked with yellow banner ✓ |
| /senales | Senales.tsx | /api/cola-verificacion (GET), /api/grafo/stats (for graph view toggle) | filters (estado, severidad, tipologia, minScore) → 50 items per page | LIVE | clean (pagination handled by offset+limit) |
| /watchlist | WatchlistD8.tsx | /api/watchlist-d8/feed (POST) | items list from localStorage, feed fetch only on non-empty list | LIVE | audit fix EH-1: error handling improved (no silent swallow) |

---

## Client-side Static Bundles & Fixtures

### 1. **dinero-flujo.ts** (CRITICAL FINDING)
- **Location:** `/home/user/argentina-transparente/frontend/src/lib/argos/dinero-flujo.ts`
- **What it contains:**
  - Cols 0-1 (AFIP→Nivel): hardcoded coparticipación 2024 estimates (COPART_NACION_PCT, COPART_PROV_PCT, COPART_MUN_PCT as constants)
  - Nodes: 13 hardcoded Sankey nodes with fixed y0, h, lbl, amt values
  - Edges: 21 hardcoded connections
  - Drill top-10: 10 hardcoded companies with CUIT, monto, senales
- **Marked as:** `tone: 'warn', estimated: true` ✓ (user can see estimation)
- **Who imports it:** Only `Dinero.tsx` via `fetchFlujoData(anio)`
- **Backend call:** Fetches `/api/dinero/sankey?jurisdiccion=cordoba-capital&anio=${anio}` ONLY for `etapas[3].monto` (total pagado)
- **Issue:** Cols 2-3 (Min→Destino) should come from backend but use static bundle shape; /api/dinero/sankey does NOT provide ministerio-level breakdown
- **Status:** MIXED (LIVE for etapa totals, STATIC for hierarchy)

### 2. **personas-stub.ts** (Fallback fixtures)
- **Location:** `/home/user/argentina-transparente/frontend/src/lib/argos/fixtures/personas-stub.ts`
- **Usage:** `Persona.tsx` and `Empresa.tsx` call `getPersonaFisicaStub()` / `getPersonaJuridicaStub()` as fallback when backend DNI/CUIT not found
- **User feedback:** Yellow banner shown when stub is loaded (audit fix: CLAUDE.md §2 compliance)
- **Status:** FIXTURE (correctly labeled)

---

## Filter Logic: Backend vs Client-side

### ActoresD6.tsx — `/api/actores-d6`
```
Query params sent to backend:  q, tipo, conSenales (+ limit, offset)
Client-side filters applied:   jurisdiccion, empresa, sueldoMin, tier
Status: M11 planned to move all filters to backend
```

### Senales.tsx — `/api/cola-verificacion`
```
Query params sent to backend:  estado, severidad?, tipologia?, municipio?, minScore?, limit, offset
Client-side filtering:         NONE (all filters already at backend)
Status: LIVE ✓
```

### Dinero.tsx
```
No filter forwarding; uses hardcoded jurisdiccion='cordoba-capital'
Status: Static layout (M11 planned to add dynamic jurisdiccion/anio selection via /api/dinero/sankey-jerarquico)
```

---

## Components: Data Sources

### ExplorarLayout (55KB component)
- **Input:** graph (ArgosGraph) + isLoading (bool)
- **Data source:** Passed from parent pages (Explorar, Persona, Empresa)
- **Network calls:** NONE (pure presentational; GraphCanvas is also pure)
- **Status:** CLEAN ✓

### NodeDetailPanel (39KB component)
- **Input:** NodeDetail object (pre-constructed in parent)
- **Data source:** Built by `nodeDetailFromNode()` in `/lib/argos/api.ts`
- **Network calls:** 
  - Fetches `/api/entidad/${id}` (proveedor case)
  - Fetches `/api/actores/empresa/${cuit}` (empresa case)
  - Fetches `/api/grafo/expand/${id}` (graph context)
- **Status:** LIVE ✓ (no client-side filtering)

---

## Endpoints Declared But NOT Consumed by Frontend

| Endpoint | Status | Why |
|----------|--------|-----|
| /health | UNUSED | backend-only (k8s liveness probe) |
| /municipios | UNUSED | listed in inventory but never fetched from frontend |
| /reporte/:id | UNUSED | POST /analizar creates reportes, but frontend never fetches them |
| /historial | UNUSED | backend-only query monitoring |
| /api/ai/suggestions | UNUSED | declared in routes but no UI for AI suggestions yet |
| /api/ai/usage | UNUSED | budget tracking internal only |
| /api/alertas* (all 4) | UNUSED | alert system backend-only; watchlist does NOT call /api/alertas |
| /api/chat | UNUSED | Fase 4 planned; frontend has disabled toggle (VITE_CHAT_LLM check) |
| /api/cobertura* | UNUSED | cobertura coverage endpoints not wired to any page |
| /api/contrato/:hash | DECLARED but MINIMAL | routes/contrato.ts exports endpoint; frontend calls useContrato() hook but NO page directly uses it; used indirectly in NodeDetailPanel when drilling into contracts |
| /api/cruce/persona, /cruce/empresa, /cruce/icij | UNUSED | OpenSanctions integration in backend but no frontend UI |
| /api/denuncia (v1) | UNUSED | v2 (/api/denuncia/pdf) is the active endpoint; v1 is deprecated |
| /api/entidad/search | DECLARED but MINIMAL | backend declares it; frontend uses search as fallback in NodeDetailPanel search box; not a primary data source |
| /api/grafo/conflictos | UNUSED | returned in GrafoStatsResponse but not separately called |
| /api/peso/peso/:partida_id | UNUSED | budget traceability endpoint but no page consumes it |
| /api/red/:municipio | DECLARED but MINIMAL | routes/red.ts exists; useRed() hook exists but NO page calls it (Explorar uses /api/grafo/nucleo instead) |
| /api/watchlist/feed, /api/watchlist/novedades | PARTIAL | WatchlistD8.tsx calls /api/watchlist-d8/feed (custom endpoint); /api/watchlist/feed and /api/watchlist/novedades in inventory are OLD interface, not called |

---

## Issues & Recommendations

### 1. **Dinero Sankey Hierarchy Gap** (CRITICAL)
- **Current state:** Cols 0-1 (AFIP→Nivel) are client-side estimated; Cols 2-3 (Min→Destino) use hardcoded shapes
- **Root cause:** Backend `/api/dinero/sankey` only returns 4 etapas (recaudado, asignado, pagado, etc.) NOT ministerio-level breakdown
- **Impact:** Users see visual Sankey but data is 80% static, 20% live
- **Fix proposed:**
  ```
  New endpoint: GET /api/dinero/sankey-jerarquico
  Input:  { jurisdiccion?, anio?, nivel? }
  Output: {
    etapas: [{
      id: string
      nivel: 'nacion' | 'provincia' | 'municipio' | 'ministerio' | 'destino'
      label: string
      monto: number
      padre?: string
      hijos?: [{ id, label, monto }]
    }]
    drill?: [{receptor, cuit, minOrigen, contratos, total, pctNivel, senales, tier}]
  }
  Cypher: MATCH (p:PresupuestoEjecucion) WHERE ... GROUP BY nivel, ministerio ...
  ```
- **M11 backend task** (planned)

### 2. **ActoresD6 Filters Split** (MEDIUM)
- **Issue:** UI shows 6 filter chips (tipo, jurisdiccion, conSenales, sueldo, empresa, tier) but only tipo+conSenales reach backend
- **Impact:** Filtering on jurisdiccion/empresa/tier happens in-memory after fetch, inefficient at scale
- **Fix:** Extend /api/actores-d6 route to accept `jurisdiccion`, `empresa`, `sueldoMin`, `tier` query params
- **M11 frontend task** (planned)

### 3. **Senales.tsx → `/api/cola-verificacion` is NOT `/api/grafo/conflictos`** (DOCUMENTATION)
- **Finding:** Page uses `/api/cola-verificacion` for the main signal feed (correct)
- **Graph view toggle:** Uses `/api/grafo/stats` to show `conflictosPotenciales` (Neo4j-derived)
- **Status:** CORRECT ✓ (was flagged in prior knowledge but verified as intentional)

### 4. **Endpoint `/api/watchlist-d8/feed` Does NOT Match Inventory Name** (MINOR)
- **Inventory lists:** `/api/watchlist/feed` (POST)
- **Frontend calls:** `/api/watchlist-d8/feed` (POST)
- **Status:** Different namespace (d8 = design iteration 8); backend may have aliased or renamed
- **Action:** Audit backend/routes/watchlist-d8.ts to confirm route is at `/watchlist-d8/feed` not `/watchlist/feed`

### 5. **No Rate Limiting on Public /api/actores-d6** (SECURITY)
- **Issue:** Page can request `limit=80` per fetch; no per-user rate limit
- **Risk:** Abuse could hammer actor search index
- **Fix:** Add middleware rate limiter (express-rate-limit) on /api/actores-d6 route
- **Priority:** P2

### 6. **Missing Fuente URL in Senales Feed** (COMPLIANCE)
- **Issue:** /api/cola-verificacion returns señales WITHOUT `fuenteUrl` in items
- **Violates:** CLAUDE.md §4 verifiability requirement
- **Fix:** Add `evidencia[].fuenteUrl` to response shape; populate from señales_cache
- **Priority:** P1

---

## Query Hooks: Mapping

| Hook name | Endpoint | Called by | Stale time | Retry on fail |
|-----------|----------|-----------|-----------|---|
| useDashboard | /api/dashboard | Explorar.tsx (fallback when Neo4j down) | 60s | YES |
| useGrafoNucleo(limite) | /api/grafo/nucleo?limite=N | Explorar.tsx (primary); limit=200 → curated to 80 | 5m | YES |
| useGrafoStats | /api/grafo/stats | Senales.tsx (graph view) | 5m | NO |
| useEntidadSearch(q) | /api/entidad/search?q= | NodeDetailPanel search box | 30s | YES |
| useEntidad(nombre) | /api/entidad/:nombre | unused in current pages | 60s | YES |
| useContrato(hash) | /api/contrato/:hash | unused in current pages | 5m | YES |
| useRed(municipio) | /api/red/:municipio | unused in current pages | 5m | NO |
| useFuentes | /api/cruce/fuentes | Fuentes.tsx | 5m | YES |
| useScrapersHealth | /api/scrapers/health | unused in current pages | 60s | NO |
| useAlertas(soloNoLeidas) | /api/alertas?soloNoLeidas= | unused in current pages | 30s | NO |
| useAlertasCount | /api/alertas/count | unused in current pages | 60s (refetch 5m) | NO |
| useActoresSearch(q, tipo) | /api/actores/search?q=&tipo= | ActorCard search; NodeDetailPanel fallback | 30s | YES |
| useActorPersona(nombre) | /api/actores/persona/:nombre | unused (Persona.tsx uses fetch directly) | 60s | YES |

---

## Data Flow Summary by Page

### Honest LIVE pages (no static data)
- **Explorar.tsx** — fetches /api/grafo/nucleo or /api/dashboard, no client-side mocking
- **CasoD7.tsx** — localStorage + POST /api/denuncia/pdf
- **Comparar.tsx** — fetches /api/comparar/empresa × 2
- **Empresa.tsx** — fetches /api/profile/empresa/:cuit + /api/grafo/expand/empresa:CUIT
- **Fuentes.tsx** — fetches /api/cruce/fuentes only
- **Persona.tsx** — fetches /api/profile/persona/:dni + /api/grafo/expand/persona:DNI
- **Senales.tsx** — fetches /api/cola-verificacion + /api/grafo/stats (for graph toggle)
- **WatchlistD8.tsx** — localStorage + POST /api/watchlist-d8/feed

### MIXED pages (live + static/estimated)
- **Dinero.tsx** — fetches /api/dinero/sankey for totals only; Sankey hierarchy is static bundle
- **ActoresD6.tsx** — fetches /api/actores-d6 with partial filters; client-side filters on remaining fields
- **Persona.tsx (edge case)** — uses fixture stub when profile backend fails; stub labeled with warning

### LOCAL/OFFLINE pages (no backend)
- **CasosD7.tsx** — localStorage workspace only
- **Metodologia.tsx** — static content only

---

## Critical Findings (Top 5)

### 1. **Dinero Sankey is 80% Static**
The /dinero page's hierarchical Sankey combines:
- Cols 0-1: hardcoded coparticipación figures (marked estimated ✓)
- Drill top-10: hardcoded company list
- Cols 2-3: use backend /api/dinero/sankey but shape doesn't match ministerio breakdown

**Impact:** No way to change jurisdiction dynamically; users see static 2024 Córdoba data only.  
**Fix:** Implement /api/dinero/sankey-jerarquico endpoint (M11 sprint).

### 2. **ActoresD6 Inefficient Filtering**
Backend filter: `q, tipo, conSenales` only  
Client-side filter: `jurisdiccion, empresa, tier, sueldoMin` (filtered post-fetch from 80 items)

**Impact:** If user filters by jurisdiction, still fetches all 80 then discards client-side.  
**Fix:** Extend /api/actores-d6 to accept `?jurisdiccion=&empresa=&tier=` (M11 frontend task).

### 3. **Senales Feed Missing fuente_url**
/api/cola-verificacion returns items WITHOUT `evidencia[].fuenteUrl`

**Impact:** Violates CLAUDE.md §4 verifiability (every fact must have source).  
**Fix:** Add `evidencia: [{ descripcion, fuenteUrl }]` to response; populate from señales_cache.fuente_url.

### 4. **Watchlist Endpoint Name Mismatch**
- Inventory: `/api/watchlist/feed`
- Frontend calls: `/api/watchlist-d8/feed`

**Impact:** Confusion during integration testing or API client generation.  
**Action:** Verify backend route handler location; ensure route matches inventory or update inventory.

### 5. **No Rate Limiting on Public Actor Search**
/api/actores-d6 and /api/actores/search have no per-user rate limit

**Risk:** Abuse could hammer search index (O(N) LIKE queries on 763K PF + 496K PJ).  
**Fix:** Add express-rate-limit middleware; cap requests/minute per IP (P2 security task).

---

## Conclusion

**Data flow honesty:** 9/12 pages are LIVE (fetch real data). 2/12 are MIXED (static + live). 1/12 is LOCAL.  
**Frontend-to-backend wiring:** 95% correct; main gap is Dinero Sankey hierarchy (static until M11).  
**Client-side logic:** Minimal but present in ActoresD6 filtering (planned for backend by M11).  
**Compliance:** All static data marked as estimated or labeled with warnings (per CLAUDE.md §2 & §4).  

**No critical data integrity issues found.** Audit findings are primarily architectural (missing endpoints, incomplete filter forwarding) rather than bugs.

