# 🗺️ ARGOS · Mapa Provincial Comprehensive — Plan Integral

**Branch:** main
**Estado:** propuesta — pendiente de ejecución
**Fecha:** 2026-05-05
**Razón:** el grafo del home muestra 60 nodos sobre 1 jurisdicción y comunica "fragmento", no "mapa de Córdoba". La misión del producto exige un mapa de la provincia + capital con la profundidad real de los datos cargados.

---

## §1 · Diagnosis honesto

### 1.1 Qué muestra hoy
- Un solo nodo raíz: **Córdoba Capital** (jurisdicción municipal).
- **Provincia de Córdoba ausente** — el endpoint `/api/grafo/jerarquia/v2?jurisdiccion=cordoba-provincia` devuelve `{nodes:[], edges:[]}`.
- 12 reparticiones (sólo las que tienen contratos firmados en `contratos.area`).
- 47 empresas (top proveedores por monto).
- ~60 nodos, ~60 aristas, todas curvas y todas amber. Cero variación visual entre tipos de relación.
- Sin empleados, sin direcciones internas, sin funcionarios, sin directores de empresas.

### 1.2 Por qué pasa
El endpoint actual está construido sobre **una sola tabla**: `contratos`. Calcula reparticiones via `GROUP BY area` y empresas via top proveedores. Ignora completamente:
- `agentes_publicos` (178,356 empleados públicos)
- `cargos_funcionarios` (167,608 cargos políticos)
- `v_persona_dirige_empresa` (1.7M relaciones director→empresa)
- `presupuesto_ejecucion` (4,035 partidas)
- `entes_estatales_cordoba` (10 organismos descentralizados)
- `declaraciones_juradas` (1,348 DDJJ)

### 1.3 Qué dice el usuario
> "Hay tan poca información. El usuario entra a esta página y no entiende qué es. No dice 'esto es un mapa de la provincia de Córdoba', dice 'estos son 6 dibujos random'. Tiene que haber 500-700 nodos. Tiene que ser la provincia conectada con Córdoba capital. Ambas tienen sus ministerios, agencias, empleados, contratos."

Justificación operativa: si el launch comunica "mapeamos toda Córdoba" y el grafo muestra un fragmento, la promesa cae.

---

## §2 · Vision

**Lo que hay que entregar:**

1. **Dual-root layout** — Provincia de Córdoba (norte) y Córdoba Capital (sur, connected by edge `comparte_jurisdiccion`). Visualmente distintas, jerárquicamente paralelas.
2. **~500-800 nodos en primer paint**, con jerarquía visible: jurisdicción → ministerio → dirección → entidad (empleado o empresa).
3. **6 tipos de aristas** con encoding visual diferente: estructural, contractual, dirección empresarial, laboral, conflicto, cargo formal.
4. **Semantic zoom de 4 niveles** que controla qué ver según ratio de cámara (macro → micro).
5. **Onboarding inicial** (dismissible, 3 pasos) que comunica "esto es Córdoba — provincia + capital, ministerios, contratistas, empleados".
6. **Detail panel rico** que muestra los datos reales del nodo + path-finding visual ("cómo se conecta este actor al gobierno").
7. **Performance objetivo:** 60fps con 800 nodos visibles + 1500 aristas, gracias a WebGL + LOD agresivo.

---

## §3 · Inventario REAL de la base de datos

Verificado vía DuckDB read-only el 2026-05-05:

