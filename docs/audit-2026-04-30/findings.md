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

