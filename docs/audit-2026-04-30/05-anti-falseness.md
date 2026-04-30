# Anti-falseness Audit (static, code-only)

> Fecha: 2026-04-30 · Branch: `feat/backend-data-audit-12h`
> Modo: estático (sin DB viva). Audit de patrones en código.

---

## Pasada 1 · Patrones de mock en código

### FIXTURE identifiers detectados

#### `frontend/src/lib/argos/fixtures/personas-stub.ts` — STUB de UI (severity: 🟢 LOW)

Archivo declara explícitamente en línea 20: *"IMPORTANTE: estos datos NO se cargan a la DB"*. Se usa solo cuando el backend no responde y el componente quiere renderizar un Profile vacío con shape correcta.

CUITs y DNIs sintéticos pero válidos (módulo-11 OK):
- `FIXTURE_FERNANDEZ_MARIA` (DNI 24563128)
- `FIXTURE_PEREZ_CARLOS` (DNI 14289301)
- `FIXTURE_GIMENEZ_JUANA` (DNI 18567892)
- `FIXTURE_CONSTRUCTORA_CENTRO` (CUIT 30-71234567-1)
- `FIXTURE_SERVICIOS_INTEGRALES_SUR` (CUIT 30-68923451-4)
- `FIXTURE_LOGISTICA_NACIONAL` (CUIT 33-50012345-7)

Lookup maps:
- `PERSONAS_FISICAS_STUB` (línea 377)
- `PERSONAS_JURIDICAS_STUB` (línea 383)

**Verdict**: aceptable porque el archivo es UI-only y trae comentario explícito. **Recomendación**: el componente que lo consume debe mostrar banner *"DATOS SINTÉTICOS"* visible cuando renderiza con stub. Verificar en Fase 4.

#### `backend/src/scripts/cleanup-test-pollution.ts` — script de limpieza (severity: 🟢 LOW)

Patterns hardcodeados en líneas 18-21: `__TEST_F`, `__TEST_`, `FIXTURE`. CUIT '99100000004' línea 24. **Verdict**: legítimo — script identifica artefactos de test para borrar.

#### `backend/src/lib/ocr.test.ts:135` — test data

`'Lorem ipsum dolor sit amet, sin nada relevante para parsear.'` — test de unidad para parser OCR. **Verdict**: NONE, es un test.

### Hardcoded DNIs/CUITs en código no-test

Patrones `99999999`, `11111111`, `12345678`, `00000000` aparecen **solo en .test.ts y stubs UI**. **No hay leakage a producción**.

### Round numbers sospechosos

- `1000000` en `TOAST_REMOVE_DELAY` (frontend/src/hooks/use-toast.ts:6) → constante UI legítima
- `1000000` divisor para formato millones en dinero-flujo y graph calculations → legítimo
- **Sin números redondos sospechosos en bundles de datos**

---

## Pasada 2 · Compliance `fuente_url`

**Hallazgo crítico de schema**: la tabla `señales_cache` (`backend/src/lib/db.ts`) **NO tiene columna `fuente_url`**. Schema actual:

```
id, municipio, tipologia, titulo, resumen, score, severidad,
evidencia_json, legal_json, entidades_cuit, computado_en,
estado_verificacion, verificado_por, verificado_en
```

Esto explica la mayoría de los gaps en endpoints que sirven señales.

### 10 endpoints sin `fuente_url` (cross-ref con `01-endpoints-inventory.md`)

| # | Endpoint | Archivo:línea | Causa raíz | Fix mínimo |
|---|---|---|---|---|
| 1 | GET /api/landing | landing.ts:98-105 | feed señales sin fuente_url; `señales_cache` sin columna | ALTER TABLE añadir `fuente_url TEXT`; backfill desde `evidencia_json[0].fuente_url`; SELECT incluir |
| 2 | GET /api/dashboard | dashboard.ts:26-37 | mismo: mapea señales sin fuente_url | igual |
| 3 | GET /api/actores/search | actores.ts:39 | hits incluyen `href` (ruta de app) en vez de URL fuente | adicionar `fuenteUrl` al hit con la URL de la fuente original (CKAN/AFIP/IGJ) |
| 4 | POST /api/chat (SSE) | chat.ts:99 | streaming sin fuente_url para hechos del Cypher | inyectar `[[fuente:URL]]` en el delta cuando viene de tool_use |
| 5 | GET /api/cola-verificacion | cola-verificacion.ts:68 | items selectados de señales_cache sin fuente_url | igual fix #1+2 |
| 6 | GET /api/comparar/empresa | comparar.ts:28 | sparklines sin source attribution | incluir `fuenteUrl` por punto de la sparkline (URL del contrato del año) |
| 7 | POST /api/ai/suggestions | ai.ts:71 | suggestions sin action source url | agregar `fuenteUrl` opcional cuando la suggestion refiere a una señal/contrato existente |
| 8 | GET /api/dinero/sankey | dinero.ts:17 | etapas sin presupuesto_ejecucion.fuente_url (verificar columna) | agregar `fuenteUrl` por etapa basado en la fuente del XLS de presupuesto |
| 9 | GET /api/grafo/nucleo | grafo.ts:20 | nodos Neo4j sin fuente_url (cypher no la trae) | en Cypher: `RETURN n.fuenteUrl` |
| 10 | GET /api/grafo/expand /conflictos | grafo.ts:65/48 | igual #9 | igual |

