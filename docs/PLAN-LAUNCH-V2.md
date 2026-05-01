# Plan Launch v2 — Premium UI Overhaul

> **Estado**: 2026-05-01 — En construcción.
> **Reemplaza**: el plan inicial `bueno-el-landing-esta-spicy-newell.md` (M1-M5 ya implementadas pero la calidad visual no llegó al estándar gubernamental que el proyecto necesita).

---

## Contexto

Después de la primera ronda (M1 jerarquía + M1.7 visual + M3 bidirectional + M4 rebrand + M2 split layouts + M5 audit), el usuario revisó cada superficie y reportó issues que indican un problema de raíz:

> **El frontend actual tiene ARQUITECTURA correcta (split layouts, hooks reusables, datos reales del backend) pero EJECUCIÓN VISUAL amateur.** No transmite "herramienta de inteligencia gubernamental" — transmite "demo en MS Paint".

### Issues reportados por el usuario (consolidados)

**Home (`/`)** — la primera impresión:
- Grafo es "una bola de círculos" sin orden visible
- No hay distinción visual entre tipos (Estado vs Repartición vs Empresa) — todos son círculos blancos/celestes
- El usuario espera ver: **Provincia → Capital → Ministerios → Agencias → Empresas privadas** con vínculos = contratos, cada tipo distinguible (forma, color, icono, label)
- Barra de búsqueda al recibir focus se queda en el medio (no se reposiciona para dar protagonismo al grafo)
- Click en nodo → queda detrás de la barra (z-index roto)
- El frame de la search bar no tiene contraste visual suficiente

**Dinero**:
- Sankey "está muerto" — el usuario sospecha mock data residual (CONFIRMAR: el commit `dc71122` removió drill, pero queda algo más?)
- Grafo del split inferior no se puede ver directamente (overflow / z-index / altura)
- Las tabs de filtrado "no sirven" — filtros no disparan refetch real

**Señales**:
- Layout OK
- Grafo no se ve / al scrollear se agranda incontrolablemente (ResizeObserver loop?)

**Actores**:
- Página vacía aunque el backend `/api/actores-d6` responde 200 con datos
- Falla de renderizado, no de datos

**Generales**:
- Movilidad/scroll inconsistente entre páginas
- Estilo dark "es lo único decente"
- En general: cero polish, cero microinteractions

### Estándar al que apuntamos

El usuario referencia visualmente: **árbol genealógico** (estructura clara), **herramienta gubernamental nivel Palantir/Maltego/Linkurious** (premium intel-tool aesthetic), **datos reales** (sin mocks), **interactividad fluida**.

---

## Filosofía del rediseño

1. **Información primero, decoración después.** Cada pixel debe servir a entender los datos reales que están abajo. Si no aporta a la comprensión del gasto público, fuera.

2. **Taxonomía visual estricta.** Cada tipo de entidad (Estado, Repartición, Empresa, Persona) debe ser instantáneamente reconocible por **forma, color, icono y tipografía**. Sin ambigüedad.

3. **Layouts jerárquicos reales.** La jerarquía Estado→Repartición→Empresa debe ser visualmente OBVIA al primer vistazo. Nada de física aleatoria.

4. **Cero datos inventados.** CLAUDE.md §2 literal. Empty states explican qué falta y por qué. Loading states son explícitos.

5. **Design system riguroso.** Una sola fuente de verdad para colores, espaciado, tipografía, motion, elevación. Aplicada uniformemente.

6. **Microinteractions premium.** Transiciones suaves, focus states obvios, keyboard navigation, feedback visual en cada acción.

---

## Plan en olas (waves)

> Cada wave es ~1-2 días. Ejecutadas en orden, con commits frecuentes y testeo entre cada una.

### Wave 0 — Investigación + audit (antes de tocar código)

- 0.1 ✅ Research: forensic/intel UI patterns (Palantir, Maltego, Linkurious) → agente Wave-0-Research
- 0.2 ✅ Audit forense del frontend actual (issues confirmados + no reportados) → agente Wave-0-Audit
- 0.3 ✅ Research técnico: d3-hierarchy, react-force-graph, cytoscape (decisión de stack) → agente Wave-0-Tech

