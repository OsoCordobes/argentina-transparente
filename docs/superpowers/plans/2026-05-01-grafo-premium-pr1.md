# Grafo Premium PR-1 — Foundation + GraphEngine + HomeAdapter

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar el motor del grafo de ARGOS a una arquitectura modular (engine + adapters + overlays) y migrar el home (`/`) al nuevo visual con d3-cluster radial layout, semantic-zoom viewport-aware y panel híbrido. Resto de tabs siguen con el wrapper legacy hasta sus PRs respectivos.

**Architecture:** Engine agnóstico recibe `{nodes, edges, layout, zoomState, viewport}` y renderiza. HomeAdapter fetchea `/api/grafo/jerarquia v2` (depth-structured), transforma al shape del engine, y pasa controles propios. GraphCanvas viejo queda como wrapper de back-compat para los otros tabs hasta que se migren.

**Tech Stack:** React 18 + TypeScript + Vite + d3-hierarchy + d3-force + d3-zoom + d3-interpolate + Vitest + @testing-library/react. Backend Express + DuckDB ya existente.

**Spec:** [`docs/superpowers/specs/2026-05-01-grafo-premium-design.md`](../specs/2026-05-01-grafo-premium-design.md) (commit `37482d7`).

**Out of scope** (futuros PRs):
- Adapters de Dinero/Señales/Actores (PR-2/3/4)
- Borrar GraphCanvas legacy (PR-5)
- Expandir seed `entes_estatales_cordoba` con organigrama real (workstream paralelo de seeds)
- `/api/grafo/sugerencias` (lo necesita Dinero, va en PR-2)

---

## File Structure (PR-1)

### Crear

```
frontend/vitest.config.ts                                    # config Vitest
frontend/vitest.setup.ts                                     # setup global (jsdom + jest-dom)
frontend/src/components/graph/types.ts                       # tipos canónicos del engine
frontend/src/components/graph/GraphEngine.tsx                # core renderer
frontend/src/components/graph/layouts/radial-cluster.ts      # d3.cluster polar
frontend/src/components/graph/layouts/shared.ts              # NodeAnchor, LayoutResult
frontend/src/components/graph/lod/viewport-budget.ts         # pixelBudget calculator
frontend/src/components/graph/lod/semantic-zoom.ts           # filter visible by zoom × weight
frontend/src/components/graph/motion/breathing.ts            # forceX/forceY anclas
frontend/src/components/graph/motion/entry-wave.ts           # entrada electric wave
frontend/src/components/graph/motion/click-ripple.ts         # ripple on click
frontend/src/components/graph/primitives/EntityNode.tsx      # circle + icon + label
frontend/src/components/graph/primitives/EdgePath.tsx        # 5 estilos por kind
frontend/src/components/graph/primitives/SignalOverlay.tsx   # halo pulsante
frontend/src/components/graph/primitives/NodeLabel.tsx       # sans/mono según tipo
frontend/src/components/graph/interactions/use-zoom-pan.ts   # d3.zoom hook
frontend/src/components/graph/interactions/use-hover.ts      # hover RAF-throttled
frontend/src/components/graph/interactions/use-selection.ts  # click/Esc selection
frontend/src/components/graph/overlay/GraphHoverCard.tsx     # extraído de GraphCanvas
frontend/src/components/graph/overlay/GraphSidebar.tsx       # slide-in 340px
frontend/src/components/graph/overlay/ZoomControls.tsx       # +/−/FIT
frontend/src/components/graph/background/RadialGradient.tsx  # B elegida
frontend/src/pages/graph-adapters/HomeAdapter.tsx            # adapter para /

# Tests (mismo path con .test.ts/.test.tsx)
frontend/src/components/graph/lod/viewport-budget.test.ts
frontend/src/components/graph/lod/semantic-zoom.test.ts
frontend/src/components/graph/layouts/radial-cluster.test.ts
frontend/src/components/graph/primitives/EntityNode.test.tsx
frontend/src/components/graph/primitives/EdgePath.test.tsx
frontend/src/components/graph/GraphEngine.test.tsx
frontend/src/pages/graph-adapters/HomeAdapter.test.tsx

backend/src/lib/grafo-jerarquia-v2.ts                        # nuevo nivel-structured response
backend/src/lib/grafo-jerarquia-v2.test.ts
```

### Modificar

```
frontend/package.json                                        # add vitest deps + scripts
frontend/src/components/argos/GraphCanvas.tsx                # converted to wrapper around GraphEngine
frontend/src/lib/queries.ts                                  # add useGrafoJerarquiaV2
frontend/src/pages/Explorar.tsx                              # use HomeAdapter
backend/src/routes/grafo.ts                                  # mount /api/grafo/jerarquia/v2
```

---

## Task 0: Setup Vitest + Testing Library en frontend

**Files:**
- Create: `frontend/vitest.config.ts`
- Create: `frontend/vitest.setup.ts`
- Modify: `frontend/package.json`
- Test: smoke test verifies vitest runs

- [ ] **Step 0.1: Add deps**

```bash
cd C:/Users/amiun/Desktop/argentina-transparente/frontend && npm i -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: deps installed, package-lock updated.

- [ ] **Step 0.2: Create vitest.config.ts**

```ts
// frontend/vitest.config.ts
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'path'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    globals: true,
  },
  resolve: {
    alias: { '@': path.resolve(__dirname, 'src') },
  },
})
```

- [ ] **Step 0.3: Create vitest.setup.ts**

```ts
// frontend/vitest.setup.ts
import '@testing-library/jest-dom'
```

- [ ] **Step 0.4: Add test script in package.json**

In `frontend/package.json` scripts add:
```json
"test": "vitest run",
"test:watch": "vitest",
"test:ui": "vitest --ui"
```

- [ ] **Step 0.5: Smoke test**

Create `frontend/src/__smoke__/setup.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
describe('vitest setup', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2)
  })
})
```

Run: `cd frontend && npm run test`
Expected: 1 test passes.

- [ ] **Step 0.6: Commit**

```bash
cd /c/Users/amiun/Desktop/argentina-transparente && git add frontend/package.json frontend/package-lock.json frontend/vitest.config.ts frontend/vitest.setup.ts frontend/src/__smoke__/setup.test.ts && git commit -m "chore(test): vitest + @testing-library/react setup en frontend"
```

---

## Task 1: Backend `/api/grafo/jerarquia/v2` — depth-structured response

**Files:**
- Create: `backend/src/lib/grafo-jerarquia-v2.ts`
- Create: `backend/src/lib/grafo-jerarquia-v2.test.ts`
- Modify: `backend/src/routes/grafo.ts`
- Reuses: existing `getJerarquiaCordoba()` in `backend/src/lib/grafo-jerarquia.ts`

**Context for engineer:** Hoy `/api/grafo/jerarquia` retorna `{nodes, edges}` plano con depth en `data.depth`. La v2 agrupa por depth en arrays separados para que el frontend pueda fetchear/cachear por nivel. Misma data, distinto shape.

- [ ] **Step 1.1: Write the failing test**

```ts
// backend/src/lib/grafo-jerarquia-v2.test.ts
import { describe, it, expect } from 'vitest'
import { getJerarquiaV2 } from './grafo-jerarquia-v2'

describe('getJerarquiaV2', () => {
  it('returns depth-structured response with levels 0-3', async () => {
    const result = await getJerarquiaV2({ jurisdiccion: 'cordoba-capital' })
    expect(result).toHaveProperty('depth0')
    expect(result).toHaveProperty('depth1')
    expect(result).toHaveProperty('depth2')
    expect(result).toHaveProperty('depth3')
    expect(result.depth0.nodes.length).toBeGreaterThanOrEqual(1)
    // depth0 = jurisdicción root
    expect(result.depth0.nodes[0].type).toBe('jurisdiccion')
  })

  it('includes meta with totals', async () => {
    const result = await getJerarquiaV2({ jurisdiccion: 'cordoba-capital' })
    expect(result.meta).toHaveProperty('totalNodos')
    expect(result.meta).toHaveProperty('totalAristas')
    expect(result.meta).toHaveProperty('jurisdiccion')
  })
})
```

Note: backend already uses Vitest (we saw `npm run test` from backend in earlier sessions).

- [ ] **Step 1.2: Run test to verify it fails**

Run: `cd backend && npx vitest run src/lib/grafo-jerarquia-v2.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 1.3: Implement `grafo-jerarquia-v2.ts`**

```ts
// backend/src/lib/grafo-jerarquia-v2.ts
import { getJerarquiaCordoba, type JerarquiaNode, type JerarquiaEdge } from './grafo-jerarquia'

export interface DepthLevel {
  nodes: JerarquiaNode[]
  edges: JerarquiaEdge[]  // edges WHERE source o target esta en este nivel y los previos
}

export interface JerarquiaV2Response {
  depth0: DepthLevel
  depth1: DepthLevel
  depth2: DepthLevel
  depth3: DepthLevel
  meta: {
    jurisdiccion: string
    totalNodos: number
    totalAristas: number
    montoTotal: number
  }
}

export async function getJerarquiaV2(opts: {
  jurisdiccion?: 'cordoba-capital' | 'cordoba-provincia' | 'all'
  maxReparticiones?: number
  maxEmpresasPorReparticion?: number
}): Promise<JerarquiaV2Response> {
  // Reuse existing logic
  const flat = await getJerarquiaCordoba({
    jurisdiccion: opts.jurisdiccion ?? 'cordoba-capital',
    maxReparticiones: opts.maxReparticiones ?? 12,
    maxEmpresasPorReparticion: opts.maxEmpresasPorReparticion ?? 4,
  })

  // Group nodes by depth
  const byDepth = new Map<number, JerarquiaNode[]>()
  for (const n of flat.nodes) {
    const d = (n.data.depth as number) ?? 0
    if (!byDepth.has(d)) byDepth.set(d, [])
    byDepth.get(d)!.push(n)
  }

  // Helper: nodes IDs at or below depth N
  function idsAtOrBelow(d: number): Set<string> {
    const ids = new Set<string>()
    for (let i = 0; i <= d; i++) {
      for (const n of byDepth.get(i) ?? []) ids.add(n.id)
    }
    return ids
  }

  function edgesForLevel(d: number): JerarquiaEdge[] {
    // Edges that connect a node at depth d to anything at depth ≤ d
    const idsAt = new Set((byDepth.get(d) ?? []).map(n => n.id))
    const idsBelow = idsAtOrBelow(d)
    return flat.edges.filter(e =>
      (idsAt.has(e.source) && idsBelow.has(e.target)) ||
      (idsAt.has(e.target) && idsBelow.has(e.source))
    )
  }

  return {
    depth0: { nodes: byDepth.get(0) ?? [], edges: edgesForLevel(0) },
    depth1: { nodes: byDepth.get(1) ?? [], edges: edgesForLevel(1) },
    depth2: { nodes: byDepth.get(2) ?? [], edges: edgesForLevel(2) },
    depth3: { nodes: byDepth.get(3) ?? [], edges: edgesForLevel(3) },
    meta: {
      jurisdiccion: opts.jurisdiccion ?? 'cordoba-capital',
      totalNodos: flat.nodes.length,
      totalAristas: flat.edges.length,
      montoTotal: flat.meta.montoTotal,
    },
  }
}
```

