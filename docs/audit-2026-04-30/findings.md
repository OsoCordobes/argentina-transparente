# ARGOS · Audit 12h Autonomous Run · 2026-04-30

> Inicio: 2026-04-30 · Branch: `feat/backend-data-audit-12h` (desde `main` @ `99bdb67`)
> Modo: autónomo, sin supervisión, commit cada hora
> Sandbox: Linux `/home/user/argentina-transparente` (el prompt asume Windows; adaptado)

---

## DECISIÓN 2026-04-30 T+0:00 · Estrategia híbrida ante bloqueos de runtime

**Reality check empírico al inicio:**

| Recurso | Estado | Impacto en misión |
|---|---|---|
| Neo4j en `localhost:7687` | 🔴 NO corre | Fase 2 (coherencia Neo4j live) imposible |
| Docker daemon | 🔴 NO corre (no socket) | No puedo levantar Neo4j vía contenedor |
| Archivo `.duckdb` | 🔴 NO existe | DuckDB se crea on-the-fly desde seeds; sin seeds las tablas estarán vacías |
| Seeds externos (cordoba.gob.ar XLSX, IGJ CSV, AFIP) | 🔴 No verificados | Probablemente requieren red + tiempo + buena suerte de portal up |
| Chrome MCP | 🔴 No disponible | Fase 4 (smoke visual) imposible |
| Playwright Python | 🔴 No instalado | Plan B de smoke también no inmediato |
| `bun` | 🟢 Disponible | Útil para frontend |
| `git`, `node`, `npm`, `python3`, `npx` | 🟢 Disponibles | Suficiente para audit estático |
| `origin/main` con V4 mergeado | 🟢 Confirmado (commit `99bdb67`) | El plan de la sesión anterior se mergeó (PR #8) ✅ |

**Decisión tomada autónomamente** (regla del prompt: "El usuario NO está disponible. Tomá decisiones razonables. Documentá."):

→ **Pivot a auditoría estática defensible**. El código (schemas, seeds, endpoints) es la fuente de verdad. Si el código crea la estructura correcta y los endpoints consumen las tablas correctas, poblar la DB es una operación reproducible (corren los seeds y listo). Lo que necesitamos auditar es **si el código está bien**, no la instancia particular de DB que tenga el sandbox.

**Qué cambia respecto al plan original:**

| Fase | Plan original | Ejecutado |
|---|---|---|
| 1 | Row counts + % NULL en DuckDB live | Schema + seeds + endpoints + grep de uso. Row counts marcados como "requiere DB poblada" |
| 2 | Queries Cypher contra Neo4j live | Lectura de `seed-neo4j.ts` + endpoints `grafo.ts` + verificar arquetipos en código |
| 3 | LIVE vs MOCK frontend ↔ backend | SE PUEDE — análisis estático puro |
| 4 | Smoke browser por tab | DOWNGRADE: smoke `curl` por endpoint + `tsc --noEmit` + `npm test` |
| 5 | SQL/Cypher buscando mocks + click-through | DOWNGRADE: grep en código por MOCK/FIXTURE/lorem/__TEST + verificar que cada endpoint tenga `fuente_url` en su shape |
| 6 | Reporte final | SE HACE íntegro |

**Qué NO se auditó por bloqueo y queda como deuda explícita** (con runbook para retomar):
- Row counts reales por tabla DuckDB
- % NULL por columna real
- Coherencia Neo4j live (qué % del universo cumple cada arquetipo en datos reales)
- Smoke visual por ruta
- Verificación click-through aleatoria contra portales oficiales

Cada uno con script propuesto en el reporte ejecutivo final para que el próximo runner los ejecute en 30-60 min con DB poblada.

---

## Notas operativas

- TodoWrite inicializado con 8 sub-tareas
- Findings se escribe en tiempo real (vivo durante toda la sesión)
- Commit cada hora con mensaje descriptivo
- Sub-archivos: `01-backend-db-audit.md`, `02-neo4j-coherence.md`, `03-frontend-wiring.md`, `04-tab-by-tab.md`, `05-anti-falseness.md`, `00-EXECUTIVE-SUMMARY.md`

---

## Stream de findings (tiempo real)

(secciones se agregan abajo conforme avanzo)


---

## FASE 1 · Auditoría DuckDB (✅ completada)

**Output**: `01-duckdb-inventory.md` (subagent) + `01-endpoints-inventory.md` (subagent)

### DuckDB schema highlights
- **39 tablas definidas** en `backend/src/lib/db.ts`
- **14 activas** (seed + lectura por endpoint): contratos, señales_cache, empresas, agentes_publicos, presupuesto_ejecucion, personas_juridicas, personas_fisicas, igj_entidades, igj_autoridades, rns_personas_juridicas, declaraciones_juradas, cargos_funcionarios, pagos_contrato
- **18 orphan inputs**: seeded pero solo consumidas por engine/detectores (no por endpoints user-facing). icij_entidades, opensanctions_matches, boletin_actos, ocr_jobs, identity_matches, etc.
- **5 zombie outputs**: schema preparado pero **0 filas**: `auditorias_tribunal_cuentas`, `obras_publicas`, `transferencias`, `aportantes_campanas`, `licitaciones_llamado`
- **7 issues críticos**: CUIT format inconsistency, DNI named "cuit" en agentes_publicos, dates como TEXT, no FK constraints, regex bug "SPA SA" → "SPA S", DOUBLE precision loss en montos ARS, identity_matches sin invalidación

### Endpoints (51 total)
- **50 LIVE / 1 MOCK** (`/health` hardcoded version, OK para k8s)
- **10 endpoints sin `fuente_url`** — viola CLAUDE.md §4
- **0 cobertura de tests de rutas** (solo unit/lib)
- 4 endpoints con fallback empty cuando Neo4j down (graceful degradation OK)

### Hallazgo cruzado vs audit previo (2026-04-26)
ANALISIS-DATOS-ARGOS.md decía "95% de datos no expuestos" — **OBSOLETO**. Las iter 2-3 del roadmap se ejecutaron: `/api/actores/*` y `/api/actores-d6` ahora consumen las 4 tablas que estaban "dormidas".

---

## FASE 3 · Frontend wiring (✅ completada)

**Output**: `03-frontend-wiring.md` (subagent)

### 12 pages — verdict
- **9 LIVE through-and-through**
- **2 MIXED**:
  - `Dinero.tsx` cols 0-1 Sankey desde `lib/argos/dinero-flujo.ts` estático — necesita `/api/dinero/sankey-jerarquico`
  - `ActoresD6.tsx` filtros split: backend solo recibe `q, tipo, conSenales`, el resto cliente
- **1 LOCAL** (solo localStorage): delta `Δ` en ForensicHeader sin endpoint backend

### Mismatches
- 17 endpoints backend sin consumo de frontend (alertas, chat LLM, cobertura) — features de infraestructura

### Compliance
- Datos estáticos marcados con `tone: 'warn', estimated: true` o banners amarillos — ✅ OK

---

## FASE 4 (parcial) · Tests + tsc (✅)

- Backend `tsc --noEmit`: ✅ pasa
- Backend `vitest run`: ✅ **643 tests / 39 archivos** en 23s
- Frontend `tsc --noEmit`: ✅ pasa
- Playwright instalado en background

**Deuda explícita**: smoke `curl` por endpoint y smoke browser quedan bloqueados sin DB y sin Chrome MCP.

---

## FASE 5 · Anti-falseness (✅ completada)

**Output**: `05-anti-falseness.md`

- **0 leaks** de mock a producción
- **10 endpoints sin fuente_url** = mismo finding Fase 1, raíz: `señales_cache` no tiene columna fuente_url. Migración SQL propuesta.
- **Tono user-facing neutral** ✅
