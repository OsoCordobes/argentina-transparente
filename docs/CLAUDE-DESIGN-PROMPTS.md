# ARGOS × Claude Design — Battle Plan
**Versión:** 1.1 · **Fecha:** 2026-05-10 · **Modelo objetivo:** Claude Design (research preview, Opus 4.7)
**Output esperado:** React 18 + TypeScript + Tailwind, listo para handoff a Claude Code → integración al frontend actual.

> **Cómo usar este archivo:** Claude Design separa **Design System** (tokens + componentes reusables, set-once) de **Prototipo** (pantalla concreta). Las 14 sesiones se reparten así:
>
> **Fase 1 — Design System (3 sesiones, en este orden):**
> 1. **DS-A** — Sesión 1 (tokens + 12 primitives foundation)
> 2. **DS-B** — Sesión 14 (10 componentes transversales del dominio: VerificationBadge, MoneyValue, ActorAvatar, etc.)
> 3. **DS-C** — Sesión 2 (App Shell + Topbar + Cmd+K — el wrapper que envuelve toda pantalla)
>
> **Fase 2 — Prototipos (11 sesiones, 1 prototipo por ruta):** Sesiones 3-13. Cada una crea un proyecto nuevo con el DS de Fase 1 ya attached.
>
> Las secciones más abajo están marcadas con **[DS]** o **[PROTOTIPO]** para que sepas a dónde va cada una. El orden numérico (Sesión 1, 2, 3...) se preserva por compatibilidad con la v1.0, pero **el orden real de uso es DS-A → DS-B → DS-C → Prototipos en cualquier orden** (recomendado: Home primero).

---

## 0. Sobre Claude Design (capacidades reales, no marketing)

Claude Design es la herramienta de Anthropic Labs lanzada en abril 2026 (Opus 4.7). Lo importante para nuestro caso:

- **Acepta como input**: prompts de texto, imágenes (PNG/JPG), DOCX/PPTX/XLSX, **link a un repositorio GitHub**, y un *web capture tool* para tomar elementos de una URL en vivo.
- **Genera código real**: HTML/CSS/JS ejecutable y, en modo "frontend-design", componentes React con clases Tailwind utility-first. NO mockups estáticos.
- **Onboarding de design system**: durante la primera sesión lee el codebase y los archivos de diseño para extraer tokens (colores, tipografía, primitives). Se reusa automáticamente en cada sesión siguiente.
- **Refinamiento conversacional**: comments inline, sliders custom (los crea Claude on-the-fly para parámetros tipo "más denso ↔ más espaciado"), y handoff bundle final con un solo botón.
- **Limitaciones conocidas**: las sesiones son *artifact-by-artifact*. No mantiene memoria perfecta entre artifacts; por eso cada prompt acá es **self-contained** — repetimos las reglas críticas en cada uno.

---

## 1. Pre-requisitos antes de abrir Claude Design

Subí o tené listo para linkear:

1. **Repo público o token de acceso a `OsoCordobes/argentina-transparente`**. Hacelo público antes (ver `audit` en chat anterior). Si lo dejás privado: zip del frontend + backend `routes/` + `tokens.css`.
2. **Screenshots V4** (`docs/screenshots-handoff-v4/01..11-v4.png`) — referencia del estado actual. Útil para que Claude Design diga "no quiero esto" (anti-pattern) y proponga el upgrade.
3. **`frontend/src/styles/tokens.css`** — ya está hecho, es el contrato del design system.
4. **`docs/PLAN-LAUNCH-V2.md`** — taxonomía visual + filosofía forense.
5. **Sample data** — corré `curl http://localhost:3001/api/landing` (y similares) y guardá los JSON. Pegalos en cada prompt para que Claude Design no invente shapes.
6. **3 referencias visuales no-Anthropic**: Linear (densidad + motion sutil), Linkurious / Maltego (forensic UI), Stripe Dashboard (data-heavy clean), opcional Palantir Foundry y Vercel Observability. Subí 1-2 screenshots de cada.

---

## 2. Stack técnico que el output debe respetar

```
React 18 + TypeScript (strict)
Tailwind CSS (con tokens.css ya importado en main.tsx — usar var(--token) en arbitrary values)
Vite (no Next, no Remix — es SPA)
shadcn/ui (Radix primitives) ya instalado — pero CUSTOMIZADO, no defaults
lucide-react para iconos (NO heroicons, NO phosphor)
Geist Sans + Geist Mono (en tokens.css)
d3-force / Sigma.js + Graphology para grafos (ya instalados)
recharts para charts no-grafo (Sankey, bar, line)
@tanstack/react-table para tablas virtualizadas
react-router-dom v6 (SPA routing)
React Query (@tanstack/react-query) para data fetching
```

**Anti-stack** (no usar): Material UI, Ant Design, Chakra, Bootstrap, Mantine, AG-Grid, Highcharts, Chart.js, Heroicons, Phosphor, Inter (sí Geist), purple gradients, glass-morphism genérico, rounded-3xl, emojis decorativos, neumorfismo.

---

## 3. SESIÓN 1 — Master Prompt: Design System Foundation `[DS-A · pegar en Design System]`

**Para:** **PRIMER paso del Design System de ARGOS.** Pegalo en la pantalla de creación/onboarding del DS junto con `tokens.css` y 2-3 referencias visuales (Linkurious, Linear, Stripe Dashboard). Output: tokens validados + 12 primitives core (Button, Badge, TierBadge, IdentityBadge, VerificationBadge, Card, Input, Select, Tabs, Tooltip, Toast, EmptyState). Estos primitives quedan disponibles para todo prototipo que use este DS.

```
Sos Claude Design. Estás generando el design system foundation de ARGOS, una herramienta forense
de auditoría ciudadana del gasto público argentino. Estética: government-grade intel tool —
referentes visuales: Linkurious, Maltego, Palantir Foundry, Linear, Stripe Dashboard. Anti-referentes:
landing pages SaaS genéricas, dashboards consumer, todo lo que se vea "AI-default".

== DESIGN PRINCIPLES (no negociables) ==

1. Información primero, decoración después. Cada pixel sirve a entender datos reales de gasto público.
2. Taxonomía visual estricta. Cada tipo de entidad (Estado / Repartición / Empresa / Persona / Doc / Señal)
   se reconoce instantáneamente por forma + color + icono + tipografía. Sin ambigüedad.
3. Stroke widths SOLO múltiplos de 0.5 (1, 1.5, 2). Strokes irregulares = firma #1 de amateur.
4. Border radius máx 6px. 12px+ leen "consumer", no "forensic".
5. Tipografía dual: sans (Geist) para UI, mono (Geist Mono) para CUITs/DNIs/SHA256/montos exactos.
   El mono comunica "dato técnico verificable".
6. Dark forensic por default. No light theme.
7. Microinteractions premium pero invisibles. Motion sirve a entender, no a decorar.
8. Trazabilidad universal. Toda señal lleva badge de verificación (✓/◌/✗/⚠), innegociable.

== TOKENS CANÓNICOS (usar exactamente estos valores) ==

Surface scale (LCH dark forensic, +5-8% L cada nivel):
  --surface-base:    #0B1020   (body)
  --surface-raised:  #141A2E   (cards, panels)
  --surface-overlay: #1E2540   (dropdown, popover)
  --surface-popover: #2A3354   (tooltip, side panel)

Text:
  --text-primary:   #E5E7EB
  --text-secondary: #94A3B8
  --text-muted:     #64748B

Accent por entidad (taxonomía visual ARGOS):
  --entity-estado:    #4A9EFF (border #1E40AF) — hexágono, icon Building2
  --entity-persona:   #94A3B8 (border #475569) — círculo, icon User
  --entity-empresa:   #F59E0B (border #B45309) — rect rx=6, icon Briefcase
  --entity-documento: #22D3EE (border #0E7490) — diamante, icon FileText
  --entity-senal-grave:    #EF4444 — triángulo invertido + halo pulsante
  --entity-senal-moderada: #F97316 — triángulo invertido

Tier (identidad):
  --tier-1: #10B981 (verificado por CUIT/DNI)
  --tier-2: #F59E0B (inferido por matching determinista)
  --tier-3: #64748B (sin verificación, en queue de revisión)

Hairlines (bordes sutiles):
  --hairline-1: rgba(255,255,255,0.06)
  --hairline-2: rgba(255,255,255,0.12)
  --hairline-strong: rgba(255,255,255,0.20)

Spacing scale (4px base): 2 / 4 / 8 / 12 / 16 / 24 / 32 / 48 / 64
Type scale (px): 10 / 11 / 12 / 13 / 14 / 16 / 20 / 24 / 32
Motion: fast 120ms, normal 220ms, slow 380ms — curves: ease-out, ease-in-out, spring(0.34, 1.56, 0.64, 1)
Z-index: base 10 / raised 20 / dropdown 100 / modal 1000 / tooltip 2000 / notification 3000

Fonts:
  --font-sans: 'Geist', 'Inter', system-ui, sans-serif
  --font-mono: 'Geist Mono', 'JetBrains Mono', ui-monospace, monospace

== PRIMITIVES A GENERAR ==

Generá cada uno como componente React + TypeScript con clases Tailwind referenciando los tokens
vía arbitrary values: bg-[color:var(--surface-raised)]. NO useStyle inline. NO clsx/cn imports
inventados — usá `import { cn } from '@/lib/utils'` (ya existe en shadcn).

1. <Button variant="primary | subtle | ghost | danger" size="sm | md | lg">
   Primary = accent-primary fill, focus ring 1.5px accent. NO gradients.
2. <Badge variant="severity | tier | type" tone="grave | moderada | leve | t1 | t2 | t3 | persona | empresa | estado | documento">
   Pildora 11px mono. Border 1px hairline-2. Padding 2px 6px.
3. <TierBadge tier={1|2|3}> con icon ✓/?/◌ y label "T1 verificada / T2 inferida / T3 sin verificar"
4. <IdentityBadge tipo="DNI | CUIT" valor="..." verificado={bool}> mono, format "DNI 12.345.678 ✓"
5. <VerificationBadge estado="verificada | sin_verificar | descartada | bloqueada">
   con halo si verificada (semantic-success), tachado gris si descartada
6. <Card> y <Card.Header>, <Card.Body>, <Card.Footer>
   surface-raised, border 1px hairline-1, radius 6px, padding 16-24px.
7. <Input> con focus ring accent-primary. Placeholder text-muted.
8. <Select> Radix-based, override de shadcn defaults: surface-overlay popover, hairline-2 borders.
9. <Tabs> custom: underline 1.5px accent, NO pills, NO background fill activa. Solo el underline.
10. <Tooltip> RAF-throttled, surface-popover bg, 240ms fade, max-width 280px, font-mono cuando contiene IDs.
11. <Toast> top-right, surface-overlay, hairline-strong border lateral del color del tono. 4s auto-dismiss.
12. <EmptyState icon="..." title="..." description="..." cta={{label, href}}>
    centered, icon 48px text-muted, title 16px primary, desc 13px secondary, button subtle.

== ENTREGABLES DE ESTA SESIÓN ==

1. Un Storybook-style page mostrando los 12 primitives en sus variantes.
2. Comprobá que zooming la página no rompe el grid (responsive desde 1280px hasta 4K).
3. Aplicá keyboard focus a todos: Tab navigation, focus ring visible, Esc cierra overlays.
4. Exportá como handoff bundle. Quiero el código completo + el tokens.css.

== NO HACER ==

- NO incluir purple, pink, magenta gradients en ningún primitive.
- NO usar shadow-lg / shadow-2xl. Sombras forenses son sutiles: shadow de 1px 0px 0px hairline-1.
- NO emojis dentro de los primitives. Sí íconos lucide-react.
- NO heroicons. NO phosphor.
- NO rounded-2xl ni rounded-3xl. Máx rounded-md (6px).
- NO Inter como font primaria. Geist es la primaria.
- NO inventar tokens. Si necesitás un valor que no está en la lista, preguntámelo antes.
```

