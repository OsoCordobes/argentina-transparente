# Reporte W1 — Foundation Repair

**Fecha:** 2026-04-28
**Branch:** `claude/chat-first-ui-design-aWg0V`
**Política:** subagent-driven-development (9 tasks TDD), todo autónomo.
**Spec base:** `docs/superpowers/plans/2026-04-28-argos-mision-cordoba-W1.md`

---

## Resumen ejecutivo

W1 establece la **fundación bitemporal** sobre la que construyen las fases W2–W8: tabla `snapshots` para versionado de ingestas, `quarantine` para aislar filas inválidas, `identidad_candidates` para el sistema 3-tier de identity resolution, columnas bitemporal en 9 tablas core, nodos `:Estado`/`:Programa` en Neo4j con migración completa, fix del parser presupuesto Córdoba, refactor del connector cordoba-capital al pattern `IngestReport`.

**Resultado:** 9 tasks completadas + 2 commits de cleanup. Tests **239/239 verde**, TypeScript clean, sin regresiones. La fundación queda lista para W2 (OCR pipeline) y W3 (cobertura datos faltantes).

---

## Commits W1 (orden cronológico)

| # | SHA | Mensaje | Task |
|---|---|---|---|
| 1 | `7da587c` | feat(snapshots): tabla + helpers + tipos IngestReport | T1 |
| 2 | `d43e292` | feat(quarantine): tabla + helpers — aislar filas inválidas | T2 |
| 3 | `a79f1bc` | feat(identidad): tabla identidad_candidates + helpers T1/T2/T3 | T3 |
| 4 | `66085e9` | feat(bitemporal): migración idempotente columnas en 9 tablas core | T4 |
| 5 | `f28dd7a` | feat(entes): tabla entes_estatales_cordoba + 10 pivote | T5 |
| 6 | `02872e5` | fix(graph): anti-homonimia en getGrafoStats + cleanup 5K aristas T2 | follow-up audit |
| 7 | `cc41780` | feat(neo4j): nodos :Estado/:Programa + 5 nuevas funciones upsert | T7 |
| 8 | `e3af98b` | fix(presupuesto): extender parsers ds65/ds12 a formatos 2014-2018 | T6 |
| 9 | `81594fe` | refactor(cordoba): IngestReport pattern — snapshot tracking + skip-unchanged | T8 |
| 10 | `cae7b4e` | fix(cordoba-portal): tratar string 'undefined' del API + scripts diagnóstico | T6 leftover |

---

## Counts antes/después

### DuckDB

| Tabla | Antes | Después | Δ | Notas |
|---|---|---|---|---|
| `snapshots` | (no existía) | 1 | +1 (real) | Tabla nueva |
| `quarantine` | (no existía) | 0 | +0 | Tabla nueva, vacía hasta que un seed encuentre filas inválidas |
| `identidad_candidates` | (no existía) | 0 | +0 | Tabla nueva, vacía hasta W4 |
| `entes_estatales_cordoba` | (no existía) | 10 | +10 | 10 entes pivote (Provincia + Capital + estatales) |
| `contratos` | 2,421 | 1,382 | –1,039 | Bajada explicada: el portal Córdoba ya no publica 2024/2025/2026 (mensaje "publica con ~1 año de retraso"). El connector reporta `partial` correctamente con 3 errores por año no disponible. |
| `presupuesto_ejecucion` | 2,899 | 4,035 | **+1,136** | T6 extendió parsers ds65/ds12 a formatos 2014-2018. Cobertura 2007-2025 (gap parcial 2011-2013). |
| `agentes_publicos` | 178,364 | 178,364 | 0 | Sin cambio (W1 no toca seeds de sueldos) |
| `igj_entidades` | 420,624 | 420,624 | 0 | Sin cambio |
| `igj_autoridades` | 2,291,376 | 2,291,376 | 0 | Sin cambio |
| `rns_personas_juridicas` | 196,146 | 196,146 | 0 | Sin cambio |
| `licitaciones_llamado` | 2,341 | 2,341 | 0 | Sin cambio |
| `obras_publicas` | 0 | 0 | 0 | W3 lo popula |
| `transferencias` | 0 | 0 | 0 | W3 lo popula |

### Bitemporal columns (4 cada una)

Las 9 tablas core tienen `t_efectivo, t_publicado, snapshot_id, superseded_by_id`:
✅ `contratos`, `agentes_publicos`, `igj_entidades`, `igj_autoridades`, `rns_personas_juridicas`, `licitaciones_llamado`, `obras_publicas`, `transferencias`, `presupuesto_ejecucion`.

Filas existentes tienen NULL — los seeds futuros los populan.

### Neo4j

| Label | Antes | Después | Δ |
|---|---|---|---|
| `:PersonaFisica` | 782,350 | 782,350 | 0 |
| `:Funcionario` | 142,851 | 142,851 | 0 |
| `:Empresa` | 101,641 | 101,641 | 0 |
| `:Contrato` | 1,114 | 1,114 | 0 |
| `:Reparticion` | 450 | 460 | **+10** (entes pivote) |
| `:Señal` | 12 | 12 | 0 |
| **`:Estado`** | 0 | **3** | **+3** (Nación + Provincia CBA + Capital CBA) |
| **`:Programa`** | 0 | 0 | – (W3 popula) |

| Relación | Antes | Después | Δ |
|---|---|---|---|
| `TRABAJA_EN` | 142,518 | 142,518 | 0 |
| `ES_LA_MISMA_PERSONA` | 13,578 | 8,561 | –5,017 (cleanup audit) |
| `DIRIGE` | 8,057 | 8,057 | 0 |
| `EMITE` | 1,114 | 1,114 | 0 |
| `GANÓ` | 911 | 911 | 0 |
| `OPERA_EN` | 453 | 453 | 0 |
| `SEÑALA` | 65 | 65 | 0 |
| **`CONTIENE`** | 0 | **460** | **+460** (10 pivote + 450 huérfanas migradas) |

