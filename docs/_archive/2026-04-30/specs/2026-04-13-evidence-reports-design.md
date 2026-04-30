# Evidence.dev Public Reports — Design Spec
**Date:** 2026-04-13  
**Sprint:** 6 (replaces Sprint 5 GNN — see rationale below)  
**Status:** Approved

---

## Context & Rationale

ARGOS is a personal corruption investigation tool. Sprint 5 (GNN anomaly scoring) was dropped because:
- Landmark case companies (Causa Vialidad, Cuadernos, Skanska, Odebrecht) do not appear in Córdoba Capital procurement data — no overlap for training labels
- The 14 existing rule-based signals already encode the structural patterns from those cases
- A GNN without validated labels is less defensible in legal proceedings than explicit rule-based signals
- September 2026 election deadline makes Evidence.dev higher-impact work right now

**Sprint 6 goal:** Static, auditable, publicly shareable investigation reports readable by journalists and usable as legal exhibits by a lawyer team.

---

## Audience

| Reader | Primary need |
|--------|-------------|
| Journalists | Narrative framing, shareable URLs, quotable summaries |
| Prosecutors / lawyers | Source traceability, legal article citations, formal structure, PDF export |

Reports are written for journalists to quote and structured for lawyers to cite. These are not mutually exclusive — clear writing and rigorous sourcing serve both.

---

## Architecture

### Static site generation
Evidence.dev reads DuckDB directly at build time. No server required to read published reports. Output is plain HTML — prosecutors can save it locally, journalists can share the URL, findings cannot be altered after publication.

```
backend/data/argos.duckdb  ←── single source of truth
         │
         │ symlink at build time
         ▼
reports/sources/argos.duckdb
         │
         │ SQL queries in .md files
         ▼
Evidence.dev build → static HTML
         │
         ▼
Railway static service (public URL)
```

### Repository structure
```
argentina-transparente/
├── backend/
├── frontend/
└── reports/                          ← Evidence.dev project (new)
    ├── sources/
    │   └── argos.duckdb              ← symlink → ../backend/data/argos.duckdb
    ├── pages/
    │   ├── index.md                  ← all investigations
    │   ├── analisis/
    │   │   └── [id].md               ← full expediente per analysis
    │   ├── proveedor/
    │   │   └── [nombre].md           ← provider dossier (cross-analysis)
    │   ├── area/
    │   │   └── [nombre].md           ← government department breakdown
    │   └── red/
    │       └── [municipio].md        ← director network graph
    ├── components/
    │   ├── Disclaimer.html           ← legal disclaimer (on every page)
    │   └── NetworkGraph.html         ← D3.js director network
    └── package.json
```

### Publish workflow
Manual and deliberate. No automatic publishing on analysis.

```bash
# From backend/ directory (where investigator already works):
npm run publish
```

Which runs:
```bash
cd ../reports && npm run build && railway up --service <static-railway-id>
```

**This is intentional.** Automatic publishing creates legal and reputational risk. Every published report is a deliberate act.

---

## Pages

### 1. `/` — Investigation Index

**Purpose:** Quick-scan overview of all published analyses.  
**Primary reader:** Both (journalist scans for leads, lawyer reviews investigation scope)

**Content:**
- Table: municipality | period | # signals | total amount | risk score | publish date
- Sorted by publish date descending
- Each row links to `/analisis/[id]`
- Legal disclaimer above the fold

**SQL:** Query `reportes` table from DuckDB.

---

### 2. `/analisis/[id]` — Full Expediente

**Purpose:** The primary deliverable per investigation. Journalists quote from it; lawyers cite it.  
**Primary reader:** Lawyers (for citation), Journalists (for narrative)

**Content (in order):**
1. Municipality, period, generated date, publish date
2. Legal disclaimer
3. Executive summary (from Claude)
4. Risk signals — each signal rendered as:
   - Title + severity badge (grave / moderada / leve)
   - Summary paragraph
   - Evidence list with source URLs (clickable, links to official government portal)
   - Legal articles cited
   - Reporting bodies (organismos de denuncia)
5. Top providers table — name | total amount | % of budget | signals triggered
6. Government department breakdown — area | total amount | # providers | concentration %
7. Source URLs — all official sources used, with access date
8. **"Descargar PDF"** button — triggers `window.print()` with print stylesheet

**Key constraint:** Every number on this page must trace to a source URL. No unsourced figures.

---

### 3. `/proveedor/[nombre]` — Provider Dossier

**Purpose:** All evidence against one provider across all analyses ever run.  
**Primary reader:** Lawyers (cross-examination, criminal complaint)

