# MISIÓN — Cobertura Córdoba 2010-2026 + Mapa de Actores

> Plan ejecutable autónomo. Branch de trabajo: `claude/chat-first-ui-design-aWg0V`.
> Fecha de inicio: 2026-04-26.

---

## Objetivo publicable (headline)

> **"Un cordobés logró digitalizar y estructurar en una base de datos todo el gasto público de Córdoba y usarla en una herramienta de transparencia."**

Para que el headline sea verdad, el beta debe poder responder con datos verificables a:

1. **¿Quiénes son los actores influyentes?** Funcionarios + empresas proveedoras + directores + concejales + aportantes de campañas.
2. **¿Dónde va y en qué se usa cada peso de los impuestos cordobeses entre 2010 y hoy?** Contratos, sueldos, ejecución presupuestaria, obras públicas, transferencias.

---

## Stack base (zero binarios externos en Windows)

```bash
cd backend
npm i unpdf pdf-parse tesseract.js pdf-to-png-converter cheerio playwright p-queue compromise
npx playwright install chromium
```

| Lib | Uso |
|---|---|
| `unpdf` | Extracción texto PDF digital (zero deps Windows) |
| `pdf-parse` | Fallback si unpdf falla |
| `tesseract.js` | OCR puro JS+WASM, modelo `spa.traineddata`, 4 workers paralelo |
| `pdf-to-png-converter` | PDF → PNG para feed a tesseract (sin Ghostscript) |
| `cheerio` | HTML parsing estático |
| `playwright` | Scraping JS-rendered (~170MB chromium) |
| `p-queue` | Rate limiting `.gov.ar` (1 req/2s default) |
| `compromise` | NER fallback en español si regex no alcanza |

---

## Estado actual (2026-04-26 antes de arrancar)

| Tabla | Cobertura conocida | Gap a cerrar |
|---|---|---|
| `contratos` Córdoba Capital | ~2,421 contratos 2015-2025 (dataset 2 versión actual) | **Dataset 2 tiene 8 versiones cubriendo 2005-2023 — re-correr** |
| `licitaciones_llamado` | 2,777 llamados 2005-2018 | OK histórico |
| `agentes_publicos` | 33K sueldos 2017-2025 | + dataset 131 (sueldos funcionarios mensual 2016-2023) |
| `presupuesto_ejecucion` | Cargado parcial | + dataset 187 (Cuenta General Ejercicio 2014-2022) |
| `empresas` | ~ varios miles | + Registro Nacional Sociedades datos.jus.gob.ar |
| `igj_entidades` | 420K nacional | Filtrar a Córdoba para vista N2 |
| `igj_autoridades` | 2.3M nacional | Filtrar a directores de empresas Córdoba |
| `icij_entidades` | bulk Argentina | OK |
| `boe_cba_pdfs` | 40K PDFs indexados | Procesar (texto+OCR) |
| (nueva) `agentes_provinciales` | — | empleados Poder Ejecutivo provincial CKAN (112K) |
| (nueva) `sueldos_funcionarios_mun` | — | Dataset 131 |
| (nueva) `aportantes_campanas` | — | CNE Aportantes Córdoba 2019-2026 |
| (nueva) `declaraciones_juradas` | — | Cat 85 + 105 (~700 funcionarios) |
| (nueva) `boletines_mun_cba` | — | ~3K PDFs Boletín Municipal 2010-2026 |
| (nueva) `boletines_prov_cba` | — | ~20K PDFs Boletín Provincial sección 4 (Licitaciones) |

---

## Fuentes mapeadas — tier de prioridad

### Tier S — implementación inmediata (alto valor, sin OCR)