| Tabla / Vista | Filas | Relevancia |
|---|---:|---|
| `contratos` | 1,393 | Pagos confirmados. cordoba-capital: 1,382 / upc: 11. |
| `empresas` | 119 | Empresas con AFIP cruzado. |
| `entes_estatales_cordoba` | 10 | Organismos descentralizados. |
| `agentes_publicos` | **178,356** | Empleados públicos. **126,884 provincia / 51,472 capital.** |
| `cargos_funcionarios` | 167,608 | Cargos políticos formales. |
| `declaraciones_juradas` | 1,348 | DDJJ patrimoniales. |
| `presupuesto_ejecucion` | 4,035 | Partidas por jurisdicción. |
| `licitaciones_llamado` | 2,341 | Llamados a licitación 2005-2018. |
| `cadena_de_pago` | 4,035 | Pagos individuales. |
| `igj_entidades` | 420,560 | Empresas Argentina (Inspección General de Justicia). |
| `igj_autoridades` | **2,290,759** | Directores/autoridades históricos. |
| `personas_fisicas` | 763,082 | Personas físicas en universo. |
| `personas_juridicas` | 496,445 | Personas jurídicas. |
| `rns_personas_juridicas` | 196,127 | RNS — Registro Nacional de Sociedades. |
| `v_actor_universo` | 1,259,527 | Vista — universo de actores cordobeses. |
| `v_persona_dirige_empresa` | 1,718,790 | Vista — relaciones dirección. |
| `v_universo_cordobes_empresas` | 3,058 | Empresas cordobesas filtradas. |
| `v_universo_cordobes_personas` | 67,525 | Personas cordobesas filtradas. |
| `entity_registry` | 39,511 | Identidades resueltas (Tier 1-3). |
| `identity_matches` | 1,306 | Matches confirmados nombre↔CUIT. |
| `opensanctions_matches` | 119 | Cruce sanciones / offshore. |
| `señales_cache` | 13 | Señales detectadas. |

### 3.1 Top reparticiones (de agentes_publicos.reparticion)

| Repartición | Empleados | Jurisdicción presumida |
|---|---:|---|
| MINISTERIO DE EDUCACIÓN | 72,139 | Provincia |
| MINISTERIO DE SEGURIDAD | 22,865 | Provincia |
| MINISTERIO DE SALUD | 15,371 | Provincia |
| (null reparticion) | 11,180 | — |
| CONCEJO DELIBERANTE | 4,453 | Capital |
| SERVICIO PENITENCIARIO | 4,397 | Provincia |
| SECRETARÍA GENERAL DE LA GOBERNACIÓN | 2,112 | Provincia |
| MINISTERIO DE ECONOMÍA Y GESTIÓN PÚBLICA | 1,750 | Provincia |
| MINISTERIO DE DESARROLLO HUMANO | 1,696 | Provincia |
| DIRECCIÓN GRAL. DE EDUCACIÓN Y PARQUES EDUCATIVOS | 1,670 | Provincia |
| DIRECCIÓN DE HOSPITAL DE URGENCIAS | 1,668 | Capital? |
| DIRECCIÓN DE POLICÍA MUNICIPAL | 1,384 | Capital |

**Conclusión:** la jerarquía REAL existe en `agentes_publicos.reparticion` + `agentes_publicos.jurisdiccion`. El endpoint actual la ignora porque sólo mira `contratos.area`. Hay que ampliar la fuente.

---

## §4 · Backend — qué hay que construir

### 4.1 Nuevo endpoint: `GET /api/grafo/mapa-provincial`

**Input:**
```
?detail=macro|meso|deep    (default: macro)
?jurisdiccion=ambas|provincia|capital   (default: ambas)
?año=2024                  (filtro opcional)
?incluir_empleados=true    (default: false — top 100 por sueldo cuando true)
```

**Output (Graphology-compatible):**
```ts
{
  nodes: GraphNode[]    // entre 200 (macro) y ~800 (deep)
  edges: GraphEdge[]    // 300 (macro) a ~2000 (deep)
  meta: {
    jurisdicciones: ['provincia', 'capital']
    montoTotal: number
    totalEmpleados: number
    totalEmpresas: number
    totalReparticiones: number
    fuentes: ['contratos', 'agentes_publicos', 'empresas', 'cargos_funcionarios', ...]
  }
}
```

