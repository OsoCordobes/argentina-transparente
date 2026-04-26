# ARGOS — Estado Técnico v3.0

> Canal de comunicación entre agentes (Cowork ↔ Claude Code).
> Leer ESTADO antes de tocar cualquier archivo.
>
> Nota: el proyecto se llamó "La Bestia" en sus primeras iteraciones. Renombrado a **ARGOS** en Sprint 0 (v3.0). Los servicios de Railway aún tienen el subdomain `bestia-backend-...` por inercia; renombrarlos requiere acción manual del usuario en Railway.

---

## URLs de Producción

- **Frontend:** https://victorious-luck-production-8d3a.up.railway.app
- **Backend:** https://bestia-backend-3e456938-0eae-49cf-b246-93a05746e060-production.up.railway.app *(rename pendiente en Railway → `argos-backend`)*

---

## Stack

| Capa | Tecnología | Deploy |
|------|-----------|--------|
| Frontend | React 18 + TypeScript + Tailwind + Vite | Railway (victorious-luck) |
| Backend | Node.js + TypeScript + Express | Railway (bestia-backend, rename pendiente) |
| LLM | Claude Sonnet 4 (anthropic SDK) | API call desde backend |
| Datos | gobiernoabierto.cordoba.gob.ar | API pública REST + XLSX |

---

## Arquitectura — Flujo de datos (v3.0)

**Frontend SPA** (entity-centric, post Sprint 1-3):

```
Usuario
  │
  ├─►  /              Dashboard          GET /api/dashboard
  ├─►  /entidad/:n    Ficha entidad      GET /api/entidad/:nombre
  ├─►  /contrato/:h   Ficha contrato     GET /api/contrato/:hash
  ├─►  /red           Grafo Cytoscape    GET /api/red/:municipio
  ├─►  /fuentes       Procedencia datos  GET /api/cruce/fuentes
  ├─►  /casos         Lista de casos     Supabase (RLS)
  ├─►  /caso/:id      Workspace caso     Supabase (RLS)
  └─►  /caso/:id/denuncia                POST /api/denuncia → PDF + SHA256

Búsqueda global (⌘K):  GET /api/entidad/search?q=...

Stack frontend: React 18 + TS + Tailwind + Vite + React Query +
react-router-dom v6 + Cytoscape + react-pdf consumo (PDF llega
del backend) + Supabase JS + zustand.
```

**Backend pipeline** (seed → signals → cache → API):

```
seed:cordoba ──► cordobaCapitalConnector
                    .getContratos(desde, hasta)
                       │
                       ▼
                fetcher.ts → API REST + timeout
                parser.ts  → XLSX parse
                       │
                       ▼
                DuckDB (contratos table)
                       │
                       ▼
seed:afip ────► afip.ts → empresas table (CUIT, esEmpleador, etc.)
seed:igj  ────► igj_entidades + igj_autoridades (CSV bulk load)
seed:neo4j ──► upsertEmpresaGrafo + upsertDirectoresGrafo (Neo4j)
                       │
                       ▼
analyze.ts ──► calcularSeñales(contratos, empresas, municipio)
                  [14 detectores en signals.ts]
                       │
                       ├─► extraerCuits(señal, empresas) → cuits[]
                       ▼
                señales_cache (con entidades_cuit JSON array)
                       │
                       ▼
              GET /api/dashboard / /api/entidad / /api/contrato / etc.

POST /api/denuncia ──► renderDenunciaPDF() [@react-pdf/renderer]
                       └─► PDF buffer + SHA256 + ISO timestamp + UUID
```

---

## Señales Implementadas (15 total)

Detectores en `backend/src/engine/signals.ts`. Tests cubren 103 casos.

| Señal | Tipología | Origen | Severidad |
|-------|-----------|--------|-----------|
| Prórrogas excesivas | `prorrogas_excesivas` | Contratos | moderada / grave |
| Concentración proveedor | `concentracion_proveedor` | Contratos | moderada / grave |
| Contrataciones directas | `contrataciones_directas` | Contratos | moderada / grave |
| Monopolio por rubro | `monopolio_rubro` | Contratos | moderada / grave |
| Servicios sin historial | `servicio_sin_historial` | Contratos | grave |
| Fraccionamiento avanzado | `fraccionamiento_avanzado` | Contratos | moderada |
| Gasto fin de ejercicio | `gasto_fin_ejercicio` | Contratos | moderada / grave |
| Proveedor crónico | `proveedor_cronico` | Contratos multi-año | moderada |
| Empresa nueva | `empresa_nueva` | Contratos + AFIP | moderada |
| Empresa sin empleados | `empresa_sin_empleados` | Contratos + AFIP | grave |
| Directores compartidos | `directores_compartidos` | Neo4j (IGJ) | grave |
| Red de empresas | `red_de_empresas` | Neo4j (IGJ, ≥2 dir) | grave |
| Rotación coordinada | `rotacion_coordinada` | Contratos (timing) | grave |
| Adenda post-adjudicación | `adenda_postajudicacion` | Contratos | moderada / grave |
| **Aparición offshore/sanción** | `aparicion_offshore` | AFIP + cache OpenSanctions/ICIJ | grave |

Cada `Señal` lleva opcionalmente `cuits?: string[]` (poblado por `analyze.ts`)
para asociación señal↔entidad sin string matching frágil. Esa columna se
escribe a `señales_cache.entidades_cuit` (JSON).

`aparicion_offshore` requiere ejecutar `npm run seed:opensanctions` antes de
`npm run analyze --force`. Cachea matches en tabla `opensanctions_matches`
con TTL 30 días. Solo dispara si el riesgo es offshore/sancionado/crimen
(PEP solo no dispara — es información, no delito).

