# Handoff — ARGOS modo Explorar (sesión 2026-04-25)

> Para el próximo agente que tome el trabajo. Leer **completo** antes de tocar código.

## TL;DR

- **2 PRs abiertos en draft, CI verde, listos para review**:
  - PR #4 (`claude/chat-first-ui-design-aWg0V`): UI inicial de `/explorar` con grafo d3-force
  - PR #6 (`claude/chat-llm-backend`): endpoint `POST /api/chat` con tool use anti-alucinación (depende de #4)
- **Próxima tarea encargada**: reemplazar la UI de `/explorar` por la que está en `ARGOS v2.0.zip` (diseño nuevo de Claude Design, mucho más pulido)
- **Bug pre-existente que bloquea smoke E2E**: BigInt serialization en `/api/dashboard` (no relacionado a esta sesión)

---

## Estado del repositorio

### Ramas relevantes

| Rama | HEAD | Contiene |
|---|---|---|
| `main` | viejo | App pre-Sprint, NO usar |
| `claude/anticorruption-tool-frontend-f0dYN` | `813cac7` | App moderna Sprint 0-8 (sin Explorar). Backend con extras (boletín, licitaciones). Otro agente la sigue tocando |
| `claude/chat-first-ui-design-aWg0V` (**PR #4**) | `b8fd2db` | App moderna + `/explorar` v1 |
| `claude/chat-llm-backend` (**PR #6**) | `ff72dd6` | Lo de #4 + `POST /api/chat` con LLM |
| `design/argos-v2-import` | — | Solo contiene `ARGOS v2.0.zip` para que el agente lo pueda extraer |
| `claude/frontend-redesign` | igual a anticorruption | Rama de trabajo previa, ignorar |

### Estado local del usuario (NO está en git)

El usuario tiene su `C:\Users\amiun\desktop\argentina-transparente` local restructurado en monorepo pnpm (`apps/`, `packages/`, `pnpm-workspace.yaml`) por otro agente. **Esos cambios NO están pusheados** y son lo que el usuario llamó "frontend horrible". No tocar — son su working dir local. Las ramas remotas siguen el layout clásico (`backend/`, `frontend/`).

---

## Qué hace PR #4 (Explorar v1)

Branch: `claude/chat-first-ui-design-aWg0V` · CI 3/3 ✓ · `mergeable_state: clean`

Nueva página `/explorar` (lazy route en `App.tsx`, nav item Telescope en `AppShell.tsx`). NO modifica ninguna página existente.

**Archivos creados:**
```
frontend/src/styles/argos.css                       (~700 líneas, scoped a .argos-explorar)
frontend/src/lib/argos/types.ts                     ArgosNode, ArgosEdge, ChatMessage, NodeDetail, KPI…
frontend/src/lib/argos/graphFromData.ts             DashboardResponse → ArgosGraph (sin fetch extra)
frontend/src/lib/argos/chatResolver.ts              Intent detection local (5 categorías) — fallback sin LLM
frontend/src/components/argos/GraphCanvas.tsx       d3-force + animación imperativa (refs, no useState)
frontend/src/components/argos/NodeDetailPanel.tsx   KPIs, señales, relaciones, fuentes
frontend/src/components/argos/ChatThread.tsx        Memoized split CompletedTurns/CurrentTurn
frontend/src/components/argos/ExplorarLayout.tsx    Sidebar adaptativa + canvas + panel
frontend/src/pages/Explorar.tsx                     Página lazy
frontend/PENDIENTES-BACKEND.md                      (versión "pendiente", la "implementada" está en #6)
```

**Decisiones técnicas a preservar:**
- d3-force en `manualChunks` separado (5.91 kB gzip, lazy con `/explorar`)
- Animación 100% imperativa con refs (cero useState en RAF) → previno freeze de heap a 4.2GB en el prototipo
- rAF coalescing de chunks de stream (max 60Hz)
- `React.memo` + split CompletedTurn/CurrentTurn → solo el último turno re-renderiza durante streaming
- CSS scoped bajo `.argos-explorar` para no contaminar el shadcn/ui del resto de la app
- Real data via `useDashboard()` de `lib/queries.ts` — NO mockear

**Bundle metrics:**
| Chunk | Tamaño (gzip) |
|---|---|
| `Explorar` (lazy) | 10.02 kB |
| `d3-force` (lazy) | 5.91 kB |
| Carga inicial | sin cambio (~112 kB) |

---

## Qué hace PR #6 (LLM backend)

Branch: `claude/chat-llm-backend` · CI 3/3 ✓ · `mergeable_state: clean` · **Depende de PR #4**

Endpoint **`POST /api/chat`** SSE streaming que reemplaza el resolver local del chat de `/explorar` por Claude Sonnet 4.5 con **tool use anti-alucinación**.

**Anti-alucinación por diseño**: el LLM NO recibe los datos del grafo en el prompt. Pide on-demand vía 5 tools que consultan DuckDB en vivo. Si una tool devuelve `{encontrado: false}`, el system prompt fuerza al modelo a responder "no tengo ese dato" en lugar de inventar.

**Tools:**
| Tool | Devuelve |
|---|---|
| `get_dashboard` | Totales + top 15 entidades + señales graves |
| `search_entidad(query)` | Búsqueda parcial por nombre (max 30) |
| `get_entidad(nombre)` | Detalle completo: montos, timeline, AFIP, señales |
| `get_señales_municipio(municipio)` | Todas las señales de una jurisdicción |
| `get_señales_graves(limit)` | Top N señales graves globales |

**Archivos:**
```
backend/src/routes/chat.ts                  Endpoint SSE + 5 tools + rate limit (10 req/min/IP)
backend/src/index.ts                        Registra el router
frontend/src/lib/argos/chatStream.ts        Cliente SSE con parser línea por línea
frontend/src/components/argos/ExplorarLayout.tsx  Si VITE_CHAT_LLM=true intenta backend, si falla cae al resolver local
frontend/PENDIENTES-BACKEND.md              Versión "implementada"
```

**Activación:**
```bash
# backend/.env
ANTHROPIC_API_KEY=sk-ant-...

# frontend/.env
VITE_CHAT_LLM=true
```

Sin esas variables → `503` → frontend cae al resolver local automáticamente. No rompe nada.

**Modelo usado**: `claude-sonnet-4-5` (estaba ese en el código). El proyecto usa Sonnet 4.6 según CLAUDE.md, considerar actualizar.

---

## Próxima tarea: implementar el design del zip

**Ubicación del zip**: `design/argos-v2-import` branch tiene `ARGOS v2.0.zip` en root. Para acceder:

```bash
git fetch origin design/argos-v2-import
git checkout origin/design/argos-v2-import -- "ARGOS v2.0.zip"
mkdir -p /tmp/argos-design && cd /tmp/argos-design
unzip -o "/home/user/argentina-transparente/ARGOS v2.0.zip"
```

**Contenido del zip:**
```
argos.html              entry HTML (CSS embebido, ~900 líneas)
argos/icons.jsx         lucide-style icons (mapear a lucide-react: Home, Network, FileText, Alert→AlertTriangle, etc.)
argos/mockData.jsx      mock data (IGNORAR — usar useDashboard real)
argos/api.jsx           data layer mock (IGNORAR — usar lib/queries.ts)
argos/graph.jsx         GraphCanvas (~466 líneas)
argos/panel.jsx         NodeDetailPanel (~268 líneas)
argos/chat.jsx          ChatThread con entity chips (~160 líneas)
argos/app.jsx           Reducer + layout principal (~684 líneas)
```

### Diferencias clave vs PR #4 actual

El design v2.0 es **mucho más pulido** que lo de PR #4. Lo que cambia:

1. **Hero state** (cuando no hay chat): título grande centrado "¿Qué querés investigar hoy?" + chips rotativos + input centrado
2. **Footer state** (cuando empieza chat): input slidea al footer (60% width), thread aparece dentro del sidebar
3. **Send pulse animation** — estela visual del input al primer envío
4. **Sidebar evolves**: nav items horizontales como icon strip cuando el chat empieza, se agrega chat thread embebido
5. **Hero node detection** — la jurisdicción con más señales graves pulsa para llamar atención al inicio
6. **Idle/awake graph state** — grafo arranca con blur+desaturate, awakens en 500ms hover sostenido o focus de input
7. **Pulse RAF** a 15Hz para halos (no 60Hz por nodo)
8. **Smooth pan/zoom** con lerp target/current refs (transición suave al focus)
9. **Labels mode toggle** (minimal/all) + depth selector (1°/2°/3° vecinos)
10. **Section nav**: Inicio · Mapa · Expedientes · Señales · Fuentes · Acerca de (solo Inicio + Mapa muestran grafo, resto son placeholders "Próximamente")
11. **Reducer-based state** en vez de useState múltiples
12. **Entity chips en chat** con sintaxis `[[node:id]]` resueltos a chips clickeables coloreados por tipo
13. **NodeDetailPanel** rediseñado: type chip + badges + KPI grid con sparklines + filtros de relaciones + signal cards expandibles + accordion de fuentes
14. **Header** con crumb breadcrumb + labels toggle + "Datos al [fecha]" pill
15. **Brand mark**: ARGOS hex+eye SVG (en `app.jsx::ArgosMark`)

### Plan de implementación sugerido

Trabajar **sobre el branch de PR #4** (`claude/chat-first-ui-design-aWg0V`) — los archivos ya están ubicados:

1. **`frontend/src/styles/argos.css`** — reemplazar entero por el `<style>` de `argos.html` (líneas 10-903)
2. **`frontend/src/lib/argos/types.ts`** — agregar tipos para reducer state, sections, labels mode
3. **`frontend/src/components/argos/icons.tsx`** (nuevo) — mapear `Ico` a lucide-react o copiar SVGs inline
4. **`frontend/src/components/argos/Sidebar.tsx`** (nuevo) — brand + nav + chat thread embebido
5. **`frontend/src/components/argos/Header.tsx`** (nuevo) — crumb + labels toggle
6. **`frontend/src/components/argos/GraphCanvas.tsx`** — reescribir con hero detection + idle/awake + pulse RAF + lerp pan
7. **`frontend/src/components/argos/NodeDetailPanel.tsx`** — reescribir con type chips + KPI grid + relation filters + signal cards
8. **`frontend/src/components/argos/ChatThread.tsx`** — agregar `renderBody` con `[[node:id]]` parser → entity chips
9. **`frontend/src/components/argos/ExplorarLayout.tsx`** — convertir a useReducer, hero/footer choreography, send pulse, section routing
10. **`frontend/src/lib/argos/chatResolver.ts`** — emitir `[[node:id]]` markers en respuestas
11. **`frontend/src/lib/argos/graphFromData.ts`** — ajustar weights y tipos según el nuevo `nodeBaseRadius` (jurisdiccion 14+w*16, proveedor 6+w*14, señal 7+w*8, director 5+w*6)
12. **`frontend/src/pages/Explorar.tsx`** — sin cambios (solo carga useDashboard y pasa el grafo)

**No tocar** (ya andan):
- `lib/argos/chatStream.ts` (cliente SSE)
- `App.tsx` (ruta lazy ya registrada)
- `AppShell.tsx` (nav item ya agregado)
- `vite.config.ts` (chunk d3-force ya configurado)
- `backend/src/routes/chat.ts` (endpoint LLM ya andando)

---

## Bugs pre-existentes que aparecieron durante smoke

### 🔴 BigInt serialization en `/api/dashboard`

`GET /api/dashboard` rompe con `TypeError: Do not know how to serialize a BigInt`.

**Causa**: DuckDB devuelve `COUNT(*)` como BigInt nativo, y `getContratosCount()` / `getSeñalesCacheCount()` lo tipan como `number` (mentira) sin castear. `JSON.stringify` se cae.

**Fix de 1 línea en 3 lugares** (`backend/src/lib/db.ts`):
```ts
// getContratosCount, getSeñalesCacheCount, etc:
return Number(rows[0]?.cnt ?? 0)  // ← agregar Number()
```

También revisar `getDashboardMunicipios()` y `getTopEntidades()` para counts/sums.

**Sin este fix `/explorar` no funciona en local** (carga indefinida porque `useDashboard()` recibe `ok: false`). En producción puede manifestarse según versión de duckdb-node.

NO lo arreglé yo porque no es scope de esta sesión y queda mejor en su propio commit/PR. Si vas a tocar PR #4 igualmente, dejalo en el mismo commit.

---

## Lo que dejé sin hacer

- **Smoke E2E manual** — bloqueado por el BigInt bug
- **Mergeo de PRs** — los 2 están draft. Cuando estés listo: PR #4 primero (sacar de draft → squash merge), después PR #6 sobre `main` actualizado (rebase si hay conflictos)
- **Setear `ANTHROPIC_API_KEY` en Railway backend** y `VITE_CHAT_LLM=true` en Railway frontend → tarea del usuario
- **Rate limit Redis** del endpoint LLM — ahora es in-memory, no sobrevive restart. Para prod cambiar a Redis o `express-rate-limit`
- **Modelo Sonnet** — el código usa `claude-sonnet-4-5`, considerar actualizar a `claude-sonnet-4-6` (latest según CLAUDE.md)
- **Borrar branch `design/argos-v2-import`** después de extraer el zip — su único propósito era transferir el archivo

---

## Comandos útiles

```bash
# Ver los 2 PRs
gh pr view 4 --repo OsoCordobes/argentina-transparente
gh pr view 6 --repo OsoCordobes/argentina-transparente

# Tipos + tests
cd backend && npx tsc --noEmit && npm run test
cd frontend && npx tsc --noEmit && npm run build

# Levantar dev (asumiendo db con datos seeded)
cd backend && npm run dev   # :3001
cd frontend && npm run dev  # :8080
```

---

## Contacto con la sesión previa

Session ID: `01F7R1cUTjXBGnsKitfesHVQ` (ver footer de cada commit). Si necesitás contexto de decisiones técnicas, revisá ese transcript.
