# ANÁLISIS INTEGRO DE DATOS — ARGOS

> Auditoría operativa, lógica y de exposición de la base de datos ARGOS.
> Fecha de análisis: 2026-04-26.
> Branch: `claude/chat-first-ui-design-aWg0V`.

---

## TL;DR — qué encontré

1. **El 95 % de los datos cargados no están expuestos al frontend.** De 26 tablas, solo 5 son consumidas por endpoints (contratos, empresas, señales_cache, fuentes_datos, alertas). Las cuatro tablas más grandes —`igj_autoridades` (2.29M), `igj_entidades` (420K), `rns_personas_juridicas` (196K) y `agentes_publicos` (178K)— **nunca llegan al usuario**. Es como tener una base con todos los actores políticos del país y mostrar solo los contratos.
2. **El cruce funcionario↔proveedor —el corazón de un detector de conflictos de interés— no existe.** Tenemos los dos lados (178K agentes + 2,421 contratos) pero no hay detector ni endpoint que los una. Lo mismo con director↔proveedor (igj_autoridades + contratos).
3. **`presupuesto_ejecucion` está vacío** (0 filas) pese a que `seed:cordoba-presupuesto` corrió. Bug de parser identificado: las regex de columnas no matchean los nombres reales de Córdoba (`P.Pr.`, `DENOMINACION`, `DEFINITIVO`, `COMPROMISO`).
4. **El esquema lógico es coherente pero está disperso**. Las dos vistas de "universo cordobés" (N2) cumplen su rol; lo que falta es un `actores` unificador que combine personas físicas + jurídicas + funcionarios + directores y un endpoint que lo sirva.
5. **La identidad está medio resuelta**. `identity_matches` cachea CUIT por nombre, pero solo se popula al ejecutar `analyze.ts` — no al consultar el frontend, así que el usuario que busca a "ROGGIO" en la search bar no recibe resolución activa.

---

## 1. Inventario completo de tablas