- [ ] **Step 1.4: Run test to verify it passes**

Run: `cd backend && npx vitest run src/lib/grafo-jerarquia-v2.test.ts`
Expected: PASS — both tests green.

- [ ] **Step 1.5: Mount route in `backend/src/routes/grafo.ts`**

Add to `routes/grafo.ts` after the existing `/jerarquia` handler:

```ts
import { getJerarquiaV2 } from '../lib/grafo-jerarquia-v2'

grafoRouter.get('/jerarquia/v2', async (req: Request, res: Response) => {
  const jurisdiccion = (() => {
    const v = String(req.query.jurisdiccion ?? 'cordoba-capital')
    return v === 'cordoba-capital' || v === 'cordoba-provincia' || v === 'all'
      ? v
      : 'cordoba-capital'
  })() as 'cordoba-capital' | 'cordoba-provincia' | 'all'
  try {
    const grafo = await getJerarquiaV2({ jurisdiccion })
    res.json(grafo)
  } catch (err) {
    res.status(500).json({ error: (err as Error).message })
  }
})
```

- [ ] **Step 1.6: Smoke test endpoint**

Restart backend (`cd backend && npm run dev` in background), then:

Run: `curl -s "http://localhost:3001/api/grafo/jerarquia/v2?jurisdiccion=cordoba-capital" | python -c "import sys,json; d=json.loads(sys.stdin.read()); print('depth0:',len(d['depth0']['nodes']),'depth1:',len(d['depth1']['nodes']),'depth2:',len(d['depth2']['nodes']))"`

Expected: `depth0: 1 depth1: 12 depth2: 47` (o similar — 1 estado + 12 reparticiones + ~47 empresas).

- [ ] **Step 1.7: Commit**

```bash
cd /c/Users/amiun/Desktop/argentina-transparente && git add backend/src/lib/grafo-jerarquia-v2.ts backend/src/lib/grafo-jerarquia-v2.test.ts backend/src/routes/grafo.ts && git commit -m "feat(grafo): /api/grafo/jerarquia/v2 con response depth-structured (foundation PR-1)"
```

---

## Task 2: Frontend types canónicos del Graph Engine

**Files:**
- Create: `frontend/src/components/graph/types.ts`

**Context:** Tipos compartidos por engine + adapters + primitives. Shape JS-side del response del backend + estado interno del engine.

- [ ] **Step 2.1: Create types file**

```ts
// frontend/src/components/graph/types.ts

export type EntityType = 'estado' | 'persona' | 'empresa' | 'documento'

export type EdgeKind =
  | 'pertenece_a'
  | 'contrata'
  | 'dirige'
  | 'conflicto_con'
  | 'emite'

export interface GraphNode {
  id: string
  type: EntityType
  /** label visible (Inter sans para institucional, JetBrains Mono para CUITs) */
  label: string
  /** subtitle opcional (CUIT, "X contratos", etc.) */
  subtitle?: string
  /** 0..1 — size scaling + LOD priority */
  weight: number
  /** profundidad jerárquica (0 = raíz, 1 = categoría, 2 = entidad, 3 = empresa/persona leaf) */
  depth: number
  /** datos crudos para tooltip/sidebar */
  data: Record<string, unknown>
  /** flags visuales */
  flags?: {
    /** badge ⓘ visible si nivel_confianza ≠ 'alto' */
    confianzaBaja?: boolean
    /** ej. T1 verificada, T2 inferida */
    tier?: 1 | 2 | 3
    /** halo pulsante rojo */
    senalGrave?: boolean
    /** halo pulsante naranja */
    senalModerada?: boolean
    /** count para badge SE corner */
    senalesCount?: number
  }
  /** posición en canvas (mutada por sim) */
  x?: number
  y?: number
  /** posición ancla (calculada por layout) */
  fx0?: number
  fy0?: number
}

export interface GraphEdge {
  source: string  // node id
  target: string  // node id
  kind: EdgeKind
  /** 0..1 — grosor relativo */
  weight: number
  /** monto para 'contrata', score para 'conflicto_con', etc. */
  data?: Record<string, unknown>
}

export interface GraphSnapshot {
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ZoomState {
  /** zoom level (1.0 = default) */
  k: number
  /** translate X */
  x: number
  /** translate Y */
  y: number
}

export interface ViewportSize {
  width: number
  height: number
}

export interface GraphEngineProps {
  snapshot: GraphSnapshot
  layout: 'radial-cluster' | 'vertical-tree'
  /** id del nodo seleccionado (sticky hasta Esc) */
  selectedId?: string | null
  /** id del nodo hovereado (transitorio) */
  hoveredId?: string | null
  /** ids de nodos resaltados (búsqueda, filtro, etc.) */
  highlighted?: Set<string>
  /** callbacks */
  onSelect?: (id: string | null) => void
  onHover?: (id: string | null) => void
  onZoom?: (state: ZoomState) => void
}
```

- [ ] **Step 2.2: Commit**

```bash
git add frontend/src/components/graph/types.ts && git commit -m "feat(graph): types canónicos GraphNode/GraphEdge/GraphSnapshot (PR-1)"
```

---

## Task 3: `viewport-budget.ts` — calcula cuántos nodos caben

**Files:**
- Create: `frontend/src/components/graph/lod/viewport-budget.ts`
- Create: `frontend/src/components/graph/lod/viewport-budget.test.ts`

**Context:** Mide pixeles del viewport y calcula `maxVisibleNodes` para LOD.

- [ ] **Step 3.1: Write failing test**

```ts
// frontend/src/components/graph/lod/viewport-budget.test.ts
import { describe, it, expect } from 'vitest'
import { calcViewportBudget } from './viewport-budget'

describe('calcViewportBudget', () => {
  it('returns more nodes for wider viewport', () => {
    const small = calcViewportBudget({ width: 1366, height: 768 }, 1.0)
    const wide = calcViewportBudget({ width: 3840, height: 1600 }, 1.0)
    expect(wide.maxVisibleNodes).toBeGreaterThan(small.maxVisibleNodes)
  })

  it('returns more nodes at higher zoom', () => {
    const vp = { width: 1920, height: 1080 }
    const z1 = calcViewportBudget(vp, 1.0)
    const z2 = calcViewportBudget(vp, 2.5)
    expect(z2.maxVisibleNodes).toBeGreaterThan(z1.maxVisibleNodes)
  })

  it('clamps to MAX_RENDERED constant', () => {
    const vp = { width: 8000, height: 5000 }
    const result = calcViewportBudget(vp, 5.0)
    expect(result.maxVisibleNodes).toBeLessThanOrEqual(300)
  })
})
```

- [ ] **Step 3.2: Run test (fails)**

Run: `cd frontend && npm run test src/components/graph/lod/viewport-budget.test.ts`
Expected: FAIL.

- [ ] **Step 3.3: Implement**

```ts
// frontend/src/components/graph/lod/viewport-budget.ts
import type { ViewportSize } from '../types'

/** Cap absoluto — no renderizamos más que esto, sin importar el viewport. */
export const MAX_RENDERED = 300
/** Mínimo bounding box por nodo (área aprox para que no se solapen). */
const NODE_BOUNDING_AREA = 80 * 60  // 4800 px²

export interface ViewportBudget {
  /** Cuántos nodos podemos renderizar cómodos */
  maxVisibleNodes: number
  /** Pixel area total del viewport */
  pixelArea: number
}

export function calcViewportBudget(
  viewport: ViewportSize,
  zoom: number
): ViewportBudget {
  // Area visible en world-coords (zoom amplía cantidad efectiva mostrable)
  const pixelArea = viewport.width * viewport.height * Math.max(zoom, 0.5)
  const raw = Math.floor(pixelArea / NODE_BOUNDING_AREA)
  return {
    maxVisibleNodes: Math.min(MAX_RENDERED, raw),
    pixelArea,
  }
}
```

- [ ] **Step 3.4: Run test (passes)**

Run: `cd frontend && npm run test src/components/graph/lod/viewport-budget.test.ts`
Expected: 3 tests pass.

- [ ] **Step 3.5: Commit**

```bash
git add frontend/src/components/graph/lod/viewport-budget.ts frontend/src/components/graph/lod/viewport-budget.test.ts && git commit -m "feat(graph): viewport-budget calculator (PR-1 LOD)"
```

---

## Task 4: `semantic-zoom.ts` — filtra nodos por zoom × peso

**Files:**
- Create: `frontend/src/components/graph/lod/semantic-zoom.ts`
- Create: `frontend/src/components/graph/lod/semantic-zoom.test.ts`

**Context:** Dado el budget y la lista de nodos, devuelve sólo los visibles (top-N por weight con respeto a la jerarquía: nunca dropear depth-0 o depth-1).

- [ ] **Step 4.1: Write failing test**

```ts
// frontend/src/components/graph/lod/semantic-zoom.test.ts
import { describe, it, expect } from 'vitest'
import { selectVisibleNodes } from './semantic-zoom'
import type { GraphNode } from '../types'

const mkNode = (id: string, depth: number, weight: number): GraphNode => ({
  id, type: 'empresa', label: id, weight, depth, data: {},
})

describe('selectVisibleNodes', () => {
  it('always includes depth 0 and depth 1', () => {
    const nodes = [
      mkNode('root', 0, 1.0),
      mkNode('cat1', 1, 0.9),
      mkNode('cat2', 1, 0.8),
      mkNode('leaf1', 2, 0.1),
    ]
    const visible = selectVisibleNodes(nodes, { maxVisibleNodes: 3, pixelArea: 0 })
    expect(visible.map(n => n.id)).toContain('root')
    expect(visible.map(n => n.id)).toContain('cat1')
    expect(visible.map(n => n.id)).toContain('cat2')
  })

  it('drops lowest-weight leaves first when over budget', () => {
    const nodes = [
      mkNode('root', 0, 1.0),
      mkNode('cat1', 1, 0.9),
      mkNode('high', 2, 0.8),
      mkNode('low', 2, 0.1),
    ]
    const visible = selectVisibleNodes(nodes, { maxVisibleNodes: 3, pixelArea: 0 })
    expect(visible.map(n => n.id)).toContain('high')
    expect(visible.map(n => n.id)).not.toContain('low')
  })

  it('returns all nodes when budget is generous', () => {
    const nodes = [mkNode('a', 0, 1), mkNode('b', 1, 0.5), mkNode('c', 2, 0.1)]
    const visible = selectVisibleNodes(nodes, { maxVisibleNodes: 100, pixelArea: 0 })
    expect(visible.length).toBe(3)
  })
})
```

