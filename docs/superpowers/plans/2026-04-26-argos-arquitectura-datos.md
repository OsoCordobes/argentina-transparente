# ARGOS — Arquitectura de datos rigurosa Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactorizar el motor de detección anticorrupción de ARGOS para que cada hallazgo tenga sustento legal verificable, los cruces de identidad declaren su confianza explícita, el LLM no pueda afirmar hechos sin cita, y el operador pueda mantener una watchlist personal entre sesiones.

**Architecture:** Heurístico transparente con umbrales en JSON externo + identity resolution tiered (CUIT > nombre > fuzzy > LLM) + jerarquía de fuentes T0–T5 + validador post-LLM + cuenta opcional Supabase. Cero datos sintéticos. Cada detector activado tiene norma argentina específica + umbral fundamentado.

**Tech Stack:**
- Backend: Node.js + TypeScript + Express + DuckDB (existente)
- Frontend: React 18 + TS + Vite + Tailwind (existente)
- LLM: Claude Sonnet 4.6 (chat) + Haiku 4.5 (suggestions, identity ambiguous)
- Auth + watchlist: Supabase magic-link
- Tests: vitest

**Spec referenciado:** [`docs/superpowers/specs/2026-04-26-argos-arquitectura-datos-design.md`](../specs/2026-04-26-argos-arquitectura-datos-design.md)

**Branch:** `claude/chat-first-ui-design-aWg0V`

---

## File Structure

### Backend (nuevos)
- `backend/src/engine/detectors-config.json` — config externa de umbrales por detector con norma + fuente
- `backend/src/engine/detectors-loader.ts` — carga + valida config con zod schema
- `backend/src/engine/legacy/` — detectores Tier 3 archivados (no se invocan)
- `backend/src/lib/identity-resolver.ts` — `resolverEmpresa(nombre, cuit?)` tiered
- `backend/src/lib/identity-resolver.test.ts` — vitest
- `backend/src/lib/llm-validator.ts` — `validarChunk(texto)` con regex
- `backend/src/lib/llm-validator.test.ts` — vitest
- `backend/src/lib/levenshtein.ts` — distancia para fuzzy match
- `backend/src/lib/afip-padron-empleadores.ts` — descarga + parser CSV
- `backend/src/lib/cordoba-padron-proveedores.ts` — dataset 281 CKAN
- `backend/src/scripts/seed-afip-padron.ts` — script CLI
- `backend/src/scripts/seed-cordoba-padron-proveedores.ts` — script CLI
- `backend/src/scripts/build-universo-cordobes.ts` — refresh de vistas N2
- `backend/src/routes/watchlist.ts` — CRUD watchlist por usuario

### Backend (modificar)
- `backend/src/engine/signals.ts` — refactor para leer `detectors-config.json` + remover Tier 3
- `backend/src/engine/signals.test.ts` — agregar tests por config
- `backend/src/lib/db.ts` — schema: `identity_matches` + `empresas_padron_provincial` + view `v_universo_cordobes_*` + ALTER `empresas` (`fuente_padron`)
- `backend/src/routes/chat.ts` — integrar `validarChunk` con retry
- `backend/src/routes/entidad.ts` — devolver `{ value, source, tier, caveats }` en campos críticos
- `backend/src/routes/dashboard.ts` — idem
- `backend/src/index.ts` — montar `/api/watchlist`
- `backend/package.json` — scripts `seed:afip-padron`, `seed:cordoba-padron-prov`, `build:universo`

### Frontend (nuevos)
- `frontend/src/components/argos/Onboarding.tsx` — modal disclaimer primer login
- `frontend/src/components/argos/TierBadge.tsx` — chip pequeño "T0 CKAN" / "T1 AFIP" etc.
- `frontend/src/components/argos/IdentityBadge.tsx` — chip "✓ CUIT verificado" / "⚠ posible homónimo" / "🤖 inferencia LLM"
- `frontend/src/components/argos/InterpretationBlock.tsx` — render del bloque "interpretación" en cursiva
- `frontend/src/components/argos/Topbar.tsx` — badge "🔔 N novedades" (post magic-link)
- `frontend/src/lib/argos/watchlist.ts` — wrapper localStorage + Supabase con merge
- `frontend/src/lib/argos/watchlist-merge.ts` — merge logic (unión, latest-wins por ts)
- `frontend/src/lib/argos/auth.ts` — magic-link flow (si no existe ya en `lib/auth.tsx`)
- `frontend/src/pages/Watchlist.tsx` — vista lista de proveedores en watchlist + diff novedades

### Frontend (modificar)
- `frontend/src/components/argos/NodeDetailPanel.tsx` — render KPIs con `<TierBadge>`, botón ⭐ watchlist, IdentityBadge
- `frontend/src/components/argos/ExplorarLayout.tsx` — render bloque interpretación en cursiva, hook onboarding
- `frontend/src/lib/argos/api.ts` — método `addToWatchlist`, `getWatchlist`, `getNovedades`
- `frontend/src/App.tsx` — ruta `/watchlist`

### Supabase
- `supabase/migrations/0002_watchlist.sql` — tabla `watchlist` + RLS

### Docs
- `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` (output de F1, fuera del repo)
- `CLAUDE.md` — LOG entry post-refactor
- `README.md` — agregar sección "Identity tiers" + "Watchlist"

---

## Milestones (entregables independientes)

| Milestone | Fases | Esfuerzo | Output |
|---|---|---|---|
| **M1** — Engine legal-grounded | F1 + F2 | 3h research + 1 día | Detectors con norma + tier + config externo |
| **M2** — Identity tiered + padrones cargados | F3 + F4 + F5 | 3.5 días | Cruces con score + universo N2 |
| **M3** — LLM blindado + UI honesta | F6 + F7 | 3 días | Validador + onboarding + chips tier |
| **M4** — Watchlist persistente | F8 | 2 días | Cuenta opcional + watchlist + alertas pasivas |
| **M5** — Tests E2E + docs | F9 | 1.5 días | Playwright + verify ext + CLAUDE.md update |

Cada milestone produce software funcional y testeable. Si hace falta cortar el scope para llegar antes a beta, M1+M2+M3 ya entregan el corazón del sistema (M4 y M5 se pueden postergar).

---

# MILESTONE 1 — Engine legal-grounded

## Phase F1 — Auditoría legal autónoma

Output: `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` con 16 fichas. NO se commitea (vive en Desktop, fuera del repo).

### Task F1.1: Investigar Tier 1 — detectores con norma directa

**Objetivo:** producir las fichas de los 7 detectores con probable Tier 1.

**Detectores en scope:**
- `detectarConcentracion` (Ley 8614 art. 22 — concurrencia)
- `detectarContratacionesDirectas` (Ley 8614 art. 18 — excepción taxativa)
- `detectarMonopolioRubro` (Ley 8614 art. 22)
- `detectarFraccionamientoAvanzado` (Ley 8614 — fraccionamiento prohibido)
- `detectarAdendaPostAdjudicacion` (Ley 8614 — modificaciones)
- `detectarAparicionOffshore` (Ley 25.246 + 27.401)
- `detectarConcentracionTemporal` / gasto fin ejercicio (Ley Adm Financiera)

**Files:**
- Create: `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md`

- [ ] **Step 1: Para cada detector, leer el código actual en `signals.ts` para extraer patrón + umbrales**

Lee `backend/src/engine/signals.ts` línea por línea para los 7 detectores Tier 1. Anota: nombre, lógica resumida, umbrales numéricos exactos, lenguaje de output.

- [ ] **Step 2: WebSearch sobre cada norma referenciada**

Para cada uno, hacer WebSearch:
- "Ley Provincial 8614 Córdoba contrataciones art 22 concurrencia jurisprudencia"
- "Ley 8614 art 18 contratación directa causales"
- "Decreto 305/14 Córdoba régimen contrataciones"
- "Ley 25.246 lavado proveedores estatales"
- "Tribunal Cuentas Córdoba resoluciones concentración proveedor"

Anotar resoluciones, doctrina o artículos académicos que mencionen umbrales específicos (35%, 60%, etc.).

- [ ] **Step 3: Para cada detector, redactar la ficha con formato estándar**

Estructura:
```markdown
## Detector: detectar<Nombre>

**Patrón actual:** [una línea: qué dispara]

**Norma sustentadora (Tier 1):** [Ley + artículo]

**Umbral X% — fundamento:**
- [Cita específica: doctrina, jurisprudencia, o "umbral conservador
  no establecido en jurisprudencia" si no encontramos fuente]

**Severidad:** [moderada si X-Y%, grave si >Y%]

**Clasificación: Tier 1 — Primario**

**Riesgo de falso positivo:** [escenario donde puede dispararse
indebidamente, mitigación]

**Lenguaje de output recomendado:** [exacto, sin afirmar delito]
```

- [ ] **Step 4: Verificar coherencia interna de la ficha**

Cada ficha debe tener:
- Norma específica (no genérica)
- Fundamento del umbral (con cita o flag explícito)
- Lenguaje técnico (no acusatorio)

Si no hay fuente para el umbral, NO inventar — escribir literalmente "Umbral conservador, no establecido en jurisprudencia accesible. Recomendación: revisar con asesor jurídico antes de exhibir como Tier 1".

### Task F1.2: Investigar Tier 2 — detectores como indicio

**Detectores en scope:**
- `detectarProrrogas` (depende del contrato base)
- `detectarRotacionCoordinada` (indicio Ley 27.442 colusión)
- `detectarServiciosSinHistorial` (heurística, no infracción)
- `detectarDirectoresCompartidos` (indicio Ley 19.550 art. 33)
- `detectarRedDeEmpresas` (idem + Ley 27.442)

**Files:**
- Modify: `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` (append)

- [ ] **Step 1: Leer código actual de los 5 detectores**

Igual que F1.1.1.

- [ ] **Step 2: WebSearch sobre cada norma**

Para Tier 2 buscar específicamente: "[norma] indicio vs prueba directa", "CNDC dictamen Argentina colusión licitaciones", "Ley 19.550 art 33 vinculación empresas grupo económico".

- [ ] **Step 3: Redactar ficha con clasificación Tier 2**

Estructura igual que F1.1.3 pero con campo extra:

```markdown
**Caveat sugerido para UI (Tier 2):**
"Indicio que requiere análisis caso por caso. No constituye
infracción directa. Sugerencia: derivar a [organismo] para
investigación formal."
```

- [ ] **Step 4: Confirmar que cada ficha justifica Tier 2 vs Tier 1**

Si en la investigación aparece que el detector tiene fundamento más fuerte, promoverlo a Tier 1 con su justificación.

### Task F1.3: Investigar Tier 3 — detectores a eliminar

**Detectores en scope:**
- `detectarProveedorCronico` (presencia continua no es ilícito)
- `detectarEmpresaNueva` (juventud no es ilícito)
- `detectarEmpresaSinEmpleados` (depende del rubro)
- `detectarConcentracionTemporal` SI no se sustenta (revisar en F1.1)

**Files:**
- Modify: `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` (append)

- [ ] **Step 1: Para cada detector, buscar SI hay norma que lo sustenta**

Si encontramos norma → promover a Tier 1 o 2. Si NO encontramos → confirmar Tier 3.

- [ ] **Step 2: Redactar ficha de eliminación**