---

## 4. SESIÓN 2 — App Shell + Topbar + Cmd+K Search `[DS-C · pegar como extensión del Design System]`

> **DS, no prototipo.** El shell es un wrapper reusable: cada prototipo de Fase 2 lo usa como layout root. Si lo metés en un prototipo individual, las otras 10 pantallas no lo heredan automáticamente. Pegalo en el DS DESPUÉS de DS-A (Sesión 1) y DS-B (Sesión 14), ya que el shell consume primitives + cross-cutting components que esas dos crean.

```
Continuamos generando ARGOS. Ya tenés el design system de la Sesión 1. Ahora: el shell global
que envuelve a las 11 superficies. Inspiración: Linear (sidebar colapsable, cmd-K central),
Vercel Observability (topbar densa con métricas), Stripe Dashboard (jerarquía clara).

== LAYOUT ==

  ┌──────────────────────────────────────────────────────────────┐
  │ TOPBAR 56px                                                  │
  │  [▲ ARGOS]   [/ buscar entidad, contrato, señal — ⌘K]       │
  │                              [○ Beta-Cba] [🔔 N] [user ▼]   │
  ├────┬─────────────────────────────────────────────────────────┤
  │ S  │                                                         │
  │ I  │            CONTENIDO DE LA RUTA ACTIVA                  │
  │ D  │                                                         │
  │ E  │                                                         │
  │ B  │                                                         │
  │ A  │                                                         │
  │ R  │                                                         │
  │ 60 │                                                         │
  └────┴─────────────────────────────────────────────────────────┘

SIDEBAR (60px collapsed, 220px expanded on hover/cmd+\):
  Iconos lucide:
    - Home          / 
    - AlertTriangle /senales
    - DollarSign    /dinero
    - Users         /actores
    - FolderOpen    /casos
    - Bookmark      /watchlist
    - GitCompare    /comparar
    - BookOpen      /metodologia
    - Database      /fuentes

  Active item: barra vertical 2px accent-primary a la izquierda + icon en accent-primary.
  Hover: surface-raised bg, label aparece con fade 120ms.
  Disabled (próximamente): icon text-muted, tooltip "Próximamente".

TOPBAR:
  - Logo "ARGOS" en Geist Mono 14px uppercase, tracking-widest, primary.
    A la izquierda un símbolo geométrico (triángulo o caret) en accent-primary.
  - Search input central (max-w-2xl, mx-auto): font-mono 13px, placeholder
    "Buscar entidad, contrato, señal — ⌘K". Click o ⌘K abre command palette.
  - Pill "Beta · Córdoba 2015-2025" a la derecha, surface-raised.
  - Bell con badge numérico (rojo si críticas, ámbar si warnings) — apunta a /alertas.
  - User dropdown: avatar mono con iniciales o lucide User. Open: surface-overlay popover
    con "Perfil · Casos · Cerrar sesión".

CMD-K PALETTE (cmdk library):
  - Modal centrado, max-w-2xl, surface-overlay, hairline-strong border, radius 6px.
  - Sin backdrop blur (lee "consumer"); usar surface-base/80 con solid color.
  - Input top: font-mono 16px, placeholder "Buscar...".
  - Sections: "Entidades" / "Contratos" / "Señales" / "Páginas".
    Cada item: icon 16px (lucide del tipo) + nombre primary + subtitle mono secondary
    (CUIT/DNI/hash) + arrow KeyArrowRight muted en hover.
  - Footer: "↑↓ navegar · ↵ abrir · esc cerrar" en text-muted 11px.
  - Conectar a GET /api/entidad/search?q=... (debounce 200ms, abort controller).
  - Sin resultados: <EmptyState icon="SearchX" title="Sin coincidencias" description="...">.
  - Loading: skeleton de 5 rows con shimmer 1200ms.

== INTERACCIONES ==

- ⌘K (Mac) / Ctrl+K (Win) abre palette desde cualquier ruta.
- Esc cierra palette.
- Tab navega entre primitives, focus ring 1.5px accent visible.
- Sidebar: ⌘\ alterna collapsed/expanded.
- Click logo "ARGOS" navega a /.

== ESTADOS ==

- Offline (window.navigator.onLine === false): banner top sticky, surface-overlay,
  text-secondary 12px, "Sin conexión — usando datos cacheados". No bloqueante.
- Backend 5xx repetido: bell cambia a ámbar permanente, tooltip "Servicio degradado".

== NO HACER ==

- NO usar el Sidebar de shadcn/ui defaults.
- NO un AppBar de MUI o cualquier wrapper grande genérico.
- NO mostrar el email del usuario en el topbar (privacy).
- NO agregar "Compartir" o "Invitar" buttons (no hay multi-tenant).
- NO tema light, ni toggle light/dark — solo dark.
- NO usar emojis 🎯⚡🚀 en ningún label.
```

---

## 5. SESIÓN 3 — `/` Home (chat-first híbrido + grafo reactivo) `[PROTOTIPO 1 · primer prototipo, DS ya creado]`

> **Asume DS attached.** Crear este prototipo eligiendo el DS "ARGOS" de Fase 1. Los componentes `<VerificationBadge>`, `<TierBadge>`, `<MoneyValue>`, `<ActorAvatar>`, `<NorthStar>`, `<EmptyState>`, `<HoverCard>`, etc. se asumen disponibles del DS — **NO los redefinas en este prompt**.

> Esta superficie es la cara pública. El usuario te pidió "chat-first moderno". Implementación: chat panel izquierdo (380px, fijo) + grafo hero a la derecha que **reacciona** al chat y a queries directas. NO un grafo + un chatbox flotante: el chat es protagonista co-igual.

