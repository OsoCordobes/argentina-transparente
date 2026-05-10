# Spec — Grafo Premium · Diseño Definitivo

> **Fecha**: 2026-05-01
> **Brainstorming session**: Q1→Q8 + 5 secciones de diseño consolidado
> **Reemplaza**: Wave 2 reverteado de `docs/PLAN-LAUNCH-V2.md`
> **Próximo paso**: implementation plan vía `superpowers:writing-plans`

---

## Context

El usuario revisó el frontend de ARGOS y reportó: *"el grafo es una bola de círculos sin orden, parece Paint, no herramienta gubernamental nivel Palantir"*. Wave 2 (rebuild visual) fue reverteado tras quedar peor: hexágonos invisibles (fillOp 0.22), 60 labels solapados, search bar sin reposicionar.

Este spec define el **rediseño completo del grafo de ARGOS** alineado a estándar de herramienta forense gubernamental, basado en research forense (Palantir/Maltego/Linkurious/Linear) + entrevista de 7 preguntas con visual companion.

**Principio rector**: CLAUDE.md §2 literal — *"No inventar datos, fuentes, números ni conclusiones. Toda salida importante debe ser verificable."* No hay categorías hardcoded. Todo lo que se renderiza viene de la base de datos cargada con fuentes oficiales.

---

## Decisiones tomadas (con visual companion)

| # | Pregunta | Decisión |
|---|----------|----------|
| Q1 | Layout topológico | **Radial dendrogram** para el home; cada tab elige el layout que mejor aproveche su contenido |
| Q2 | Densidad / 300-500 nodos | **Semantic zoom + viewport-aware**: el renderer mide pixeles disponibles + zoom y filtra por peso. Patrón Google Maps (LOD) |
| Q4 | Tabs como scopes | **1 motor de grafo + adapters por tab**. Cada tab le pasa data inicial, filtro de visibility, controles propios. Estado persiste por tab |
| Q5 | Panel de detalle | **Híbrido**: hover = card flotante mini · click = sidebar slide-in 340px · Esc cierra |
| Q6 | Motion | **Respira** (oscilación 1-2px ciclos 3-4s) + electric wave en entrada (1.5s) + ripple en click (~600ms) |
| Q7 | Background | **Radial gradient sutil** (centro `surface-overlay` → bordes `surface-base` + tinte azul 4%) — sin dot grid ni constellation |
| Q8 | Taxonomía visual | **4 nodos** (Estado/Persona/Empresa/Documento) cada uno **círculo + color + icon Lucide adentro**. **5 aristas** semánticas. Señal = overlay/badge sobre nodos afectados, no nodo flotante. Contrato = arista `contrata` (curva ámbar), reificada solo en `/contrato/:hash`, UTEs y `/caso/:id` |

---

## Filosofía del diseño

1. **Datos reales únicamente**. La estructura del Estado cordobés se carga desde fuentes oficiales (decretos, leyes de creación, padrones). El grafo refleja lo que la DB sabe — nada inventado.
2. **Información primero**. Cada pixel debe servir a la lectura del gasto público. Si no aporta a la comprensión, fuera.
3. **Robusto a cualquier zoom**. Far-zoom (puntitos), medium (icons), close (labels + montos), deep (CUITs y hashes). Cero glitches al transicionar.
4. **Performance budget firme**. 50fps con 200 nodos. < 100 MB memoria. Hardware mid-range.
5. **Forense por diseño**. Cada nodo y arista trazables a `fuente_url` + `nivel_confianza`. Badge ⓘ visible si confianza < alto.

---

## Arquitectura

### 3 capas

**Capa A — Graph Engine (core)** — agnóstico al dominio
- Recibe `{nodes, edges, layout, zoomState, viewport}` y renderiza
- `d3.cluster()` radial (default) + futuro soporte `d3.tree()` vertical
- Simulación con anclas (forceX/forceY strength 0.85, charge -15, alphaTarget 0.0015 = oscilación ±1-2px)
- Zoom + pan vía `d3.zoom`
- Semantic LOD: dado `(zoom × viewportArea × weights)` → set de nodos a renderizar
- Triggers de animación: entry wave, focus van Wijk, click ripple

**Capa B — Tab Adapters (lentes de dominio)**
- Cada tab fetchea su endpoint, transforma a shape común, pasa al engine
- Mantiene scope state propio (localStorage)
- Provee controles propios (chips de Señales, sugerencias ghost de Dinero, search+tabla de Actores)

**Capa C — Detail Panel**
- `<GraphHoverCard>` — flotante 240×120 cerca del cursor, RAF-throttled
- `<GraphSidebar>` — slide-in 340px desde derecha al click
- Esc + click background → cierra

---

## Componentes y archivos

### Nuevos

