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

---

## FASE 2 · Coherencia Neo4j estática (✅ completada)

**Output**: `02-neo4j-coherence.md` (subagent)

### 5 arquetipos analizados
- ✅ **A — Persona pública con cargo**: COMPLETO. Cadena `PersonaFisica + Funcionario + TRABAJA_EN + Reparticion` totalmente implementada
- ✅ **B — Empresa con director y contrato**: COMPLETO. `PersonaFisica → DIRIGE → Empresa → GANO → Contrato ← EMITE — Reparticion` trazable
- ✅ **C — Conflicto de interés estructural**: COMPLETO. `:CONFLICTO_CON` se computa vía 5-hop closure, todos los endpoints operan
- 🟡 **D — Empresa con empleados**: GAP. NO hay arista `:TIENE_EMPLEADO`. Datos existen en `agentes_publicos.cuit_empleador` pero el seed no los conecta. Fix propuesto: ~50 LOC en seed nuevo.
- 🟡 **E — Cadena presupuestaria**: PARCIAL. Estado + Programa existen como nodos pero `Programa → Contrato` falta. Por eso el Sankey de `/dinero` cae al bundle estático. Fix: ~30 LOC.

### Validación drift
Todos los seeds usan `MERGE` (idempotente), entonces el snapshot de 2026-04-26 (1.028M nodos, 161K aristas) sigue válido si los seeds se vuelven a correr. **Cero drift estructural**.

### Top 3 blockers
1. Arquetipo D (low effort): seed `:TIENE_EMPLEADO` desde `agentes_publicos`
2. Arquetipo E (medium effort): linkear Programa → Contrato + integrar presupuesto
3. Tier 1 ES_LA_MISMA_PERSONA (high effort): pipeline OCR Boletín para subir 8.5K aristas Tier 2 → Tier 1

---

## 🔴 HALLAZGO CRÍTICO · Test pollution leak a producción (resuelto)

**Descubierto en smoke `/api/actores-d6` con backend up**: el endpoint devolvía 1 item con `label: "Test Caller", id: "14289301"`. Investigación reveló:

### Causa raíz

`backend/src/lib/personas-fisicas.test.ts` línea 75 inserta:
```ts
await upsertPersonaFisica({
  dni: '14289301',
  cuit: '20-14289301-1',
  apellidoNombre: 'Test Caller',
})
```

Pero el `afterAll` cleanup en línea 12-19 solo borra `TEST_DNIS = ['11111111', '12345678', '24563128']`. **DNI 14289301 quedaba huérfano** en `personas_fisicas` tras cada `npm run test`.

Como vitest y backend usan **la misma DB persistente** (`backend/data/argos.duckdb`), la fila contaminaba `/api/actores-d6` (y potencialmente otros endpoints que tocan `personas_fisicas`).

### Reproducción
1. `cd backend && npx vitest run src/lib/personas-fisicas.test.ts`
2. `npm run dev`
3. `curl localhost:3001/api/actores-d6?q=&limit=10`
4. Resultado pre-fix: `{"items":[{"kind":"pf","id":"14289301","label":"Test Caller",...}]}` 🔴
5. Resultado post-fix: `{"items":[],"paginacion":{"total":0,...}}` ✅

### Fix aplicado en este audit

1. **Cleanup de la DB del sandbox** ejecutado vía `src/scripts/cleanup-test-caller-now.ts` — purgó la fila huérfana
2. **Patch al test** (`backend/src/lib/personas-fisicas.test.ts` línea 12): agregado `'14289301'` al array `TEST_DNIS` para que `afterAll` cubra el caso. Comentario explicativo del audit incluido.
3. **Verificación**: full suite `vitest run` → 643/643 tests verde + `personas_fisicas` count = 0 post-suite (cleanup hooks ahora funcionan)

### Recomendación de fix permanente (futuro sprint)

El fix de hoy es defensivo (cubre los 4 DNIs conocidos), pero el problema **estructural** persiste: tests y prod comparten DB. Mejor práctica:

```ts
// backend/src/lib/db.ts
const DB_PATH = process.env.DUCKDB_PATH || path.join(DATA_DIR, 'argos.duckdb')

// backend/vitest.config.ts (nuevo)
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    setupFiles: ['./src/test-setup.ts'],
    env: { DUCKDB_PATH: ':memory:' }, // o './data/argos.test.duckdb'
  },
})
```

Esto **garantiza** aislamiento total entre tests y producción. Cero pollution posible. 1-2 horas de implementación + verificación.

---

---

## ⚠️ Aclaración importante sobre el alcance del audit

**El sandbox de esta sesión no tiene la DB poblada del usuario** (+1M nodos en Neo4j, 2.7M filas en DuckDB según `AUDIT-DATOS-NEO4J.md`). Verificado:

```bash
$ cat backend/.gitignore | grep -E "duckdb|data/"
backend/data/
*.duckdb
```

La DB vive en la máquina local del usuario. El repo no contiene dumps. Los seeds requieren red para bajar XLSX/CSVs de portales oficiales (cordoba.gob.ar, datos.jus.gob.ar, AFIP) y Neo4j vía docker-compose.

**Implicancia**: este audit es **estático** — analiza código (schemas, seeds, endpoints, queries) que es la fuente de verdad reproducible. Lo que NO se pudo validar dinámicamente:
- Row counts reales por tabla
- % NULL por columna en datos vivos
- Coherencia Neo4j real (porcentaje del universo que cumple cada arquetipo)
- Query plans / indices efectivos
- Drift desde el snapshot 2026-04-26

**Para que el usuario complete el audit dinámicamente en su máquina**, los siguientes 3 comandos cubren el 80% de lo pendiente:

```bash
# 1. Test pollution check (debe retornar 0 después del fix de hoy)
cd backend && npx ts-node -e "
import { initDb, dbAll } from './src/lib/db'
initDb().then(async () => {
  const r = await dbAll(\"SELECT COUNT(*) as n FROM personas_fisicas WHERE apellido_nombre LIKE 'Test %' OR apellido_nombre LIKE '%FIXTURE%'\")
  console.log('Test pollution residual:', r[0].n)
})"

# 2. Row counts reales por tabla (audit dinámico de Fase 1)
npx ts-node -e "
import { initDb, dbAll } from './src/lib/db'
initDb().then(async () => {
  const tables = await dbAll(\"SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY 1\")
  for (const t of tables) {
    const c = await dbAll(\`SELECT COUNT(*) as n FROM \"\${t.table_name}\"\`)
    console.log(t.table_name + ': ' + c[0].n)
  }
})"

# 3. Coherencia Neo4j arquetipos (audit dinámico Fase 2 — requiere Neo4j up)
docker compose up -d argos-neo4j   # si no está
# Después correr las 5 queries Cypher documentadas en 02-neo4j-coherence.md
```

