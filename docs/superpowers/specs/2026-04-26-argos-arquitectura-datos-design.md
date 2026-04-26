# ARGOS — Arquitectura de datos y motor de detección anticorrupción

**Fecha:** 2026-04-26
**Branch:** `claude/chat-first-ui-design-aWg0V`
**Status:** Design (post-brainstorming, pre-implementación)
**Scope:** Córdoba Capital (multi-jurisdicción es post-beta v1)

## Contexto

Tras 17 iteraciones autónomas que llevaron al beta a 172 tests verde con todas las features visuales (A-E) implementadas, el operador (Daisy) detectó que la lógica de datos tenía dos debilidades estructurales:

1. **2.7M filas de IGJ Nación cargadas como ruido** sin filtrar a Córdoba — no aporta señal, ocupa espacio.
2. **16 detectores de "patrones de corrupción" hardcoded con umbrales arbitrarios** sin fundamento legal verificable — riesgo de afirmar irregularidad sin sustento jurídico.

El objetivo de este spec es convertir ARGOS de "buscador de patrones estadísticos" a **arma de vigilancia y anticorrupción** con cada hallazgo defendible legalmente.

Cinco dimensiones se rediseñaron: motor de detección, validación legal, filtro Córdoba, identidad de entidades, verificabilidad LLM, jerarquía de fuentes, workflow del operador.

## Decisiones tomadas (resumen ejecutivo)

| # | Dimensión | Decisión |
|---|---|---|
| 1 | Motor de detección | **A+B** — heurístico transparente con umbrales configurables por proyecto vía JSON. NO LLM-driven |
| 2 | Validación legal | **D** — Auditoría legal autónoma (Claude) → Tier 1 primario / Tier 2 experimental con caveat / Tier 3 eliminado |
| 3 | Quién audita | **A** — Investigación autónoma. Output `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` |
| 4 | Filtro Córdoba | **N2** — proveedores cordobeses + sus directores (cruce IGJ) + las otras empresas donde figuran esos directores |
| 5 | Identidad de entidades | **C+D** — Tiered con score (CUIT > nombre normalizado > fuzzy) + LLM en ambiguos. Cargar AFIP padrón empleadores + Padrón provincial proveedores Córdoba |
| 6 | Verificabilidad | **B con regla dura** — validador post-LLM bloquea hechos sin cita. Interpretación permitida pero marcada visualmente. Disclaimer prominente en onboarding |
| 7 | Jerarquía de fuentes | **B** — ranking estricto Tier 0 (CKAN Córdoba) > Tier 1 (AFIP) > Tier 2 (Padrón provincial) > Tier 3 (IGJ) > Tier 4 (Boletín LLM) > Tier 5 (OS/ICIJ). Mismo tier → mostrar ambas con caveat |
| 8 | Workflow operador | **B** — watchlist + alertas pasivas. Magic-link Supabase opcional. Watchlist personal sin sharing entre cuentas |

## § 1 — Visión y persona objetivo

**Misión:** convertir datos verificables del gasto público de Córdoba Capital en señales legalmente sustentadas que un periodista o asesor político pueda usar para producir un artefacto público (nota, interpelación, denuncia) en horas en lugar de días, sin afirmar nada que no esté trazable a fuente oficial.

**Personas:**
- **Carla** (periodista bajo deadline) — pull-only, sin cuenta, transaccional. Una sesión, copia sumario, se va.
- **Mariana / Pedro** (asesores políticos) — cíclicos. Cuenta magic-link. Watchlist personal. Vuelven cada semana antes de sesión del Concejo.

**Fronteras explícitas:**
- Solo Córdoba Capital. Multi-jurisdicción (Nación / CABA / Santa Fe) post-beta v1.
- Cero datos sintéticos. Cero fixtures.
- ARGOS NO emite juicios legales. Muestra hechos verificables + interpretación marcada como tal.
- LLM como **soporte personal**, no asesoría jurídica.

## § 2 — Arquitectura de datos

### 2.1 Universo cordobés (filtro N2)

Conjunto de personas + empresas sobre las que ARGOS opera, construido en 3 anillos progresivos:

```
N0 = base
  ├─ proveedores con ≥1 contrato municipal/provincial cordobés (tabla contratos)
  └─ funcionarios cordobeses (tabla agentes_publicos)

N1 = N0 + directores conocidos
  └─ JOIN igj_autoridades por nombre/CUIT contra empresas de N0

N2 = N1 + co-empresas
  └─ Para cada director encontrado en N1, sus OTRAS empresas en igj_entidades
     (aunque esas otras empresas no cobren de Córdoba)
```

Volumen estimado N2: ~50K empresas + ~50K personas. Manejable y enfocado.

**Implementación:** vistas materializadas `v_universo_cordobes_empresas` y `v_universo_cordobes_personas` reconstruidas tras cada `seed:igj` o `seed:cordoba`. Frontend siempre va contra esas vistas, nunca contra `igj_entidades` directamente. Data fuera de N2 NO se borra — queda en `igj_*` por si el filtro tiene que expandirse.

### 2.2 Identity resolution tiered

```typescript
function resolverEmpresa(nombre: string, cuit?: string): IdentityMatch
```

| Tier | Match | Score | Cuándo aplica |
|---|---|---|---|
| 1 | `cuit_exact` | 100 | CUIT proveedor + CUIT IGJ idénticos |
| 2 | `name_normalized_exact` | 85 | `normalizarProveedor()` produce el mismo string |
| 3 | `name_fuzzy_high` | 70 | Levenshtein ≥85% del normalizado |
| 4 | `llm_ambiguous` | 60 | LLM compara contexto (años, área, montos) y decide |
| 5 | `no_match` | 0 | Nada |

UI muestra el tier:
- Tier 1 → badge verde "✓ CUIT verificado"
- Tier 2-3 → badge amarillo "⚠ posible homónimo (nombre, sin CUIT)"
- Tier 4 → badge naranja "🤖 inferencia LLM"

LLM tier 4 se llama solo cuando tiers 1-3 fallan. Costo estimado: ~$0.001 por consulta ambigua (raras).

**Para reducir tier 4 cuanto se pueda**, cargamos:
- **AFIP padrón empleadores** (datos.gob.ar) → CUITs verificados de empresas activas. Pobla `empresas.cuit` masivamente.
- **Padrón provincial proveedores Córdoba** (dataset 281) → CUITs de proveedores municipales conocidos.

Después de poblar ambos, esperamos que ~70% de los cruces caigan en tier 1.

### 2.3 Jerarquía de fuentes

```
Tier 0 — Portal CKAN Córdoba           gobiernoabierto.cordoba.gob.ar
Tier 1 — AFIP/ARCA padrón empleadores  datos.gob.ar/...
Tier 2 — Padrón provincial proveedores dataset 281 Córdoba
Tier 3 — IGJ Nación                    datos.jus.gob.ar
Tier 4 — Boletín Municipal (LLM extr.) extractor-norma
Tier 5 — OpenSanctions / ICIJ          third-party
```

**Regla:** cuando 2 fuentes contradicen, gana la de menor tier. La descartada se guarda en `caveat[]` colapsable. Si ambas son del mismo tier (raro): se muestran ambas sin desempate.

Cada campo crítico en la respuesta API trae:
```typescript
{ value, source: 'ckan' | 'afip' | 'igj' | ..., tier: 0-5, caveats?: [...] }
```

Frontend renderiza el campo + chip pequeño con el tier.

### 2.4 Schema cambios

```sql
-- Vistas (regeneradas en seed)
CREATE OR REPLACE VIEW v_universo_cordobes_empresas AS ...;
CREATE OR REPLACE VIEW v_universo_cordobes_personas AS ...;

-- Tabla nueva
CREATE TABLE empresas_padron_provincial (
  cuit TEXT PRIMARY KEY,
  razon_social TEXT NOT NULL,
  fuente_url TEXT NOT NULL,
  cargado_en TEXT NOT NULL
);

-- Extensión a empresas (AFIP padrón cargado)
ALTER TABLE empresas ADD COLUMN fuente_padron TEXT;
  -- 'afip_padron' | 'cuitonline_scrape' | null

-- Identidad resuelta con score
CREATE TABLE identity_matches (
  proveedor_norm TEXT,
  cuit_resuelto TEXT,
  tier INTEGER,    -- 1-5
  score INTEGER,   -- 0-100
  resuelto_en TEXT NOT NULL,
  metodo TEXT,     -- 'cuit_exact' | 'name_normalized' | 'llm_ambiguous'
  PRIMARY KEY (proveedor_norm)
);
CREATE INDEX idx_identity_cuit ON identity_matches(cuit_resuelto) WHERE cuit_resuelto IS NOT NULL;
```