```
ARGOS Home — superficie /. La primera impresión que ve un periodista, fiscal o ciudadano.
Estética: chat-first investigativo + grafo neural en vivo. Referentes: Perplexity (chat con
contexto), Linkurious (intel graph), Linear (densidad). Anti-referente: ChatGPT clean canvas
(es DEMASIADO consumer).

== LAYOUT ==

Viewport ≥1280px:

  ┌──────────────────────────────────────────────────────────────────────┐
  │ CHAT 380px              │ GRAFO HERO (fills remainder)              │
  │ ┌─────────────────────┐ │  ┌───────────────────────────────────────┐ │
  │ │ Pregunta a ARGOS    │ │  │  $X.XXX M trackeados con cadena       │ │
  │ │ qué pasó con [...]  │ │  │  de pago verificable · Córdoba 2015-25│ │
  │ │                     │ │  │                                       │ │
  │ │ ●━━━ MOSQUERA       │ │  │   [GRAFO NEURAL ~80 nodos             │ │
  │ │ ◌ APORTANTE-X       │ │  │    Estado=hex / Persona=○ / Empresa=▢ │ │
  │ │ ━━━━━━              │ │  │    + 6 señales graves verificadas]    │ │
  │ │                     │ │  │                                       │ │
  │ │ "Mostrame los       │ │  │   • cluster Provincia LEFT            │ │
  │ │  contratos a        │ │  │   • cluster Capital RIGHT             │ │
  │ │  pinturas Cavazzon" │ │  │   • ministerios como barrios          │ │
  │ │                     │ │  │                                       │ │
  │ │ [respuesta stream   │ │  │   Hover nodo: card lateral            │ │
  │ │  con citas a        │ │  │   Click nodo: navega Profile          │ │
  │ │  /contrato/:hash]   │ │  │   Cmd+drag: pan · Wheel: zoom         │ │
  │ │                     │ │  │                                       │ │
  │ │ ┌─────────────────┐ │ │  │  [3 chips: 🔴 6 señales graves        │ │
  │ │ │ Escribí algo... │ │ │  │   verificadas · 📅 actualizado 3 mayo │ │
  │ │ └─────────────────┘ │ │  │   · ⓘ Cómo lo hicimos →]               │ │
  │ └─────────────────────┘ │  └───────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘

Viewport <1024px (tablet/mobile):
  - Stack vertical: grafo hero arriba (60vh), chat collapsable abajo (sheet pattern).
  - El chat colapsado muestra solo el input bar pegado al bottom safe-area.

== CHAT PANEL ==

- Header: "ARGOS · asistente investigativo" en font-mono 12px text-secondary.
  Sub: "Cita siempre las fuentes. No inventa." 11px text-muted.
- Cuerpo scrollable: mensajes intercalados (usuario derecha, ARGOS izquierda).
  Mensaje ARGOS: surface-raised card, padding 12px 16px, radius 6px, border-l 1.5px accent.
  Cita: chip mono 11px [[node:cuit:30-71234567-1]] que es clickeable y resalta el nodo en el grafo.
- Streaming: cursor "▋" pulsante 1Hz al final del último mensaje. RAF-throttled chunks.
- Input footer: textarea auto-resize 1-5 lines, font-mono 13px, placeholder "Preguntá algo concreto:
  un nombre, un CUIT, una repartición". Botón Send: lucide ArrowUp 16px en accent-primary,
  desactivado si vacío.
- Quick-prompts (chips arriba del textarea, sólo en estado vacío):
  "¿Cuáles son las 5 señales más graves?"
  "Mostrame contratos directos >$100M"
  "¿Quién es Mosquera?"
- Conectado a POST /api/chat (SSE streaming, Sonnet 4.6, anti-alucinación con tool use).
- Persistencia: localStorage 'argos:chat:history' con TTL 7 días, max 50 mensajes.

== GRAFO HERO ==

- Engine: Sigma.js + Graphology + ForceAtlas2 (ya en repo, mantener).
- Datos: GET /api/landing devuelve { nodos, aristas, kpis, fecha_snapshot }.
  Snapshot mensual fijo. Mostrar fecha en pill abajo a la derecha.
- Layout: cluster-aware. Provincia (cluster LEFT), Capital (cluster RIGHT), ministerios
  como barrios. Cross-jurisdicción: aristas tenues hairline-1.
- Nodos: aplicar TAXONOMÍA del Sesión 1.
  - Estado/Repartición: hexágono var(--entity-estado), 28-44px por presupuesto.
  - Persona: círculo var(--entity-persona), 20-28px.
  - Empresa: rect rx=4 var(--entity-empresa), 20-44px por monto agregado log scale.
  - Señal: triángulo invertido var(--entity-senal-grave), halo pulsante 1Hz si score>80.
- Iconos lucide en cada nodo (sprites SVG).
- Labels: visibles solo a zoom>1.2; font-mono 10-11px text-primary; max 14 chars + ellipsis.
- Edges:
  pertenece_a: solid 1.5px hairline-2, sin arrow.
  contrata: solid curvo, color accent-empresa con stroke gradient por monto, triangle target,
            label hover "$X · Y contratos".
  director_de: dashed [6,3] 1px var(--entity-documento).
  sospecha_de: dotted animated [2,4] 2px var(--entity-senal-grave) + soft glow.

== HEADER OVERLAY (sobre el grafo) ==

Top-left, padding 24px:
  H1 font-display 32px primary, tracking-tight: "$XX.XXX M trackeados"
  Sub font-sans 16px secondary: "con cadena de pago verificable · Córdoba 2015-2025"

Bottom-right, chip stack horizontal:
  [🔴 6 señales graves verificadas] [📅 Snapshot 2026-05-01] [ⓘ Cómo lo hicimos →]
  Cada chip: surface-overlay/80 con backdrop-blur, hairline-2 border, mono 11px.

== INTERACCIONES ==

- Hover nodo: HoverCard lateral derecha (320px), surface-overlay, 220ms slide-in.
  Contenido: nombre + tipo + 3 KPIs + "Ver perfil →" link.
- Click nodo:
  - Si Persona/Empresa con identidad confirmada → navega a /persona/:dni o /empresa/:cuit.
  - Si Estado/Repartición → /actores?repartition=...
  - Si Señal → drawer side-panel con detalle (no navega).
- Cmd+click nodo: agrega al panel "Selección activa" (acumula multi-select para arrastrar a un Caso).
- Wheel: zoom (Sigma default, suavizar a 220ms easing).
- Drag espacio vacío: pan.
- Esc: deselect + close hover.
- Si el chat menciona un node ID con [[node:...]]:
  - El nodo se highlight (halo cyan 2px) y se scroll-pan-to-center con d3.interpolateZoom van Wijk (preserva contexto).

== EMPTY / LOADING ==

- Loading inicial: skeleton del grafo (~80 círculos grises animados con shimmer) +
  chat panel con skeleton de 3 mensajes.
- Si /api/landing devuelve <20 nodos: <EmptyState icon="Network" title="Aún no hay datos suficientes
  para el grafo" description="Estamos cargando contratos. Probá en un rato." cta={null}>.

== NO HACER ==

- NO usar un mapa geográfico de Argentina. La metáfora es grafo, no mapa.
- NO 3D. Sigma.js 2D.
- NO un fondo con gradiente colorido — surface-base sólido + un sutilísimo radial-gradient
  hairline-1 → surface-base centrado en el cluster Capital.
- NO mostrar TODOS los nodos. Cap visible 80. Si /api/landing devuelve más, priorizar
  por monto + severidad.
- NO un "Hi! I'm ARGOS, how can I help you?" como welcome. Frío y técnico:
  "ARGOS · asistente investigativo. Cita siempre las fuentes. No inventa."
- NO sugerir queries que el backend no soporta hoy (las quick-prompts son del set conocido).
- NO un botón de "Suscribirse al newsletter" / "Pricing" / "Login con Google".

== DATOS DE MUESTRA (pegá esto en Claude Design) ==

GET /api/landing devuelve:
{
  "kpis": {
    "monto_total": 24310000000,
    "señales_graves_verificadas": 6,
    "fecha_snapshot": "2026-05-01"
  },
  "nodos": [
    { "id": "estado:cordoba-capital", "tipo": "estado", "nombre": "Córdoba Capital",
      "presupuesto": 12300000000, "x": -200, "y": 0 },
    { "id": "rep:secretaria-cultura", "tipo": "repartición", "nombre": "Sec. Cultura",
      "padre": "estado:cordoba-capital", "presupuesto": 850000000 },
    { "id": "empresa:30-71234567-1", "tipo": "empresa", "nombre": "PINTURAS CAVAZZON SRL",
      "cuit": "30-71234567-1", "monto_agregado": 240000000, "tier": 1 },
    { "id": "señal:s-001", "tipo": "señal", "tipologia": "monopolio_rubro",
      "score": 83, "severidad": "grave", "estado_verificacion": "verificada" }
    /* ... ~80 nodos */
  ],
  "aristas": [
    { "source": "estado:cordoba-capital", "target": "rep:secretaria-cultura", "tipo": "pertenece_a" },
    { "source": "empresa:30-71234567-1", "target": "rep:secretaria-cultura", "tipo": "contrata",
      "monto": 240000000, "n_contratos": 18 },
    { "source": "señal:s-001", "target": "empresa:30-71234567-1", "tipo": "señalado_por" }
  ]
}
```

---

## 6. SESIÓN 4 — `/senales` (toggle Tabla ↔ Grafo) `[PROTOTIPO 2 · DS attached]`