| # | Tabla | Filas | Origen | Schema (cols clave) | Expuesta? |
|---|-------|-------|--------|---------------------|-----------|
| 1 | `contratos` | 2,421 | Córdoba Capital + Nación + CABA + Santa Fe | hash, municipio, anio, proveedor, monto, fuente_url, numero_expediente | ✅ `/api/dashboard`, `/api/entidad/:n`, `/api/contrato/:hash` |
| 2 | `licitaciones_llamado` | 2,341 | Córdoba 2005-2018 (dataset 2 v4747) | id, municipio, expediente, presupuesto_oficial, requiriente | ❌ — sin endpoint |
| 3 | `agentes_publicos` | **178,364** | Córdoba Capital (datasets 131/201/3292) + Provincia (15 ministerios) | id, jurisdiccion, anio, mes, categoria, reparticion, cargo, apellido_nombre, cuit, bruto, neto | ❌ **DORMIDA** |
| 4 | `presupuesto_ejecucion` | **0** | Datasets 14/65/12 Córdoba (parser roto) | id, anio, partida, programa, devengado, pagado | ❌ vacía |
| 5 | `empresas` | 119 | Padrón provincial Córdoba dataset 281 + AFIP + extracción de contratos | cuit, nombre, es_empleador, fuente_padron | ✅ `/api/entidad/:n` (LIMIT 1 por nombre) |
| 6 | `empresas_padron_provincial` | 119 | Dataset 281 Córdoba | cuit, razon_social, rubro, fuente_url | ❌ — solo lectura interna |
| 7 | `directores` | 0 | Iba a poblarse desde IGJ pero `seed-igj.ts` carga `igj_autoridades` directamente | id, cuit_empresa, nombre_director | ❌ vacía / obsoleta |
| 8 | `igj_entidades` | **420,624** | datos.jus.gob.ar IGJ bulk (NACIONAL) | numero_correlativo, cuit, razon_social, tipo_societario, activa | ❌ **DORMIDA** |
| 9 | `igj_autoridades` | **2,291,376** | datos.jus.gob.ar IGJ bulk (NACIONAL) | numero_correlativo, apellido_nombre, tipo_administrador, numero_documento | ❌ **DORMIDA** |
| 10 | `rns_personas_juridicas` | **196,146** (191K Córdoba) | RNS datos.jus.gob.ar bulk anual | id, cuit, razon_social, tipo_societario, dom_fiscal_provincia, dom_legal_provincia | ❌ **DORMIDA** (cargada hoy en M1) |
| 11 | `opensanctions_matches` | 0 | OpenSanctions API + ICIJ bulk | cuit, matched, riesgo, dataset | ✅ vía `/api/cruce/empresa` (cuando hay datos) |
| 12 | `icij_entidades` | 0 | ICIJ Offshore Leaks ZIPs | node_id, nombre, jurisdiccion, fuente | ✅ vía `/api/cruce/icij` (cuando hay datos) |
| 13 | `obras_publicas` | 0 | (sin loader implementado) | id, jurisdiccion, anio, monto, adjudicatario, expediente | ❌ vacía |
| 14 | `proveedores_padron` | 0 | (sin loader; existe `seed:proveedores-padron` pero no carga nada) | — | ❌ vacía |
| 15 | `transferencias` | 0 | (sin loader) — subsidios/becas/planes | id, jurisdiccion, beneficiario, monto | ❌ vacía |
| 16 | `auditorias_tribunal_cuentas` | 0 | (sin loader) | — | ❌ vacía |
| 17 | `boe_cba_pdfs` | 0 | (índice descargado pero no procesado) — Boletín Oficial Córdoba | url, fecha, anio, indexado_en | ❌ vacía |
| 18 | `ocr_jobs` | 0 | (queue para pipeline OCR M2) | id, pdf_url, estado, paginas, intentos | ❌ vacía |
| 19 | `alertas` | 0 | `lib/alertas.ts` cron-friendly (3 chequeos: scrapers/fuentes/datos nuevos) | id, tipo, severidad, leida | ✅ `/api/alertas` + badge |
| 20 | `scrapers_health` | 0 | Cada scraper registra status en cada run | id, ejecutado_en, ok, contratos_count | ✅ `/api/scrapers/health` |
| 21 | `señales_cache` | 8 | `analyze.ts` corre los 12-15 detectores y cachea | id, tipologia, score, severidad, evidencia_json, entidades_cuit | ✅ `/api/dashboard`, `/api/entidad`, `/api/cruce/*` |
| 22 | `reportes` | 3 | Legacy: flujo viejo POST /analizar | id, municipio, expediente_json | ⚠️ legacy, no usado en UI nueva |
| 23 | `fuentes_datos` | 12 | `registrarFuente()` desde cada seed | id, jurisdiccion, oficial, nivel_confianza | ✅ `/api/cruce/fuentes` |
| 24 | `fuentes_publicas_catalogo` | 53 | Catálogo descubierto (CKAN provincia + Córdoba portal) | id, dimension, estado_implementacion, razon_bloqueo | ❌ **sin endpoint propio** (debería estar en `/fuentes`) |
| 25 | `llm_usage` | 1 (?) | `budget-guard.ts` registra cada llamada Sonnet/Haiku | semana_iso, modelo, tokens_in, costo_usd | ✅ `/api/ai/usage` |
| 26 | `identity_matches` | ? | `analyze.ts` cachea resolución nombre→CUIT | proveedor_norm, cuit_resuelto, tier, score | ❌ — solo lectura interna |

**Vistas materializadas:**
- `v_universo_cordobes_empresas` (N2 = proveedores Córdoba ∪ co-empresas via directores compartidos). ✅ usada por analyzer.
- `v_universo_cordobes_personas` (N2 = funcionarios Córdoba ∪ directores de empresas N2). ✅ usada por analyzer.

---

## 2. Mapa de uso real (backend → frontend)

### 2.1 Endpoints REST y tablas que tocan