- [ ] **Step 4.2: Run (fails)**

Run: `cd frontend && npm run test src/components/graph/lod/semantic-zoom.test.ts`
Expected: FAIL.

- [ ] **Step 4.3: Implement**

```ts
// frontend/src/components/graph/lod/semantic-zoom.ts
import type { GraphNode } from '../types'
import type { ViewportBudget } from './viewport-budget'

/**
 * Filtra `nodes` a los visibles dado el budget.
 * Reglas:
 *  - depth 0 y 1 SIEMPRE visibles (jerarquía estructural)
 *  - depth 2+ se ordenan por weight desc y se toman top-N hasta llenar budget
 */
export function selectVisibleNodes(
  nodes: GraphNode[],
  budget: ViewportBudget
): GraphNode[] {
  const structural = nodes.filter(n => n.depth <= 1)
  const leaves = nodes.filter(n => n.depth >= 2)
  const remaining = Math.max(0, budget.maxVisibleNodes - structural.length)
  const sortedLeaves = [...leaves].sort((a, b) => b.weight - a.weight)
  return [...structural, ...sortedLeaves.slice(0, remaining)]
}
```

- [ ] **Step 4.4: Run (passes)**

Run: `cd frontend && npm run test src/components/graph/lod/semantic-zoom.test.ts`
Expected: 3 tests pass.

- [ ] **Step 4.5: Commit**

```bash
git add frontend/src/components/graph/lod/ && git commit -m "feat(graph): semantic-zoom selector (PR-1 LOD)"
```

---

## Task 5: `radial-cluster.ts` — d3.cluster polar layout

**Files:**
- Create: `frontend/src/components/graph/layouts/shared.ts`
- Create: `frontend/src/components/graph/layouts/radial-cluster.ts`
- Create: `frontend/src/components/graph/layouts/radial-cluster.test.ts`

**Context:** d3.cluster() en coords polares devuelve `(x=ángulo, y=radio)` por nodo. Convertimos a cartesiano `nx = y*cos(x-π/2), ny = y*sin(x-π/2)`. Esos son los `fx0/fy0` que usa la simulación.

- [ ] **Step 5.1: Create `shared.ts`**

```ts
// frontend/src/components/graph/layouts/shared.ts
import type { GraphNode, GraphEdge } from '../types'

export interface NodeAnchor {
  id: string
  /** ancla x en world-coords */
  fx0: number
  /** ancla y en world-coords */
  fy0: number
}

export interface LayoutResult {
  anchors: Map<string, NodeAnchor>
}

export interface LayoutInput {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** centro del canvas en world-coords */
  centerX: number
  centerY: number
  /** radio máximo del layout (anillo más externo) */
  maxRadius: number
}
```

- [ ] **Step 5.2: Write failing test**

```ts
// frontend/src/components/graph/layouts/radial-cluster.test.ts
import { describe, it, expect } from 'vitest'
import { computeRadialLayout } from './radial-cluster'
import type { GraphNode, GraphEdge } from '../types'

const mkNode = (id: string, depth: number): GraphNode => ({
  id, type: 'estado', label: id, weight: 1, depth, data: {},
})

describe('computeRadialLayout', () => {
  it('places root at center', () => {
    const nodes = [mkNode('root', 0)]
    const result = computeRadialLayout({
      nodes,
      edges: [],
      centerX: 500,
      centerY: 300,
      maxRadius: 200,
    })
    const root = result.anchors.get('root')!
    expect(root.fx0).toBeCloseTo(500, 0)
    expect(root.fy0).toBeCloseTo(300, 0)
  })

  it('places children on ring around root', () => {
    const nodes = [mkNode('root', 0), mkNode('a', 1), mkNode('b', 1)]
    const edges: GraphEdge[] = [
      { source: 'a', target: 'root', kind: 'pertenece_a', weight: 1 },
      { source: 'b', target: 'root', kind: 'pertenece_a', weight: 1 },
    ]
    const result = computeRadialLayout({
      nodes,
      edges,
      centerX: 0,
      centerY: 0,
      maxRadius: 200,
    })
    const a = result.anchors.get('a')!
    const distA = Math.hypot(a.fx0, a.fy0)
    expect(distA).toBeGreaterThan(0)
    expect(distA).toBeLessThan(200)
  })

  it('orphans (no edges) get fallback radial scatter', () => {
    const nodes = [mkNode('orphan', 1)]
    const result = computeRadialLayout({
      nodes,
      edges: [],
      centerX: 0,
      centerY: 0,
      maxRadius: 200,
    })
    expect(result.anchors.has('orphan')).toBe(true)
  })
})
```

- [ ] **Step 5.3: Run (fails)**

Run: `cd frontend && npm run test src/components/graph/layouts/radial-cluster.test.ts`
Expected: FAIL.

- [ ] **Step 5.4: Implement**

```ts
// frontend/src/components/graph/layouts/radial-cluster.ts
import { hierarchy, cluster, type HierarchyNode } from 'd3-hierarchy'
import type { GraphNode, GraphEdge } from '../types'
import type { LayoutInput, LayoutResult, NodeAnchor } from './shared'

interface TreeData {
  id: string
  children?: TreeData[]
}

/**
 * Construye un árbol de TreeData desde los edges.
 * Asume que las aristas van child→parent (target = padre).
 * Si hay múltiples roots (depth 0 disjuntos), los anida bajo un virtual root.
 */
function buildTree(nodes: GraphNode[], edges: GraphEdge[]): TreeData {
  const byId = new Map<string, TreeData>()
  for (const n of nodes) byId.set(n.id, { id: n.id, children: [] })

  // child → parent (target = parent)
  const parentOf = new Map<string, string>()
  for (const e of edges) {
    parentOf.set(e.source, e.target)
  }

  // Depth 0 nodes are roots
  const roots: TreeData[] = []
  for (const n of nodes) {
    if (n.depth === 0) {
      roots.push(byId.get(n.id)!)
    } else {
      const parentId = parentOf.get(n.id)
      const parent = parentId ? byId.get(parentId) : undefined
      if (parent) {
        parent.children!.push(byId.get(n.id)!)
      } else {
        // orphan — attach to a virtual fallback root
      }
    }
  }

  if (roots.length === 1) return roots[0]
  // Multiple roots → wrap in virtual root
  return { id: '__virtual_root__', children: roots }
}

/**
 * Calcula posiciones radiales con d3.cluster (polar) y devuelve anchors cartesianos.
 * Orphans (sin edges) se distribuyen en círculo determinístico fuera del árbol.
 */
export function computeRadialLayout(input: LayoutInput): LayoutResult {
  const { nodes, edges, centerX, centerY, maxRadius } = input
  const anchors = new Map<string, NodeAnchor>()

  if (nodes.length === 0) return { anchors }

  // Single-node case (just root)
  if (nodes.length === 1) {
    anchors.set(nodes[0].id, { id: nodes[0].id, fx0: centerX, fy0: centerY })
    return { anchors }
  }

  const tree = buildTree(nodes, edges)
  const root: HierarchyNode<TreeData> = hierarchy(tree)

  // d3.cluster polar: x = ángulo (0..2π), y = profundidad normalizada
  cluster<TreeData>().size([2 * Math.PI, maxRadius])(root)

  // Orphans: nodos no incluidos en el árbol
  const inTree = new Set<string>()
  root.each(n => inTree.add((n.data as TreeData).id))

  // Caminar el árbol y convertir polar → cartesiano
  root.each(n => {
    const d = n.data as TreeData
    if (d.id === '__virtual_root__') return // skip virtual
    const angle = (n as unknown as { x: number }).x - Math.PI / 2
    const radius = (n as unknown as { y: number }).y
    const fx0 = centerX + radius * Math.cos(angle)
    const fy0 = centerY + radius * Math.sin(angle)
    anchors.set(d.id, { id: d.id, fx0, fy0 })
  })

  // Patch root al centro si no es virtual
  for (const n of nodes) {
    if (n.depth === 0 && anchors.has(n.id)) {
      anchors.set(n.id, { id: n.id, fx0: centerX, fy0: centerY })
    }
  }

  // Orphans: scatter en círculo externo determinístico (hash del id)
  const orphans = nodes.filter(n => !inTree.has(n.id))
  orphans.forEach((o, i) => {
    const angle = (i / Math.max(orphans.length, 1)) * 2 * Math.PI
    const r = maxRadius * 1.05
    anchors.set(o.id, {
      id: o.id,
      fx0: centerX + r * Math.cos(angle),
      fy0: centerY + r * Math.sin(angle),
    })
  })

  return { anchors }
}
```

- [ ] **Step 5.5: Run (passes)**

Run: `cd frontend && npm run test src/components/graph/layouts/radial-cluster.test.ts`
Expected: 3 tests pass.

- [ ] **Step 5.6: Commit**

```bash
git add frontend/src/components/graph/layouts/ && git commit -m "feat(graph): d3.cluster polar layout (PR-1 layout)"
```

---

## Task 6: `breathing.ts` — sim con anclas + oscilación

**Files:**
- Create: `frontend/src/components/graph/motion/breathing.ts`

**Context:** No es un componente React — es una factory que devuelve una `forceSimulation` ya configurada. La componente GraphEngine la usa.

- [ ] **Step 6.1: Implement**

