# PLAN-FRONTEND-EJECUCION — ARGOS graph-first home

> Versión: 1.0 · Fecha: 2026-04-29 · Estado: **PENDIENTE APROBACIÓN**
> Branch: `claude/argos-graph-first-home` (creada desde `claude/chat-first-ui-design-aWg0V`)
> Autor: Claude (sesión Frontend ARGOS)
> Spec madre: `docs/PLAN-UI.md` v1.1

Este documento traduce la decisión tomada en sesión (`B A A A B A`) en pasos verificables. Cada bloque es **commiteable de forma independiente**. Al final de cada bloque se hace smoke visual y push.

---

## Decisiones aprobadas (origen sesión 2026-04-29)

| ID | Decisión | Implicancia |
|---|---|---|
| **P1** | Crear rama nueva `claude/argos-graph-first-home` desde `chat-first-ui-design-aWg0V` | No piso la rama del Claude anterior. Lautaro mergea cuando esté conforme |
| **P2** | `/` debe ser Explorar evolucionado · `/explorar` redirige a `/` | El home deja de ser dashboard. La primera impresión es el grafo vivo |
| **P3** | Borrar `pages/Landing.tsx` y `pages/Mapa.tsx` | Cero código muerto. Limpieza honesta |
| **P4** | Movimiento sutil continuo en el grafo + respeto `prefers-reduced-motion` | El grafo "respira". Sensación viva sin distraer |
| **P5** | Profile (`/persona/:dni`, `/empresa/:cuit`): grafo arriba pantalla completa, datos abajo en scroll | Perfil graph-first coherente con la home |
| **P6** | Plan completo en docs antes de codear · aprobás · entonces codeo | Este documento |

---

## Anti-goals reafirmados (de `prompt-maestro` §11)

- ❌ NO crear superficies dashboard (Sankey grande, tabla densa Bloomberg, two-pane)
- ❌ NO usar `<select>` o forms para navegación principal
- ❌ NO mostrar fixtures sin banner DATOS SINTÉTICOS
- ❌ NO copy acusatorio
- ❌ NO breaking changes a `/api/*` (backend estable)
- ❌ NO commitear sin verificación visual

---

## Bloque 0 · Setup (15 min · ya parcialmente hecho)

| Paso | Estado |
|---|---|
| `git fetch origin` y pull de 37 commits pendientes | ✅ hecho |
| Crear rama `claude/argos-graph-first-home` desde `chat-first-ui-design-aWg0V` | ✅ hecho |
| `npm install` backend + frontend | ✅ hecho (exit 0) |
| Instalar Playwright Python para smoke visual | ⏳ pendiente — `pip install playwright && playwright install chromium` |
| Levantar backend (`npm run dev` en `backend/`) | ⏳ on demand |
| Levantar frontend (`npm run dev` en `frontend/`) | ⏳ on demand |
| Capturar screenshot del estado actual de `/` (Landing fase D) | ⏳ pendiente, primer paso del Bloque 1 |

**Criterio de hecho**: Playwright instalado, screenshots `before/landing-actual.png` y `before/explorar-actual.png` existen en `docs/screenshots/`.

---

## Bloque 1 · Home graph-first (P2 + P3 + P4)

**Objetivo**: cuando el usuario entra a `/`, ve el grafo de Explorar evolucionado en lugar del Landing dashboard.

### 1.1 Mover Explorar a `/` y redirect de `/explorar`

Archivo: `frontend/src/App.tsx`

**Cambio quirúrgico** (sin tocar nada más):
```tsx
// ANTES (línea 65):
<Route path="/" element={<Landing />} />
// ... 200+ líneas más abajo:
<Route path="/explorar" element={<Suspense...><Explorar /></Suspense>} />

// DESPUÉS:
<Route path="/" element={<Suspense fallback={<PageLoader />}><Explorar /></Suspense>} />
<Route path="/explorar" element={<Navigate to="/" replace />} />
// + remover el import de Landing
```

**Por qué `<Navigate to="/" replace />`** y no `<Redirect>`: react-router v6 deprecó Redirect. `replace` evita que el usuario pueda volver a `/explorar` con el botón atrás (la URL queda limpia).

### 1.2 Borrar archivos muertos

```bash
rm frontend/src/pages/Landing.tsx
rm frontend/src/pages/Mapa.tsx
```

Después: buscar imports rotos de `Landing` o `Mapa` en el resto del código y limpiar.

### 1.3 Movimiento sutil continuo en el grafo

Archivo: `frontend/src/components/argos/GraphCanvas.tsx`

La simulación d3-force ya existe. Necesito:

- (a) **No dejar que `alpha` baje a 0**. Mantener `alphaTarget(0.005)` en idle (valor pequeño, suficiente para que los nodos floten sutilmente).
- (b) **Respetar `prefers-reduced-motion`**: si el usuario lo activó en su SO, `alphaTarget(0)` y nodos quietos.

Pseudocódigo del cambio:
```ts
const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
const idleAlpha = reducedMotion ? 0 : 0.005

// donde hoy hace simulation.alpha(0).stop() para idle:
simulation.alphaTarget(idleAlpha).restart()
```

