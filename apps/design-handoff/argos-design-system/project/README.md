# ARGOS — Design System

**ARGOS** is an open-source civic intelligence platform for analyzing public procurement, budgets, authorities, laws, and relationship networks in **Córdoba, Argentina**. It turns public data into verifiable dossiers, interactive graph views, anomaly alerts, and exportable investigation reports for journalists, researchers, and citizens.

The product is intentionally **institutional, not activist** — a serious research tool, closer to Bloomberg Terminal / OpenCorporates / Aleph than to a newsroom landing page. Density over decoration. Provenance over persuasion.

> Internal codename: **La Bestia**. Public-facing name: **ARGOS**.

---

## Sources consulted

All context below was pulled from the resources the user attached to this project. Nothing was inferred from the open web.

| Source | What it is | Where |
|---|---|---|
| `argentina-transparente/` (mounted) | Monorepo — backend (Node/TS/Express), investigator workspace (`apps/board`), public reports (Evidence.dev), legacy frontend (`frontend/`) | local file system |
| `frontend/` (mounted) | Lovable-generated React/Vite/shadcn frontend — "La Bestia" public-facing analyzer. Currently the deployed user-entry surface | local file system |
| `OsoCordobes/argentina-transparente` | GitHub mirror of the monorepo (not re-fetched — local copy is authoritative) | GitHub |
| `argentina-transparente/CLAUDE.md` | Canonical product/architecture doc — signal definitions, data sources, deployment URLs | local |
| `argentina-transparente/frontend/src/index.css` | Token definitions (unused violet theme — left over from Lovable scaffolding) | local |
| `argentina-transparente/apps/board/src/**` | Real, in-development investigator UI — React Flow graph, timeline, AI chat, node inspector. **This is the direction of the product.** | local |

### Deployed URLs (from `CLAUDE.md`)
- Frontend: `https://victorious-luck-production-8d3a.up.railway.app`
- Backend API: `https://bestia-backend-...up.railway.app`

---

## Two product surfaces

ARGOS ships as **two distinct surfaces**, both covered by this design system:

### 1. Investigator Workspace (`apps/board`) — PRIMARY
Dense, light, desktop-first. Three-pane layout:
- **Left rail:** entity search drawer (companies, people, contracts)
- **Center:** graph canvas (React Flow) with graph / timeline tabs, plus collapsible AI co-investigator chat
- **Right rail:** node inspector (señales / contratos / notas tabs)

Think: Palantir Gotham, Kumu, Neo4j Bloom, but for public procurement.

### 2. Public Expediente / Report — SECONDARY
Dark, narrow (max-w-3xl), scan-first. Single-column long-form. This is where a journalist or citizen lands when they click "share" on an investigation. The "La Bestia" landing + report today.

The two surfaces are linked by a shared token set (`colors_and_type.css`) and share type, spacing, entity color mapping, and semantic severity colors. They differ only in `--bg` / `--fg` polarity.

### What was removed/replaced
The Lovable-scaffolded `frontend/src/index.css` declared a **violet primary (`#A020F0`) + cream theme** that is **not actually used anywhere** in the rendered pages (which are Tailwind-classes-only using `bg-gray-950`, `bg-blue-600`). We ignored the orphan theme and locked in the tokens the live pages actually render with. Flag to user: confirm you want this decision preserved, or resurrect the violet theme if it represents a future brand direction.

---

## Content Fundamentals

### Language
**Primary:** Spanish (Argentina — `es-AR`). All UI copy, data labels, and error states are in Spanish with Argentine conventions (`ñ`, voseo is **not** used — copy is neutral 3rd person / imperative informal `tú`-style but avoiding explicit pronouns).

- "Buscá una empresa" (imperative, informal — rare)
- "Analizar gasto público" (infinitive — standard)
- "Sin señales detectadas" (passive neutral — standard)