**Output**: este documento completo + decisiones arquitectónicas firmes para Wave 1.

### Wave 1 — Design System Foundation

Antes de tocar páginas, construir las bases:

- 1.1 **Design tokens** (`frontend/src/styles/tokens.css`):
  - Colors: forensic-bg-0/1/2, text-1/2/3, accent-primary/secondary, semantic-danger/warn/success/info, depth-0/1/2/3 colors específicos
  - Spacing scale: 2/4/8/12/16/24/32/48/64
  - Typography: sans (Inter) para UI, mono (JetBrains Mono) para data, type scale (10/11/12/13/14/16/20/24/32 px)
  - Motion: fast (120ms), normal (220ms), slow (380ms), curves (ease-out, ease-in-out, spring)
  - Elevation: 4 niveles de shadow + glass morphism para overlays
  - Z-index scale: base/raised/dropdown/modal/tooltip/notification (10/20/100/1000/2000/3000)

- 1.2 **Taxonomía visual de entidades**:
  - **Estado** (jurisdicción): hexágono grande, color institucional (azul gubernamental), icono "edificio público"
  - **Repartición** (ministerio/secretaría): círculo medio, color por jurisdicción padre, icono según tipo (salud, educación, obras...)
  - **Empresa** (contratista): cuadrado redondeado, color por tier (T1 verificado / T2 inferido / T3 sin verificar), icono "edificio comercial"
  - **Persona** (funcionario): círculo pequeño, color ámbar, icono "persona"
  - **Conflicto/Señal**: diamante, color rojo, glow rojo
  - Cada una con **3 sizes** (small / medium / large) según importancia (monto, severidad)

- 1.3 **Edge taxonomy**:
  - `pertenece_a` (Estado→Repartición): solid line, gris claro, sin label
  - `gano` (Empresa→Repartición): solid line, color por monto (gradient), label monto al hover
  - `tiene_director` (Empresa→Persona): dashed line, ámbar
  - `conflicto_con` (Persona/Empresa→Persona/Empresa): solid red 2px, glow, label severidad
  - `senalado_por` (Empresa→Señal): dotted line

- 1.4 **Component primitives** (audit + consolidate):
  - Button (primary / subtle / ghost / danger) — ya hay `fx-btn-*`, consolidar
  - Badge (severity / tier / type) — taxonomía clara
  - Tooltip — uno solo, posicionamiento smart, RAF-throttled
  - Empty state / Loading state / Error state — un componente reusable cada uno
  - Filter chip — con estado activo claro
  - Search input — con focus state premium

- 1.5 **Decisión de stack para grafo**:
  - Decidir: ¿GraphCanvas custom + d3-hierarchy híbrido O migrar a react-force-graph O usar cytoscape (ya en deps)?
  - Documentar pros/cons en este doc y elegir.

### Wave 2 — Graph as Hero (la transformación clave)

- 2.1 **Layout jerárquico real**:
  - Si stack = d3 custom: usar `d3.hierarchy` + `d3.tree()` o `d3.cluster()` para posiciones iniciales determinísticas, luego `d3-force` solo para "respiración" suave (alphaTarget bajo)
  - Si stack = cytoscape: `cose-bilkent` o `dagre` o `klay` para layout jerárquico
  - El usuario debe ver al primer frame: 1 nodo central (Estado), anillo intermedio (Reparticiones), anillo externo (Empresas), conectados por edges visibles

- 2.2 **Aplicar taxonomía visual** del Wave 1.2 a cada nodo
  - Render con `<polygon points>` para hexágono Estado, `<rect rx>` redondeado para Empresa, etc.
  - Iconos SVG inline en cada nodo (Lucide icons o custom)
  - Tipografía diferenciada por tier (mayor = más bold + más grande)