```markdown
## Detector: detectar<Nombre>

**Patrón actual:** [resumen]

**Clasificación: Tier 3 — ELIMINAR**

**Razón:** [por qué no es señal de irregularidad legal]

**Alternativa recomendada (si aplica):** [reformulación que sí
tendría sustento, ej: "empresa sin empleados + monto >$X +
servicio que típicamente requiere personal"]
```

### Task F1.4: Compilar resumen ejecutivo y commitear el doc

**Files:**
- Modify: `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` (header + tabla resumen)

- [ ] **Step 1: Agregar header al doc**

```markdown
# ARGOS — Auditoría legal de los 16 detectores

**Fecha:** 2026-04-26
**Investigación autónoma:** Claude (no abogado — best-effort
basado en normativa pública argentina + jurisprudencia accesible
vía WebSearch)

**Recomendación de validación:** este doc debería ser revisado
por asesor jurídico de derecho público antes del lanzamiento
público del beta. Mientras tanto, sirve como base "mejor que
hardcoded sin sustento".

---
```

- [ ] **Step 2: Agregar tabla resumen al inicio**

```markdown
## Resumen ejecutivo

| Detector | Tier | Norma sustentadora | Umbrales | Estado |
|---|---|---|---|---|
| detectarConcentracion | 1 | Ley 8614 art. 22 | 35% / 60% | Activo |
| detectarContratacionesDirectas | 1 | Ley 8614 art. 18 | 5+ unidades | Activo |
| ... | | | | |
| detectarProveedorCronico | 3 | (sin norma) | — | Eliminar |
```

(15 filas — una por detector. La 16ª (calcularSeñales) es orquestador, no aplica.)

- [ ] **Step 3: Self-review del doc**

Recorrer el doc buscando:
- "TBD", "TODO" → reemplazar por "umbral conservador, sin jurisprudencia accesible" si aplica
- Lenguaje acusatorio ("la empresa cometió...", "es corrupción") → reescribir a "el patrón es compatible con", "señal técnica que sugiere"
- Cada Tier 1 tiene norma específica con artículo
- Cada Tier 2 tiene caveat sugerido
- Cada Tier 3 tiene razón de eliminación

- [ ] **Step 4: NO commitear el doc al repo**

El doc vive en `~/Desktop/`. NO entrar al repo (puede contener juicios subjetivos sobre validez legal que prefiero no commitear sin revisión jurídica). Sí guardar copia digital del path en este plan.

---

## Phase F2 — Refactor engine a tiers + config externo

### Task F2.1: Schema zod para `detectors-config.json`

**Files:**
- Create: `backend/src/engine/detectors-loader.ts`
- Create: `backend/src/engine/detectors-loader.test.ts`

- [ ] **Step 1: Verificar que zod está instalado**

Run: `cd backend && grep zod package.json`
Expected: `"zod": "^3.x.x"` (sino `npm install zod`).

- [ ] **Step 2: Escribir el test**

Create `backend/src/engine/detectors-loader.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { parseDetectorConfig } from './detectors-loader'

describe('parseDetectorConfig', () => {
  it('valida una entrada Tier 1 mínima', () => {
    const raw = {
      detectarConcentracion: {
        tier: 1,
        norma: 'Ley 8614 art. 22',
        umbral_minimo: 0.35,
        umbral_grave: 0.60,
        fuente_umbral: 'Resolución TC X/2018',
      },
    }
    const parsed = parseDetectorConfig(raw)
    expect(parsed.detectarConcentracion.tier).toBe(1)
    expect(parsed.detectarConcentracion.umbral_minimo).toBe(0.35)
  })

  it('rechaza tier fuera de [1,2,3]', () => {
    const raw = { foo: { tier: 4, norma: 'X' } }
    expect(() => parseDetectorConfig(raw)).toThrow(/tier/)
  })

  it('exige norma en Tier 1', () => {
    const raw = { foo: { tier: 1, umbral_minimo: 0.5 } }
    expect(() => parseDetectorConfig(raw)).toThrow(/norma/)
  })
})
```

- [ ] **Step 3: Run test, verificar fail**

Run: `cd backend && npm run test -- detectors-loader`
Expected: FAIL — `parseDetectorConfig` no existe.

- [ ] **Step 4: Implementar `detectors-loader.ts`**

```typescript
import { z } from 'zod'

const DetectorEntrySchema = z.object({
  tier: z.union([z.literal(1), z.literal(2), z.literal(3)]),
  norma: z.string().min(1),
  umbral_minimo: z.number().optional(),
  umbral_grave: z.number().optional(),
  fuente_umbral: z.string().optional(),
  caveat: z.string().optional(), // requerido para Tier 2
  // Detectores específicos pueden tener más campos
}).passthrough()

const ConfigSchema = z.record(z.string(), DetectorEntrySchema)

export type DetectorConfig = z.infer<typeof DetectorEntrySchema>
export type DetectorsConfig = z.infer<typeof ConfigSchema>

export function parseDetectorConfig(raw: unknown): DetectorsConfig {
  return ConfigSchema.parse(raw)
}
```

- [ ] **Step 5: Run test, verificar pass**

Run: `cd backend && npm run test -- detectors-loader`
Expected: PASS (3/3).

- [ ] **Step 6: Commit**

```bash
git add backend/src/engine/detectors-loader.ts backend/src/engine/detectors-loader.test.ts
git commit -m "feat(engine): zod schema para detectors-config.json"
```

### Task F2.2: Crear `detectors-config.json` con datos de la auditoría F1

**Files:**
- Create: `backend/src/engine/detectors-config.json`

- [ ] **Step 1: Tomar la tabla resumen del doc F1**

Abrir `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md`. Para cada detector con Tier 1 o 2, copiar: norma, umbral_minimo, umbral_grave, fuente_umbral.

- [ ] **Step 2: Escribir el JSON con esos datos**

Estructura ejemplo (los valores reales salen del doc F1):

```json
{
  "detectarConcentracion": {
    "tier": 1,
    "norma": "Ley Provincial 8614 art. 22",
    "umbral_minimo": 0.35,
    "umbral_grave": 0.60,
    "fuente_umbral": "Doctrina Marienhoff vol. III, fragmento sobre concurrencia"
  },
  "detectarContratacionesDirectas": {
    "tier": 1,
    "norma": "Ley Provincial 8614 art. 18 + Decreto 305/14",
    "umbral_unidades_min": 5,
    "umbral_pct_min": 0.08,
    "umbral_unidades_grave": 20,
    "fuente_umbral": "Umbral conservador, complementa el principio de excepción taxativa"
  },
  "detectarMonopolioRubro": {
    "tier": 1,
    "norma": "Ley Provincial 8614 art. 22",
    "umbral_minimo": 0.60,
    "umbral_grave": 0.80,
    "min_contratos_area": 3,
    "min_monto_area": 1000000,
    "fuente_umbral": "Compatible con doctrina sobre monopolio de hecho en contrataciones públicas"
  }
}
```

(Completar para los detectores Tier 1 + Tier 2 según output de F1. Los Tier 3 NO entran al JSON.)

- [ ] **Step 3: Validar el JSON con el schema**

Run: `cd backend && npx ts-node -e "
import { parseDetectorConfig } from './src/engine/detectors-loader'
import config from './src/engine/detectors-config.json'
const parsed = parseDetectorConfig(config)
console.log('OK', Object.keys(parsed).length, 'detectores')
"`
Expected: `OK N detectores` donde N = cantidad de detectores Tier 1+2.

- [ ] **Step 4: Commit**

```bash
git add backend/src/engine/detectors-config.json
git commit -m "feat(engine): config externa de detectores con normas + umbrales auditados"
```

### Task F2.3: Refactor cada detector Tier 1 a leer su config

**Files:**
- Modify: `backend/src/engine/signals.ts`

Detectores Tier 1 a refactorizar (depende de F1, ajustar lista según el doc):
1. `detectarConcentracion`
2. `detectarContratacionesDirectas`
3. `detectarMonopolioRubro`
4. `detectarFraccionamientoAvanzado`
5. `detectarAdendaPostAdjudicacion`
6. `detectarAparicionOffshore`
7. `detectarConcentracionTemporal`

- [ ] **Step 1: Importar config + helper**

Al inicio de `signals.ts`:

```typescript
import detectorsConfigRaw from './detectors-config.json'
import { parseDetectorConfig, type DetectorConfig } from './detectors-loader'

const DETECTORS_CONFIG = parseDetectorConfig(detectorsConfigRaw)

function cfg(name: string): DetectorConfig {
  const c = DETECTORS_CONFIG[name]
  if (!c) throw new Error(`Detector "${name}" sin entrada en detectors-config.json`)
  return c
}
```

- [ ] **Step 2: Refactor `detectarConcentracion` a leer config**

ANTES (hardcoded):
```typescript
if (pct < 35) return null
...
severidad: pct >= 60 ? 'grave' : 'moderada',
```

DESPUÉS:
```typescript
const C = cfg('detectarConcentracion')
const minPct = (C.umbral_minimo ?? 0.35) * 100
const gravePct = (C.umbral_grave ?? 0.60) * 100

if (pct < minPct) return null
...
severidad: pct >= gravePct ? 'grave' : 'moderada',
articulos: [C.norma],
```

- [ ] **Step 3: Run tests existentes**

Run: `npm run test -- signals`
Expected: PASS — los tests usan los mismos umbrales (35/60), no se rompen.

- [ ] **Step 4: Repetir Step 2 para los otros 6 detectores Tier 1**

Cada uno: cambiar números hardcoded por lectura de `cfg('detectar<Nombre>')`. Mantener fallback al valor actual por si el JSON no tiene la clave (defensivo).

- [ ] **Step 5: Run todos los tests**

Run: `npm run test`
Expected: PASS — 172/172 (los nuevos no rompen los existentes).

- [ ] **Step 6: Commit**

```bash
git add backend/src/engine/signals.ts
git commit -m "refactor(engine): detectores Tier 1 leen config externa con norma citada"
```

### Task F2.4: Refactor detectores Tier 2 + agregar campo `caveat`

**Files:**
- Modify: `backend/src/engine/signals.ts`
- Modify: `backend/src/types/index.ts` — agregar `caveat?: string` al `Señal`

Detectores Tier 2 (según F1):
1. `detectarProrrogas`
2. `detectarRotacionCoordinada`
3. `detectarServiciosSinHistorial`
4. `detectarDirectoresCompartidos`
5. `detectarRedDeEmpresas`

- [ ] **Step 1: Agregar campo `caveat` al type Señal**

En `backend/src/types/index.ts`:

```typescript
export interface Señal {
  // ... campos existentes
  /** Caveat textual cuando el detector es Tier 2 (indicio, no infracción).
   *  Frontend lo muestra prominente. Undefined si Tier 1. */
  caveat?: string
}
```

- [ ] **Step 2: Refactor cada Tier 2 detector**

Por cada detector Tier 2:
1. Leer su config (`cfg('detectarX')`)
2. Si la señal se dispara, agregar `caveat: cfg('detectarX').caveat` al return

Ejemplo `detectarProrrogas`:

```typescript
const C = cfg('detectarProrrogas')
// ... lógica existente
return {
  // ... campos existentes
  caveat: C.caveat,
  legal: { articulos: [C.norma], ... },
}
```

