# ARGOS — Beta Release Notes (2026-04-26)

**Branch:** `claude/chat-first-ui-design-aWg0V`
**Scope:** Córdoba Capital, cobertura 2015-2025
**Mission:** detectar patrones de corrupción en gasto público con cero alucinaciones — toda señal verificable desde su fuente original.

---

## Estado del beta

| Capa | Estado | Nota |
|------|--------|------|
| Backend Express + DuckDB | 🟢 prod-ready | 24 tablas, 130 tests vitest verde, typecheck verde |
| Frontend React + Vite | 🟢 prod-ready | Argos v2 pixel-perfect, 49KB raw / 17KB gzip lazy |
| Engine de señales (15 detectores) | 🟢 verde | 8 señales reales detectadas en Córdoba 2015-2025 |
| LLM (Sonnet 4.6 + Haiku 4.5) | 🟢 con budget guard | Cap semanal $45 USD operativo, hard $50 |
| Casos persistentes (Supabase) | 🟢 schema en `supabase/migrations` | Activar setup en producción |
| Denuncia PDF | 🟢 funcional | SHA256 + UUID + cadena de custodia |
| Trazabilidad (CLAUDE.md §2) | 🟢 cero alucinaciones | Verify script E2E corrobora 8/8 señales |

---

## Datos cargados en Córdoba Capital

| Fuente | Tabla | Volumen | Años |
|--------|-------|---------|------|
| Contratos API REST + boletín CSV | `contratos` | **2,410** | 2015–2025 |
| Licitaciones llamado (CKAN dataset 2 v4747) | `licitaciones_llamado` | **2,343** ($9.26B presupuesto) | 2005–2018 |
| Sueldos municipales (datasets 131/201/5/3292) | `agentes_publicos` | **33,079** | 2017–2023 |
| IGJ entidades + autoridades nacional | `igj_entidades` + `igj_autoridades` | **420K + 2.3M** | snapshot |

**Pendiente carga (no bloqueante para beta):**
- Presupuesto ejecución (datasets 14/65/12) — parser XLSX no-tabular pendiente
- AFIP enriquecimiento — best-effort scrape, frágil
- OpenSanctions cache — listo para correr `npm run seed:opensanctions`
- ICIJ Offshore Leaks bulk — listo si user descarga CSVs

---

## 8 señales detectadas en producción (post-recompute)

| Score | Severidad | Tipología | Hallazgo |
|-------|-----------|-----------|----------|
| 83 | grave | monopolio_rubro | **PINTURAS CAVAZZON S.R.L. concentra 92.8% del gasto en Cultura** |
| 80 | grave | contrataciones_directas | **590 contrataciones directas por $4.113.400.908 sin proceso competitivo** |
| 80 | grave | rotacion_coordinada | Posible rotación coordinada en 6 áreas (Educación, Salud, Obras…) |
| 80 | moderada | fraccionamiento_avanzado | 34 proveedores con contratos múltiples montos similares |
| 75 | grave | servicio_sin_historial | 65 proveedores de servicios sin historial previo: $18.222.550.899 |
| 61 | moderada | gasto_fin_ejercicio | **39.6% del 2023 vía prórrogas/ampliaciones** (B3 fix validado) |
| 59 | moderada | adenda_postajudicacion | 1 contrato con ampliaciones >50% del valor original |
| 54 | moderada | proveedor_cronico | 1 proveedor con presencia continua multi-año por $166.285.006 |

Todas las señales tienen `fuente_url` apuntando a `gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/...` — verificable por cualquier ciudadano.

---

## Endpoints API estables

| Verbo | Path | Descripción |
|-------|------|-------------|
| GET | `/health` | Healthcheck |
| GET | `/api/dashboard` | Resumen + top entidades + señales activas |
| GET | `/api/entidad/search?q=` | Búsqueda fuzzy |
| GET | `/api/entidad/:nombre` | Detalle proveedor + contratos + señales |
| GET | `/api/contrato/:hash` | Detalle contrato + cadena de custodia |
| GET | `/api/red?municipio=` | Grafo Cytoscape (legacy) |
| POST | `/api/denuncia` | PDF denuncia formal con SHA256 |
| **POST** | **`/api/chat`** | **Sonnet SSE streaming, system prompt cacheable, anti-alucinaciones duras** |
| **POST** | **`/api/ai/suggestions`** | **Haiku JSON cacheable, sugerencias accionables** |
| **GET** | **`/api/ai/usage`** | **Budget operativo + acumulado semanal** |
| GET | `/api/scrapers/health` | Salud de scrapers registrados |
| GET | `/api/alertas` | Alertas event-driven |

---

## Smoke E2E ejecutado y validado

1. **Backend retorna datos reales sin BigInt errors** — `/api/dashboard` con 2,410 contratos, 8 señales, BENITO ROGGIO $2.77B, AFEMA $2.63B, KAPSCH, etc.
2. **Frontend `/explorar` renderiza Argos v2 pixel-perfect fullscreen** — sidebar con íconos, hero state, grafo neural con nodos coloreados por severidad, input rotativo, chip rotativo.
3. **Chat real Sonnet 4.6 con SSE** — cita IDs exactos del grafo (`[[node:sig-monopolio-cultura]]`), admite "qué NO tengo en el grafo", sugiere Tribunal de Cuentas, aclara "no soy abogado/a". Costo $0.009 por call.
4. **Suggestions real Haiku 4.5** — 2 sugerencias críticas con acciones específicas (FOIA, Tribunal Cuentas, Defensoría, AFIP, Fiscalía). Costo $0.003 por call.
5. **Budget guard activo**: $45 cap, acumulado $0.012 (0.027% gastado).