- 2.3 **Search bar premium**:
  - On focus: animación a la posición top (ease-out 280ms), fade del hero text, grafo crece a fullscreen
  - z-index correcto: search > tooltip > hovered node, pero clicked node nunca queda detrás
  - Frame con border + shadow + blur backdrop bien marcado

- 2.4 **Interacciones del grafo**:
  - Zoom + pan smooth (con d3.zoom o equivalente)
  - Click nodo → focus animation + side panel con detalles (no popover encima del grafo)
  - Esc o click background → unfocus
  - Cmd+K abre búsqueda global con resultados live highlighted en grafo

- 2.5 **Z-index audit completo**:
  - Documentar layers: graph (z=10) → labels (z=15) → tooltip (z=2000) → modal (z=3000)
  - Eliminar conflictos

### Wave 3 — Page UX Overhaul (aplicar design system a cada página)

- 3.1 **Dinero**:
  - Verificar que Sankey muestra datos reales (no mocks)
  - Filtros: TODOS deben disparar refetch (jurisdicción, año, ministerio, destino, monto, tier) — verificar uno a uno
  - Grafo del split inferior: altura fija no overflow, scroll independiente del Sankey, controles zoom visibles
  - Empty state si no hay data para los filtros seleccionados

- 3.2 **Señales**:
  - Resolver el ResizeObserver loop / agrandamiento incontrolado
  - Grafo en el pane derecho con altura fija + scroll-into-view cuando se selecciona señal
  - Selected signal panel: "por qué" + acciones (agregar a caso, copiar URL, marcar verificada)

- 3.3 **Actores**:
  - **DEBUG**: por qué la página renderiza vacía si el endpoint responde 200
  - Aplicar design system completo
  - Bidirectional graph↔table ya implementado, pulir interacciones

- 3.4 **Mis casos**:
  - Aplicar design tokens
  - Estados visuales claros (Borrador / Listo / Generado)
  - Onboarding visible en empty state

- 3.5 **Watchlist**:
  - Aplicar design tokens
  - Estado "tracking" visual

- 3.6 **Comparar**:
  - Layout limpio, comparación side-by-side bien estructurada
  - Empty state cuando no hay 2 empresas seleccionadas

- 3.7 **Fuentes**:
  - Tabla con tier badges consistentes
  - Health indicators

- 3.8 **Metodología**:
  - Solo datos verificados (ya removí los inventados en commit 93ab186)

### Wave 4 — Microinteractions + Polish

- 4.1 Motion: transiciones globales (fade, slide, zoom) con curves consistentes
- 4.2 Focus states: ring outline visible (a11y + premium feel)
- 4.3 Keyboard navigation: Tab, Esc, arrows, Cmd+K, Cmd+Enter
- 4.4 Loading states: skeletons con shimmer, no spinners chocolatadas
- 4.5 Error states: con call-to-action ("Recargar", "Reportar", "Ver fuentes")
- 4.6 Empty states: ilustración + frase + CTA
- 4.7 Tooltips uniforms: posicionamiento smart, RAF-throttled, dark glass

### Wave 5 — Verificación E2E

- 5.1 User journey walkthrough manual de cada página (yo navego, anoto issues)
- 5.2 Performance audit: Lighthouse, bundle size, FPS del grafo con 200+ nodos
- 5.3 Visual regression: screenshots antes/después
- 5.4 a11y check: contraste, focus, keyboard, screen reader basics
- 5.5 Pre-push checklist: typecheck + build + audit-trazabilidad + verify-hallazgos pasan

---

## Decisiones técnicas (post-research Wave 0)

### D1 — Stack para grafo: **mantener GraphCanvas custom + d3-hierarchy**

**Decisión**: A) — GraphCanvas actual (~1148 LOC) + agregar `d3-hierarchy@3` (3KB gzip).

**Razón**: el research técnico (context7) confirma que `d3.cluster()` + `forceX/Y` con strength 0.7-0.9 hacia anclas calculadas da layout jerárquico determinista CON la "respiración" suave que ya tenemos. Trabajo: ~4hs. Cero deps nuevas grandes. Conserva M1.7+M3+M2 ya implementados.

