---
name: argos-design
description: Use this skill to generate well-branded interfaces and assets for ARGOS — an open-source civic intelligence platform for analyzing public procurement, budgets, authorities, and relationship networks in Córdoba, Argentina. Contains essential design guidelines, colors, type, fonts, assets, and UI kit components for prototyping the investigator workspace and the public expediente / report surface.
user-invocable: true
---

# ARGOS design skill

Read `README.md` first — it contains the full content, visual, and iconography fundamentals, plus a file manifest. Then explore the files you need for the task:

- `colors_and_type.css` — every CSS variable, type class, and utility. Include this at the top of any new HTML file.
- `assets/argos-mark.svg`, `argos-mark-sm.svg`, `argos-lockup.svg` — the ARGOS brand mark + wordmark.
- `preview/*.html` — small spec cards (colors, type, spacing, components, brand). Good for grabbing exact values and confirming behavior.
- `ui_kits/investigator/` — pixel-faithful recreation of the investigator workspace (graph + timeline + AI chat + inspector). Read `ui_kits/investigator/README.md` before reusing its components.

## If you're creating a visual artifact (slides, mocks, throwaway prototypes)

1. Copy `colors_and_type.css` and any icons / mark SVGs you need **out** of this skill and into the target project. Never `<link>` across project boundaries.
2. Include `colors_and_type.css` in the new HTML's `<head>` and use the semantic CSS variables (`var(--primary)`, `var(--fg-muted)`) + type classes (`.h2`, `.eyebrow`, `.mono`).
3. For any icons: reference **Lucide** at 1.5 stroke, always monochrome. Use the SVG snippets in `ui_kits/investigator/Icons.jsx` if you want to inline.
4. Language is Spanish (`es-AR`). Sentence case. No emoji. Severity labels `GRAVE / MODERADA / LEVE` are the only ALL-CAPS UI strings.
5. Currency with `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', maximumFractionDigits: 0 })`.

## If you're working on production code (the real `apps/board` monorepo)

- Tokens are already wired through `tailwind.config.ts` via CSS custom properties. Use Tailwind utility classes (`bg-background`, `text-muted-foreground`, `border-border`, `bg-blue-600`, etc.).
- Icons via `import { Search, Building2, User, ... } from 'lucide-react'`.
- Follow the visual foundations in `README.md` §Visual Foundations exactly — especially the "no gradients / no shadow stacks / 2px borders only on nodes" rules.

## If the user invokes this skill with no further guidance

Ask them:
1. What are you building — slide / screen mock / production component / full flow?
2. Which product surface — investigator workspace (light, dense) or public expediente (dark, scan-first)?
3. What data or entity are we centering on?

Then act as an expert ARGOS designer and produce either an HTML artifact or production code, matching the institutional, data-dense, provenance-first tone of the platform.
