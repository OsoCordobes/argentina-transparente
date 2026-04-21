# Epic: Fase 4 — Investigation Board UI

**Status:** open
**Priority:** P3 (depends on Fase 2 signals + Fase 3 AI)

## Context

The investigation board is the primary UX of ARGOS v3. It replaces the legacy `frontend/` landing page
with a Maltego-style persistent workspace for journalists to build corruption cases.

Stack: React 18 + Vite + TypeScript + Tailwind + shadcn/ui (already in `apps/board/src/components/ui/`) + React Flow + Zustand.

## Layout

```
┌───────────┬──────────────────────────┬────────────────┐
│  Entity   │                          │   AI Co-inv    │
│  Search   │   Graph Canvas           │   Chat         │
│  Drawer   │   (React Flow)           │   Panel        │
│           │                          │                │
│  ─────    │   + Timeline toggle      │   ─────        │
│  Case     │   + Layout controls      │   Evidence     │
│  List     │                          │   Vault        │
└───────────┴──────────────────────────┴────────────────┘
                       │
                       ▼
             Node Inspector (side panel on click)
```

## Tasks

### Task 1: App shell + routing
**Files:** `apps/board/src/main.tsx`, `apps/board/src/App.tsx`, `apps/board/src/router.tsx`

React Router 6 with routes:
- `/` → redirect to `/case/default`
- `/case/:caseId` → main board

Zustand store skeleton: `apps/board/src/store/case.ts`
- State: `{ cases, activeCaseId, nodes, edges, notes, evidenceVault }`
- Persisted to localStorage (simple) via zustand/middleware/persist

### Task 2: Entity Search Drawer
**File:** `apps/board/src/components/EntitySearchDrawer.tsx`

Left sidebar:
- Debounced text input → `GET /api/entidad/search?q=`
- Results grouped by type (Empresa, Persona, Contrato)
- Drag to canvas OR click "Add to board" button
- Type filter chips

### Task 3: Graph Canvas
**File:** `apps/board/src/components/GraphCanvas.tsx`

React Flow (`@xyflow/react`) canvas:
- Custom node types: `EmpresaNode`, `PersonaNode`, `ContratoNode`, `OrganismoNode`
- Each node shows: nombre, tipo, top 2 signals (colored badge), score
- Nodes draggable, zoomable, pannable
- On drop from search drawer: add node with entity data
- Mini-map toggle
- Auto-layout button (dagre or elk)

### Task 4: Edge Editor
**File:** `apps/board/src/components/EdgeEditor.tsx`

Manual hypothesis edges:
- Click connection handle on a node to start drawing edge
- On edge drop: modal to enter hypothesis text + relationship type
- Edge types: `POSIBLE_RELACION`, `FAMILIA`, `SOCIO_COMERCIAL`, `MISMO_DIRECTOR`, `DONANTE`
- Edge color by type

### Task 5: Node Inspector
**File:** `apps/board/src/components/NodeInspector.tsx`

Right panel (or slide-over) when node is selected:
- Full entity profile (from `/api/entidad/:id`)
- Signal list with severity badges
- Action buttons: "Expandir directores", "Ver contratos", "Ver donaciones"
- These actions add new connected nodes to the canvas
- "Agregar nota" textarea persisted in Zustand

### Task 6: AI Chat Panel
**File:** `apps/board/src/components/AIChatPanel.tsx`

Right sidebar:
- Chat messages (user + assistant)
- Stream from `POST /api/ai/query` with SSE
- Context: auto-includes current case nodes list in request
- Markdown rendering for responses
- Citation links clickable (open in new tab)
- Proactive suggestion mode: on first load, AI analyzes pinned entities

### Task 7: Timeline Toggle
**File:** `apps/board/src/components/Timeline.tsx`

Bottom toggle panel:
- Shows chronological events for all pinned entities
- Events: contratos (fecha), cargos (desde/hasta), donaciones (fecha), causas (fecha_inicio)
- Brush selector to filter canvas by time range
- Color coded by entity type

### Task 8: Evidence Vault
**File:** `apps/board/src/components/EvidenceVault.tsx`

Collapsible sidebar / modal:
- Every time AI generates a citation, it's automatically added
- User can manually add citations (URL + description)
- Shows: source_url, fetched_at, sha256 (truncated), archive_path
- Export all citations as JSON

### Task 9: Case list / switcher
**File:** `apps/board/src/components/CaseList.tsx`

Left bottom:
- List of saved cases (name, entity count, last modified)
- "New case" button
- "Delete case" with confirmation
- Case rename inline

### Task 10: Playwright E2E tests
**File:** `apps/board/e2e/board.spec.ts`

Full flow:
1. Open board
2. Search "EMPRESA" → results appear
3. Click "Add to board" → node appears on canvas
4. Click node → inspector panel opens with entity data
5. Type in AI chat → response streams
6. Evidence vault has a citation
7. Reload → state persists

## Acceptance Criteria

- [ ] All 9 UI components implemented and render without errors
- [ ] Drag + drop from search to canvas works
- [ ] AI chat streams responses with visible citations
- [ ] State persists across page reloads
- [ ] Playwright E2E test passes

## Dependencies

- `apps/api` endpoints: `/api/entidad/search`, `/api/entidad/:id`, `/api/ai/query`
- `@argos/model` for TypeScript types
