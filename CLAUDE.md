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

## Señales Implementadas (14 total)

Detectores en `backend/src/engine/signals.ts`. Tests cubren 89 casos.

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

Cada `Señal` lleva opcionalmente `cuits?: string[]` (poblado por `analyze.ts`)
para asociación señal↔entidad sin string matching frágil. Esa columna se
escribe a `señales_cache.entidades_cuit` (JSON).

---

## Fuentes de Datos Verificadas

| Fuente | URL | Años | Formato |
|--------|-----|------|---------|
| Córdoba Capital | gobiernoabierto.cordoba.gob.ar/.../compras-y-contrataciones/2 | 2019–2023 | XLSX via API REST |

Dataset IDs: 2019→`2`, 2020→`5977`, 2021→`5978`, 2022→`6466`, 2023→`6467`

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
| `npm run test:connector` | backend/ | Descarga y parsea 2023 |
| `npm run test:signals 2022 2023` | backend/ | 2 años, señales detectadas |
| `npm run test:signals 2019 2023` | backend/ | 5 años — 1390 contratos, 5 señales |
| `npm run test:e2e` | backend/ | E2E contra localhost:3001 |
| `npx ts-node src/test-production.ts` | backend/ | E2E contra Railway producción |

---

## Roadmap

**Hecho en v3.0 (PR #3, Sprints 0-4):**
- ✅ Verificación AFIP best-effort
- ✅ Exportar expediente a PDF (Denuncia formal con cadena de custodia)
- ✅ Frontend SPA investigativa entity-centric
- ✅ Casos persistentes con Supabase + RLS
- ✅ Red de empresas con Cytoscape + Neo4j
- ✅ OpenSanctions integration (PEPs/sanciones/offshore)
- ✅ Connector framework con metadata trazable

**Pendiente post-MVP:**
- Connector CKAN genérico (datos.gob.ar / CABA / provincias)
- Scraper Playwright + health monitoring
- Pipeline OCR Claude Vision para boletines pre-2015
- Bulk download ICIJ Offshore Leaks → tablas locales
- Señal `aparicion_offshore` integrada al engine (cache de matches por CUIT)
- Análisis obra pública via Boletín Oficial
- Cruce nómina municipal vs proveedores
- Modo comparativo entre municipios
- Alertas automáticas cuando se publican nuevos datos
- Code splitting frontend (bundle 491KB gzip → reducir con dynamic imports)
- CI GitHub Actions (typecheck + tests + build)

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
│   ├── interface.ts            ← Registry + getConnector()
│   └── cordoba-capital/
│       ├── index.ts            ← MunicipioConnector + FuenteMetadata
│       ├── fetcher.ts          ← API REST + XLSX + timeouts
│       └── parser.ts           ← XLSX → Contrato[]
├── engine/
│   ├── signals.ts              ← 14 detectores de riesgo
│   └── signals.test.ts         ← 89 tests vitest
├── lib/
│   ├── db.ts                   ← DuckDB: contratos, señales_cache, empresas,
│   │                              directores, igj_*, reportes, fuentes_datos
│   ├── graph.ts                ← Neo4j: empresas + directores + getRedCytoscape
│   ├── claude.ts               ← generarExpediente() + prompt periodístico
│   ├── afip.ts                 ← CUIT lookup best-effort
│   ├── opensanctions.ts        ← Sprint 4: PEPs/sanciones/offshore
│   └── denuncia-pdf.tsx        ← Sprint 3: @react-pdf/renderer (jsx: react-jsx)
├── scripts/
│   ├── seed-cordoba.ts         ← Carga contratos en DuckDB
│   ├── seed-afip.ts            ← Enriquece empresas con AFIP
│   ├── seed-igj.ts             ← Carga IGJ entidades + autoridades
│   ├── seed-neo4j.ts           ← Carga grafo Neo4j desde DuckDB
│   └── analyze.ts              ← Calcula señales + extrae cuits
└── types/index.ts              ← Contrato, Señal, Expediente, FuenteMetadata,
                                   ConnectorTipo, NivelConfianza

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