```
ARGOS Señales — superficie /senales. El usuario quiere encontrar señales y filtrarlas.
Default: tabla. Toggle a Grafo (fragmento + filterable). Estética: data-heavy, denso,
forensic. Referente: Linear issue list + Stripe Dashboard tables.

== LAYOUT ==

  Topbar (compartido)
  ┌────────────────────────────────────────────────────────────────────────┐
  │ H1 32px "Señales detectadas" + Sub "16 detectores · 8 con evidencia"   │
  │                                                                        │
  │ ┌─────────────────────────────────────────────────────────┐ [TABLA▢]   │
  │ │ FILTROS (chip row, scroll-x mobile)                     │ [GRAFO ▢]  │
  │ │ Tipología: [todas ▾] Severidad: [todas ▾] Estado verif: │ ← toggle  │
  │ │ [todas ▾] Año: [2015-2025 slider] Jurisdicción: [▾]      │            │
  │ │ Buscar: [____________ 🔍]                                │            │
  │ └─────────────────────────────────────────────────────────┘            │
  │                                                                        │
  │ ┌────────────────────────────────────────────────────────────────────┐ │
  │ │ TABLA virtualizada (@tanstack/react-table)                         │ │
  │ │ Columns: Score · Severidad · Tipología · Hallazgo · Verificación  │ │
  │ │          Año · Jurisdicción · Acciones                             │ │
  │ │                                                                    │ │
  │ │ 83  ▼GRAVE  monopolio_rubro  PINTURAS CAVAZZON 92.8%  ✓ verif      │ │
  │ │     2023  Cba Capital  [Ver detalle →] [+ Caso]                   │ │
  │ │ 80  ▼GRAVE  contrataciones_directas  590 directas $4.1B  ◌ sin verif│
  │ │     ...                                                            │ │
  │ └────────────────────────────────────────────────────────────────────┘ │
  └────────────────────────────────────────────────────────────────────────┘

== TABLA ==

- Header sticky, surface-raised, hairline-2 bottom.
- Row height 48px. Hover surface-raised. Click row expande detalle inline (panel anidado debajo).
- Score column: barra horizontal de progreso vertical 4px width, rojo si grave, ámbar si moderada,
  + número monosp 13px.
- Severidad: <Badge variant="severity"> con dot y label uppercase.
- Tipología: chip mono 11px (e.g. "monopolio_rubro").
- Hallazgo: max 2 lines truncate, primary 13px, **negrita** sobre nombres de actores.
- Verificación: <VerificationBadge> con halo si verificada.
- Acciones: 2 botones ghost icon-only en hover row: Eye (ver detalle) + FolderPlus (a caso).

Detalle expandido (inline accordion):
  - Norma citada (label "Fundamento legal:") con link al texto. Mono 12px.
  - Umbral fundamentado ("Detector dispara cuando concentración > 70%").
  - Evidencia: lista de contratos con CUIT, monto, fecha, fuente_url (link externo).
  - Acciones bottom: [Marcar verificada] [Descartar (homonimia)] [+ Agregar a caso].

== GRAFO (toggle) ==

Mismo layout que home pero:
- Solo nodos involucrados en señales filtradas (subset).
- Cada señal renderiza como triángulo invertido conectado a sus 2-3 entidades involucradas.
- Hover triángulo = preview de evidencia.
- Click triángulo = abre el detalle inline (mismo que en tabla).

== FILTROS ==

Multi-select para tipología (16 opciones) y severidad (grave/moderada/leve).
Single-select Estado verificación: todas / verificada / sin_verificar / descartada / bloqueada.
Año: range slider, default 2015-2025.
Jurisdicción: por ahora solo Córdoba Capital — chip disabled "Próximamente Nación, CABA".

Filtros se reflejan en la URL como query params (?tipologia=monopolio_rubro&sev=grave).
Sharable links.

== EMPTY / LOADING ==

Loading: skeleton de 10 rows con shimmer.
Empty (filtros sin match): <EmptyState icon="Filter" title="Ninguna señal coincide"
description="Probá ampliar el rango de años o relajar la severidad" cta={{label:'Reset filtros'}}>.

== INTERACCIONES ==

- Click en row → expande detalle.
- Cmd+click row → multi-select para batch action ("Agregar 3 a caso").
- Toggle Tabla/Grafo: persistido en localStorage 'argos:senales:view'.
- "+ Caso" abre dropdown con casos existentes + "Nuevo caso..." al final.

== NO HACER ==

- NO usar AG-Grid. @tanstack/react-table es la decisión.
- NO infinite scroll. Pagination explícita 50/100/250 por página.
- NO dropdown Material UI / shadcn defaults. Custom con tokens.
- NO emojis en severidad (✓✗ son glifos, OK; 🔴⚠️ NO).
- NO mostrar señales sin badge de verificación.

== DATOS DE MUESTRA ==

GET /api/dashboard?soloSeñales=true devuelve:
{
  "señales": [
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
        { "contrato_hash": "abc123", "cuit": "30-71234567-1", "monto": 240000000,
          "fecha": "2023-08-15", "fuente_url": "https://gobiernoabierto.cordoba.gob.ar/..." }
      ],
      "entidades_cuit": ["30-71234567-1"]
    }
  ]
}
```

---

## 7. SESIÓN 5 — `/dinero` (Sankey jerárquico + drill bipartito) `[PROTOTIPO 3 · DS attached]`

```
ARGOS Dinero — superficie /dinero. La pregunta: "¿dónde va la plata?". Respuesta visual:
Sankey de las 5 etapas presupuestarias (crédito → compromiso → devengado → pagado → conciliado),
con drill bipartito partida↔proveedor al click. Referentes: Sankey de Stripe Sigma,
Bloomberg Terminal flow charts. Anti-referente: Sankey decorativo de Tableau marketing.

== LAYOUT ==

  ┌──────────────────────────────────────────────────────────────────────┐
  │ H1 "El Dinero · Córdoba Capital 2024"                                │
  │ Sub "$24.310.000.000 ejecutados · 73% pagado al cierre"              │
  │                                                                      │
  │ Filtros: [Año ▾ 2024] [Jurisdicción ▾ Cba Cap] [Programa ▾ todos]   │
  │ Toggle: Sankey ●——○ Tabla jerárquica                                 │
  │                                                                      │
  │ ┌────────────────────────────────────────────────────────────────┐   │
  │ │  CRÉDITO ────► COMPROMISO ────► DEVENGADO ────► PAGADO         │   │
  │ │   $26B          $24.3B           $18.9B          $13.7B         │   │
  │ │                                                                 │   │
  │ │   [bands con espesor proporcional, color gradient por jurisdic- │   │
  │ │    ción / programa, hover tooltip "Educación: $4.2B compromiso  │   │
  │ │    → $3.1B pagado · 73.8%"]                                     │   │
  │ │                                                                 │   │
  │ │   Click en band "Educación · compromiso" → drill                │   │
  │ └────────────────────────────────────────────────────────────────┘   │
  │                                                                      │
  │ DRILL (aparece al click, slide-up 380ms):                            │
  │ ┌────────────────────────────────────────────────────────────────┐   │
  │ │ Bipartito: PARTIDA ↔ PROVEEDOR  ·  Programa Educación 2024      │   │
  │ │                                                                 │   │
  │ │  [columna izq partidas]  ←edges→  [columna der proveedores]    │   │
  │ │                                                                 │   │
  │ │  Edges grosor por monto · color amber empresa · hover label    │   │
  │ │  Click proveedor → /empresa/:cuit                              │   │
  │ └────────────────────────────────────────────────────────────────┘   │
  └──────────────────────────────────────────────────────────────────────┘

== SANKEY ==

- Engine: recharts Sankey o custom d3-sankey (recomiendo d3-sankey por control fino).
- Bands: linear gradient horizontal, color del nodo source → color del target.
- Stroke: hairline-2 1px en cada band.
- Labels: encima de cada nodo, font-mono 11px primary, monto formateado con fmtCompactARS.
- Hover band:
  - Highlight (otras bands fade a opacity 0.3).
  - Tooltip: "Educación → Pagado: $3.1B · 73.8% del comprometido".
- Click band:
  - Setea el filtro Programa.
  - Abre drill bipartito con animación slide-up.

== DRILL BIPARTITO ==

- Layout: Graphology con `noverlap` o cose-bilkent.
- Columna izq: partidas presupuestarias (rect verde, var(--entity-documento) variant green).
- Columna der: proveedores (rect amber, var(--entity-empresa)).
- Edges: bezier curvo, grosor log(monto), color amber → green gradient, arrowhead target.
- Click partida: muestra "Top 10 proveedores de esta partida".
- Click proveedor: navega a /empresa/:cuit.

== TABLA JERÁRQUICA (toggle) ==

Tree-table indentada:
  ▼ Educación · $4.2B
    ▼ Programa 642 · Equipamiento · $890M
      • Partida 1.2 · Insumos · $230M
        - PINTURAS CAVAZZON SRL · $240M (8 contratos)
        - PROVEEDOR-X · $90M (3 contratos)
      • Partida 1.3 · Servicios · $660M

== FILTROS ==

Año (single-select dropdown 2015-2025), Programa (multi-select con search), Jurisdicción.
Dispara refetch real (no son decorativos). Verificá uno a uno.

== EMPTY / LOADING ==

Loading: skeleton bands grises con shimmer.
Empty (sin datos para los filtros): <EmptyState icon="DollarSign" title="Sin ejecución registrada
para esta combinación" description="Probá otro año o quitá el filtro de programa.">.

== NO HACER ==

- NO Highcharts ni Chart.js.
- NO mostrar montos sin formatear ($240000000) — siempre fmtCompactARS ($240M) o fmtARS exacto.
- NO un eje Y con escala lineal cuando hay 4 órdenes de magnitud — siempre log si los datos lo piden.
- NO bands con gradient arcoiris. Color por categoría (programa) usando una paleta de 8 tonos
  derivados del accent-primary (variaciones LCH).
- NO mostrar "0%" en una band sin data — usar gris hairline-2 y label "Sin datos".

== DATOS ==

GET /api/dinero?año=2024 devuelve:
{
  "etapas": ["crédito", "compromiso", "devengado", "pagado"],
  "totales": [26000000000, 24310000000, 18900000000, 13700000000],
  "por_programa": [
    { "programa": "Educación", "credito": 5000000000, "compromiso": 4200000000, ... }
  ],
  "drill": null
}

GET /api/dinero/drill?programa=Educación&año=2024 devuelve:
{
  "partidas": [...],
  "proveedores": [...],
  "edges": [{ "partida_id": "p-1.2", "cuit": "30-...", "monto": 240000000, "n_contratos": 8 }]
}
```

