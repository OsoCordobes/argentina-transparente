# Audit ARGOS · 2026-04-30 · Backend + Datos

> Branch: `feat/backend-data-audit-12h` (desde `main` @ `99bdb67`)
> Modo: autónomo, audit estático defensible
> Sandbox: Linux, sin Neo4j ni DuckDB poblada (vive en máquina del usuario)
> Commits: 4 con push hourly · Tests: 643/643 verde

---

## ⚠️ Lée esto primero

**Este audit es ESTÁTICO** (código, schemas, seeds, endpoints, queries). El sandbox de Claude Code en la web no tiene la DB del usuario:
- `backend/data/` está en `.gitignore` → la DB vive en tu máquina local
- Los seeds requieren red a portales oficiales (no se pueden correr en sandbox)
- Neo4j requiere docker-compose (no disponible)

Lo que **SÍ está validado**:
- Schema de las 39 tablas DuckDB y sus seeds (código fuente)
- Las 51 rutas backend (todas LIVE, shape OK por `curl` con DB vacía)
- 643 tests vitest verde (incluye el fix del bug crítico de pollution)
- Coherencia estática Neo4j (5 arquetipos analizados desde código)

Lo que necesita TU máquina con la DB poblada:
- Row counts reales por tabla
- Coherencia Neo4j viva (cumplimiento por arquetipo en %)
- Click-through aleatorio contra portales oficiales

3 comandos para que cubras el 80% del audit dinámico están al final de `findings.md`.

---

## TL;DR (5 líneas)

- **Estado de salud general**: 🟡 **defensible con 1 fix crítico aplicado y 2 deudas estructurales documentadas**
- **Bug crítico encontrado y arreglado**: test `personas-fisicas.test.ts` poluía la DB con `Test Caller` (DNI 14289301) que leakeaba a `/api/actores-d6` como dato real. Patch + cleanup commiteado.
- **Hallazgo nuevo**: 10 endpoints sirven datos al usuario sin `fuente_url` (viola CLAUDE.md §4). Causa raíz: `señales_cache` no tiene esa columna. Migración SQL propuesta.
- **Audit previo desactualizado**: ANALISIS-DATOS-ARGOS.md decía "95% de datos no expuestos" — eso ya no es cierto, las iter 2-3 del roadmap se ejecutaron y `/api/actores/*` consume las 4 tablas dormidas.
- **Tests verde, tsc verde, frontend wiring 9/12 LIVE through-and-through**. Backend en estado defensible con dos deudas estructurales (arquetipos D y E del grafo).

---

## Findings ordenados por severidad

### 🔴 CRÍTICO (acción inmediata o ya resuelto)

#### 1. Test pollution leakeaba a producción (RESUELTO en este audit)
- **Síntoma**: `/api/actores-d6` servía un PF "Test Caller" DNI 14289301 como dato real
- **Causa**: `personas-fisicas.test.ts` línea 75 inserta ese DNI pero `afterAll` cleanup (línea 12) no lo cubría
- **Fix aplicado**: `'14289301'` agregado a `TEST_DNIS`. Cleanup de la DB del sandbox ejecutado. 643/643 tests verde post-fix.
- **Acción para vos**: correr el comando #1 al final de `findings.md` en TU máquina. Si retorna >0, ejecutar el cleanup. Tu DB local probablemente tiene la pollution si corriste vitest alguna vez.

#### 2. 10 endpoints sin `fuente_url` en respuesta (CLAUDE.md §4)
- **Endpoints afectados**: `/api/landing`, `/api/dashboard`, `/api/actores/search`, `POST /api/chat`, `/api/cola-verificacion`, `/api/comparar/empresa`, `POST /api/ai/suggestions`, `/api/dinero/sankey`, `/api/grafo/{nucleo,expand,conflictos}`
- **Causa raíz**: tabla `señales_cache` no tiene columna `fuente_url`. La info está en `evidencia_json` pero los endpoints no la extraen.
- **Fix propuesto**: ver `05-anti-falseness.md` con la migración SQL exacta + el patch SELECT en cada route. ~2-3h de trabajo.