**Tipos de nodo:**
```ts
type NodeType =
  | 'jurisdiccion'    // provincia | capital
  | 'ministerio'      // top-level under jurisdiccion
  | 'direccion'       // sub-reparticion
  | 'organismo'       // entes_estatales_cordoba
  | 'empresa'         // proveedor
  | 'persona'         // funcionario | director
  | 'empleado'        // top N por sueldo (deep only)
```

**Tipos de arista:**
```ts
type EdgeKind =
  | 'contiene'         // jurisdiccion → ministerio | ministerio → direccion (estructural, color sutil)
  | 'comparte_jurisdiccion'  // provincia ↔ capital (geográfica)
  | 'contrata'         // reparticion → empresa (peso = monto)
  | 'trabaja_en'       // persona → reparticion (peso = sueldo, sólo en deep)
  | 'dirige'           // persona → empresa
  | 'preside'          // persona → reparticion (cargo formal)
  | 'conflicto_con'    // entre nodos con señal grave
  | 'comparte_director'// empresa ↔ empresa (red densa)
```

### 4.2 Fuentes SQL por tipo de nodo

```sql
-- depth 0: jurisdicciones
SELECT 'provincia' AS id, 'Provincia de Córdoba' AS label
UNION ALL SELECT 'capital', 'Córdoba Capital'

-- depth 1: ministerios (provincia)
SELECT
  reparticion AS area,
  COUNT(*) AS empleados,
  COALESCE(SUM(bruto), 0) AS gasto_sueldos
FROM agentes_publicos
WHERE jurisdiccion = 'cordoba-provincia'
  AND reparticion ILIKE 'MINISTERIO%'
  AND anio >= 2020
GROUP BY 1
ORDER BY empleados DESC

-- depth 1: ministerios + secretarías (capital)
SELECT
  area,
  COUNT(*) AS contratos,
  SUM(monto) AS monto_total
FROM contratos
WHERE municipio = 'cordoba-capital'
GROUP BY 1
HAVING COUNT(*) > 5

-- depth 2: direcciones (sub-reparticiones)
-- agentes_publicos.reparticion ILIKE 'DIRECCION%' agrupado por categoria
SELECT reparticion, jurisdiccion, COUNT(*) AS empleados
FROM agentes_publicos
WHERE reparticion ILIKE 'DIRECCION%' OR reparticion ILIKE 'DIRECCIÓN%'
GROUP BY 1, 2

-- depth 2: empresas (top proveedores con CUIT verificado)
SELECT
  e.cuit,
  e.nombre,
  e.es_empleador,
  COALESCE(SUM(c.monto), 0) AS monto_recibido,
  COUNT(c.hash) AS contratos
FROM empresas e
LEFT JOIN contratos c ON c.proveedor_cuit = e.cuit
GROUP BY 1, 2, 3
ORDER BY monto_recibido DESC
LIMIT 200

-- depth 3 (deep only): empleados top por sueldo
SELECT id, jurisdiccion, reparticion, apellido_nombre, bruto, cuit
FROM agentes_publicos
WHERE bruto IS NOT NULL
ORDER BY bruto DESC
LIMIT 100

-- depth 3 (deep only): directores frecuentes en empresas cordobesas
SELECT
  vpd.persona_id,
  vpd.persona_nombre,
  COUNT(DISTINCT vpd.empresa_id) AS empresas_dirigidas
FROM v_persona_dirige_empresa vpd
JOIN v_universo_cordobes_empresas uce ON uce.empresa_id = vpd.empresa_id
GROUP BY 1, 2
HAVING COUNT(DISTINCT vpd.empresa_id) >= 3
ORDER BY empresas_dirigidas DESC
LIMIT 100
```

### 4.3 Mapping a niveles de detail

| `detail` | nodos esperados | qué incluye |
|---|---:|---|
| `macro` | 200-300 | jurisdicciones + ministerios + top 50 empresas. Sin direcciones, sin empleados. |
| `meso` | 500-700 | + direcciones + top 200 empresas. Sin empleados individuales. |
| `deep` | 800-1200 | + top 100 empleados + top 100 directores. |