---

## Fuentes de Datos Verificadas

| Fuente | URL | Años | Formato |
|--------|-----|------|---------|
| Córdoba Capital | gobiernoabierto.cordoba.gob.ar/.../compras-y-contrataciones/2 | 2019–2023 | XLSX via API REST |
| Nación (Argentina Compra) | api.contrataciones.argentina.gob.ar/v1 | 2016–presente | JSON OCDS v1.1 |
| CABA | data.buenosaires.gob.ar (CKAN) | 2018–presente | CSV via discovery CKAN |

Dataset IDs Córdoba: 2019→`2`, 2020→`5977`, 2021→`5978`, 2022→`6466`, 2023→`6467`

---

## Cómo Agregar un Nuevo Municipio

1. Crear `backend/src/connectors/<id>/`
2. `fetcher.ts`: `fetchRawRows(anio) → Record<string, unknown>[]`
3. `parser.ts`: `parseRows(rows, anio) → Contrato[]`
4. `index.ts`: exportar `const xConnector: MunicipioConnector`
5. Registrar en `connectors/interface.ts` → `registry`

---

## Cómo Agregar una Nueva Señal

1. En `backend/src/engine/signals.ts` agregar `export function detectarXxx(contratos): Señal | null`
2. Agregar al array `detectores` en `calcularSeñales()`
3. Testear: `npm run test:signals 2022 2023`

---

## Variables de Entorno

**Backend (`backend/.env`):**
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

**Frontend (`frontend/.env.development` / `.env.production`):**
```
VITE_API_URL=http://localhost:3001
VITE_API_URL=https://bestia-backend-...railway.app  # rename pendiente → argos-backend-...
```

---

## Tests Disponibles

| Comando | Desde | Descripción |
|---------|-------|-------------|
| `npm run test` | backend/ | 133 unit tests (vitest) |
| `npm run test:connector` | backend/ | Descarga y parsea 2023 |
| `npm run test:signals 2022 2023` | backend/ | 2 años, señales detectadas |
| `npm run test:signals 2019 2023` | backend/ | 5 años — 1390 contratos, 5 señales |
| `npm run test:e2e` | backend/ | E2E contra localhost:3001 |
| `npx ts-node src/test-production.ts` | backend/ | E2E contra Railway producción |
| `npm run ckan:explore -- nacion` | backend/ | Lista datasets de compras en datos.gob.ar |
| `npm run seed:nacion -- 2022` | backend/ | Descarga contratos nacionales 2022 |
| `npm run seed:caba -- 2023` | backend/ | Descarga contratos CABA 2023 |
| `npm run seed:icij -- /ruta/csvs` | backend/ | Carga ICIJ Offshore Leaks en DuckDB |
| `npm run seed:santafe` | backend/ | Carga contratos Santa Fe (CKAN) |
| `GET /api/scrapers/health` | backend/ | Estado de scrapers registrados |
| `npm run alertas:check` | backend/ | Detector de alertas (cron-friendly) |
| `GET /api/alertas` | backend/ | Lista alertas (?soloNoLeidas=true) |
| `npm run seed:boletin -- --url <PDF>` | backend/ | OCR Vision API sobre Boletín Oficial |
| CI (GitHub Actions) | `.github/workflows/ci.yml` | typecheck + tests + build en push/PR |

---

## Roadmap