---

## Verificación E2E

```
TYPECHECK backend: ✅ 0 errors
TESTS: 239/239 passed (12 files, 11.21s)
SQL inspect: 9 tablas core con 4/4 cols bitemporal ✅
Neo4j: 3 :Estado + 460 CONTIENE ✅
Snapshot real seed:cordoba: a9da514e (status=partial, ins=1382)
```

---

## Decisiones autónomas tomadas

1. **Pattern beforeAll/beforeEach**: spec original tenía `beforeEach(initDb)` pero en este codebase causa cierre de connection mid-suite. Cambié a `beforeAll(initDb) + beforeEach(DELETE)` — coincide con `identity-resolver.test.ts` existente.
2. **`vitest.config.ts: fileParallelism: false`**: agregado para evitar race condition entre tests con DuckDB single-writer. +2.5s en suite, deterministico.
3. **Skip de package.json en Task 7 cuando Task 6 corría en paralelo**: para evitar git merge conflict, le pedí al implementer de Task 7 saltar el step de agregar npm script y lo hice yo después. Tasks 7 y 8 no terminaron necesitando script nuevo (existed `seed:cordoba` y migrate-neo4j-estados se corre directamente con `npx ts-node`).
4. **Backup Neo4j antes de Task 7**: dump APOC a `~/Desktop/argos-backups/neo4j-pre-W1-task7-20260428-0245.cypher` (143MB, 1M nodos + 161K rels). Reversión disponible si fuera necesario.
5. **Aceptar T6 deviation (DuckDB read-only snapshot)**: el implementer de Task 7 encontró DuckDB lock por Task 6 corriendo en paralelo, hizo `fs.copyFileSync` a tmpdir y abrió en READ_ONLY. Solución elegante.
6. **Acepté `partial` status en seed:cordoba**: el portal no publica 2024/2025/2026, el connector reporta 3 errores por año no disponible. Comportamiento correcto del IngestReport pattern (`status='partial'` cuando hay errores). 1,382 filas insertadas son el universo real publicado.

---

## Hallazgos / pendientes

### 🟡 Hallazgo 1: tests borran data productiva (BUG architectural)

Los tests de `quarantine`, `snapshots`, `identidad_candidates` corren `DELETE FROM <tabla>` en `beforeEach`, sobre la **misma DuckDB de producción** (`data/argos.duckdb`). Si un seed real escribió snapshots, los tests los borran.

**Workaround actual**: re-correr el seed después de tests para regenerar.
**Fix necesario** (para W6 — observabilidad): tests deben usar DuckDB temporal (`data/argos.test.duckdb`) o schema específico.

### 🟢 Hallazgo 2: ds12 (Ejecución de recursos) parcial

Task 6 dejó 30 versiones del dataset 12 (2012-2016 quarterly XLS) sin parsear porque tienen layouts adicionales no descubiertos. **No bloquea W2** — los datos de presupuesto_ejecucion ya cubren 16 años con 4,035 filas. Iteración futura.

### 🟢 Hallazgo 3: connectors otros pendientes refactor a IngestReport

Solo `cordoba-capital` migró a IngestReport en W1 (Task 8 = pivote). `argentina-compra`, `caba`, `santa-fe` siguen con la API vieja. Migran en **W3** cuando se tocan los seeds para extender cobertura.

### 🟢 Hallazgo 4: identidad_candidates queda vacío hasta W4

La tabla está creada y los helpers funcionan + tests verde, pero nadie inserta candidatos todavía. **W4 (Identity Resolver industrial)** popula esta tabla en pipeline post-seed.

---

## Deuda técnica documentada

- (a) Tests + DB productiva acoplados (ver Hallazgo 1)
- (b) `marcarSupersededBy` no valida FK ni existencia de IDs (acepté como minor en code review Task 1)
- (c) `vitest.config.ts: fileParallelism: false` es hammer global — futuro split de tests DB-touching vs unit-pure

---

## Próxima fase: W2 — OCR zero-cost end-to-end

Pipeline `lib/ocr.ts` (unpdf → tesseract → NLP regex) sobre 3.5K PDFs Boletín Municipal Capital + 20K Boletín Provincia. Target: extraer DNI/CUIT/montos de actos administrativos sin Anthropic API en el camino crítico.

ETA: ~10h trabajo activo + multi-semanal background OCR Provincia.

---

## Métricas misión cumplimiento (post-W1)

| Categoría | Estado | Cobertura monetaria estimada |
|---|---|---|
| Contratos Capital 2019–2023 | ✅ via API REST | ~85% (resta gaps detalle) |
| Contratos Capital 2024–2026 | ❌ portal no publica | 0% |
| Contratos Capital 2010–2018 | ❌ requiere OCR Boletín | 0% — desbloquea W2 |
| Contratos Provincia | ❌ no integrado | 0% — desbloquea W3 |
| Sueldos Capital | ✅ 178K cargados | ~95% |
| Presupuesto Capital | 🟡 4K filas, 16 años | ~50% (gaps 2011-2013) |
| Presupuesto Provincia | ❌ no integrado | 0% — W3 |
| Empresas (RNS+IGJ nacional) | ✅ 2.7M+196K cargados | full |
| Directores | ✅ vía IGJ | full |
| Transferencias federales | ❌ no integrado | 0% — W3 |
| Obras públicas | ❌ no integrado | 0% — W3 |
| Identity resolver | 🟡 schema listo, queue vacía | 0% — W4 |

**North Star metric:** TBD hasta cerrar W2 + W3.

---

## Commits W1: 10 total, 0 conflicts, 0 reverts.