**Costo CPU**: con `alphaTarget=0.005` y 80 nodos, el ticker de d3 itera muy poco por frame. Imperceptible en un laptop moderno.

### 1.4 Smoke visual

Levantar backend + frontend, abrir `/`, capturar:
- `docs/screenshots/after-bloque-1/home-graph.png` (estado en reposo, ~10s después de cargar)
- `docs/screenshots/after-bloque-1/home-graph-hover.png` (con hover sobre un nodo)
- `docs/screenshots/after-bloque-1/explorar-redirect.png` (visitar `/explorar` y confirmar que termina en `/`)

### 1.5 Commit

```
feat(home): / es Explorar graph-first · borra Landing y Mapa muertos
```

**Criterio de hecho**: `/` muestra el grafo con stagger inicial + movimiento sutil continuo. `/explorar` redirige a `/`. Ningún import roto. Typecheck OK.

---

## Bloque 2 · Profile graph-first (P5)

**Objetivo**: `/persona/:dni` y `/empresa/:cuit` se sienten como ARGOS, no como Bloomberg.

Hoy ambos usan `ProfileTwoPane.tsx` (Phase D, dashboard-style).

### 2.1 Diseño objetivo (mockup ASCII)

**`/persona/:dni`**:
```
┌─────────────────────────────────────────────────────────────┐
│ ← Inicio    LOPEZ JUAN PEREZ · DNI 12.345.678  [✓ Verif]    │  ← header pequeño (~64px)
│ Funcionario activo · Director de 2 empresas · Ente Estatal  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│            ●                                                │
│       ·    ·    ·                                           │
│   ●    LOPEZ JUAN     ·                                     │  ← Grafo de relaciones
│       ·    ·    ·         ego(2 grados)                     │     a pantalla completa
│            ●                                                │     (~70vh)
│                                                             │
│                                                             │
│ [Expandir: 1° 2° 3°]   [Visibles: 23 / cap 500]    [↺]     │
├─────────────────────────────────────────────────────────────┤
│ ↓ scroll                                                    │
│                                                             │
│ Cargos públicos        │  Direcciones en empresas           │
│ • Concejal 2019-2023   │  • CUIT 30-12... (2018-)           │
│ • Asesor 2024-         │  • CUIT 30-99... (2020-2023)       │
│                                                             │
│ DDJJ patrimoniales     │  Aportes a campaña                 │
│ Señales asociadas (3)  │  Fuentes (12 URLs)                 │
└─────────────────────────────────────────────────────────────┘
```

**`/empresa/:cuit`**: idéntica estructura, ego-graph centrado en el CUIT, datos abajo.

### 2.2 Componente nuevo: `<ProfileGraphFirst>`

Archivo: `frontend/src/components/argos/ProfileGraphFirst.tsx` (a crear)

Reutiliza:
- `<GraphCanvas>` (mismo que `/`, pero con grafo bounded al ego del actor)
- Datos del actor desde el endpoint correspondiente (`/api/profile/persona/:dni` o `/api/profile/empresa/:cuit`)
- `<VerificacionBadge>` (existente)
- `<IdentityBadge>` (existente)
- `<TierBadge>` (existente)

Props:
```ts
interface Props {
  actor: PersonaProfile | EmpresaProfile
  egoGraph: ArgosGraph
  loading: boolean
}
```

Layout interno:
- `header` (sticky top, h-16): nombre, ID, badges, botón volver
- `main` (h-[70vh]): GraphCanvas con egoGraph
- `controls` (overlay top-right del canvas): expandir grados (1°/2°/3°), reset
- `details` (scroll vertical debajo): grilla 2-col responsiva con secciones

### 2.3 Refactor `pages/Persona.tsx` y `pages/Empresa.tsx`

Reemplazar el render actual (que usa `ProfileTwoPane`) por:
```tsx
<ProfileGraphFirst actor={data} egoGraph={egoGraph} loading={isLoading} />
```

El fetch al backend y el manejo de error/loading se conserva tal cual. Solo cambia la presentación.

### 2.4 Eliminar `ProfileTwoPane.tsx`

Una vez que Persona y Empresa usen `ProfileGraphFirst`, `ProfileTwoPane` queda huérfano. Borrar.

### 2.5 Smoke visual

- `docs/screenshots/after-bloque-2/persona-real.png` (DNI fijo conocido, ej. uno con datos verificados)
- `docs/screenshots/after-bloque-2/empresa-real.png` (CUIT fijo conocido, ej. el de un ente estatal)
- `docs/screenshots/after-bloque-2/persona-no-existe.png` (404 graceful)

### 2.6 Commit(s)

Dos commits granulares:
```
feat(profile): componente ProfileGraphFirst · grafo + scroll de datos
refactor(profile): Persona y Empresa usan ProfileGraphFirst · borra TwoPane
```

**Criterio de hecho**: Ambos perfiles muestran su ego-graph como elemento principal. `ProfileTwoPane` no se referencia desde ningún lado. Typecheck OK. Los 3 screenshots existen.

---

## Bloque 3 · Validación cross-superficie

