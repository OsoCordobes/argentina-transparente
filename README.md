# ARGOS — Argentina Transparente

Motor anticorrupción ciudadano. Análisis automatizado del gasto público argentino.

> 📖 **Para periodistas, fiscales, ciudadanos**: leer primero [`docs/COMO-LO-HICIMOS.md`](./docs/COMO-LO-HICIMOS.md) — explica metodología, fuentes, garantías de proceso y limitaciones honestas.
>
> 📐 **Para desarrolladores**: las decisiones canónicas viven en [`docs/PLAN-DATOS.md`](./docs/PLAN-DATOS.md) (modelo de datos) y [`docs/PLAN-UI.md`](./docs/PLAN-UI.md) (interfaz). Son los specs de versión que no se rompen sin actualizarlos.

## ¿Qué hace ARGOS?

ARGOS descarga, normaliza y analiza datos de compras y contrataciones públicas para detectar señales de riesgo (prórrogas excesivas, concentración de proveedores, contrataciones directas sospechosas, fraccionamiento, gasto fin ejercicio, redes de empresas con directores compartidos, aparición offshore, conflictos funcionario↔proveedor, aportantes-de-campaña-y-proveedor, DDJJ omitidas, deuda flotante anómala, entre otras) y generar **expedientes ciudadanos verificables** que pueden presentarse ante Tribunal de Cuentas, Fiscalía, CNDC, ARCA o Defensoría del Pueblo.

## Garantías de proceso (resumen — detalle en [`docs/COMO-LO-HICIMOS.md`](./docs/COMO-LO-HICIMOS.md))

1. **Identidad primero**: PF tiene DNI+CUIT, PJ tiene CUIT. Validación módulo-11 obligatoria. Tier 4-5 LLM-ambiguous NUNCA entra a detectores publicables.
2. **Cap dinámico de score**: sin DNI verificado, cap-60 (severidad ≤ moderada). Con DNI verificado, cap-95.
3. **Filtro geográfico**: PJ proveedora con domicilio fiscal en otra provincia que la del funcionario → la señal no se emite.
4. **Badge de verificación universal**: ✓ verificada / ◌ sin verificar / ✗ descartada / ⚠ bloqueada. Innegociable.
5. **Toda fila con `fuente_url`, toda señal con evidencia trazable**. Sin URL, no entra.

## Stack

| Capa | Tecnología |
|------|-----------|
| Frontend | React 18 + TypeScript + Tailwind + Vite |
| Backend | Node.js + TypeScript + Express |
| Datos | DuckDB (analítica) + Neo4j (opcional, red de directores) |
| LLM | Claude Sonnet 4.6 (chat) + Haiku 4.5 (sugerencias), Anthropic SDK |
| Auth + persistencia | Supabase (opcional para casos) |
| Deploy | Railway (frontend + backend) |

## Branch del beta