## § 3 — Engine de detección y validación legal

### 3.1 Filosofía

Detectores son funciones puras `(Contrato[]) → Señal | null` con criterios explícitos, NO llamadas a LLM. Cada detector debe responder 4 preguntas:

1. ¿Qué patrón detecta?
2. ¿Qué norma argentina/cordobesa concreta lo sustenta?
3. ¿Cuál es el umbral y de dónde sale?
4. ¿Es **infracción directa** (Tier 1) o **indicio** (Tier 2)?

Si un detector no puede responder las 4, va a **Tier 3 — eliminado o reformulado**.

### 3.2 Auditoría legal autónoma

Investigación (~3h) cubriendo cada detector contra:
- Ley Provincial 8614 / 10.155 + decreto 305/14 (régimen contrataciones Córdoba)
- Decreto Nacional 1023/2001 (analogía nacional)
- Ley 13.064 (obras públicas)
- Ley 27.275 (acceso info pública)
- Ley 27.442 (defensa de la competencia)
- Ley 25.246 (lavado de activos)
- Ley 27.401 (responsabilidad penal personas jurídicas)
- Ley 19.550 art. 33 (sociedades vinculadas)
- Jurisprudencia accesible (Tribunal de Cuentas Córdoba + nacional vía WebSearch)
- Doctrina sobre umbrales

**Output:** `~/Desktop/ARGOS-AUDITORIA-LEGAL-DETECTORES.md` con 16 fichas, una por detector, formato:

```markdown
## Detector: detectarConcentracion

**Patrón actual:** dispara si 1 proveedor ≥35% del gasto total.

**Norma sustentadora (Tier 1):** Ley Provincial 8614 art. 22 — principio de
concurrencia en contrataciones públicas.

**Umbral 35% — fundamento:**
- [Cita doctrina o jurisprudencia]
- Si no hay fuente para 35%, se ajusta a un valor con fundamento o se marca
  "umbral conservador, no establecido en jurisprudencia".

**Severidad:** moderada si 35-60%, grave si >60%.

**Clasificación: Tier 1 — Primario. Activado por default.**

**Riesgo de falso positivo:** caso del proveedor único legítimamente
especializado. Mitigación: lenguaje "señal técnica + posible justificación".
```

### 3.3 Tiers de salida

| Tier | Significado | UI |
|---|---|---|
| **1** | Norma directa + umbral fundamentado | Activo por default. Badge "Norma X art. Y" |
| **2** | Heurística defendible, indicio no infracción | Toggle del operador. Badge naranja "Indicio — requiere análisis caso por caso" |
| **3** | Sin fundamento legal claro | **Eliminado del engine** |

Tentativa preliminar (sujeta a refinamiento por la auditoría real):
- **Tier 1 (probable):** concentracion, contrataciones_directas, monopolio_rubro, fraccionamiento_avanzado, adenda_postajudicacion, aparicion_offshore, gasto_fin_ejercicio
- **Tier 2 (probable):** prorrogas, rotacion_coordinada, servicio_sin_historial, directores_compartidos, red_de_empresas
- **Tier 3 (considerar eliminar):** proveedor_cronico, empresa_nueva, empresa_sin_empleados — no son infracciones por sí solas

### 3.4 Umbrales configurables externamente

Archivo `backend/src/engine/detectors-config.json`:

```json
{
  "detectarConcentracion": {
    "tier": 1,
    "norma": "Ley Provincial 8614 art. 22",
    "umbral_minimo": 0.35,
    "umbral_grave": 0.60,
    "fuente_umbral": "Resolución TC Córdoba N° X/2018"
  },
  "detectarMonopolioRubro": {
    "tier": 1,
    "norma": "Ley Provincial 8614 art. 22",
    "umbral_minimo": 0.60,
    "umbral_grave": 0.80,
    "min_contratos_area": 3,
    "min_monto_area": 1000000
  }
}
```