**Objetivo**: confirmar que las 14 páginas que NO se tocaron siguen funcionando.

### 3.1 Lista de superficies a validar

| Ruta | Página | Smoke esperado |
|---|---|---|
| `/dinero` | Dinero.tsx | Sankey carga, drill funciona |
| `/senales` | Senales.tsx | Feed renderiza, badges visibles |
| `/actores` | ActoresD6.tsx | Search funciona, resultados clickables |
| `/casos` | CasosD7.tsx | Lista de casos persistida |
| `/caso/:id` | CasoD7.tsx | Workspace carga |
| `/watchlist` | WatchlistD8.tsx | Feed alertas |
| `/comparar` | Comparar.tsx | 2 empresas side-by-side |
| `/metodologia` | Metodologia.tsx | TOC + demos |
| `/dashboard` | Dashboard.tsx | KPIs (legacy AppShell) |
| `/entidad/:nombre` | Entidad.tsx | Tabs |
| `/contrato/:hash` | Contrato.tsx | Cadena de custodia |
| `/red` | Red.tsx | Cytoscape |
| `/fuentes` | Fuentes.tsx | Procedencia |
| `/cobertura`, `/huecos` | Cobertura.tsx, Huecos.tsx | Datos visibles |

### 3.2 Procedimiento

Script Playwright que recorre las 14 rutas, captura screenshot, lee `console.errors`, falla si encuentra error runtime.

Output: `docs/screenshots/regression/<ruta>.png` + `docs/screenshots/regression/console-errors.json`.

### 3.3 Commit (solo si hay regresiones)

Si Bloque 1+2 rompió algo, fix granular. Si no, este bloque es solo verificación.

**Criterio de hecho**: 14 rutas sin errores en console del browser. Si hay errores que ya estaban antes del Bloque 1, los marco como pre-existentes y no los toco en este sprint.

---

## Bloque 4 · Push y PR

```bash
git push -u origin claude/argos-graph-first-home
```

Crear PR draft contra `claude/chat-first-ui-design-aWg0V` con:
- Lista de cambios
- Screenshots before/after de `/`, `/persona/:dni`, `/empresa/:cuit`
- Mención: "no se modificaron las 14 superficies legacy / Phase D restantes"

---

## Cuestiones abiertas a decidir DURANTE la ejecución

Estas las resuelvo en el momento si son chicas, o vuelvo a preguntarte si son visuales:

### Q1 — Cuando movemos Explorar a `/`, ¿cómo se ve la transición a Persona/Empresa?

ExplorarLayout es **fullscreen sin AppShell** (sidebar y header propios).
AppShell tiene su propia sidebar y header diferentes.

Hoy: `/` → ExplorarLayout fullscreen. Click en nodo → `/persona/:dni` → entra a AppShell **diferente**. **Inconsistencia visual.**

**Mi propuesta**: `/persona/:dni` y `/empresa/:cuit` también salen del AppShell y usan la misma sidebar de ExplorarLayout. Coherencia total.

⚠️ **Si esto te suena bien, lo aplico en Bloque 2 sin volver a preguntar. Si querés mantener AppShell para perfiles, decímelo ANTES de aprobar este plan.**

### Q2 — Stat del header "5 jurisdicciones · 22 proveedores · 8 señales activas · datos al 25-04-2026"

Los 22 proveedores no tengo de dónde sacarlos honestamente. Opciones:
- (a) Quitar el conteo de proveedores y dejar "5 jurisdicciones · 8 señales · 1.39M actores · datos al…" (todo trazable)
- (b) Mantener el formato pero cablear 22 a algo verificable (ej. "proveedores con señales graves" si ese conteo existe)

Te aviso cuando llegue al header.

### Q3 — Banner DATOS SINTÉTICOS

El backend tiene endpoints reales (`/api/profile/persona/:dni`). Solo se cae a fixtures si la BD no responde.
Voy a preservar el banner que ya implementó el Claude anterior, pero verifico que se muestre correctamente cuando aplica. Si lo encuentro roto, fix granular.

---

## Lo que NO está en este plan (deuda explícita)

- Refactor de las 9 páginas Phase D restantes (Dinero, Senales, Actores, Casos, Watchlist, Comparar, Metodologia, etc.) — son 7K+ LOC del Claude anterior. Sin más decisiones tuyas, las dejo intactas en este sprint.
- Cambios al backend
- Auth real con Supabase (deuda de `project_argos_auth_pendiente.md`)
- Mobile (degrade graceful) — lo dejo para sprint posterior; en este me enfoco en desktop

---

## Estimación

- **Bloque 0**: 15 min (parcialmente hecho)
- **Bloque 1**: 45 min — 1 commit
- **Bloque 2**: 2 h — 2 commits
- **Bloque 3**: 30 min validación + (si hay) 1 commit fix
- **Bloque 4**: 15 min push + PR draft

**Total**: ~3h 45min de codeo neto + smoke visual.

---

## Para aprobar

Si me decís "**dale**" o "**aprobado**" arranco con Bloque 1 inmediatamente.
Si querés ajustar algo, indicame qué bloque cambiar.