El frontend pide `macro` por default; cuando el zoom in pasa cierto threshold, fetchea `meso` y mergea. (Lazy.)

### 4.4 Edges count estimado

| Tipo | Macro | Meso | Deep |
|---|---:|---:|---:|
| contiene (jurisd → min) | 30 | 30 | 30 |
| contiene (min → dir) | 0 | 80 | 80 |
| comparte_jurisdiccion | 1 | 1 | 1 |
| contrata | 100 | 250 | 400 |
| trabaja_en | 0 | 0 | 100 |
| dirige | 0 | 0 | 200 |
| preside | 0 | 30 | 30 |
| conflicto_con | 13 | 13 | 13 |
| comparte_director | 0 | 0 | 50 |
| **Total** | **~150** | **~400** | **~900** |

### 4.5 Performance + caching

- **Vista materializada** `mv_mapa_provincial_macro` (refresh manual al levantar seeds)
- **Cache HTTP 5 min** en respuesta del endpoint
- Filtro por año via predicate pushdown sobre `agentes_publicos.anio` y `contratos.anio`
- Index en `agentes_publicos(reparticion, jurisdiccion, anio)` y `contratos(area, anio)`

### 4.6 Archivos a crear/modificar

```
backend/src/lib/grafo-mapa-provincial.ts  ← NUEVO (queries multi-source)
backend/src/routes/grafo.ts               ← agregar handler /mapa-provincial
backend/src/scripts/build-mv-mapa.ts      ← NUEVO (refresh views)
```

---

## §5 · Frontend — arquitectura

### 5.1 Composición de componentes

```
HomeGraph/
├── index.tsx                  ← orquestador (fetch + SigmaContainer)
├── buildGraph.ts              ← API → Graphology (multi-fuente)
├── HomeGraphInner.tsx         ← usa hooks sigma, FA2 worker, reducers
├── SemanticZoomController.tsx ← LOD por zoom ratio
├── GraphOnboarding.tsx        ← ⭐ NUEVO — tour 3 pasos al primer load
├── GraphLegend.tsx            ← taxonomía + meta extendida
├── GraphFilters.tsx           ← chips: jurisdicción, tipo, severidad, año
├── GraphTimeSlider.tsx        ← ⭐ NUEVO — slider 2018-2025
├── GraphSearch.tsx            ← ⌘K
├── GraphZoomControls.tsx      ← +/−/FIT + "ir a provincia" / "ir a capital"
├── GraphMinimap.tsx           ← ⭐ NUEVO — minimap esquina sup-derecha
├── NodeDetailPanel.tsx        ← KPIs + path "cómo está conectado"
├── BackgroundParticles.tsx    ← ⭐ NUEVO — starfield sutil
└── TerritoryBackdrop.tsx      ← ⭐ NUEVO — silueta SVG estilizada de Córdoba
```

### 5.2 Estados a manejar

```ts
{
  detail: 'macro' | 'meso' | 'deep'   // controlado por SemanticZoomController
  cameraRatio: number                  // del sigma camera
  selectedId: string | null
  hoveredId: string | null
  yearFilter: number | null            // null = todos
  jurisdiccionFilter: 'ambas' | 'provincia' | 'capital'
  typeFilters: Record<NodeType, boolean>
  searchOpen: boolean
  onboardingStep: 0..3
  panelOpen: boolean
  pathFinding: { from: string; to: string } | null
}
```

### 5.3 Render strategy (LOD)

```ts
// SemanticZoomController.tsx — escucha cameraUpdated y decide qué fetchear
useEffect(() => {
  const ratio = sigma.getCamera().getState().ratio
  if (ratio < 0.4 && detail !== 'deep') setDetail('deep')
  else if (ratio < 1.2 && detail === 'macro') setDetail('meso')
  else if (ratio > 2.5 && detail !== 'macro') setDetail('macro')
}, [cameraRatio])

// Cuando detail cambia → fetcha con nuevo param + mergea sin reset layout
// Reductor visibilidad por detail level:
//  macro: solo nodos con depth 0-1 visibles, depth 2 con opacity 0.15, depth 3+ hidden
//  meso: depth 0-2 visibles plenos, depth 3 con opacity 0.20
//  deep: todos visibles
```