---

## 8. SESIÓN 6 — `/actores` (split graph + lista filtrable) `[PROTOTIPO 4 · DS attached]`

```
ARGOS Actores — superficie /actores. Pregunta: "¿existe esta persona/empresa? ¿qué hace?".
Layout: split izq lista filtrable (40%), der mini-ego graph del actor seleccionado (60%).
Referentes: Maltego search results, LinkedIn search profesional pero forense.

== LAYOUT ==

  ┌────────────────────────────────────────┬───────────────────────────────┐
  │ LISTA (40%)                            │ MINI-EGO GRAPH (60%)          │
  │ ┌────────────────────────────────────┐ │ ┌───────────────────────────┐ │
  │ │ Search: [Buscar nombre o CUIT...]  │ │ │ MOSQUERA, ALEJANDRO       │ │
  │ │                                    │ │ │ DNI 22.345.678 ✓ tier 1   │ │
  │ │ Filtros: [Tipo▾] [Jurisdicción▾]   │ │ │ Cargo: Sec. Obras Públicas│ │
  │ │ [Ordenar: Monto ▾]                 │ │ │                           │ │
  │ │                                    │ │ │  [Mini-ego 1-hop graph    │ │
  │ │ ┌────────────────────────────────┐ │ │ │   con nodo central        │ │
  │ │ │ ●  MOSQUERA, ALEJANDRO         │ │ │ │   + 1° de separación]     │ │
  │ │ │   DNI 22.345.678 ✓             │ │ │ │                           │ │
  │ │ │   Func. activo · Cba Capital   │ │ │ │   Expandir: [1°][2°][3°]  │ │
  │ │ │   Patrimonio decl. $X · 2023   │ │ │ │                           │ │
  │ │ │   2 señales asociadas          │ │ │ │   "Visibles: 47 / cap 500"│ │
  │ │ └────────────────────────────────┘ │ │ │                           │ │
  │ │ ┌────────────────────────────────┐ │ │ │   [Ver perfil completo →] │ │
  │ │ │ ▢  PINTURAS CAVAZZON SRL       │ │ │ └───────────────────────────┘ │
  │ │ │   CUIT 30-71234567-1 ✓         │ │ │                               │
  │ │ │   $240M agregado · 18 contrat. │ │ │                               │
  │ │ │   1 señal grave                 │ │ │                               │
  │ │ └────────────────────────────────┘ │ │                               │
  │ │   ...                              │ │                               │
  │ └────────────────────────────────────┘ │                               │
  └────────────────────────────────────────┴───────────────────────────────┘

== LISTA ==

- Item card: surface-raised, hairline-1, padding 12px 16px, gap 4px.
- Avatar 32px:
  - Persona: círculo persona color con iniciales mono.
  - Empresa: rect rx=4 amber con icon Briefcase.
- Nombre: primary 14px sans-bold, mono CUIT/DNI debajo 11px.
- Tier badge inline siguiente al CUIT.
- Subtitle: rol + jurisdicción 12px secondary.
- KPIs en 1 línea: "Patrimonio $X · 2 señales" o "$X agregado · 18 contratos".
- Selected: border-l 1.5px accent-primary + surface-overlay bg.
- Click: actualiza el mini-ego graph, sin navegar.
- Doble click o "Ver perfil completo →": navega a /persona/:dni o /empresa/:cuit.

== MINI-EGO GRAPH ==

- Default: 1° (vecinos directos).
- Layout radial: nodo central grande + anillo 1°.
- Toggle [1°][2°][3°] — costo: 1° barato, 2° medio, 3° caro con cap visible 500.
- Cap badge "Visibles: 47 / cap 500" siempre presente.
- Aristas con taxonomía estándar.

== FILTROS ==

- Tipo: Persona / Empresa / ambos.
- Jurisdicción.
- Ordenar: Monto agregado (empresas) / Patrimonio (personas) / Reciente / Alfabético.
- Solo con señal: checkbox.

== EMPTY / LOADING ==

Lista loading: 8 skeleton cards.
Lista empty: <EmptyState icon="UserSearch" title="Ningún actor coincide"
description="Probá quitar filtros o ampliar la búsqueda.">.
Mini-ego empty (sin selección): <EmptyState icon="GitBranch" title="Seleccioná un actor"
description="A la izquierda hay X actores. Click en cualquiera para ver su red 1° de separación.">.

== INTERACCIONES ==

- Search: debounce 200ms, abort controller.
- ⌘+ENTER en search: selecciona el primer resultado.
- ↑↓ navega lista, ↵ selecciona.
- Click nodo en mini-ego: si tiene identidad confirmada, navega; si no, queda como nuevo
  centro del ego.

== NO HACER ==

- NO mostrar "candidato sin identidad" como Profile clickeable. Solo aparece en lista
  con badge "sin identidad confirmada" y deshabilitado.
- NO usar tabs en la lista. Filtros como dropdowns.
- NO un toolbar tipo Excel arriba — minimalista.

== DATOS ==

GET /api/actores-d6?q=mosquera devuelve:
{
  "resultados": [
    { "id": "persona:22345678", "tipo": "persona", "nombre": "MOSQUERA, ALEJANDRO",
      "dni": "22345678", "tier": 1, "cargo_actual": "Sec. Obras Públicas",
      "patrimonio_declarado": 12000000, "n_señales": 2 }
  ],
  "total": 47
}

GET /api/profile/persona/22345678/ego?depth=1 devuelve:
{ "central": {...}, "vecinos": [...], "aristas": [...] }
```

---

## 9. SESIÓN 7 — `/persona/:dni` (Profile canónico Persona Física) `[PROTOTIPO 5 · DS attached]`

