# MASTER PROMPT · Agente local para continuar audit ARGOS

> Pegar este prompt completo a tu sesión local de Claude Code (con claude-in-chrome activo).
> Trabajás sobre `OsoCordobes/argentina-transparente` branch `feat/backend-data-audit-12h`.

---

```
Sos el agente local que continúa el audit ARGOS que se hizo en sandbox cloud.

═══════════════════════════════════════════════════════════════════════════
§ 0 — VERIFICACIÓN OBLIGATORIA (no la saltees)
═══════════════════════════════════════════════════════════════════════════

```bash
cd C:/Users/amiun/Desktop/argentina-transparente  # adaptá a tu path
git fetch origin
git checkout feat/backend-data-audit-12h
git pull --ff-only

# Estado esperado
git log --oneline -5
# Debería mostrar: a457d67 fix(test-pollution)... 3e417d1 audit(fases...)
# 9c8100b audit(setup)... 99bdb67 Merge pull request #8...

# Archivos esperados
test -f docs/audit-2026-04-30/HANDOFF.md && echo "✓ HANDOFF"
test -f docs/audit-2026-04-30/00-EXECUTIVE-SUMMARY.md && echo "✓ EXECUTIVE"
test -f docs/audit-2026-04-30/01-duckdb-inventory.md && echo "✓ duckdb"
test -f docs/audit-2026-04-30/01-endpoints-inventory.md && echo "✓ endpoints"
test -f docs/audit-2026-04-30/02-neo4j-coherence.md && echo "✓ neo4j"
test -f docs/audit-2026-04-30/03-frontend-wiring.md && echo "✓ wiring"
test -f docs/audit-2026-04-30/05-anti-falseness.md && echo "✓ anti-falseness"
```

Si algo falla, AVISÁ al usuario y PARÁ. No improvises.

═══════════════════════════════════════════════════════════════════════════
§ 1 — LEÉ ESTOS ARCHIVOS EN ESTE ORDEN (no skim, lee enteros)
═══════════════════════════════════════════════════════════════════════════

1. `docs/audit-2026-04-30/HANDOFF.md` ← qué se hizo, qué falta, en qué orden
2. `docs/audit-2026-04-30/00-EXECUTIVE-SUMMARY.md` ← findings por severidad
3. `docs/audit-2026-04-30/findings.md` ← stream completo del audit cloud
4. `CLAUDE.md` (raíz) ← reglas duras del proyecto
5. `docs/PLAN-UI.md` v1.1 ← spec UI canónico
6. `docs/PLAN-DATOS.md` v1.1 ← spec datos canónico

═══════════════════════════════════════════════════════════════════════════
§ 2 — CONTEXTO HEREDADO
═══════════════════════════════════════════════════════════════════════════

El audit cloud fue ESTÁTICO (sandbox sin DB poblada). Validó código.
Tu trabajo es DINÁMICO (tenés la DB con +1M nodos Neo4j y 2.7M filas DuckDB).

Cosas ya hechas (no rehagas):
- Inventario 39 tablas DuckDB con verdict (active/orphan/zombie)
- Mapeo 51 endpoints (50 LIVE / 1 MOCK / 10 sin fuente_url)
- Wiring 12 frontend pages
- Coherencia Neo4j estática (5 arquetipos, 3 OK / 2 con gap)
- Anti-falseness en código (0 leaks de mock a prod)
- Fix Test Caller pollution (TEST_DNIS array completado)
- 643/643 tests verde + tsc clean

Cosas pendientes (orden estricto, ver HANDOFF.md §3 para detalle):
P0  Verificación dinámica de tu DB (30 min)
P1  Migración 0003 fuente_url (4-6h) 🔴 CRÍTICO
P2  Aislamiento DB tests vs prod (1-2h) 🔴 CRÍTICO
P3  Seed arquetipo D :TIENE_EMPLEADO (3-4h) 🟡
P4  Endpoint /api/dinero/sankey-jerarquico (8-10h) 🟡
P5  E2E route tests con supertest (4-6h) 🟡
P6+ Resto (P6-P9)

═══════════════════════════════════════════════════════════════════════════
§ 3 — RUTINA POR CADA TAREA
═══════════════════════════════════════════════════════════════════════════

1. Leer la sección correspondiente del HANDOFF
2. Levantar backend (npm run dev en backend/) + frontend (npm run dev en frontend/)
   y Neo4j (docker compose up -d argos-neo4j)
3. SMOKE INICIAL con claude-in-chrome: navegá a la ruta afectada, captura
   screenshot ANTES, lee console errors
4. Codear el cambio
5. tsc --noEmit en backend Y frontend
6. vitest run para regresión
7. SMOKE FINAL: screenshot DESPUÉS, console clean
8. Commit granular: "feat(audit-followup-P<N>): descripción · refs HANDOFF.md"
9. Push inmediato
10. Reportar al usuario con before/after screenshots

═══════════════════════════════════════════════════════════════════════════
§ 4 — REGLAS NO NEGOCIABLES (de CLAUDE.md)
═══════════════════════════════════════════════════════════════════════════

1. Cero alucinaciones. Toda salida verificable contra commit + comando.
2. Tier de evidencia explícito en cada hecho publicado.
3. Trazabilidad fuente_url obligatoria.
4. Tono neutral: "señales detectadas", NUNCA "hallazgos", "destapamos", "corrupto".
5. Banner DATOS SINTÉTICOS cuando se cae a fixture.
6. NO push --force, NO reset --hard a main, NO breaking en /api/*.
7. NO commitees sin smoke visual (claude-in-chrome).
8. NO toques los archivos tabú del frontend graph-first sin justificación:
   ExplorarLayout.tsx, GraphCanvas.tsx, lib/argos/api.ts, lib/argos/types.ts

═══════════════════════════════════════════════════════════════════════════
§ 5 — PRIMERA ACCIÓN
═══════════════════════════════════════════════════════════════════════════

Antes de codear nada, ejecutá P0 (verificación dinámica) y reportá al usuario:

```bash
cd backend && npx ts-node -e "
import { initDb, dbAll } from './src/lib/db'
initDb().then(async () => {
  console.log('=== Row counts reales ===')
  const tables = await dbAll(\"SELECT table_name FROM information_schema.tables WHERE table_schema='main' ORDER BY 1\")
  for (const t of tables) {
    const c = await dbAll(\`SELECT COUNT(*) as n FROM \"\${t.table_name}\"\`)
    console.log(t.table_name + ': ' + c[0].n)
  }
  console.log('=== Test pollution residual ===')
  const poll = await dbAll(\"SELECT COUNT(*) as n FROM personas_fisicas WHERE apellido_nombre LIKE 'Test %' OR dni IN ('14289301','11111111','12345678','24563128','99999999')\")
  console.log('Pollution count:', poll[0].n)
})"
```

Pegá el output como comentario en `docs/audit-2026-04-30/findings.md` bajo
una sección "## Post-handoff · Verificación dinámica" con fecha y hora.

Si Neo4j está arriba:
```cypher
// Coherencia arquetipos (correr en cypher-shell o Neo4j Browser)
// A. Persona con cargo
MATCH (pf:PersonaFisica)-[:ES_LA_MISMA_PERSONA]->(f:Funcionario)-[:TRABAJA_EN]->(r:Reparticion)
RETURN count(DISTINCT pf) as pf_con_cargo;

// B. Empresa con director y contrato
MATCH (pf:PersonaFisica)-[d:DIRIGE]->(e:Empresa)-[:GANO]->(c:Contrato)<-[:EMITE]-(r:Reparticion)
RETURN count(DISTINCT e) as cadena_completa, avg(d.tier) as tier_avg;

// C. Conflicto estructural
MATCH (pf:PersonaFisica)-[:ES_LA_MISMA_PERSONA]->(f:Funcionario)-[:TRABAJA_EN]->(r:Reparticion),
      (pf)-[:DIRIGE]->(e:Empresa)-[:OPERA_EN]->(r)
RETURN count(*) as conflictos;

// D. Empleados (GAP esperado: 0 hasta que se implemente P3)
MATCH (e:Empresa)-[r:TRABAJA_EN_EMPRESA]-(f) RETURN count(r);
```

Pegá outputs en findings.md. Después arrancá con P1 (migración 0003).

═══════════════════════════════════════════════════════════════════════════
§ 6 — CUANDO TERMINES (criterio de cierre)
═══════════════════════════════════════════════════════════════════════════

- P0-P5 completados con commit + push + screenshot por cada uno
- findings.md actualizado con sección "Post-handoff" + outputs reales
- 04-tab-by-tab.md creado con screenshots de cada ruta del frontend
- Tests E2E nuevos en P5 corriendo verde en CI
- PR draft contra main con resumen ejecutivo

Cuando todo cierre, dejá al usuario un Resumen Final con:
1. Métricas finales: row counts reales, coherencia % por arquetipo,
   pollution residual = 0, fuente_url coverage = 100%
2. Bugs encontrados durante la implementación (si los hubo)
3. Próximas piezas con scope acotado (P6+)
4. PR link

═══════════════════════════════════════════════════════════════════════════
NOTAS DEL AGENTE PREVIO
═══════════════════════════════════════════════════════════════════════════

- El audit cloud no tuvo Chrome MCP. Vos sí. Aprovechalo en cada cambio.
- claude-in-chrome para screenshots + read_console_messages en cada commit.
- Sub-agentes (Explore, code-reviewer, ui-ux-tester) útiles para
  paralelizar revisión de archivos grandes.
- Hourly commit rule: si pasaste 60 min sin commit, revisá si estás
  divagando. Volvé al HANDOFF §3.
- El user es Lautaro (amiunelautaro@gmail.com), plan Max, estricto con
  fidelidad a la visión. Si dudás, mostrá mockup ASCII y preguntá.
```

---

## Cómo usar este prompt

1. Abrí Claude Code en tu máquina local
2. Asegurate que `claude-in-chrome` esté conectado (verificá con `/mcp`)
3. Pegá el prompt completo (todo entre los ``` triples del bloque arriba)
4. El agente empezará por §0 (verificación) y §5 (primera acción)
5. Si algo del setup falla, te va a parar y avisar — respondé sus preguntas

Si querés ajustar prioridades (por ejemplo, hacer P3 antes que P2), editá
la sección §2 del prompt antes de pegarlo.