```
frontend/src/components/graph/
├── GraphEngine.tsx              # core renderer (refactor de GraphCanvas)
├── layouts/
│   ├── radial-cluster.ts        # d3.cluster() radial
│   ├── vertical-tree.ts         # d3.tree() top-down (placeholder futuro)
│   └── shared.ts                # tipos NodeAnchor, LayoutResult
├── lod/
│   ├── semantic-zoom.ts         # qué nodos renderizar (zoom × viewport × weight)
│   └── viewport-budget.ts       # pixelBudget = viewportArea / nodeBoundingArea
├── motion/
│   ├── entry-wave.ts            # electric wave que recorre aristas al cargar (~1.5s)
│   ├── click-ripple.ts          # ripple desde nodo clickeado por sus aristas (~600ms)
│   └── breathing.ts             # forceX/forceY anclado, oscilación 1-2px
├── primitives/
│   ├── EntityNode.tsx           # circle + icon Lucide adentro · 4 tipos × 3 zoom levels
│   ├── EdgePath.tsx             # 5 estilos por kind
│   ├── SignalOverlay.tsx        # halo pulsante rojo sobre nodo afectado
│   └── NodeLabel.tsx            # Inter sans para nombres, JetBrains Mono para CUITs
├── interactions/
│   ├── use-zoom-pan.ts          # d3.zoom + wheel + pinch + buttons + Cmd+0
│   ├── use-hover.ts             # hover state RAF-throttled
│   └── use-selection.ts         # click selecciona, Esc/bg deselecciona, ↵ navega
├── overlay/
│   ├── GraphHoverCard.tsx       # extraído del GraphCanvas actual
│   ├── GraphSidebar.tsx         # NUEVO slide-in 340px
│   └── ZoomControls.tsx         # +/−/FIT botones
└── background/
    └── RadialGradient.tsx       # B elegida — radial gradient sutil
```

### Adapters por tab

```
frontend/src/pages/graph-adapters/
├── HomeAdapter.tsx              # /  — overview Provincia + categorías reales (no 8 fijas)
├── DineroAdapter.tsx            # /dinero — raíz + ghost suggestions del usuario
├── SenalesAdapter.tsx           # /senales — filtra por nodos con señales activas
└── ActoresAdapter.tsx           # /actores — split graph + tabla, conserva M3 bidirectional
```

### Refactorizados (legacy compat hasta migración completa)

```
frontend/src/components/argos/GraphCanvas.tsx      → wrapper deprecated, eliminado al final
frontend/src/components/argos/ExplorarLayout.tsx   → integra HomeAdapter
frontend/src/pages/Explorar.tsx                    → render HomeAdapter
frontend/src/pages/Dinero.tsx                      → render DineroAdapter dentro de GraphSplitLayout
frontend/src/pages/Senales.tsx                     → render SenalesAdapter
frontend/src/pages/ActoresD6.tsx                   → render ActoresAdapter
```

**Estrategia de migración progresiva**: 
- PR-1: GraphEngine + HomeAdapter (Explorar.tsx). Resto sigue con GraphCanvas legacy via wrapper.
- PR-2: DineroAdapter
- PR-3: SenalesAdapter
- PR-4: ActoresAdapter (cuidando preservar M3 bidirectional)
- PR-5: borrar GraphCanvas legacy + wrapper

Cada PR es testeable y reversible. Al final el bundle queda limpio.

### Sin tocar

- `frontend/src/components/argos/primitives/` (EntityIcon, EmptyState, LoadingState, ErrorState, TierBadge)
- `frontend/src/styles/tokens.css`
- `frontend/src/styles/argos.css` (z-index scale)
- `frontend/src/hooks/useGraphSelection.ts`
- `backend/src/lib/grafo-jerarquia.ts` (data correcta, solo agrupación cambia)

---

## Taxonomía visual canónica

### Nodos (4 tipos)

| Tipo | Color | Icon | Tamaño |
|------|-------|------|--------|
| **Estado** (Provincia, Ministerio, Repartición, Municipio) | `--entity-estado` `#4A9EFF` | Lucide `Building2` | 14-44px (por presupuesto) |
| **Persona** (Funcionario, Director, Aportante, Denunciante) | `--entity-persona` `#94A3B8` | Lucide `User` | 8-22px |
| **Empresa** (Proveedor, UTE, Cooperativa) | `--entity-empresa` `#F59E0B` | Lucide `Briefcase` | 10-30px (por monto contratado) |
| **Documento** (Boletín, Decreto, Denuncia PDF, DDJJ) | `--entity-documento` `#22D3EE` | Lucide `FileText` | 10-20px |

Todos son **círculos**. Color = tipo. Tamaño = peso. Borde = severidad. **El icon Lucide aparece dentro a partir de zoom medio** (cuando el círculo > 18px).