```ts
// frontend/src/components/graph/motion/breathing.ts
import {
  forceSimulation,
  forceX,
  forceY,
  forceCollide,
  forceManyBody,
  type Simulation,
} from 'd3-force'
import type { GraphNode } from '../types'
import type { NodeAnchor } from '../layouts/shared'

interface NodeDatum extends GraphNode {
  index?: number
}

/**
 * Crea una sim que ancla cada nodo a su (fx0, fy0) con strength fuerte
 * + leve charge para "respiración" sutil (oscilación 1-2px ciclos 3-4s).
 *
 * IMPORTANTE: alphaTarget bajo (0.0015) mantiene la sim viva sin hacer
 * que los nodos viajen lejos. Si el usuario tiene prefers-reduced-motion,
 * alphaTarget = 0 y los nodos quedan estáticos en el ancla.
 */
export function createBreathingSim(
  nodes: GraphNode[],
  anchors: Map<string, NodeAnchor>,
  reduceMotion: boolean
): Simulation<NodeDatum, undefined> {
  const data: NodeDatum[] = nodes.map(n => {
    const a = anchors.get(n.id)
    return {
      ...n,
      x: a?.fx0,
      y: a?.fy0,
      fx0: a?.fx0,
      fy0: a?.fy0,
    }
  })

  const sim = forceSimulation<NodeDatum>(data)
    .force(
      'x',
      forceX<NodeDatum>(d => d.fx0 ?? 0).strength(0.85)
    )
    .force(
      'y',
      forceY<NodeDatum>(d => d.fy0 ?? 0).strength(0.85)
    )
    .force(
      'charge',
      forceManyBody<NodeDatum>().strength(reduceMotion ? 0 : -15)
    )
    .force(
      'collide',
      forceCollide<NodeDatum>(d => 8 + 6 * d.weight).strength(0.7)
    )
    .alphaDecay(0.04)
    .alphaMin(reduceMotion ? 0.001 : 0)
    .alphaTarget(reduceMotion ? 0 : 0.0015)

  return sim
}
```

- [ ] **Step 6.2: Commit (no test — la sim se testea via GraphEngine integración)**

```bash
git add frontend/src/components/graph/motion/breathing.ts && git commit -m "feat(graph): breathing sim con anclas + oscilación sutil (PR-1 motion)"
```

---

## Task 7: `entry-wave.ts` y `click-ripple.ts` — animaciones puntuales

**Files:**
- Create: `frontend/src/components/graph/motion/entry-wave.ts`
- Create: `frontend/src/components/graph/motion/click-ripple.ts`

**Context:** Funciones puras que operan sobre refs SVG. Disparadas por el engine en eventos (mount + click). Implementación con CSS class toggles + RAF — sin dependencias.

- [ ] **Step 7.1: Implement entry-wave**

```ts
// frontend/src/components/graph/motion/entry-wave.ts

/**
 * Dispara una "electric wave" que recorre todas las aristas hierárquicas
 * desde la raíz hacia afuera, en ~1.5s.
 *
 * Usa CSS class `edge-wave-active` que activa una transición de
 * stroke-dashoffset. Se activa con stagger por depth (BFS desde root).
 *
 * El componente EdgePath debe declarar:
 *   .edge-path { stroke-dasharray: 4 4; stroke-dashoffset: 0; }
 *   .edge-path.edge-wave-active { stroke-dashoffset: -8; transition: stroke-dashoffset 1.2s ease-out; }
 */
export function fireEntryWave(
  edgeRefs: Map<string, SVGPathElement>,
  edgesByDepth: Map<number, string[]>  // depth → array of edge IDs
): void {
  const maxDepth = Math.max(...edgesByDepth.keys())
  for (let d = 0; d <= maxDepth; d++) {
    const ids = edgesByDepth.get(d) ?? []
    const delay = d * 200  // 200ms stagger per depth ring
    ids.forEach(id => {
      const el = edgeRefs.get(id)
      if (!el) return
      setTimeout(() => {
        el.classList.add('edge-wave-active')
        setTimeout(() => el.classList.remove('edge-wave-active'), 1200)
      }, delay)
    })
  }
}
```

- [ ] **Step 7.2: Implement click-ripple**

```ts
// frontend/src/components/graph/motion/click-ripple.ts

/**
 * Al click en un nodo, dispara un ripple (CSS animation) en las aristas
 * salientes desde ese nodo. ~600ms.
 *
 * Las aristas adyacentes obtienen la clase `edge-click-ripple`. CSS:
 *   .edge-path.edge-click-ripple { animation: edge-pulse 600ms ease-out; }
 *   @keyframes edge-pulse { 0% { stroke-width: 1; } 50% { stroke-width: 3; } 100% { stroke-width: 1; } }
 */
export function fireClickRipple(
  nodeId: string,
  edgeRefs: Map<string, SVGPathElement>,
  adjacentEdgeIds: string[]
): void {
  for (const eId of adjacentEdgeIds) {
    const el = edgeRefs.get(eId)
    if (!el) continue
    el.classList.add('edge-click-ripple')
    setTimeout(() => el.classList.remove('edge-click-ripple'), 600)
  }
}
```

- [ ] **Step 7.3: Add CSS for both animations**

In `frontend/src/styles/argos.css` append:

```css
/* WAVE 5 — entry electric wave + click ripple */
.edge-path {
  stroke-dasharray: 4 4;
  stroke-dashoffset: 0;
  transition: stroke-dashoffset var(--motion-slow, 1200ms) var(--ease-out);
}
.edge-path.edge-wave-active {
  stroke-dashoffset: -8;
}
.edge-path.edge-click-ripple {
  animation: edge-click-pulse 600ms var(--ease-out);
}
@keyframes edge-click-pulse {
  0%   { stroke-width: 1; }
  50%  { stroke-width: 3; }
  100% { stroke-width: 1; }
}
@media (prefers-reduced-motion: reduce) {
  .edge-path.edge-wave-active,
  .edge-path.edge-click-ripple {
    animation: none;
    transition: none;
  }
}
```

- [ ] **Step 7.4: Commit**

```bash
git add frontend/src/components/graph/motion/entry-wave.ts frontend/src/components/graph/motion/click-ripple.ts frontend/src/styles/argos.css && git commit -m "feat(graph): entry-wave + click-ripple animations (PR-1 motion)"
```

---

## Task 8: `EntityNode.tsx` — render de un nodo

**Files:**
- Create: `frontend/src/components/graph/primitives/EntityNode.tsx`
- Create: `frontend/src/components/graph/primitives/EntityNode.test.tsx`

**Context:** Render SVG de un círculo + icono Lucide adentro. Reusa `getEntityColor`/`getEntityIcon` del primitive existente. No usa shapes (decisión Q8 = todos círculos).

- [ ] **Step 8.1: Write failing test**

```tsx
// frontend/src/components/graph/primitives/EntityNode.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EntityNode } from './EntityNode'
import type { GraphNode } from '../types'

const node: GraphNode = {
  id: 'min-salud',
  type: 'estado',
  label: 'Ministerio de Salud',
  weight: 0.9,
  depth: 1,
  data: {},
}

describe('EntityNode', () => {
  it('renders a circle with entity color', () => {
    const { container } = render(
      <svg><EntityNode node={node} cx={100} cy={100} zoomLevel="medium" /></svg>
    )
    const circle = container.querySelector('circle')
    expect(circle).toBeTruthy()
    expect(circle?.getAttribute('cx')).toBe('100')
  })

  it('shows icon when zoom is medium or close', () => {
    const { container } = render(
      <svg><EntityNode node={node} cx={0} cy={0} zoomLevel="medium" /></svg>
    )
    expect(container.querySelector('svg svg')).toBeTruthy()
  })

  it('does not show icon at far zoom', () => {
    const { container } = render(
      <svg><EntityNode node={node} cx={0} cy={0} zoomLevel="far" /></svg>
    )
    // Inner SVG (Lucide icon) absent
    const innerSvgs = container.querySelectorAll('svg svg')
    expect(innerSvgs.length).toBe(0)
  })
})
```

- [ ] **Step 8.2: Run (fails)**

Run: `cd frontend && npm run test src/components/graph/primitives/EntityNode.test.tsx`
Expected: FAIL.

- [ ] **Step 8.3: Implement**

```tsx
// frontend/src/components/graph/primitives/EntityNode.tsx
import { getEntityColor, getEntityIcon } from '@/components/argos/primitives/EntityIcon'
import type { GraphNode } from '../types'

export type ZoomLevel = 'far' | 'medium' | 'close' | 'deep'

interface Props {
  node: GraphNode
  cx: number
  cy: number
  zoomLevel: ZoomLevel
  selected?: boolean
  hovered?: boolean
}

function nodeRadius(node: GraphNode): number {
  const base = node.depth === 0 ? 20 : node.depth === 1 ? 14 : 9
  return base + node.weight * (node.depth === 0 ? 14 : node.depth === 1 ? 8 : 6)
}

export function EntityNode({ node, cx, cy, zoomLevel, selected, hovered }: Props) {
  const r = nodeRadius(node)
  const color = getEntityColor(node.type)
  const Icon = getEntityIcon(node.type)
  const showIcon = zoomLevel !== 'far' && r >= 9
  const iconSize = Math.max(8, Math.round(r * 0.9))

  const fillOp = selected ? 1 : hovered ? 0.95 : 0.85
  const strokeW = selected ? 2.5 : hovered ? 2 : 1.5
  const strokeOp = selected ? 1 : 0.7

  return (
    <g transform={`translate(${cx},${cy})`}>
      <circle
        r={r}
        fill={color.fill}
        fillOpacity={fillOp}
        stroke={color.stroke}
        strokeWidth={strokeW}
        strokeOpacity={strokeOp}
      />
      {showIcon && Icon && (
        <g transform={`translate(${-iconSize / 2},${-iconSize / 2})`} pointerEvents="none">
          <Icon
            width={iconSize}
            height={iconSize}
            stroke="var(--text-primary)"
            strokeWidth={1.75}
            fill="none"
          />
        </g>
      )}
      {/* Halo SE corner si tiene señales */}
      {(node.flags?.senalGrave || node.flags?.senalModerada) && (
        <circle
          cx={r * 0.7}
          cy={r * 0.7}
          r={r * 0.3}
          fill={node.flags.senalGrave ? 'var(--semantic-danger)' : 'var(--semantic-warn)'}
          opacity={0.92}
        />
      )}
    </g>
  )
}
```

- [ ] **Step 8.4: Run (passes)**

Run: `cd frontend && npm run test src/components/graph/primitives/EntityNode.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 8.5: Commit**

```bash
git add frontend/src/components/graph/primitives/EntityNode.tsx frontend/src/components/graph/primitives/EntityNode.test.tsx && git commit -m "feat(graph): EntityNode primitive (PR-1 visual)"
```

---

## Task 9: `EdgePath.tsx` — render de aristas (5 estilos)

**Files:**
- Create: `frontend/src/components/graph/primitives/EdgePath.tsx`
- Create: `frontend/src/components/graph/primitives/EdgePath.test.tsx`

- [ ] **Step 9.1: Write failing test**

```tsx
// frontend/src/components/graph/primitives/EdgePath.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { EdgePath } from './EdgePath'

