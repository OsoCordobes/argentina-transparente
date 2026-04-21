# Frontend Plan (Deferred) — Neo4j Live Neural Landing

Status: parked until data architecture is stabilized.
Owner: product + frontend + backend.
Created: 2026-04-21.

## Objective

Build a relations-first landing experience with a neural-like visual style using real nodes and real edges from Neo4j (entities, companies, contracts, shared directors), while preserving performance, traceability, and graceful fallback.

## Why this is viable in current codebase

- Neo4j connectivity already exists in backend startup.
- Graph enrichment and graph signals are already implemented.
- A graph visualization pattern already exists in reports.
- Missing piece is a dedicated backend API contract for landing graph snapshots and frontend integration in Landing.

## Scope for first production version

- Add a backend graph endpoint for landing snapshots.
- Return bounded graph payload (not full graph): nodes + edges + metadata.
- Render live graph in landing with force layout and staged reveal.
- Keep fallback UX when Neo4j is unavailable.

## Proposed API Contract

Endpoint:

- GET /api/graph/landing?municipio=cordoba-capital&limit=250&seed=top-risk

Response shape:

- nodes: [{ id, label, type, weight, riskScore }]
- edges: [{ source, target, type, weight }]
- meta: { municipio, generatedAt, ttlSeconds, truncated, source }

Node types (initial):

- proveedor
- empresa
- director
- contrato_cluster

Edge types (initial):

- INCLUYE_EMPRESA
- TIENE_DIRECTOR
- COMPARTE_DIRECTOR
- RELACIONA_CONTRATOS

## Performance and Safety Rules

- Never send full graph to the browser.
- First paint target: 150 to 500 nodes max.
- Cache server-side snapshot (short TTL, for example 60 to 300 seconds).
- Include truncation metadata and deterministic sampling strategy.
- Add rate limiting and payload size cap.
- Define sensitive-data policy for director nodes in public landing.

## UX Direction (neural-like)

- Immersive dark-atmosphere or low-light editorial canvas.
- Slow floating drift + subtle force interactions.
- Depth cues: blur, glow, parallax layers, line energy pulses.
- Progressive reveal from high-level clusters to details on hover/click.
- Accessible controls: pause animation, reduced-motion support, keyboard focus states.

## Fallback Strategy

If graph is unavailable:

- Show curated static graph sample from last successful snapshot.
- Keep primary CTA and analysis flow functional.
- Display non-blocking status banner for graph freshness.

## Definition of Done for frontend phase

- Landing uses real graph data from backend endpoint.
- P95 payload and render remain within acceptable limits.
- Neo4j downtime does not break landing.
- Snapshot source and timestamp are visible for auditability.
- Mobile and desktop behavior are both validated.

## Graph-First Launch Gate (mandatory for first publish)

- First public release is blocked unless landing shows a real Neo4j-backed graph.
- Demo or mocked graph is not acceptable as primary hero state.
- Landing must load a production snapshot with real nodes and edges from current data.
- Graph must be visually compelling on first paint and still readable in reduced-motion mode.

First publish checklist:

1. Backend endpoint returns real graph payload from Neo4j in production.
2. Payload includes at least two relation families (for example empresa-director and proveedor-empresa).
3. Landing renders graph successfully with no manual data file swap.
4. Fallback only activates on outage, not as default path.
5. A screenshot and run log are attached as launch evidence.

## Dependencies before starting this plan

- Data model and ingestion pipeline finalized (current top priority).
- Stable entity identity strategy (dedup across providers/companies/directors).
- Clear freshness policy for graph updates.
- Production Neo4j availability and secret management in CI/CD.

## Suggested implementation sequence (when resumed)

1. Backend: graph snapshot query + endpoint + cache.
2. Backend: observability and guardrails (size, timeout, rate limits).
3. Frontend: graph renderer integration in Landing with fallback.
4. Frontend: interaction polish and accessibility pass.
5. QA: performance test + data integrity checks.

## Explicit decision log

- Decision: postpone frontend graph implementation until data management is polished.
- Reason: reduce rework and ensure trustworthy graph semantics before high-visibility UI.
- Decision: keep product direction graph-first for first public publish.
- Reason: the app value proposition is relation intelligence and must be visible from the first visit.
