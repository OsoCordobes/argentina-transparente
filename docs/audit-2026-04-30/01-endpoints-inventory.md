# Backend Endpoints Inventory (static audit)

**Audit Date:** 2026-04-30  
**Auditor:** Claude Code  
**Scope:** 24 route files + 3 index.ts endpoints  
**Total Endpoints:** 51

---

## Endpoints by File

| Method | Path | File:line | Input | Output shape | LIVE/MOCK | Tables/Query | Notes |
|--------|------|-----------|-------|--------------|-----------|--------------|-------|
| GET | /health | index.ts:64 | none | { ok, version } | MOCK | none | hardcoded response |
| GET | /municipios | index.ts:69 | none | [ { id, nombre, aniosDisponibles, tipo } ] | LIVE | connectors metadata | reads from memory (registerFuentes) |
| GET | /reporte/:id | index.ts:109 | id (path) | reporte object | LIVE | reportes | getReporte(id) from db |
| POST | /analizar | analizar.ts:10 | { municipioId, anioDesde, anioHasta } | { ok, id, expediente } | LIVE | contratos, empresas, señales | connector.getContratos + calcularSeñales + Claude 3.5 |
| GET | /historial | historial.ts:6 | none | [ históricos ] | LIVE | reportes/history | getHistorial(20) |
| GET | /api/landing | landing.ts:40 | none | { hero, feed, sumario } | LIVE | contratos, señales_cache, agentes_publicos | dbAll multiple queries |
| GET | /api/actores/search | actores.ts:39 | q, tipo, limit | { hits[], total } | LIVE | agentes_publicos, igj_autoridades, igj_entidades, rns_personas_juridicas, empresas, contratos | 5 SQL queries, dedup JS |
| GET | /api/actores/persona/:nombre | actores.ts:200 | nombre (path) | { nombre, identificadores, cargos_publicos, entidades_dirigidas, contratos_como_proveedor, cruces } | LIVE | agentes_publicos, igj_autoridades, igj_entidades, contratos | 3 dbAll calls |
| GET | /api/actores/empresa/:cuit | actores.ts:288 | cuit (path) | { cuit, canonico, empresas, rns, igj, autoridades, contratos, cruce_externo } | LIVE | empresas, rns_personas_juridicas, igj_entidades, igj_autoridades, opensanctions_matches | 3 lookups + opensanctions join |
| GET | /api/actores-d6 | actores-d6.ts:26 | q, tipo, conSenales, minMonto, limit, offset | { items[], paginacion } | LIVE | personas_juridicas, personas_fisicas, contratos, señales_cache | UNION ALL with LEFT JOIN aggregates |
| POST | /api/ai/suggestions | ai.ts:71 | { caso_id?, entities?, pinned_entity_ids? } | { ok, suggestions[], costo_usd, cache_hit_pct } | LIVE | none (Claude Haiku 4.5 call) | Anthropic API call w/ budget guard |
| GET | /api/ai/usage | ai.ts:183 | none | { budget_usd, acumulado_semana_usd, remaining_usd, por_endpoint } | LIVE | llm_budget table | getCostoAcumulado + getCostoPorRoute |
| GET | /api/alertas | alertas.ts:10 | soloNoLeidas?, limit? | { ok, count, alertas } | LIVE | alertas table | getAlertas + countAlertasNoLeidas |
| GET | /api/alertas/count | alertas.ts:26 | none | { ok, ...count } | LIVE | alertas | countAlertasNoLeidas |
| POST | /api/alertas/:id/leer | alertas.ts:37 | id (path) | { ok } | LIVE | alertas | marcarAlertaLeida(id) |
| POST | /api/alertas/leer-todas | alertas.ts:48 | none | { ok, marcadas } | LIVE | alertas | marcarTodasLeidas() |
| POST | /api/alertas/detectar | alertas.ts:59 | none | { ok, ...resultado } | LIVE | alertas, señales_cache | detectarAlertas() (cron trigger) |
| POST | /api/chat | chat.ts:99 | { message, history?, context? } | SSE stream { delta?, entidades?, done?, tokens? } | LIVE | Neo4j (if available) | Claude Sonnet 4.6 + tool_use consultar_grafo |
| GET | /api/cobertura | cobertura.ts:157 | none | { jurisdicciones[] } | LIVE | presupuesto_ejecucion, contratos | FULL OUTER JOIN with aggregates |
| GET | /api/cobertura/jurisdiccion/:jurisdiccion | cobertura.ts:45 | jurisdiccion (path), reparticion? | { jurisdiccion, monto_declarado_oficial, monto_trazado, pct_cobertura, nivel, huecos_principales, notas } | LIVE | presupuesto_ejecucion, contratos | 4 dbAll calls with optional reparticion filter |
| GET | /api/cola-verificacion | cola-verificacion.ts:68 | estado, severidad?, tipologia?, municipio?, minScore?, limit, offset | { items[], paginacion } | LIVE | señales_cache | dynamic WHERE with param binding |
| GET | /api/cola-verificacion/resumen | cola-verificacion.ts:146 | municipio? | { count by estado × severidad } | LIVE | señales_cache | contarSeñalesPorEstadoYSeveridad |
| POST | /api/cola-verificacion/:id | cola-verificacion.ts:157 | id (path), { estado, auditor } | { ok, id, estadoNuevo } | LIVE | señales_cache | requireAdminToken middleware + actualizarEstadoSeñal |
| GET | /api/comparar/empresa | comparar.ts:28 | cuit | { MetricasEmpresa } | LIVE | personas_juridicas, contratos, señales_cache | sparkline by year, aggregates |
| GET | /api/comparar/empresas-lookup | comparar.ts:91 | q | { items[] } | LIVE | personas_juridicas | LIKE %q% search |
| GET | /api/contrato/:hash | contrato.ts:26 | hash (path) | { ok, contrato, afip, señales, cadenaCustodia } | LIVE | contratos, empresas, señales_cache | getContratoPorHash + getSeñalesPorCuit |
| GET | /api/cruce/fuentes | cruce.ts:9 | none | { ok, fuentes } | LIVE | fuentes_datos | listarFuentes() |
| GET | /api/cruce/persona | cruce.ts:21 | nombre | { ok, query, results[] } | LIVE | OpenSanctions API (external) | searchOpenSanctions + esRiesgoAlto |
| GET | /api/cruce/empresa | cruce.ts:50 | nombre, pais? | { ok, query, results[] } | LIVE | OpenSanctions API (external) | matchOpenSanctions |
| GET | /api/cruce/icij | cruce.ts:85 | nombre | { ok, query, baseCargada, totalEnBase, resultados[], instruccion? } | LIVE | icij_entidades (local cache) | buscarICIJPorNombre |
| GET | /api/dashboard | dashboard.ts:10 | none | { ok, totalContratos, totalSeñales, municipios, topEntidades, señales } | LIVE | contratos, señales_cache, empresas | 5 dbAll calls (Promise.all) |
| POST | /api/denuncia | denuncia.ts:9 | { destinatario, denuncianteNombre, denuncianteDni, ..., entidades?, contratos?, señales? } | PDF binary (200) + X-Document-SHA256 header | LIVE | none (PDF generation) | renderDenunciaPDF + crypto.sha256 |
| POST | /api/denuncia/pdf | denuncia.ts:73 | { denunciante, destinatario, casoTitulo, ..., senalIds?, contratoHashes?, entidadCuits? } | PDF binary + headers (SHA256, ID, timestamp) | LIVE | contratos, señales_cache, personas_juridicas | armarDenunciaDesdeIds + renderDenunciaPDF |
| GET | /api/dinero/sankey | dinero.ts:17 | jurisdiccion?, anio? | { filtro, etapas[], gaps[] } | LIVE | presupuesto_ejecucion | SUM aggregates by lifecycle stage |
| GET | /api/dinero/jurisdicciones | dinero.ts:76 | none | { jurisdicciones[] } | LIVE | presupuesto_ejecucion | GROUP BY jurisdiccion with min/max anio |
| GET | /api/dinero/partidas | dinero.ts:101 | jurisdiccion?, anio?, programa?, limit | { filtro, partidas[] } | LIVE | presupuesto_ejecucion | 2 queries: list + sparkline by year |
| GET | /api/entidad/search | entidad.ts:11 | q | { ok, entidades } | LIVE | contratos | searchEntidades(q, 30) |
| GET | /api/entidad/:nombre | entidad.ts:64 | nombre (path) | { ok, entidad: { nombre, montoTotal, ...timeline, contratos[], señales[] } } | LIVE | contratos, empresas, señales_cache, igj + RNS | getContratosPorProveedor + AFIP enrichment |
| GET | /api/grafo/nucleo | grafo.ts:20 | limite?, municipio? | { nodes[], edges[], graphAvailable } | LIVE (or empty) | Neo4j | getGrafoNucleo (returns {} if unavailable) |
| GET | /api/grafo/stats | grafo.ts:34 | none | { graphAvailable, ...stats } | LIVE (or empty) | Neo4j | getGrafoStats |
| GET | /api/grafo/conflictos | grafo.ts:48 | jurisdiccion?, tipologia?, minScore?, limit? | { conflictos[], graphAvailable } | LIVE (or empty) | Neo4j | listarConflictos with optional filters |
| GET | /api/grafo/expand/:nodeId | grafo.ts:65 | nodeId (path) | { nodes[], edges[], graphAvailable } | LIVE (or empty) | Neo4j | expandirNodo(nodeId) |
| GET | /peso/peso/:partida_id | peso.ts:97 | partida_id (path) | { partida, ciclo, contratos[], resumen, notas } | LIVE | cadena_de_pago (view/table) | dbAll with LEFT JOIN on contratos |
| GET | /api/profile/persona/:dni | profile.ts:16 | dni (path) | { dni, cuit, apellidoNombre, ...cargosPublicos[], direccionesEmpresas[], ddjj[], aportesCampana[], señales[] } | LIVE | personas_fisicas, cargos_funcionarios, v_persona_dirige_empresa, declaraciones_juradas, aportantes_campanas, señales_cache | 5 dbAll calls (Promise.all) |
| GET | /api/profile/empresa/:cuit | profile.ts:166 | cuit (path) | { cuit, razonSocial, ...directores[], contratos[], pagos[], señales[], transferenciasRecibidas[] } | LIVE | personas_juridicas, v_persona_dirige_empresa, contratos, pagos_contrato, transferencias, señales_cache | 5 dbAll calls (Promise.all) |
| GET | /api/red/:municipio | red.ts:7 | municipio (path) | { ok, municipio, elements: { nodes, edges }, stats } | LIVE (or error 503) | Neo4j | getRedCytoscape(municipio) Cytoscape format |
| GET | /api/scrapers/health | scrapers.ts:10 | none | { ok, resumen: { total, ok, warning, error }, scrapers[] } | LIVE | scrapers_health | getScrapersHealth() |
| POST | /api/watchlist/feed | watchlist-d8.ts:26 | { items[] } | { alertas[], total } | LIVE | señales_cache, personas_fisicas | 2 queries (LIKE searches by CUIT/nombre) |
| POST | /api/watchlist/novedades | watchlist.ts:33 | { items[] } | { ok, novedades[], total } | LIVE | contratos, señales_cache | 2 COUNT queries per item |