### Aristas (5 tipos)

| Kind | Estilo | Color | Weight | Arrowhead | Label |
|------|--------|-------|--------|-----------|-------|
| `pertenece_a` (Repartición → Estado) | Solid | `--text-muted` `#64748B` | 1.5px | Sin arrow | Oculto |
| `contrata` (Empresa → Estado) — **el contrato** | Curva bezier | `--entity-empresa` `#F59E0B` | 1-3px (log monto) | Triangle | Hover: monto + nº contratos |
| `dirige` (Persona → Empresa) | Dashed `[6,3]` | `--entity-documento` `#22D3EE` | 1px | Sin arrow | Rol al hover |
| `conflicto_con` (Persona ↔ Empresa) | Solid + glow | `--semantic-danger` `#EF4444` | 2.2px | Sin arrow | Severidad + score |
| `emite` (Estado → Documento) | Dotted `[2,4]` | `--entity-documento` `#22D3EE` | 1.2px | Sin arrow | Tipo decreto |

### Señal — overlay, no nodo

Las señales (patrones detectados por el motor de signals) **no son nodos flotantes**. Son **halos pulsantes rojos** sobre los nodos afectados + badge numérico SE corner (cantidad de señales activas).

### Reificación de contratos (excepción)

Contratos pasan a ser nodos **Documento** en 3 escenarios:
1. Ruta `/contrato/:hash` — el contrato es centro del subgrafo
2. UTEs (3+ empresas firman el mismo contrato) — la arista no aguanta múltiples puntas
3. `/caso/:id` — los contratos del caso anclan señales y anexos

**Visual del contrato reificado**: círculo cyan (Documento) + icono FileText + **borde ámbar 1.5px** indicando que tiene partes contractuales (proveedor + ente público). Distingue contratos de boletines/decretos a primer vistazo.

---

## Data flow

### Backend

**`/api/grafo/jerarquia` rediseñado** — devuelve estructura por niveles de profundidad. Frontend pide por nivel según zoom:

- **Depth 0**: 1 nodo Provincia de Córdoba
- **Depth 1**: entes que dependen DIRECTAMENTE del PE provincial (`depende_de_id = 'gob-cba-prov'`). Agrupados por `tipo + poder` reales — la cantidad de buckets depende de qué hay en la DB
- **Depth 2**: entes que dependen de los nivel-1 (sub-entes) + municipios + empresas estatales
- **Depth 3**: empresas privadas + personas físicas relacionadas con cada nivel-2

**`/api/grafo/sugerencias`** (nuevo) — para Dinero. Dado un nodo seleccionado, devuelve qué nodos agregar al grafo + las próximas sugerencias ghost.

### Expansión del organigrama (CRÍTICO antes del launch)

Hoy `entes_estatales_cordoba` tiene **solo 10 entes pivote** (W1 stub). Pre-launch:

1. **Expandir `build-organigrama-cordoba.ts`** con la estructura real provincial cargada desde:
   - Decreto provincial 1/2023 (estructura PE Llaryora vigente)
   - Decreto provincial 1615/2019 (estructura previa Schiaretti, para histórico)
   - Leyes de creación de entes descentralizados
2. **Nuevo seed `seed-municipios-cordoba.ts`** — los 427 municipios + comunas desde padrón oficial INDEC/Min. Interior
3. **Trazabilidad**: cada ente cargado debe llevar `fuente_url` con la fuente oficial específica + `cargado_en` ISO timestamp

**Estimación**: 3-4 días de trabajo de seeds + curaduría manual con fuentes en mano.

### Caché frontend

- React Query mantiene niveles ya descargados (TTL 5min)
- Persistencia de scope por tab: localStorage (igual que Casos)
- Niveles fetcheados on-demand al cambiar zoom

---

## Estados de UI

### Loading
- **Inicial**: Provincia parpadeando + "Construyendo mapa…" + skeleton circles en posiciones de aterrizaje
- **Cambio de zoom**: nuevos nodos fade-in 220ms, sin bloquear existentes; pulse sutil si tarda > 800ms
- **Cambio de tab**: spinner inline + grafo previo a 30% opacidad

### Empty (honestos, accionables)
- **DB vacía**: "La base de Córdoba está vacía. Corré `npm run seed:cordoba`."
- **Dinero sin presupuesto**: "Necesitás cargar `presupuesto_ejecucion`. Bug B1 documentado."
- **Señales 0 detectadas**: "0 señales en universo cargado. Última corrida: [fecha]." + botón re-correr
- **Filtro vacío**: "Tu filtro no devuelve resultados." + botón limpiar

### Error
- **Backend caído**: banner rojo + reintentar manual
- **Endpoint específico**: solo el componente afectado falla con detalle copiable
- **Datos sucios**: render con badge "datos posiblemente sucios — abrir en raw"