UI futura (post-beta) podría permitir tunear. Por ahora `JSON` versionado en repo, tests verifican que cada detector lee su config.

**Detectores Tier 3 NO entran al `detectors-config.json`** — se eliminan del code o se mueven a un archivo `legacy/` por trazabilidad histórica, pero `calcularSeñales()` no los invoca.

### 3.5 Hard rule pre-launch

Ningún detector Tier 1 se lanza sin:
1. Norma específica citada (artículo + ley)
2. Umbral con fuente o flag explícito "umbral conservador, no establecido en jurisprudencia"
3. Lenguaje de salida que NO afirma delito (siempre "señal técnica que sugiere", "patrón compatible con", "requiere investigación")

## § 4 — Capa LLM con validación

### 4.1 Dos voces visualmente distintas

```
ARGOS:
PINTURAS CAVAZZON S.R.L. recibió $82.320.000 en 25 contratos
de SECRETARÍA DE CULTURA entre 2020-2023 [[node:cavazzon]],
con concentración del 92.8% en esa área [[node:sig-monopolio]].

  ╴Interpretación╴
  Este patrón es compatible con captura de área bajo el
  principio de concurrencia (Ley 8614 art. 22). No constituye
  juicio legal. Acción sugerida: derivar a Tribunal de Cuentas
  Municipal de Córdoba.
```

- **Hechos** (texto normal, con `[[node:id]]` clickeables)
- **Interpretación** (cursiva, gris atenuado, prefijo `╴Interpretación╴`, borde lateral)

### 4.2 Validador post-LLM (server-side)

Cada chunk del SSE pasa por validador estructural antes de salir al cliente:

```typescript
// backend/src/lib/llm-validator.ts
function validarChunk(texto: string): ValidationResult {
  const patronesHecho = [
    /\$\s*[\d.,]+(?:\s*(?:millones?|millón|M|MM|mil))?/gi,    // montos
    /\b\d{1,2}([-/.])\d{1,2}\1\d{2,4}\b/g,                    // fechas
    /\b\d{2}-?\d{8}-?\d\b/g,                                  // CUITs
    /\b[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ ]{3,}\s+(?:S\.?A\.?|S\.?R\.?L\.?|UTE|SAIIC)\b/g,
  ]
  for (const p of patronesHecho) {
    const matches = texto.matchAll(p)
    for (const m of matches) {
      if (!hayNodeRefCerca(texto, m.index)) {
        return { valid: false, reason: `hecho sin cita: "${m[0]}"` }
      }
    }
  }
  return { valid: true }
}
```

**Comportamiento si falla:**
- Chunk inválido NO se envía al frontend
- Retry interno: system prompt agrega `"Tu respuesta anterior contenía hechos sin cita. Reescribí citando [[node:id]] o eliminando esos hechos."` (max 1 retry)
- Si retry también falla: chunk se reemplaza por `"⚠ ARGOS no pudo verificar este fragmento — refrescá la pregunta."` y se loguea en `llm_usage.error_message`

Costo extra: ~5-10% más calls por retries. Aceptable.

### 4.3 Onboarding disclaimer

Modal de bienvenida en primer login (dismissable, flag `argos.onboarding_seen=v1` en localStorage):

```
┌──────────────────────────────────────────────────────────┐
│ Cómo leer ARGOS                                          │
├──────────────────────────────────────────────────────────┤
│ ARGOS combina dos capas de información:                  │
│                                                          │
│ ● Datos verificables (texto normal)                      │
│   Provienen del Portal Gobiernoabierto Córdoba, AFIP,    │
│   IGJ Nación, Padrón Provincial. Cada cifra cita su      │
│   fuente original. Defendibles ante Tribunal de Cuentas. │
│                                                          │
│ ● Interpretación de soporte (cursiva)                    │
│   ARGOS sugiere lecturas usando Claude (LLM). Es un      │
│   asistente personal, no asesoría jurídica. Antes de     │
│   actuar, validá la interpretación con tu propio criterio│
│   o un profesional del derecho.                          │
│                                                          │
│ Cero alucinaciones · Toda señal verificable              │
│                                          [Entendido →]   │
└──────────────────────────────────────────────────────────┘
```