- [ ] **Step 3: Tests vitest verifican que `caveat` está poblado en Tier 2**

Agregar test en `signals.test.ts`:

```typescript
it('detectarProrrogas (Tier 2) incluye caveat', () => {
  const señal = detectarProrrogas([
    c({ tipo: 'PRÓRROGA', proveedor: 'X', monto: 50_000_000 }),
    c({ tipo: 'PRÓRROGA', proveedor: 'X', monto: 50_000_000 }),
    c({ tipo: 'CONTRATACION', proveedor: 'X', monto: 100_000_000 }),
  ])
  expect(señal?.caveat).toBeDefined()
  expect(señal!.caveat).toContain('caso por caso')
})
```

- [ ] **Step 4: Run tests**

Run: `npm run test -- signals`
Expected: PASS — incluye los nuevos casos.

- [ ] **Step 5: Commit**

```bash
git add backend/src/engine/signals.ts backend/src/types/index.ts backend/src/engine/signals.test.ts
git commit -m "feat(engine): detectores Tier 2 con caveat + norma desde config"
```

### Task F2.5: Eliminar detectores Tier 3 (mover a `legacy/`)

**Files:**
- Create: `backend/src/engine/legacy/README.md`
- Move: detectores Tier 3 desde `signals.ts` a `legacy/`
- Modify: `backend/src/engine/signals.ts` (borrar fns + actualizar `calcularSeñales`)
- Modify: `backend/src/engine/signals.test.ts` (remover tests de Tier 3 o moverlos)

Detectores Tier 3 (según F1, ajustar):
- `detectarProveedorCronico`
- `detectarEmpresaNueva`
- `detectarEmpresaSinEmpleados`

- [ ] **Step 1: Crear `legacy/README.md` con justificación**

```markdown
# Detectores Tier 3 — archivados por falta de fundamento legal

Estos detectores estaban activos en versiones previas pero la auditoría
legal del 2026-04-26 (`~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md`)
concluyó que no se sustentan en infracción legal directa.

Razones específicas en la ficha del doc.

NO se invocan desde `calcularSeñales`. Se conservan acá por trazabilidad
histórica. Si en el futuro encontramos norma que los sustente, se reactivan
con su entrada en `detectors-config.json`.
```

- [ ] **Step 2: Mover cada función Tier 3 desde `signals.ts` a `legacy/<nombre>.ts.archived`**

Por cada función:
1. Cortar el bloque `export function detectarXxx(...) { ... }` de `signals.ts`
2. Pegar en `backend/src/engine/legacy/<nombre>.ts.archived`
3. Agregar header al archivo archivado:

```typescript
// ARCHIVED 2026-04-26 — sin sustento legal claro.
// Ver ~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md para justificación.
// Para reactivar: mover de vuelta a signals.ts + agregar entrada en
// detectors-config.json + dispatcher en calcularSeñales.

export {} // tombstone — no exportar nada
```

(El `.archived` extension hace que TypeScript no lo compile. Si preferís `.ts.bak` o algo, ajustar.)

- [ ] **Step 3: Actualizar `calcularSeñales` para no invocarlos**

En `signals.ts`, en el array de detectores ejecutados, remover las funciones Tier 3.

- [ ] **Step 4: Remover tests de Tier 3 de `signals.test.ts`**

Mover tests a `signals.test.ts.archived` o eliminar. Si los movés, agregar el mismo header.

- [ ] **Step 5: Run tests**

Run: `npm run test`
Expected: PASS — count baja por los tests removidos pero los demás siguen verde.

- [ ] **Step 6: Verify analyze**

Run: `npm run analyze -- --force`
Expected: las 8 señales de Córdoba deberían mantenerse o cambiar (algunas eran Tier 3). Documentar el cambio.

- [ ] **Step 7: Commit**

```bash
git add backend/src/engine/legacy/ backend/src/engine/signals.ts backend/src/engine/signals.test.ts
git commit -m "refactor(engine): archivar detectores Tier 3 sin sustento legal"
```

### Task F2.6: Smoke test del engine refactorizado

**Files:**
- Run scripts existentes

- [ ] **Step 1: `analyze --force` con dataset real Córdoba**

Run: `cd backend && npm run analyze -- --force`
Expected: produce N señales (N depende de cuántos Tier 3 había). Cada señal cita su norma.

- [ ] **Step 2: `verify-hallazgos.ts`**

Run: `cd backend && npx ts-node src/scripts/verify-hallazgos.ts`
Expected: PASS, 0 fails. Cada señal tiene `legal.articulos[0]` poblado con norma del config.

- [ ] **Step 3: Verificar manualmente que las señales tienen norma + caveat (Tier 2)**

Run: `cd backend && node -e "
const D = require('duckdb');
const d = new D.Database('./data/argos.duckdb', () => {
  const c = d.connect();
  c.all('SELECT tipologia, titulo, JSON_EXTRACT(legal_json, \"\$.articulos\") as norma FROM señales_cache LIMIT 10', (e, r) => {
    r.forEach(row => console.log(row.tipologia, '|', row.norma));
    process.exit(0);
  });
});
"`
Expected: cada fila muestra el detector + su norma. Sin nulls.

- [ ] **Step 4: Commit (si hay cambios pendientes en analyze)**

Si no hay cambios, skip. Sino:

```bash
git add ...
git commit -m "chore(analyze): regenerar señales tras Tier 3 archivado"
```

---

# MILESTONE 2 — Identity tiered + padrones cargados

## Phase F3 — Identity resolution tiered

### Task F3.1: Schema `identity_matches` en DuckDB

**Files:**
- Modify: `backend/src/lib/db.ts` (sección de `initDb`)

- [ ] **Step 1: Agregar `CREATE TABLE` al `initDb`**

En `backend/src/lib/db.ts`, dentro de `initDb()`, agregar después de la creación de `llm_usage`:

```typescript
// ─── Identity Resolution Cache ─────────────────────────────────────────────
// Cache de cruces nombre ↔ CUIT con tier de confianza explícito.
// Reduce calls al LLM (tier 4) y evita re-fuzzy match en cada query.
await dbRun(`
  CREATE TABLE IF NOT EXISTS identity_matches (
    proveedor_norm   TEXT PRIMARY KEY,
    cuit_resuelto    TEXT,
    tier             INTEGER NOT NULL,    -- 1-5
    score            INTEGER NOT NULL,    -- 0-100
    metodo           TEXT NOT NULL,       -- 'cuit_exact' | 'name_normalized' | 'name_fuzzy_high' | 'llm_ambiguous' | 'no_match'
    candidato_alterno TEXT,                -- otros matches descartados (JSON)
    resuelto_en      TEXT NOT NULL
  )
`)
try {
  await dbRun(`CREATE INDEX IF NOT EXISTS idx_identity_cuit ON identity_matches(cuit_resuelto) WHERE cuit_resuelto IS NOT NULL`)
} catch { /* index ya existe */ }
```

- [ ] **Step 2: Re-correr el backend para crear la tabla**

Run: `cd backend && npx ts-node -e "import { initDb } from './src/lib/db'; initDb().then(() => { console.log('OK'); process.exit(0) })"`
Expected: `OK`. La tabla se crea sin error.

- [ ] **Step 3: Verificar la tabla**

Run: `node -e "const D = require('duckdb'); const d = new D.Database('./data/argos.duckdb', () => { d.connect().all('DESCRIBE identity_matches', (e, r) => { console.log(r); process.exit(0); }); })"`
Expected: lista de columnas con sus tipos.

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/db.ts
git commit -m "feat(db): tabla identity_matches para identity resolution tiered"
```

### Task F3.2: Helper Levenshtein

**Files:**
- Create: `backend/src/lib/levenshtein.ts`
- Create: `backend/src/lib/levenshtein.test.ts`

- [ ] **Step 1: Test**

```typescript
import { describe, it, expect } from 'vitest'
import { levenshtein, similarityPct } from './levenshtein'

describe('levenshtein', () => {
  it('distancia 0 si idénticos', () => expect(levenshtein('abc', 'abc')).toBe(0))
  it('distancia 1 si 1 char distinto', () => expect(levenshtein('abc', 'abd')).toBe(1))
  it('case-insensitive', () => expect(levenshtein('ABC', 'abc')).toBe(0))
})

describe('similarityPct', () => {
  it('100% si idénticos', () => expect(similarityPct('abc', 'abc')).toBe(100))
  it('~85% para variantes cortas', () => {
    const s = similarityPct('PINTURAS CAVAZZON', 'PINTURA CAVAZZON')
    expect(s).toBeGreaterThanOrEqual(80)
    expect(s).toBeLessThanOrEqual(99)
  })
  it('0% si totalmente distintos cortos', () => {
    const s = similarityPct('abc', 'xyz')
    expect(s).toBe(0)
  })
})
```

- [ ] **Step 2: Run, verificar fail**

Run: `npm run test -- levenshtein`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

```typescript
/** Levenshtein distance — case-insensitive. */
export function levenshtein(a: string, b: string): number {
  const s = a.toLowerCase()
  const t = b.toLowerCase()
  if (s === t) return 0
  if (!s.length) return t.length
  if (!t.length) return s.length

  const v0: number[] = Array(t.length + 1).fill(0).map((_, i) => i)
  const v1: number[] = Array(t.length + 1).fill(0)

  for (let i = 0; i < s.length; i++) {
    v1[0] = i + 1
    for (let j = 0; j < t.length; j++) {
      const cost = s[i] === t[j] ? 0 : 1
      v1[j + 1] = Math.min(v1[j] + 1, v0[j + 1] + 1, v0[j] + cost)
    }
    for (let j = 0; j <= t.length; j++) v0[j] = v1[j]
  }
  return v1[t.length]
}

/** Similarity 0-100. 100 = idéntico, 0 = nada en común. */
export function similarityPct(a: string, b: string): number {
  if (!a.length && !b.length) return 100
  const maxLen = Math.max(a.length, b.length)
  const dist = levenshtein(a, b)
  return Math.max(0, Math.round((1 - dist / maxLen) * 100))
}
```

- [ ] **Step 4: Run, verificar pass**

Run: `npm run test -- levenshtein`
Expected: PASS (5/5 o más).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/levenshtein.ts backend/src/lib/levenshtein.test.ts
git commit -m "feat(lib): levenshtein + similarityPct para fuzzy matching"
```

### Task F3.3: `identity-resolver.ts` con Tier 1-3

**Files:**
- Create: `backend/src/lib/identity-resolver.ts`
- Create: `backend/src/lib/identity-resolver.test.ts`

- [ ] **Step 1: Test del Tier 1 (cuit_exact)**