| # | Fuente | URL / patrón | Volumen | Método | Bloquea? |
|---|---|---|---|---|---|
| 1 | Dataset 2 todas versiones | `gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2/version-dato` | ~5K contratos extra (2005-2014) | API REST + XLSX, parser ya existe | No |
| 2 | Dataset 131 sueldos funcionarios | `…/dato/131/version-dato` (81 archivos XLSX+CSV mensuales) | 81 archivos × ~500 filas = ~40K filas | API REST + parser nuevo | No |
| 3 | Dataset 187 Cuenta General Ejercicio | `…/dato/187/version-dato` (2014-2022) | 9 archivos | API REST + parser nuevo | No |
| 4 | Dataset 281 padrón completo | `…/dato/281/version-dato` (4 versiones 2019-2022) | ARGOS tiene 119; debería tener ~500+ | Re-correr | No |
| 5 | Empleados Poder Ejecutivo provincial | `datosgestionabierta.cba.gov.ar/api/3/action/package_show?id=empleados-poder-ejecutivo` | 112K filas en 13 XLSX+CSV | CKAN API + XLSX parser | No |
| 6 | Registro Nacional Sociedades | `datos.jus.gob.ar/dataset/justicia-registro-nacional-sociedades` (13 recursos CSV/ZIP) | mensual 2019-2026 | CKAN API + CSV streaming | No |

### Tier A — siguientes (requieren scraping o PDF parsing)

| # | Fuente | URL / patrón | Volumen | Método |
|---|---|---|---|---|
| 7 | Boletín Municipal Córdoba | `static01.cordoba.gob.ar/boe/boletines/boletin_<YYYY>_<8DIGITS>.pdf` + dataset 2781 (índice CSV) | ~3,500 PDFs | URL pattern + unpdf + tesseract.js fallback + regex extractor |
| 8 | Boletín Oficial Provincia (sección 4) | `boletinoficial.cba.gov.ar/wp-content/4p96humuzp/<YYYY>/<MM>/<filename>.pdf` | ~20K PDFs | Playwright scraper para listing + bulk download + OCR |
| 9 | Declaraciones Juradas funcionarios | `…/dato?categoria=85` y `categoria=105` | ~700 funcionarios | API REST + descarga PDFs + (probable OCR) |
| 10 | Aportantes CNE | `aportantes.electoral.gob.ar/aportes/` | 2019-2026 distrito Córdoba | Scraper Playwright + descarga CSV |
| 11 | CONTRATAR histórico nacional | `datos.gob.ar/dataset/jgm-contratar-historico` | obras nacionales en Córdoba | Filtrar provincia=Córdoba |

### Tier B — verificar antes de invertir

12. **Digesto Municipal**: ASPX scraper, baja prioridad.
13. **datosestadistica.cba.gov.ar**: caído desde el extractor, retry desde otro IP.
14. **Tribunal de Cuentas Municipal "Tribunal Abierto"**: verificar si publica auditorías descargables.

### Tier descartado (confirmado inviable)

- AFIP padrón empleadores bulk: requiere clave fiscal nivel 3.
- compraspublicas.cba.gov.ar: HTML scraping sin URL predecibles, baja prioridad vs alternativas.
- Tribunal de Cuentas Provincial: no publica informes con descarga.
- Concejo Deliberante: sin datos estructurados.

---

## Plan secuencial (milestones)

### M1 — CKAN bulk (Tier S, sin OCR) — estimado 1 día compute

Pre-aprobado, ejecutar todo en serie:

1. M1.1 — re-correr `seed:cordoba` con todas las versiones del dataset 2 → +contratos 2005-2014
2. M1.2 — nuevo `seed-cordoba-sueldos-funcionarios.ts` (dataset 131) → tabla `sueldos_funcionarios_mun`
3. M1.3 — nuevo `seed-cordoba-empleados-prov.ts` (CKAN provincial) → tabla `agentes_provinciales`
4. M1.4 — nuevo `seed-rns.ts` (Registro Nacional Sociedades) → tabla `rns_personas_juridicas`
5. M1.5 — nuevo `seed-cordoba-ddjj.ts` (categorías 85 + 105) → tabla `declaraciones_juradas`
6. M1.6 — nuevo `seed-aportantes-cne.ts` (CNE Córdoba) → tabla `aportantes_campanas`
7. M1.7 — nuevo `seed-cordoba-cuenta-general.ts` (dataset 187) → ampliar `presupuesto_ejecucion`
8. M1.8 — completar `seed-cordoba-padron-prov` con 4 versiones (no solo 1)