---

## Summary Statistics

- **Total endpoints:** 51
- **LIVE endpoints:** 50 (98%)
- **MOCK endpoints:** 1 (GET /health — hardcoded version)
- **MIXED (LIVE with fallback):** 4 (grafo/*, chat uses Neo4j + fallback empty)

---

## Observations by Category

### LIVE Data Sources

1. **DuckDB (SQL)**: 40 endpoints query DuckDB tables
2. **Neo4j (Cypher)**: 4 endpoints (grafo/*, red, chat with optional tool_use)
3. **External APIs**: 4 endpoints
   - OpenSanctions (cruce/persona, cruce/empresa)
   - Claude API (chat, ai/suggestions, ai/usage budget tracking)
4. **PDF Generation**: 2 endpoints (denuncia, denuncia/pdf)

### Mock Endpoints

- **GET /health** — Hardcoded `{ ok: true, version: '3.0.0' }` — likely for k8s liveness probe

### Endpoints WITHOUT `fuente_url` in response

🔴 **Compliance gaps (CLAUDE.md §4 requires verifiability):**

1. **GET /api/landing** — feed includes señales with NO fuente_url
2. **GET /api/dashboard** — señales in response lack fuente_url
3. **GET /api/actores/search** — hits include `href` (app route, not source URL)
4. **POST /api/chat** — streaming response has NO fuente_url for facts from Cypher
5. **GET /api/cola-verificacion** — items lack fuente_url
6. **GET /api/comparar/empresa** — metrics lack source attribution
7. **POST /api/ai/suggestions** — suggestions lack action fuente_url
8. **GET /api/dinero/sankey** — etapas lack presupuesto_ejecucion.fuente_url
9. **GET /api/dinero/partidas** — includes `fuenteUrl` ✓ (compliant)
10. **GET /api/grafo/nucleo**, **/expand**, **/conflictos** — graph nodes lack fuente_url

✓ **Compliant endpoints (include fuente_url or equivalent):**
- GET /api/entidad/:nombre → contratos include `fuenteUrl`
- GET /api/contrato/:hash → includes `fuenteUrl` in cadenaCustodia
- GET /api/profile/persona/:dni → cargosPublicos include `fuenteUrl`
- GET /api/profile/empresa/:cuit → contratos include `fuenteUrl`
- GET /peso/peso/:partida_id → partida includes `fuenteUrl`
- GET /api/dinero/partidas → partidas include `fuenteUrl`

---

## Endpoints with NO Test Coverage

Audit across `/backend/**/*.test.ts` shows **0 route integration tests** (all tests are unit/lib-level).

**Route files with zero test coverage:**
- routes/actores.ts
- routes/actores-d6.ts
- routes/ai.ts
- routes/alertas.ts
- routes/analizar.ts
- routes/chat.ts
- routes/cobertura.ts
- routes/cola-verificacion.ts
- routes/comparar.ts
- routes/contrato.ts
- routes/cruce.ts
- routes/dashboard.ts
- routes/denuncia.ts
- routes/dinero.ts
- routes/entidad.ts
- routes/grafo.ts
- routes/historial.ts
- routes/landing.ts
- routes/peso.ts
- routes/profile.ts
- routes/red.ts
- routes/scrapers.ts
- routes/watchlist.ts
- routes/watchlist-d8.ts
- index.ts top-level routes

**Note:** Signal detectors (engine/signals.ts) have 103 vitest unit tests. Library functions (db, graph) have targeted tests. But no E2E/integration tests for HTTP routes.

---

## Critical Findings (Top 5)

### 1. ⚠️ Neo4j Availability Cascade Risk
- Endpoints `/api/grafo/*`, `/api/red/:municipio`, `/api/chat` degrade gracefully when Neo4j unavailable
- However, `POST /api/chat` returns SSE stream; frontend may not detect 500 error in stream
- **Recommendation:** Add explicit `graphAvailable: false` to every chat response chunk

### 2. 🔴 Missing fuente_url in KPI Endpoints
- `GET /api/landing`, `/api/dashboard`, `/api/cola-verificacion` return señales WITHOUT source URLs
- Violates CLAUDE.md §4 requirement: "all user-facing data must include verifiability"
- **Recommendation:** Add `fuente_url` field to señales in cache or compute at query-time

### 3. 💰 Budget Guard Incomplete Coverage
- Only `/api/chat` and `/api/ai/suggestions` track budget against `ANTHROPIC_BUDGET_USD`
- `POST /analizar` calls `generarExpediente()` (Claude 3.5) but does NOT pre-check budget
- **Risk:** Single request could exhaust weekly budget without warning
- **Recommendation:** Add budget check to analizar route or async submit model

### 4. 🚨 No Rate Limiting on Public Endpoints
- `GET /api/actores/search` allows `limit=100` (capped to 100)
- `POST /api/watchlist/feed` allows `items[]` (capped to 50)
- `POST /api/chat` has NO request-level rate limit; only budget guard (money-based not rate-based)
- **Recommendation:** Add rate limiter middleware (e.g., express-rate-limit) on public endpoints

### 5. 🔐 Admin Token Validation Fragile
- `POST /api/cola-verificacion/:id` requires `X-Argos-Admin-Token` header
- Token stored in plaintext in `.env`; no rotation mechanism
- Token length check: `expected.length < 8` rejects short tokens, but no entropy validation
- **Recommendation:** Implement token rotation + audit log for all state changes on señales

---

## Query Complexity Notes

**High-cardinality queries (risk of timeouts on >1M rows):**
- `GET /api/actores/search` — runs 5 subqueries (LIKE substring match) → can be slow on 763K PF + 496K PJ
- `POST /api/watchlist/feed` — LIKE substring per actor ID → O(N) queries
- `GET /api/grafo/conflictos` — Neo4j Cypher with optional filters → unbounded result set (capped 100)

**Optimized queries (prepared statements + pagination):**
- `GET /api/cola-verificacion` — parameterized WHERE with limit+offset
- `GET /api/dinero/partidas` — 2-query strategy (list + sparkline aggregate)
- `GET /api/profile/empresa/:cuit` — Promise.all 5 queries in parallel

---

## Recommendations (Post-Audit Actions)

| Priority | Issue | Action | Owner |
|----------|-------|--------|-------|
| P0 | Missing fuente_url in KPI endpoints | Add to landing, dashboard, cola-verificacion responses | Backend |
| P1 | Budget guard not pre-checking analizar | Add assertBudget call before generarExpediente | Backend |
| P1 | Zero route test coverage | Create routes.e2e.test.ts with vitest + supertest | Backend |
| P2 | Neo4j error handling in SSE streams | Test failures + disconnect scenarios | Backend |
| P2 | Rate limiting on public endpoints | Add middleware (e.g., express-rate-limit) | Backend |
| P2 | Admin token rotation | Implement token versioning + audit log | Backend |