**Hecho en v3.0 (PR #3, Sprints 0-4 + post-MVP round 1-3):**
- ✅ Verificación AFIP best-effort
- ✅ Exportar expediente a PDF (Denuncia formal con cadena de custodia)
- ✅ Frontend SPA investigativa entity-centric
- ✅ Casos persistentes con Supabase + RLS
- ✅ Red de empresas con Cytoscape + Neo4j
- ✅ OpenSanctions client + endpoints `/api/cruce/*`
- ✅ Connector framework con metadata trazable
- ✅ **Señal `aparicion_offshore` integrada al engine** (cache OS por CUIT, TTL 30d)
- ✅ **CI GitHub Actions** (typecheck + tests + build + naming-check)
- ✅ **Frontend code splitting** (lazy routes + manualChunks; bundle inicial 491KB → 185KB gzip)
- ✅ **CKAN client + `npm run ckan:explore`** (Nación / CABA / Santa Fe / Rosario)
- ✅ **Connector Argentina Compra** (Estado nacional OCDS, 2016–presente, `npm run seed:nacion`)
- ✅ **Connector CABA** (CKAN + CSV discovery, 2018–presente, `npm run seed:caba`)
- ✅ **ICIJ Offshore Leaks bulk** (Panama Papers + Pandora + Paradise + Bahamas; `npm run seed:icij -- /ruta`; auto-cruza contra `empresas` y popula `opensanctions_matches`)
- ✅ **Scraper base + health monitoring** (`lib/scraper.ts` + `scrapers_health` DuckDB + `GET /api/scrapers/health`)
- ✅ **Connector Santa Fe** (CKAN + CSV, `npm run seed:santafe`)
- ✅ **Modo comparativo jurisdicciones** (`/municipios` — bar chart + cards per jurisdicción + scraper health)
- ✅ **Alertas automáticas** (`/alertas` + badge en topbar; detector vía `npm run alertas:check`; scrapers rotos / fuentes desactualizadas / datos nuevos)
- ✅ **Pipeline OCR Boletines** (`npm run seed:boletin -- --url|--file`; Sonnet 4.6 con PDF nativo + adaptive thinking + prompt caching; zod validation; trazabilidad por página)

**Pendiente post-MVP:**
- Análisis obra pública via Boletín Oficial
- Cruce nómina municipal vs proveedores
- Modo comparativo entre municipios
- Alertas automáticas cuando se publican nuevos datos

---

## Estructura de Archivos Clave (v3.0)

```
backend/src/
├── index.ts                    ← Express + monta /api/* + registra fuentes
├── routes/
│   ├── analizar.ts             ← Legacy: POST /analizar (flujo antiguo)
│   ├── historial.ts            ← Legacy: GET /historial
│   ├── dashboard.ts            ← GET /api/dashboard
│   ├── entidad.ts              ← GET /api/entidad/search + /:nombre
│   ├── contrato.ts             ← GET /api/contrato/:hash (Sprint 2)
│   ├── red.ts                  ← GET /api/red/:municipio (Cytoscape)
│   ├── denuncia.ts             ← POST /api/denuncia (PDF + SHA256)
│   └── cruce.ts                ← /api/cruce/{fuentes,persona,empresa}
├── connectors/
│   ├── interface.ts            ← Registry + getConnector() (3 connectores)
│   ├── cordoba-capital/
│   │   ├── index.ts            ← MunicipioConnector + FuenteMetadata (XLSX)
│   │   ├── fetcher.ts          ← API REST + XLSX + timeouts
│   │   └── parser.ts           ← XLSX → Contrato[]
│   ├── argentina-compra/
│   │   ├── index.ts            ← Estado nacional OCDS 2016–presente
│   │   ├── fetcher.ts          ← JSON paginado (50K max/año, 250ms delay)
│   │   └── parser.ts           ← OCDS releases → Contrato[]
│   └── caba/
│       ├── index.ts            ← CABA 2018–presente vía CKAN
│       ├── fetcher.ts          ← CKAN discovery + CSV download
│       └── parser.ts           ← CSV flexible (multiples versiones de cols)
├── engine/
│   ├── signals.ts              ← 15 detectores de riesgo
│   └── signals.test.ts         ← 103 tests vitest
├── lib/
│   ├── db.ts                   ← DuckDB: contratos, señales_cache, empresas,
│   │                              directores, igj_*, reportes, fuentes_datos,
│   │                              opensanctions_matches
│   ├── graph.ts                ← Neo4j: empresas + directores + getRedCytoscape
│   ├── claude.ts               ← generarExpediente() + prompt periodístico
│   ├── afip.ts                 ← CUIT lookup best-effort
│   ├── opensanctions.ts        ← Sprint 4: search + match endpoints
│   ├── ckan.ts                 ← Post-MVP: cliente CKAN genérico (4 portales AR)
│   └── denuncia-pdf.tsx        ← Sprint 3: @react-pdf/renderer (jsx: react-jsx)
├── scripts/
│   ├── seed-cordoba.ts         ← Carga contratos Córdoba Capital en DuckDB
│   ├── seed-nacion.ts          ← Carga contratos Estado nacional (OCDS)
│   ├── seed-caba.ts            ← Carga contratos CABA (CKAN CSV)
│   ├── seed-afip.ts            ← Enriquece empresas con AFIP
│   ├── seed-igj.ts             ← Carga IGJ entidades + autoridades
│   ├── seed-neo4j.ts           ← Carga grafo Neo4j desde DuckDB
│   ├── seed-opensanctions.ts   ← Cachea matches OS por CUIT (TTL 30d)
│   ├── ckan-explore.ts         ← CLI: lista datasets en portal CKAN
│   └── analyze.ts              ← Calcula señales en todos los municipios
└── types/index.ts              ← Contrato, Señal, Expediente, FuenteMetadata,
                                   ConnectorTipo, NivelConfianza, OSMatch

frontend/src/
├── App.tsx                     ← Routes + AppShell layout
├── main.tsx                    ← QueryClientProvider + AuthProvider + Toaster
├── pages/
│   ├── Dashboard.tsx           ← KPIs + top entidades + señales activas
│   ├── Entidad.tsx             ← Tabs (Resumen/Contratos/Timeline/Señales)
│   ├── Contrato.tsx            ← Ficha individual + cadena de custodia
│   ├── Red.tsx                 ← Cytoscape grafo empresa↔directores
│   ├── Fuentes.tsx             ← Procedencia de datos (Sprint 4)
│   ├── Login.tsx               ← Magic-link Supabase
│   ├── Casos.tsx               ← Lista de casos + crear
│   ├── Caso.tsx                ← Workspace tabs + sidebar notas autosave
│   └── Denuncia.tsx            ← Wizard 5 pasos + PDF download
├── components/
│   ├── layout/AppShell.tsx     ← Topbar + nav + cmd+k + dropdown user
│   ├── search/CommandPalette.tsx ← cmdk + useEntidadSearch
│   ├── caso/AddToCase.tsx      ← Dropdown reutilizable
│   └── ui/                     ← shadcn/ui (50 componentes)
├── lib/
│   ├── queries.ts              ← React Query tipado: useDashboard, useEntidad,
│   │                              useContrato, useRed, useFuentes
│   ├── api.ts                  ← Legacy: analizarMunicipio, etc.
│   ├── format.ts               ← fmtARS, fmtCompactARS, fmtFecha, fmtPct
│   ├── supabase.ts             ← Cliente con stub si no configurado
│   ├── auth.tsx                ← AuthProvider + useAuth()
│   └── casoQueries.ts          ← CRUD casos via Supabase + React Query
└── stores/
    └── casoStore.ts            ← Zustand bookmarks volátiles (pre-Supabase)

supabase/
└── migrations/
    └── 0001_casos.sql          ← Schema casos + RLS por user_id
```

---

## LOG

### 2026-03-18 — Claude Code (sesión plan 7h)
- E2E producción PASSED: 122 contratos, 3 señales, Sonnet OK
- +3 señales: `servicio_sin_historial`, `fraccionamiento_avanzado`, `gasto_fin_ejercicio`
- +1 señal multi-año: `proveedor_cronico`
- `afip.ts`: verificación CUIT best-effort vía cuitonline.com
- `claude.ts`: integración AFIP + prompt periodístico con marco legal
- `fetcher.ts`: timeout 30s/API, 60s/XLSX
- Frontend: barra de progreso 6 pasos en Loading
- Frontend: botón "Copiar para compartir" en Report
- Test 5 años 2019–2023: 1390 contratos, 5 señales detectadas

### 2026-04-25 — Claude Code (sesión multi-sprint v3.0)

**PR #3 — `claude/anticorruption-tool-frontend-f0dYN` → `main`**

Sprint 0 — Renombrado completo La Bestia → ARGOS. CLAUDE.md header v3.0,
frontend (title/og), backend package name → argos-backend@3.0.0, README real,
borrados LA_BESTIA_CONTEXT.md y frontend/.lovable/. URLs Railway preservadas
con flag "rename pendiente" (acción manual del usuario).

Sprint 1 — Frontend SPA investigativa entity-centric. Borradas Landing/Report/
ProviderProfile (793 LOC). Nuevo AppShell con cmd+k global (cmdk + debounce
200ms vs `/api/entidad/search`), Dashboard cross-municipio con KPIs + top
entidades + grilla de señales activas, Entidad con tabs (Resumen/Contratos/
Timeline/Señales) + tabla virtualizada `@tanstack/react-table` con
sort+filter+paginación + recharts BarChart anual. React Query providers,
sonner toaster, queries.ts tipadas.

Sprint 2 — Cierre del círculo entity-centric.
- Backend: `Señal.cuits?: string[]`, `getSeñalesPorCuit(cuit)`, `getContratoPorHash`,
  `getRedCytoscape(municipio)` que emite { nodes, edges } directo. Routes nuevas
  `/api/contrato/:hash` (ficha con cadena de custodia hash + URL fuente) y
  `/api/red/:municipio` (Cytoscape). `analyze.ts` extraerCuits matchea nombres
  ≥4 chars contra Map empresas para poblar `entidades_cuit`.
- Frontend: pages/Contrato.tsx (cadena de custodia forense), pages/Red.tsx
  (Cytoscape + dagre, click empresa → entidad, click arista → directores +
  marco legal Ley 27.442/LGS art.33), tab Señales en Entidad consume señales
  cruzadas por CUIT (no más placeholder).

Sprint 3 — Casos persistentes + denuncia formal.
- `supabase/migrations/0001_casos.sql`: schema casos/caso_entidades/caso_contratos/
  caso_directores/caso_senales/caso_notas con RLS y triggers de actualizado_en.
- Frontend: lib/supabase.ts (stub si no configurado), lib/auth.tsx (AuthProvider),
  lib/casoQueries.ts (CRUD via React Query), stores/casoStore.ts (zustand
  bookmarks volátiles). Páginas Login (magic-link), Casos (lista + dialog crear),
  Caso (workspace tabs + sidebar notas markdown autosave 800ms), Denuncia (wizard
  5 pasos zod + react-hook-form, narrativa auto desde caso). Componente
  AddToCase reutilizable en Entidad/Contrato.
- Backend: lib/denuncia-pdf.tsx con `@react-pdf/renderer` (carátula, hechos,
  señales, anexos numerados con hash + fuente, cadena de custodia formal).
  Route POST /api/denuncia computa SHA256 + timestamp ISO, expone vía headers
  X-Document-SHA256 / X-Document-Timestamp / X-Document-ID.
- tsconfig.json backend: `jsx: "react-jsx"`, +@types/react.

Sprint 4 — Data Foundation base.
- types: ConnectorTipo, FuenteMetadata, NivelConfianza. MunicipioConnector
  +tipo +fuente opcionales (backwards compat).
- DuckDB: tabla `fuentes_datos` con metadata trazable (CLAUDE.md §4 cumplido).
- Conectores: cordoba-capital declara FuenteMetadata oficial.
- OpenSanctions: lib/opensanctions.ts (search + match endpoints, esRiesgoAlto
  helper para clasificar PEP/sancionado/offshore/crimen). Routes /api/cruce/
  fuentes|persona|empresa.
- Frontend: pages/Fuentes.tsx (transparencia de procedencia), useFuentes(),
  link en footer.

Pendiente para post-MVP:
- Connector CKAN genérico para datos.gob.ar / CABA / provincias.
- Scraper Playwright + health monitoring.
- Pipeline OCR Claude Vision (boletines pre-2015, costo estimado ~$7K para
  Córdoba 2010–2018 a $0.02/página).
- Bulk download ICIJ Offshore Leaks → tablas internacional_personas/entidades.
- Señal `aparicion_offshore` integrada al engine (cache de matches por CUIT
  para evitar 1 round-trip API por señal).
- Setup Supabase del usuario: crear proyecto, aplicar migración 0001_casos.sql,
  setear VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.
- Rename servicio Railway bestia-backend → argos-backend (manual).

Métricas finales sesión:
- 5 commits pusheados a `claude/anticorruption-tool-frontend-f0dYN`
- 89 tests vitest siguen verde
- backend tsc + build OK, frontend tsc + build OK (1.65MB → 491KB gzip)
- ~5500 LOC netas agregadas (frontend ~3500 + backend ~2000)

### 2026-04-25 (cont) — Claude Code (post-MVP round 1+2)

**Round 1 — CI + perf:**
- `.github/workflows/ci.yml`: 3 jobs (backend, frontend, naming-check) con
  cache npm. Trigger en push a main + PRs. naming-check falla si aparece
  "bestia" fuera de URLs Railway permitidas (auto-excluye ci.yml).
- Frontend code splitting: React.lazy() en todas las rutas excepto
  Dashboard (eager para LCP). Suspense con PageLoader. vite.config.ts
  manualChunks separa cytoscape/recharts/supabase/react-vendor/react-query/radix.
  **Initial load: 491KB gzip → 185KB gzip (-62%)**. Cytoscape (175KB gzip)
  solo se descarga al ir a /red.

**Round 2 — Señal #15 + CKAN scaffolding:**
- Señal `aparicion_offshore`: cruza CUITs ARGOS con cache OpenSanctions/ICIJ.
  Solo dispara cuando riesgo es offshore/sancionado/crimen (PEP solo NO).
  Severidad grave; score 95/92/88. Marco legal Ley 25.246, 27.401, OCDE.
  Denunciar ante UIF + Procuración del Tesoro.
- types: `OSMatch` (cuit, matched, riesgo, dataset, cached metadata).
- db.ts: tabla `opensanctions_matches` keyed por CUIT, helpers
  upsertOSMatch/getOSMatch/getOSMatchesAll/getOSMatchesCount, TTL 30 días.
- engine/signals.ts: `detectarAparicionOffshore` + `calcularSeñales` acepta
  4to param `osMatches?` (backwards compat).
- scripts/seed-opensanctions.ts: recorre empresas con CUIT, query OS rate
  limited 350ms (~3 req/seg), cachea. Soporta --force.
- scripts/analyze.ts: carga osMatches antes de calcularSeñales.
- 14 tests nuevos para la señal: **89 → 103 tests verde**.
- lib/ckan.ts: CKANClient genérico (searchDatasets/getDataset/listOrgs)
  + registry PORTALES_CKAN_AR (Nación / CABA / Santa Fe / Rosario).
- scripts/ckan-explore.ts: CLI `npm run ckan:explore [<portal>] [<query>]`
  para descubrir datasets en cualquier portal CKAN argentino. No descarga
  datos, solo lista metadata para decidir qué connector implementar próximo.

Métricas round post-MVP:
- 3 commits adicionales (CI+perf, offshore+CKAN, docs)
- 103 tests vitest verde
- Frontend bundle inicial -62%
- 1 nueva señal (15 totales)
- 2 nuevos scripts npm (seed:opensanctions, ckan:explore)

### 2026-04-25 (cont) — Claude Code (post-MVP round 3: connectors multi-jurisdicción)

**Round 3 — Argentina Compra + CABA connectors:**

Contexto: la rama `feat/e1-backend-debt` referenciada por un agente paralelo no
existía en el repositorio (worktree temporal limpiado). Sin conflictos.

Connectors nuevos implementados:
- `connectors/argentina-compra/`: Estado nacional (ONC) vía API REST OCDS v1.1.
  Cobertura 2016–presente (Resolución ONC 59/2016). Paginación de hasta 50K
  registros/año con 250ms de pausa (~4 req/seg). Parser OCDS → Contrato[] con
  fallbacks en cadena para proveedor/monto/tipo/fecha. FuenteMetadata completa.
  `npm run seed:nacion [anioDesde] [anioHasta] [--force]`

- `connectors/caba/`: CABA vía CKAN (data.buenosaires.gob.ar). Descubre el
  dataset de compras automáticamente con 3 queries de fallback. Parser CSV
  flexible contra múltiples versiones de nombres de columnas (el portal las
  cambia). FuenteMetadata completa.
  `npm run seed:caba [anioDesde] [anioHasta] [--force]`

Ambos registrados en `connectors/interface.ts` y en `src/index.ts` (fuentes +
endpoint GET /municipios). `analyze.ts` actualizado para incluir
`argentina-compra` en el array de municipios a analizar.

`seed:all` ahora ejecuta 6 seeds en secuencia:
  seed:cordoba → seed:nacion → seed:igj → seed:afip → seed:neo4j → seed:opensanctions

103 tests siguen verde. tsc --noEmit OK. Sin cambios en frontend.

### 2026-04-25 (cont) — Claude Code (post-MVP round 4: ICIJ bulk)

**Round 4 — ICIJ Offshore Leaks integración offline:**

- `lib/db.ts`: tabla `icij_entidades` (node_id, nombre, nombre_norm, tipo,
  jurisdiccion, countries, country_codes, fuente, estado, incorporacion).
  Índice en `nombre_norm` para búsqueda eficiente. Helpers:
  `insertICIJBatch`, `buscarICIJPorNombre`, `getICIJCount`, `normalizeICIJ`.

- `lib/icij.ts`: parser streaming CSV (readline line-by-line — los archivos
  pueden ser >1GB). `parsearEntidades(Entities.csv)` + `parsearOfficers(Officers.csv)`.
  `encontrarArchivosICIJ(dir)` busca los CSVs recursivamente sin importar
  estructura interna del ZIP. Divisor CSV respeta comillas dobles + escape `""`.

- `scripts/seed-icij.ts`: acepta `/ruta/al/directorio` como argumento.
  Soporte `--force` y `--solo-ar` (filtra por country_codes=ARG, más rápido).
  Al finalizar carga, cruza automáticamente contra tabla `empresas` (por nombre
  normalizado) y popula `opensanctions_matches` con riesgo='offshore' + URL
  `offshoreleaks.icij.org/nodes/:node_id`. Esto hace que `npm run analyze`
  detecte offshore sin API on-demand y sin rate limit.

- `routes/cruce.ts`: nuevo endpoint `GET /api/cruce/icij?nombre=...` que
  consulta la base local. Retorna `baseCargada: bool + totalEnBase + fuentes`
  para que el frontend sepa si el dataset está disponible.

Cobertura ICIJ: Panama Papers (~800K entidades), Pandora Papers (~330K),
Paradise Papers (~25K), Offshore Leaks (~540K), Bahamas Leaks (~175K).
Con `--solo-ar` carga solo los registros vinculados a Argentina (~pocos miles),
útil para ambientes con menos disco/RAM.

103 tests siguen verde. tsc --noEmit OK.

### 2026-04-25 (cont) — Claude Code (post-MVP round 5: scrapers + Santa Fe + comparativo)

**Round 5 — Infraestructura scrapers + jurisdicción 4 + UI comparativa:**

Backend:
- `lib/scraper.ts`: `BaseScraper` abstract class con `run()` que registra
  salud en DuckDB. `fetchHTML()` + `parsearTablaHTML()` para scrapers HTML.
  Patrón documentado para extender con Playwright cuando el portal requiera JS.
- `db.ts`: tabla `scrapers_health` (id, ejecutado_en, ok, contratos_count,
  duracion_ms, error_msg, url_chequeada). Helpers `registrarScraperRun` +
  `getScrapersHealth` (última run por scraper).
- `routes/scrapers.ts`: `GET /api/scrapers/health` — estado + clasificación
  ok/warning/error de todos los scrapers conocidos.
- `connectors/santa-fe/`: 4ta jurisdicción — Santa Fe Province via CKAN
  (`datosabiertos.santafe.gob.ar`). Parser CSV flexible igual que CABA.
  `npm run seed:santafe [año] [--force]`. FuenteMetadata completa.
- Interface.ts / index.ts actualizados con Santa Fe.

Frontend:
- `pages/Municipios.tsx`: vista comparativa entre jurisdicciones. Bar chart
  (recharts) de monto por jurisdicción, cards individuales con KPIs (contratos,
  monto, señales, % del total, progress bar, link a señales filtradas).
  Sección de scraper health (CheckCircle/XCircle por estado). Lazy-loaded.
- `AppShell.tsx`: nuevo nav item "Jurisdicciones" → /municipios (Building2).
- `lib/queries.ts`: `useScrapersHealth` + `ScraperHealth` + `ScrapersHealthResponse`.
- `App.tsx`: ruta `/municipios` lazy.

103 tests siguen verde. tsc --noEmit OK (backend + frontend).

### 2026-04-25 (cont) — Claude Code (post-MVP round 6: alertas automáticas)

**Round 6 — Sistema de alertas event-driven:**

Backend:
- `db.ts`: tabla `alertas` (id PK, tipo, severidad, titulo, detalle, fuente_id,
  detectado_en, leida, leida_en) + `alerta_snapshots` (snapshot de counts para
  detectar deltas). Helpers `upsertAlerta`/`getAlertas`/`marcarAlertaLeida`/
  `marcarTodasLeidas`/`countAlertasNoLeidas`.
- `lib/alertas.ts`: `detectarAlertas()` corre 3 chequeos:
  1. **Scrapers rotos**: itera `scrapers_health` última run, si !ok → critical.
  2. **Fuentes desactualizadas**: compara `ultimo_crawl` vs frecuencia esperada
     (diaria=2d, semanal=10d, mensual=45d, anual=400d). >2x el umbral = critical.
  3. **Datos nuevos**: compara contratos count actual vs snapshot anterior.
     Delta positivo → alerta info "N contratos nuevos en municipio X".
  IDs estables → idempotente (UPSERT, no duplicados).
- `routes/alertas.ts`: GET / (lista + count), GET /count (badge liviano),
  POST /:id/leer, POST /leer-todas, POST /detectar (manual trigger).
- `scripts/check-alertas.ts`: cron-friendly. Ejemplo crontab al docstring.
  Nuevo script npm: `npm run alertas:check`.

Frontend:
- `lib/queries.ts`: `useAlertas` (lista) + `useAlertasCount` (badge, refetch 5min)
  + helpers `marcarAlertaLeida` / `marcarTodasAlertasLeidas`.
- `pages/Alertas.tsx`: lista con icono por tipo, color por severidad, filtro
  "solo no leídas", botones "marcar leída" / "marcar todas leídas".
- `AppShell.tsx`: badge Bell con count en topbar (rojo=critical, amarillo=warning,
  link a /alertas). 99+ cap visual.
- `App.tsx`: ruta `/alertas` lazy.

103 tests siguen verde. tsc --noEmit OK (backend + frontend).

### 2026-04-26 — Claude Code (sesión beta plan 7-fase + features A-E + cron loop)

Sesión completa de ejecución del plan-beta sobre branch
`claude/chat-first-ui-design-aWg0V` (rama destino confirmada por user
para evitar merge con feat/e1-backend-debt antiguo).

**Plan 7-fase — todas commiteadas:**
- Fase 1 (`1ba0bb7`): bugs B1 (seed-cordoba hardcode) + B2 (BigInt × 4 sitios + patch global toJSON) + B3 (detectarConcentracionTemporal multiyear)
- Fase 2 (`8b5afcb`): scripts audit-trazabilidad + inspect-db. DB real verificada: 2,421 contratos 2015-2025 (no 2019-2023 como creía el user) + 33K sueldos + 2.3K licitaciones + 420K IGJ entidades + 2.3M IGJ autoridades
- Fase 3 (`f43edb4`): Argos v2.0 frontend pixel-perfect del zip. 4 olas de agentes paralelos: mockData/icons/CSS → chat/api → panel/graph → layout. Total +5,272 LOC. Eliminados fixtures sintéticos (CLAUDE.md §2)
- Fase 4 (`245839c`): backend LLM con budget guard semanal (€50/sem viernes). Tabla llm_usage + budget-guard.ts + endpoints /api/chat (Sonnet SSE) + /api/ai/suggestions (Haiku JSON) + /api/ai/usage. Smoke real: $0.012 / $45 (0.027% gastado)
- Fase 5 (`eb386b2`): bugs B5/B6/B8 (normalizarProveedor + regex anclada + LICITACION en fraccionamiento) + sidebar embedded chat + frontend envía context.graph al backend
- Fase 6 (`2c6de8c`): script verify-hallazgos.ts. 8/8 señales con evidencia + fuente_url verificable
- Fase 7 (`1da2bf0`): release notes. Branch pusheada a remote

**Features A-E (post-brainstorming, /loop autónomo iter 1-5):**
- A (`dbe7e9e`): panel proveedor "ficha rápida" con 4 KPIs grandes + top 10 contratos clickeables a fuente_url + badge fecha + método
- B (`2a1c45f`): filtros año/área client-side + KPI inline filtrado
- C (`152dce5`): copiar sumario Markdown con [link a fuente] por item
- D (`f6966b2`): screenshot PNG con watermark "ARGOS · cordoba.gob.ar · [fecha]"
- E (`ed8a014`): chat persistence localStorage + deeplink `?focus=&q=` shareable

**Iter #6**: audit doc generado en `~/Desktop/ARGOS-AUDIT-Y-PROPUESTAS.md`.
Hallazgo crítico: 2.7M filas IGJ + 32K sueldos cargadas pero sin uso UI.
Propuestas R1-R5 priorizadas para approval del user.

**Iter #7** (`151a5aa`): bug B7 detectarServiciosSinHistorial robusto a
typos (RAICES_SERVICIO 25 prefijos vs 7 keywords) + match en
descripcion+tipo+area + CI hardening (audit-trazabilidad +
verify-hallazgos como steps post-build).

**Iter #8** (este commit): sweep de COUNT BigInts pendientes
(loadIGJFromCSV) + LOG update.

Métricas finales sesión:
- 12 commits sobre claude/chat-first-ui-design-aWg0V
- ~6,800 LOC netas agregadas
- Tests: 103 → 133 vitest verde
- Endpoints LLM nuevos: 3 (chat, suggestions, usage)
- Anthropic gastado: ~$0.012 (0.027% del cap semanal)
- Beta funcional: /explorar, /casos, /denuncia, /api/* end-to-end

Backlog post-beta documentado en ARGOS-AUDIT-Y-PROPUESTAS.md:
- R1 Endpoint IGJ + UI directores (~5h, activa 2.7M filas)
- R2 Detector conflicto funcionario↔proveedor (~7h, 32K sueldos)
- R3 Fix parser presupuesto Córdoba (~4h)
- R4 AFIP padrón empleadores desde datos.gob.ar (~3h)
- R5 Loader obras públicas dataset 262 (~5h)

### 2026-04-26 — Claude Code (refactor arquitectura datos)

Implementado spec `docs/superpowers/specs/2026-04-26-argos-arquitectura-datos-design.md`.

Cambios principales:
- Engine: 16 detectores → ~12 (Tier 3 archivado). Cada uno con norma citada
  + umbral fundamentado en `detectors-config.json`.
- Identity resolver tiered: cruce nombre↔CUIT con score explícito.
  AFIP padrón empleadores y Padrón provincial Córdoba cargados.
- Universo cordobés N2 vía vistas materializadas.
- Validador post-LLM bloquea hechos sin cita en `/api/chat`.
- UI: render 2 voces (hechos vs interpretación), TierBadge + IdentityBadge
  en cada campo crítico.
- Onboarding modal con disclaimer al primer login.
- Watchlist personal con magic-link Supabase opcional + badge novedades.
- `verify-hallazgos.ts` extendido para asertar que cada señal cacheada
  tenga entrada (norma + tier) en `detectors-config.json`.
- Fix lingering: `claude.ts` citaba "Ley 8614" (derogada); reemplazado
  por "Ley 10.155 + Decreto 305/14" (régimen vigente bienes/servicios).
- Auditoría legal en `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md`
  (fuera del repo).

Tests: 215 → 222 verde.

### 2026-04-26 (cont) — Claude Code (Misión Córdoba M1: CKAN bulk Tier S)

Plan ejecutado: `docs/MISION-CORDOBA-2010-2026.md` milestone M1.

**Bug crítico encontrado y arreglado** en `lib/cordoba-portal.ts`:
`listarVersionesDataset()` no paginaba la API REST y devolvía solo 20
versiones de cualquier dataset. Datasets con >20 versiones (131: 81,
65: 41+, 12: 63+, 5: 26, 14: 20+) silenciosamente perdían meses/años
enteros de datos. Fix: while-loop sobre `next` URL hasta agotar.

**Datos cargados (counts post-M1 / pre-M1):**
- `agentes_publicos`: 178,364 / 32,565 (+146K)
  - agente: 158,638 (Córdoba Capital + 15 ministerios provinciales)
  - funcionario: 18,907 (dataset 131 mensual 2016-2023, ahora completo)
  - concejal: 819
- `rns_personas_juridicas`: 196,146 (nuevo) — **191,043 CORDOBA**
  Dos snapshots: 202412 (94K) + 202604 (308K), dedup por id.
- `fuentes_publicas_catalogo`: 53 / 7 (+46) — incluye 45 packages CKAN
  provincia + dataset 187 Cuenta General catalogado como pendiente.

**Scripts nuevos:**
- `seed:rns` (`scripts/seed-rns.ts`): CKAN datos.jus.gob.ar →
  package_show → ZIPs anuales 2019-2026 → AdmZip extract → readline
  streaming → INSERT OR IGNORE rns_personas_juridicas. Default
  `--solo-cba` (filtra dom_fiscal/legal_provincia=CORDOBA), `--all`
  para nacional, `--anio N` por año, `--force` para re-descargar.
  Maneja 2 schemas (pre-2024: `fecha_actualizacion`; 2024+:
  `fecha_hora_actualizacion`). Headers con leading-space trimmed.
- `m1-summary` (`scripts/m1-summary.ts`): resumen CLI de cobertura DB.

**Investigaciones:**
- M1.1: dataset 2 versión 4747 ("Compras 2005-Mayo 2018") es
  **licitaciones**, no contratos. Ya cargado en `licitaciones_llamado`
  (2,341 filas). No hay contratos pre-2019 harvestables vía API. Para
  cubrir 2010-2018 contratos hay que ir a Boletín Oficial (M2 OCR).
- M1.5 DDJJ Córdoba (cat 85+105): formato 'web' en vez de XLSX/CSV →
  cada recurso linkea PDF. Catalogado pendiente_ocr (M2).
- M1.6 aportantes CNE: aportantes.electoral.gob.ar bloquea requests
  automatizados con WAF. No hay alternativa estructurada en datos.gob.ar.
  Catalogado pendiente (M2 con Playwright + headers browser-like).
- M1.7 dataset 187 Cuenta General: 11/12 versiones PDF (M2 OCR), v6461
  XLS único es resumen ahorro-inversión-financiamiento que no encaja
  en `presupuesto_ejecucion`. Catalogado pendiente.

**Bug residual identificado (fuera de M1):** parser
`seed-cordoba-presupuesto.ts` llega al header correcto pero las
expresiones regulares de columnas no extraen montos de los XLS reales
de Córdoba (`P.Pr.`, `DENOMINACION`, `DEFINITIVO`, `COMPROMISO`).
Tras patch parcial de regexes (`devengado` → `deveng`, agregar
`definitivo`) sigue 0 inserts. `presupuesto_ejecucion` sigue vacío.
Requiere sprint dedicado.

**Stack OCR base instalado** (commit anterior, no usado todavía):
unpdf, tesseract.js, pdf-to-png-converter, cheerio, p-queue, compromise.

Tests: 222 verde, sin regresiones.

Estado: M1 60% completado (4 milestones de 8 ejecutados con datos
reales, 3 catalogados como pendientes a M2, 1 verificado como N/A).
Próximo: M2 — pipeline OCR Boletín Municipal/Provincial.

NO BORRAR//INSTRUCCIONES
# Argentina Transparente — Instrucciones fijas

## 1. Objetivo del sistema
Construir una plataforma de análisis de gasto público y generación de expedientes ciudadanos que sea:
- escalable a nivel nacional,
- modular por jurisdicción y dominio,
- auditable,
- reproducible,
- y apta para uso institucional serio.

## 2. Principios obligatorios
- Cero alucinaciones.
- No inventar datos, fuentes, números ni conclusiones.
- Toda salida importante debe ser verificable.
- Toda señal o hallazgo debe poder reconstruirse desde la fuente original.
- Todo cambio relevante debe conservar trazabilidad.
- La simplicidad correcta vence a la complejidad innecesaria.
- No priorizar velocidad si compromete confiabilidad.

## 3. Diseño arquitectónico
- Mantener separación clara entre:
  - ingestión,
  - normalización,
  - modelo de dominio,
  - motor de señales,
  - evaluación,
  - generación de expedientes,
  - API,
  - frontend,
  - observabilidad,
  - y pruebas.
- Evitar acoplamiento entre scraping, lógica de negocio y narrativa.
- Preferir monolito modular bien diseñado antes que microservicios prematuros.
- Toda frontera entre módulos debe ser explícita.

## 4. Reglas para datos
- Toda fuente debe registrarse con:
  - origen,
  - fecha de obtención,
  - método de extracción,
  - formato,
  - y nivel de confianza.
- Ningún reporte puede depender de datos no trazables.
- Las transformaciones deben ser reproducibles.
- Si un dato no puede verificarse, debe marcarse como incierto o descartarse.

## 5. Reglas para hallazgos
- Un hallazgo no se publica si no tiene evidencia suficiente.
- Todo hallazgo debe indicar:
  - fuente,
  - monto,
  - proveedor,
  - periodo,
  - jurisdicción,
  - y método de detección.
- Las señales automáticas deben distinguirse de conclusiones finales.
- El sistema debe separar “señal detectada” de “interpretación investigativa”.

## 6. Reglas para Claude
- Antes de cambiar código, auditar el contexto.
- Si falta control, pedirlo.
- Si conviene pasar a terminal, pedirlo.
- Si conviene usar pruebas o inspección manual, pedirlo.
- Si existe una mejor estrategia de trabajo, proponerla.
- No continuar sobre supuestos sin validación.
- No ignorar decisiones arquitectónicas ya tomadas.
- No hacer refactors grandes sin justificación.

## 7. Criterios de calidad
Antes de considerar una tarea completa:
- debe compilar o pasar checks relevantes,
- debe tener tests cuando aplique,
- debe conservar trazabilidad,
- debe tener comportamiento reproducible,
- y no debe introducir deuda técnica evitable.

## 8. Escala esperada
Este sistema debe diseñarse desde ahora para crecer:
- de una ciudad,
- a múltiples municipios,
- a una provincia,
- y eventualmente a nivel nacional.

Toda decisión técnica debe evaluarse contra esa trayectoria.