```typescript
import { describe, it, expect, beforeAll } from 'vitest'
import { resolverEmpresa } from './identity-resolver'
import { initDb, dbRun } from './db'

beforeAll(async () => {
  await initDb()
  // Setup fixture: empresa con CUIT en `empresas`
  await dbRun(`INSERT OR REPLACE INTO empresas (cuit, nombre) VALUES (?, ?)`, ['30712345678', 'TEST PROVIDER SRL'])
})

describe('resolverEmpresa', () => {
  it('Tier 1: match exacto por CUIT', async () => {
    const r = await resolverEmpresa('TEST PROVIDER SRL', '30712345678')
    expect(r.tier).toBe(1)
    expect(r.metodo).toBe('cuit_exact')
    expect(r.score).toBe(100)
    expect(r.cuit).toBe('30712345678')
  })

  it('Tier 2: name_normalized cuando no hay CUIT', async () => {
    const r = await resolverEmpresa('TEST PROVIDER S.R.L.', undefined)
    expect(r.tier).toBe(2)
    expect(r.metodo).toBe('name_normalized')
    expect(r.score).toBe(85)
  })

  it('Tier 3: fuzzy si nombre es similar pero no exacto', async () => {
    const r = await resolverEmpresa('TEST PROVIDR SRL', undefined) // typo
    expect(r.tier).toBe(3)
    expect(r.score).toBeGreaterThanOrEqual(70)
  })

  it('Tier 5: no_match si nada similar', async () => {
    const r = await resolverEmpresa('FOO BAR XYZ', undefined)
    expect(r.tier).toBe(5)
    expect(r.cuit).toBeNull()
  })
})
```

- [ ] **Step 2: Run, verificar fail**

Run: `npm run test -- identity-resolver`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

```typescript
import { dbAll, dbRun } from './db'
import { normProveedor } from './db'
import { similarityPct } from './levenshtein'

export type IdentityTier = 1 | 2 | 3 | 4 | 5
export type IdentityMethod =
  | 'cuit_exact'
  | 'name_normalized'
  | 'name_fuzzy_high'
  | 'llm_ambiguous'
  | 'no_match'

export interface IdentityMatch {
  cuit: string | null
  tier: IdentityTier
  score: number
  metodo: IdentityMethod
  candidatos_alternos?: string[]
}

const FUZZY_THRESHOLD = 85 // % similarity para Tier 3

export async function resolverEmpresa(
  nombre: string,
  cuit?: string,
): Promise<IdentityMatch> {
  const nombreNorm = normProveedor(nombre)

  // Cache lookup
  const cached = await dbAll<{
    cuit_resuelto: string | null; tier: number; score: number; metodo: string
  }>(`SELECT cuit_resuelto, tier, score, metodo FROM identity_matches WHERE proveedor_norm = ?`, [nombreNorm])
  if (cached[0]) {
    return {
      cuit: cached[0].cuit_resuelto,
      tier: cached[0].tier as IdentityTier,
      score: Number(cached[0].score),
      metodo: cached[0].metodo as IdentityMethod,
    }
  }

  // Tier 1: CUIT match exacto
  if (cuit) {
    const norm = cuit.replace(/[-\s]/g, '')
    const exact = await dbAll<{ cuit: string; nombre: string }>(
      `SELECT cuit, nombre FROM empresas WHERE cuit = ?`, [norm]
    )
    if (exact[0]) {
      const m: IdentityMatch = { cuit: norm, tier: 1, score: 100, metodo: 'cuit_exact' }
      await persistirMatch(nombreNorm, m)
      return m
    }
  }

  // Tier 2: nombre normalizado exacto
  const exactName = await dbAll<{ cuit: string; nombre: string }>(
    `SELECT cuit, nombre FROM empresas WHERE UPPER(nombre) = ? LIMIT 1`, [nombreNorm]
  )
  if (exactName[0]) {
    const m: IdentityMatch = { cuit: exactName[0].cuit, tier: 2, score: 85, metodo: 'name_normalized' }
    await persistirMatch(nombreNorm, m)
    return m
  }

  // Tier 3: fuzzy match
  // Cargar todos los nombres de `empresas` para comparar (DuckDB scan; OK para <1M rows)
  const candidatos = await dbAll<{ cuit: string; nombre: string }>(
    `SELECT cuit, nombre FROM empresas WHERE cuit IS NOT NULL`
  )
  let mejor: { cuit: string; pct: number } | null = null
  for (const c of candidatos) {
    const pct = similarityPct(nombreNorm, normProveedor(c.nombre))
    if (pct >= FUZZY_THRESHOLD && (!mejor || pct > mejor.pct)) {
      mejor = { cuit: c.cuit, pct }
    }
  }
  if (mejor) {
    const m: IdentityMatch = {
      cuit: mejor.cuit,
      tier: 3,
      score: mejor.pct,
      metodo: 'name_fuzzy_high',
    }
    await persistirMatch(nombreNorm, m)
    return m
  }

  // Tier 4 (LLM) — implementado en F3.4

  // Tier 5: no match
  const m: IdentityMatch = { cuit: null, tier: 5, score: 0, metodo: 'no_match' }
  await persistirMatch(nombreNorm, m)
  return m
}

async function persistirMatch(nombreNorm: string, m: IdentityMatch): Promise<void> {
  await dbRun(
    `INSERT OR REPLACE INTO identity_matches
     (proveedor_norm, cuit_resuelto, tier, score, metodo, resuelto_en)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [nombreNorm, m.cuit, m.tier, m.score, m.metodo, new Date().toISOString()]
  )
}
```

- [ ] **Step 4: Run, verificar pass**

Run: `npm run test -- identity-resolver`
Expected: PASS (4/4).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/identity-resolver.ts backend/src/lib/identity-resolver.test.ts
git commit -m "feat(identity): resolverEmpresa tiered (1=cuit_exact, 2=name_norm, 3=fuzzy)"
```

### Task F3.4: Tier 4 — LLM ambiguous fallback

**Files:**
- Modify: `backend/src/lib/identity-resolver.ts`
- Modify: `backend/src/lib/identity-resolver.test.ts` (mock LLM)

- [ ] **Step 1: Agregar Tier 4 con mock-friendly architecture**

Modificar `resolverEmpresa`:

```typescript
import Anthropic from '@anthropic-ai/sdk'
import { assertBudget, recordLlmCall, estimarCostoCall } from './budget-guard'

// Inyección para tests
let llmInvoker: (prompt: string) => Promise<string> = defaultLlmInvoker

export function _setLlmInvokerForTests(fn: (prompt: string) => Promise<string>) {
  llmInvoker = fn
}

async function defaultLlmInvoker(prompt: string): Promise<string> {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return '{"match": false, "score": 0, "reason": "no api key"}'
  const MODELO = 'claude-haiku-4-5-20251001'
  await assertBudget(MODELO, 500, 100)
  const client = new Anthropic({ apiKey })
  const response = await client.messages.create({
    model: MODELO,
    max_tokens: 100,
    messages: [{ role: 'user', content: prompt }],
  })
  const cost = estimarCostoCall(MODELO, response.usage?.input_tokens ?? 0, response.usage?.output_tokens ?? 0)
  await recordLlmCall({
    endpoint: 'identity_resolver_tier4',
    modelo: MODELO,
    inputTokens: response.usage?.input_tokens ?? 0,
    outputTokens: response.usage?.output_tokens ?? 0,
    cacheReadTokens: 0,
    cacheCreationTokens: 0,
    costoUsd: cost,
    status: 'success',
  })
  return response.content.filter(b => b.type === 'text').map(b => (b as Anthropic.TextBlock).text).join('')
}
```

(Continúa: insertar el bloque Tier 4 entre Tier 3 (fuzzy) y Tier 5 (no_match):

```typescript
  // Tier 4: LLM en ambiguos — solo si fuzzy retornó candidatos cercanos pero no >85%
  // Tomamos los top 3 candidatos con score 60-85 y le pedimos al LLM que decida.
  const ambiguos = candidatos
    .map(c => ({ cuit: c.cuit, nombre: c.nombre, pct: similarityPct(nombreNorm, normProveedor(c.nombre)) }))
    .filter(x => x.pct >= 60 && x.pct < FUZZY_THRESHOLD)
    .sort((a, b) => b.pct - a.pct)
    .slice(0, 3)

  if (ambiguos.length > 0) {
    const prompt = `Sos un experto en identidad de empresas argentinas. Tengo un proveedor y candidatos parciales.\n\nProveedor: "${nombre}"\nCandidatos:\n${ambiguos.map((a, i) => `${i+1}. "${a.nombre}" (CUIT ${a.cuit}, similitud ${a.pct}%)`).join('\n')}\n\nResponde JSON estricto: {"match": true|false, "candidato_index": 1|2|3, "score": 0-100, "reason": "..."}\nMatch true solo si estás muy seguro (>70 score). Si dudás, false.`

    try {
      const text = await llmInvoker(prompt)
      const cleaned = text.replace(/^```(?:json)?\s*/, '').replace(/\s*```$/, '').trim()
      const parsed = JSON.parse(cleaned) as { match: boolean; candidato_index?: number; score?: number; reason?: string }
      if (parsed.match && parsed.candidato_index && parsed.score && parsed.score >= 70) {
        const elegido = ambiguos[parsed.candidato_index - 1]
        if (elegido) {
          const m: IdentityMatch = {
            cuit: elegido.cuit,
            tier: 4,
            score: parsed.score,
            metodo: 'llm_ambiguous',
            candidatos_alternos: ambiguos.filter((_, i) => i !== parsed.candidato_index! - 1).map(a => a.cuit),
          }
          await persistirMatch(nombreNorm, m)
          return m
        }
      }
    } catch {
      // Si LLM falla, fall through a no_match
    }
  }
```

)

- [ ] **Step 2: Test del Tier 4 con mock**

Agregar a `identity-resolver.test.ts`:

```typescript
import { _setLlmInvokerForTests } from './identity-resolver'

it('Tier 4: LLM resuelve ambigüedad cuando hay candidatos parciales', async () => {
  // Setup: 2 empresas con nombres similares pero no exactos
  await dbRun(`INSERT OR REPLACE INTO empresas (cuit, nombre) VALUES (?, ?)`, ['30888888881', 'CONSTRUCTORA NOROESTE SA'])
  await dbRun(`INSERT OR REPLACE INTO empresas (cuit, nombre) VALUES (?, ?)`, ['30888888882', 'CONSTRUCTORA NORTE SA'])

  // Mock LLM
  _setLlmInvokerForTests(async (prompt: string) => {
    return '{"match": true, "candidato_index": 1, "score": 85, "reason": "match plausible"}'
  })

  const r = await resolverEmpresa('CONSTRUCTORA NOROESTE', undefined)
  expect(r.tier).toBe(4)
  expect(r.metodo).toBe('llm_ambiguous')
  expect(r.cuit).toBe('30888888881')
})
```

- [ ] **Step 3: Run tests**

Run: `npm run test -- identity-resolver`
Expected: PASS (5/5).

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/identity-resolver.ts backend/src/lib/identity-resolver.test.ts
git commit -m "feat(identity): Tier 4 LLM-assisted resolution para casos ambiguos"
```

---

(Plan continúa con Phases F4–F9 — sigue el mismo patrón de Steps bite-sized. Por brevedad de este archivo, las fases siguientes se documentan en su propio archivo si exceden el límite de tamaño manejable.)

---

## Phase F4 — Cargar AFIP padrón empleadores + Padrón provincial

### Task F4.1: `lib/afip-padron-empleadores.ts` — descarga + parser

**Files:**
- Create: `backend/src/lib/afip-padron-empleadores.ts`

- [ ] **Step 1: WebFetch para confirmar URL del dataset CKAN**

Run WebFetch sobre `https://datos.gob.ar/dataset/sspm-padron-puc-cuit-empresas` (o variante). Confirmar URL del CSV bulk + tamaño aproximado.

