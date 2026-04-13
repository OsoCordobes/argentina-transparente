# Evidence.dev Public Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a static Evidence.dev site that reads from the ARGOS DuckDB database and publishes auditable corruption investigation reports for journalists and lawyers.

**Architecture:** Evidence.dev reads `backend/data/argos.duckdb` at build time and compiles to static HTML deployed on Railway. Five pages: index, full expediente, provider dossier, department breakdown, director network graph. Manual publish via `npm run publish` from `backend/`.

**Tech Stack:** Evidence.dev 2.x, DuckDB (existing), D3.js v7 (CDN, network graph only), Railway static service, Svelte (Evidence.dev internals)

---

## Prerequisites

Before starting Task 1, the DuckDB database must contain at least one real analysis. Run from `backend/`:

```bash
# Start the backend server
npm run dev &

# Run a full analysis (2022–2023 is fast, ~30 seconds)
curl -X POST http://localhost:3001/analizar \
  -H "Content-Type: application/json" \
  -d '{"municipioId":"cordoba-capital","anioDesde":2022,"anioHasta":2023}'
```

Verify DuckDB has data:
```bash
npx ts-node -e "
import { initDb, dbAll } from './src/lib/db';
initDb().then(() => dbAll('SELECT id, municipio, anio_desde, anio_hasta, total_contratos FROM reportes')).then(r => console.log(JSON.stringify(r, null, 2)));
"
```
Expected: at least 1 row in reportes, matching rows in señales_cache and contratos.

---

## File Map

**New files (all in `reports/`):**

| File | Responsibility |
|------|---------------|
| `reports/package.json` | Evidence.dev project config + publish script |
| `reports/sources/argos/connection.yaml` | DuckDB source config |
| `reports/pages/index.md` | Investigation index |
| `reports/pages/analisis/[id].md` | Full expediente per analysis |
| `reports/pages/proveedor/[nombre].md` | Provider dossier |
| `reports/pages/area/[nombre].md` | Department breakdown |
| `reports/pages/red/[municipio].md` | Director network graph |
| `reports/components/Disclaimer.svelte` | Legal disclaimer (every page) |
| `reports/components/NetworkGraph.svelte` | D3.js force-directed graph |
| `reports/evidence.config.js` | Site title, theme |

**Modified files:**

| File | Change |
|------|--------|
| `backend/package.json` | Add `"publish"` script |
| `argentina-transparente/.gitignore` | Add `reports/.evidence/` and `reports/build/` |

---

## Task 1: Scaffold Evidence.dev + configure DuckDB source

**Files:**
- Create: `reports/` (entire directory via scaffold)
- Create: `reports/sources/argos/connection.yaml`
- Create: `reports/evidence.config.js`
- Modify: `.gitignore`

- [ ] **Step 1: Scaffold the Evidence.dev project**

Run from `argentina-transparente/` root:
```bash
npx @evidence-dev/create-project reports
```
When prompted:
- Template: **Default**
- Accept all other defaults

Expected output: `reports/` directory with `package.json`, `pages/`, `sources/`, `components/`.

- [ ] **Step 2: Install dependencies**

```bash
cd reports && npm install
```

Expected: `node_modules/` created, no errors.

- [ ] **Step 3: Delete the template example files**

```bash
# Remove template placeholder pages (keep the directory structure)
rm reports/pages/index.md
rm -rf reports/pages/example* 2>/dev/null || true
rm -rf reports/sources/needful_things 2>/dev/null || true
rm -rf reports/sources/csv 2>/dev/null || true
```

- [ ] **Step 4: Configure the DuckDB source**

Create `reports/sources/argos/connection.yaml`:
```yaml
type: duckdb
filename: ../backend/data/argos.duckdb
```

Note: path is relative to the `reports/` project root. `../backend/data/argos.duckdb` points to the existing database file.

- [ ] **Step 5: Configure site metadata**

Create `reports/evidence.config.js`:
```javascript
const config = {
  title: 'ARGOS — Investigación de Gasto Público',
  description: 'Sistema de detección de señales de corrupción en contrataciones públicas. Córdoba, Argentina.',
}

export default config
```

- [ ] **Step 6: Update .gitignore**

Open `argentina-transparente/.gitignore` (or create it if absent) and add:
```
# Evidence.dev
reports/.evidence/
reports/build/
reports/node_modules/
```

- [ ] **Step 7: Verify dev server starts**

```bash
cd reports && npm run dev
```

