# La Bestia — Arquitectura y Estado del Sistema

## Stack

| Capa | Tecnología | URL/ID |
|------|-----------|--------|
| Frontend | React + TypeScript + Tailwind + Vite | Railway: `https://victorious-luck-production-8d3a.up.railway.app` |
| Backend | n8n Cloud | `https://osocordobes.app.n8n.cloud` |
| Workflow principal | n8n | `wJwPqRvunFIWRtPfFxvSC` |
| Editor Remoto (patching) | n8n | `BEdGwkym9JmiIAlg` |
| LLM extracción | Claude Haiku | `claude-haiku-4-5-20251001` |
| LLM reporte | Claude Haiku / Sonnet | `claude-haiku-4-5-20251001` |

---

## Flujo del workflow (orden de nodos)

```
Bestia Run (Webhook POST /bestia-run)
  → Normalize + Validate Input
  → IF Input OK
    [ERROR] → Respond 401/400/402
    [OK]    → Respond 202 (ACK) — devuelve runId inmediatamente
            → Update Progress: Discovery start
            → Wikidata Search Entities       ← lookup hardcoded + auto-slug
            → Extract Official Website + Seed URLs
            → DuckDuckGo Search (best-effort) ← neverError:true (bloqueo IP)
            → Parse Search + Build Candidate URL Queue
            → Split URLs in Batches
              → [loop] Classify URL Type
                → IF PDF → OCR.Space (DISABLED) | Fetch Text (HTML/CSV/JSON)
                → Normalize Content + Store Doc  ← harvesta hrefs
                → Continue URL Loop
            → [done] Build 2nd Pass Queue (Harvested)
            → Split Harvested in Batches
              → [loop] IF Harvested PDF → OCR.Space | Fetch Text (Harvested)
                → Store Harvested Doc
                → Continue Harvest Loop
            → [done] Prepare Docs for Extraction (Top-N)
            → OpenAI Structured Extract (HTTP)  ← Claude Haiku, 1 llamada combinada
            → Parse + Store Extracted JSON
            → Build Graph + Signals + Learning Update  ← genera señales + llama Haiku inline
            → OpenAI Report Writer (HTTP)              ← Claude Haiku, reporte final
            → Parse + Store Final Report
            → IF Result Callback Provided → Send Result Callback | Done (no-op)

Bestia Status (Webhook GET /bestia-status?runId=X)
  → Edit Fields → Respond to Webhook

Bestia Result (Webhook GET /bestia-result?runId=X)
  → Get Run Result  ← lee staticData, devuelve resultado completo
```

---

## Estado persistente (staticData)

Cada run se guarda en `staticData.runs[runId]`:

```javascript
{
  status: "running" | "done" | "error",
  step: "discovery" | "fetch" | "extract" | "signals" | "report" | "done",
  progress: 0–100,
  logs: [{ t: ISO, m: string }],
  docs: [{ url, kind, text_preview, has_text, pdfUrl, error, harvested }],
  sources: [{ kind, url, confidence }],
  _harvested: string[],     // URLs cosechadas de hrefs
  _seedUrls: string[],      // URLs iniciales
  _combinedRequest: object, // payload para Claude Haiku
  extracted: { documents, fragments, actors, procedures, relations },
  signals: Signal[],
  report: Report,
  result: RunResult,        // objeto final devuelto por /bestia-result
  localityName, dateFrom, dateTo, isPremium, plan, createdAt
}
```

**IMPORTANTE:** `staticData` solo es confiable para polling **después** de que la ejecución termina. Durante el run, el nodo `Build Graph + Signals` escribe el resultado final inline — el polling de `/bestia-result` es el método correcto, NO pollear `/bestia-status` en tiempo real.

Runs se eliminan automáticamente después de 10 minutos (cleanup en `Update Progress: Discovery start`).

---

## Reglas operativas críticas

### Patching de nodos (Editor Remoto)
- Siempre incluir `newType` si se cambia el tipo del nodo
- Cada PUT al workflow resetea `availableInMCP: false` → reactivar en UI manualmente
- Verificar con `n8n:get_workflow_details` después de cada patch
- No confiar solo en la respuesta del Editor Remoto

### DuckDuckGo
- Bloquea IPs de n8n Cloud con ECONNRESET
- Fix: `neverError: true` en opciones del nodo HTTP
- El nodo `Parse Search` lee seedUrls de `run._seedUrls` (escritas por Wikidata Search Entities), no del resultado de DDG

### PDFs escaneados
- Muchos boletines oficiales son PDFs de imagen → texto vacío
- OCR.Space en primer loop está **DESHABILITADO** (nodo disabled)
- Los PDFs se envían directamente a Claude vía `{ type: 'document', source: { type: 'url', url } }`
- Solo funciona si el PDF tiene texto embebido. PDFs escaneados requieren OCR manual o Vision API.

### Extracción combinada
- `Prepare Docs for Extraction (Top-N)` construye un único mensaje con todos los docs
- Se hace UNA sola llamada a Claude Haiku (no un loop por documento)
- El payload se guarda en `run._combinedRequest` para que el nodo HTTP lo lea

---

## Municipios verificados (HTTP 200)

| Municipio | Población | URL |
|-----------|-----------|-----|
| Córdoba Capital | 1.4M | gobiernoabierto.cordoba.gob.ar |
| Río Cuarto | 160k | riocuarto.gob.ar |
| Villa María | 90k | villamaria.gob.ar |
| Alta Gracia | 50k | altagracia.gob.ar |
| Río Tercero | 47k | riotercero.gob.ar |
| Bell Ville | 34k | bellville.gob.ar |
| Villa Allende | 32k | villaallende.gob.ar |
| La Calera | 30k | lacalera.gob.ar |
| Cosquín | 20k | cosquin.gob.ar |
| Deán Funes | 17k | deanfunes.gob.ar |
| Laboulaye | 16k | laboulaye.gob.ar |
| Villa del Rosario | 15k | villadelrosario.gob.ar |
| Pilar | 14k | comunadepilar.gob.ar |

**Excluidos** (timeout / sin URL): Villa Carlos Paz, San Francisco, Jesús María, Cruz del Eje, Oncativo, Unquillo, Malagueño.

---

## Señales de riesgo (typologies)

| Typology | Score range | Trigger |
|----------|-------------|---------|
| `supplier_concentration` | 50–95 | proveedor ≥35% del gasto total |
| `amount_outliers` | 60–80 | monto > mediana + 6×MAD |
| `network_centrality` | 55–70 | nodo con ≥5 relaciones en grafo |
| `document_similarity` | 40–55 | prefijos idénticos en múltiples docs |
| `proveedor_reciente` | 70–80 | empresa <12 meses antes del contrato |
| `proveedor_inactivo` | 80–90 | estado AFIP cancelada/inactiva |
| `coverage_limitations` | 0–25 | informativa, siempre presente |

---

## Regla no negociable

**Cero datos inventados o hardcodeados en reportes.** Un solo error verificable destruye la credibilidad. Ante ausencia de datos → reportar "sin datos suficientes", nunca rellenar.

---

## Última actualización
Marzo 2026. Verificar seedUrls de municipios nuevos antes de agregarlos al catálogo.