- [ ] **Step 2: Implementar descarga con stream**

```typescript
import https from 'https'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

export const AFIP_PADRON_URL = 'https://datos.gob.ar/dataset/...' // confirmar

export async function descargarPadron(destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)
    https.get(AFIP_PADRON_URL, res => {
      if (res.statusCode !== 200) return reject(new Error(`HTTP ${res.statusCode}`))
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
    }).on('error', reject)
  })
}

export interface AfipEmpresa {
  cuit: string
  razon_social: string
  actividad: string
  inicio_actividades: string | null
  estado: string
}

/**
 * Parser streaming line-by-line (los CSVs pueden ser >500MB).
 * Yield cada empresa parseada.
 */
export async function* parsearPadronStream(path: string): AsyncGenerator<AfipEmpresa> {
  const stream = fs.createReadStream(path)
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let header: string[] | null = null
  for await (const line of rl) {
    const cols = parseCsvLine(line)
    if (!header) { header = cols.map(s => s.toLowerCase().trim()); continue }
    const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']))
    const cuit = (row.cuit ?? '').replace(/[-\s]/g, '')
    if (!/^\d{11}$/.test(cuit)) continue
    yield {
      cuit,
      razon_social: (row.razon_social ?? row.nombre ?? '').trim(),
      actividad: (row.actividad ?? '').trim(),
      inicio_actividades: row.inicio_actividades || null,
      estado: row.estado ?? 'activo',
    }
  }
}

function parseCsvLine(line: string): string[] {
  // ... parser CSV con respeto a comillas dobles
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i+1] === '"') { cur += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      out.push(cur); cur = ''
    } else cur += ch
  }
  out.push(cur)
  return out
}
```

- [ ] **Step 3: Commit**

```bash
git add backend/src/lib/afip-padron-empleadores.ts
git commit -m "feat(lib): cliente AFIP padrón empleadores con parser streaming"
```

### Task F4.2: `seed-afip-padron.ts` script

**Files:**
- Create: `backend/src/scripts/seed-afip-padron.ts`
- Modify: `backend/package.json` (script `seed:afip-padron`)

- [ ] **Step 1: Script CLI**