| Endpoint | Tablas leídas | Páginas frontend que lo consumen |
|----------|---------------|----------------------------------|
| `GET /api/dashboard` | `contratos`, `señales_cache`, `fuentes_datos` | Dashboard.tsx, Municipios.tsx |
| `GET /api/entidad/search?q=` | `contratos.proveedor` (DISTINCT) | CommandPalette.tsx (cmd+k), Entidad.tsx |
| `GET /api/entidad/:nombre` | `contratos`, `empresas`, `señales_cache` | Entidad.tsx |
| `GET /api/contrato/:hash` | `contratos`, `empresas` | Contrato.tsx |
| `GET /api/red/:municipio` | Neo4j (no DuckDB) | Red.tsx |
| `GET /api/cruce/fuentes` | `fuentes_datos` | Fuentes.tsx |
| `GET /api/cruce/icij?nombre=` | `icij_entidades` | (no consumido todavía) |
| `GET /api/cruce/persona/:n` | OpenSanctions API live | Entidad.tsx (botón cruce) |
| `GET /api/cruce/empresa/:n` | `opensanctions_matches`, OpenSanctions live | Entidad.tsx |
| `GET /api/scrapers/health` | `scrapers_health` | Municipios.tsx |
| `GET /api/alertas` | `alertas` | Alertas.tsx, AppShell.tsx (badge) |
| `POST /api/chat` | LLM stream + context (sin DB lookup) | Explorar.tsx |
| `POST /api/ai/suggestions` | LLM (Haiku) sin DB | sugerencias automáticas |
| `GET /api/ai/usage` | `llm_usage` | (admin only?) |
| `POST /api/denuncia` | `contratos`, `señales_cache` | Denuncia.tsx |
| `GET /api/watchlist/novedades` | `contratos`, `señales_cache` | AppShell.tsx (badge), Watchlist.tsx |

### 2.2 Tablas dormidas (cargadas, **sin endpoint que las exponga**)

| Tabla | Filas | Por qué duele |
|-------|-------|--------------|
| `igj_autoridades` | 2.29M | Es el quién-es-quién de Argentina entera. Sin esto no podés ver "qué empresas dirige X persona". |
| `igj_entidades` | 420K | Catálogo nacional de personas jurídicas. Imprescindible para detectar empresas durmientes / shell. |
| `rns_personas_juridicas` | 196K (191K CBA) | Cargado **hoy** en M1.4. La razón principal de M1 fue tenerlo, y hoy nadie lo puede usar. |
| `agentes_publicos` | 178K | Quién está en el Estado y cuánto cobra. Sin exposición no se pueden detectar conflicto-de-interés. |
| `licitaciones_llamado` | 2,341 | Pre-adjudicación con presupuesto oficial. Cruzado con `contratos` permite ver desvío real vs estimado. |
| `fuentes_publicas_catalogo` | 53 | El usuario no ve qué se descubrió pero no se cargó (ej. dataset 187 pendiente). |

### 2.3 Tablas vacías por bugs/loaders pendientes

- `presupuesto_ejecucion` (0): bug de parser conocido — regex de columnas no matchea `P.Pr./DEFINITIVO/COMPROMISO`.
- `obras_publicas` (0): no hay seed implementado. Propuesta: dataset 262 obras Córdoba.
- `transferencias` (0): no hay seed. Propuesta: subsidios provinciales + becas.
- `auditorias_tribunal_cuentas` (0): scraping pendiente Tribunal de Cuentas Provincial.
- `boe_cba_pdfs` (0): índice CSV descargado pero no procesado.
- `proveedores_padron` (0): tabla de catálogo, redundante con `empresas_padron_provincial`. **Marcar deprecada y borrar**.
- `directores` (0): redundante con `igj_autoridades`. **Deprecar**.
- `opensanctions_matches`/`icij_entidades`: pendiente de correr `seed:opensanctions` + `seed:icij`.

---

## 3. Esquema relacional — qué encaja con qué