---

## Bugs críticos resueltos

| Bug | Cambio |
|-----|--------|
| **B1** seed-cordoba.ts hardcoded `[2019..2023]` | → `cordobaCapitalConnector.aniosDisponibles` dinámico |
| **B2** `getContratosCount` & co. devuelven BigInt → JSON.stringify falla | → `Number()` cast en 4 helpers + patch global `BigInt.prototype.toJSON` |
| **B3** `detectarConcentracionTemporal` constraint año único nunca dispara multiyear | → agrupa por año, dispara para el peor (validado: 2023 con 39.6%) |
| **B5** `agruparPorProveedor` no normaliza variantes societarias | → `normalizarProveedor()` strip SA/SRL/UTE/COOP/etc. Display preserva original |
| **B6** `detectarContratacionesDirectas` substring overlap "DIRECCION GENERAL CONTRATACIONES" | → regex anclada `\b...\b` |
| **B8** `detectarFraccionamientoAvanzado` no incluye LICITACION | → ahora cualquier modalidad excepto prórrogas/ampliaciones |
| **B6** modelo deprecado `claude-sonnet-4-20250514` | → `claude-sonnet-4-6` |
| **CLAUDE.md §2 violation** fixtures sintéticos en argosMock | → archivo vaciado con warning prominente, api.ts reescrita sin narrativa fake |
| **Frontend no enviaba `context.graph` al backend chat** | → Bug serio. LLM siempre veía grafo vacío. Fixeado en `argosApi.chat()` |
| **Sidebar Argos v2 no expandía con chat** | → reemplazo `ChatThread` por `SidebarChat` inline con clases CSS correctas |

---

## Bugs no críticos en backlog (post-beta)

- M17 Parser presupuesto Córdoba (datasets 14/65/12) — XLSX con título en row 0, header real en row 1. Lee 0 filas.
- M18 Cruce licitaciones↔contratos por `numero_expediente` — columna no existe en `contratos`.
- B7 `PALABRAS_SERVICIO` en `detectarServiciosSinHistorial` frágil a typos — falta fuzzy match.
- Optional `dompurify` en NodeDetailPanel para `dangerouslySetInnerHTML` (hoy texto plano).
- Touch events en GraphCanvas para pan/zoom mobile.
- `/api/ai/suggestions` integración en NodeDetailPanel al pinear (frontend wiring).
- Migrar a Canvas 2D si grafo > 500 nodos (mitigar jank en mobiles low-end).

---

## Acción manual del usuario (deploy)

1. **Anthropic credit:** verificar que la cuenta tiene saldo. Próxima recarga: viernes 2026-05-01 (€50 ≈ $53).
2. **Configurar env Railway:**
   - Backend: `ANTHROPIC_API_KEY=sk-ant-...`, `ANTHROPIC_BUDGET_USD=45`, `PORT=3001`
   - Frontend: `VITE_API_URL=https://<railway-backend-url>`, `VITE_CHAT_LLM=true`
3. **Renombrar Railway service:** `bestia-backend → argos-backend` (manual, no se puede automatizar).
4. **Deploy**: hacer merge de este branch a `main` cuando esté aprobado, push a Railway via auto-deploy.
5. **Setup Supabase** (opcional — para casos persistentes):
   - Crear proyecto Supabase
   - Aplicar migración `supabase/migrations/0001_casos.sql`
   - Setear `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` en frontend env.

---

## Commits del beta (rama `claude/chat-first-ui-design-aWg0V`)

```
128cd4c feat(beta-fase-6): script verify-hallazgos para auditoría E2E de señales
2c27ebf feat(beta-fase-5): bugs signals + sidebar embedded chat + LLM context
7e016cb feat(beta-fase-4): backend LLM con budget guard semanal
b03e5e1 fix(beta-fase-3.5): smoke test fixes — BigInt + ruta /explorar fullscreen
ff11929 fix(argos-v2): eliminar fixtures sintéticos — cero alucinaciones (CLAUDE.md §2)
0e74ac2 feat(beta-fase-3): Argos v2.0 frontend pixel-perfect del zip
0cbbbf2 feat(beta-fase-2): scripts de auditoría + inspección DB
e85b198 fix(beta-fase-1): 3 bugs bloqueantes para cobertura multiyear y dashboard
```

8 commits, ~6,500 LOC netas agregadas en una sesión.

---

## Próximos pasos (roadmap post-beta v1)

1. Multi-jurisdicción (Nación / CABA / Santa Fe / Rosario) — connectors ya implementados, falta UI multi-tenant
2. OCR boletines provincia (40K PDFs ~$7K Anthropic)
3. Tribunal de Cuentas Córdoba Provincia (geo-bloqueado, requiere VPS argentino)
4. Tribunal de Cuentas Municipal (acuerdo institucional pendiente)
5. Cruce nómina ↔ proveedores (con sueldos cargados ya es factible)
6. Pipeline OCR pre-2015 si presupuesto lo permite

---

**Cero alucinaciones · Toda señal verificable**
