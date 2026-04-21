# Epic: Fase 3 — AI Co-Investigator

**Status:** open
**Priority:** P2 (depends on Fase 2 signal engine)

## Context

ARGOS v3 uses Claude Sonnet 4.6 as an AI co-investigator. The AI must:
- Know Argentine anti-corruption law (Ley 25.188, CP arts 256-268, etc.)
- Know corruption typologies (TI, FATF, OECD, UNODC)
- Know historical cases as pattern references (Vialidad, Cuadernos, Odebrecht, etc.)
- Be able to search the entity graph via tool calls
- Never hallucinate — every claim must cite a source
- Use prompt caching for the KB system prompt

## Tasks

### Task 1: Knowledge Base corpus
**Directory:** `packages/kb/corpus/`

Create curated markdown files:
- `leyes/ley-25188.md` — Ética en el ejercicio de la función pública (full text, chunked)
- `leyes/ley-27275.md` — Acceso a la información pública
- `leyes/cp-256-268.md` — Código Penal arts 256-268 (cohecho, peculado, negociaciones incompatibles)
- `leyes/ley-13064.md` — Obras públicas
- `tipologias/ti-red-flags.md` — Transparency International red flags for procurement corruption
- `tipologias/fatf-corruption.md` — FATF typologies
- `casos/vialidad.md` — Patrón de corrupción en obra pública (sin datos confidenciales)
- `casos/cuadernos.md` — Patrón de cuadernos/anotaciones
- `casos/odebrecht-argentina.md` — Patrón de sobornos estructurales

### Task 2: Vector store implementation
**File:** `packages/kb/src/vector-store.ts`

Implement `VectorStore` interface using LanceDB (preferred) or chromadb-local.
- `index(docs)`: chunk documents at 512 tokens with 64-token overlap, embed with `text-embedding-3-small`, store
- `search(query, topK=5)`: return top K results with similarity scores

Include setup script: `packages/kb/scripts/index-corpus.ts`

### Task 3: AI tool definitions
**File:** `apps/api/src/ai/tools.ts`

Define Claude tool schemas (JSON schema format for Anthropic SDK):
```
search_entity(name, type?) → { entities: EntitySummary[] }
get_entity_profile(id) → { entity, signals, relaciones, timeline }
search_legal_kb(query) → { results: KBSearchResult[] }
suggest_breadcrumbs(entity_id) → { suggestions: { accion, razon, priority }[] }
validate_hypothesis(text, case_context) → { supported, confidence, cites }
generate_citation(fact, entity_id?, contract_id?) → { citation_text, source_url, snapshot_sha256 }
```

### Task 4: Tool executor
**File:** `apps/api/src/ai/executor.ts`

Map tool names to actual functions. Each function queries DuckDB/Neo4j and returns structured data.
No hallucinations: if data not found, return `{ found: false }`.

### Task 5: System prompt
**File:** `apps/api/src/ai/system-prompt.ts`

Forensic investigator system prompt (in Spanish). Must include:
- Role: investigador forense en corrupción de Argentina
- Constraints: nunca afirmar culpabilidad, solo "indicios razonables"
- Citation requirement: toda afirmación con fuente + fecha + hash de snapshot
- Tool usage guidance
- Legal framework awareness

Mark sections for prompt caching (Anthropic `cache_control: {"type": "ephemeral"}`).

### Task 6: Chat endpoint
**File:** `apps/api/src/routes/ai.ts`

`POST /api/ai/query` — streaming response
- Request: `{ message, case_id?, pinned_entities? }`
- Response: Server-Sent Events stream
- Uses Anthropic SDK with tool_use loop
- Handles up to 5 tool call rounds before forcing text response

### Task 7: Tests
- RAG retrieval: given query about Ley 25.188, top result should be from leyes/ley-25188.md
- Tool mock tests: each tool function with fixture data
- Citation validator: response includes valid source_url + timestamp

## Acceptance Criteria

- [ ] Vector store indexes all corpus files and searches return relevant results
- [ ] All 6 tools implemented and tested with fixtures
- [ ] `/api/ai/query` streams responses with citations
- [ ] System prompt enables prompt caching (verified via API response headers)
- [ ] AI correctly identifies "negociaciones incompatibles" in a test scenario