El beta se desarrolla en [`claude/chat-first-ui-design-aWg0V`](https://github.com/OsoCordobes/argentina-transparente/tree/claude/chat-first-ui-design-aWg0V). Cobertura actual: **Córdoba Capital 2015–2025**.

## Arquitectura

Ver [`CLAUDE.md`](./CLAUDE.md) para el detalle del estado técnico, arquitectura, señales implementadas (16 detectores), fuentes de datos verificadas y roadmap.

## Modo Explorar v2 (Argos visual)

Vista chat-first en `/explorar` con grafo neural d3-force. Cinco features:

- **A** Panel del proveedor con KPIs (monto, contratos, área principal, señal más severa) + top 10 contratos clickeables → fuente original
- **B** Filtros año/área client-side con re-cálculo de monto en vivo
- **C** Botón "Copiar sumario (Markdown)" — pega listo en Google Docs / email
- **D** Descargar PNG del grafo + ficha con watermark "ARGOS · cordoba.gob.ar · [fecha]"
- **E** Chat history persistente (localStorage) + deeplinks `?focus=&q=` shareables

## LLM + Budget Guard

Tres endpoints respaldados por hard cap de saldo Anthropic:

| Endpoint | Modelo | Uso |
|---|---|---|
| `POST /api/chat` (SSE) | Sonnet 4.6 | Chat investigativo con system prompt anti-alucinaciones, cita node IDs `[[node:id]]` |
| `POST /api/ai/suggestions` | Haiku 4.5 | 0–5 sugerencias accionables (verify/investigate/escalate/cross_check) |
| `GET /api/ai/usage` | — | Budget operativo + acumulado semanal + costos por endpoint |

Cada call queda registrado en tabla `llm_usage`. `assertBudget()` aborta con 429 si proyectar el call excede `ANTHROPIC_BUDGET_USD` (default 45). Hard limit absoluto: $50.

## Desarrollo local

Requisitos: Node.js 20+, npm.

```sh
# Backend
cd backend
npm install
cp .env.example .env             # configurar ANTHROPIC_API_KEY
npm run dev                      # http://localhost:3001

# Frontend (en otra terminal)
cd frontend
npm install
npm run dev                      # http://localhost:8083 (o el primero libre desde 8080)
```

`.env` mínimo del backend:
```
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_BUDGET_USD=45.00
PORT=3001
```

`.env.development` del frontend:
```
VITE_API_URL=http://localhost:3001
VITE_CHAT_LLM=true               # habilita /api/chat real (sin esto, devuelve mensaje "sin LLM")
```

## Carga de datos (Córdoba Capital)

```sh
cd backend
npm run seed:cordoba                          # contratos 2015–presente vía API REST
npm run seed:licitaciones-historicas          # 2,343 llamados 2005–2018 (XLSX)
npm run seed:cordoba-sueldos                  # 33K sueldos 2017–2023
npm run seed:cordoba-historico --solo-csv     # boletín municipal 2013–2018 (LLM extractor)
npm run seed:igj                              # 420K entidades + 2.3M autoridades nacional (CSV bulk)
npm run analyze --force                       # recompute señales sobre todo el dataset
```

## Tests

```sh
cd backend
npm run test                                  # 172 unit tests vitest
npm run test:e2e                              # E2E contra localhost:3001 (requiere backend corriendo)
npx ts-node src/scripts/audit-trazabilidad.ts cordoba-capital  # cero gaps fuente_url
npx ts-node src/scripts/verify-hallazgos.ts                    # cada señal con evidencia + fuente
```

CI corre los 4 backends + typecheck + build frontend en cada push/PR.

## Pre-deploy checklist

1. ✅ Tests verde (`npm run test` 172/172)
2. ✅ Typecheck verde (`npx tsc --noEmit` backend + `npx tsc --noEmit -p tsconfig.app.json` frontend)
3. ✅ `audit-trazabilidad.ts` pasa (cero gaps de fuente_url)
4. ✅ `verify-hallazgos.ts` pasa (toda señal con evidencia)
5. ✅ Smoke browser local en `/explorar` muestra datos reales
6. 🟡 Anthropic `.env` y `ANTHROPIC_BUDGET_USD` configurados en Railway
7. 🟡 Si Supabase: aplicar `supabase/migrations/0001_casos.sql` y env vars
8. 🟡 Renombrar el servicio Railway del backend a `argos-backend` (acción manual desde el dashboard de Railway; URL legacy referenciada en `backend/.env.production`).

## Principios

- **Cero alucinaciones.** Toda salida importante debe ser verificable.
- **Toda señal o hallazgo debe poder reconstruirse desde la fuente original.**
- Trazabilidad de datos: `origen + fecha + método + formato + nivel_confianza` por fila.
- Diseñado para escalar de un municipio a nivel nacional.
- Ver [`CLAUDE.md`](./CLAUDE.md) sección "Instrucciones fijas" para el detalle completo.

## Roadmap post-beta

Propuestas priorizadas con costo estimado en [`~/Desktop/ARGOS-AUDIT-Y-PROPUESTAS.md`](file:///C:/Users/amiun/Desktop/ARGOS-AUDIT-Y-PROPUESTAS.md) (local). Resumen:

- **R1** — Endpoint IGJ + UI directores (~5h, activa 2.7M filas IGJ ya cargadas)
- **R2** — Detector `conflicto_funcionario_proveedor` (~7h, cruza 32K sueldos con proveedores)
- **R3** — Parser presupuesto Córdoba (BLOCKED — pivot/títulos heterogéneos, requiere LLM extraction o parsers específicos)
- **R4** — AFIP padrón empleadores oficial desde datos.gob.ar (~3h)
- **R5** — Loader obras públicas dataset 262 (~5h)

Multi-jurisdicción (Nación / CABA / Santa Fe) pospuesto a v1 post-beta. Connectors existen pero UI no los expone.

## Identity Resolution

Cada cruce nombre↔CUIT devuelve un tier con score explícito:

| Tier | Método | Score | UI |
|---|---|---|---|
| 1 | CUIT exact | 100 | ✓ verde |
| 2 | Nombre normalizado | 85 | ⚠ amarillo |
| 3 | Fuzzy match (Levenshtein ≥85%) | 70-99 | ⚠ amarillo |
| 4 | LLM ambiguous | 60-99 | 🤖 lila |
| 5 | Sin match | 0 | ✗ gris |

Para reducir tier 4: cargar `seed:afip-padron` + `seed:cordoba-padron-prov`.

## Licencia

Por definir (probablemente AGPL o MIT post-beta). Detalle de licencia + responsabilidad en [`docs/COMO-LO-HICIMOS.md`](./docs/COMO-LO-HICIMOS.md) §9.

## Specs canónicos

Los documentos versionados que rigen las decisiones del proyecto:

- [`docs/PLAN-DATOS.md`](./docs/PLAN-DATOS.md) v1.1 — modelo de datos (identidad PF/PJ, ciclo presupuestario, plan en 5 fases A→E, glosario).
- [`docs/PLAN-UI.md`](./docs/PLAN-UI.md) v1.0 — UI (átomo `ActorProfile`, 5 superficies con grafo, Graph Visual Language, expansión por grados).
- [`docs/COMO-LO-HICIMOS.md`](./docs/COMO-LO-HICIMOS.md) — landing publicable orientada a periodistas/fiscales/ciudadanos.

Si una decisión de UI requiere cambiar el modelo de datos, primero se actualiza el doc, después se toca código.

## Módulos compartidos del backend

Catálogos canónicos que múltiples detectores consumen — fuente única de verdad:

- [`backend/src/lib/jurisdicciones.ts`](./backend/src/lib/jurisdicciones.ts) — mapeo `jurisdiccion → provincia argentina`, lista de las 24 provincias federales, helpers de normalización y comparación. Alimenta el filtro geográfico de C1.
- [`backend/src/lib/cargos-conocidos.ts`](./backend/src/lib/cargos-conocidos.ts) — catálogo del Anexo III Ley 25.188 + cargos con poder de adjudicación + alto rango. Helpers `obligadoDeclararDDJJ`, `tieneCargoConPoder`, `esCargoAltoRango` con matching por word boundaries (no substring). Alimenta C1, C3.
- [`backend/src/lib/identidad-validator.ts`](./backend/src/lib/identidad-validator.ts) — validación módulo-11 de CUIT/DNI + helpers `formatDNI`, `categorizarCUIT`, `mismoDNI`, `derivarCUITsCandidatos`. Defensa en profundidad — se aplica al insertar, al resolver identidad, y al emitir señal.
