# ARGOS · Prototype → Backend Handoff

> **Audience**: the engineer (you, Claude Code, or a human) wiring the FastAPI + PostgreSQL + Celery backend behind this prototype.
> This document describes the **contracts** that the React prototype assumes. Match them on the backend and the UI should work unchanged.

---

## 1 · Project shape

```
/prototype           ← the design prototype (this folder)
/backend             ← to build (FastAPI + SQLAlchemy + Alembic + Celery)
/workers             ← to build (OCR + scrapers + AI enrichment jobs)
/infra               ← to build (docker-compose, GitHub Actions, Fly.io / VPS)
```

The prototype is **presentational only**. All state lives in React. Persistence, auth, collaboration, and AI calls must come from the backend.

---

## 2 · Core data model

These are the shapes the prototype hands around. Mirror them as Pydantic models + SQLAlchemy tables.

### Entity
A node in the graph (company, person, contract, agency, municipality, donation).

```ts
{
  id: string,                     // "e1", or nanoid in prod
  type: 'Empresa' | 'Persona' | 'Contrato' | 'Agencia' | 'Municipio' | 'Donacion',
  label: string,                  // "TECNOSERV SA"
  sub?: string,                   // "CUIT 30-12345678-9" or role
  desc?: string,                  // short natural-language description

  // Scoring (computed server-side on ingest)
  trust: number,                  // 0–100 (source quality / verification)
  signals_count?: number,

  // Per-type fields (all optional)
  amount?: number,                // Contrato · in ARS
  year?: number,                  // Contrato · adjudication year
  tipo?: string,                  // Contrato · 'directa' | 'licitación pública' | ...

  // Provenance (required for every field except label)
  provenance?: {
    source_name: string,          // "Portal de Datos Abiertos · Córdoba"
    source_url?: string,
    scraped_at: string,           // ISO datetime
    doc_sha256?: string,          // hash of the underlying document snapshot
  }
}
```

### Edge
A relationship between two entities.

```ts
{
  id: string,
  from: string,       // entity id
  to: string,
  label: string,      // "director" | "adjudica" | "titular" | "aporta" | "socio" | ...
  since?: string,     // optional ISO date
  until?: string,     // optional ISO date (for ended roles)
  strength?: number,  // 0–1 (confidence / frequency)
  provenance: { ... }
}
```

### Signal
An automatically-detected red flag attached to an entity.

```ts
{
  id: string,
  subject: string,                // entity id
  kind: string,                   // 'supplier_concentration' | 'split_tendering' | 'pre_electoral_spike' | 'name_similarity' | 'shared_director' | ...
  title: string,                  // "Concentración de proveedor"
  desc: string,                   // plain-language explanation
  severity: 'grave' | 'moderada' | 'leve',
  score: number,                  // 0–100 (how confident / how bad)
  detected_at: string,            // ISO datetime
  evidence: { ... }               // kind-specific, e.g. { pct: 0.74, window_years: 2 }
}
```

### Caso (investigation / case)
A user-owned workspace pulling together entities, signals, files, notes.

```ts
{
  id: string,
  title: string,
  author_id: string,
  created_at: string,
  updated_at: string,
  status: 'activo' | 'archivado' | 'publicado',

  pinned_entity_ids: string[],
  pinned_signal_ids: string[],
  archivos: File[],
  notas: Note[],
  dossier_drafts: { forense?, periodistico?, denuncia? },  // editor state per mode
}
```

### File (uploaded evidence)
```ts
{
  id: string,
  caso_id: string,
  filename: string,
  size: number,                   // bytes
  mime_type: string,
  sha256: string,                 // ← required; dedupe + chain of custody
  ocr_status: 'pending' | 'done' | 'failed',
  ocr_text?: string,              // extracted text (populated when done)
  uploaded_at: string,
  uploader_id: string,
}
```

### Note
```ts
{
  id: string,
  caso_id: string,
  texto: string,
  anclada_a?: string,             // entity id it's pinned to (optional)
  created_at: string,
  author_id: string,
}
```

---

## 3 · REST API surface (minimum)

Auth via `Authorization: Bearer <jwt>` on every route except `/api/auth/*`. JWT payload: `{ user_id, email, tier: 'free' | 'pro' }`.

### Graph
| Method | Path | Purpose |
|---|---|---|
| GET | `/api/caso/:id/graph` | Returns `{ entities, edges, signals }` for the case — everything needed to render grafo/corkboard/radial. |
| GET | `/api/entity/:id` | Full entity detail (used by Inspector). |
| GET | `/api/entity/:id/signals` | All signals attached to this entity. |

### Casos
| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/casos` | List the user's cases (for the "Tableros" view). |
| POST | `/api/casos` | `{ title }` → create. |
| GET  | `/api/caso/:id` | Case detail (pinned entities, signals, files, notes). |
| PATCH | `/api/caso/:id` | Partial update (title, pinned_*). |
| POST | `/api/caso/:id/pin_entity`   | `{ entity_id }` |
| POST | `/api/caso/:id/unpin_entity` | `{ entity_id }` |
| POST | `/api/caso/:id/pin_signal`   | `{ signal_id }` |
| POST | `/api/caso/:id/unpin_signal` | `{ signal_id }` |

### Files
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/caso/:id/files`   | `multipart/form-data` upload. Returns `File` with `ocr_status='pending'`. Kick off OCR worker. |
| GET  | `/api/file/:id`         | Metadata + OCR text if ready. |
| DEL  | `/api/file/:id`         | Remove. |

### Notes
| Method | Path | Purpose |
|---|---|---|
| POST  | `/api/caso/:id/notes` | `{ texto, anclada_a? }` → create. |
| PATCH | `/api/note/:id`       | Update. |
| DEL   | `/api/note/:id`       | Delete. |