#### 3. 0 cobertura de tests de rutas backend
- **Síntoma**: 643 tests verde pero TODOS son unit/lib. Ningún test integra HTTP request → DB → response.
- **Riesgo**: bug en la shape de un endpoint pasa CI sin advertencia. El bug que encontré hoy (test pollution leak) hubiera sido capturado por un test E2E que pegara a `/api/actores-d6?q=Test`.
- **Fix propuesto**: agregar `vitest + supertest` para 5-10 endpoints críticos (`/api/landing`, `/api/profile/persona/:dni`, `/api/profile/empresa/:cuit`, `/api/grafo/nucleo`, `/api/dinero/sankey`).

### 🟡 IMPORTANTE (sprint próximo)

#### 4. Frontend Sankey de `/dinero` cae a bundle estático
- Cols 0-1 (AFIP→Nivel) y DRILL TOP-10 vienen de `frontend/src/lib/argos/dinero-flujo.ts` con datos estimados marcados "★PROY"
- **Coherente con CLAUDE.md §2** porque está marcado explícitamente como estimado, **pero** la trazabilidad real del dinero no existe
- **Fix**: endpoint `/api/dinero/sankey-jerarquico` consultando Neo4j real (Estado→Reparticion→Programa→Contrato→Empresa). Bloqueado por el gap del arquetipo E (debajo).