### M2 — Boletín Municipal Córdoba (Tier A, OCR libre) — estimado 4-6h compute

1. M2.1 — instalar packages stack (unpdf + tesseract.js + pdf-to-png-converter)
2. M2.2 — descargar dataset 2781 (índice CSV/XLS de boletines 2013-2023)
3. M2.3 — construir URLs y descargar bulk PDFs (~3K)
4. M2.4 — pipeline: unpdf first (text layer detect via `charsPerPage > 100`), tesseract.js fallback
5. M2.5 — regex extractor (monto / fecha / CUIT / norma / proveedor) → tabla `contratos` con `metodo_extraccion='pdf-text'` o `'pdf-ocr'`
6. M2.6 — auditoría: cada contrato extraído debe tener `fuente_url` apuntando al PDF original

### M3 — Boletín Oficial Provincia (Tier A, OCR libre) — multi-día compute

1. M3.1 — Playwright scraper para listings mensuales (resuelve sufijo `_<rand>`)
2. M3.2 — bulk download paralelo p-queue 4-concurrency, idempotente con checkpoint
3. M3.3 — pipeline mismo que M2 (unpdf → tesseract.js → regex)
4. M3.4 — solo sección 4 (Licitaciones) prioritario
5. M3.5 — registrar en `scrapers_health` cada run

### M4 — Filtros + cruces

1. M4.1 — view materializada IGJ filtrada a Córdoba (jurisdicción + cruzados con proveedores municipales)
2. M4.2 — detector `conflicto_funcionario_proveedor` (cruce DNI/CUIT/apellido_nombre entre funcionarios y proveedores)
3. M4.3 — endpoints `/api/igj/entidad/:cuit`, `/api/igj/persona/:dni`, `/api/aportantes/:cuit`
4. M4.4 — re-correr `npm run analyze --force` con dataset extendido

### M5 — UI Mapa del Poder

1. M5.1 — nueva ruta `/actores` con search global
2. M5.2 — perfil de actor (funcionario o empresa) con KPIs + timeline + cruces detectados
3. M5.3 — ranking top 50 actores por score de influencia (gasto controlado / ingresos del estado / red de directores)

### M6 — Release

1. M6.1 — README publicable con stats reales ("X contratos, Y funcionarios, Z empresas, $W M en ejecución 2010-2026")
2. M6.2 — landing "Cómo lo hicimos" (método, fuentes, limitaciones, licencia)
3. M6.3 — push branch + PR a `main` (con confirmación del usuario)

---

## Política de ejecución

- **Sin permisos intermedios.** El usuario otorgó autonomía total. Reporte solo al cierre de cada milestone (M1, M2, M3...).
- **Cero datos sintéticos.** Cada fila en DB con `fuente_url + método + nivel_confianza`.
- **Cero LLM Anthropic** salvo páginas problemáticas <5% del volumen total. Tesseract.js para todo el resto.
- **Idempotente.** Todos los seeds soportan `--force` y skip si ya está cargado.
- **Trazabilidad por página** en PDFs OCR-eados.
- **Rate limit `.gov.ar`**: 1 req/2s default, backoff exponencial 2/4/8/16s ante 429/503.
- **User-Agent identificado** en scrapers: `ARGOS-research/1.0 (+amiunelautaro@gmail.com)`.

---

## Tareas activas

Ver `TaskList` (#1...#6 actualmente). Cada milestone se desglosa en tareas atómicas en `TaskCreate` antes de empezarlo.