```
                                  ┌───────────────────────┐
                                  │  agentes_publicos     │  178K  (CBA + provincia)
                                  │  apellido_nombre, cuit │
                                  └─────────┬─────────────┘
                                            │ (nombre / cuit)
                                            ▼
                  ┌──────────────────────────────────────────────────┐
                  │   personas físicas (universo cordobés)           │
                  │   ──────────────────────────────────────────     │
                  │   • funcionarios (agentes_publicos)              │
                  │   • directores (igj_autoridades)                 │
                  └─────────┬──────────────────────────┬─────────────┘
                            │ (numero_documento)       │ (apellido_nombre)
                            ▼                          ▼
       ┌────────────────────────────┐         ┌──────────────────────────┐
       │  igj_autoridades  2.29M    │ ◀─────▶ │  igj_entidades   420K    │
       │  numero_correlativo, dni   │  N:1    │  numero_correlativo,cuit │
       └────────────────────────────┘         └──────────┬───────────────┘
                                                         │ (cuit)
                                                         ▼
                                          ┌─────────────────────────────┐
                                          │  rns_personas_juridicas 196K│
                                          │  cuit, razon_social         │
                                          └────────────┬────────────────┘
                                                       │ (cuit)
                                                       ▼
                                       ┌──────────────────────────────┐
                                       │  empresas  (CUIT canónico)   │
                                       │  cuit, nombre, es_empleador  │
                                       └────────┬─────────────────────┘
                                                │ (cuit / nombre via identity_matches)
                                                ▼
              ┌─────────────────────────────────────────────────────┐
              │  contratos    2,421                                  │
              │  proveedor, proveedor_norm, monto, expediente,      │
              │  numero_expediente                                  │
              └────────────┬───────────────────────────┬────────────┘
                           │ (numero_expediente)        │
                           ▼                            │
            ┌────────────────────────────┐              │
            │  licitaciones_llamado 2.3K │              │
            │  expediente, presupuesto_  │              │
            │  oficial                   │              │
            └────────────────────────────┘              │
                                                        ▼
                                  ┌─────────────────────────────────┐
                                  │  señales_cache  (8 hoy, motor) │
                                  │  tipologia, evidencia_json,     │
                                  │  entidades_cuit                 │
                                  └─────────────────────────────────┘

      ┌────────────────────────┐         ┌────────────────────────┐
      │ opensanctions_matches  │         │  icij_entidades        │
      │ cuit, riesgo, dataset  │         │  nombre_norm, fuente   │
      └────────────────────────┘         └────────────────────────┘
                  │                                    │
                  └──────────── ambos cachean externos para señal `aparicion_offshore`
```

### 3.1 Joins que ya existen pero no se aprovechan

1. `contratos.numero_expediente = licitaciones_llamado.expediente` → desvío presupuesto_oficial vs monto adjudicado. **NO IMPLEMENTADO.**
2. `agentes_publicos.cuit = contratos.proveedor (vía empresas.cuit)` → conflicto funcionario↔proveedor. **NO IMPLEMENTADO.**
3. `igj_autoridades.numero_documento` (DNI funcionario) ≈ `agentes_publicos.cuit` (CUIT). Necesita normalización DNI=CUIT-2dígitos. **NO IMPLEMENTADO.**
4. `igj_entidades.cuit = contratos.proveedor_cuit (resuelto via identity)` → enriquecer perfil de proveedor con tipo societario, fecha constitución. **NO IMPLEMENTADO.**
5. `rns_personas_juridicas.cuit = contratos.proveedor_cuit` → mismo enriquecimiento + domicilio. **NO IMPLEMENTADO.**

### 3.2 Tabla intermedia faltante: `personas` (canónica)

Hoy "una persona" vive disgregada en:
- `agentes_publicos` (apellido_nombre + cuit a veces)
- `igj_autoridades` (apellido_nombre + numero_documento)
- el campo proveedor de `contratos` cuando es persona física (raro pero existe)

**Propuesta:** vista materializada `personas` que dedupe por (DNI, nombre_normalizado) con score de confianza, similar a `identity_matches` pero para físicas. Permite búsqueda unificada y detección de "Pedro Martínez" siendo funcionario + director simultáneamente.

---

## 4. Problemas de modelado detectados

### 4.1 Tablas redundantes / a deprecar

| Tabla | Razón |
|-------|-------|
| `directores` | Redundante con `igj_autoridades`. Vacía. Borrar. |
| `proveedores_padron` | Redundante con `empresas_padron_provincial`. Vacía. Borrar. |
| `reportes` | Legacy del flujo POST /analizar pre-Sprint 2. UI nueva no lo usa. Mantener por compatibilidad o migrar a casos. |
| `boe_cba_pdfs` | Esquema mínimo, faltan campos `texto_extraido`, `metodo` (pdf-text vs pdf-ocr), `cuits_detectados`. Renombrar/extender al implementar M2 OCR. |