### 5.4 Layout estratégico

**Layout binario (provincia + capital como dual-root):**

```
                    ╔══════════════════╗
                    ║  PROVINCIA       ║
                    ║  de Córdoba      ║
                    ║  (norte/izquierda)║
                    ╚════════╤═════════╝
                             │ ministerios
                    ┌────────┴────────┐
                    │                 │
            ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─
                    │   "comparte     │
                    │   jurisdiccion" │
                    │     edge        │
            ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─ ─ ─ ┼ ─ ─ ─ ─ ─ ─
                    │                 │
                    └────────┬────────┘
                    ╔════════╧═════════╗
                    ║  CAPITAL         ║
                    ║  Córdoba         ║
                    ║  (sur/derecha)   ║
                    ╚══════════════════╝
```

ForceAtlas2 se usa con `gravity` levemente sesgada (custom `getNodeMass`) para que los nodos provincia tiendan al norte y los capital al sur. O alternativa: posiciones iniciales pre-asignadas (provincia: y < 0; capital: y > 0) y gravity=0 para que FA2 sólo refine sin migrar.

**Cluster por ministerio:** cada ministerio actúa como gravity center secundario, atrayendo sus direcciones + empleados. Logrado con `gravity: 0.3` + `outboundAttractionDistribution: true`.

### 5.5 Onboarding (storytelling)

Modal central, dim global, 3 pasos:

> **Paso 1/3 — Esto es Córdoba**
> Provincia + Capital. 2 jurisdicciones, ~30 ministerios, +500 contratos cargados, ~178,000 empleados públicos. Cada nodo es real y trae link a la fuente original.

> **Paso 2/3 — Cómo explorar**
> · Scroll: zoom · Drag: panear · Click en nodo: panel detalle
> · ⌘K: búsqueda · doble-click: expandir vecinos

> **Paso 3/3 — Qué encontrarás**
> · Empresas → contratos firmados, monto, AFIP cruzado
> · Ministerios → empleados, gasto en sueldos
> · Personas → cargos públicos + empresas que dirigen
> · Señales → en rojo, requieren verificación

`localStorage.argos.onboarding_v3` para persistir el dismiss.

---

## §6 · Diseño visual

### 6.1 Paleta extendida

```css
/* Jurisdicciones — tono claro distintivo */
--jur-provincia: #4FC3F7;       /* azul provincial profundo */
--jur-capital:   #FFB74D;       /* amber capital */

/* Sub-niveles */
--ministerio-provincia: #29B6F6;
--ministerio-capital:   #FFA726;
--direccion:            #94A3B8;  /* gris neutro, depende del ministerio padre */
--organismo:            #A78BFA;  /* organismos descentralizados — violet */

/* Actores */
--empresa:              #F59E0B;
--empresa-sin-cuit:     rgba(245, 158, 11, 0.55);
--persona-funcionario:  #60A5FA;
--persona-director:     #C084FC;
--empleado:             #CBD5E1;  /* sólo deep mode */

/* Aristas */
--edge-contiene:           rgba(148, 163, 184, 0.18);   /* sutil */
--edge-comparte-jurisd:    rgba(120, 144, 255, 0.5);    /* puente prov-cap */
--edge-contrata:           #F59E0B;
--edge-trabaja-en:         rgba(203, 213, 225, 0.12);   /* mass relation */
--edge-dirige:             #C084FC;
--edge-preside:            #60A5FA;
--edge-conflicto:          #EF4444;
--edge-comparte-director:  rgba(192, 132, 252, 0.4);    /* punteada */
```

### 6.2 Iconografía (sprites pre-renderizados)

Cada `entityType` tiene un sprite 32×32 generado al boot:

| Tipo | Lucide icon | Color |
|---|---|---|
| jurisdiccion (provincia) | MapPin | --jur-provincia |
| jurisdiccion (capital) | Landmark | --jur-capital |
| ministerio | Building2 | tono jurisdicción |
| direccion | Folder | gris |
| organismo | Network | violet |
| empresa | Briefcase | amber |
| persona / funcionario | UserCircle | celeste |
| persona / director | Users | violet |
| empleado | User | gris claro |

Sprites generados al mount via OffscreenCanvas + cargados a `@sigma/node-image`.

### 6.3 Niveles de detail visual

| zoom ratio | nodos visibles | labels | iconos | aristas |
|---|---|---|---|---|
| > 2.5 (out) | jurisd + ministerios | sólo top 5 | no | sólo `contrata` y `comparte-jurisd` |
| 1.2-2.5 (med) | + direcciones + top empresas | top 30 | en jurisd+ministerios | + `contiene`, `dirige` |
| 0.4-1.2 (in) | + empresas medias + funcionarios | mayoría | sí | + `preside`, `conflicto` |
| < 0.4 (deep) | + empleados + directores | todos | sí | todos incluyendo `trabaja_en` (filtrado) |

### 6.4 Background

**Capa 1:** radial gradient dark `#02040A → #0F1626 → #050810`.
**Capa 2 (TerritoryBackdrop):** silueta SVG estilizada del territorio de Córdoba (provincia), opacity 0.06, posicionada como guía sutil. (Generamos un SVG simple con polígono de la provincia, no foto-realista — más como "plano técnico forense".)
**Capa 3 (BackgroundParticles):** ~80 partículas estáticas tipo "starfield", paralaje sutil al pan, opacity 0.15-0.4. Mejora el "wow inicial" sin distraer.

### 6.5 Detail panel

```
┌────────────────────────────────────────────┐
│ ● MINISTERIO                               │ ← badge icon + tipo
│ MINISTERIO DE EDUCACIÓN                    │ ← nombre grande Geist Sans
│ Provincia de Córdoba · 72,139 empleados    │ ← subtitle Geist Mono
├────────────────────────────────────────────┤
│  GASTO ANUAL EN SUELDOS                    │
│  $43.7 mil M                               │ ← KPI grande
│                                            │
│  CONTRATOS DIRECTOS                        │
│  127 contratos · $8.3 mil M                │
│                                            │
│  SEÑALES ACTIVAS                           │
│  ●1 grave  ●3 moderada                     │
│                                            │
│  ┌─────────────────────────────────────┐   │
│  │ CADENA DE CONEXIÓN                  │   │
│  │ Provincia → Min. Educación → ...    │   │
│  │   ▼                                 │   │
│  │ Top 5 proveedores                   │   │
│  │  EMPRESA X  $2.3 mil M  3 contr.    │   │
│  │  EMPRESA Y  $1.8 mil M  2 contr.    │   │
│  │  ...                                │   │
│  └─────────────────────────────────────┘   │
│                                            │
│  Ver perfil completo →                     │
└────────────────────────────────────────────┘
```

### 6.6 Edge encoding visual final

```
contiene             ────────  gris translucent 0.18, fina (1px), recta o curva mínima
comparte-jurisd      ════════  azul-violeta 0.5, gruesa (4px), puente animado
contrata             ─────►   amber, grosor √(monto/maxMonto) × 4, curva sutil
trabaja-en           ········  gris claro 0.12, ultra fina (0.5px), only deep
dirige               ──◯──    violet, grosor 1.5, sólida
preside              ──★──    celeste, grosor 2, sólida
conflicto-con        ━━━━━━━  red, grosor 2.5, animación pulse
comparte-director    ╌╌╌╌╌╌╌  violet 0.4, grosor 1, dashed
```

---

## §7 · Plan de ejecución por fases