```
ARGOS Profile Persona — superficie /persona/:dni. Página canónica de una persona física.
Una persona = una URL. Como Wikipedia, click en cualquier nombre te trae acá.
Estética: ficha forense densa pero legible. Referente: ficha de Maltego entity, perfil de
RIPE NCC, expediente judicial bien diseñado.

== LAYOUT ==

  ┌──────────────────────────────────────────────────────────────────────┐
  │ BREADCRUMB Home / Actores / Persona Física                           │
  │                                                                      │
  │ CABECERA                                                             │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ [○ avatar 64px]  MOSQUERA, ALEJANDRO                             │ │
  │ │                  DNI 22.345.678 · CUIT 20-22345678-9 ✓ tier 1   │ │
  │ │                  Jurisdicción primaria: Córdoba Capital          │ │
  │ │                  [Funcionario activo] [Declarante DJP] [PEP]     │ │
  │ │                  [+ Agregar a caso] [👁 Watchlist] [⚠ Reportar]   │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  │                                                                      │
  │ TIMELINE UNIFICADO                                                   │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ 2015 ●─────●──────●───●───●───●───●─────●─────●───── 2025         │ │
  │ │      ▲         ▲       ▲       ▲                                 │ │
  │ │      cargo    cargo  director  señal                             │ │
  │ │ [slider de rango]                                                 │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  │                                                                      │
  │ GRID 2x2                                                             │
  │ ┌────────────────────────────┬──────────────────────────────────────┐│
  │ │ CARGOS PÚBLICOS             │ DIRECCIONES EN EMPRESAS             ││
  │ │ • Sec. Obras Públicas       │ • Director CONSTRUCT-X SA           ││
  │ │   2020-actual · Cba Cap.    │   2018-2022 · CUIT 30-...           ││
  │ │ • Director Vialidad         │ • Síndico OTRO-SRL                  ││
  │ │   2015-2020 · Provincia     │   2015-2018                         ││
  │ ├────────────────────────────┼──────────────────────────────────────┤│
  │ │ PATRIMONIO (DDJJ)           │ APORTES A CAMPAÑA                   ││
  │ │ 2023 → $12M (declarado)     │ 2019 → Frente X · $250K             ││
  │ │ 2022 → $8M                  │ 2023 → Frente X · $400K             ││
  │ │ Δ +50% (alerta:moderada)    │                                      ││
  │ └────────────────────────────┴──────────────────────────────────────┘│
  │                                                                      │
  │ SEÑALES ASOCIADAS  +  RED 2-HOP                                      │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ 2 señales activas:                                                │ │
  │ │ ◌ Conflicto director-proveedor · score 67 · sin verificar         │ │
  │ │ ✓ Aportante repetido · score 58 · verificada                      │ │
  │ │                                                                   │ │
  │ │ [Mini grafo 2-hop centrado en la persona, expandible 1/2/3°]      │ │
  │ │ [Visibles: 23 / cap 500]                                          │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  │                                                                      │
  │ FUENTES (URLs canónicas, agrupadas por dimensión)                    │
  │ ┌──────────────────────────────────────────────────────────────────┐ │
  │ │ Identidad: AFIP padrón · IGJ · Padrón Cba prov.                   │ │
  │ │ Cargos: Boletín Oficial Cba · decreto-publicado-url               │ │
  │ │ DDJJ: portal-transparencia-url                                    │ │
  │ │ Aportes: CNE aportantes registro                                  │ │
  │ └──────────────────────────────────────────────────────────────────┘ │
  └──────────────────────────────────────────────────────────────────────┘

== INTERACCIONES ==

- Click cargo → /actores?repartition=...
- Click empresa en "Direcciones" → /empresa/:cuit
- Click señal → drawer con detalle inline
- Click en TIMELINE evento → scroll-into-view de la sección correspondiente + highlight
- Slider de rango: filtra todas las secciones por t_efectivo en el rango
- "Watchlist" toggle (POST /api/watchlist) — checkmark verde cuando guardado
- "Reportar" → opens modal: "¿Qué problema con este perfil?" (homonimia, dato erróneo)

== ESTADOS ==

- Sin DNI verificado: NO se debe llegar acá (solo "candidato" en /actores). Si la URL es
  /persona/22345678 y devuelve tier ≥ 4, mostrar página de error: "Identidad no confirmada"
  con explicación.
- Sin señales: oculta la sección entera (no "no hay señales").
- Sin DDJJ: muestra "DDJJ omitida" como señal con badge.

== NO HACER ==

- NO mostrar foto. (Privacy + accuracy — fotos públicas pueden ser homónimos.)
- NO botón "Compartir en LinkedIn".
- NO "ver historial completo en una página separada" — todo en esta página, expandible.
- NO usar el componente shadcn Avatar default.

== DATOS ==

GET /api/profile/persona/:dni devuelve:
{
  "identidad": { "dni": "22345678", "cuit": "20-22345678-9", "nombre": "MOSQUERA, ALEJANDRO",
                 "tier": 1, "verificada": true },
  "cargos": [...],
  "direcciones_empresariales": [...],
  "patrimonio": [{ "anio": 2023, "monto": 12000000, "fuente_url": "..." }],
  "aportes": [...],
  "señales": [...],
  "ego_2hop": { ... },
  "fuentes": { "identidad": [...], "cargos": [...] }
}
```

---

## 10. SESIÓN 8 — `/empresa/:cuit` (Profile canónico Persona Jurídica) `[PROTOTIPO 6 · DS attached]`

```
ARGOS Profile Empresa — superficie /empresa/:cuit. Mismo átomo ActorProfile, dimensiones
adaptadas a PJ. Una empresa = una URL.

== LAYOUT (variante de Persona) ==

  CABECERA
    [▢ icon Briefcase 64px]  PINTURAS CAVAZZON SRL
                              CUIT 30-71234567-1 ✓ tier 1
                              Tipo: Sociedad de Responsabilidad Limitada
                              Domicilio fiscal: Av. Colón 1234, Cba Capital
                              Constitución: 2014-03-15 · Empleadores: SÍ (AFIP)
                              [Active proveedor] [+ Caso] [👁 Watchlist]

  TIMELINE UNIFICADO (eventos: contratos firmados, adendas, señales, cambios de directorio)

  GRID 2x2
    CONTRATOS COMO PROVEEDOR    | PAGOS RECIBIDOS (cadena)
    18 contratos · $240M total  | $189M pagado / $240M comprometido
    Top 5: ...                  | Cadena: compromiso → devengado → pagado
                                |
    DIRECTORES (histórico)      | APORTES A CAMPAÑA HECHOS
    • MOSQUERA → /persona/...   | Frente X · $X · 2023
    • PEREZ, J. → /persona/...  |
    [link IGJ source]           | [link CNE]

  TRANSFERENCIAS / SUBSIDIOS RECIBIDOS (full-width)

  SEÑALES + RED 2-HOP (mismo patrón que Persona)

  FUENTES

== EXTRA: tab "Contratos" expandible ==

Tabla virtualizada con todos los contratos:
  Hash · Año · Repartición · Tipo · Monto · Estado · fuente_url

Click row → /contrato/:hash.

== ESTADOS ESPECIALES ==

- Si la empresa aparece en ICIJ Offshore Leaks o OpenSanctions:
  Banner top destacado con badge magenta "Coincide en ICIJ Panama Papers" (link al nodo
  en offshoreleaks.icij.org).
- Si esEmpleador=false en AFIP: badge ámbar "Sin empleados registrados".
- Si la empresa fue constituida <12 meses antes del primer contrato: badge "Empresa nueva".

== NO HACER ==

- NO duplicar info entre PERSONA y EMPRESA — cada uno con su atom adaptado.
- NO mostrar logo de la empresa (privacy + nadie tiene logos verificados).
- NO ocultar señales aunque sean leves — pero respetar el badge de verificación.

== DATOS ==

GET /api/profile/empresa/:cuit devuelve estructura análoga a persona, con
contratos[] · pagos · directores_historicos[] · aportes[] · señales[] · ego_2hop · fuentes.
```

---

## 11. SESIÓN 9 — `/casos` (lista + workspace) `[PROTOTIPO 7 · DS attached]`

```
ARGOS Mis Casos — superficie /casos. Workspace personal donde el investigador agrupa actores,
contratos y señales en un expediente. Genera PDF formal de denuncia. Estética: Linear-style
list + Notion-light workspace.

== /casos LAYOUT (lista) ==

  H1 "Mis casos"  [+ Nuevo caso]

  Filtros: [Estado ▾ todos] [Ordenar ▾ más reciente]

  Grid de cards (3 cols ≥1280px, 2 cols ≥768px, 1 col mobile):

  ┌──────────────────────────────────┐
  │ Caso #001 · Estado: Borrador     │
  │ "Conflicto Cavazzon-Cultura"     │
  │ 3 entidades · 18 contratos · 2 señales│
  │ Creado: 2026-04-25 · Tú          │
  │ Última edición: hace 2 horas     │
  │ [Abrir →] [···]                  │
  └──────────────────────────────────┘

== EMPTY STATE (primera vez) ==

  <EmptyState
    icon="FolderPlus"
    title="Aún no tenés casos"
    description="Un caso es tu expediente personal. Agregá entidades y señales mientras navegás
                 por ARGOS. Cuando esté completo, generá un PDF de denuncia formal."
    cta={{ label: '+ Crear primer caso', action: openCreateModal }}
  />

== /caso/:id LAYOUT (workspace) ==

  Topbar caso (sticky):
    [← volver]  Caso #001 · "Conflicto Cavazzon-Cultura"  [Estado: ▾ Borrador]
                                          [Compartir privado]  [Generar denuncia →]

  Tabs: Entidades · Contratos · Señales · Notas · Cronología · Anexos

  Sidebar derecho (320px, sticky): Notas markdown autosave 800ms.

  Contenido por tab:
    Entidades: lista de actores agregados con drag-drop reorder. Click → Profile en nueva tab.
    Contratos: tabla con hash, monto, fecha, fuente_url.
    Señales: cards similares a /senales pero solo las del caso.
    Notas: editor markdown con preview, autosave.
    Cronología: timeline auto-construido con eventos del caso.
    Anexos: archivos subidos (PDF, screenshots, JSON).

== "Generar denuncia" (modal wizard 5 pasos) ==

  1. Datos denunciante (nombre, DNI, dirección, email — NO se guarda en server)
  2. Selección de hechos (qué señales del caso incluir)
  3. Marco normativo (auto-completa Ley 25.188 / 27.401 / específicas)
  4. Vista previa PDF
  5. Descarga PDF + SHA256 + UUID + timestamp ISO

== INTERACCIONES ==

- Drag actor de /actores al tab "Entidades" del caso (multi-tab requires browser support).
- Cmd+S guarda forzando flush de autosave.
- Esc cierra modales.

== NO HACER ==

- NO permitir compartir el caso públicamente. Privado innegociable.
- NO sincronizar con servicios externos (Google Docs, Notion).
- NO usar componente Markdown editor pesado tipo TipTap. Usá una textarea + react-markdown
  para preview.

== DATOS ==

Supabase: tablas casos, caso_entidades, caso_contratos, caso_señales, caso_notas (RLS por user_id).
Backend POST /api/denuncia produce PDF.
```