### 4.2 Tablas con schemas pobres / a extender

- `igj_entidades`: solo (numero_correlativo, cuit, razon_social, tipo_societario, activa). **Falta** `jurisdiccion` (CABA vs provincial), `fecha_constitucion`, `objeto_social`. Estos campos los tiene la fuente original pero el seed los descarta.
- `igj_autoridades`: faltan `cargo_especifico`, `fecha_designacion`, `vigente`. Útil para distinguir un presidente actual de un suplente histórico.
- `obras_publicas`: schema OK pero loader inexistente.

### 4.3 Falta de índices clave

```sql
-- Ya hay: idx_contratos_expediente, idx_rns_cuit, idx_identity_cuit, etc.
-- FALTAN:
CREATE INDEX idx_agentes_apellido ON agentes_publicos(LOWER(apellido_nombre)) WHERE apellido_nombre IS NOT NULL;
CREATE INDEX idx_agentes_cuit    ON agentes_publicos(cuit) WHERE cuit IS NOT NULL;
CREATE INDEX idx_igj_aut_dni     ON igj_autoridades(numero_documento) WHERE numero_documento IS NOT NULL;
CREATE INDEX idx_igj_aut_corr    ON igj_autoridades(numero_correlativo);
CREATE INDEX idx_igj_ent_cuit    ON igj_entidades(cuit) WHERE cuit IS NOT NULL;
CREATE INDEX idx_lic_expediente  ON licitaciones_llamado(expediente);
```

Sin estos índices, búsquedas por DNI o nombre tardan segundos en tablas de millones de filas — inaceptable para search bar interactiva.

---

## 5. Datos que faltan para mapear "toda la esfera pública"

Desde la perspectiva del objetivo declarado:

| Dimensión | Cobertura actual | Gap | Prioridad |
|-----------|-------------------|-----|-----------|
| Contrataciones Córdoba 2010-2026 | 2015-2025 (parcial), 2019 con 1 sola fila | Faltan 2010-2014 y 2019 | 🔴 Alta — M2 OCR Boletín Municipal |
| Contrataciones Nación/CABA/Santa Fe | Connectors implementados, sin correr en producción | Correr seeds | 🟡 Media |
| Sueldos funcionarios Córdoba | 178K (Capital + Provincia 2017-2025) | Falta dataset 5 (escala) y mes-a-mes 2010-2016 | 🟡 Media — M2 OCR |
| Presupuesto ejecutado Córdoba | 0 (bug parser) | Fix parser | 🔴 Alta |
| Personas jurídicas (RNS+IGJ) | 2.7M (RNS Córdoba + IGJ nacional) | Suficiente para Córdoba | ✅ |
| Directores compartidos | 2.29M en igj_autoridades | Sin exposición; falta Neo4j para provincia | 🔴 Alta |
| DDJJ funcionarios Córdoba | 0 | M2 OCR PDFs cat 85+105 | 🟡 Media |
| Aportantes campañas | 0 | M2 Playwright CNE | 🟡 Media |
| Boletín Municipal Córdoba 2013-2026 | índice CSV descargado, contenido 0 | M2 OCR ~3,500 PDFs | 🔴 Alta |
| Boletín Provincial Córdoba | 0 | M2 OCR ~20K PDFs | 🟡 Media |
| Obras públicas Córdoba | 0 | Loader dataset 262 + datos.gob.ar | 🟡 Media |
| Tribunal de Cuentas auditorías | 0 | Scraping (puede ser ASPX) | 🔵 Baja |
| Subsidios/transferencias | 0 | Datasets dispersos | 🔵 Baja |
| Concejales — declaraciones | 819 sueldos pero sin DDJJ | M2 OCR | 🔵 Baja |
| Empleados Tribunal de Justicia provincial | 0 | datosabiertos.justiciacordoba.gob.ar | 🔵 Baja |
| Padrón electoral / aportantes a partidos | 0 | CNE, requiere captcha | 🔵 Baja |

---

## 6. Plan de acciones priorizadas (próximas iteraciones)