describe('EdgePath', () => {
  it('renders solid line for pertenece_a', () => {
    const { container } = render(
      <svg><EdgePath x1={0} y1={0} x2={100} y2={0} kind="pertenece_a" weight={0.5} /></svg>
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke-dasharray')).toBeFalsy()
  })

  it('renders dashed line for dirige', () => {
    const { container } = render(
      <svg><EdgePath x1={0} y1={0} x2={100} y2={0} kind="dirige" weight={0.5} /></svg>
    )
    const path = container.querySelector('path')
    expect(path?.getAttribute('stroke-dasharray')).toBeTruthy()
  })

  it('renders curved bezier for contrata', () => {
    const { container } = render(
      <svg><EdgePath x1={0} y1={0} x2={100} y2={0} kind="contrata" weight={0.7} /></svg>
    )
    const path = container.querySelector('path')
    const d = path?.getAttribute('d') ?? ''
    expect(d).toMatch(/Q/)  // Quadratic Bezier
  })
})
```

- [ ] **Step 9.2: Run (fails)**

Run: `cd frontend && npm run test src/components/graph/primitives/EdgePath.test.tsx`
Expected: FAIL.

- [ ] **Step 9.3: Implement**

```tsx
// frontend/src/components/graph/primitives/EdgePath.tsx
import type { EdgeKind } from '../types'

interface Props {
  x1: number
  y1: number
  x2: number
  y2: number
  kind: EdgeKind
  /** 0..1 — afecta strokeWidth (solo en 'contrata') */
  weight: number
}

interface EdgeStyle {
  stroke: string
  strokeWidth: number
  strokeDasharray?: string
  strokeOpacity: number
  curved: boolean
  filter?: string
}

function styleFor(kind: EdgeKind, weight: number): EdgeStyle {
  switch (kind) {
    case 'pertenece_a':
      return { stroke: 'var(--text-muted)', strokeWidth: 1.5, strokeOpacity: 0.55, curved: false }
    case 'contrata':
      return {
        stroke: 'var(--entity-empresa)',
        strokeWidth: 1 + Math.log2(1 + weight * 8),  // log scale ~1-3px
        strokeOpacity: 0.7,
        curved: true,
      }
    case 'dirige':
      return {
        stroke: 'var(--entity-documento)',
        strokeWidth: 1,
        strokeDasharray: '6 3',
        strokeOpacity: 0.65,
        curved: false,
      }
    case 'conflicto_con':
      return {
        stroke: 'var(--semantic-danger)',
        strokeWidth: 2.2,
        strokeOpacity: 0.85,
        curved: false,
        filter: 'drop-shadow(0 0 3px var(--semantic-danger))',
      }
    case 'emite':
      return {
        stroke: 'var(--entity-documento)',
        strokeWidth: 1.2,
        strokeDasharray: '2 4',
        strokeOpacity: 0.5,
        curved: false,
      }
  }
}

function buildPath(x1: number, y1: number, x2: number, y2: number, curved: boolean): string {
  if (!curved) return `M ${x1.toFixed(1)} ${y1.toFixed(1)} L ${x2.toFixed(1)} ${y2.toFixed(1)}`
  const dx = x2 - x1
  const dy = y2 - y1
  const len = Math.hypot(dx, dy) || 1
  const nx = -dy / len
  const ny = dx / len
  const k = Math.max(8, Math.min(36, len * 0.12))
  const cpx = (x1 + x2) / 2 + nx * k
  const cpy = (y1 + y2) / 2 + ny * k
  return `M ${x1.toFixed(1)} ${y1.toFixed(1)} Q ${cpx.toFixed(1)} ${cpy.toFixed(1)} ${x2.toFixed(1)} ${y2.toFixed(1)}`
}

export function EdgePath({ x1, y1, x2, y2, kind, weight }: Props) {
  const style = styleFor(kind, weight)
  const d = buildPath(x1, y1, x2, y2, style.curved)
  return (
    <path
      className="edge-path"
      d={d}
      fill="none"
      stroke={style.stroke}
      strokeWidth={style.strokeWidth}
      strokeOpacity={style.strokeOpacity}
      strokeDasharray={style.strokeDasharray}
      filter={style.filter}
    />
  )
}
```

- [ ] **Step 9.4: Run (passes)**

Run: `cd frontend && npm run test src/components/graph/primitives/EdgePath.test.tsx`
Expected: 3 tests pass.

- [ ] **Step 9.5: Commit**

```bash
git add frontend/src/components/graph/primitives/EdgePath.tsx frontend/src/components/graph/primitives/EdgePath.test.tsx && git commit -m "feat(graph): EdgePath con 5 estilos semánticos por kind (PR-1 visual)"
```

---

## Task 10: Hooks de interacción (`use-zoom-pan`, `use-hover`, `use-selection`)

**Files:**
- Create: `frontend/src/components/graph/interactions/use-zoom-pan.ts`
- Create: `frontend/src/components/graph/interactions/use-hover.ts`
- Create: `frontend/src/components/graph/interactions/use-selection.ts`

**Context:** Hooks que el GraphEngine usa para wirear eventos. Sin tests unitarios — se prueban via integración del engine en Task 12.

- [ ] **Step 10.1: Implement use-zoom-pan**

```ts
// frontend/src/components/graph/interactions/use-zoom-pan.ts
import { useEffect, useRef } from 'react'
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom'
import { select } from 'd3-selection'
import type { ZoomState } from '../types'

interface Opts {
  svgRef: React.RefObject<SVGSVGElement>
  contentRef: React.RefObject<SVGGElement>
  initialState?: ZoomState
  minZoom?: number
  maxZoom?: number
  onZoom?: (state: ZoomState) => void
}

/**
 * Wire d3.zoom al SVG. Aplica el transform al `<g class="zoom-content">`.
 * Devuelve helpers: zoomTo(node), reset(), getCurrent().
 */
export function useZoomPan({ svgRef, contentRef, initialState, minZoom = 0.4, maxZoom = 6, onZoom }: Opts) {
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  useEffect(() => {
    if (!svgRef.current || !contentRef.current) return
    const svg = select(svgRef.current)
    const content = select(contentRef.current)

    const zb = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, maxZoom])
      .on('zoom', (event) => {
        const { x, y, k } = event.transform
        content.attr('transform', `translate(${x},${y}) scale(${k})`)
        onZoom?.({ k, x, y })
      })

    zoomBehaviorRef.current = zb
    svg.call(zb)

    if (initialState) {
      svg.call(zb.transform, zoomIdentity.translate(initialState.x, initialState.y).scale(initialState.k))
    }

    return () => {
      svg.on('.zoom', null)
    }
  }, [svgRef, contentRef])

  return {
    /** Centra la cámara en (worldX, worldY) con zoom k. */
    zoomTo(worldX: number, worldY: number, k: number, viewportW: number, viewportH: number) {
      if (!svgRef.current || !zoomBehaviorRef.current) return
      const svg = select(svgRef.current)
      const transform = zoomIdentity.translate(viewportW / 2 - k * worldX, viewportH / 2 - k * worldY).scale(k)
      svg.transition().duration(700).call(zoomBehaviorRef.current.transform, transform)
    },
    reset() {
      if (!svgRef.current || !zoomBehaviorRef.current) return
      select(svgRef.current).transition().duration(400).call(zoomBehaviorRef.current.transform, zoomIdentity)
    },
    getCurrent(): ZoomState {
      if (!svgRef.current) return { k: 1, x: 0, y: 0 }
      const t = zoomTransform(svgRef.current)
      return { k: t.k, x: t.x, y: t.y }
    },
  }
}
```

- [ ] **Step 10.2: Implement use-hover (RAF-throttled)**

```ts
// frontend/src/components/graph/interactions/use-hover.ts
import { useState, useRef, useCallback } from 'react'

/**
 * Hover state RAF-throttled.
 * onMouseMove se coalesce en un setState por frame max.
 */
export function useHover() {
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const pendingRef = useRef<string | null>(null)
  const rafRef = useRef<number | null>(null)

  const setHover = useCallback((id: string | null) => {
    pendingRef.current = id
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      setHoveredId(pendingRef.current)
    })
  }, [])

  const clearHover = useCallback(() => {
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }
    setHoveredId(null)
  }, [])

  return { hoveredId, setHover, clearHover }
}
```

- [ ] **Step 10.3: Implement use-selection**

```ts
// frontend/src/components/graph/interactions/use-selection.ts
import { useState, useEffect, useCallback } from 'react'

/**
 * Selección persistente. Click selecciona, click background o Esc deselecciona.
 * Esc se conecta al evento global 'argos:escape' (ya emitido por ArgosShell).
 */
export function useSelection() {
  const [selectedId, setSelectedId] = useState<string | null>(null)

  const select = useCallback((id: string | null) => {
    setSelectedId(prev => (prev === id ? null : id))  // toggle
  }, [])
  const clear = useCallback(() => setSelectedId(null), [])

  useEffect(() => {
    const onEsc = () => setSelectedId(null)
    window.addEventListener('argos:escape', onEsc)
    return () => window.removeEventListener('argos:escape', onEsc)
  }, [])

  return { selectedId, select, clear }
}
```

- [ ] **Step 10.4: Commit**

```bash
git add frontend/src/components/graph/interactions/ && git commit -m "feat(graph): hooks use-zoom-pan + use-hover + use-selection (PR-1)"
```

---

## Task 11: `RadialGradient.tsx` — fondo del canvas

**Files:**
- Create: `frontend/src/components/graph/background/RadialGradient.tsx`

- [ ] **Step 11.1: Implement**

```tsx
// frontend/src/components/graph/background/RadialGradient.tsx

/**
 * Fondo radial (decisión Q7=B): centro `surface-overlay` → bordes `surface-base`
 * + tinte azul 4% en el centro. Sin dot grid ni constellation.
 *
 * Se renderiza como <rect fill="url(#argos-radial-bg)"/> ocupando todo el SVG.
 */