### "Sin datos suficientes"
- Repartición con 0 contratos cargados pero existe en `entes_estatales_cordoba` → nodo gris atenuado + tooltip "ente cargado, 0 contratos hasta ahora"
- Cobertura banner persistente abajo (ya existe del M1)

---

## Interacciones

| Acción | Gesto | Resultado |
|--------|-------|-----------|
| Pan | drag (vacío) | mueve cámara |
| Zoom | wheel · pinch · botones +/− | dispara semantic LOD |
| Hover nodo | mouseover | hover card + halo + atenúa el resto |
| Click nodo | click | sidebar slide-in + selección persistente |
| Doble-click | dblclick | van Wijk zoom-to-node |
| Drag nodo | drag (sobre nodo) | reposiciona ancla custom |
| Cerrar | Esc · click background | cierra sidebar, deselecciona |
| Reset cámara | ⌘0 · botón FIT | overview |
| Búsqueda | ⌘K | command palette → focus en grafo |
| Atajo perfil | ↵ Enter sobre nodo | navega a `/persona/:dni` o `/empresa/:cuit` |

---

## Testing & verificación

### Automático en CI
1. TypeScript strict + build (existente)
2. Unit tests del LOD calculator
3. Snapshot test del adapter de cada tab
4. Test del backend `/api/grafo/jerarquia` con DB de prueba
5. Naming check (existente)
6. **Nuevo**: `verify-no-mocks.ts` — falla si hay arrays hardcodeados con shape de entidades en el frontend

### Visual
1. Screenshots baseline en `docs/screenshots/baseline/`
2. Pixel diff por PR, tolerancia 2%, falla > 5%
3. Walkthrough manual previo a merge importante

### Performance budget
- TTFP home < 1.5s en hardware promedio
- TTI < 2.5s
- ≥ 50fps con 200 nodos visibles
- Memoria del motor < 100 MB

### Cobertura forense
- Cada nodo del grafo con `fuente_url` + `nivel_confianza` (audit-trazabilidad existente)
- Badge ⓘ en cualquier nodo con `nivel_confianza ≠ 'alto'`

### Pre-launch (datos reales completos)
1. Cargar todos los seeds (cordoba, igj, afip, organigrama-expandido, municipios)
2. `npm run analyze --force`
3. Verificación manual de cada tab con datos reales
4. 5 muestras al azar — verificar `fuente_url` lleva a fuente oficial real

---

## Riesgos

1. **Expansión del organigrama**: 3-4 días de trabajo de seeds + curaduría manual con fuentes en mano. Si las fuentes oficiales son inconsistentes (decretos derogados, organigramas desactualizados), el alcance crece. Mitigación: empezar por el organigrama vigente (decreto 1/2023) — los anteriores son "nice to have" históricos.

2. **Performance con 500+ nodos**: el viewport-aware budget garantiza que solo se rendericen los que caben. Pero si el usuario hace zoom out a "ver todo", podría intentar renderizar 500 puntitos. Cap visual: máx 300 nodos rendereados simultáneamente, los excedentes se agrupan en clusters meta-categoría con count.

3. **Migración progresiva tab por tab**: durante la migración pueden coexistir el GraphCanvas legacy y el nuevo GraphEngine. Riesgo de divergencia visual. Mitigación: el wrapper de compat solo es por 1-2 PRs intermedios; merge final del último adapter elimina el legacy.

4. **Datos cargados ≠ realidad**: si el seed del organigrama tiene errores (ente que ya no existe, ministerio renombrado), el grafo refleja la falla. Necesitamos un proceso de validación contra fuente oficial periódica. Mitigación post-launch: alertas automáticas (ya existe el sistema) que detectan drift entre `entes_estatales_cordoba` y nuevos boletines oficiales.

---

## Métricas de éxito

- Test 1: usuario abre `/`, en < 2s ve árbol genealógico claro con Provincia al centro y entes reales agrupados por su `tipo`+`poder` real (no 8 categorías inventadas).
- Test 2: zoom in/out con wheel revela/oculta nodos progresivamente. Cmd+0 vuelve al overview.
- Test 3: click cualquier nodo → sidebar slide-in con datos reales del backend, no placeholders.
- Test 4: cambiar entre tabs preserva el scope construido en cada uno (localStorage).
- Test 5: `/dinero` arranca con 1 nodo Provincia + sugerencias ghost ámbar; click en sugerencia agrega + emite nuevas sugerencias.
- Test 6: `/senales` muestra solo nodos con señales activas + halos pulsantes rojos en los afectados.
- Test 7: cualquier nodo del grafo, click derecho "Ver fuente" → URL oficial verificable.
- Test 8: hardware mid-range (laptop 1366×768 i5 8GB) mantiene > 50fps al pan + zoom.
