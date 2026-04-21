# ARGOS — Handoff: Design → Backend (Claude Code)

**From:** Design lead (frontend prototype in `prototype/`)
**To:** Claude Code agent working on `apps/api`
**Purpose:** Keep our work ortogonal so your Fase A backend + my new frontend integrate cleanly.

This document is the **API contract + conventions** the frontend assumes. If any of this doesn't fit your backend plan, tell me and I'll adapt — but please don't deviate silently.

---

## 1 · What I am building (and why)

I took the v4 plan's **5-views model** (Graph + Timeline + Map + Table + Dossier) and the **Pistas sidebar + AI sidebar** workspace layout. The prototype lives in `prototype/ARGOS Investigator App.html` and is progressing toward a faithful Fase A UI.

I **rejected** some things for good reasons:
- No `apps/workspace` rename yet — stays `apps/board` until UI is stable.
- No cinematic "Pizarra" toggle as a separate grafo mode — the Corkboard concept already covers that. It's a *view*, not a *toggle*.
- Feedback v1 is text-only (no auto-screenshot capture).
- Dossier inline-rewrite UI is a client-side thing that calls `/api/ai` (existing). No new endpoint needed for that.

---

## 2 · Shape contracts (what the frontend expects back)

### Caso (the investigation)

```ts
type Caso = {
  id: string;              // uuid
  titulo: string;
  descripcion?: string;
  owner_email: string;
  created_at: string;      // ISO
  updated_at: string;
  state_json: CasoState;   // see below — you just round-trip this blob, don't parse
};

type CasoState = {
  pinnedEntityIds: string[];
  pinnedSignalIds: string[];
  graphLayout?: Record<string, { x: number; y: number }>;
  notes: CasoNota[];        // embedded, not separate table — see §3
  timelineRange?: [string, string];  // ISO dates
};
```

**Rationale for embedding notes in `state_json`:** the plan proposes a separate `caso_notas` table. I think that's fine *for your backend*, but from the frontend's perspective it's simpler if `GET /api/casos/:id` returns `{ caso: { ..., state_json: {...includes notes} } }`. If you want a separate endpoint, add it — but also include notes in the main GET response. One round-trip on load.

### Archivo

```ts
type Archivo = {
  id: string;
  caso_id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  sha256: string;           // for chain-of-custody display
  uploaded_at: string;
  uploaded_by: string;
  ocr_status: 'pending' | 'done' | 'failed';
  ocr_text?: string;        // only on ocr_status='done'
  ocr_error?: string;
};
```

**Frontend UX:** we show `ocr_status` as a pill on each file. On `pending`, we poll `GET /api/archivos/:id/ocr` every 4s until it flips. Please make that endpoint cheap (ETag or 304 welcome).

### Señal (unchanged from existing signal engine, but frontend wants this attached to case responses)

```ts
type Signal = {
  id: string;
  severity: 'grave' | 'moderada' | 'leve';
  score: number;        // 0–100
  tipologia: string;
  title: string;
  subject: string;      // entityId
  desc: string;
  evidence: string[];
  source: string;
  norma: string;
  date: string;
};
```

### Dossier render response

```ts
// POST /api/dossier/:caso_id/render  body: { modo: 'forense'|'periodistico'|'denuncia' }
type DossierResponse = {
  markdown: string;
  usage: { input_tokens: number; output_tokens: number; cache_read_input_tokens: number };
  stop_reason: string;
  sources: Array<{ label: string; url: string; sha256?: string }>;
};
```

**Why `sources` in the response:** the frontend renders a "Fuentes y cadena de custodia" section that lists every source URL and its hash. Without this, I have to reconstruct it from state_json. Please include it.

---

## 3 · Endpoint conventions (small asks)

1. **Always return JSON with a top-level key.** Don't return bare arrays. Good: `{ casos: [...] }`. Bad: `[...]`. Easier to extend without breaking clients.

2. **PATCH merges, doesn't replace.** `PATCH /api/casos/:id` with `{ state_json: {...partial} }` should deep-merge, not overwrite. If you'd rather have explicit `PUT` semantics, give me a separate `POST /api/casos/:id/state/merge` endpoint.

3. **404 on soft-deleted.** Soft-deleted casos should behave like they don't exist to the frontend. Don't return them in `GET /api/casos`, and return 404 on `GET /api/casos/:deletedId`.

4. **Error shape:** `{ error: { code: string, message: string, details?: object } }`. HTTP status code is the source of truth; the body is for display.

5. **Auth placeholder:** I'll send `X-User-Email` header in dev as you specified. When Clerk lands, we both switch.

---

## 4 · What I need from you that isn't in your plan

### 4.1 · Entity search
The Pistas sidebar needs a fast entity search. Right now I'm reading mock data. Please expose:
```
GET /api/entities/search?q=tecnoserv&types=Empresa,Persona&limit=20
→ { entities: [{ id, type, label, cuit?, subtitle? }] }
```
This should hit Neo4j/DuckDB indexes, not scan.

### 4.2 · Entity detail (for Inspector)
```
GET /api/entities/:id
→ { entity, signals: Signal[], contracts: Contract[], relations: Edge[] }
```
Used when user clicks a pinned entity in the sidebar.

### 4.3 · Suggestion hook (for passive AI chips)
The "sugerencias pasivas" panel calls a single endpoint that returns 3–5 insights based on current pinned entities:
```
POST /api/ai/suggestions  body: { caso_id, pinned_entity_ids: string[] }
→ { suggestions: [{ id, kind: 'connection'|'signal'|'anomaly', severity?, title, desc, actions: [{ label, target_entity_id? }] }] }
```
Use Haiku, cache aggressively. Frontend debounces 2s after pin changes.

---

## 5 · What you can IGNORE from my frontend for now

- CSS / styling files in `prototype/` — pure client concern
- The `prototype/` directory itself — that's a canvas, not the real app
- Mock data in `prototype/data.jsx` — gets replaced by your endpoints
- Any file under `apps/board/src/`  — I'm not touching it in this sprint either (out of respect for your v4 plan)

---

## 6 · Merge strategy

Your `feat/phase-a-backend` branch and my `feat/phase-a-ui` branch should merge cleanly because:
- You touch `apps/api/**`, `packages/{model,ingestion}/**` only
- I touch `prototype/**` only
- Neither of us touches `apps/board/**` yet

When both branches are green, **I'll rebase mine onto yours** (not the other way around — your backend is foundation) and then we port the prototype into `apps/board` replacing the current BoardPage in a single focused PR.

---

## 7 · Open questions (your call)

1. **File storage location**: local disk via `SNAPSHOTS_DIR` is fine for MVP. When we go to R2, do I need to change anything? (I hope: no — `GET /api/archivos/:id` still streams the binary, storage is opaque.)
2. **Dossier streaming**: do you want to stream the markdown via SSE, or batch-return? Frontend can handle either. SSE is better UX but more work — your call.
3. **Notes table**: embedded in `state_json` or separate? I don't care much, just give me a single GET that returns everything.

Ping me in `HANDOFF.md` with edits or a `HANDOFF-REPLY.md`. I'll iterate.

— Design lead