### Endpoints compliant (verificado)

- `/api/dinero/partidas` ✅
- `/api/profile/persona/:dni` ✅
- `/api/profile/empresa/:cuit` ✅
- `/api/entidad/:nombre` ✅
- `/api/contrato/:hash` ✅
- `/peso/peso/:partida_id` ✅

### Migración SQL propuesta

```sql
-- migrations/0003_señales_fuente_url.sql
ALTER TABLE señales_cache ADD COLUMN fuente_url TEXT;

-- Backfill desde evidencia_json (formato JSON con array de evidencias)
UPDATE señales_cache
SET fuente_url = (
  SELECT json_extract(evidencia_json, '$[0].fuente_url')
  WHERE evidencia_json IS NOT NULL
)
WHERE fuente_url IS NULL;
```

---

## Pasada 3 · Tono acusatorio (CLAUDE.md regla 6)

Grep por `hallazgo`, `destapamos`, `corrupto`, `fraude`, `delito` en frontend pages + components/argos:

| Archivo:línea | Texto | Contexto | Verdict |
|---|---|---|---|
| `components/argos/CadenaDePago.tsx:16` | "hallazgos derivados del grafo" | comentario referenciando CLAUDE.md §5 | 🟢 compliant (metadata) |
| `pages/Senales.tsx:153` | "storage corrupto" | comentario interno sobre estado roto | 🟢 compliant (interno) |
| `backend/src/engine/signals.ts:16,166,173,848-873` | uso amplio de "corrupto" y "hallazgos" | código del detector | 🟢 permitido (CLAUDE.md §5 exception) |

**Resultado**: 0 violaciones en copy user-facing. Todo el lenguaje al usuario es neutral/factual.

---

## Resumen ejecutivo (top 5)

1. 🔴 **CRÍTICO**: 10 endpoints sin `fuente_url` en respuesta — viola CLAUDE.md §4 (verifiability). Causa raíz: `señales_cache` no tiene columna `fuente_url`. Migración SQL en §Pasada 2 + actualización de SELECT en 10 archivos de routes.
2. 🟢 **OK**: fixtures en `frontend/src/lib/argos/fixtures/personas-stub.ts` están bien aisladas (UI-only, jamás van a DB), pero la UI debe mostrar banner DATOS SINTÉTICOS al renderizarlos. Verificar en Fase 4 cuál componente los usa y si banner aparece.
3. 🟢 **OK**: cleanup script intencional (`cleanup-test-pollution.ts`), patrones de DNI/CUIT solo en .test.ts. No leakage a prod.
4. 🟢 **OK**: tono no acusatorio en frontend. Todo el lenguaje user-facing es neutral. Las palabras "hallazgo/corrupto" solo aparecen en código interno del engine de detectores.
5. 🟡 **PENDIENTE verificación dinámica**: con DB viva, correr SQL/Cypher buscando filas con DNI sospechosos, montos perfectamente redondos, descripciones placeholder. Script propuesto en `00-EXECUTIVE-SUMMARY.md` para próximo runner.

---

## Recomendaciones inmediatas

1. **Migración 0003** ALTER TABLE señales_cache + backfill (15 min)
2. **Update 10 routes** para incluir fuente_url en SELECT/response (1-2h)
3. **Test de compliance** que itere endpoints y verifique presencia de fuente_url donde aplique (45 min)
4. **Audit UI** para banner DATOS SINTÉTICOS en componentes que consumen `personas-stub.ts` (Fase 4)