## § 5 — UI / Workflow del operador

### 5.1 Cuenta opcional con magic-link

- Sin cuenta → todo en localStorage (chat, watchlist, bookmarks). Funciona pero se pierde al cambiar browser.
- "Iniciar sesión" → magic-link Supabase → al volver con session, sync localStorage → Supabase. A partir de ahí Supabase es la verdad.

**Política de merge en primer login** (cuando localStorage y Supabase tienen contenido):
- Watchlist: unión (ambos sets se combinan, deduplicado por `proveedor_id`)
- Chat thread: el más reciente por `ts` gana — Supabase suele ser más viejo si el usuario chatió localmente, en ese caso pisamos Supabase con localStorage
- Bookmarks: unión
- Onboarding flag: si está en cualquiera de los dos, no se vuelve a mostrar

```sql
-- supabase/migrations/0002_watchlist.sql
CREATE TABLE watchlist (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  proveedor_id TEXT NOT NULL,
  proveedor_label TEXT NOT NULL,
  agregado_en TIMESTAMPTZ DEFAULT now(),
  ultima_visita TIMESTAMPTZ DEFAULT now(),
  notas TEXT,
  UNIQUE(user_id, proveedor_id)
);
ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;
CREATE POLICY watchlist_owner ON watchlist FOR ALL
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
```

### 5.2 Watchlist UI

Botón **"⭐ Agregar a mi watchlist"** en panel del proveedor:
- Sin cuenta: localStorage, toast "Guardado en este browser"
- Con cuenta: Supabase, toast "Guardado en tu cuenta"

Vista nueva `/watchlist` (sidebar): lista con columna "novedades desde tu última visita".

### 5.3 Alertas pasivas (badge "novedades")

Backend computa al login:

```sql
-- Contar contratos nuevos + señales nuevas desde watchlist.ultima_visita
SELECT COUNT(*) ... FROM watchlist w
LEFT JOIN contratos c ON c.proveedor_norm = w.proveedor_id
   AND c.cargado_en > w.ultima_visita
LEFT JOIN señales_cache s ON s.entidades_cuit @> ARRAY[w.cuit]
   AND s.computado_en > w.ultima_visita
WHERE w.user_id = $userId
```

UI: badge en topbar "🔔 3 novedades en tus proveedores". Click → vista filtrada.

**Sin emails. Sin push.** Pull-only. Privacidad preservada.

### 5.4 Compartir hallazgo (canal externo, no entre cuentas)

El operador NO comparte watchlist con otro operador. Sí puede:
- Copiar sumario MD (Feature C ya implementada)
- Descargar PNG con watermark (Feature D ya implementada)
- Compartir deeplink `?focus=&q=` (Feature E ya implementada)
- Generar PDF denuncia (ya implementado)

Suficiente para pasar hallazgos a editor / jefe sin multi-tenancy.

## § 6 — Plan de implementación (resumen)

| Fase | Bloques | Esfuerzo aprox |
|---|---|---|
| **F1 — Auditoría legal** (PRIMERA, bloquea todo) | Yo investigo 16 detectores + doc Desktop | 3h autónomo |
| **F2 — Refactor engine a tiers + config externo** | `detectors-config.json` + tier por detector + remove Tier 3 | 1 día |
| **F3 — Identity resolution tiered** | `lib/identity-resolver.ts` (CUIT > nombre > fuzzy > LLM) + cache | 1.5 días |
| **F4 — Cargar AFIP padrón empleadores + Padrón provincial** | 2 nuevos seeds + ALTER `empresas` + repoblar | 1 día |
| **F5 — Vistas universo cordobés N2** | `v_universo_cordobes_*` + queries del backend usan estas vistas | 1 día |
| **F6 — Validador post-LLM + UI 2 voces** | `lib/llm-validator.ts` + render diferenciado en panel/chat | 2 días |
| **F7 — Onboarding + jerarquía fuentes UI** | Modal disclaimer + chips de tier en cada campo crítico | 1 día |
| **F8 — Watchlist + magic-link + badge novedades** | Supabase migration + endpoint `/api/watchlist/*` + UI | 2 días |
| **F9 — Tests + smoke E2E + verify** | Tests de cada nueva pieza, smoke con datos reales | 1.5 días |