export function RadialGradientDef() {
  return (
    <defs>
      <radialGradient id="argos-radial-bg" cx="50%" cy="50%" r="60%">
        <stop offset="0%" stopColor="var(--surface-overlay)" stopOpacity="0.7" />
        <stop offset="60%" stopColor="var(--surface-raised)" stopOpacity="0.4" />
        <stop offset="100%" stopColor="var(--surface-base)" stopOpacity="0" />
      </radialGradient>
      <radialGradient id="argos-blue-tint" cx="50%" cy="50%" r="50%">
        <stop offset="0%" stopColor="var(--accent-primary)" stopOpacity="0.04" />
        <stop offset="100%" stopColor="var(--accent-primary)" stopOpacity="0" />
      </radialGradient>
    </defs>
  )
}

interface BgProps {
  width: number
  height: number
}

export function RadialBackground({ width, height }: BgProps) {
  return (
    <>
      <rect x="0" y="0" width={width} height={height} fill="var(--surface-base)" />
      <rect x="0" y="0" width={width} height={height} fill="url(#argos-radial-bg)" />
      <rect x="0" y="0" width={width} height={height} fill="url(#argos-blue-tint)" />
    </>
  )
}
```

- [ ] **Step 11.2: Commit**

```bash
git add frontend/src/components/graph/background/RadialGradient.tsx && git commit -m "feat(graph): RadialGradient background (PR-1 visual)"
```

---

## Task 12: GraphEngine — el motor central

**Files:**
- Create: `frontend/src/components/graph/GraphEngine.tsx`
- Create: `frontend/src/components/graph/GraphEngine.test.tsx`

**Context:** El componente que junta todo: layout + sim + LOD + render. Recibe `snapshot` y callbacks. NO sabe del dominio de ARGOS — solo de nodos/aristas con weight/depth.

- [ ] **Step 12.1: Write failing test (smoke)**

```tsx
// frontend/src/components/graph/GraphEngine.test.tsx
import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { GraphEngine } from './GraphEngine'
import type { GraphSnapshot } from './types'

const snapshot: GraphSnapshot = {
  nodes: [
    { id: 'root', type: 'estado', label: 'Provincia', weight: 1, depth: 0, data: {} },
    { id: 'a', type: 'estado', label: 'Min A', weight: 0.8, depth: 1, data: {} },
    { id: 'b', type: 'empresa', label: 'Emp B', weight: 0.5, depth: 2, data: {} },
  ],
  edges: [
    { source: 'a', target: 'root', kind: 'pertenece_a', weight: 1 },
    { source: 'b', target: 'a', kind: 'contrata', weight: 0.6 },
  ],
}

describe('GraphEngine', () => {
  it('renders nodes and edges', () => {
    const { container } = render(<GraphEngine snapshot={snapshot} layout="radial-cluster" />)
    const svg = container.querySelector('svg')
    expect(svg).toBeTruthy()
    // 3 circles (1 per node)
    const circles = container.querySelectorAll('circle')
    expect(circles.length).toBeGreaterThanOrEqual(3)
    // 2 edges
    const paths = container.querySelectorAll('path.edge-path')
    expect(paths.length).toBe(2)
  })

  it('applies radial gradient background', () => {
    const { container } = render(<GraphEngine snapshot={snapshot} layout="radial-cluster" />)
    expect(container.querySelector('rect[fill*="argos-radial-bg"]')).toBeTruthy()
  })
})
```

- [ ] **Step 12.2: Run (fails)**

Run: `cd frontend && npm run test src/components/graph/GraphEngine.test.tsx`
Expected: FAIL.

- [ ] **Step 12.3: Implement GraphEngine**

```tsx
// frontend/src/components/graph/GraphEngine.tsx
import { useEffect, useMemo, useRef, useState } from 'react'
import type { GraphEngineProps, GraphNode, ZoomState } from './types'
import { computeRadialLayout } from './layouts/radial-cluster'
import { calcViewportBudget } from './lod/viewport-budget'
import { selectVisibleNodes } from './lod/semantic-zoom'
import { createBreathingSim } from './motion/breathing'
import { fireEntryWave } from './motion/entry-wave'
import { fireClickRipple } from './motion/click-ripple'
import { useHover } from './interactions/use-hover'
import { useZoomPan } from './interactions/use-zoom-pan'
import { EntityNode, type ZoomLevel } from './primitives/EntityNode'
import { EdgePath } from './primitives/EdgePath'
import { RadialBackground, RadialGradientDef } from './background/RadialGradient'

function zoomLevelOf(k: number): ZoomLevel {
  if (k < 0.9) return 'far'
  if (k < 2.4) return 'medium'
  if (k < 4.5) return 'close'
  return 'deep'
}