---

## 12. SESIÓN 10 — `/watchlist` (entidades trackeadas) `[PROTOTIPO 8 · DS attached]`

```
ARGOS Watchlist — superficie /watchlist. Lista de actores que el usuario quiere monitorear.
Cuando algo cambia (señal nueva, monto +Δ%, cargo nuevo), aparece como novedad.

== LAYOUT ==

  H1 "Mi watchlist"  [+ Agregar manualmente]

  KPIs row: [N entidades] [N novedades sin leer]

  Tabs: Personas · Empresas · Todas

  Lista de cards similares a /actores, pero con badge "Δ N novedades" si hay cambios desde
  la última visita.

  Click → Profile, marca novedades como leídas.

== EMPTY ==

  <EmptyState
    icon="Bookmark"
    title="Tu watchlist está vacía"
    description="Cuando estés en un perfil, hacé click en 'Watchlist' para agregar.
                 Te avisamos si aparece nueva data: contratos, señales o cambios de cargo."
    cta={null}
  />

== INTERACCIONES ==

- Toggle "Solo con novedades" (filter chip).
- "Marcar todas leídas" (botón ghost top-right).
- Swipe-left en mobile para "Quitar de watchlist".

== NO HACER ==

- NO push notifications. (No tenemos backend para eso en MVP.)
- NO email digest. (Same.)

== DATOS ==

GET /api/watchlist-d8 → [{ entidad_id, tipo, nombre, novedades: [{...}], agregado_en }]
```

---

## 13. SESIÓN 11 — `/comparar` (side-by-side de 2 entidades) `[PROTOTIPO 9 · DS attached]`

```
ARGOS Comparar — superficie /comparar?a=...&b=... Compara dos entidades del mismo tipo
side-by-side. Útil para detectar patrones (mismos directores, mismas reparticiones, montos).

== LAYOUT ==

  H1 "Comparar"

  Selectors top: [Entidad A ▾ buscar] vs [Entidad B ▾ buscar]
  (El usuario tipea o pega CUIT/DNI; autocomplete con cmd palette logic.)

  Grid 2 cols (50/50):
    Columna A: cabecera de Profile + KPIs + secciones colapsables.
    Columna B: idem.

  Highlights automáticos:
    Cuando un valor coincide en ambas (mismo director, misma repartición, misma señal):
    fila resaltada con bg surface-overlay + border-l 1.5px accent-primary.

  Bottom: "Coincidencias detectadas":
    • 1 director común: PEREZ, J. → /persona/...
    • 3 reparticiones contratantes en común: Cultura, Obras, Educación
    • 1 señal del mismo tipo: monopolio_rubro

== EMPTY (sin selección) ==

  <EmptyState
    icon="GitCompare"
    title="Elegí 2 entidades para comparar"
    description="Compará dos empresas (mismos directores? mismas reparticiones?) o dos
                 personas (mismos cargos? mismos aportes?). Útil para detectar patrones."
    cta={null}
  />

== EMPTY (mismo tipo distinto) ==

Si A es persona y B es empresa: error inline "Solo se comparan entidades del mismo tipo."

== INTERACCIONES ==

- Click en cualquier valor → highlight en ambas columnas si coincide.
- Sticky scroll: al scrollear, las cabeceras de ambas columnas quedan fixed.

== NO HACER ==

- NO comparar 3+ entidades — solo 2 (más es ruido).
- NO un toggle "diff only" antes del MVP.

== DATOS ==

GET /api/comparar?a=...&b=... → { a: {...profile}, b: {...profile}, coincidencias: [...] }
```

---

## 14. SESIÓN 12 — `/metodologia` (cómo detectamos) `[PROTOTIPO 10 · DS attached]`

```
ARGOS Metodología — superficie /metodologia. Página estática-densa donde explicamos cómo
funciona el sistema. CRÍTICA para gov-grade: si un fiscal abre esto y no entiende cómo
detectamos, ARGOS pierde credibilidad. Estética: documentación técnica formal pero legible.
Referente: Stripe Docs, MDN, Anthropic Constitutional AI page.

== LAYOUT ==

  H1 "Cómo lo hicimos"
  Sub "16 detectores · 5 tiers de identidad · cero alucinaciones por diseño."

  Grid 2 cols (60/40):

  Columna izq (contenido):
    1. Filosofía
    2. Identidad (5 tiers + ejemplos)
    3. Detectores (16, cada uno con norma + umbral)
    4. Trazabilidad (fuente_url + cadena de custodia)
    5. Limitaciones honestas

  Columna der (sticky, sidebar de navegación):
    TOC con scroll-spy.

  Cada detector se renderiza como card colapsable:
    ┌─────────────────────────────────────────┐
    │ [▼] Monopolio por rubro (monopolio_rubro)│
    │     Norma: Ley 10.155 art. 11           │
    │     Severidad: moderada / grave         │
    │                                         │
    │     Cuándo dispara:                     │
    │     Cuando un proveedor concentra >70%  │
    │     del gasto en una repartición.       │
    │                                         │
    │     Cómo se calcula:                    │
    │     [pseudocode block en mono]          │
    │                                         │
    │     False positives conocidos:          │
    │     - Repartición con un solo programa  │
    │     - Servicios públicos (electricidad) │
    │                                         │
    │     [Ver señales activas →]             │
    └─────────────────────────────────────────┘

== INTERACCIONES ==

- TOC sticky con scroll-spy.
- Cards colapsables (1 abierto a la vez).
- Hover de "Ver señales activas →" hace prefetch de /senales filtrado.
- Cmd+F nativo del browser hace match en el contenido (no inventar search interno).

== ESTILO TIPOGRÁFICO ==

- H1 32px, H2 24px primary, H3 16px primary bold, párrafo 14px secondary line-height 1.6.
- Code blocks: surface-overlay bg, mono 12px, padding 12px 16px, border 1px hairline-2.
- Inline code: <span class="font-mono text-[12px] bg-[var(--surface-overlay)] px-1.5 py-0.5 rounded">

== NO HACER ==

- NO usar shadcn Accordion default. Custom con tokens.
- NO marketing speak ("Revolutionary", "AI-powered", "Insights"). Lenguaje técnico.
- NO ocultar limitaciones — son lo que da credibilidad.

== DATOS ==

Static — el contenido vive en /frontend/src/content/metodologia.mdx.
La lista de detectores se importa de backend/src/engine/detectors-config.json.
```

---

## 15. SESIÓN 13 — `/fuentes` (procedencia de datos) `[PROTOTIPO 11 · DS attached]`

```
ARGOS Fuentes — superficie /fuentes. Tabla de todas las fuentes de datos con tier de
confianza, frecuencia de actualización, último crawl, salud del scraper. Estética:
data ops dashboard, similar a Vercel deployments page o GitHub Actions runs.

== LAYOUT ==

  H1 "Fuentes de datos"
  Sub "Cada fila es una promesa: este dato existe, viene de aquí, fue obtenido así."

  KPIs row:
    [N fuentes activas] [N tier 1 verificadas] [N con último crawl <7d] [N scrapers OK]

  Tabla:
    Fuente · Jurisdicción · Tier · Método · Último crawl · Estado · Acciones

  Cada row:
    🟢 gobiernoabierto.cordoba.gob.ar · Cba Capital · T1 · API REST + XLSX
                                       · 2026-05-09 (hace 1 día) · OK
                                       · [▾ ver detalle]

  Detalle expandible:
    - URL canónica (link externo)
    - Schema esperado vs schema observado
    - Volumen último crawl (X filas)
    - Hash SHA256 del último snapshot
    - Owner (org de gobierno)
    - Frecuencia esperada vs real

== ESTADOS ==

  🟢 OK: último crawl reciente, sin errores, schema match.
  🟡 Warning: crawl >2x frecuencia esperada, o schema warning.
  🔴 Error: scraper roto / fuente caída / schema rompió.

== INTERACCIONES ==

- Click row → expande detalle.
- Click URL → abre fuente en nueva tab.
- Cmd+click hash → copia al clipboard, toast "Hash copiado".

== EMPTY ==

  <EmptyState icon="Database" title="Sin fuentes registradas"
   description="Las fuentes se registran al correr seeds. Iniciá con: npm run seed:cordoba" />

== NO HACER ==

- NO ocultar fuentes en error — visibilidad TOTAL es el punto.
- NO manipular el orden por estado — orden alfabético, status es columna.

== DATOS ==

GET /api/scrapers/health + GET /api/cruce/fuentes (combinar):
{
  "fuentes": [
    {
      "id": "cba-cap-contratos",
      "url_canonica": "https://gobiernoabierto.cordoba.gob.ar/...",
      "jurisdiccion": "cordoba-capital",
      "tier": 1,
      "metodo_extraccion": "API REST + XLSX",
      "ultimo_crawl": "2026-05-09T08:00:00Z",
      "estado": "ok",
      "volumen_filas": 2410,
      "frecuencia_esperada": "diaria",
      "frecuencia_observada_dias": 1,
      "schema_match": true,
      "hash_ultimo": "abc123..."
    }
  ]
}
```