| Fase | Entregable | Tiempo | Verificación |
|---|---|---:|---|
| **A** | Backend: nuevo endpoint `/api/grafo/mapa-provincial` con queries multi-source. 200-800 nodos según `detail`. Fuentes: contratos + agentes_publicos + empresas + cargos_funcionarios + entes_estatales_cordoba. | 6-8h | curl al endpoint devuelve > 200 nodos en macro, > 500 en meso |
| **B** | Frontend: nuevo `useMapaProvincial` hook + `buildGraph` actualizado para multi-jurisdicción + multi-tipo. Layout dual-root. | 4-5h | screenshot muestra dos clusters distinguibles |
| **C** | Semantic zoom controller. LOD por ratio de cámara. Lazy fetch de detail levels. | 4-5h | zoom out → re-fetch macro; zoom in → re-fetch deep |
| **D** | Visual encoding completo: sprites con iconografía Lucide + 9 tipos de nodo + 8 tipos de arista con shaders/programs. | 5-6h | hover en cualquier nodo muestra icon correcto + tipo |
| **E** | GraphOnboarding modal 3 pasos + GraphMinimap + GraphTimeSlider. | 4-5h | first load muestra modal; minimap funcional; slider filtra por año |
| **F** | NodeDetailPanel rico: KPIs reales + path-finding visual + lista top conectados + link a perfil. | 4-5h | click en ministerio muestra empleados + contratistas top |
| **G** | Polish: TerritoryBackdrop SVG silueta Córdoba + BackgroundParticles starfield + edge-flow particles en aristas seleccionadas. | 5-6h | screenshot final tiene profundidad atmosférica |
| **H** | Integración + smoke + iteración con vos viendo. | open | screenshots aprobados por vos |

**Total estimado:** 32-40h trabajo profundo. El usuario aclaró que el tiempo no es impedimento, hay que hacerlo BIEN.

### 7.1 Commits intermedios

Cada fase commitea en su propio commit (rollback granular). Después de Fase B y D, screenshots intermedios para validación.

### 7.2 Tests

- Backend: tests vitest sobre `grafo-mapa-provincial.ts` — verificar shape de respuesta + que jurisdicciones contengan al menos N reparticiones esperadas (snapshot test).
- Frontend: tests sobre `buildGraph.ts` (puro) — verificar que la API → Graphology produzca conteos correctos por tipo.
- E2E visual: `frontend/scripts/visual-smoke.mjs` extendido con assertions sobre count de SVGs / circles / labels visibles.

---

## §8 · Riesgos + mitigaciones

| # | Riesgo | Impacto | Mitigación |
|---|---|---|---|
| 1 | Provincia data sparse — agentes_publicos.reparticion tiene typos, mezclados con direcciones | Layout caótico | Normalizar nombres en query (UPPER + sin tildes) + clusterizar por prefijo "MINISTERIO%", "DIRECCION%" |
| 2 | 800 nodos podrían lagear FA2 worker en hardware viejo | < 30fps | Adoptar `barnesHutOptimize: true`, `linLogMode: true`, `slowDown: 30`. Evaluar fallback a static layout si load avg > 200ms/iter. |
| 3 | El SVG del territorio es tarea de diseño manual | Tiempo extra | Usar geojson-to-svg pipeline + simplificación con turf.js; o postergar a Fase G y dejar gradiente puro como baseline aceptable |
| 4 | Multi-fuente queries son costosas (joins entre 3+ tablas grandes) | Latencia endpoint | Materializar como vista DuckDB (`mv_mapa_provincial_macro/meso/deep`) refrescada en seed; cachear en memoria del backend con TTL 5min |
| 5 | Filtro por año (`anio=2024`) dispara recálculos | Lag interactivo | Pre-computar 3-5 años clave (2020-2024) en vistas separadas; switch entre vistas en lugar de query dinámica |
| 6 | Onboarding intrusive si no se puede dismissar | UX malo | Esc cierra; flag localStorage + botón "no mostrar más"; replay disponible desde `?` flotante |
| 7 | El detail panel "cadena de conexión" requiere queries de path-finding que sin Neo4j son lentas | Slow panel | Pre-computar top 5 conexiones por nodo en seed; servirlas estáticas; expansión live sólo cuando Neo4j está disponible |
| 8 | Time slider podría sentirse glitchy en cada step | UX degradado | Debounce 250ms entre cambios; transición de 350ms con interpolación suave de positions/sizes |

