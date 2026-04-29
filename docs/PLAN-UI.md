# PLAN UI — Arquitectura de la interfaz de ARGOS

> Versión: 1.0 · Fecha: 2026-04-29 · Estado: aprobado, pendiente ejecución
> Spec hermano: `docs/PLAN-DATOS.md` (modelo de datos canónico)
> Sustituye: ninguno (es el primer documento canónico de UI)

Este documento define **cómo el usuario investiga con ARGOS**. Toda decisión de superficie, componente o interacción se justifica contra este documento. Si una decisión de schema requiere cambiar la UI, primero se actualiza este documento.

---

## 1. Misión del UI

Permitir que un periodista, activista, ciudadano o fiscal pueda **encontrar, entender y verificar** el flujo del dinero público de Córdoba y las relaciones entre quienes lo administran y quienes lo reciben — usando el **grafo como lenguaje visual transversal** sin sacrificar la usabilidad investigativa.

## 2. Cinco principios fundamentales (no negociables)

1. **El grafo es el medio, no el menú.** Toda sección visualiza con grafo, pero el usuario navega también por búsqueda y por listados. El grafo es lenguaje visual; la búsqueda es entrada paralela.
2. **Toda investigación termina en un Profile canónico.** Persona Física = `/persona/:dni`. Persona Jurídica = `/empresa/:cuit`. Una persona = una URL. Una empresa = una URL. Sin DNI/CUIT confirmado, no hay Profile — solo "candidato sin identidad".
3. **El tiempo es de primera clase.** Ningún dato sin año. Ningún cargo sin vigencia. Ninguna señal sin `t_efectivo` y `t_publicado`. Sin tiempo no hay forensia.
4. **Toda señal lleva badge de verificación.** Cuatro estados: ✓ Verificada / ◌ Sin verificar / ✗ Descartada (homonimia) / ⚠ Bloqueada. Innegociable. Es lo que distingue ARGOS de un agregador.
5. **Todo grafo es bounded.** Nunca "todo Córdoba en una pantalla". Siempre acotado por sección, por query o por actor de origen. Expansible por grados a pedido del usuario.

## 3. El átomo: `ActorProfile`

Toda investigación termina en una página de perfil canónico. Es la unidad de reuso del UI.

### `/persona/:dni` — Persona Física

```
┌─────────────────────────────────────────────────────────────┐
│ CABECERA                                                     │
│   Nombre · DNI · CUIT · Jurisdicción primaria                │
│   [badges: "Funcionario activo", "Declarante DJP", etc.]     │
├─────────────────────────────────────────────────────────────┤
│ TIMELINE UNIFICADO  ───●───●───●───●───●───●───●───          │
│   eventos clickeables; slider de rango                       │
├─────────────────────────────────────────────────────────────┤
│ CARGOS PÚBLICOS         │ DIRECCIONES EN EMPRESAS            │
│ vigencia · jurisdicción │ vigencia · CUIT empresa            │
├─────────────────────────────────────────────────────────────┤
│ PATRIMONIO (DDJJ)       │ APORTES A CAMPAÑA                  │
├─────────────────────────────────────────────────────────────┤
│ SEÑALES ASOCIADAS  +  RED 2-HOP [con expansión por grados]   │
├─────────────────────────────────────────────────────────────┤
│ FUENTES (URLs canónicas, agrupadas por dimensión)            │
└─────────────────────────────────────────────────────────────┘
```

### `/empresa/:cuit` — Persona Jurídica

```
┌─────────────────────────────────────────────────────────────┐
│ CABECERA                                                     │
│   Razón social · CUIT · Tipo societario · Domicilios         │
│   Fecha constitución                                         │
├─────────────────────────────────────────────────────────────┤
│ TIMELINE UNIFICADO  ───●───●───●───●───●───●                 │
├─────────────────────────────────────────────────────────────┤
│ CONTRATOS COMO PROVEEDOR │ PAGOS RECIBIDOS (cadena)          │
├─────────────────────────────────────────────────────────────┤
│ DIRECTORES (histórico)   │ APORTES A CAMPAÑA HECHOS          │
├─────────────────────────────────────────────────────────────┤
│ TRANSFERENCIAS / SUBSIDIOS RECIBIDOS                         │
├─────────────────────────────────────────────────────────────┤
│ SEÑALES ASOCIADAS  +  RED 2-HOP [con expansión por grados]   │
├─────────────────────────────────────────────────────────────┤
│ FUENTES                                                      │
└─────────────────────────────────────────────────────────────┘
```