**Currency:** ARS formatted via `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })`. Dates: `toLocaleDateString('es-AR')`.

### Tone
- **Institutional, not activist.** The product name "La Bestia" is evocative, but copy is sober. Compare: "Motor anticorrupción ciudadano" (product tagline) vs. the per-screen copy, which reads like a government portal.
- **Never accusatory.** A signal is a *"señal detectada"*, not an *"acto de corrupción"*. This is enshrined in `CLAUDE.md` §5: _"El sistema debe separar 'señal detectada' de 'interpretación investigativa'."_
- **Evidentiary, not rhetorical.** Every finding cites `fuente`, `monto`, `proveedor`, `periodo`, `jurisdicción`, `método de detección`.
- **No emoji in persistent UI.** A warning triangle `⚠` is used once in the report header for the "guía de denuncia" — that's the outer limit. Emojis in the codebase (`🔍`) exist only as temporary empty-state markers and should be treated as **placeholder-grade**; replace with Lucide icons before shipping.

### Casing
- **Sentence case for everything.** Titles, buttons, section headers — all sentence case. "Resumen ejecutivo", "Señales de riesgo", "Top proveedores por monto". Never Title Case. Never ALL CAPS *except* for severity labels inside badges (`GRAVE`, `ALTO`, `CRÍTICO`) and the all-caps plaintext export headers (`EXPEDIENTE CIUDADANO — SISTEMA ARGOS`).
- **Eyebrow labels are uppercase** with wide tracking: `CONTRATOS ANALIZADOS`, `GASTO TOTAL`. This is the only uppercase UI label pattern.

### Person
- **Third person / imperative.** "Analizar gasto público →", "Buscar entidad", "Agregar al canvas". Avoids "I/you" constructions.
- In AI chat: the assistant says "Soy tu co-investigador IA" — informal `tu`, first person for the AI persona only.

### Vibe examples (verbatim from the codebase)
- Tagline: "Motor anticorrupción ciudadano"
- Product description: "Análisis automatizado de gasto público municipal en Córdoba, Argentina"
- Source attribution: "Datos oficiales del Portal de Datos Abiertos de la Municipalidad de Córdoba"
- Loading states (sequential): "Conectando con el Portal de Datos Abiertos...", "Descargando contratos oficiales...", "Analizando patrones de gasto...", "Calculando señales de riesgo...", "Generando expediente con IA...", "Finalizando reporte..."
- Disclaimer: "Los datos provienen de fuentes oficiales. Documento de carácter informativo."
- Empty states: "Sin señales detectadas para esta entidad.", "Anclá una empresa o persona para ver su línea de tiempo"

### Numbers
Always `es-AR` formatted. Tabular numerals (`font-variant-numeric: tabular-nums`) for any column of numbers. Large amounts rounded to whole ARS (`maximumFractionDigits: 0`). Percentages without decimals unless <1%.

---

## Visual Foundations

### Palette
Institutional and restrained. Two polarities that share the same primary and semantic colors.

**Neutrals:** Cool slate (`slate-50` through `slate-950`). No warm grays. Slate is used because the light workspace needs a slight blue undertone to pair cleanly with the institutional blue primary, and the dark report surface uses slate-950 (`#020617`) for near-black with better color temperature than pure `#000`.

**Primary:** Institutional blue — `#2563eb` (blue-600) as the action color in light surfaces, `#3b82f6` (blue-500) as the accent in dark surfaces. This echoes how government / judiciary / auditor sites in Argentina tend to look (AGN, INDEC, CNV). Not navy, not teal, not purple.

**Semantic signals (severity):**
- `grave` → red-500 family (`#ef4444`)
- `moderada` → amber-500 family (`#f59e0b`)
- `leve` → yellow-400 family (kept dim — leve is informational, not alarming)
- `success` / verified → green-500 family (used sparingly — this is not a "positive" product)