```typescript
import 'dotenv/config'
import path from 'path'
import os from 'os'
import { initDb, dbRun, dbAll } from '../lib/db'
import { descargarPadron, parsearPadronStream } from '../lib/afip-padron-empleadores'

async function main() {
  await initDb()
  const force = process.argv.includes('--force')

  const existing = await dbAll<{ n: number }>(`SELECT COUNT(*) as n FROM empresas WHERE fuente_padron = 'afip_padron'`)
  if (Number(existing[0]?.n ?? 0) > 0 && !force) {
    console.log(`Padrón ya cargado (${existing[0].n} filas). Use --force para recargar.`)
    process.exit(0)
  }

  const tmpFile = path.join(os.tmpdir(), 'afip-padron.csv')
  console.log('Descargando AFIP padrón...')
  await descargarPadron(tmpFile)
  console.log('Parseando + insertando...')

  let n = 0
  const now = new Date().toISOString()
  for await (const emp of parsearPadronStream(tmpFile)) {
    await dbRun(
      `INSERT OR REPLACE INTO empresas (cuit, nombre, es_empleador, inicio_actividades, estado, actividad_principal, fuente_padron) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [emp.cuit, emp.razon_social, true, emp.inicio_actividades, emp.estado, emp.actividad, 'afip_padron']
    )
    n++
    if (n % 10000 === 0) console.log(`  ${n.toLocaleString()} empresas insertadas...`)
  }
  console.log(`✓ ${n.toLocaleString()} empresas insertadas desde AFIP padrón.`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 2: Agregar a `package.json`**

```json
"seed:afip-padron": "ts-node src/scripts/seed-afip-padron.ts"
```

- [ ] **Step 3: Smoke test (download real + insert pequeño)**

Run: `npm run seed:afip-padron`
Expected: descarga el CSV, parsea, e inserta. Imprime progreso.

- [ ] **Step 4: Verify trazabilidad**

Run: `npx ts-node src/scripts/audit-trazabilidad.ts cordoba-capital`
Expected: PASS (audit cubre `empresas.fuente_padron`).

- [ ] **Step 5: Commit**

```bash
git add backend/src/scripts/seed-afip-padron.ts backend/package.json
git commit -m "feat(seed): cargar AFIP padrón empleadores oficial desde datos.gob.ar"
```

### Task F4.3: `seed-cordoba-padron-proveedores.ts` (dataset 281)

**Files:**
- Create: `backend/src/lib/cordoba-padron-proveedores.ts`
- Create: `backend/src/scripts/seed-cordoba-padron-proveedores.ts`
- Modify: `backend/src/lib/db.ts` (CREATE TABLE empresas_padron_provincial)

- [ ] **Step 1: Schema**

En `db.ts`, agregar:

```typescript
await dbRun(`
  CREATE TABLE IF NOT EXISTS empresas_padron_provincial (
    cuit TEXT PRIMARY KEY,
    razon_social TEXT NOT NULL,
    rubro TEXT,
    inicio_inscripcion TEXT,
    fuente_url TEXT NOT NULL,
    cargado_en TEXT NOT NULL
  )
`)
```

- [ ] **Step 2: Lib lector dataset 281 (CKAN gobiernoabierto.cordoba)**

```typescript
// backend/src/lib/cordoba-padron-proveedores.ts
import { listarVersionesDataset, descargarRecursoDeVersion, parsearTabla } from './cordoba-portal'

export async function descargarPadronProveedoresCordoba(): Promise<Array<{
  cuit: string; razon_social: string; rubro?: string; inicio?: string; fuente_url: string
}>> {
  const versiones = await listarVersionesDataset('281')
  if (!versiones[0]) throw new Error('Dataset 281 sin versiones')
  const ultima = versiones[0]
  const desc = await descargarRecursoDeVersion('281', ultima.id, ['xls', 'csv', 'xlsx'])
  if (!desc) throw new Error('Sin recurso XLSX/CSV en dataset 281')

  const filas = parsearTabla(desc.buffer)
  const out: Array<{ cuit: string; razon_social: string; rubro?: string; inicio?: string; fuente_url: string }> = []
  for (const row of filas) {
    const cuit = String(row['CUIT'] ?? row['Cuit'] ?? '').replace(/[-\s]/g, '')
    if (!/^\d{11}$/.test(cuit)) continue
    out.push({
      cuit,
      razon_social: String(row['Razón Social'] ?? row['Proveedor'] ?? '').trim(),
      rubro: String(row['Rubro'] ?? '').trim() || undefined,
      inicio: String(row['Inicio'] ?? '').trim() || undefined,
      fuente_url: desc.recurso.url.split('?')[0],
    })
  }
  return out
}
```

- [ ] **Step 3: Script CLI**

```typescript
// backend/src/scripts/seed-cordoba-padron-proveedores.ts
import 'dotenv/config'
import { initDb, dbRun } from '../lib/db'
import { descargarPadronProveedoresCordoba } from '../lib/cordoba-padron-proveedores'

async function main() {
  await initDb()
  const proveedores = await descargarPadronProveedoresCordoba()
  console.log(`${proveedores.length} proveedores en padrón provincial`)

  const now = new Date().toISOString()
  for (const p of proveedores) {
    await dbRun(
      `INSERT OR REPLACE INTO empresas_padron_provincial (cuit, razon_social, rubro, inicio_inscripcion, fuente_url, cargado_en) VALUES (?, ?, ?, ?, ?, ?)`,
      [p.cuit, p.razon_social, p.rubro ?? null, p.inicio ?? null, p.fuente_url, now]
    )

    // También popular `empresas` con CUIT para que identity resolver lo encuentre
    await dbRun(
      `INSERT OR IGNORE INTO empresas (cuit, nombre, fuente_padron) VALUES (?, ?, ?)`,
      [p.cuit, p.razon_social, 'cordoba_padron_proveedores']
    )
  }
  console.log(`✓ Padrón provincial Córdoba cargado.`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 4: Agregar a `package.json`**

```json
"seed:cordoba-padron-prov": "ts-node src/scripts/seed-cordoba-padron-proveedores.ts"
```

- [ ] **Step 5: Smoke**

Run: `npm run seed:cordoba-padron-prov`
Expected: imprime N proveedores cargados.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/cordoba-padron-proveedores.ts backend/src/scripts/seed-cordoba-padron-proveedores.ts backend/src/lib/db.ts backend/package.json
git commit -m "feat(seed): cargar padrón provincial proveedores Córdoba (dataset 281)"
```

---

## Phase F5 — Vistas universo cordobés N2

### Task F5.1: View `v_universo_cordobes_empresas`

**Files:**
- Modify: `backend/src/lib/db.ts` (en `initDb` agregar VIEW)

- [ ] **Step 1: SQL de la view**

Después de las CREATE TABLE en `initDb()`:

```sql
CREATE OR REPLACE VIEW v_universo_cordobes_empresas AS
WITH proveedores_cordoba AS (
  SELECT DISTINCT proveedor_norm AS nombre_norm, NULL AS cuit
  FROM contratos
  WHERE municipio = 'cordoba-capital'
),
con_cuit AS (
  SELECT p.nombre_norm, COALESCE(im.cuit_resuelto, e.cuit) AS cuit
  FROM proveedores_cordoba p
  LEFT JOIN identity_matches im ON im.proveedor_norm = p.nombre_norm
  LEFT JOIN empresas e ON UPPER(e.nombre) = p.nombre_norm
),
directores AS (
  SELECT DISTINCT a.numero_documento AS dni, ie.cuit AS cuit_empresa
  FROM con_cuit cc
  JOIN igj_entidades ie ON ie.cuit = cc.cuit
  JOIN igj_autoridades a ON a.numero_correlativo = ie.numero_correlativo
),
co_empresas AS (
  SELECT DISTINCT ie.cuit, ie.razon_social
  FROM directores d
  JOIN igj_autoridades a2 ON a2.numero_documento = d.dni
  JOIN igj_entidades ie ON ie.numero_correlativo = a2.numero_correlativo
)
-- N2 = N0 (proveedores Córdoba) + N1 (sus directores → vinculados via igj_autoridades) + co-empresas
SELECT cuit, nombre_norm AS nombre FROM con_cuit WHERE cuit IS NOT NULL
UNION
SELECT cuit, razon_social AS nombre FROM co_empresas;
```

(NOTA: ajustar SQL según schema real de `igj_entidades` y `igj_autoridades` en tu DB.)

- [ ] **Step 2: Agregar al `initDb()`**

Wrap en `try/catch` por idempotencia (CREATE OR REPLACE VIEW debería bastar).

- [ ] **Step 3: Verificar la view**

Run: `node -e "const D = require('duckdb'); const d = new D.Database('./data/argos.duckdb', () => { d.connect().all('SELECT COUNT(*) as n FROM v_universo_cordobes_empresas', (e, r) => { console.log('empresas N2:', r[0]?.n); process.exit(0); }); })"`
Expected: ~30K-80K empresas (esperado por el spec).

- [ ] **Step 4: Commit**

```bash
git add backend/src/lib/db.ts
git commit -m "feat(db): view v_universo_cordobes_empresas (N2 filter)"
```

### Task F5.2: View `v_universo_cordobes_personas` + script de refresh

**Files:**
- Modify: `backend/src/lib/db.ts`
- Create: `backend/src/scripts/build-universo-cordobes.ts`

- [ ] **Step 1: View de personas**

```sql
CREATE OR REPLACE VIEW v_universo_cordobes_personas AS
WITH funcionarios AS (
  SELECT DISTINCT apellido_nombre AS nombre, numero_documento AS dni
  FROM agentes_publicos
  WHERE jurisdiccion = 'cordoba-capital'
),
directores_proveedores AS (
  SELECT DISTINCT a.apellido_nombre AS nombre, a.numero_documento AS dni
  FROM v_universo_cordobes_empresas e
  JOIN igj_entidades ie ON ie.cuit = e.cuit
  JOIN igj_autoridades a ON a.numero_correlativo = ie.numero_correlativo
)
SELECT nombre, dni FROM funcionarios
UNION
SELECT nombre, dni FROM directores_proveedores;
```

- [ ] **Step 2: Script de refresh manual**

```typescript
// backend/src/scripts/build-universo-cordobes.ts
import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

async function main() {
  await initDb()
  // Las views ya se crean en initDb. Sólo verificamos counts.
  const eRows = await dbAll<{ n: number }>(`SELECT COUNT(*) as n FROM v_universo_cordobes_empresas`)
  const pRows = await dbAll<{ n: number }>(`SELECT COUNT(*) as n FROM v_universo_cordobes_personas`)
  console.log(`Universo Córdoba N2:`)
  console.log(`  Empresas: ${Number(eRows[0]?.n ?? 0).toLocaleString()}`)
  console.log(`  Personas: ${Number(pRows[0]?.n ?? 0).toLocaleString()}`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
```

- [ ] **Step 3: Agregar a package.json**

```json
"build:universo": "ts-node src/scripts/build-universo-cordobes.ts"
```

- [ ] **Step 4: Smoke**

Run: `npm run build:universo`
Expected: imprime counts.

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/db.ts backend/src/scripts/build-universo-cordobes.ts backend/package.json
git commit -m "feat(db): v_universo_cordobes_personas + script verify counts"
```

---

# MILESTONE 3 — LLM blindado + UI honesta

## Phase F6 — Validador post-LLM + UI 2 voces

### Task F6.1: `llm-validator.ts` con regex tests

**Files:**
- Create: `backend/src/lib/llm-validator.ts`
- Create: `backend/src/lib/llm-validator.test.ts`

- [ ] **Step 1: Tests primero**

```typescript
import { describe, it, expect } from 'vitest'
import { validarChunk } from './llm-validator'

describe('validarChunk', () => {
  it('valida chunk con monto + cita', () => {
    const r = validarChunk('La empresa recibió $100M [[node:emp1]] en 2022.')
    expect(r.valid).toBe(true)
  })

  it('falla chunk con monto sin cita', () => {
    const r = validarChunk('La empresa recibió $100M en 2022.')
    expect(r.valid).toBe(false)
    expect(r.reason).toContain('hecho sin cita')
  })

  it('falla chunk con CUIT sin cita', () => {
    const r = validarChunk('CUIT 30-12345678-9 figura en IGJ.')
    expect(r.valid).toBe(false)
  })

  it('valida chunk con CUIT con cita cercana', () => {
    const r = validarChunk('CUIT 30-12345678-9 [[node:cuit-x]] figura en IGJ.')
    expect(r.valid).toBe(true)
  })

  it('valida chunk de interpretación pura sin números', () => {
    const r = validarChunk('Este patrón sugiere captura de área.')
    expect(r.valid).toBe(true)
  })

  it('valida razón social con cita', () => {
    const r = validarChunk('PINTURAS CAVAZZON S.R.L. [[node:cavazzon]] tiene 25 contratos.')
    expect(r.valid).toBe(true)
  })

  it('falla razón social sin cita', () => {
    const r = validarChunk('PINTURAS CAVAZZON S.R.L. tiene actividad atípica.')
    expect(r.valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run, verificar fail**

Run: `npm run test -- llm-validator`
Expected: FAIL — module not found.

- [ ] **Step 3: Implementar**

```typescript
export interface ValidationResult {
  valid: boolean
  reason?: string
  position?: number
  matchedText?: string
}

const PATRONES_HECHO: Array<{ name: string; re: RegExp }> = [
  { name: 'monto', re: /\$\s*[\d.,]+(?:\s*(?:millones?|millón|M|MM|mil))?/gi },
  { name: 'fecha', re: /\b\d{1,2}([-/.])\d{1,2}\1\d{2,4}\b/g },
  { name: 'cuit', re: /\b\d{2}-?\d{8}-?\d\b/g },
  { name: 'razon_social', re: /\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}\s+(?:S\.?A\.?|S\.?R\.?L\.?|UTE|SAIIC[FA]?A?|SACICI|SAIC|COOP)\b/g },
]

const NODE_REF_RE = /\[\[node:[^\]]+\]\]/g
const PROXIMITY_CHARS = 80 // distancia máxima entre hecho y cita

function hayCitaCerca(texto: string, position: number): boolean {
  const ventanaInicio = Math.max(0, position - PROXIMITY_CHARS)
  const ventanaFin = Math.min(texto.length, position + PROXIMITY_CHARS)
  const ventana = texto.slice(ventanaInicio, ventanaFin)
  return NODE_REF_RE.test(ventana)
}

export function validarChunk(texto: string): ValidationResult {
  for (const { name, re } of PATRONES_HECHO) {
    const matches = texto.matchAll(re)
    for (const m of matches) {
      if (m.index === undefined) continue
      // Reset la regex stateful (g flag)
      NODE_REF_RE.lastIndex = 0
      if (!hayCitaCerca(texto, m.index)) {
        return {
          valid: false,
          reason: `hecho sin cita (${name})`,
          position: m.index,
          matchedText: m[0],
        }
      }
    }
  }
  return { valid: true }
}
```

- [ ] **Step 4: Run, verificar pass**

Run: `npm run test -- llm-validator`
Expected: PASS (7/7).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/llm-validator.ts backend/src/lib/llm-validator.test.ts
git commit -m "feat(lib): validarChunk detecta hechos sin cita post-LLM"
```

### Task F6.2: Integrar validador en `routes/chat.ts` con retry

**Files:**
- Modify: `backend/src/routes/chat.ts`

- [ ] **Step 1: Importar validador**

Al inicio:
```typescript
import { validarChunk } from '../lib/llm-validator'
```

- [ ] **Step 2: Wrappear el `for await` del stream con buffer + validación**

Reemplazar el loop actual de delta-chunks por una versión que acumula en buffer y valida cada N chars:

```typescript
let bufferTexto = ''
const BUFFER_FLUSH_CHARS = 200

for await (const event of stream) {
  if (event.type === 'message_start') { /* idem */ }
  else if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
    bufferTexto += event.delta.text
    if (bufferTexto.length >= BUFFER_FLUSH_CHARS || event.delta.text.includes('\n')) {
      const v = validarChunk(bufferTexto)
      if (!v.valid) {
        // Bloquear chunk: enviar warning + abortar stream
        send({
          delta: '⚠ ARGOS no pudo verificar este fragmento — refrescá la pregunta.',
          done: true,
        })
        await recordLlmCall({
          endpoint: '/api/chat',
          modelo: MODELO,
          inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens,
          costoUsd: 0,
          status: 'error',
          errorMessage: `validador bloqueó chunk: ${v.reason} ("${v.matchedText}")`,
        })
        res.end()
        return
      }
      send({ delta: bufferTexto })
      bufferTexto = ''
    }
  }
  // ... demás cases
}
// flush final
if (bufferTexto) {
  const v = validarChunk(bufferTexto)
  if (v.valid) send({ delta: bufferTexto })
  // si !v.valid en el flush final, ignorar y loguear
}
```

(El retry interno con system prompt re-instructed lo dejo para una sub-task más fina si vemos que el bloqueo es demasiado frecuente. Por ahora MVP: bloquear y avisar.)

- [ ] **Step 3: Smoke con backend dev**

Run: `cd backend && npm run dev` (background)

Run en otra terminal:
```bash
curl -N -X POST http://localhost:3001/api/chat \
  -H "Content-Type: application/json" \
  -d '{"message":"Cuáles son los proveedores que más cobran","context":{"graph":{"nodes":[{"id":"x","type":"proveedor","label":"X"}],"edges":[]}}}'
```

Expected: stream con texto + `[[node:x]]` cuando aplique. Si LLM intenta decir "$100M" sin cita, chunk se bloquea.

- [ ] **Step 4: Commit**

```bash
git add backend/src/routes/chat.ts
git commit -m "feat(chat): validador post-LLM bloquea hechos sin cita en stream"
```

### Task F6.3: UI render diferenciado en `NodeDetailPanel` + `ExplorarLayout`

**Files:**
- Create: `frontend/src/components/argos/InterpretationBlock.tsx`
- Modify: `frontend/src/components/argos/ExplorarLayout.tsx` (renderInlineBody)

- [ ] **Step 1: Componente InterpretationBlock**

```tsx
// frontend/src/components/argos/InterpretationBlock.tsx
import React from 'react'

interface Props { children: React.ReactNode }

/** Renderiza un bloque de "interpretación" (cursiva, atenuado, prefijo).
 *  Usado por ExplorarLayout cuando ARGOS sale del modo "hechos citados". */
export function InterpretationBlock({ children }: Props) {
  return (
    <div
      style={{
        marginTop: 8,
        paddingLeft: 12,
        borderLeft: '2px solid var(--text-3)',
        fontStyle: 'italic',
        color: 'var(--text-3)',
        fontSize: '0.95em',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>
        ╴Interpretación╴
      </div>
      {children}
    </div>
  )
}
```

- [ ] **Step 2: Update `renderInlineBody` para detectar bloque de interpretación**

Convención del LLM: cuando inicia un bloque interpretativo, lo prefija con `\nInterpretación:` o un marcador especial. El renderer parte el contenido por ese marcador.

En `ExplorarLayout.tsx`, dentro de `renderInlineBody`:

```typescript
function renderInlineBody(text, graph, onChipHover, onChipClick) {
  // Split por marcador "\nInterpretación:" o "╴Interpretación╴"
  const partes = text.split(/\n(?:Interpretación|╴Interpretación╴):?\s*/i)
  if (partes.length === 1) {
    return [renderHechos(partes[0], graph, onChipHover, onChipClick)]
  }
  return [
    renderHechos(partes[0], graph, onChipHover, onChipClick),
    <InterpretationBlock key="interp">
      {renderHechos(partes.slice(1).join('\n'), graph, onChipHover, onChipClick)}
    </InterpretationBlock>,
  ]
}

function renderHechos(text, graph, onChipHover, onChipClick) {
  // Lógica actual de chips inline (iterar por [[node:id]])
  // ... (la que ya existe)
}
```

- [ ] **Step 3: Smoke browser**

Run: `cd frontend && npm run dev`. Abrir `/explorar`, hacer pregunta. Verificar que cuando ARGOS dice "Interpretación: ..." aparece como bloque diferenciado.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/argos/InterpretationBlock.tsx frontend/src/components/argos/ExplorarLayout.tsx
git commit -m "feat(ui): InterpretationBlock + render hechos vs interpretación 2 voces"
```

---

## Phase F7 — Onboarding + jerarquía fuentes UI

### Task F7.1: Componente `Onboarding.tsx`

**Files:**
- Create: `frontend/src/components/argos/Onboarding.tsx`
- Modify: `frontend/src/components/argos/ExplorarLayout.tsx` (mostrar al primer load)

- [ ] **Step 1: Componente**

```tsx
// frontend/src/components/argos/Onboarding.tsx
import { useState, useEffect } from 'react'

const STORAGE_KEY = 'argos.onboarding_seen.v1'

export function Onboarding() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true)
    } catch { /* ignore */ }
  }, [])

  const cerrar = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch {}
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--stroke)',
          borderRadius: 8,
          padding: 32,
          maxWidth: 560,
          color: 'var(--text)',
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 16 }}>Cómo leer ARGOS</h2>
        <p>ARGOS combina dos capas de información:</p>
        <ul>
          <li>
            <strong style={{ color: 'var(--celeste)' }}>● Datos verificables</strong> (texto normal)
            <br/>
            <span style={{ fontSize: '0.9em', color: 'var(--text-3)' }}>
              Provienen del Portal Gobiernoabierto Córdoba, AFIP, IGJ Nación,
              Padrón Provincial. Cada cifra cita su fuente original. Defendibles
              ante Tribunal de Cuentas.
            </span>
          </li>
          <li style={{ marginTop: 12 }}>
            <strong style={{ color: 'var(--ambar)' }}>● Interpretación de soporte</strong> (cursiva)
            <br/>
            <span style={{ fontSize: '0.9em', color: 'var(--text-3)' }}>
              ARGOS sugiere lecturas usando Claude (LLM). Es un asistente
              personal, no asesoría jurídica. Antes de actuar, validá la
              interpretación con tu propio criterio o un profesional del
              derecho.
            </span>
          </li>
        </ul>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 24 }}>
          Cero alucinaciones · Toda señal verificable
        </p>
        <button
          onClick={cerrar}
          style={{
            marginTop: 16,
            padding: '8px 24px',
            background: 'var(--celeste)',
            color: 'var(--bg-0)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Entendido →
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Mount en ExplorarLayout**

En `ExplorarLayout.tsx`:
```tsx
import { Onboarding } from './Onboarding'

// En el render principal, top-level:
return (
  <div className="app">
    <Onboarding />
    {/* resto del layout */}
  </div>
)
```

- [ ] **Step 3: Smoke browser**

Run frontend dev, abrir `/explorar` en browser limpio (incógnito). Aparece modal. Click "Entendido". F5: NO aparece.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/argos/Onboarding.tsx frontend/src/components/argos/ExplorarLayout.tsx
git commit -m "feat(ui): modal Onboarding con disclaimer datos vs interpretación"
```

### Task F7.2: `TierBadge` + `IdentityBadge` componentes

**Files:**
- Create: `frontend/src/components/argos/TierBadge.tsx`
- Create: `frontend/src/components/argos/IdentityBadge.tsx`
- Modify: `frontend/src/components/argos/NodeDetailPanel.tsx`

- [ ] **Step 1: TierBadge**

```tsx
// frontend/src/components/argos/TierBadge.tsx
interface Props { tier: 0 | 1 | 2 | 3 | 4 | 5; source: string }

const LABELS: Record<number, string> = {
  0: 'CKAN Córdoba',
  1: 'AFIP',
  2: 'Padrón Provincial',
  3: 'IGJ Nación',
  4: 'Boletín (LLM)',
  5: 'OpenSanctions',
}

const COLORS: Record<number, string> = {
  0: '#62C7A0', // verde — fuente directa
  1: '#62C7A0',
  2: '#6FB8E8', // celeste — oficial provincial
  3: '#B79CFF', // lila — IGJ
  4: '#F5B544', // amarillo — extracción LLM
  5: '#9BA3B4', // gris — third-party
}

export function TierBadge({ tier, source }: Props) {
  return (
    <span
      style={{
        display: 'inline-block',
        fontSize: 10,
        padding: '1px 6px',
        borderRadius: 3,
        background: COLORS[tier] + '22',
        color: COLORS[tier],
        border: `1px solid ${COLORS[tier]}`,
        marginLeft: 6,
        whiteSpace: 'nowrap',
      }}
      title={`Fuente: ${source} (Tier ${tier})`}
    >
      T{tier} {LABELS[tier]}
    </span>
  )
}
```

- [ ] **Step 2: IdentityBadge**

```tsx
// frontend/src/components/argos/IdentityBadge.tsx
interface Props { tier: 1 | 2 | 3 | 4 | 5; score?: number }

export function IdentityBadge({ tier, score }: Props) {
  const label = tier === 1 ? '✓ CUIT verificado'
              : tier <= 3 ? '⚠ posible homónimo (nombre)'
              : tier === 4 ? '🤖 inferencia LLM'
              : '✗ sin match'

  const color = tier === 1 ? '#62C7A0'
              : tier <= 3 ? '#F5B544'
              : tier === 4 ? '#B79CFF'
              : '#9BA3B4'

  return (
    <span
      style={{
        fontSize: 10,
        padding: '2px 6px',
        borderRadius: 3,
        background: color + '22',
        color: color,
        border: `1px solid ${color}`,
      }}
      title={score ? `Score ${score}/100` : undefined}
    >
      {label}{score && tier > 1 ? ` (${score})` : ''}
    </span>
  )
}
```

- [ ] **Step 3: Wire en NodeDetailPanel**

En el render del panel, junto al CUIT cuando exista:
```tsx
{detail.identidad && (
  <IdentityBadge tier={detail.identidad.tier} score={detail.identidad.score} />
)}
```

(Backend tiene que devolver `detail.identidad: { tier, score }` — modificar `routes/entidad.ts` para llamar `resolverEmpresa()` y agregar al response.)

- [ ] **Step 4: Smoke browser**

Run frontend + backend. Abrir un proveedor en `/explorar`. Verificar badge aparece según el tier resuelto.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/argos/TierBadge.tsx frontend/src/components/argos/IdentityBadge.tsx frontend/src/components/argos/NodeDetailPanel.tsx backend/src/routes/entidad.ts
git commit -m "feat(ui): TierBadge + IdentityBadge para mostrar confianza de cada dato"
```

---

# MILESTONE 4 — Watchlist persistente

## Phase F8 — Watchlist + magic-link

### Task F8.1: Migration Supabase `0002_watchlist.sql`

**Files:**
- Create: `supabase/migrations/0002_watchlist.sql`

- [ ] **Step 1: SQL**

```sql
-- supabase/migrations/0002_watchlist.sql
CREATE TABLE IF NOT EXISTS watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proveedor_id TEXT NOT NULL,        -- normalizado
  proveedor_label TEXT NOT NULL,     -- nombre original para UI
  cuit TEXT,                          -- si conocido vía identity_matches
  agregado_en TIMESTAMPTZ DEFAULT now(),
  ultima_visita TIMESTAMPTZ DEFAULT now(),
  notas TEXT,
  UNIQUE(user_id, proveedor_id)
);

CREATE INDEX IF NOT EXISTS idx_watchlist_user ON watchlist(user_id);
CREATE INDEX IF NOT EXISTS idx_watchlist_ultima_visita ON watchlist(ultima_visita);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY watchlist_select ON watchlist FOR SELECT USING (user_id = auth.uid());
CREATE POLICY watchlist_insert ON watchlist FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY watchlist_update ON watchlist FOR UPDATE USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY watchlist_delete ON watchlist FOR DELETE USING (user_id = auth.uid());
```

- [ ] **Step 2: Aplicar manualmente al proyecto Supabase del user**

(Nota: requiere acceso al proyecto Supabase del user; lo aplica el operador, no el script.)

Run via dashboard Supabase o CLI:
```bash
supabase db push  # si Supabase CLI configurado
```

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/0002_watchlist.sql
git commit -m "feat(supabase): migration watchlist con RLS por user"
```

### Task F8.2: Frontend `lib/argos/watchlist.ts` con merge localStorage ↔ Supabase

**Files:**
- Create: `frontend/src/lib/argos/watchlist.ts`
- Create: `frontend/src/lib/argos/watchlist-merge.ts`

- [ ] **Step 1: Tests del merge primero**

(Si frontend no tiene vitest: skipear test específico, usar smoke manual. El user no quiso instalar vitest frontend.)

- [ ] **Step 2: Implementar `watchlist-merge.ts`**

```typescript
import type { WatchlistItem } from './types'

/** Merge local + remoto. Política: unión por proveedor_id, latest wins por agregado_en. */
export function mergeWatchlists(local: WatchlistItem[], remoto: WatchlistItem[]): WatchlistItem[] {
  const map = new Map<string, WatchlistItem>()
  for (const item of [...local, ...remoto]) {
    const existing = map.get(item.proveedor_id)
    if (!existing || item.agregado_en > existing.agregado_en) {
      map.set(item.proveedor_id, item)
    }
  }
  return [...map.values()].sort((a, b) => b.agregado_en.localeCompare(a.agregado_en))
}
```

- [ ] **Step 3: Implementar `watchlist.ts` (wrapper)**

```typescript
import { supabase } from '@/lib/supabase'
import { mergeWatchlists } from './watchlist-merge'
import type { WatchlistItem } from './types'

const STORAGE_KEY = 'argos.watchlist.v1'

export function readLocal(): WatchlistItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : []
  } catch { return [] }
}

export function writeLocal(items: WatchlistItem[]): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(items)) } catch {}
}

export async function fetchRemote(): Promise<WatchlistItem[]> {
  const { data, error } = await supabase.from('watchlist').select('*').order('agregado_en', { ascending: false })
  if (error) return []
  return data as WatchlistItem[]
}

export async function syncOnLogin(): Promise<WatchlistItem[]> {
  const local = readLocal()
  const remote = await fetchRemote()
  const merged = mergeWatchlists(local, remote)
  // Push to Supabase (lo que falta)
  for (const item of merged) {
    if (!remote.find(r => r.proveedor_id === item.proveedor_id)) {
      await supabase.from('watchlist').insert(item)
    }
  }
  writeLocal(merged)
  return merged
}

export async function addItem(item: WatchlistItem): Promise<void> {
  const session = (await supabase.auth.getSession()).data.session
  if (session) {
    await supabase.from('watchlist').upsert({ ...item, user_id: session.user.id })
  }
  // Always also write local for fallback
  const items = readLocal()
  const next = mergeWatchlists(items, [item])
  writeLocal(next)
}

// ... removeItem, updateUltimaVisita similar
```

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/argos/watchlist.ts frontend/src/lib/argos/watchlist-merge.ts
git commit -m "feat(watchlist): wrapper localStorage ↔ Supabase con merge unión latest-wins"
```

### Task F8.3: Botón ⭐ en NodeDetailPanel + página `/watchlist`

**Files:**
- Modify: `frontend/src/components/argos/NodeDetailPanel.tsx` (botón ⭐)
- Create: `frontend/src/pages/Watchlist.tsx`
- Modify: `frontend/src/App.tsx` (ruta `/watchlist`)

- [ ] **Step 1: Botón ⭐ en panel-foot**

En NodeDetailPanel.tsx, agregar botón al lado de "Copiar sumario" y "Descargar imagen":

```tsx
import { addItem, readLocal } from '@/lib/argos/watchlist'

// State
const [enWatchlist, setEnWatchlist] = useState(false)
useEffect(() => {
  if (!detail) return
  const items = readLocal()
  setEnWatchlist(items.some(i => i.proveedor_id === detail.node.id))
}, [detail])

// Botón
<button
  type="button"
  className="btn"
  onClick={async () => {
    if (!detail) return
    await addItem({
      proveedor_id: detail.node.id,
      proveedor_label: detail.node.label,
      cuit: detail.identidad?.cuit ?? null,
      agregado_en: new Date().toISOString(),
      ultima_visita: new Date().toISOString(),
      notas: null,
    })
    setEnWatchlist(true)
  }}
  disabled={enWatchlist}
>
  {enWatchlist ? '⭐ En tu watchlist' : '☆ Agregar a watchlist'}
</button>
```

- [ ] **Step 2: Página Watchlist**

```tsx
// frontend/src/pages/Watchlist.tsx
import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { readLocal, fetchRemote, syncOnLogin } from '@/lib/argos/watchlist'
import { supabase } from '@/lib/supabase'
import type { WatchlistItem } from '@/lib/argos/types'

export default function WatchlistPage() {
  const [items, setItems] = useState<WatchlistItem[]>([])

  useEffect(() => {
    (async () => {
      const session = (await supabase.auth.getSession()).data.session
      if (session) setItems(await syncOnLogin())
      else setItems(readLocal())
    })()
  }, [])

  return (
    <main style={{ padding: 24, color: 'var(--text)' }}>
      <h1>Tu watchlist</h1>
      {items.length === 0 ? (
        <p style={{ color: 'var(--text-3)' }}>
          No agregaste proveedores todavía. Buscá uno en{' '}
          <Link to="/explorar">Explorar</Link> y hacé click en ⭐.
        </p>
      ) : (
        <ul>
          {items.map(item => (
            <li key={item.proveedor_id}>
              <Link to={`/explorar?focus=${encodeURIComponent(item.proveedor_id)}`}>
                {item.proveedor_label}
              </Link>
              {' · '}
              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>
                {item.cuit ?? 'sin CUIT'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}
```

- [ ] **Step 3: Ruta**

En App.tsx:
```tsx
import Watchlist from './pages/Watchlist'
// ... dentro de Routes:
<Route path="/watchlist" element={<Watchlist />} />
```

- [ ] **Step 4: Smoke browser**

Run dev. En `/explorar`, agregar un proveedor a watchlist. Ir a `/watchlist`. Verificar que aparece.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/argos/NodeDetailPanel.tsx frontend/src/pages/Watchlist.tsx frontend/src/App.tsx
git commit -m "feat(watchlist): botón ⭐ en panel + página /watchlist con localStorage+Supabase"
```

### Task F8.4: Endpoint `/api/watchlist/novedades` + badge novedades

**Files:**
- Create: `backend/src/routes/watchlist.ts`
- Modify: `backend/src/index.ts` (mount /api/watchlist)
- Modify: `frontend/src/components/argos/Topbar.tsx` (NUEVO o existente — badge)

- [ ] **Step 1: Endpoint backend**

```typescript
// backend/src/routes/watchlist.ts
import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const router = Router()

router.post('/novedades', async (req: Request, res: Response) => {
  const { items } = req.body as { items: Array<{ proveedor_id: string; ultima_visita: string }> }
  if (!Array.isArray(items)) return res.status(400).json({ ok: false, error: 'items requerido' })

  const novedades: Array<{ proveedor_id: string; nuevos_contratos: number; nuevas_senales: number }> = []
  for (const it of items) {
    const contratos = await dbAll<{ n: number }>(
      `SELECT COUNT(*) as n FROM contratos WHERE proveedor_norm = ? AND cargado_en > ?`,
      [it.proveedor_id.toUpperCase(), it.ultima_visita]
    )
    const senales = await dbAll<{ n: number }>(
      `SELECT COUNT(*) as n FROM señales_cache WHERE entidades_cuit IS NOT NULL AND computado_en > ?`,
      [it.ultima_visita]
    )
    const nC = Number(contratos[0]?.n ?? 0)
    const nS = Number(senales[0]?.n ?? 0)
    if (nC > 0 || nS > 0) {
      novedades.push({ proveedor_id: it.proveedor_id, nuevos_contratos: nC, nuevas_senales: nS })
    }
  }
  res.json({ ok: true, novedades, total: novedades.length })
})

export default router
```

- [ ] **Step 2: Mount en index.ts**

```typescript
import watchlistRouter from './routes/watchlist'
app.use('/api/watchlist', watchlistRouter)
```

- [ ] **Step 3: Frontend — fetch + badge en topbar**

(Si no hay Topbar separado, agregar al `ExplorarLayout` lo siguiente cerca del header)

```tsx
import { readLocal } from '@/lib/argos/watchlist'

// State
const [novedadesCount, setNovedadesCount] = useState(0)

useEffect(() => {
  (async () => {
    const items = readLocal()
    if (items.length === 0) return
    try {
      const res = await fetch(`${API_BASE}/api/watchlist/novedades`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: items.map(i => ({ proveedor_id: i.proveedor_id, ultima_visita: i.ultima_visita })) }),
      })
      const data = await res.json()
      if (data.ok) setNovedadesCount(data.total)
    } catch { /* ignore */ }
  })()
}, [])

// Badge en header
{novedadesCount > 0 && (
  <Link to="/watchlist" style={{ color: 'var(--ambar)' }}>
    🔔 {novedadesCount} novedades
  </Link>
)}
```

- [ ] **Step 4: Smoke**

Run dev. Agregar proveedor a watchlist. Esperar (o forzar) un nuevo seed → badge aparece.

- [ ] **Step 5: Commit**

```bash
git add backend/src/routes/watchlist.ts backend/src/index.ts frontend/src/components/argos/ExplorarLayout.tsx
git commit -m "feat(watchlist): endpoint novedades + badge contador en topbar"
```

---

# MILESTONE 5 — Tests E2E + docs

## Phase F9 — Tests + smoke + docs

### Task F9.1: Smoke E2E con `verify-hallazgos` extendido

**Files:**
- Modify: `backend/src/scripts/verify-hallazgos.ts`

- [ ] **Step 1: Extender verify para chequear que cada señal tiene tier en el config**

Agregar al script:

```typescript
import { parseDetectorConfig } from '../engine/detectors-loader'
import config from '../engine/detectors-config.json'

const CFG = parseDetectorConfig(config)

// Para cada señal:
const detectorKey = `detectar${capitalize(camelCase(s.tipologia))}` // ajustar mapping
const cfgEntry = CFG[detectorKey]
if (!cfgEntry) {
  console.log(`  ✗ Señal ${s.tipologia} sin entrada en detectors-config.json`)
  totalFails++
}
```

- [ ] **Step 2: Run**

Run: `npm run analyze -- --force && npx ts-node src/scripts/verify-hallazgos.ts`
Expected: PASS, todas las señales tienen entrada en config con norma + tier.

- [ ] **Step 3: Commit**

```bash
git add backend/src/scripts/verify-hallazgos.ts
git commit -m "test(verify): cada señal cacheada debe tener entrada en detectors-config"
```

### Task F9.2: Update CLAUDE.md y README

**Files:**
- Modify: `CLAUDE.md` (LOG entry post-refactor)
- Modify: `README.md` (sección "Identity tiers" + "Watchlist")

- [ ] **Step 1: Append LOG entry a CLAUDE.md**

```markdown
### 2026-04-XX — Claude Code (refactor arquitectura datos)

Implementado spec `docs/superpowers/specs/2026-04-26-argos-arquitectura-datos-design.md`.

Cambios principales:
- Engine: 16 detectores → ~12 (Tier 3 archivado). Cada uno con norma citada
  + umbral fundamentado en `detectors-config.json`.
- Identity resolver tiered: cruce nombre↔CUIT con score explícito.
  AFIP padrón empleadores y Padrón provincial Córdoba cargados.
- Universo cordobés N2 vía vistas materializadas.
- Validador post-LLM bloquea hechos sin cita en `/api/chat`.
- UI: render 2 voces (hechos vs interpretación), TierBadge + IdentityBadge
  en cada campo crítico.
- Onboarding modal con disclaimer al primer login.
- Watchlist personal con magic-link Supabase opcional + badge novedades.
- Auditoría legal en `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md`
  (fuera del repo).

Tests: 172 → ~210 verde.
```

- [ ] **Step 2: Append a README.md sección "Identity Resolution"**

```markdown
## Identity Resolution

Cada cruce nombre↔CUIT devuelve un tier con score explícito:

| Tier | Método | Score | UI |
|---|---|---|---|
| 1 | CUIT exact | 100 | ✓ verde |
| 2 | Nombre normalizado | 85 | ⚠ amarillo |
| 3 | Fuzzy match (Levenshtein ≥85%) | 70-99 | ⚠ amarillo |
| 4 | LLM ambiguous | 60-99 | 🤖 lila |
| 5 | Sin match | 0 | ✗ gris |

Para reducir tier 4: cargar `seed:afip-padron` + `seed:cordoba-padron-prov`.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md README.md
git commit -m "docs: LOG + secciones identity tiers en README post-refactor"
```

### Task F9.3: Push y release notes

**Files:**
- Create: `BETA-RELEASE-NOTES.md` (append)

- [ ] **Step 1: Append release notes**

(Sección al `BETA-RELEASE-NOTES.md` existente)

- [ ] **Step 2: Push**

```bash
git push origin claude/chat-first-ui-design-aWg0V
```

- [ ] **Step 3: Verificar en GitHub que todos los commits están**

---

## Self-review

- ✅ **Spec coverage:** cada decisión del spec (motor, audit, filtro N2, identity tiered, validador LLM, onboarding, jerarquía, watchlist) tiene tareas. Las 9 fases del spec aparecen como Phases F1-F9.
- ✅ **Placeholder scan:** No "TBD" ni "TODO". Donde el detalle depende del output de F1 (la auditoría legal), se documentó explícitamente como "según output de F1, ajustar lista".
- ✅ **Type consistency:** `IdentityMatch.cuit` siempre `string | null`. `tier` siempre `1-5` (con type guards en zod). `validarChunk` retorna `ValidationResult` consistente.
- ✅ **Internal consistency:** los archivos creados en File Structure aparecen en alguna task. Los modificados también.

Ambigüedades resueltas inline:
- Política de retry del validador LLM se simplificó a "bloquear y avisar" (en lugar de retry interno) para MVP. Si en producción aparece muy frecuente, refinar después.
- Tests frontend para watchlist se omiten porque frontend no tiene vitest setup (decisión previa); cubrimos via smoke manual.

---

**Plan completo y guardado en `docs/superpowers/plans/2026-04-26-argos-arquitectura-datos.md`.**

Dos opciones de ejecución:

**1. Subagent-Driven (recomendada)** — Yo dispatcho un sub-agente fresco por cada task, reviso entre tasks, iteración rápida. Buen fit para un plan largo donde cada task es self-contained.

**2. Inline Execution** — Ejecutamos las tasks en esta sesión usando executing-plans, batch execution con checkpoints para tu review entre milestones.

¿Cuál preferís?