**Cada nombre clickeable navega al Profile correspondiente.** Esa es la mecánica de investigación: saltar de actor en actor por relaciones explícitas, como Wikipedia.

## 4. Las cinco superficies, cada una con su grafo

| Ruta | Pregunta del usuario | Grafo | Layout |
|---|---|---|---|
| `/` | "¿Qué es esto y qué tiene?" | Top ~80 actores destacados (curado) | Force-directed |
| `/dinero` | "¿Dónde va la plata?" | Sankey crédito→compromiso→devengado→pagado, con drill bipartito partida↔proveedor | Sankey + bipartite |
| `/actores` | "¿Existe esta persona/empresa?" | Mini-ego de cada resultado (1-hop) | Ego radial |
| `/senales` | "¿Qué encontró el sistema?" | Fragmento de la señal (2 partes + relación) | Fragment |
| `/caso/:id` | "Mi expediente personal" | Subset arrastrado por el usuario | Manual + force |

**El grafo no es una superficie top-level.** Está embebido en cada una.

### 4.1 Landing (`/`)

- **Grafo**: top ~80 nodos elegidos por: top 30 proveedores por monto + top 30 funcionarios por cargo/patrimonio + 20-30 actores con señales graves verificadas.
- **Aristas**: contratos, direcciones, aportes.
- **Sobreimpresos**: barra de búsqueda + 2-3 North Star metrics (`$X.XXX M con cadena de pago verificable`, `X señales graves verificadas`) + 3 señales destacadas del mes.
- **Regeneración**: snapshot **mensual**, fecha visible ("Foto del XX-XX-2026").
- **Acciones**: hover = tooltip; click nodo = navega a Profile; click "expandir grados" = ver §6.

### 4.2 El Dinero (`/dinero`)

- **Grafo principal**: Sankey de las cinco etapas del ciclo presupuestario por jurisdicción.
- **Drill 1**: click en banda → grafo bipartito **partida ↔ proveedor**.
- **Drill 2**: click en proveedor → `/empresa/:cuit`.
- **Toggle**: "Sankey ↔ Tabla jerárquica" (tabla como secundaria).
- **Filtros**: rango temporal (default últimos 5 años), jurisdicción, programa.

### 4.3 Actores (`/actores`)

- **Search-driven**. Resultados con desambiguación visual mediante mini-ego de cada candidato.
- **Listados rankeados** (alternativa a búsqueda): top empresas por monto, top funcionarios por patrimonio, top aportantes por monto agregado.
- Click en cualquier resultado → Profile.

### 4.4 Señales (`/senales`)

- **Lista filtrable**. Cada item es una tarjeta con fragmento de grafo + badge de verificación.
- **Filtros**: tipología, severidad, jurisdicción, **estado de verificación**, año.
- Click en señal → ficha completa con evidencia + acciones (verificar, descartar, agregar a caso).

### 4.5 Caso (`/caso/:id`)

- Workspace persistente (ya existe en backend).
- **Privado** por default. Exportable como PDF de denuncia.
- Drag & drop de actores, contratos, señales en el caso. Sidebar de notas. Botón "Generar denuncia" produce PDF Ley 25.188 / Ley 8835 con cadena de evidencia.

## 5. Graph Visual Language (consistente en toda la app)

Un solo lenguaje visual hace que cinco grafos distintos se sientan **una sola app**.

### Nodos

| Elemento | Forma | Color base | Tamaño = | Saturación = |
|---|---|---|---|---|
| Persona Física | círculo | azul (jurisdicción primaria) | nivel jerárquico del cargo | actividad reciente |
| Persona Jurídica | cuadrado | naranja (provincia domicilio fiscal) | monto total contratado | actividad reciente |
| Contrato | rombo | gris | monto | reciente vs viejo |
| Partida presupuestaria | rectángulo redondeado | verde | monto vigente | ejecución |
| Pago | (no es nodo, es arista) | — | — | — |
| Señal | halo punteado alrededor del nodo afectado | rojo (grave) / amarillo (moderada) / gris claro (leve) | — | — |

### Aristas

| Tipo de relación | Estilo | Etiqueta |
|---|---|---|
| Dirige (PF→PJ) | sólida | "dirige" + vigencia |
| Provee (PJ→Contrato) | sólida + grosor por monto | "$X M" |
| Aportó (PF/PJ→Partido) | punteada | "$X · año" |
| Cargo público (PF→Jurisdicción) | sólida con barra de tiempo | "Cargo, AAAA-AAAA" |
| DDJJ (PF→declaración) | sólida fina | año |
| Pago (Compromiso→Pagado) | flecha gruesa verde→naranja | "$X" |