### Iteración 2 — Backend exposición (4-6h)
- [ ] **Endpoints /api/igj/persona/:dni** y `/api/igj/entidad/:cuit` (lookup directo en igj_*)
- [ ] **Endpoint /api/agentes/search?q=** y `/api/agentes/persona/:nombre` (consume agentes_publicos)
- [ ] **Endpoint /api/rns/empresa/:cuit** y `/api/rns/search?q=` (consume rns_personas_juridicas)
- [ ] **Endpoint /api/actores/search?q=** unificado (busca en agentes + igj_autoridades + rns + empresas)
- [ ] Crear índices SQL faltantes
- [ ] Tests unitarios para los 4 endpoints nuevos

### Iteración 3 — Frontend /actores (6-8h)
- [ ] Página `/actores` con búsqueda unificada
- [ ] Tabs: "Funcionarios", "Empresas", "Directores", "Proveedores"
- [ ] Perfil de actor con tabs (resumen + cargos + contratos + alertas + cruces)
- [ ] Card "esta persona también es director de…"
- [ ] Card "esta empresa contrata con… / es controlada por…"
- [ ] Extender CommandPalette para incluir personas + entidades RNS

### Iteración 4 — Detector conflicto funcionario↔proveedor (3-4h)
- [ ] Función `detectarConflictoFuncionarioProveedor(contratos, agentes)` en `engine/signals.ts`
- [ ] Match por (apellido_nombre normalizado) y (cuit↔proveedor_cuit) con tier
- [ ] Severidad 'grave', score 95, marco legal Ley 25.188 art. 13
- [ ] Tests en `signals.test.ts`
- [ ] Agregar al config `detectors-config.json`

### Iteración 5 — Fix parser presupuesto + integración licitaciones (4-5h)
- [ ] Inspector dedicado para schema real de XLS Córdoba presupuesto (volcar primer row data)
- [ ] Regex columnas: `P.Pr.` → programa, `DENOMINACION` → partidaNombre, `DEFINITIVO` → creditoVigente, `COMPROMISO` → devengado
- [ ] Verificar count post-fix
- [ ] Endpoint `/api/contrato/:hash/licitacion` (cruce expediente con licitaciones_llamado)
- [ ] Mostrar en Contrato.tsx: "Presupuesto oficial vs adjudicación: $X vs $Y (Z% diff)"

### Iteración 6 — Limpieza schema (2h)
- [ ] DROP TABLE `directores`, `proveedores_padron` (vacías y redundantes)
- [ ] Extender `igj_entidades` (jurisdiccion, fecha_constitucion) y re-cargar
- [ ] Migración auditada en `migrations/0002_clean_unused.sql`

### Iteración 7 — Contratos pre-2019 vía Boletín Oficial OCR (M2)
- [ ] Bajar índice CSV dataset 2781 (boletines 2013-2023) y 3,500 PDFs
- [ ] Pipeline `unpdf` (text layer detect) → `tesseract.js` (fallback)
- [ ] Regex extractor de contratos (proveedor + monto + expediente + fecha)
- [ ] Trazabilidad por página

### Iteración 8 — Loader obras públicas + transferencias (4-5h)
- [ ] dataset 262 Córdoba (obras públicas)
- [ ] datos.gob.ar contratar histórico (filtrar Córdoba)
- [ ] Subsidios provinciales

---

## 7. Conclusión y orden de salida

El backend tiene 2.7 millones de filas de datos públicos cargados. El frontend hoy solo expone los 2,421 contratos y los 8 señales detectadas. **Eso es un porcentaje monstruoso de gap entre datos cargados y datos accionables.**

La acción más alta-impacto es la **Iteración 2 (backend endpoints) + Iteración 3 (página /actores)**: convierte 2.7M filas dormidas en una herramienta de mapping de poder. La **Iteración 4 (detector conflicto)** es la primera señal genuinamente nueva en meses: usa datos que ya tenemos.

Empiezo por Iter 2.

---

*Generado por análisis estructural automático. Validado contra `inspect-db.ts`, `routes/*`, `frontend/src/lib/queries.ts`, schema de `db.ts`. Última actualización: 2026-04-26.*