**Entity-type accents** (graph nodes, filter chips, timeline dots):
- Empresa → blue, Persona → emerald, Contrato → amber, Agencia → violet, Ley/Decreto → cyan, Municipio → orange.
  These are chosen for max pairwise contrast in the graph view. See `--ent-*` tokens.

### Typography
**Three families:**
- **Inter** — sans, all UI chrome, labels, data cells, buttons. 400 / 500 / 600 / 700.
- **Source Serif 4** — editorial. Used for display headlines on expedientes and the public report H1, and for long-form `.prose` blocks (resumen ejecutivo). Sparingly — the workspace itself is pure sans.
- **JetBrains Mono** — monospace for CUITs, years, currency in tabular contexts, source URLs.

**Type scale** is tight, biased small (`14px` base) because the workspace is data-dense. See `colors_and_type.css` for the full scale. Tracking is negative on display sizes (`-0.02em`) and wide on uppercase eyebrow labels (`0.08em`).

**Tabular numerals are mandatory** for any numeric column, timeline year, percentage, or amount. `font-variant-numeric: tabular-nums` is baked into `.mono` and `.numeric` utility classes.

### Spacing
4px base. Primary scale: `4 / 8 / 12 / 16 / 20 / 24 / 32 / 40 / 48 / 64`. The investigator workspace uses extremely tight spacing (`h-7` / `text-xs` buttons, `p-2` / `p-3` cards) to maximize information density. Reports breathe more (`space-y-10`, `px-4 py-12`).

### Radii
`6px` as the default UI radius (tokens `--radius`). `12px` for cards (`--radius-lg`). `999px` for pills and severity badges. No sharp corners, no heavily rounded "fintech" shapes.

### Borders
1px solid is the universal border weight. `--border` (gray-200) is the default; `--border-strong` (gray-300) for emphasized dividers. In dark surface, `--dark-border` (gray-800). Node borders in the graph use 2px solid with a subtle tint background (e.g. `bg-blue-50 border-blue-300`) — this is the **only** 2px border pattern.

### Shadows
Very restrained. Cards use `shadow-xs` or none (flat + border is the default). `shadow-sm` on hover. `shadow-lg` reserved for drawers, popovers, modal dialogs. No colored shadows, no glow effects, no neomorphism.

### Backgrounds
- **No gradient backgrounds.** The one gradient stat card in the unused Lovable theme is discarded.
- **No full-bleed hero imagery.** The public expediente is pure dark surface with inline data.
- **No textures, patterns, or illustrations.** ARGOS is a data tool.
- React Flow graph uses a fine dot grid (`<Background gap={16} />`) — that's the only "pattern" in the system.

### Animation
Spare and functional.
- `fade-in 0.3s ease-out` — new panels / loaded data
- `slide-in-right 0.3s ease-out` — drawers, inspector
- `pulse-subtle 2s ease-in-out infinite` — loading skeletons
- `accordion-down/up 0.2s ease-out` — expanding signal cards
- Transitions on colors/shadows: `150ms` to `200ms`.
- **No bounces, no spring, no parallax.** Easing is `ease-out` or `ease-in-out`.

### States
- **Hover** on interactive rows/buttons: background darkens to `--bg-muted` or primary fills (`bg-primary/90`). Text color never changes on hover. Opacity changes are reserved for icons only (`opacity-0 group-hover:opacity-100` for the pin icon, the one exception).
- **Press / active:** 1 level darker than hover; no scale transform.
- **Focus:** `box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.25)` — 3px blue ring. Always visible, never removed.
- **Disabled:** `opacity: 0.5` + `cursor: not-allowed`. No greyed-out variants — dim the whole element.

### Transparency & blur
Used only for sticky headers inside scrolling timelines: `bg-background/95 backdrop-blur`. Nowhere else. Badges and cards are solid.