### Interacción universal (idéntica en los cinco grafos)

- **Hover** = tarjeta lateral con resumen + acciones contextuales.
- **Click en nodo** = navega al Profile o a la entidad correspondiente.
- **Click en arista** = panel con detalle de la relación + fuentes.
- **Drag** = reposicionar (en grafos force).
- **Scroll** = zoom (en todos).

## 6. Expansión por grados

**Cada grafo arranca compacto** (ver §4 para qué constituye "compacto" en cada uno) y el usuario puede expandirlo desde cualquier nodo seleccionado a 1, 2 o 3 grados de separación.

### Control

Panel flotante en la esquina superior derecha de cualquier vista de grafo:

```
┌──────────────────────────────┐
│  Centrado en: [● MOSQUERA]   │
│                              │
│  Expandir:                   │
│  [ 1° ]  [ 2° ]  [ 3° ]      │
│                              │
│  Visibles: 47 / cap 500      │
│                              │
│  [↺ Reset al compacto]       │
└──────────────────────────────┘
```

### Reglas de operación

| Regla | Detalle |
|---|---|
| **Cap visible** | Máximo 500 nodos en pantalla. Si una expansión supera el cap, se priorizan por relevancia (ver abajo) y se muestra "X nodos ocultos por orden de relevancia". |
| **Priorización** | Por monto agregado (PJ), nivel jerárquico del cargo (PF), severidad de señal asociada. Empate → más reciente primero. |
| **Estabilidad de layout** | Nodos existentes **no saltan** al expandir. Los nuevos animan in con fade + spring. |
| **Jerarquía visual por grado** | Grado 0 (foco) = tamaño 100%. Grado 1 = 80%. Grado 2 = 60%. Grado 3 = 40%. Aristas igual. |
| **Foco recentrable** | Click en cualquier nodo del grafo expandido → ese nodo se vuelve el nuevo grado 0; el control de expansión se resetea. |
| **Breadcrumb** | "Centrado en MOSQUERA · expandido 2° · 87 nodos · 12 ocultos" siempre visible. |

### Semántica por sección

| Sección | Qué significa "1 grado" | Qué significa "2 grados" | Qué significa "3 grados" |
|---|---|---|---|
| `/` Landing | Vecinos directos del nodo seleccionado | Vecinos de vecinos | Tres saltos |
| `/dinero` Sankey | Drill: + programas | + partidas | + contratos individuales |
| `/dinero` bipartito | Vecinos directos | + co-proveedores de la misma partida | + sus directores |
| `/actores` mini-ego | Default ya es 1° | Expandible a 2° in-line | 3° abre vista detalle |
| `/senales` fragmento | Default 1° (las dos partes) | + el contexto de cada parte | + sus relaciones secundarias |
| `/persona/:dni`, `/empresa/:cuit` | Default 2°; selectable 1/2/3° |

### Costos técnicos

- **Grado 1**: barato. Una query a Neo4j.
- **Grado 2**: medio. Una query a Neo4j con `MATCH (a)-[*1..2]-(b)`. Cap por relevancia indispensable.
- **Grado 3**: caro pero acotable. Mismo patrón con cap duro de 500. **Sin grado 3 sin cap** — eso colapsa el browser.

DuckDB no es buena base para queries de adyacencia multi-hop. **Toda expansión >1 grado se sirve desde Neo4j.** El depth-0 (set inicial) puede salir de DuckDB cacheado.

## 7. Tiempo como dimensión de primera clase

| Lugar | Cómo se expone el tiempo |
|---|---|
| Cabecera global | Selector de rango de fechas |
| Default `/dinero` | Últimos 5 años |
| Default `/actores`, `/senales`, Profile | Histórico completo |
| Profile | Timeline horizontal con eventos clickeables + slider de rango |
| Sankey de `/dinero` | Comparación de períodos (2023 vs 2024 con delta) |
| Cualquier listado | Columna "vigente desde / hasta" cuando aplica |
| Señales | "Detectada el `t_publicado`, sobre eventos de `t_efectivo`" |

Nunca un dato sin año. Nunca un cargo sin vigencia. Nunca un contrato sin año de firma + año de pago.

## 8. Badge de verificación universal

Toda señal, en cualquier lugar del UI donde aparezca, lleva un badge único, no decorativo:

