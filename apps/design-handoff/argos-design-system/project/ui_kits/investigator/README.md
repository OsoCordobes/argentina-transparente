# Investigator Workspace — UI kit

**Product:** ARGOS · Investigator Workspace (`apps/board` in the source monorepo).
**Audience:** journalists, auditors, civic researchers.
**Stance:** desktop-first, light surface, data-dense, institutional.

This UI kit is a pixel-faithful static recreation of the real Board workspace. It's **not production code** — it's a design-surface mock built on CSS + light React, with mock data, so designers and the AI can compose new screens without rebuilding the whole app.

## Anatomy

```
┌────────────┬──────────────────────────────────────────┬────────────────┐
│ Left rail  │ Toolbar (grafo / timeline / IA)          │ Right rail     │
│ (w-64)     ├──────────────────────────────────────────┤ (w-80)         │
│            │                                          │                │
│ Search +   │ Graph canvas (React-Flow-equivalent)     │ Node inspector │
│ results    │  · dot-grid bg, entity-colored nodes     │  · Señales     │
│            │  · animated edges with relationship lbl  │  · Contratos   │
│            │  · minimap + zoom controls               │  · Notas       │
│            │                                          │                │
│            ├──────────────────────────────────────────┤                │
│            │ AI co-investigator chat (collapsible)    │                │
└────────────┴──────────────────────────────────────────┴────────────────┘
```

All dimensions match the source product: `w-64` left, `w-80` right, `h-10` toolbar, `h-80` chat drawer.

## Files

| File | What it is |
|---|---|
| `index.html` | Entry — full interactive mock. Open this. |
| `investigator.css` | All workspace-specific styles (layered over `../../colors_and_type.css`). |
| `Icons.jsx` | Local Lucide-style monochrome icon set, exposed as `window.Icons`. |
| `MockData.jsx` | Mock entities, graph nodes/edges, signals, contracts, timeline, chat. |
| `EntitySearchDrawer.jsx` | Left-rail search + scrollable results. Pin-on-hover behavior. |
| `Toolbar.jsx` | Grafo / Línea de tiempo / Filtros / Exportar / IA. |
| `GraphCanvas.jsx` | Canvas with dot grid, entity nodes, labeled edges, zoom controls, minimap. |
| `TimelineView.jsx` | Sticky-year grouped event list. |
| `NodeInspector.jsx` | Right-rail drawer — Señales / Contratos / Notas tabs. |
| `AIChatPanel.jsx` | Collapsible AI chat with user + bot messages. |
| `InvestigatorApp.jsx` | Root component — wires state + layout. |

## Interactions (all fake but working)

- Type in the search box to filter entities.
- Click an entity result to pin/unpin (toggles the blue pin icon).
- Click any graph node to select it — right-rail inspector updates.
- Switch **Grafo ↔ Línea de tiempo** in the toolbar.
- Toggle **IA** to open/close the chat drawer; send a message to get a stubbed reply.
- Close the inspector via the × in its header.

## Visual rules followed

- **1.5px Lucide stroke** icons, monochrome only.
- **2px node borders**, entity-tinted backgrounds (`bg-blue-50 border-blue-300`, etc.) — the only 2px border pattern in the system.
- **Sentence case** on every label in Spanish (`es-AR`).
- **Tabular numerals** on every amount and year.
- **Primary blue (#2563eb)** reserved for: primary buttons, node selection ring, logo pupil, chat user bubble, focus rings.

## Known simplifications

- React Flow is simulated with absolute-positioned `<div>` nodes + an SVG edge layer. No drag, no pan, no zoom — the controls are decorative.
- No real API calls. All data is hardcoded in `MockData.jsx`.
- The chat "IA" response is a single canned string — it does not call `window.claude.complete` to keep the kit fully static.

## Using as a design starting point

Copy any `.jsx` component into a new prototype and change the data. The three structural rails (`.rail-l`, `.center`, `.rail-r`) are defined purely in CSS and scale to any laptop-wide viewport.