### AI
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/ai/suggestions` | `{ caso_id }` → returns `Suggestion[]`. The AI sidebar chips. **Idempotent; cache-friendly.** |
| POST | `/api/ai/rewrite`     | `{ caso_id, block_id, mode, instruction }` → returns `{ body: string }`. Used by Dossier inline rewrite. |
| POST | `/api/ai/chat`        | Streaming SSE. `{ caso_id, messages }` — the co-investigator chat. Must include case context automatically; server-side retrieval + grounding. |

### Dossier
| Method | Path | Purpose |
|---|---|---|
| POST | `/api/dossier/:caso_id/render` | `{ modo: 'forense'|'periodistico'|'denuncia' }` → first-draft blocks. |
| POST | `/api/dossier/:caso_id/export` | `{ modo, format: 'pdf'|'docx'|'md'|'zip' }` → signed download URL. |

### Alerts
| Method | Path | Purpose |
|---|---|---|
| GET  | `/api/alerts`           | User's alerts feed (paginated, filtered). |
| POST | `/api/alerts/rules`     | Create a monitoring rule. |
| POST | `/api/alerts/:id/dismiss` | Dismiss. |

### Feedback (prioritised · UX-critical)
Creates a GitHub Issue in the product repo. Keep it dead simple.

| Method | Path |
|---|---|
| POST | `/api/feedback` |

Payload:
```ts
{
  kind: 'idea' | 'bug' | 'data',
  mensaje: string,
  route: string,           // e.g. "caso/pavimentacion-s271/tabla"
  caso_id?: string,
  user_email: string,      // from JWT
  user_agent: string,
}
```
Server action: `POST https://api.github.com/repos/ORG/REPO/issues` with title `[${kind}] ${first 60 chars}`, body = message + context block.

### Suggestion shape (returned by `/api/ai/suggestions`)
```ts
{
  id: string,
  kind: 'signal' | 'connection' | 'anomaly',
  title: string,
  desc: string,
  severity?: 'grave' | 'moderada' | 'leve',
  actions: Array<{
    label: string,
    target_entity_id?: string,   // if present, FE navigates + pins
    target_signal_id?: string,
  }>
}
```

---

## 4 · Signal detection rules (v1)

Implement as Celery tasks triggered on entity/edge/contract ingest. Each rule produces `Signal` rows.

| kind | Rule |
|---|---|
| `supplier_concentration` | `sum(contract.amount by supplier) / sum(contract.amount by agency) > 0.60` over trailing 24 months → severity from pct. |
| `split_tendering` | ≥3 contracts to same supplier from same agency within 90 days, each below the legal bidding threshold. |
| `pre_electoral_spike` | Any contract signed within 30 days of an election date where supplier also made a campaign donation to the winning list in the previous cycle. |
| `shared_director` | Two+ suppliers with the same director, where both received contracts from the same agency in the same year. |
| `name_similarity` | New supplier whose name has Levenshtein distance ≤ 2 from an existing flagged supplier (shell-company heuristic). |

Each rule writes a `Signal` row AND an `alerts_feed` row if `severity >= moderada`.

---

## 5 · Ingest sources (Córdoba Capital · v1)

Scrapers run nightly (Celery beat). Store raw snapshot in S3/MinIO, write rows from normalised extract.

1. **Portal de Datos Abiertos · Municipalidad de Córdoba** — contratos, proveedores, obras.
2. **Cámara Nacional Electoral** — aportes de campaña.
3. **Inspección General de Justicia (IGJ)** — registros societarios.
4. **Boletín Oficial Municipal** — decretos, adjudicaciones.

Every row written must carry `provenance.doc_sha256` pointing at the MinIO snapshot. **No provenance → reject the row.**

---

## 6 · Auth / tiers

- Magic-link email auth (fastapi-users or similar).
- Two tiers: `free` (manual research only) and `pro` (agent runs, longer history, more alerts). The prototype reads `state.isPremium`; backend JWT's `tier` drives it.
- Admin-set tier for now (no Stripe yet).

---

## 7 · What the prototype does **not** need you to implement

- Realtime (Yjs / websockets) — single-user edits for v1 are fine.
- SSO / orgs — solo-investigator first, shareable read-only links v1.1.
- Custom rule DSL — hardcoded rules v1, UI-editable v2.

---

## 8 · Operational targets

- Ingest latency: new contract visible in graph within **15 min** of portal publishing.
- Signal detection: runs within **5 min** of ingest.
- AI chat p50: **<3 s** first-token; streaming.
- Uptime target: 99.5 % (single-node Fly machine is fine for beta).

---

## 9 · Quick-start for Claude Code

```bash
# from repo root
git worktree add ../argos-backend -b backend
cd ../argos-backend
claude-code "Scaffold a FastAPI + SQLAlchemy + Celery project in /backend that implements /prototype/HANDOFF.md exactly. Use PostgreSQL, Redis, MinIO. Start with the Entity/Edge/Signal/Caso/File/Note models and the GET /api/caso/:id/graph endpoint. Seed with /prototype/data.jsx converted to a SQL fixture."
```

Then run the prototype against the backend by swapping the hardcoded `data.jsx` imports for `fetch('/api/caso/...')`.

---

## 10 · Open questions (for María Clara + team)

- [ ] Which agency source is canonical when Portal de Datos and Boletín disagree?
- [ ] Donation disclosure — file directly from CNE scraper or require manual upload for non-disclosed periods?
- [ ] Export format priorities: PDF first? DOCX first?
- [ ] Agent autonomy ceiling — should agents write to the graph, or only propose?
- [ ] Retention: how long do we keep a user's raw uploads after case close?

---

**Last updated**: generated alongside the prototype. Keep in sync by editing this doc whenever a contract changes in the React code.