| Badge | Color | Significado |
|---|---|---|
| ✓ **Verificada** | verde | DNI/CUIT confirmado, evidencia con fuente_url, lista para denuncia |
| ◌ **Sin verificar** | amarillo | El detector la generó automáticamente; falta confirmación humana |
| ✗ **Descartada (homonimia)** | gris | Verificada y refutada. Queda en histórico para auditoría |
| ⚠ **Bloqueada** | rojo | Verificación intentada pero la fuente está caída/redactada |

**Innegociable.** No se muestra una señal sin badge.

## 9. Tres flujos canónicos

### Flujo 1 — Periodista escucha un nombre

```
1. /  →  busca "MOSQUERA ALEJANDRO" en barra global
2. /actores?q=…  →  ve 3 desambiguaciones (3 DNIs distintos conocidos)
                    + 1 candidato "name_only_unmatched"
                    cada uno con su mini-ego
3. clic en MOSQUERA con DNI X  →  /persona/:dni
4. lee perfil completo, encuentra señal "conflicto Renault"
   con badge ◌ Sin verificar
5. clic en señal  →  fragmento de grafo + evidencia
6. expande a 2°  →  ve si la PJ tiene domicilio fiscal en Córdoba
   (descarta homonimia visualmente sin abrir 5 pestañas)
```

### Flujo 2 — Activista entiende una partida

```
1. /  →  clic en "El Dinero"
2. /dinero  →  Sankey 2024
3. clic en "Educación"  →  drill: programas de educación
4. clic en "Programa 642"  →  bipartito partida↔proveedores
5. clic en proveedor  →  /empresa/:cuit
6. clic en director  →  /persona/:dni  (¿cargo público en Córdoba?)
```

### Flujo 3 — Investigador trabaja un caso

```
1. /caso/123 (workspace persistente)
2. arrastra actores y contratos al case file
3. anota observaciones en sidebar
4. botón "Generar denuncia"  →  PDF Ley 25.188 / Ley 8835
   con cadena de evidencia
```

## 10. Lo que NO va a estar (decisiones firmes)

- **NO** mapa geográfico de Argentina/Córdoba como portada.
- **NO** un "explorador libre" tipo grafo de fuerzas no acotado en la home.
- **NO** chat-bot LLM como entrada. PR #6 (`/api/chat`) vive como asistente lateral en `/actores` y `/senales`, no como pantalla.
- **NO** comparación entre municipios en MVP (cobertura desigual).
- **NO** redes sociales / LinkedIn / enriquecimiento automático sin fuente_url.
- **NO** dashboards configurables / drag-and-drop tipo Looker.
- **NO** señales sin badge de verificación.
- **NO** Profiles sin DNI/CUIT confirmado. Quien no tiene identidad canónica aparece solo como "candidato sin identidad" en listados.
- **NO** expansión de grafo sin cap visible. Grado 3 sin priorización colapsa el navegador.

## 11. Decisiones cerradas

| Decisión | Resolución |
|---|---|
| North Star del landing | **Monto total trackeado** ("$X.XXX M con cadena de pago verificable"), superpuesto sobre el grafo de actores destacados. Las señales graves van como secundario. |
| `/dinero` default | **Sankey** (es nativamente un grafo, encaja en la metáfora transversal). Tabla jerárquica como toggle. |
| Caso file privacidad | **Privado** por default, exportable como PDF. |
| Frecuencia de regeneración del grafo del landing | **Mensual**. Snapshot fijo con fecha visible. |
| Profundidad default de expansión | **1° en grafos compactos** (landing, mini-ego, fragmento). **2° en Profile**. **0° en Sankey** (drill independiente). |
| Cap de nodos visibles | **500 nodos**. Más de eso, cap + priorización. |

## 12. Implementación: lo que ya está sirve

- **`<GraphCanvas>` de PR #4** (`frontend/src/components/argos/GraphCanvas.tsx`) ya usa d3-force con animación imperativa optimizada. Es la base del motor para los cinco grafos. Solo cambia el *layout algorithm* (force, sankey, bipartite, hierarchical, ego) — el motor de animación se reusa.
- **`design/argos-v2-import` branch** tiene `ARGOS v2.0.zip` con el rediseño visual. Se extrae e integra como base del Graph Visual Language (estética). Las **reglas** (formas, semántica, interacción) las define este documento.
- **`CadenaDePago` y `CoberturaBanner` (W5)** se rediseñan como overlays sobre los grafos correspondientes (Sankey en `/dinero`, fragmento en `/cobertura`), no como vistas separadas.
- **PR #6 chat LLM** se reposiciona como asistente lateral, no portada.
- **Neo4j ya está integrado** (W1, W4) y es el backend natural para queries de adyacencia multi-hop. No requiere infra adicional.

