# HANDOFF · Audit ARGOS 2026-04-30 → Agente local

> Branch: `feat/backend-data-audit-12h` (pusheada a `origin`, 4 commits)
> Audit completado en sandbox cloud, **estático** (sin DB poblada, sin Neo4j up)
> Próximo paso: agente local con DB poblada ejecuta los items de §3 abajo

---

## §1 · Qué se hizo en este audit (resumen ejecutable)

**Branch `feat/backend-data-audit-12h`** creada desde `main @ 99bdb67`. 4 commits pusheados:
- `9c8100b` setup + reality check
- `3e417d1` fases 1+3+4parcial+5 + 4 reportes de subagentes
- `a457d67` fix test pollution (Test Caller leak) + fase 2 Neo4j
- (próximo) executive summary + handoff + master prompt

**Reportes generados en `docs/audit-2026-04-30/`**:
| Archivo | Qué contiene | Estado |
|---|---|---|
| `findings.md` | Stream cronológico de todo el audit | ✅ |
| `00-EXECUTIVE-SUMMARY.md` | TL;DR + findings por severidad + métricas | ✅ |
| `01-duckdb-inventory.md` | 39 tablas mapeadas (14 active / 5 zombie / 18 orphan) | ✅ |
| `01-endpoints-inventory.md` | 51 endpoints (50 LIVE / 1 MOCK, 10 sin fuente_url) | ✅ |
| `02-neo4j-coherence.md` | 5 arquetipos analizados estáticamente (3 ✅, 2 🟡) | ✅ |
| `03-frontend-wiring.md` | 12 pages mapeadas (9 LIVE, 2 MIXED, 1 LOCAL) | ✅ |
| `05-anti-falseness.md` | 0 mock leaks código, fuente_url gaps documentados | ✅ |
| `04-tab-by-tab.md` | Smoke browser por ruta | ❌ pendiente (necesita Chrome MCP) |
| `HANDOFF.md` | Este archivo | ✅ |
| `MASTER-PROMPT-LOCAL-AGENT.md` | Prompt para el agente local | ✅ |

**Cambio de código aplicado**:
- `backend/src/lib/personas-fisicas.test.ts` línea 12: agregado `'14289301'` al `TEST_DNIS` array para fix de pollution leak.

**Tests verde**: 643/643 en backend (`vitest run`), backend tsc OK, frontend tsc OK.

---

## §2 · Lo que está mal o limitado en este audit (sé honesto)

1. **Es estático, no dinámico.** El sandbox cloud no tenía DuckDB poblada ni Neo4j arriba. Lo que validé es el código (schemas, seeds, endpoints, queries) — la *forma*. La instancia real con +1M nodos solo vos podés verificarla.

2. **El "04-tab-by-tab.md" no existe** porque sin Chrome MCP no pude hacer smoke browser. Es el único entregable del plan original que quedó vacío.

3. **El fix del test pollution es defensivo, no estructural.** Agregué `14289301` al array de cleanup, pero el problema raíz (tests y prod compartiendo `argos.duckdb`) sigue. Solución completa en §3 item 2.

4. **No corrí los seeds** para verificar shape real porque requerían red a portales oficiales + tiempo. El subagente DuckDB infirió row counts del código, no de la DB.

5. **El bug del CUIT inconsistency (con/sin guiones) lo detectó un subagente estáticamente**, pero no lo verifiqué corriendo SELECT JOIN reales — solo lo deduje del código. Vos sí podés verificarlo con tu DB.

6. **Las recomendaciones de migración SQL están propuestas, no implementadas**. Decidí no tocar schema sin tu OK explícito.

---

## §3 · Lo que falta hacer (priorizado, accionable)

Cada item con: estimación, archivos a tocar, criterio de hecho.

### 🔴 P0 — Verificación dinámica en tu máquina (30 min)

Tu DB local puede tener la pollution `Test Caller` que detecté en sandbox. Corré:

```bash
cd backend && npx ts-node -e "
import { initDb, dbAll, dbRun } from './src/lib/db'
initDb().then(async () => {
  const before = await dbAll(\"SELECT COUNT(*) as n FROM personas_fisicas WHERE apellido_nombre LIKE 'Test %' OR dni IN ('14289301','11111111','12345678','24563128','99999999')\")
  console.log('Test pollution residual:', before[0].n)
  if (before[0].n > 0) {
    await dbRun(\"DELETE FROM personas_fisicas WHERE apellido_nombre LIKE 'Test %' OR dni IN ('14289301','11111111','12345678','24563128','99999999')\")
    console.log('Limpieza ejecutada')
  }
})"
```

Después verificá los demás patrones (Neo4j para arquetipos, row counts reales, etc.) con los 3 comandos al final de `findings.md`.

**Criterio de hecho**: pollution count = 0 + log de row counts reales pegado en `findings.md` sección "post-handoff".

### 🔴 P1 — Migración 0003: agregar `fuente_url` a `señales_cache` (4-6h)

Causa raíz del bug "10 endpoints sin fuente_url" (CLAUDE.md §4).

**Archivos a tocar**:
- `backend/migrations/0003_senales_fuente_url.sql` (nuevo): `ALTER TABLE señales_cache ADD COLUMN fuente_url TEXT;`
- `backend/src/lib/db.ts`: incluir `fuente_url` en `CREATE TABLE señales_cache` para fresh installs
- `backend/src/engine/signals.ts`: poblar `fuente_url` cuando se crea la señal (extraer de `evidencia_json[0].fuente_url`)
- `backend/src/scripts/analyze.ts`: backfill de filas existentes
- 10 routes flagged en `01-endpoints-inventory.md` líneas 92-103: agregar `fuente_url` al SELECT y al response shape