**Content:**
- Provider name, CUIT (if available), AFIP status
- Total amount received across all analyses
- Year-by-year contract chart
- Signals this provider appears in (across all analyses, not just one)
- Full contract list: date | area | type | amount | source URL
- Director list (from IGJ, if available)
- Related companies (shares directors with — links to other providers)

**Why this matters:** Chronic actors don't appear in one analysis. This page makes a multi-year, multi-analysis pattern visible in a single exhibit.

---

### 4. `/area/[nombre]` — Department Breakdown

**Purpose:** Identify which government units are awarding suspicious contracts.  
**Primary reader:** Lawyers (points at specific officials for cross-examination)

**Content:**
- Department name, total budget awarded, period covered
- Provider concentration: top 3 providers + % of department budget each received
- Herfindahl index (concentration score) — renders as a gauge
- Signals that fired within this department
- Year-by-year budget chart
- Full contract list for this department

**Why this matters:** Signals identify corrupt contractors. This page identifies corrupt *officials* — the department head who repeatedly awarded to the same provider is the accountability target.

---

### 5. `/red/[municipio]` — Director Network Graph

**Purpose:** Visual exhibit of company-director relationships.  
**Primary reader:** Both (journalist publishes it, lawyer presents it as exhibit)

**Content:**
- D3.js force-directed graph:
  - Nodes: companies (circle, sized by total contract amount) + directors (square)
  - Edges: director → company (works for)
  - Color: companies that triggered signals are red; clean companies are grey
- Below graph: table of shared-director pairs with contract amounts
- Source: IGJ datos.jus.gob.ar (cited)

**Implementation:** Evidence.dev custom HTML component with D3.js (CDN). DuckDB query outputs director-company pairs as JSON. Component renders client-side.

**Why this page is essential:** The network IS the evidence in cartel/collusion cases. A table of names is ignorable. A graph of interconnected companies all feeding from the same government department is not.

---

## Legal Disclaimer Component

Required on every page, above all content:

```
⚠️ AVISO LEGAL

Las señales detectadas por este sistema son indicios estadísticos derivados de 
datos públicos oficiales. No constituyen conclusiones jurídicas ni implican 
responsabilidad penal o civil de ninguna persona o entidad. Toda afirmación 
debe ser verificada de forma independiente antes de su uso en procedimientos 
legales o publicaciones periodísticas.

Fuentes: [links to official portals used]
Método: Análisis automatizado de contrataciones públicas (ARGOS v2.0)
Fecha de publicación: [date]
```

---

## PDF Export

On `/analisis/[id]` only. Implementation:

```html
<button onclick="window.print()">Descargar PDF</button>
```

With a `@media print` stylesheet that:
- Hides navigation, buttons, disclaimer toggle
- Forces black text on white background
- Expands all collapsed sections
- Adds page breaks before each signal
- Includes full source URLs (not just link text)
- Adds footer: "Generado por ARGOS — [date] — argos.railway.app/analisis/[id]"

Zero dependencies. Works offline. Lawyers can print from any browser or save directly to PDF.

---

## Out of Scope

| Feature | Reason excluded |
|---------|----------------|
| Authentication | Public by design — that's the point |
| Search | Not supported by Evidence.dev; index page navigation is sufficient |
| Comments / annotations | Investigation notes stay in private app |
| Automatic rebuild on new analysis | Manual publish is a feature, not a limitation |
| GNN anomaly scores | Sprint 5 dropped — see rationale above |
| Multiple languages | Spanish only — Argentine legal/journalistic context |
| Qdrant entity resolution | Sprint 3 used IGJ instead; sufficient for current scale |

---

## Deployment

**Target:** Railway static service (new service, separate from Express backend)  
**Build command:** `npm run build` (Evidence.dev)  
**Output directory:** `build/`  
**Domain:** Subdomain of existing Railway project or custom domain

**Backend `package.json` addition:**
```json
"publish": "cd ../reports && npm run build && railway up --service <static-id>"
```

---

## Definition of Done

- [ ] `npm run build` in `reports/` produces static HTML with real DuckDB data
- [ ] All 5 pages render with real data from at least one completed analysis
- [ ] Every number on `/analisis/[id]` has a clickable source URL
- [ ] Legal disclaimer present on every page
- [ ] PDF export produces a clean printable document from `/analisis/[id]`
- [ ] Network graph renders director-company relationships on `/red/[municipio]`
- [ ] `npm run publish` from `backend/` deploys to Railway static service
- [ ] Public URL loads without any server (pure static HTML)

---

*Derived from source code audit (PLANNING_REPORT.md) and design session 2026-04-13.*  
*No files were modified during this design session.*