## 13. Mapa de campos del schema requeridos por la UI

Estos campos son **requeridos por la UI** para servir las cinco superficies. Cualquier ausencia genera ticket en `PLAN-DATOS.md`.

| Vista | Tabla(s) | Campos requeridos | Estado en schema |
|---|---|---|---|
| `/` Landing | `personas_fisicas`, `personas_juridicas`, `señales_cache` | identidades canónicas, monto agregado por actor | ❌ Bloquea (Fase A) |
| `/dinero` Sankey | `presupuesto_ejecucion` | `compromiso DOUBLE` | ❌ Falta (Fase B1) |
| `/dinero` bipartito | `contratos` | `partida_presupuestaria`, `proveedor_cuit` | ❌ Falta (Fase B2) |
| `/dinero` cadena | `pagos_contrato` | tabla nueva | ❌ Falta (Fase B3) |
| `/actores` mini-ego | Neo4j | adyacencia 1-hop | ✓ existe (W1, W4) |
| `/senales` fragmento | `señales_cache` + entidades | OK con identidad canónica | ⚠ depende Fase A |
| Profile PF | `personas_fisicas` + relaciones | tabla maestra | ❌ Bloquea (Fase A1) |
| Profile PJ | `personas_juridicas` + relaciones | tabla maestra consolidada | ❌ Bloquea (Fase A2) |
| Expansión 2-3° | Neo4j adyacencia multi-hop con cap | índices por monto/jerarquía | ⚠ requiere índice + cap query |
| Verificación badge | `señales_cache` | columna `estado_verificacion` ∈ {verificada, sin_verificar, descartada, bloqueada} | ❌ Falta (sumar a Fase A o E) |
| Cargos vigencia | `cargos_funcionarios` (nueva) | tabla con vigencia explícita | ❌ Falta (Fase A6 — agregado por UI) |

**Acciones derivadas para `PLAN-DATOS.md`**:

- **A6 (nuevo)**: Tabla `cargos_funcionarios {dni FK, jurisdiccion, cargo, reparticion, vigente_desde, vigente_hasta, fuente_url}`. Trayectoria explícita en lugar de N filas anuales en `agentes_publicos`.
- **A7 (nuevo)**: Columna `estado_verificacion TEXT` en `señales_cache` con default `'sin_verificar'`. Único valor posible: `verificada | sin_verificar | descartada | bloqueada`. Más una columna `verificado_por` (handle del humano) y `verificado_en` (timestamp).
- **B6 (nuevo)**: Índices Neo4j por `monto` (en aristas Provee) y `jerarquia` (en propiedad de :Persona) para que el cap por relevancia sea sub-segundo en queries de 2-3 hops.

## 14. Orden de ataque recomendado

1. Cierre de este documento (este turno).
2. **Fase A1-A3 + A7** (`personas_fisicas`, `personas_juridicas`, validador módulo-11, columna `estado_verificacion`). 1-2 días.
3. **Stub del Profile** en frontend con datos sintéticos del modelo nuevo. Valida el modelo antes de migrar reales.
4. **Fase A4-A5 + A6** (backfill + tabla cargos). 3-4 días.
5. **Fase B** (cadena de dinero canónica). 1 semana.
6. **UI real** sustituyendo stubs progresivamente, sección por sección, en orden: Profile → Landing → Señales → Dinero → Actores → Caso.
7. **Fase C** (detectores rigurosos, refactor M4.1).
8. **Fase E** (verificación, denuncia, release).

---

# Cambios v1.1 — Fase D + F (post brainstorm 2026-04-29)

Este apéndice documenta las decisiones canónicas de las 10 superficies UI
que se brainstormearon y construyeron en este sprint. Las decisiones
override cualquier propuesta inicial del documento si hay conflicto.

## Sistema visual transversal — "Premium Forensic dark"

| Elemento | Valor |
|---|---|
| Background | `#0d1117` (Bloomberg-dark) |
| Texto base | `#dde3ee` |
| Texto muted | `#9BA3B4` |
| Acento PF | `#7da3ff` (azul) — glyph `●` |
| Acento PJ | `#ff9b5c` (naranja) — glyph `■` |
| Severidad grave | `#E25656` |
| Severidad moderada | `#F5B544` |
| Severidad leve | `#9BA3B4` |
| Verificada | `#62C7A0` (verde) |
| Tipografía números | `ui-monospace` |
| Sparkline | unicode `▁▂▃▄▅▆▇█` |
| Animación nodos | sequential stagger 30ms + trazo path-length 220ms |