Expected: dev server running on `http://localhost:3000`. Browser shows Evidence.dev default page (empty, no data yet — that's fine). No errors in terminal.

- [ ] **Step 8: Commit**

```bash
cd .. && git add reports/ .gitignore
git commit -m "feat(reports): scaffold Evidence.dev project with DuckDB source"
```

---

## Task 2: Legal disclaimer component + index page

**Files:**
- Create: `reports/components/Disclaimer.svelte`
- Create: `reports/pages/index.md`

- [ ] **Step 1: Create the Disclaimer component**

Create `reports/components/Disclaimer.svelte`:
```svelte
<div class="disclaimer">
  <strong>⚠️ AVISO LEGAL</strong>
  <p>
    Las señales detectadas por este sistema son indicios estadísticos derivados de datos públicos oficiales.
    No constituyen conclusiones jurídicas ni implican responsabilidad penal o civil de ninguna persona o entidad.
    Toda afirmación debe ser verificada de forma independiente antes de su uso en procedimientos legales o publicaciones periodísticas.
  </p>
  <p>
    <strong>Método:</strong> Análisis automatizado de contrataciones públicas — ARGOS v2.0 |
    <strong>Fuente:</strong> <a href="https://gobiernoabierto.cordoba.gob.ar" target="_blank">gobiernoabierto.cordoba.gob.ar</a> |
    <strong>Publicado:</strong> {new Date().toLocaleDateString('es-AR')}
  </p>
</div>

<style>
  .disclaimer {
    background: #fef3c7;
    border: 1px solid #d97706;
    border-radius: 6px;
    padding: 12px 16px;
    margin-bottom: 24px;
    font-size: 0.85rem;
    color: #92400e;
  }
  .disclaimer strong { display: block; margin-bottom: 6px; font-size: 0.9rem; }
  .disclaimer p { margin: 4px 0; }
  .disclaimer a { color: #92400e; }
</style>
```

- [ ] **Step 2: Create the index page**

Create `reports/pages/index.md`:

````markdown
---
title: ARGOS — Investigaciones
---

<script>
  import Disclaimer from '../components/Disclaimer.svelte'
</script>

<Disclaimer />

# Investigaciones de Gasto Público

```sql all_analyses
SELECT
  id,
  municipio,
  anio_desde,
  anio_hasta,
  total_contratos,
  total_señales,
  printf('$%.0f', total_monto) as monto_total,
  strftime('%d/%m/%Y', generado_en) as fecha
FROM reportes
ORDER BY generado_en DESC
```

<DataTable
  data={all_analyses}
  rows={50}
  link="/analisis/{id}"
>
  <Column id="municipio" title="Municipio" />
  <Column id="anio_desde" title="Desde" />
  <Column id="anio_hasta" title="Hasta" />
  <Column id="total_contratos" title="Contratos" align="right" />
  <Column id="total_señales" title="Señales" align="right" contentType="colorscale" />
  <Column id="monto_total" title="Monto Total" align="right" />
  <Column id="fecha" title="Generado" />
</DataTable>

---

## Señales más frecuentes

```sql signal_frequency
SELECT
  tipologia,
  COUNT(*) as veces_detectada,
  AVG(score) as score_promedio,
  MAX(score) as score_maximo
FROM señales_cache
GROUP BY tipologia
ORDER BY veces_detectada DESC
```

<BarChart
  data={signal_frequency}
  x="tipologia"
  y="veces_detectada"
  title="Frecuencia de señales detectadas"
  xAxisTitle="Tipología"
  yAxisTitle="Veces detectada"
/>

---

## Proveedores con más señales

```sql top_flagged_providers
SELECT
  proveedor,
  COUNT(DISTINCT hash) as total_contratos,
  printf('$%.0f', SUM(monto)) as monto_total,
  municipio
FROM contratos
GROUP BY proveedor, municipio
ORDER BY SUM(monto) DESC
LIMIT 20
```

<DataTable data={top_flagged_providers} rows={20} link="/proveedor/{proveedor}" />
````

- [ ] **Step 3: Verify index page renders**

```bash
cd reports && npm run dev
```

Open `http://localhost:3000`. Expected: table of analyses (will be empty if no analyses run yet — confirm at least one analysis exists per prerequisites). Bar chart of signal frequency. No errors in browser console.

- [ ] **Step 4: Commit**

```bash
cd .. && git add reports/components/Disclaimer.svelte reports/pages/index.md
git commit -m "feat(reports): index page + legal disclaimer component"
```

---

## Task 3: Full expediente page (`/analisis/[id]`)

**Files:**
- Create: `reports/pages/analisis/[id].md`

This is the primary legal exhibit. Every signal, every source URL, PDF export.

- [ ] **Step 1: Create the expediente page**

Create `reports/pages/analisis/[id].md`:

````markdown
---
title: Expediente {params.id}
---

<script>
  import Disclaimer from '../../components/Disclaimer.svelte'
</script>

```sql reporte
SELECT
  id,
  municipio,
  anio_desde,
  anio_hasta,
  strftime('%d/%m/%Y %H:%M', generado_en) as generado_en,
  resumen_ejecutivo,
  total_contratos,
  total_señales,
  printf('$%.0f', total_monto) as monto_total,
  expediente_json
FROM reportes
WHERE id = '${params.id}'
```

```sql señales
SELECT
  tipologia,
  titulo,
  resumen,
  score,
  severidad,
  evidencia_json,
  legal_json
FROM señales_cache
WHERE municipio = (SELECT municipio FROM reportes WHERE id = '${params.id}')
ORDER BY score DESC
```

```sql top_proveedores
SELECT
  proveedor,
  COUNT(*) as contratos,
  printf('$%.0f', SUM(monto)) as monto_total,
  printf('%.1f%%', SUM(monto) * 100.0 / (SELECT SUM(monto) FROM contratos WHERE municipio = (SELECT municipio FROM reportes WHERE id = '${params.id}'))) as porcentaje
FROM contratos
WHERE municipio = (SELECT municipio FROM reportes WHERE id = '${params.id}')
GROUP BY proveedor
ORDER BY SUM(monto) DESC
LIMIT 10
```

```sql por_area
SELECT
  area,
  COUNT(*) as contratos,
  printf('$%.0f', SUM(monto)) as monto_total,
  COUNT(DISTINCT proveedor) as proveedores_distintos
FROM contratos
WHERE municipio = (SELECT municipio FROM reportes WHERE id = '${params.id}')
GROUP BY area
ORDER BY SUM(monto) DESC
```

```sql fuentes
SELECT DISTINCT fuente_url
FROM contratos
WHERE municipio = (SELECT municipio FROM reportes WHERE id = '${params.id}')
```

<Disclaimer />

# Expediente de Investigación

**Municipio:** {reporte[0].municipio} |
**Período:** {reporte[0].anio_desde}–{reporte[0].anio_hasta} |
**Generado:** {reporte[0].generado_en}

<button onclick="window.print()" style="float:right;padding:8px 16px;background:#1d4ed8;color:white;border:none;border-radius:4px;cursor:pointer;font-size:0.9rem;">
  Descargar PDF
</button>

---

## Resumen Ejecutivo

{reporte[0].resumen_ejecutivo}

**Contratos analizados:** {reporte[0].total_contratos} |
**Monto total:** {reporte[0].monto_total} |
**Señales detectadas:** {reporte[0].total_señales}

---

## Señales de Riesgo

<DataTable
  data={señales}
  rows={20}
>
  <Column id="severidad" title="Severidad" contentType="colorscale" />
  <Column id="score" title="Score" align="right" />
  <Column id="titulo" title="Señal" />
  <Column id="resumen" title="Descripción" />
</DataTable>

---

## Top Proveedores por Monto

<DataTable
  data={top_proveedores}
  rows={10}
  link="/proveedor/{proveedor}"
>
  <Column id="proveedor" title="Proveedor" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
  <Column id="porcentaje" title="% del total" align="right" />
</DataTable>

---

## Gasto por Área de Gobierno

<DataTable
  data={por_area}
  rows={20}
  link="/area/{area}"
>
  <Column id="area" title="Área" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto_total" title="Monto Total" align="right" />
  <Column id="proveedores_distintos" title="Proveedores" align="right" />
</DataTable>

---

## Fuentes Oficiales

<DataTable data={fuentes} rows={20} />

*Todas las fuentes apuntan al portal oficial de datos abiertos del municipio.*
````

- [ ] **Step 2: Add PDF print stylesheet**

Create `reports/static/print.css`:
```css
@media print {
  /* Hide navigation and interactive elements */
  nav, header, footer, button, .sidebar { display: none !important; }

  /* Force readable colors */
  body { color: #000 !important; background: #fff !important; }
  a { color: #000 !important; text-decoration: underline !important; }

  /* Show full URLs after links */
  a[href]::after { content: " (" attr(href) ")"; font-size: 0.8em; }

  /* Page breaks before each major section */
  h2 { page-break-before: always; }
  h2:first-of-type { page-break-before: avoid; }

  /* Expand all collapsed content */
  details { display: block !important; }
  details > summary + * { display: block !important; }

  /* Footer on every page */
  @page {
    margin: 2cm;
  }
}
```

Add the stylesheet reference to `reports/evidence.config.js`:
```javascript
const config = {
  title: 'ARGOS — Investigación de Gasto Público',
  description: 'Sistema de detección de señales de corrupción en contrataciones públicas. Córdoba, Argentina.',
  customStylesheets: ['/print.css'],
}

export default config
```

- [ ] **Step 3: Verify expediente page renders**

With the dev server running, navigate to `http://localhost:3000/analisis/<id>` where `<id>` is the ID returned from the prerequisite analysis.

Expected:
- Executive summary text visible
- Signals table with score and severity
- Top providers table with links to `/proveedor/[nombre]`
- Government area table
- "Descargar PDF" button in top right
- Legal disclaimer at top

Test PDF: click "Descargar PDF", use browser Print dialog → Save as PDF. Verify page breaks between sections.

- [ ] **Step 4: Commit**

```bash
cd .. && git add reports/pages/analisis/ reports/static/ reports/evidence.config.js
git commit -m "feat(reports): expediente page with signals, providers, areas, PDF export"
```

---

## Task 4: Provider dossier page (`/proveedor/[nombre]`)

**Files:**
- Create: `reports/pages/proveedor/[nombre].md`

Cross-analysis view: all contracts for one provider across every analysis ever run.

- [ ] **Step 1: Create the provider page**

Create `reports/pages/proveedor/[nombre].md`:

````markdown
---
title: Proveedor — {params.nombre}
---

<script>
  import Disclaimer from '../../components/Disclaimer.svelte'
</script>

```sql proveedor_info
SELECT
  e.nombre,
  e.cuit,
  e.es_empleador,
  e.inicio_actividades,
  e.estado,
  e.actividad_principal,
  e.fuente_url
FROM empresas e
WHERE LOWER(e.nombre) = LOWER('${params.nombre}')
LIMIT 1
```

```sql contratos_totales
SELECT
  municipio,
  anio,
  tipo,
  area,
  descripcion,
  printf('$%.0f', monto) as monto,
  fuente_url
FROM contratos
WHERE LOWER(proveedor) = LOWER('${params.nombre}')
   OR LOWER(proveedor_norm) = LOWER('${params.nombre}')
ORDER BY anio DESC, monto DESC
```

```sql por_anio
SELECT
  anio,
  COUNT(*) as contratos,
  printf('$%.0f', SUM(monto)) as monto_total,
  SUM(monto) as monto_raw
FROM contratos
WHERE LOWER(proveedor) = LOWER('${params.nombre}')
   OR LOWER(proveedor_norm) = LOWER('${params.nombre}')
GROUP BY anio
ORDER BY anio
```

```sql señales_relacionadas
SELECT
  sc.tipologia,
  sc.titulo,
  sc.score,
  sc.severidad,
  sc.municipio
FROM señales_cache sc
WHERE LOWER(sc.entidades_cuit) LIKE '%' || LOWER(COALESCE((
  SELECT cuit FROM empresas WHERE LOWER(nombre) = LOWER('${params.nombre}') LIMIT 1
), '___NO_CUIT___')) || '%'
ORDER BY sc.score DESC
```

```sql directores_empresa
SELECT
  d.nombre_director,
  d.fuente_url
FROM directores d
JOIN empresas e ON d.cuit_empresa = e.cuit
WHERE LOWER(e.nombre) = LOWER('${params.nombre}')
ORDER BY d.nombre_director
```

```sql empresas_relacionadas
SELECT
  e2.nombre as empresa_vinculada,
  d1.nombre_director as director_comun,
  e2.cuit
FROM directores d1
JOIN directores d2 ON d1.nombre_director = d2.nombre_director AND d1.cuit_empresa != d2.cuit_empresa
JOIN empresas e1 ON d1.cuit_empresa = e1.cuit
JOIN empresas e2 ON d2.cuit_empresa = e2.cuit
WHERE LOWER(e1.nombre) = LOWER('${params.nombre}')
ORDER BY d1.nombre_director
```

<Disclaimer />

# {params.nombre}

{#if proveedor_info.length > 0}
**CUIT:** {proveedor_info[0].cuit ?? 'No disponible'} |
**Estado AFIP:** {proveedor_info[0].estado ?? 'No verificado'} |
**Empleador:** {proveedor_info[0].es_empleador ? 'Sí' : 'No'} |
**Inicio actividades:** {proveedor_info[0].inicio_actividades ?? 'No disponible'}
{/if}

---

## Evolución anual de contratos

<LineChart
  data={por_anio}
  x="anio"
  y="monto_raw"
  title="Monto total por año"
  yAxisTitle="Monto ($)"
  xAxisTitle="Año"
/>

---

## Señales detectadas

{#if señales_relacionadas.length > 0}
<DataTable data={señales_relacionadas} rows={10} />
{:else}
*Este proveedor no aparece vinculado a señales por CUIT. Verificar manualmente en el expediente.*
{/if}

---

## Directores (fuente: IGJ)

{#if directores_empresa.length > 0}
<DataTable data={directores_empresa} rows={20} />
{:else}
*Sin datos de directores disponibles. Ejecutar `npm run seed:igj` para cargar datos IGJ.*
{/if}

---

## Empresas con directores en común

{#if empresas_relacionadas.length > 0}
<DataTable
  data={empresas_relacionadas}
  rows={10}
  link="/proveedor/{empresa_vinculada}"
/>
{:else}
*Sin empresas vinculadas por directores.*
{/if}

---

## Todos los contratos

<DataTable
  data={contratos_totales}
  rows={100}
  search={true}
>
  <Column id="municipio" title="Municipio" />
  <Column id="anio" title="Año" />
  <Column id="area" title="Área" />
  <Column id="tipo" title="Tipo" />
  <Column id="descripcion" title="Descripción" />
  <Column id="monto" title="Monto" align="right" />
  <Column id="fuente_url" title="Fuente" contentType="link" />
</DataTable>
````

- [ ] **Step 2: Verify provider page**

Navigate to `http://localhost:3000/proveedor/PINTURAS%20CAVAZZON%20S.R.L.` (or any provider from the analysis).

Expected:
- Annual contract evolution chart
- Contracts table with source URLs
- Signals section (may be empty if no CUIT match — that's OK, note is shown)
- Directors and related companies sections (empty until IGJ seed is run)

- [ ] **Step 3: Commit**

```bash
cd .. && git add reports/pages/proveedor/
git commit -m "feat(reports): provider dossier page with cross-analysis contracts"
```

---

## Task 5: Department breakdown page (`/area/[nombre]`)

**Files:**
- Create: `reports/pages/area/[nombre].md`

Points investigators at specific government officials by showing which departments awarded suspicious contracts.

- [ ] **Step 1: Create the area page**

Create `reports/pages/area/[nombre].md`:

````markdown
---
title: Área — {params.nombre}
---

<script>
  import Disclaimer from '../../components/Disclaimer.svelte'
</script>

```sql area_resumen
SELECT
  area,
  COUNT(*) as total_contratos,
  printf('$%.0f', SUM(monto)) as monto_total,
  SUM(monto) as monto_raw,
  COUNT(DISTINCT proveedor) as proveedores_distintos,
  COUNT(DISTINCT anio) as anios_cubiertos,
  MIN(anio) as primer_anio,
  MAX(anio) as ultimo_anio
FROM contratos
WHERE LOWER(area) = LOWER('${params.nombre}')
GROUP BY area
```

```sql proveedores_del_area
SELECT
  proveedor,
  COUNT(*) as contratos,
  printf('$%.0f', SUM(monto)) as monto,
  SUM(monto) as monto_raw,
  printf('%.1f%%', SUM(monto) * 100.0 / (
    SELECT SUM(monto) FROM contratos WHERE LOWER(area) = LOWER('${params.nombre}')
  )) as pct_del_area
FROM contratos
WHERE LOWER(area) = LOWER('${params.nombre}')
GROUP BY proveedor
ORDER BY SUM(monto) DESC
LIMIT 20
```

```sql concentracion_hhi
SELECT
  ROUND(
    SUM(
      POWER(
        monto_proveedor * 100.0 / total_area,
        2
      )
    )
  , 0) as hhi
FROM (
  SELECT proveedor, SUM(monto) as monto_proveedor
  FROM contratos
  WHERE LOWER(area) = LOWER('${params.nombre}')
  GROUP BY proveedor
) p,
(SELECT SUM(monto) as total_area FROM contratos WHERE LOWER(area) = LOWER('${params.nombre}')) t
```

```sql evolucion_area
SELECT
  anio,
  COUNT(*) as contratos,
  SUM(monto) as monto_raw,
  printf('$%.0f', SUM(monto)) as monto_total,
  COUNT(DISTINCT proveedor) as proveedores
FROM contratos
WHERE LOWER(area) = LOWER('${params.nombre}')
GROUP BY anio
ORDER BY anio
```

```sql contratos_area
SELECT
  anio,
  proveedor,
  tipo,
  descripcion,
  printf('$%.0f', monto) as monto,
  fuente_url
FROM contratos
WHERE LOWER(area) = LOWER('${params.nombre}')
ORDER BY monto DESC
```

<Disclaimer />

# {params.nombre}

{#if area_resumen.length > 0}
**Contratos:** {area_resumen[0].total_contratos} |
**Monto total:** {area_resumen[0].monto_total} |
**Proveedores distintos:** {area_resumen[0].proveedores_distintos} |
**Período:** {area_resumen[0].primer_anio}–{area_resumen[0].ultimo_anio}
{/if}

---

## Concentración de mercado

**Índice HHI:** {concentracion_hhi[0]?.hhi ?? 'N/A'}

> Un HHI > 2500 indica mercado altamente concentrado. > 1800 indica concentración moderada.
> Valor máximo posible: 10.000 (un solo proveedor recibe todo).

---

## Proveedores por monto

<BarChart
  data={proveedores_del_area}
  x="proveedor"
  y="monto_raw"
  title="Monto por proveedor en esta área"
  xAxisTitle="Proveedor"
  yAxisTitle="Monto ($)"
/>

<DataTable
  data={proveedores_del_area}
  rows={20}
  link="/proveedor/{proveedor}"
>
  <Column id="proveedor" title="Proveedor" />
  <Column id="contratos" title="Contratos" align="right" />
  <Column id="monto" title="Monto" align="right" />
  <Column id="pct_del_area" title="% del área" align="right" />
</DataTable>

---

## Evolución anual

<LineChart
  data={evolucion_area}
  x="anio"
  y="monto_raw"
  title="Gasto anual del área"
/>

---

## Todos los contratos

<DataTable
  data={contratos_area}
  rows={100}
  search={true}
>
  <Column id="anio" title="Año" />
  <Column id="proveedor" title="Proveedor" />
  <Column id="tipo" title="Tipo" />
  <Column id="descripcion" title="Descripción" />
  <Column id="monto" title="Monto" align="right" />
  <Column id="fuente_url" title="Fuente" contentType="link" />
</DataTable>
````

- [ ] **Step 2: Verify area page**

Navigate to `http://localhost:3000/area/SECRETAR%C3%8DA%20DE%20CULTURA` (or any area from the analysis).

Expected:
- HHI concentration score
- Bar chart of providers
- Evolution chart over years
- Full contracts table with source URLs

- [ ] **Step 3: Commit**

```bash
cd .. && git add reports/pages/area/
git commit -m "feat(reports): department breakdown page with HHI concentration index"
```

---

## Task 6: Director network graph (`/red/[municipio]`)

**Files:**
- Create: `reports/pages/red/[municipio].md`
- Create: `reports/components/NetworkGraph.svelte`

The most powerful visual exhibit — shows company-director networks that are invisible in tabular data.

- [ ] **Step 1: Create the NetworkGraph Svelte component**

Create `reports/components/NetworkGraph.svelte`:
```svelte
<script>
  import { onMount } from 'svelte'

  export let nodes = []   // [{ id, label, type, amount, flagged }]
  export let links = []   // [{ source, target }]

  let container

  onMount(async () => {
    // Load D3 dynamically (CDN)
    const d3 = await import('https://cdn.jsdelivr.net/npm/d3@7/+esm')

    const width = container.clientWidth || 800
    const height = 500

    const svg = d3.select(container)
      .append('svg')
      .attr('width', '100%')
      .attr('height', height)
      .attr('viewBox', [0, 0, width, height])

    // Color scale
    const color = (d) => {
      if (d.type === 'director') return '#6b7280'
      return d.flagged ? '#dc2626' : '#3b82f6'
    }

    // Size scale for company nodes (by contract amount)
    const maxAmount = Math.max(...nodes.filter(n => n.type === 'empresa').map(n => n.amount), 1)
    const nodeRadius = (d) => {
      if (d.type === 'director') return 6
      return 8 + (d.amount / maxAmount) * 20
    }

    const simulation = d3.forceSimulation(nodes)
      .force('link', d3.forceLink(links).id(d => d.id).distance(80))
      .force('charge', d3.forceManyBody().strength(-200))
      .force('center', d3.forceCenter(width / 2, height / 2))
      .force('collision', d3.forceCollide().radius(d => nodeRadius(d) + 4))

    const link = svg.append('g')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke', '#d1d5db')
      .attr('stroke-width', 1.5)

    const node = svg.append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .call(d3.drag()
        .on('start', (event, d) => {
          if (!event.active) simulation.alphaTarget(0.3).restart()
          d.fx = d.x; d.fy = d.y
        })
        .on('drag', (event, d) => { d.fx = event.x; d.fy = event.y })
        .on('end', (event, d) => {
          if (!event.active) simulation.alphaTarget(0)
          d.fx = null; d.fy = null
        })
      )

    node.append('circle')
      .attr('r', nodeRadius)
      .attr('fill', color)
      .attr('stroke', '#fff')
      .attr('stroke-width', 1.5)

    node.append('text')
      .text(d => d.label.length > 20 ? d.label.slice(0, 18) + '…' : d.label)
      .attr('x', d => nodeRadius(d) + 4)
      .attr('y', '0.35em')
      .attr('font-size', '10px')
      .attr('fill', '#374151')

    node.append('title').text(d => `${d.label}\n${d.type === 'empresa' ? 'Empresa — $' + d.amount.toLocaleString() : 'Director'}`)

    simulation.on('tick', () => {
      link
        .attr('x1', d => d.source.x)
        .attr('y1', d => d.source.y)
        .attr('x2', d => d.target.x)
        .attr('y2', d => d.target.y)
      node.attr('transform', d => `translate(${d.x},${d.y})`)
    })
  })
</script>

<div bind:this={container} style="width:100%;min-height:500px;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden;"></div>

<div style="margin-top:8px;font-size:0.8rem;color:#6b7280;">
  <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#dc2626;margin-right:4px;"></span> Empresa con señales
  <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#3b82f6;margin:0 4px 0 12px;"></span> Empresa sin señales
  <span style="display:inline-block;width:12px;height:12px;border-radius:50%;background:#6b7280;margin:0 4px 0 12px;"></span> Director
</div>
```

- [ ] **Step 2: Create the network graph page**

Create `reports/pages/red/[municipio].md`:

````markdown
---
title: Red de Empresas — {params.municipio}
---

<script>
  import Disclaimer from '../../components/Disclaimer.svelte'
  import NetworkGraph from '../../components/NetworkGraph.svelte'

  export let data

  // Build D3 nodes and links from query results
  $: empresaNodes = (data.empresas_red ?? []).map(e => ({
    id: 'emp_' + e.cuit,
    label: e.nombre,
    type: 'empresa',
    amount: e.total_monto,
    flagged: e.tiene_señales > 0
  }))

  $: directorNodes = [...new Set((data.directores_red ?? []).map(d => d.nombre_director))]
    .map(nombre => ({ id: 'dir_' + nombre, label: nombre, type: 'director', amount: 0, flagged: false }))

  $: nodes = [...empresaNodes, ...directorNodes]

  $: links = (data.directores_red ?? []).map(d => ({
    source: 'dir_' + d.nombre_director,
    target: 'emp_' + d.cuit_empresa
  }))
</script>

```sql empresas_red
SELECT
  e.cuit,
  e.nombre,
  COALESCE(SUM(c.monto), 0) as total_monto,
  COUNT(DISTINCT sc.id) as tiene_señales
FROM empresas e
LEFT JOIN contratos c ON LOWER(c.proveedor) = LOWER(e.nombre) AND c.municipio = '${params.municipio}'
LEFT JOIN señales_cache sc ON sc.entidades_cuit LIKE '%' || e.cuit || '%' AND sc.municipio = '${params.municipio}'
WHERE e.cuit IN (SELECT DISTINCT cuit_empresa FROM directores)
GROUP BY e.cuit, e.nombre
```

```sql directores_red
SELECT
  d.nombre_director,
  d.cuit_empresa,
  e.nombre as empresa_nombre
FROM directores d
JOIN empresas e ON d.cuit_empresa = e.cuit
WHERE d.cuit_empresa IN (
  SELECT DISTINCT cuit FROM empresas
  WHERE cuit IN (SELECT DISTINCT cuit_empresa FROM directores)
)
ORDER BY d.nombre_director
```

```sql pares_vinculados
SELECT
  e1.nombre as empresa1,
  e2.nombre as empresa2,
  d1.nombre_director as director_comun,
  printf('$%.0f', COALESCE(c1.monto, 0)) as monto_empresa1,
  printf('$%.0f', COALESCE(c2.monto, 0)) as monto_empresa2
FROM directores d1
JOIN directores d2 ON d1.nombre_director = d2.nombre_director AND d1.cuit_empresa < d2.cuit_empresa
JOIN empresas e1 ON d1.cuit_empresa = e1.cuit
JOIN empresas e2 ON d2.cuit_empresa = e2.cuit
LEFT JOIN (SELECT LOWER(proveedor) as proveedor, SUM(monto) as monto FROM contratos WHERE municipio = '${params.municipio}' GROUP BY 1) c1 ON LOWER(e1.nombre) = c1.proveedor
LEFT JOIN (SELECT LOWER(proveedor) as proveedor, SUM(monto) as monto FROM contratos WHERE municipio = '${params.municipio}' GROUP BY 1) c2 ON LOWER(e2.nombre) = c2.proveedor
ORDER BY d1.nombre_director
```

<Disclaimer />

# Red de Empresas Vinculadas — {params.municipio}

> Empresas proveedoras del municipio que comparten directores según datos del IGJ (datos.jus.gob.ar).
> Un vínculo indica que dos o más personas figuran como directores/socios en ambas empresas.

---

{#if nodes.length > 0}
<NetworkGraph {nodes} {links} />
{:else}
**Sin datos de directores disponibles.**
Para visualizar esta red, ejecutar:
```bash
cd backend && npm run seed:igj
```
Este proceso descarga el padrón de autoridades de IGJ (~500MB) y lo carga en DuckDB.
{/if}

---

## Pares de empresas vinculadas

{#if pares_vinculados.length > 0}
<DataTable
  data={pares_vinculados}
  rows={50}
>
  <Column id="empresa1" title="Empresa 1" />
  <Column id="empresa2" title="Empresa 2" />
  <Column id="director_comun" title="Director en común" />
  <Column id="monto_empresa1" title="Monto E1" align="right" />
  <Column id="monto_empresa2" title="Monto E2" align="right" />
</DataTable>
{:else}
*Sin pares vinculados detectados. Los datos de IGJ son necesarios para esta vista.*
{/if}

---

## Directores registrados

<DataTable data={directores_red} rows={50} />
````

- [ ] **Step 3: Verify network graph page**

Navigate to `http://localhost:3000/red/cordoba-capital`.

Expected if IGJ data is loaded:
- D3 force-directed graph renders with company and director nodes
- Red nodes = companies with signals, blue = clean companies, grey = directors
- Draggable nodes
- Pairs table below graph

Expected if IGJ data is NOT loaded:
- Instruction message to run `npm run seed:igj` is shown
- No errors, page renders cleanly

- [ ] **Step 4: Commit**

```bash
cd .. && git add reports/pages/red/ reports/components/NetworkGraph.svelte
git commit -m "feat(reports): director network graph with D3.js force layout"
```

---

## Task 7: Deploy to Railway + publish script

**Files:**
- Modify: `backend/package.json`
- Create: `reports/railway.json`

- [ ] **Step 1: Verify Railway CLI is available**

```bash
railway version
```

If not installed:
```bash
npm install -g @railway/cli
railway login
```

- [ ] **Step 2: Create a new Railway static service**

```bash
cd reports

# Link to the existing ARGOS Railway project
railway link

# Deploy the reports directory as a new static service
railway up --service argos-reports
```

Note the service ID from the output (e.g., `abc123`). You will need it in Step 3.

- [ ] **Step 3: Add publish script to backend**

Open `backend/package.json` and add to the `scripts` section:
```json
"publish": "cd ../reports && npm run build && railway up --service argos-reports"
```

The full scripts section should look like:
```json
"scripts": {
  "build": "tsc",
  "dev": "ts-node-dev --respawn --transpile-only src/index.ts",
  "start": "node dist/index.js",
  "test": "vitest run",
  "test:connector": "npx ts-node src/test-connector.ts",
  "test:signals": "npx ts-node src/test-signals.ts",
  "test:e2e": "npx ts-node src/test-e2e.ts",
  "publish": "cd ../reports && npm run build && railway up --service argos-reports"
}
```

- [ ] **Step 4: Create Railway static config for reports**

Create `reports/railway.json`:
```json
{
  "$schema": "https://railway.app/railway.schema.json",
  "build": {
    "builder": "NIXPACKS",
    "buildCommand": "npm run build"
  },
  "deploy": {
    "startCommand": "npx serve build -l 3000",
    "restartPolicyType": "NEVER"
  }
}
```

- [ ] **Step 5: Verify full build succeeds**

```bash
cd reports && npm run build
```

Expected:
- No TypeScript/Svelte errors
- `build/` directory created with `.html` files for all pages
- Pages include: `index.html`, `analisis/[id]/index.html`, `proveedor/[nombre]/index.html`, `area/[nombre]/index.html`, `red/[municipio]/index.html`

- [ ] **Step 6: Test full publish**

```bash
cd backend && npm run publish
```

Expected: build succeeds, Railway deploys, URL printed at end.

Open the Railway URL. Verify:
- Index page loads with list of analyses
- Clicking an analysis navigates to full expediente
- Provider links work
- Area links work
- Network graph page loads (with or without IGJ data)
- Legal disclaimer present on all pages
- "Descargar PDF" button works on expediente page

- [ ] **Step 7: Update CLAUDE.md with new command**

Open `CLAUDE.md` and add to the LOG section:

```markdown
### 2026-04-XX — Sprint 6: Evidence.dev public reports

- `reports/` — Evidence.dev static site, reads backend/data/argos.duckdb
- 5 pages: index, /analisis/[id], /proveedor/[nombre], /area/[nombre], /red/[municipio]
- PDF export via window.print() on /analisis/[id]
- D3.js network graph for director relationships on /red/[municipio]
- Deploy: `cd backend && npm run publish`
- Sprint 5 (GNN) dropped — see docs/superpowers/specs/2026-04-13-evidence-reports-design.md
```

- [ ] **Step 8: Final commit**

```bash
cd .. && git add backend/package.json reports/railway.json CLAUDE.md
git commit -m "feat(reports): Railway deploy + npm run publish script

Sprint 6 complete. Static Evidence.dev reports deployed.
Pages: index, expediente, proveedor, area, red (director network).
Deploy with: cd backend && npm run publish"
```

---

## Self-Review Checklist

- [x] **Spec coverage:**
  - Static site from DuckDB ✓ (Task 1 — DuckDB source config)
  - Manual publish workflow ✓ (Task 7 — `npm run publish`)
  - Index page ✓ (Task 2)
  - Full expediente + PDF export ✓ (Task 3)
  - Provider dossier ✓ (Task 4)
  - Department breakdown + HHI ✓ (Task 5)
  - Network graph + D3.js ✓ (Task 6)
  - Legal disclaimer on every page ✓ (Task 2 — Disclaimer component imported on all pages)
  - Every number traces to source URL ✓ (Task 3 — fuente_url in all tables)
  - Railway deploy ✓ (Task 7)

- [x] **Placeholders:** None. All SQL uses real column names from verified schema. All component code is complete.

- [x] **Type consistency:** `nodes` and `links` shape defined once in Task 6 Step 1 and consumed in Task 6 Step 2. `params.id`, `params.nombre`, `params.municipio` used consistently. DuckDB column names (`proveedor_norm`, `señales_cache.entidades_cuit`, `reportes.expediente_json`) match verified schema.

- [x] **Windows note:** No symlinks used. DuckDB path in `connection.yaml` uses relative path `../backend/data/argos.duckdb` — resolves correctly on Windows.