export function GraphEngine({
  snapshot,
  selectedId,
  hoveredId: hoveredFromOutside,
  highlighted,
  onSelect,
  onHover,
  onZoom,
}: GraphEngineProps) {
  const svgRef = useRef<SVGSVGElement>(null)
  const contentRef = useRef<SVGGElement>(null)
  const edgeRefs = useRef<Map<string, SVGPathElement>>(new Map())
  const [size, setSize] = useState({ w: 1200, h: 800 })
  const [zoomState, setZoomState] = useState<ZoomState>({ k: 1, x: 0, y: 0 })

  const { hoveredId: hoveredInternal, setHover, clearHover } = useHover()
  const hoveredId = hoveredFromOutside ?? hoveredInternal

  // ResizeObserver — measure viewport
  useEffect(() => {
    const el = svgRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => {
      const cr = entries[0]?.contentRect
      if (!cr) return
      setSize(prev =>
        Math.abs(prev.w - cr.width) < 1 && Math.abs(prev.h - cr.height) < 1
          ? prev
          : { w: cr.width, h: cr.height }
      )
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // Layout — recalc cuando snapshot o size cambia
  const layout = useMemo(
    () =>
      computeRadialLayout({
        nodes: snapshot.nodes,
        edges: snapshot.edges,
        centerX: size.w / 2,
        centerY: size.h / 2,
        maxRadius: Math.min(size.w, size.h) * 0.42,
      }),
    [snapshot, size]
  )

  // LOD — qué nodos renderizar
  const visibleNodes = useMemo(() => {
    const budget = calcViewportBudget(size, zoomState.k)
    return selectVisibleNodes(snapshot.nodes, budget)
  }, [snapshot.nodes, size, zoomState.k])

  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map(n => n.id)), [visibleNodes])
  const visibleEdges = useMemo(
    () => snapshot.edges.filter(e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)),
    [snapshot.edges, visibleNodeIds]
  )

  // Sim — re-create on snapshot change, drive positions
  const [tick, setTick] = useState(0)
  useEffect(() => {
    const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const sim = createBreathingSim(visibleNodes, layout.anchors, reduceMotion)
    sim.on('tick', () => setTick(t => t + 1))
    return () => {
      sim.stop()
    }
  }, [layout, visibleNodes])

  // Position lookup (mutated by sim)
  const nodePositions = useMemo(() => {
    const map = new Map<string, { x: number; y: number }>()
    for (const n of visibleNodes) {
      const a = layout.anchors.get(n.id)
      map.set(n.id, { x: n.x ?? a?.fx0 ?? 0, y: n.y ?? a?.fy0 ?? 0 })
    }
    return map
    // Re-compute on tick (sim mutates n.x/n.y in place)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleNodes, layout, tick])

  // Zoom + pan
  const zoomCtrl = useZoomPan({
    svgRef,
    contentRef,
    minZoom: 0.4,
    maxZoom: 6,
    onZoom: state => {
      setZoomState(state)
      onZoom?.(state)
    },
  })

  // Entry wave on first paint
  useEffect(() => {
    const edgesByDepth = new Map<number, string[]>()
    for (const e of visibleEdges) {
      const target = visibleNodes.find(n => n.id === e.target)
      const d = target?.depth ?? 0
      const arr = edgesByDepth.get(d) ?? []
      arr.push(`${e.source}->${e.target}`)
      edgesByDepth.set(d, arr)
    }
    fireEntryWave(edgeRefs.current, edgesByDepth)
  }, [snapshot])

  const zLevel = zoomLevelOf(zoomState.k)

  // Background click → deselect
  function handleSvgClick(e: React.MouseEvent) {
    if (e.target === svgRef.current) {
      onSelect?.(null)
    }
  }

  // Adjacent edges helper
  function adjacentEdgeIds(nodeId: string): string[] {
    return visibleEdges
      .filter(e => e.source === nodeId || e.target === nodeId)
      .map(e => `${e.source}->${e.target}`)
  }

  return (
    <svg
      ref={svgRef}
      width="100%"
      height="100%"
      style={{ display: 'block', cursor: 'grab' }}
      onClick={handleSvgClick}
    >
      <RadialGradientDef />
      <RadialBackground width={size.w} height={size.h} />
      <g ref={contentRef}>
        {/* Edges first (under nodes) */}
        {visibleEdges.map(e => {
          const s = nodePositions.get(e.source)
          const t = nodePositions.get(e.target)
          if (!s || !t) return null
          const id = `${e.source}->${e.target}`
          return (
            <g
              key={id}
              ref={el => {
                const path = el?.querySelector('path.edge-path') as SVGPathElement | null
                if (path) edgeRefs.current.set(id, path)
              }}
            >
              <EdgePath x1={s.x} y1={s.y} x2={t.x} y2={t.y} kind={e.kind} weight={e.weight} />
            </g>
          )
        })}
        {/* Nodes on top */}
        {visibleNodes.map(n => {
          const pos = nodePositions.get(n.id)
          if (!pos) return null
          const isSelected = selectedId === n.id
          const isHovered = hoveredId === n.id
          return (
            <g
              key={n.id}
              style={{ cursor: 'pointer' }}
              onMouseEnter={() => {
                setHover(n.id)
                onHover?.(n.id)
              }}
              onMouseLeave={() => {
                clearHover()
                onHover?.(null)
              }}
              onClick={(e) => {
                e.stopPropagation()
                onSelect?.(n.id)
                fireClickRipple(n.id, edgeRefs.current, adjacentEdgeIds(n.id))
              }}
            >
              <EntityNode node={n} cx={pos.x} cy={pos.y} zoomLevel={zLevel} selected={isSelected} hovered={isHovered} />
            </g>
          )
        })}
      </g>
    </svg>
  )
}
```

- [ ] **Step 12.4: Run (passes)**

Run: `cd frontend && npm run test src/components/graph/GraphEngine.test.tsx`
Expected: tests pass.

- [ ] **Step 12.5: Commit**

```bash
git add frontend/src/components/graph/GraphEngine.tsx frontend/src/components/graph/GraphEngine.test.tsx && git commit -m "feat(graph): GraphEngine core (PR-1)"
```

---

## Task 13: `GraphSidebar`, `GraphHoverCard`, `ZoomControls`

**Files:**
- Create: `frontend/src/components/graph/overlay/GraphSidebar.tsx`
- Create: `frontend/src/components/graph/overlay/GraphHoverCard.tsx`
- Create: `frontend/src/components/graph/overlay/ZoomControls.tsx`

- [ ] **Step 13.1: Implement GraphSidebar (slide-in 340px)**

```tsx
// frontend/src/components/graph/overlay/GraphSidebar.tsx
import { useEffect } from 'react'
import type { GraphNode } from '../types'

interface Props {
  open: boolean
  node: GraphNode | null
  onClose: () => void
  /** contenido inyectado por el adapter (KPIs, etc.) */
  children?: React.ReactNode
}

export function GraphSidebar({ open, node, onClose, children }: Props) {
  // Close on Esc
  useEffect(() => {
    if (!open) return
    const onEsc = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [open, onClose])

  return (
    <aside
      style={{
        position: 'fixed',
        top: 'var(--header-h, 42px)',
        right: 0,
        width: 340,
        bottom: 0,
        background: 'var(--surface-raised)',
        borderLeft: '1px solid var(--hairline-2)',
        boxShadow: 'var(--elevation-3)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform var(--motion-normal) var(--ease-out)',
        zIndex: 'var(--z-search, 500)',
        overflow: 'auto',
        padding: 'var(--space-5)',
      }}
    >
      <button
        onClick={onClose}
        style={{
          position: 'absolute',
          top: 8,
          right: 8,
          background: 'transparent',
          border: '1px solid var(--hairline-2)',
          color: 'var(--text-secondary)',
          cursor: 'pointer',
          width: 28,
          height: 28,
          borderRadius: 'var(--radius-md)',
        }}
        aria-label="Cerrar (Esc)"
      >
        ×
      </button>
      {node && (
        <div>
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)', letterSpacing: 'var(--tracking-wider)', textTransform: 'uppercase' }}>
            {node.type}
          </div>
          <h2 style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', margin: 'var(--space-1) 0 var(--space-3)', fontFamily: 'var(--font-sans)', fontWeight: 'var(--weight-semibold)' }}>
            {node.label}
          </h2>
          {node.subtitle && (
            <div style={{ fontSize: 'var(--text-sm)', color: 'var(--text-secondary)', fontFamily: 'var(--font-mono)' }}>
              {node.subtitle}
            </div>
          )}
          <hr style={{ border: 0, borderTop: '1px solid var(--hairline-2)', margin: 'var(--space-4) 0' }} />
          {children}
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 13.2: Implement GraphHoverCard**

```tsx
// frontend/src/components/graph/overlay/GraphHoverCard.tsx
import { useEffect, useRef } from 'react'
import type { GraphNode } from '../types'

interface Props {
  node: GraphNode | null
  /** mouse coords en viewport (clientX/clientY) */
  x: number
  y: number
}

/**
 * Card flotante anclada al cursor + 12px offset. RAF-throttled.
 * Posición se actualiza imperativamente vía transform (no React state per pixel).
 */
export function GraphHoverCard({ node, x, y }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number | null>(null)
  const posRef = useRef({ x, y })
  posRef.current = { x, y }

  useEffect(() => {
    if (rafRef.current != null) return
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = null
      const el = ref.current
      if (el) el.style.transform = `translate(${posRef.current.x + 12}px, ${posRef.current.y + 12}px)`
    })
  }, [x, y])

  return (
    <div
      ref={ref}
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        pointerEvents: 'none',
        zIndex: 'var(--z-tooltip, 1000)',
        background: 'var(--glass-bg)',
        backdropFilter: 'var(--glass-blur)',
        border: '1px solid var(--hairline-2)',
        borderRadius: 'var(--radius-md)',
        padding: 'var(--space-2) var(--space-3)',
        fontSize: 'var(--text-sm)',
        color: 'var(--text-primary)',
        fontFamily: 'var(--font-sans)',
        opacity: node ? 1 : 0,
        transition: 'opacity var(--motion-fast) var(--ease-out)',
        maxWidth: 240,
        boxShadow: 'var(--elevation-2)',
      }}
    >
      {node && (
        <>
          <div style={{ fontWeight: 'var(--weight-semibold)', marginBottom: 2 }}>{node.label}</div>
          {node.subtitle && (
            <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>
              {node.subtitle}
            </div>
          )}
        </>
      )}
    </div>
  )
}
```

- [ ] **Step 13.3: Implement ZoomControls**

```tsx
// frontend/src/components/graph/overlay/ZoomControls.tsx

interface Props {
  onZoomIn: () => void
  onZoomOut: () => void
  onFit: () => void
}

const btnStyle: React.CSSProperties = {
  width: 32,
  height: 32,
  background: 'var(--glass-bg)',
  backdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--hairline-2)',
  color: 'var(--text-secondary)',
  cursor: 'pointer',
  fontSize: 'var(--text-md)',
  fontFamily: 'var(--font-mono)',
}

export function ZoomControls({ onZoomIn, onZoomOut, onFit }: Props) {
  return (
    <div
      style={{
        position: 'absolute',
        bottom: 24,
        right: 24,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 'var(--z-overlay, 100)',
      }}
    >
      <button onClick={onZoomIn} style={{ ...btnStyle, borderTopLeftRadius: 'var(--radius-md)', borderTopRightRadius: 'var(--radius-md)' }} aria-label="Zoom in">+</button>
      <button onClick={onZoomOut} style={{ ...btnStyle, borderTop: 0 }} aria-label="Zoom out">−</button>
      <button onClick={onFit} style={{ ...btnStyle, borderTop: 0, borderBottomLeftRadius: 'var(--radius-md)', borderBottomRightRadius: 'var(--radius-md)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--tracking-wider)' }} aria-label="Fit to viewport">FIT</button>
    </div>
  )
}
```

- [ ] **Step 13.4: Commit**

```bash
git add frontend/src/components/graph/overlay/ && git commit -m "feat(graph): overlays GraphSidebar + GraphHoverCard + ZoomControls (PR-1)"
```

---

## Task 14: Frontend hook `useGrafoJerarquiaV2`

**Files:**
- Modify: `frontend/src/lib/queries.ts`

- [ ] **Step 14.1: Add hook**

In `frontend/src/lib/queries.ts` add at the end:

```ts
// ─── Grafo jerárquico v2 (depth-structured) ────────────────────────────────

export interface GrafoJerarquiaV2DepthLevel {
  nodes: GrafoJerarquiaNode[]
  edges: GrafoJerarquiaEdge[]
}

export interface GrafoJerarquiaV2Response {
  depth0: GrafoJerarquiaV2DepthLevel
  depth1: GrafoJerarquiaV2DepthLevel
  depth2: GrafoJerarquiaV2DepthLevel
  depth3: GrafoJerarquiaV2DepthLevel
  meta: {
    jurisdiccion: string
    totalNodos: number
    totalAristas: number
    montoTotal: number
  }
}

export function useGrafoJerarquiaV2(
  jurisdiccion: 'cordoba-capital' | 'cordoba-provincia' | 'all' = 'cordoba-capital'
) {
  return useQuery({
    queryKey: ['grafo', 'jerarquia-v2', jurisdiccion],
    queryFn: () =>
      fetchJSON<GrafoJerarquiaV2Response>(`/api/grafo/jerarquia/v2?jurisdiccion=${jurisdiccion}`),
    staleTime: 5 * 60_000,
  })
}
```

- [ ] **Step 14.2: Smoke test the hook (optional, manual)**

Skip — covered by HomeAdapter test in Task 15.

- [ ] **Step 14.3: Commit**

```bash
git add frontend/src/lib/queries.ts && git commit -m "feat(queries): useGrafoJerarquiaV2 hook (PR-1)"
```

---

## Task 15: HomeAdapter

**Files:**
- Create: `frontend/src/pages/graph-adapters/HomeAdapter.tsx`
- Create: `frontend/src/pages/graph-adapters/HomeAdapter.test.tsx`

**Context:** Componente que conecta el endpoint `/api/grafo/jerarquia/v2` con el `GraphEngine`. Maneja loading/empty/error states usando los primitives ya creados (`EmptyState`, `LoadingState`, `ErrorState`).

- [ ] **Step 15.1: Write failing smoke test**

```tsx
// frontend/src/pages/graph-adapters/HomeAdapter.test.tsx
import { describe, it, expect, vi } from 'vitest'
import { render, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { HomeAdapter } from './HomeAdapter'

// Mock fetch
global.fetch = vi.fn(async (url: any) => {
  if (String(url).includes('/api/grafo/jerarquia/v2')) {
    return {
      ok: true,
      json: async () => ({
        depth0: { nodes: [{ id: 'root', type: 'jurisdiccion', label: 'Provincia', weight: 1, data: { depth: 0 }, subtitle: 'Estado' }], edges: [] },
        depth1: { nodes: [], edges: [] },
        depth2: { nodes: [], edges: [] },
        depth3: { nodes: [], edges: [] },
        meta: { jurisdiccion: 'cordoba-capital', totalNodos: 1, totalAristas: 0, montoTotal: 0 },
      }),
    } as Response
  }
  return { ok: false, status: 404 } as Response
}) as never

describe('HomeAdapter', () => {
  it('renders the engine with fetched data', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
    const { container } = render(
      <QueryClientProvider client={qc}><HomeAdapter /></QueryClientProvider>
    )
    await waitFor(() => {
      expect(container.querySelector('svg')).toBeTruthy()
    })
  })
})
```

- [ ] **Step 15.2: Run (fails)**

Run: `cd frontend && npm run test src/pages/graph-adapters/HomeAdapter.test.tsx`
Expected: FAIL.

- [ ] **Step 15.3: Implement**

```tsx
// frontend/src/pages/graph-adapters/HomeAdapter.tsx
import { useMemo } from 'react'
import { useGrafoJerarquiaV2 } from '@/lib/queries'
import { GraphEngine } from '@/components/graph/GraphEngine'
import { GraphSidebar } from '@/components/graph/overlay/GraphSidebar'
import { useSelection } from '@/components/graph/interactions/use-selection'
import { LoadingState, ErrorState, EmptyState } from '@/components/argos/primitives'
import type { GraphSnapshot, GraphNode } from '@/components/graph/types'

function mapDepthEntityType(type: string): GraphNode['type'] {
  if (type === 'jurisdiccion' || type === 'reparticion') return 'estado'
  if (type === 'empresa' || type === 'proveedor') return 'empresa'
  if (type === 'persona' || type === 'funcionario' || type === 'director') return 'persona'
  if (type === 'contrato' || type === 'documento') return 'documento'
  return 'estado'
}

export function HomeAdapter() {
  const query = useGrafoJerarquiaV2('cordoba-capital')
  const { selectedId, select, clear } = useSelection()

  const snapshot: GraphSnapshot = useMemo(() => {
    const r = query.data
    if (!r) return { nodes: [], edges: [] }
    const allNodes = [...r.depth0.nodes, ...r.depth1.nodes, ...r.depth2.nodes, ...r.depth3.nodes]
    const allEdges = [...r.depth0.edges, ...r.depth1.edges, ...r.depth2.edges, ...r.depth3.edges]
    return {
      nodes: allNodes.map(n => ({
        id: n.id,
        type: mapDepthEntityType(n.type),
        label: n.label,
        subtitle: n.subtitle,
        weight: n.weight,
        depth: (n.data as { depth?: number })?.depth ?? 0,
        data: n.data,
      })),
      edges: allEdges.map(e => ({
        source: e.source,
        target: e.target,
        kind: (e.kind === 'pertenece_a' || e.kind === 'gano' ? (e.kind === 'gano' ? 'contrata' : 'pertenece_a') : 'pertenece_a') as GraphNode extends { type: infer T } ? T : never extends 'pertenece_a' ? 'pertenece_a' : 'pertenece_a',
        weight: e.weight,
      })) as never,
    }
  }, [query.data])

  if (query.isLoading) {
    return <LoadingState mode="overlay" label="Construyendo mapa de Córdoba…" />
  }

  if (query.error) {
    return (
      <ErrorState
        title="No se pudo cargar el mapa"
        detail={(query.error as Error).message}
        onRetry={() => query.refetch()}
      />
    )
  }

  if (!query.data || snapshot.nodes.length === 0) {
    return (
      <EmptyState
        eyebrow="MAPA · 0 NODOS"
        title="La base de Córdoba está vacía"
        body="Corré los seeds del backend (npm run seed:cordoba) para popular contratos."
      />
    )
  }

  const selectedNode = selectedId ? snapshot.nodes.find(n => n.id === selectedId) ?? null : null

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', minHeight: 600 }}>
      <GraphEngine
        snapshot={snapshot}
        layout="radial-cluster"
        selectedId={selectedId}
        onSelect={(id) => select(id)}
      />
      <GraphSidebar
        open={!!selectedId}
        node={selectedNode}
        onClose={clear}
      >
        {selectedNode && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            {(selectedNode.data as { monto?: number })?.monto != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>MONTO TOTAL</div>
                <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-semibold)' }}>
                  ${((selectedNode.data as { monto: number }).monto / 1e9).toFixed(2)} mil M
                </div>
              </div>
            )}
            {(selectedNode.data as { contratos?: number })?.contratos != null && (
              <div>
                <div style={{ fontSize: 'var(--text-xs)', color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>CONTRATOS</div>
                <div style={{ fontSize: 'var(--text-lg)', color: 'var(--text-primary)', fontFamily: 'var(--font-mono)', fontWeight: 'var(--weight-semibold)' }}>
                  {(selectedNode.data as { contratos: number }).contratos}
                </div>
              </div>
            )}
          </div>
        )}
      </GraphSidebar>
    </div>
  )
}
```

- [ ] **Step 15.4: Run (passes)**

Run: `cd frontend && npm run test src/pages/graph-adapters/HomeAdapter.test.tsx`
Expected: tests pass.

- [ ] **Step 15.5: Commit**

```bash
git add frontend/src/pages/graph-adapters/ && git commit -m "feat(home): HomeAdapter — conecta /api/grafo/jerarquia/v2 con GraphEngine (PR-1)"
```

---

## Task 16: Integración en `Explorar.tsx`

**Files:**
- Modify: `frontend/src/pages/Explorar.tsx`

**Context:** Reemplazar el render del GraphCanvas legacy por el nuevo HomeAdapter. Conservar el resto del shell (sidebar, search, header) intacto.

- [ ] **Step 16.1: Modify Explorar.tsx**

In `frontend/src/pages/Explorar.tsx`, replace the import + main render of GraphCanvas:

```tsx
// Replace this kind of import:
// import { useGrafoNucleo, useDashboard, useGrafoJerarquia } from '@/lib/queries'

// With:
import { HomeAdapter } from '@/pages/graph-adapters/HomeAdapter'
import { ExplorarLayout } from '@/components/argos/ExplorarLayout'

export default function Explorar() {
  return (
    <ExplorarLayout graph={null} isLoading={false}>
      <HomeAdapter />
    </ExplorarLayout>
  )
}
```

NOTE: this assumes `ExplorarLayout` accepts children. If it doesn't, add a `children?: React.ReactNode` prop to it and render it as a slot for the graph (replacing the previous GraphCanvas instantiation inside ExplorarLayout).

- [ ] **Step 16.2: Update ExplorarLayout to accept children**

In `frontend/src/components/argos/ExplorarLayout.tsx`:
- Add `children?: React.ReactNode` to `ExplorarLayoutProps`
- In the canvas-wrap render, if `children` is provided, render `{children}` instead of `<GraphCanvas .../>`. Otherwise keep the legacy path for back-compat.

```tsx
// In ExplorarLayout return JSX, replace the GraphCanvas block:
<div className="canvas-wrap">
  {children ?? <GraphCanvas ... />}
</div>
```

- [ ] **Step 16.3: Verify build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 16.4: Smoke check**

Vite dev should auto-reload. Open `http://localhost:8080`. The home should show the new GraphEngine — radial layout with breathing, click a node opens sidebar, Esc closes.

If broken, fix the integration (probably ExplorarLayout doesn't accept children yet — adjust per your codebase).

- [ ] **Step 16.5: Commit**

```bash
git add frontend/src/pages/Explorar.tsx frontend/src/components/argos/ExplorarLayout.tsx && git commit -m "feat(home): Explorar.tsx usa HomeAdapter en lugar de GraphCanvas legacy (PR-1)"
```

---

## Task 17: Verificación E2E + cleanup

**Files:**
- Run all tests + build

- [ ] **Step 17.1: Frontend tests**

Run: `cd frontend && npm run test`
Expected: all tests pass (incluido smoke setup + viewport-budget + semantic-zoom + radial-cluster + EntityNode + EdgePath + GraphEngine + HomeAdapter).

- [ ] **Step 17.2: Frontend typecheck**

Run: `cd frontend && npx tsc --noEmit`
Expected: no errors.

- [ ] **Step 17.3: Frontend build**

Run: `cd frontend && npm run build`
Expected: build OK.

- [ ] **Step 17.4: Backend tests**

Run: `cd backend && npm run test`
Expected: existing tests pass + 1 new test from Task 1 (`grafo-jerarquia-v2.test.ts`).

- [ ] **Step 17.5: Backend typecheck + build**

Run: `cd backend && npx tsc --noEmit && npm run build`
Expected: no errors.

- [ ] **Step 17.6: Manual visual walkthrough**

Open `http://localhost:8080` (after Vite hot-reload):
- ¿Se ve un grafo radial con la Provincia al centro? ✓/✗
- ¿Se ven círculos de distintos colores (azul Estado, ámbar Empresa)? ✓/✗
- ¿Hay icons Lucide adentro de los círculos grandes? ✓/✗
- ¿Hay edges (curvas ámbar para `contrata`, gris para `pertenece_a`)? ✓/✗
- ¿Los nodos respiran sutilmente (oscilación 1-2px)? ✓/✗
- ¿Hover sobre un nodo muestra hover card mini? ✓/✗
- ¿Click sobre un nodo abre sidebar slide-in con info? ✓/✗
- ¿Esc cierra el sidebar? ✓/✗
- ¿Wheel zoom in/out funciona? ✓/✗
- ¿Hay un fondo radial sutil (no plano)? ✓/✗

Si todo OK, commit final + push (preguntar al user antes de pushear).

- [ ] **Step 17.7: Final commit (clean working tree)**

```bash
cd /c/Users/amiun/Desktop/argentina-transparente && git status
```

Expected: working tree clean. Si hay archivos sueltos, decidir y commitear.

- [ ] **Step 17.8: Push (esperar OK del user)**

```bash
# Solo cuando el user explícitamente apruebe el push:
git push origin main
```

---

## Self-review checklist (post-implementation)

- [ ] Todos los archivos del File Structure existen
- [ ] Todos los tests pasan
- [ ] No hay placeholders, TODOs ni "implement later"
- [ ] Cada task hace 1 commit
- [ ] El home (`/`) muestra el nuevo grafo end-to-end
- [ ] Los otros tabs (Dinero/Senales/Actores) siguen funcionando con el legacy
- [ ] Spec compliance: cada decisión de Q1-Q8 + 5 secciones está implementada o documentada

---

## Out of scope (siguientes PRs)

**PR-2** — `DineroAdapter` con sugerencias ghost + `/api/grafo/sugerencias`
**PR-3** — `SenalesAdapter` con halo pulsante en nodos con señales activas
**PR-4** — `ActoresAdapter` preservando M3 bidirectional + tabla split
**PR-5** — Borrar GraphCanvas legacy + ExplorarLayout limpio

**Workstream paralelo** — Expandir seed `entes_estatales_cordoba` con organigrama real (3-4 días de curaduría con fuentes oficiales).

---

## Riesgos identificados

1. **`d3-zoom` interfere con click en nodo** — los click events pueden ser interceptados por el behavior de zoom. Mitigación: el handler de click llama `e.stopPropagation()` en el `<g>` del nodo (ya está en el código).

2. **ResizeObserver loop en flex containers** — riesgo conocido (BLOCKER 1 fix anterior). El código nuevo usa el mismo guard (skip if change < 1px).

3. **TS strict en `kind` mapping del backend al frontend** — en `HomeAdapter` hay un cast complejo del kind. Si TypeScript se queja, simplificar usando un map literal { 'pertenece_a': 'pertenece_a', 'gano': 'contrata', ... } as const.

4. **La animación `entry-wave` puede dispararse muchas veces si el snapshot cambia** — solo debe dispararse en el primer mount con datos válidos. Si necesario, agregar un `useRef(false)` flag para prevenir replays.

---

**Plan complete.** Lista de tareas: 17 tasks, ~95 steps, ~15 commits.