---

## 16. SESIÓN 14 — Componentes transversales `[DS-B · pegar como extensión del Design System, DESPUÉS de DS-A]`

> **DS, no prototipo.** Pegalo en el DS justo después de DS-A (Sesión 1, foundation). Estos 10 componentes son del dominio ARGOS (VerificationBadge, MoneyValue, ActorAvatar, SourceLink, ChainOfCustody, NorthStar, FilterChipGroup, TimelineEvent, ExpansionControl, ErrorBoundary). Quedan disponibles globalmente para todo prototipo. Si los hacés en un prototipo individual, las otras 10 pantallas no los heredan automáticamente y vas a tener divergencias.

```
ARGOS Cross-cutting components. Generá los siguientes con strict consistency entre las
14 superficies anteriores. Cada uno debe tener Storybook story con todas sus variantes.

1. <VerificationBadge estado={"verificada"|"sin_verificar"|"descartada"|"bloqueada"} size={"sm"|"md"} >
   - Verificada: ✓ glyph + halo semantic-success.
   - Sin verificar: ◌ ring + tone tier-2.
   - Descartada: ✗ con tachado + text-muted.
   - Bloqueada: ⚠ con border-l danger.
   - Hover: tooltip con explicación.

2. <ActorAvatar tipo={"persona"|"empresa"|"estado"|"repartición"} size={32|48|64|80} />
   - Persona: círculo persona color con iniciales mono.
   - Empresa: rect rx=4 amber con icon Briefcase 70% del size.
   - Estado: hexágono SVG (clip-path) azul con icon Building2.
   - Repartición: hexágono más chico que estado, mismo color.

3. <MoneyValue cents={number} variant={"compact"|"exact"|"both"} />
   - Compact: $240M (Intl.NumberFormat con notation:'compact').
   - Exact: $240.000.000 (Intl.NumberFormat es-AR).
   - Both: $240M ($240.000.000) — exact en mono 11px secondary entre paréntesis.
   - Si cents === 0: "—" en muted.
   - Si cents > 1B: red highlight ámbar warning (probable data quality issue).

4. <SourceLink href fuente_metadata={{tier, metodo}} />
   - Render como chip mono 11px: "[T1] gobiernoabierto.cordoba.gob.ar →"
   - Click abre nueva tab.
   - Hover: tooltip con metadata completa (fecha crawl, hash, schema match).

5. <ChainOfCustody hash size={"sm"|"md"} />
   - Render: "🔒 a3b1...c9f2" mono 11px text-muted, click copia hash al clipboard,
     toast "Hash SHA256 copiado".

6. <NorthStar metric label sub />
   - Hero number mono Geist Mono 48-72px primary, label secondary 12px uppercase tracking.
   - Variant inline (sm 24px) para usar en KPIs row.

7. <FilterChipGroup chips activeIds onChange />
   - Cada chip: surface-raised, hairline-2, mono 11px, padding 4px 10px.
   - Active: surface-overlay + border accent-primary 1.5px.
   - Hover: surface-overlay/60.

8. <TimelineEvent t titulo descripcion tipo onClick />
   - Punto en timeline + tarjeta lateral.
   - Tipo afecta color del punto (cargo / contrato / señal / aporte).

9. <ExpansionControl currentDepth={1|2|3} visibles cap reset />
   - Panel flotante top-right del grafo.
   - Botones [1°][2°][3°] y "↺ Reset".
   - Texto "Visibles: 47 / cap 500" muted 11px.

10. <ErrorBoundary fallback> y <Suspense fallback={PageLoader}>
    - PageLoader: skeleton genérico de header + 3 secciones, shimmer animation.
    - ErrorBoundary fallback: <EmptyState icon="AlertOctagon" title="Algo se rompió"
      description="No pudimos cargar esta sección. Probá refrescar." cta={{label:'Reportar'}} />.

== NO HACER ==

- NO hacer estos componentes "reusables al máximo" agregando 30 props. Las variantes son
  taxativas, los props son strict union types.
- NO incluir analytics/tracking en ningún componente.
- NO logos de marca (no hay marca corporativa todavía).
```

---

## 17. Plan de handoff a Claude Code

Una vez generados los handoff bundles en Claude Design (1 del DS + 11 prototipos):

**Crear branch** `feat/claude-design-frontend-overhaul` desde `main`.

**Fase 1 — Integrar el Design System (1 PR consolidado):**
- PR0: del DS de Claude Design integrar al monorepo:
  - DS-A (Sesión 1): mergear `tokens.css` con el actual + 12 primitives en `frontend/src/components/ds/primitives/`.
  - DS-B (Sesión 14): 10 cross-cutting en `frontend/src/components/ds/domain/`.
  - DS-C (Sesión 2): reemplazar `AppShell.tsx` con el nuevo shell + cmd-K palette.
- Tests: keyboard nav, focus rings, cmd+K abre desde cualquier ruta, primitives en Storybook.

**Fase 2 — 1 PR por prototipo (pueden ir en paralelo si las personas son distintas):**
- PR1: `/` Home (PROTOTIPO 1) — el más visual, validá con el usuario antes que el resto.
- PR2-3: `/persona/:dni` + `/empresa/:cuit` (PROTOTIPOS 5+6) — juntos, comparten átomo ActorProfile.
- PR4: `/senales` (PROTOTIPO 2)
- PR5: `/dinero` (PROTOTIPO 3)
- PR6: `/actores` (PROTOTIPO 4)
- PR7: `/casos` + `/caso/:id` (PROTOTIPO 7)
- PR8-11: `/watchlist` · `/comparar` · `/metodologia` · `/fuentes` (PROTOTIPOS 8-11), pueden agruparse de a 2 si cada uno es chico.

**Cada PR debe pasar CI**: typecheck + tests + naming-check + audit-trazabilidad + verify-hallazgos.

**Smoke browser local en cada PR**: abrir cada superficie y verificar:
- Sin console.error/warn.
- Keyboard nav funciona (Tab/Esc/Cmd+K).
- Empty states visibles cuando data == null.
- Loading skeletons visibles durante fetch.
- Cmd+K abre palette desde cualquier ruta.

---

## 18. Quality checklist (ARGOS gov-grade)

Antes de mergear el último PR, verificá:

- [ ] Cada superficie tiene empty state explícito con CTA accionable.
- [ ] Cada superficie tiene loading state con skeletons (no spinners).
- [ ] Cada superficie tiene error state con "Reportar" CTA.
- [ ] Cero console.error/warn en navegación normal.
- [ ] Cero `// TODO` en código mergeado a main.
- [ ] Cada señal renderizada lleva `<VerificationBadge>`.
- [ ] Cada CUIT/DNI renderizado en `<span class="font-mono">` o `<MoneyValue>`/`<IdentityBadge>`.
- [ ] Cada link a fuente externa lleva `<SourceLink>` con metadata.
- [ ] Bundle inicial <200KB gzip (con code splitting por ruta lazy).
- [ ] FPS del grafo home con 80 nodos = 60fps en MacBook M1.
- [ ] Lighthouse score Performance ≥90, Accessibility ≥95.
- [ ] Tab navigation completa: Tab/Shift-Tab recorre todos los interactivos en orden lógico.
- [ ] Esc cierra modales/popovers globalmente.
- [ ] No hay strings hardcodeados en inglés en superficies usuario-facing (todo es-AR).
- [ ] No hay paths locales (`C:\Users\...`) ni emails personales en código.
- [ ] LICENSE file en root.
- [ ] README actualizado con screenshots de las 11 superficies nuevas.

---

## 19. Tips finales para usar Claude Design eficiente

1. **Empezá vacío en cada sesión nueva**: no le pongas "continuá donde quedaste". Cada
   prompt acá es self-contained — Claude Design lo lee en frío.

2. **Subí los datos de muestra como JSON file**, no inline cada vez: Claude Design los
   referencia y no inventa shapes.

3. **Si propone purple gradient o glassmorphism**: cortá. Pedí "anti-AI aesthetic — esto
   debe verse como Maltego, no como Figma Community templates".

4. **Iteración corta**: cada artifact de Claude Design generá 1-2 ciclos de feedback antes
   de pasar al próximo. Más de 5 iteraciones = el prompt original estaba mal.

5. **Para los grafos no esperes que Claude Design implemente Sigma.js a la perfección**:
   pedile el JSX wrapper + props + estados, y dejá la lógica de Sigma para el handoff a
   Claude Code (vos tenés el código actual de `HomeAdapter` + `useGrafoJerarquiaV2`).

6. **Después de cada superficie generada**, pegá un screenshot del resultado en la siguiente
   sesión con "este es el estado de /home, mantené consistencia visual" — fuerza coherencia.

7. **Custom slider trick**: cuando Claude Design ofrezca crear un slider para "densidad" o
   "espaciado", aceptá — le da control fino que es difícil expresar en texto.

8. **Si necesitás reaccionar a feedback del usuario sin abrir nueva sesión**: usá el
   web-capture tool sobre cualquier ARGOS-V4 screenshot y pedí "esto es lo que NO quiero".