### Cards
The canonical card: `rounded-lg border bg-card p-4/p-6` — 1px border, no shadow, no gradient. Dense variants use `p-2.5` with `text-xs`. On the dark expediente surface: `bg-gray-900 border-gray-800 rounded-xl`. Severity-colored cards get a faint tinted bg (e.g. `border-red-800 bg-red-950/20`) — the tint is always `/20` opacity so the card still looks neutral at scan distance.

### Data-dense layout rules
- **Tables** over styled lists anytime the data has ≥3 columns. Header row is `text-[10px] uppercase tracking-wider text-muted-foreground` with a bottom border. No vertical rules. Numeric cells right-aligned, text cells left-aligned, tabular-nums.
- **Badges** for anything categorical (tipología, severidad, tipo de proceso, CUIT state).
- **Sticky headers** for long scrolls (timeline year headers).
- Minimum touch target on the board toolbar is `h-7` (28px) — smaller than mobile-safe but acceptable for desktop-first investigator tools.

### Layout chrome
- Left rail: `w-64` (256px)
- Right rail (inspector): `w-80` (320px)
- AI chat panel: `h-80` bottom drawer (320px)
- Top toolbar: `h-10` (40px)
- Everything else is fluid.

### Iconography
Lucide — see `ICONOGRAPHY.md` / §below.

---

## Iconography

