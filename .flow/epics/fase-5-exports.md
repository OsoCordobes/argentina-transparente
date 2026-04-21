# Epic: Fase 5 — Exports + Publicación

**Status:** open
**Priority:** P4 (depends on Fase 4 Investigation Board)

## Context

Once an investigation is complete, journalists need to export it in multiple formats:
1. PDF periodístico: narrative + embedded graph + timeline + citations
2. Denuncia judicial: legal template (art. 177 CPPN / art. 73 CPP Córdoba)
3. Dataset: JSON/CSV with full evidence trail
4. Public report: push to Evidence.dev `apps/reports/`

## Tasks

### Task 1: PDF export (puppeteer)
**File:** `apps/api/src/exporters/pdf.ts`

Puppeteer headless browser renders a dedicated `/export/:caseId/pdf-preview` React page and exports to PDF.
The PDF must include:
- Cover: caso name, fecha, investigador
- Executive summary (from AI or manual)
- Graph image (React Flow → screenshot)
- Timeline
- Signal list with severities and legal articles
- Evidence vault (all citations with URLs + fetch dates + SHA-256 hashes)
- Footer: "Generado por ARGOS v3 — indicios razonables, no conclusiones"

### Task 2: Denuncia judicial
**File:** `apps/api/src/exporters/denuncia.ts`

Template-based export using legal structure:
```
DENUNCIA PENAL
Ante: [Fiscalía de Instrucción / UIF]
Carátula: "Hechos que podrían configurar [Art. 265 CP / Ley 25.188 Art. X]"
...
HECHOS: [structured narrative from signals]
PRUEBA DOCUMENTAL: [evidence vault citations]
SOLICITA: inicio de investigación penal
```

Fill template from case data. Output: .docx via docxtemplater or .pdf via puppeteer.

### Task 3: Dataset export
**File:** `apps/api/src/exporters/dataset.ts`

`POST /api/export/:caseId/dataset` → zip file containing:
- `entities.json` — all pinned entities
- `signals.json` — all Hallazgo[] for the case
- `evidence.json` — full evidence vault
- `snapshots/` — copies of all referenced snapshot files
- `README.md` — methodology explanation

### Task 4: Evidence.dev publish
**File:** `apps/api/src/exporters/publish.ts`

"Publicar" button in the board triggers `POST /api/export/:caseId/publish`:
- Generates a new Evidence.dev report in `apps/reports/pages/casos/{caso_slug}.md`
- Commits automatically (or prompts user)
- Triggers Railway deploy if configured

### Task 5: Tests
- PDF: output has non-zero bytes and contains citation text
- Denuncia: template fills all required fields
- Dataset: zip contains all 4 files
- Publish: generates valid .md file with correct frontmatter

## Acceptance Criteria

- [ ] PDF export produces a readable multi-page document with citations
- [ ] Denuncia template is legally coherent (reviewed by user)
- [ ] Dataset zip contains all evidence
- [ ] "Publicar" generates an Evidence.dev page