**Total estimado: 14 días dev + 3h investigación.** Costo Anthropic: AFIP/padrón $0; identity LLM ambiguos ~$2/sem; validador retries ~$5/sem extra. Cabe holgado en €50/sem.

**Orden estricto:** F1 → F2 → F3+F4 paralelo → F5 → F6 → F7 → F8 → F9.

`writing-plans` armará el detalle granular después de aprobación de este spec.

## § 7 — Verificación / aceptación

**Tests por fase:**

- **F1:** doc generado con 16 entradas, cada una con norma + umbral + tier. Cero "TBD" en tier asignado.
- **F2:** vitest sobre `detectors-config.json` (validar shape + cada detector lee su config). Test "Tier 3 detector no se ejecuta".
- **F3:** vitest sobre `resolverEmpresa()` con 8 casos (cuit_exact, name_exact, fuzzy_high, llm_ambiguous, no_match × variantes).
- **F4:** smoke `seed:afip-padron` carga >100K empresas. Smoke `seed:cordoba-padron` carga >2K proveedores. `audit-trazabilidad` pasa.
- **F5:** query test `COUNT(v_universo_cordobes_empresas)` entre 30K y 80K (bound check).
- **F6:** vitest sobre `validarChunk()` — caso "monto $100M sin cita" → falla; "monto $100M [[node:x]]" → pasa.
- **F7:** smoke browser — onboarding aparece primer load, no aparece segunda vez.
- **F8:** vitest sobre RLS Supabase (usuario A no ve watchlist de usuario B). Smoke E2E magic-link.
- **F9:** `verify-hallazgos.ts` + `audit-trazabilidad.ts` + Playwright smoke contra `/explorar`.

**Criterios de aceptación del beta refactorizado:**

1. ✅ 0 fixtures sintéticos
2. ✅ 0 hechos sin cita en chat (test contra el validador)
3. ✅ Cada detector activado tiene norma + umbral fundamentado en doc legal
4. ✅ Cada cruce con identity match Tier ≥4 muestra badge en UI
5. ✅ Watchlist sincroniza correctamente entre localStorage y Supabase tras login
6. ✅ Onboarding modal aparece primer login, no más
7. ✅ Costo Anthropic operativo <$10/sem en uso normal (1 operador con 50 queries/día)

## § 8 — Riesgos y mitigaciones

| Riesgo | P | Impacto | Mitigación |
|---|---|---|---|
| Audit legal con muchos "umbral arbitrario" sin fuente | Alta | Medio | Detectores van a Tier 2 con caveat — no se eliminan, no se afirman como infracción. Honestidad explícita. |
| AFIP padrón empleadores con formato distinto | Media | Bajo | Parser flexible + log diagnóstico. Fallback a scrape AFIP frágil. |
| Validador post-LLM bloquea respuestas legítimas (FP) | Alta | Medio | Logueamos cada bloqueo. Si >5%, ajustamos regex. 1 retry automático antes de fallar. |
| LLM en identity resolution tier 4 alucina match | Media | Alto | Score retornado del LLM <70 → marcamos `no_match`. Contexto rico en el prompt (años, montos, áreas). |
| Magic-link Supabase falla / abuso | Baja | Medio | Rate-limit nativo. Si servicio cae, sin cuenta sigue funcionando con localStorage. |
| Watchlist crece sin mantenimiento | Baja | Bajo | Limit 100 entradas/usuario. Mensaje "Watchlist llena". |
| Detector Tier 1 dispara FP en empresa legítima | Cierta | Alto reputacional | Lenguaje "señal técnica", "patrón compatible con", "requiere investigación". + caveat "1 proveedor único legítimamente especializado" en el sumario. |

---

**Cero alucinaciones · Toda señal verificable**