**Criterio de hecho**: nuevo test E2E que itere los 10 endpoints y verifique que cada señal traída lleve `fuente_url` non-empty.

### 🔴 P2 — Aislamiento DB tests vs prod (1-2h, simple y de altísimo ROI)

Cierra estructuralmente la familia de bugs tipo Test Caller.

**Archivos a tocar**:
```ts
// backend/src/lib/db.ts (líneas alrededor de la 8)
const DB_PATH = process.env.DUCKDB_PATH || path.join(DATA_DIR, 'argos.duckdb')

// backend/vitest.config.ts (crear si no existe)
import { defineConfig } from 'vitest/config'
export default defineConfig({
  test: {
    env: { DUCKDB_PATH: ':memory:' },
  },
})
```

**Criterio de hecho**: `npm run test` no toca `backend/data/argos.duckdb` (verificar con `stat -c %Y backend/data/argos.duckdb` antes y después). 643 tests siguen verde.

### 🟡 P3 — Seed arquetipo D: `:TIENE_EMPLEADO` (3-4h)

Cierra el gap más barato del grafo. Datos ya existen en `agentes_publicos.cuit_empleador`, falta la arista.

**Archivos a tocar**:
- `backend/src/scripts/seed-neo4j-empleados.ts` (nuevo, ~50 LOC):
```ts
// MATCH (f:Funcionario {dni: $dni})
// MATCH (e:Empresa {cuit: $cuit_empleador})
// MERGE (f)-[:TRABAJA_EN_EMPRESA {tier:1, fuente_url:$fuente}]->(e)
```
- `backend/package.json`: agregar script `seed:neo4j-empleados`
- `backend/src/lib/graph.ts`: extender `getProfileEmpresa` para listar empleados
- `frontend/src/pages/Empresa.tsx`: agregar tab "Empleados"

**Criterio de hecho**: `MATCH (e:Empresa)-[r:TRABAJA_EN_EMPRESA]-(f) RETURN count(r)` retorna > 0 en Neo4j, y `/empresa/:cuit` muestra empleados.

### 🟡 P4 — Endpoint `/api/dinero/sankey-jerarquico` (8-10h)

Reemplaza el bundle estático `dinero-flujo.ts`. Bloqueado por arquetipo E (cadena presupuestaria) — ver `02-neo4j-coherence.md`.

**Archivos a tocar**:
- Cypher real Estado → Reparticion → Programa → Contrato → Empresa con SUM por nivel
- `backend/src/routes/dinero.ts`: nuevo handler
- `frontend/src/lib/argos/dinero-flujo.ts`: deprecar, mantener como fallback con banner "★PROY"
- `frontend/src/pages/Dinero.tsx`: switch al endpoint nuevo cuando disponible

**Criterio de hecho**: Sankey de `/dinero` ya no muestra "★PROY" en cols 0-1.

### 🟡 P5 — E2E route tests con supertest (4-6h)

Cobertura cero hoy. El bug Test Caller hubiera sido capturado por un E2E.

**Archivos a tocar**:
- `backend/src/routes/*.test.ts` (nuevo, 5 archivos críticos): landing, profile-persona, profile-empresa, grafo-nucleo, dinero-sankey
- `backend/package.json`: agregar `supertest` dep

**Criterio de hecho**: 5 nuevos test files corriendo en CI, todos verde.

### 🟢 P6+ — Resto (cuando haya tiempo)

- Filtros server-side en `/api/actores-d6` (`jurisdiccion`, `sueldoMin`, `empresa`, `tier`)
- Endpoint `/api/diff?since=ISO` para el delta del header
- Normalización CUIT consistente entre seeds (helper `normalizarCUIT()` aplicado en todos)
- Tier 1 ES_LA_MISMA_PERSONA via OCR Boletín (sprint dedicado, 20+h)

---

## §4 · Reglas duras al continuar (de CLAUDE.md, no negociables)

1. **Cero alucinaciones**: cada número en findings.md debe ser verificable desde commit.
2. **Toda fila lleva `fuente_url`**: el P1 cierra el gap principal.
3. **Tier de evidencia explícito**: nunca asumir Tier 1 sin DNI/CUIT confirmado.
4. **Tono neutral**: "señales detectadas", "patrones marcados", NUNCA "hallazgos", "destapamos", "corrupto" en copy user-facing.
5. **Branch `main` intocable**: trabajá sobre `feat/backend-data-audit-12h` (esta) o creá una nueva. Mergeá vía PR review.
6. **Commit + push cada cambio significativo**. Mensajes descriptivos.

---

## §5 · Stack y comandos rápidos

```bash
# Levantar todo local
cd backend && npm install && npm run dev   # → http://localhost:3001
cd frontend && npm install && npm run dev   # → http://localhost:5174

# Neo4j (necesario para arquetipos C, D, E)
docker compose up -d argos-neo4j           # bolt://localhost:7687

# Tests
cd backend && npx vitest run                # 643 tests, ~23s
cd backend && npx tsc --noEmit              # type check
cd frontend && npx tsc --noEmit             # type check

# Seeds (requieren red a portales oficiales)
cd backend
npm run seed:cordoba          # contratos Córdoba Capital 2015-2026
npm run seed:igj              # 2.7M IGJ entidades + autoridades
npm run seed:rns              # 196K RNS personas jurídicas
npm run seed:afip             # enriquece empresas con AFIP
npm run seed:neo4j-actores    # popula grafo Neo4j desde DuckDB
npm run seed:opensanctions    # cachea OS matches (TTL 30d)

# Audit dinámico (corré después del P0)
npm run audit:trazabilidad    # verifica fuente_url completeness
npm run alertas:check         # detectar alertas
```

---

## §6 · Master prompt para el agente local

→ Ver `MASTER-PROMPT-LOCAL-AGENT.md` (archivo hermano).