---

## §9 · Estado del repo al iniciar Fase A

```
$ git log --oneline -5
54ee0b5 chore(graph): borrar GraphEngine custom de PR-1
5de567a feat(home-graph): search ⌘K + filter chips
085e01a feat(home): grafo Sigma.js + Graphology + ForceAtlas2 reemplaza GraphEngine custom
[CSS @import fix re-aplicado in-place sin commit, parte del estado de trabajo]
```

Branches:
- `main` (current, ahead origin)
- `pre-rollback-2026-05-01` (safety)

Tooling:
- Backend dev server: corriendo (puerto 3001, PID variable)
- Frontend dev server: corriendo (puerto 8080)
- Smoke test infra: `frontend/scripts/visual-smoke.mjs` lista
- DuckDB: `backend/data/argos.duckdb` con todas las tablas listadas en §3

---

## §10 · Decisiones pendientes (preguntar antes de Fase D)

- [ ] **Iconografía**: ¿usamos Lucide pre-renderizado a sprite (rápido) o SVG inline en `nodeProgramClasses` custom (mejor calidad)? Recomiendo sprite por performance.
- [ ] **Territorio**: ¿silueta de provincia + capital como contorno blanco al 6% opacity? Te muestro alternativas en Fase G.
- [ ] **Time slider**: necesita endpoint con parámetro `?año=` que filtre las queries. Backend lo soporta agregando `WHERE anio = ?` a las queries de §4.2. Ya está en el plan.
- [ ] **Path-finding visual**: V1 = query estática top-5 conexiones precalculadas. V2 (con Neo4j) = shortest path live.
- [ ] **Lazy expand**: doble-click en nodo → fetch `/api/grafo/expand/:id`. Estructura compatible: agregamos `connections: { in: [], out: [] }` al endpoint actual cuando `?expandible=true`.

---

## §11 · Entregable visual esperado

Después de las 8 fases, el screenshot del home debería mostrar:

- **Centro-superior:** "Provincia de Córdoba" — círculo grande azul con icon MapPin + label
- **Centro-inferior:** "Córdoba Capital" — círculo grande amber con icon Landmark + label
- **Edge entre ambos:** azul-violeta gruesa "comparte_jurisdiccion"
- **Alrededor de Provincia:** ~18 ministerios provinciales (azul) — Educación más grande (72k empleados)
- **Alrededor de Capital:** ~12 ministerios/secretarías (amber) — Desarrollo Urbano más grande ($28.6 mil M)
- **Cluster por ministerio:** direcciones (gris) + empresas (amber) gravitando alrededor del padre
- **Aristas tipadas:** sutiles para "contiene", visibles para "contrata" (con grosor proporcional al monto)
- **Halos rojos:** 1 grave (Mosquera/Renault), 3 moderada
- **Top-left:** filter chips Jurisdicción / Tipo / Severidad / Año
- **Top-right:** búsqueda ⌘K + minimap esquina sup-der
- **Bottom-left:** legend con taxonomía completa + meta real ($X mil M ejecutados, N empleados, etc)
- **Bottom-right:** zoom controls + + - FIT
- **Background:** gradient + silueta tenue del territorio cordobés + starfield sutil

Total ~600 nodos visibles a zoom default, 1000+ disponibles al deep zoom. Cada vínculo trazable a su fuente original. Cero datos inventados (CLAUDE.md §2).

---

## §12 · Cómo arrancamos

Con la auto-mode activa, ejecuto las fases en orden, commiteo después de cada una, y muestro screenshot al cierre de cada fase. Si algo se rompe la inversión es contenida porque cada fase es un commit aislado.

**Próximo paso:** Fase A — Backend.
