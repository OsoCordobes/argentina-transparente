# La Bestia — Shared Agent Memory

> Este archivo es el canal de comunicación entre **Cowork** (desktop app) y **Claude Code** (VS Code).
> Ambos agentes lo leen y actualizan. El usuario (Lautaro) no necesita ser intermediario.
> **Protocolo:** antes de trabajar, leé la sección ESTADO. Al terminar, actualizá ESTADO y LOG.

---

## PROYECTO

**Nombre:** La Bestia — Motor Anticorrupción Ciudadano
**Misión:** Democratizar el control del gasto público en Argentina. Cualquier vecino puede detectar señales de corrupción en su municipio en < 1 minuto.
**Stack:** React + TypeScript + Tailwind + Vite (frontend) / Python backend en Railway (producción) / n8n en `https://osocordobes.app.n8n.cloud` (orquestador) / Claude API

---

## ENDPOINTS — REGLAS DE ORO

```
POST /webhook/bestia-run        → inicia análisis, devuelve { ok: true, runId: "run-XXX" }
GET  /webhook/bestia-result     → polling cada 4s con ?runId=XXX
                                  mientras corre: { ok: false }
                                  cuando termina: { ok: true, runId, localityName, dateFrom, dateTo, coverage,
                                                    report: { executive_summary, risk_score, findings[],
                                                              procedures[]?, coverage, limitations } }
```

**NUNCA usar `/bestia-status`** — no es confiable durante ejecución.
**NUNCA hardcodear datos** — todo lo que se muestra debe venir 100% de la API.

---

## CONFIGURACIÓN DE ENTORNO

```
# .env (ya creado)
VITE_BACKEND_URL=http://localhost:8000   ← cambiar a URL de Railway cuando esté deployado
VITE_SUPABASE_PROJECT_ID=ogeqneeevsevhsjowppm
VITE_SUPABASE_URL=https://ogeqneeevsevhsjowppm.supabase.co
```

**Pendiente:** reemplazar `VITE_BACKEND_URL` con la URL pública de Railway una vez deployado el backend.

---

## ESTADO ACTUAL

**Última actualización:** Cowork — 2026-03-17
**Dev server:** `npm install && npm run dev` → `http://localhost:5173`
**Build status:** compilación sin verificar — correr `npm run build` para chequear TypeScript

### ✅ Completado
- `src/pages/AnalysisStatus.tsx` — **FIX DE POLLING** (Cowork)
  - Eliminada `poll()` que llamaba a `/bestia-status`
  - Animación simulada por tiempo (300ms tick, sin API): 0–8s→25%, 8–16s→55%, 16–24s→80%, 24s+→95%
  - Polling real solo a `/bestia-result?runId=XXX` cada 4s
  - `{ ok: false }` → seguir | `{ ok: true, report }` → navegar a /report
  - Timeout 3 min conservado

- `src/lib/n8n-config.ts` — (Claude Code)
  - URL dinámica via `VITE_BACKEND_URL` env var, fallback a n8n cloud
  - Municipios importados desde catálogo `@/data/municipios-cordoba`
  - Interfaces `Procedure`, `ProcedureRow` agregadas
  - `BestiaReport.procedures?: ProcedureRow[]` (campo opcional)

- `src/pages/Report.tsx` — (Claude Code)
  - Importa y renderiza `<ProcedureTable procedures={report.procedures ?? []} />`
  - Score thresholds ajustados: verde <40, amarillo 40–70, rojo ≥70
  - Shield icon removido del resumen ejecutivo

- `src/components/ProcedureTable.tsx` — **NUEVO** (Claude Code)
  - Tabla con columnas: Nº Decreto, Fecha, Proveedor, Monto (ARS), Tipo, Objeto, Fuente (link)
  - Retorna null si `procedures` está vacío (no muestra sección)
  - Formato ARS con `Intl.NumberFormat('es-AR')`

- `src/data/municipios-cordoba.ts` — **NUEVO** (Claude Code)
  - Catálogo verificado de municipios de Córdoba con URLs oficiales
  - Solo incluye municipios con respuesta HTTP 200 confirmada

### 🔲 Pendiente
- [ ] Correr `npm run build` y confirmar cero errores TypeScript
- [ ] Deploy Railway completado y URL pública obtenida
- [ ] Actualizar `VITE_BACKEND_URL` en `.env` con URL de Railway
- [ ] Test en vivo end-to-end: "Alta Gracia, Córdoba" / 2024-01-01 → 2024-12-31
- [ ] Verificar que `report.procedures` llega con datos reales de la API (el campo es opcional)
- [ ] Confirmar que `report.ok` viene en la respuesta (el frontend chequea `data?.ok === true`)

---

## ARQUITECTURA DE ARCHIVOS CLAVE

```
src/
├── pages/
│   ├── AnalysisStatus.tsx   ← polling/progress (modificado por Cowork)
│   ├── Report.tsx           ← reporte completo (modificado por Claude Code)
│   ├── Landing.tsx          ← pantalla selector de municipio
│   └── Dashboard.tsx        ← dashboard principal
├── components/
│   ├── ProcedureTable.tsx   ← tabla de procedimientos (nuevo, Claude Code)
│   ├── analysis/
│   │   ├── EntitySelector.tsx
│   │   ├── LeaveAnalysisDialog.tsx
│   │   └── CancelAnalysisDialog.tsx
│   └── layout/AppHeader.tsx
├── lib/
│   └── n8n-config.ts        ← endpoints, tipos, env var (modificado por Claude Code)
└── data/
    └── municipios-cordoba.ts ← catálogo verificado (nuevo, Claude Code)
```

---

## PROTOCOLO DE COMUNICACIÓN ENTRE AGENTES

**Cowork → Claude Code:** actualiza ESTADO y deja tareas en la sección Pendiente.
**Claude Code → Cowork:** agrega entrada en `## CLAUDE CODE LOG` con lo que hizo.
**Ambos:** leer ESTADO antes de tocar cualquier archivo. No pisarse cambios.

---

## CLAUDE CODE LOG

### 2026-03-17 — Claude Code (primera entrada)
- Actualizó `n8n-config.ts`: env var `VITE_BACKEND_URL`, catálogo de municipios, interfaces `Procedure`/`ProcedureRow`
- Creó `src/components/ProcedureTable.tsx`: tabla de procedimientos con formato ARS
- Creó `src/data/municipios-cordoba.ts`: catálogo verificado de municipios
- Actualizó `Report.tsx`: integró `ProcedureTable`, ajustó thresholds de score (40/70)
- Creó `.env` con `VITE_BACKEND_URL=http://localhost:8000`