**Plan B reservado**: si tras la Wave 2 el resultado todavía no convence, migrar a `react-force-graph-2d` con `dagMode="radialout"` (OOTB pero implica reescribir M3 bidirectional + M1.7 visual). Last resort.

**Descartado Cytoscape**: aunque ya hay deps + tiene `dagre`/`fcose`/`cose-bilkent` excelentes, migrar el grafo principal duplicaría trabajo y rompería el patrón imperativo SVG (necesario para shadcn `HoverCard` anclado a coordenadas DOM). Mantener Cytoscape solo para `/red` legacy.

### D2 — Library de iconos: **Lucide (ya dep)**

**Decisión**: A) — `lucide-react` ya está en uso (`Building2`, `User`, `Briefcase`, `FileText`, `AlertTriangle` mappean directo a la taxonomía del research forensic).

**Por tipo de entidad**:
- Estado/Repartición: `Building2`
- Persona física: `User` (o iniciales mono si querés visual más Maltego)
- Empresa/Proveedor: `Briefcase`
- Documento/Contrato: `FileText`
- Señal de riesgo: `AlertTriangle`

### D3 — Animation library: **CSS transitions + d3.interpolateZoom para focus**

**Decisión**: C) — sin Framer ni React Spring. Razón: el patrón imperativo de GraphCanvas usa refs + RAF, agregar un sistema de animación React-side rompe la isolation.

**Patrón concreto**:
- Microinteractions UI (botones, hover states): CSS transitions con `--motion-fast` (120ms), `--motion-normal` (220ms), `--motion-slow` (380ms) y curves estándar
- Search-and-focus en grafo: `d3.interpolateZoom` (van Wijk) — recomendación explícita del research forensic, preserva contexto durante el zoom
- Entry transitions de nodos: ya implementado vía CSS class `.node-entering` (M1.7)

---

## Taxonomía visual canónica (del research forensic)

| Entidad | Shape | Color base | Icon | Size | Glyph overlay |
|---|---|---|---|---|---|
| **Estado / Repartición** | Hexágono | `#4A9EFF` (institucional) borde `#1E40AF` | `Building2` | 28-44px (presupuesto) | Escudo NE si ministerio |
| **Persona física** | Círculo | `#94A3B8` borde `#475569` | `User` (o iniciales mono) | 20-28px | Tilde verde NE si DNI verificado · "?" ámbar si Tier 2 |
| **Empresa / Proveedor** | Cuadrado redondeado (rect rx=6) | `#F59E0B` (ámbar) | `Briefcase` | 20-44px (monto) | Bandera NW (offshore=rojo) · "$" si activa |
| **Documento / Contrato** | Diamante (rotated square) | `#22D3EE` (cyan frío) | `FileText` | 16-22px (relevancia) | Lock SHA256 si cadena custodia |
| **Señal de riesgo** | Triángulo invertido | `#EF4444` grave / `#F97316` moderada | `AlertTriangle` | 18px fijo | Halo pulsante si score>80 |

## Edge taxonomy canónica (5 patterns max por viewport)

| Tipo | Estilo | Color | Weight | Arrowhead | Label |
|---|---|---|---|---|---|
| `pertenece_a` (Estado↔Repartición) | Solid | `#475569` gris claro | 1.5px | Sin arrowhead | Oculto |
| `gano` / `contrata` (Empresa→Repartición) | Solid curvo | `#F59E0B` ámbar | 1-6px (log monto) | Triangle target | Hover: "$X · Y contratos" |
| `director_de` (Persona→Empresa) | Dashed `[6,3]` | `#22D3EE` cyan | 1px | Sin arrowhead | "director" zoom>1.5 |
| `sospecha_de` / señal | Dotted animated `[2,4]` | `#EF4444` rojo + glow | 2px | Sin arrowhead | Severidad |
| `coincide_con` (ICIJ/OFAC) | Double-stroke | `#D946EF` magenta | 2.5px | Tee `==` | Permanente "ICIJ Panama / OFAC" |