**Library:** [Lucide](https://lucide.dev) React (`lucide-react`), used everywhere in `apps/board`. 1.5px stroke, 24px grid, rounded joins. Sizing: `h-3 w-3` for inline-text icons, `h-3.5 w-3.5` for buttons / nav, `h-4 w-4` for standalone controls, `h-6 w-6` for empty states.

Icons are **always monochrome** — color is applied via `text-muted-foreground` / `text-primary` / `text-destructive` / `text-amber-500`. Never filled with a brand color.

**Canonical icon usage** (pulled directly from the codebase):
- `Search` — search inputs
- `Building2` — Empresa / company
- `User` — Persona / individual
- `FileText` — Contrato / document / law
- `Network` — graph view
- `Clock` — timeline view
- `Bot` — AI co-investigator
- `Pin` — pinning entities to the canvas
- `ExternalLink` — source / fuente links
- `AlertTriangle` — señal / hallazgo
- `X` — close / dismiss
- `Send` / `Loader2` — chat input
- `Calendar` — year headers
- `ChevronDown` / `ChevronUp` — expandable cards

**Delivery:** Lucide is installed via npm in the real product. In this design system, we reference Lucide via `https://unpkg.com/lucide@latest/dist/umd/lucide.min.js` for the static HTML previews and UI kit. If you are building inside the product's Vite tree, use `import { Icon } from 'lucide-react'` directly.

**Emojis:** Strictly forbidden in persistent UI. The `🔍` in the current empty-state placeholder in `BoardPage.tsx` is a known TODO — replace with `<Search />` at 32px.

**Unicode glyphs as icons:** Allowed narrowly — arrow `→`, em dash `—`, middle dot `·` — used in inline copy. Never as a replacement for an icon that Lucide has.

**Logos / brand marks:** An original ARGOS wordmark + symbol was designed for this system (user asked for one from scratch). See `assets/argos-mark.svg`, `assets/argos-mark-sm.svg`, `assets/argos-lockup.svg`.

- **Concept.** The mark is a **three-node graph** — the literal data structure ARGOS operates on. Two open (outlined) nodes sit on top connected horizontally, both pointing down to a filled blue node representing the verified finding / synthesized record. Product-native, modern, unambiguous.
- **Wordmark.** Inter Bold, uppercase, `letter-spacing: 0.22em` at large sizes (`0.24em` at small). Institutional, sans-serif, no serif gravitas — pairs naturally with the graph mark.
- **Construction.** 52×52 grid. Lines and outer node strokes at 1.5px (2px at small sizes for optical correction). `currentColor` on every stroke — mark inherits surface color. The filled bottom node is the only element that carries brand blue (`#2563eb` on light, `#60a5fa` on dark).
- **Clearspace.** Minimum of one "bottom-node-diameter" (≈11px at 52px size) of empty space around the mark.
- **Minimum sizes.** Mark 16px; lockup 80px wide. Below that, use `argos-mark-sm.svg` (heavier 2px strokes) — optically corrected for small rendering.
- **Do.** Use on solid surfaces (white / `slate-950`); use in monochrome when the context already carries brand color (e.g. a blue CTA block). The outer nodes should always read as open/outlined.
- **Don't.** No gradients. No filling the outer nodes. No rotating the triangle. Never combine with other marks in a lockup without the vertical divider (see `argos-lockup.svg`). Do not add arrows to the edges — the relationship is implied.

---

## Index (file manifest)

```
README.md                    you are here
SKILL.md                     Claude-Code-compatible skill descriptor
colors_and_type.css          root CSS — tokens, type scale, utility classes

assets/                      logos, icons, bitmap assets
  argos-mark.svg             primary eye/aperture mark (52px grid, 1.25–1.5 stroke)
  argos-mark-sm.svg          optically-corrected small variant (16–32px use)
  argos-lockup.svg           horizontal lockup: mark · divider · wordmark
  favicon.ico                current favicon (copied from frontend)
  placeholder.svg            generic placeholder (copied from frontend)

fonts/                       (empty — all fonts loaded via Google Fonts CDN.
                             Flagged: see CAVEATS.)

preview/                     Design System tab cards (registered as assets)
  colors-*.html              color palette cards
  type-*.html                typography specimens
  spacing-*.html             spacing, radii, shadow tokens
  components-*.html          buttons, inputs, badges, cards
  brand-*.html               logo, icon usage, data viz

ui_kits/
  investigator/              PRIMARY — Board workspace UI kit
    README.md
    index.html               interactive click-thru prototype
    *.jsx                    components (Sidebar, Toolbar, EntityNode, …)
  public-report/             SECONDARY — public expediente UI kit
    README.md
    index.html               interactive expediente
    *.jsx
```

---

## Using this system

- **Inside the real product code:** Tokens are already wired through `tailwind.config.ts` via CSS custom properties. Use Tailwind utility classes (`bg-background`, `text-muted-foreground`, `border-border`).
- **Building a new HTML mockup or prototype:** Include `colors_and_type.css` at the top of your `<head>`. Use the semantic CSS variables (`var(--primary)`, `var(--fg-muted)`) and the type classes (`.h2`, `.eyebrow`, `.mono`).
- **Need a new screen mock?** Start from `ui_kits/investigator/index.html` — it's a pixel-faithful recreation of the real Board layout with mock data, and all components are factored into reusable `.jsx` files.

---

## CAVEATS / open questions for the user

- **Fonts are CDN-loaded.** No TTF/WOFF files are included in `fonts/`. If you need offline rendering or a locked snapshot of the face, provide the font files and I'll swap to local `@font-face`.
- **The Lovable-scaffolded violet-primary theme in `frontend/src/index.css` is orphan code** — not used by any rendered page. I ignored it. Confirm you're OK with that.
- **Logo/brand mark is an original design** (user approved designing from scratch). It's an aperture/iris referencing *Argos Panoptes* + a Source Serif 4 small-caps wordmark. If you want a more abstract / geometric / typographic direction instead, flag it and I'll iterate.
- **Legacy `/frontend` (the "La Bestia" dark single-pager) and the future `apps/board` (investigator workspace) have diverged visually.** I treated the investigator workspace as canonical (per the brief: "investigative operating system, not a generic analytics dashboard") and the expediente/report as a secondary public surface. If the deployed frontend should still be primary, tell me.
- **No real icons from the codebase were copied** because Lucide is consumed as an npm package, not as SVG files on disk. CDN reference is fine for previews; the real product imports from `lucide-react`. No substitution needed.