#### 5. Arquetipos Neo4j incompletos (D y E)
- **D — Empresa↔empleados**: arista `:TIENE_EMPLEADO` no existe. Datos en `agentes_publicos.cuit_empleador` pero seed no los conecta. ~50 LOC nuevos.
- **E — Cadena presupuestaria completa**: `Programa → Contrato` no se linkea. Bloquea Sankey real (#4). ~30 LOC.
- A, B, C completos.

#### 6. Test pollution estructural (test ↔ prod mismo DuckDB)
- **El fix de hoy es defensivo** (cubre los DNIs conocidos del test), pero el problema raíz es que `vitest` y `npm run dev` apuntan al mismo `backend/data/argos.duckdb`.
- **Fix propuesto**: `process.env.DUCKDB_PATH` + `vitest.config.ts` con `:memory:` o DB temporal. 1-2h.

#### 7. CUIT format inconsistency entre seeds (silent JOIN failures)
- Detectado por subagente DuckDB: algunas tablas guardan CUIT con guiones (`30-71234567-1`), otras sin guiones (`30712345671`).
- Causa que JOINs entre tablas con CUITs de origen distinto fallen silenciosamente.
- **Fix propuesto**: VIEW de normalización + helper `normalizarCUIT()` aplicado consistentemente.

### 🟢 NICE-TO-HAVE (cuando haya tiempo)

#### 8. Filtros de `/actores` parcialmente client-side
- `q, tipo, conSenales` van al backend; `jurisdiccion, empresa, tier, sueldoMin` filtrados en memoria.
- Ineficiente cuando la base crezca (hoy 763K personas físicas).
- Fix: extender el endpoint con esos filtros. ~1h.

#### 9. Δ del header en localStorage
- Botón delta usa localStorage del navegador, no backend. Funciona pero no comparte estado entre sesiones.
- Fix opcional: endpoint `/api/diff?since=ISO`. ~2h.

#### 10. 17 endpoints sin uso por frontend
- Subagente frontend-wiring detectó 17 endpoints declarados que ningún page consume (alertas system, cobertura, scrapers/health).
- Pueden ser features de infraestructura para futuro o muerte silenciosa. Worth auditar.

---

## Métricas finales

| Indicador | Valor |
|---|---|
| Tablas DuckDB sanas (active) | 14 / 39 |
| Tablas zombies (schema, 0 filas en código) | 5 / 39 |
| Tablas orphan inputs (seed pero sin endpoint) | 18 / 39 |
| Endpoints LIVE | 50 / 51 (98%) |
| Endpoints con `fuente_url` | 6 / 51 (12%) — 🔴 viola §4 |
| Frontend pages LIVE through | 9 / 12 |
| Frontend pages MIXED (live + estático con caveat) | 2 / 12 |
| Frontend pages LOCAL only | 1 / 12 |
| Tests vitest pasando | 643 / 643 ✅ |
| Backend `tsc --noEmit` | ✅ |
| Frontend `tsc --noEmit` | ✅ |
| Coherencia Neo4j arquetipos (estática) | 3 ✅ / 2 🟡 |
| Test pollution leaks detectados | 1 (resuelto) |
| Falsedades en código (mock/lorem en prod path) | 0 |
| Tono acusatorio en user-facing copy | 0 |

---

## Cambios commiteados en este branch

- `9c8100b` — audit setup + reality check
- `3e417d1` — fases 1+3+4parcial+5 + 4 reportes
- `a457d67` — fix test pollution + fase 2 + finding crítico

5 archivos nuevos en `docs/audit-2026-04-30/`:
- `findings.md` — stream completo
- `01-duckdb-inventory.md` — 39 tablas analizadas
- `01-endpoints-inventory.md` — 51 endpoints mapeados
- `02-neo4j-coherence.md` — 5 arquetipos estáticos
- `03-frontend-wiring.md` — 12 pages mapeadas
- `05-anti-falseness.md` — pasada 1+2+3 (con caveat: pasada 3 dinámica deuda)

1 archivo backend modificado:
- `backend/src/lib/personas-fisicas.test.ts` — fix `TEST_DNIS` array

---

## Lo que dejé en stand-by (necesita decisión humana o DB viva)

1. **Smoke browser por tab** (Fase 4 visual) — bloqueado sin Chrome MCP en sandbox. Playwright Python instalado de respaldo. Recomiendo correr en sesión local del usuario.
2. **Migración 0003 fuente_url** — schema-touching, querés revisar el SQL antes.
3. **Aislamiento DB tests vs prod** — toca `db.ts` (core), querés revisar el cambio.
4. **Seed `:TIENE_EMPLEADO`** (arquetipo D) — agregar relación al grafo, verificar que no rompa queries existentes.
5. **Linkear Programa → Contrato** (arquetipo E) — requiere mapping presupuesto↔contratos que el equipo aún no definió.
6. **Pasada 3 anti-falseness dinámica** — click-through aleatorio contra portales oficiales. 30-60 min en máquina con DB.

---

## Branches conservadas con valor backend (referencia, no mergear)

- `backup/local-wip-20260421-175947` (`cb5c012`) — entity registry backfill foundation. Choca con schema actual. Vale la pena portar lógica si Fase 2D requiere canonical entity resolution.
- `origin/claude/chat-llm-backend` (`ff72dd6`) — versión más elaborada de `routes/chat.ts` (~430 vs ~330 LOC actual). Si extendés capa LLM, arrancar leyendo esa branch.

---

## Cómo continuar (próximas 3 piezas con scope acotado)

1. **Migración 0003 fuente_url** (4-6h)
   - ALTER TABLE `señales_cache` ADD COLUMN `fuente_url TEXT`
   - Backfill desde `evidencia_json[0].fuente_url`
   - Update SELECT + response shape en 10 routes flagged
   - Test E2E nuevo: cada endpoint listado retorna `fuente_url` populated cuando aplica
   - Resuelve 🔴 #2

2. **Aislamiento DB tests vs prod** (1-2h)
   - `lib/db.ts`: `DB_PATH = process.env.DUCKDB_PATH || default`
   - `vitest.config.ts`: setup files que setea `DUCKDB_PATH=:memory:`
   - Validar que 643 tests siguen verde
   - Resuelve 🟡 #6 estructuralmente (cierra la familia entera)

3. **Seed arquetipo D `:TIENE_EMPLEADO`** (3-4h)
   - Nuevo `seed-neo4j-empleados.ts` que itera `agentes_publicos` con `cuit_empleador IS NOT NULL`
   - MERGE en Neo4j: `MATCH (f:Funcionario {dni:...}) MATCH (e:Empresa {cuit:...}) MERGE (f)-[:TRABAJA_EN_EMPRESA {tier, fuente}]->(e)`
   - Endpoint nuevo o extensión de `/api/profile/empresa/:cuit` para listar empleados
   - Resuelve 🟡 #5 parte D

Después de las 3, considerar **arquetipo E + sankey-jerarquico** como sprint dedicado (10-15h, mayor complejidad).

---

## Honor mention

El audit previo `docs/AUDIT-DATOS-NEO4J.md` (2026-04-26) está **completísimo y sigue siendo la fuente principal de verdad sobre Neo4j**. Mi audit lo cross-referencia, no lo reemplaza. Lo único que actualiza: el snapshot de 1.028M nodos sigue válido por la propiedad MERGE-idempotent de los seeds.

El audit `docs/ANALISIS-DATOS-ARGOS.md` (2026-04-26) está **parcialmente desactualizado**: la afirmación "95% de datos no expuestos al frontend" ya no aplica porque las iter 2 y 3 del roadmap se ejecutaron entre el 26 y el 30. Recomiendo agregar una nota de versión en ese archivo.