## Surface scale + tipografía dual (los 5 quick wins)

**Surface scale (LCH, 4 niveles, +5-8% L cada uno)**:
```
--surface-base:    #0B1020   /* fondo absoluto */
--surface-raised:  #141A2E   /* cards, panels */
--surface-overlay: #1E2540   /* dropdown, popover */
--surface-popover: #2A3354   /* tooltip, side panel */
```

**Texto**:
```
--text-primary:   #E5E7EB
--text-secondary: #94A3B8
--text-muted:     #64748B
```

**Tipografía dual (con propósito)**:
- `Inter` o `Geist Sans` — UI labels, headings, párrafos (sans serif clean)
- `JetBrains Mono` o `IBM Plex Mono` — CUITs, DNIs, SHA256, montos exactos, IDs (mono = "dato técnico verificable")

**Stroke widths**: SOLO múltiplos de 0.5 (1, 1.5, 2). Los strokes irregulares = firma #1 de amateur.

**Border radius**: máximo 6px. 12px+ leen "consumer", no "forensic".

---

## BLOCKERS confirmados (del audit Wave 0.2) — atacar PRIMERO

1. **ResizeObserver loop en GraphCanvas:338-346** — setState dentro del RO callback. Causa que en Señales el grafo "se agrande incontrolablemente al scrollear". Fix: debounce con useRef + setTimeout, o mover RO fuera del useEffect lifecycle.

2. **Home graph: todos los nodos son círculos** — no hay diferenciación visual. Fix: aplicar taxonomía (hexágono Estado / círculo Persona / rect Empresa / diamante Doc / triángulo Señal) en GraphCanvas render.

3. **Dinero: Sankey "muerto" + grafo split inferior oculto** — necesita read completo de Dinero.tsx + verificar que filtros disparan refetch. Si hay mock residual, eliminar.

4. **Actores: página vacía pese a endpoint OK** — confirmado: `curl /api/actores-d6` responde 200 con 62+ items. El bug es en frontend rendering. Necesita debug específico.

5. **Search bar z-index** — CSS tiene 11 z-index entre -2 y 7 sin escala formal. Fix: definir scale `--z-base/raised/dropdown/modal/tooltip` y reescribir referencias.

---

## Riesgos

1. **Migración de stack del grafo**: si decidimos cambiar de GraphCanvas a otra cosa, es una refactor grande. Mitigación: solo si trae claras mejoras (el research debe justificar).

2. **Tiempo total**: 5 waves × 1-2 días = 7-14 días. Tenemos hasta septiembre — viable pero requiere foco.

3. **Datos faltantes**: algunas páginas (Dinero drill TOP-10) están vacías porque el endpoint real no existe. Implementar el backend mínimo o documentar como "Coming soon" con estilo.

4. **Performance con 200+ nodos**: si el rediseño bloquea 60fps en hardware promedio, hay que reducir el cap visible o migrar a canvas2d.

---

## Métricas de éxito (cómo sabremos que funcionó)

- Test 1: usuario abre `/`, en <2s ve un árbol genealógico claro (1 root, ~12 reparticiones, ~50 empresas) con cada tipo distinguible visualmente.
- Test 2: usuario hace click en cualquier nodo, NUNCA queda detrás de UI overlays.
- Test 3: usuario navega entre páginas, percibe consistencia visual (mismos botones, mismos badges, mismo dark theme).
- Test 4: usuario abre DevTools, no ve console.error/warn en uso normal.
- Test 5: pageload de cada página <2s, time-to-interactive <3s.
- Test 6: usuario filtra cualquier dropdown, el resultado SE ACTUALIZA visiblemente (no es decorativo).

---

## Próximos pasos inmediatos

1. Esperar reportes de los 3 agentes Wave 0 (research forensic UI + audit + research técnico)
2. Llenar las decisiones D1/D2/D3 de este documento basándome en su research
3. Comenzar Wave 1 (design tokens + taxonomía + primitives)
4. Iterar con el usuario después de cada Wave (mostrar antes/después)
