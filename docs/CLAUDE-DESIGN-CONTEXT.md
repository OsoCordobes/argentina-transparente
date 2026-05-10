# ARGOS — Context for Claude Design prototypes

> **For AI tools (Claude Design, etc.):** Read this file FIRST before generating any
> prototype. This file replaces the need to re-read the entire codebase per session.
> It contains API contracts, domain vocabulary, and conventions every prototype must
> respect. The Design System provides tokens + components; this file provides the
> *vocabulary and data shapes* the prototypes consume.

## Locale & formatting (es-AR)

- All UI copy in Spanish (es-AR). No English in user-facing strings.
- Money: `Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' })` → "$240.000.000"
- Money compact: `notation: 'compact'` → "$240 M"
- Dates: `dd/MM/yyyy` display, ISO 8601 storage
- Use `<MoneyValue>` from DS for any monetary value
- Use `<IdentityBadge>` for CUITs/DNIs. CUIT format: `30-71234567-1`. DNI format: `22.345.678`

## Identity tiers (`<TierBadge>` from DS)

- T1 — CUIT/DNI verified canonically — score 100 — green ✓
- T2 — inferred by deterministic name normalization — score 70-99 — amber ?
- T3 — unverified, in human review queue — score 0 — gris ◌
- Score cap dynamic: without canonical ID → severity capped at "moderada"

## Signal verification states (`<VerificationBadge>` from DS)

- `verificada` — green halo — ready for denuncia
- `sin_verificar` — amber ring — auto-detected, awaiting human
- `descartada` — gris strikethrough — refuted (homonimia, etc.)
- `bloqueada` — red border — source down/redacted

## Severity (`<Badge variant="severity">` from DS)

- `grave` (red, score ≥ 80) · `moderada` (amber, 50-79) · `leve` (gris, < 50)

## Entity taxonomy (graph nodes)

| Tipo | Shape | Color CSS var | Icon (lucide) |
|---|---|---|---|
| estado / repartición | hexagon | `--entity-estado` #4A9EFF | Building2 |
| persona | circle | `--entity-persona` #94A3B8 | User |
| empresa | rect rx=4 | `--entity-empresa` #F59E0B | Briefcase |
| documento / contrato | diamond | `--entity-documento` #22D3EE | FileText |
| señal grave | triangle inv | `--entity-senal-grave` #EF4444 | AlertTriangle (halo if score>80) |
| señal moderada | triangle inv | `--entity-senal-moderada` #F97316 | AlertTriangle |

## Detector tipologías (16, with namespaced slugs)

`monopolio_rubro` · `concentracion_proveedor` · `contrataciones_directas` ·
`prorrogas_excesivas` · `fraccionamiento_avanzado` · `gasto_fin_ejercicio` ·
`servicio_sin_historial` · `proveedor_cronico` · `empresa_nueva` ·
`empresa_sin_empleados` · `directores_compartidos` · `red_de_empresas` ·
`rotacion_coordinada` · `adenda_postajudicacion` · `aparicion_offshore` ·
`conflicto_funcionario_proveedor`

## API endpoints (mock these in prototypes)

### Surface endpoints

| Endpoint | Used by | Returns |
|---|---|---|
| `GET /api/landing` | `/` Home | `{ kpis, nodos, aristas }` |
| `GET /api/dashboard?soloSeñales=true&filters` | `/senales` | `Señal[]` |
| `GET /api/dinero?año=Y` | `/dinero` | `{ etapas, totales, por_programa }` |
| `GET /api/dinero/drill?programa=X&año=Y` | `/dinero` drill | `{ partidas, proveedores, edges }` |
| `GET /api/actores-d6?q=X&filters` | `/actores` | `{ resultados, total }` |
| `GET /api/profile/persona/:dni` | `/persona/:dni` | `Persona` profile |
| `GET /api/profile/empresa/:cuit` | `/empresa/:cuit` | `Empresa` profile |
| `GET /api/profile/{persona\|empresa}/:id/ego?depth=1\|2\|3` | mini-egos | `{ central, vecinos, aristas }` |
| `GET /api/casos` · `POST /api/casos` | `/casos` | `Caso[]` |
| `GET /api/caso/:id` | `/caso/:id` workspace | full case |
| `POST /api/denuncia` | denuncia wizard | PDF + SHA256 + UUID + ISO timestamp |
| `GET /api/watchlist-d8` · `POST /api/watchlist` | `/watchlist` | tracked entities |
| `GET /api/comparar?a=&b=` | `/comparar` | `{ a, b, coincidencias }` |
| `GET /api/cruce/fuentes` + `GET /api/scrapers/health` | `/fuentes` | sources + health |
| `POST /api/chat` (SSE) | home chat panel | Sonnet 4.6 with tool-use |
| `POST /api/ai/suggestions` | inline AI hints | Haiku 4.5 → 0-5 actions |

### Maltego-style transforms (right-click context menu on graph nodes)

`GET /api/transforms/:tipo/:id?action=:slug` returns:

```json
{
  "new_nodes": [{ "id": "...", "tipo": "...", "nombre": "...", ... }],
  "new_edges": [{ "source": "...", "target": "...", "tipo": "..." }],
  "label_pivot": "directores históricos (4)"
}
```

Common actions per entity type:

- **empresa**: `directores_historicos`, `empresas_hermanas`, `contratos_por_jurisdiccion`, `aportes_a_campaña`, `icij_matches`, `opensanctions_matches`
- **persona**: `cargos_publicos`, `empresas_que_dirige`, `ddjj_patrimonio`, `aportes_hechos`
- **repartición**: `top_proveedores`, `contratos_directos`, `programas_asociados`, `funcionarios_vigentes`
- **señal**: `empresas_involucradas`, `personas_involucradas`, `señales_relacionadas`, `casos_que_la_incluyen`

Graph behavior on transform: **additive entry-wave animation, NEVER clear-and-replace**.
Cap visible 500 — if exceeds, prioritize by score (señales) or monto (entities).

## Sample data shape — Señal (most-consumed shape)

```json
{
  "id": "s-001",
  "score": 83,
  "severidad": "grave",
  "tipologia": "monopolio_rubro",
  "hallazgo": "PINTURAS CAVAZZON S.R.L. concentra 92.8% del gasto en Cultura",
  "estado_verificacion": "verificada",
  "anio": 2023,
  "jurisdiccion": "cordoba-capital",
  "norma": "Ley 10.155 art. 11",
  "umbral": "concentración > 70% en una repartición",
  "evidencia": [
    {
      "contrato_hash": "abc123",
      "cuit": "30-71234567-1",
      "monto": 240000000,
      "fecha": "2023-08-15",
      "fuente_url": "https://gobiernoabierto.cordoba.gob.ar/..."
    }
  ],
  "entidades_cuit": ["30-71234567-1"],
  "entidades_completas": [
    { "id": "empresa:30-71234567-1", "tipo": "empresa", "nombre": "PINTURAS CAVAZZON SRL",
      "cuit": "30-71234567-1", "tier": 1 },
    { "id": "rep:secretaria-cultura", "tipo": "repartición", "nombre": "Sec. Cultura",
      "padre": "estado:cordoba-capital" }
  ]
}
```

## Sample data shape — Persona profile

```json
{
  "identidad": {
    "dni": "22345678",
    "cuit": "20-22345678-9",
    "nombre": "MOSQUERA, ALEJANDRO",
    "tier": 1,
    "verificada": true
  },
  "cargos": [
    { "rol": "Sec. Obras Públicas", "desde": "2020-01-01", "hasta": null,
      "jurisdiccion": "cordoba-capital", "fuente_url": "..." }
  ],
  "direcciones_empresariales": [
    { "cuit": "30-...", "razon_social": "...", "rol": "director",
      "desde": "2018-03-01", "hasta": "2022-08-15" }
  ],
  "patrimonio": [
    { "anio": 2023, "monto": 12000000, "fuente_url": "..." },
    { "anio": 2022, "monto": 8000000, "fuente_url": "..." }
  ],
  "aportes": [...],
  "señales": [...],
  "ego_2hop": { "central": {...}, "vecinos": [...], "aristas": [...] },
  "fuentes": { "identidad": [...], "cargos": [...], "patrimonio": [...] }
}
```

## Conventions every prototype must respect

- **AppShell wraps every screen** (sidebar 60px collapsed / topbar 56px / cmd-K palette).
  The Home prototype establishes it; subsequent prototypes inherit and reference it.
- Every CUIT / DNI / SHA256 / exact monetary amount → **font-mono (Geist Mono)**.
- Every public source attribution → `<SourceLink>` with tier prefix + tooltip metadata.
- Every signal rendered → `<VerificationBadge>` next to it. Non-negotiable.
- Every chat-like interaction with citations → use `[[node:tipo:id]]` inline format.
- **Right-click context menu** on graph nodes via Radix `<ContextMenu>` (NOT browser native).
  preventDefault on the contextmenu event.
- **Layout toggle** on every graph: Force / Hierarchical / Circular / Block. Persisted localStorage.
- Cap visible: **80 nodes** (Home graph), **500 nodes** (ego graphs and search).

## Anti-patterns (re-stated for every prototype)

NO:
- Light theme or theme toggle
- Purple / pink / magenta gradients
- Glassmorphism · neumorphism · cosmic backgrounds
- Emojis in UI labels (✓✗ glyphs OK; 🔴⚠️🎯🚀 NO)
- Inter as primary font (Geist Sans is primary)
- Material UI / Ant Design / Chakra / Bootstrap defaults
- Context menu nativo del browser (Radix only, preventDefault required)
- Clear-and-replace on graph transforms (additive only)
- Marketing copy ("Revolutionary", "AI-powered", "Insights", "Discover")
- "Sign up" / "Pricing" / "Newsletter" / "Get started" CTAs
- 2018 shadcn-default look (rounded-2xl/3xl, generic blue buttons, default cards)
- Ocultar señales con bloqueo de fuente (mostrar con badge "⚠ Bloqueada" + razón)
- Renderizar señales sin VerificationBadge
- Mostrar más nodes que el cap visible (siempre con banner si overflow)

## Repo file pointers (only what prototypes need)

- `frontend/src/styles/tokens.css` — canonical design tokens
- `frontend/src/components/ds/` — DS components (populated by Claude Design + Claude Code)
- `frontend/src/lib/queries.ts` — React Query typed hooks
- Backend route definitions live in `backend/src/routes/*.ts` — for prototypes,
  the JSON shapes documented above are sufficient. Mock the data; Claude Code wires
  the real fetches during integration.