## Sitemap canónico

```
/                    Landing — Hero $ AUDITADOS + feed Señales del mes
/dinero              Sankey ciclo presupuestario → drill-down URL-driven
/actores             Omnibox fuzzy + lista glyph + 3 cols métricas
/persona/:dni        Profile PF (two-pane + mini-grafo + +Watch +Caso)
/empresa/:cuit       Profile PJ (two-pane + mini-grafo)
/senales             Top 50 score · todos estados · read-only
/casos /caso/:id     Workspace (localStorage) two-pane + preview PDF
/mapa                Top centralidad · force-directed
/metodologia         TOC Notion · demos vivos módulo-11
/comparar            2 empresas · 3 cols A·B·Δ
/watchlist           Por actor · in-app · localStorage
/cola-verificacion   ⚠ admin-only (X-Argos-Admin-Token header)
```

## Decisiones por módulo (síntesis)

- **Tono universal**: descriptivo neutral. La plataforma "describe, no acusa".
  Evitar "hallazgos", "destapamos", "corrupto" en UI/copy. Usar "señales
  detectadas", "patrones marcados", "posibles irregularidades".
- **Storage user state**: localStorage en MVP. Casos y watchlist como
  blobs JSON exportables. Cross-device manual via export/import.
- **Auth real**: deuda técnica. Hoy `/cola-verificacion` POST exige header
  `X-Argos-Admin-Token` igual a env var (fail-closed). Futuro: Supabase
  con roles `auditor` / `admin`.
- **Animación grafo nodos**: sequential stagger 30ms entre nodos + trazo
  path-length 220ms en aristas. Implementado en MiniGraph (Profile).
  En `/mapa` la simulación física de GraphCanvas se encarga del
  separation; el stagger explícito es opcional.
- **Audiencia priorizada**: periodistas / fiscales / abogados / auditores
  primero. Otros usuarios quedan cubiertos vía `/metodologia` con demos
  vivos del módulo-11 + cap dinámico.

## Endpoints backend canónicos

| Endpoint | Módulo |
|---|---|
| `GET /api/landing` | Landing D1 |
| `GET /api/dinero/{sankey,jurisdicciones,partidas}` | Dinero D2 |
| `GET /api/actores-d6` | Actores D3 |
| `GET /api/profile/{persona/:dni,empresa/:cuit}` | Profile D4 (Fase F R6) |
| `GET·POST /api/cola-verificacion` | Cola E2 (admin token) |
| `POST /api/denuncia/pdf` | Caso D7/E3 |
| `POST /api/watchlist-d8/feed` | Watchlist D8 |
| `GET /api/comparar/{empresa,empresas-lookup}` | Comparar D9 |

## Vistas canónicas (Fase F R5 conectividad)

| Vista | Cardinalidad | Propósito |
|---|---:|---|
| `v_persona_dirige_empresa` | 1.719.418 | PF→PJ vía IGJ. La conexión más usada por Profile. |
| `v_actor_universo` | 1.259.691 | Universo PF+PJ con métricas precomputadas. |
| `cadena_de_pago` | varies | 5 etapas presupuestarias por partida + contrato. |

## Estado actual (auditado 2026-04-29)

| Métrica | Valor |
|---|---:|
| personas_fisicas (PF) | **763.082** |
| personas_juridicas (PJ) | **496.609** |
| relaciones PF→PJ | **1.719.418** |
| agentes_publicos (cap+prov) | 178.356 |
| agentes con DNI populado (Tier 2 heurístico) | 2.939 |
| contratos | 1.393 (cap=1382, upc=11) |
| presupuesto_ejecucion | 4.035 (capital) |
| señales_cache | 13 |
| Cobertura datasets cordobeses | ~70% |

**Aún faltan cargar (alta prioridad para "completar Córdoba"):**
- Tribunal de Cuentas Provincial (auditorias_tribunal_cuentas: 0)
- Obras públicas (obras_publicas: 0)
- Transferencias / subsidios (transferencias: 0)
- Boletín Oficial Provincia (boe_cba_pdfs: 0)
- OCR DDJJ municipales (1348 PDFs sin DNI populado)
- Aportantes campañas — bloqueado por AFIP CNE (alternativa: Justicia
  Electoral Provincial Córdoba, no implementado)
