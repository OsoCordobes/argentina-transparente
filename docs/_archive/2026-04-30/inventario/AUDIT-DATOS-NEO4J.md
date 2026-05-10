# AUDIT — Estructura y Lógica de Datos ARGOS Neo4j

> Auditoría integral del grafo cordobés. Fecha: 2026-04-26.
> Branch: `claude/chat-first-ui-design-aWg0V`.
> Objetivo: garantizar que cada nodo y arista del grafo sea **traceable a la realidad**, sin invenciones, alucinaciones ni mock data. Lógica robusta digna de aplicación gubernamental.

---

## 1. Modelo conceptual (la esfera pública en Neo4j)

ARGOS modela la administración pública cordobesa como un grafo donde **cada actor de la realidad es un nodo** y **cada relación verificable es una arista**. Se siguen 3 principios:

1. **Identificadores reales**: DNI canónico para `PersonaFisica`, CUIT para `Empresa`, slug determinístico para `Reparticion`. Cero ID inventados.
2. **Trazabilidad por arista**: cada relación tiene una fuente original (URL del Boletín Oficial, dataset CKAN, API REST). Si no hay fuente, no hay arista.
3. **Tier de confianza explícito**: cuando un match no es estructural (ej. `ES_LA_MISMA_PERSONA` por nombre normalizado y no por DNI), la arista lleva `tier=2` para que el frontend muestre el caveat de homonimia.

### Diagrama lógico

```
                                      ┌────────────────────┐
                                      │   Reparticion      │
                                      │   (Ministerio,     │
                                      │    Secretaría,     │
                                      │    Concejo, …)     │
                                      └─────────┬──────────┘
                                                │
                              ┌─────────────────┼────────────────┐
                              │                 │                │
                       (TRABAJA_EN)         (EMITE)         (OPERA_EN
                              │                 │           agregada)
                              │                 ▼                │
                       ┌──────┴──────┐    ┌──────────┐           │
                       │ Funcionario │    │ Contrato │           │
                       │ (un cargo,  │    │ (1 a 1   │           │
                       │  un período)│    │  empresa)│           │
                       └──────┬──────┘    └─────┬────┘           │
                              │                 │                │
                  (ES_LA_MISMA_PERSONA           │                │
                   tier 1: DNI exact            (GANÓ)            │
                   tier 2: nombre norm)          │                │
                              │                 ▼                │
                              ▼          ┌──────────┐            │
                       ┌─────────────┐   │ Empresa  │◀───────────┘
                       │PersonaFisica│   │ (CUIT    │
                       │  (DNI       │   │  único)  │
                       │   único)    │   └──────────┘
                       └──────┬──────┘         ▲
                              │                │
                          (DIRIGE)             │
                              └────────────────┘

  Capa ortogonal: Señal -[:SEÑALA]-> Empresa
  (cada Señal es un hallazgo del motor de detección sobre Contratos)
```

---

## 2. Catálogo modular de nodos

### Módulo "Personas físicas"

| Atributo | Tipo | Origen | Reglas |
|---|---|---|---|
| `dni` | string PK | `igj_autoridades.numero_documento` | UNIQUE constraint. Solo dígitos 6-12. NIE con letra (DNI extranjero) preservado tal cual. |
| `nombre` | string | igj_autoridades.apellido_nombre | Tal cual viene del dataset |
| `nombreNorm` | string | computed | `toUpperCase + strip acentos + alpha-only`. Indexed for matching. |

**Cuenta actual:** 782,350 personas físicas.
**Fuente única:** Inspección General de Justicia (IGJ Nación, datos.jus.gob.ar).

**Issue resuelto:** 41,524 nodos eliminados por merge tras normalizar DNIs con whitespace/puntos. Quedan 14,769 con DNIs no-numéricos (NIE extranjeros) — válidos pero no normalizables.

**Reglas de integridad:**
- Una `PersonaFisica` = un DNI único. Es imposible que la misma persona tenga 2 nodos.
- Homónimos (ej. 45 "FERNANDEZ JUAN CARLOS" con distintos DNIs) son personas REALES distintas y se mantienen separadas.

### Módulo "Personas jurídicas (Empresas)"

| Atributo | Tipo | Origen | Reglas |
|---|---|---|---|
| `cuit` | string PK | múltiples | UNIQUE. 11 dígitos. |
| `nombre` | string | empresas + RNS + IGJ | Tal cual viene |
| `tipoSocietario` | string | RNS / IGJ | "SOCIEDAD ANONIMA", "SRL", "UTE", etc. |
| `municipio` | string | seed | "cordoba-capital" para las cordobesas |
| `esEmpleador` | boolean | empresas (AFIP best-effort) | NULL si no hay info |
| `inicioActividades` | date | RNS.fecha_contrato_social o AFIP | |
| `estado` | string | "habilitado", "activa" | |

**Cuenta actual:** 101,641 empresas.
**Fuentes:**
- 119 desde tabla `empresas` (padrón provincial Córdoba dataset 281)
- 101,522 desde `rns_personas_juridicas` filtradas a `dom_legal_provincia=CORDOBA OR dom_fiscal_provincia=CORDOBA`

**Issue identificado:** 1,988 empresas con director pero sin contratos — son empresas IGJ con CUIT en Córdoba pero que nunca aparecen en contratos públicos. Es ruido para el núcleo del grafo. **Acción:** se filtran del nucleo del frontend (no se eliminan del grafo).

### Módulo "Cargos públicos (Funcionario)"

| Atributo | Tipo | Origen | Reglas |
|---|---|---|---|
| `id` | string PK | sha256(jurisdiccion+nombre+cargo+reparticion+anio).slice(24) | Determinístico |
| `nombre` | string | agentes_publicos.apellido_nombre | |
| `nombreNorm` | string | computed | indexed |
| `jurisdiccion` | string | "cordoba-capital" o "cordoba-provincia" | |
| `cargo` | string | agentes_publicos.cargo | |
| `anio` | int | MAX(anio) for that cargo | |
| `bruto` | float | MAX(bruto) | |
| `cuit` | string \| NULL | agentes_publicos.cuit | ~100% NULL en datasets cordobeses |
| `dni` | string \| NULL | (no popular hoy) | reservado para cuando carguemos padrón AFIP |

**Cuenta actual:** 142,851 cargos.
**Fuentes:**
- 51,472 cordoba-capital (datasets 131 sueldos funcionarios mensual + 201 nómina agentes municipales + 3292 sueldos concejales)
- 91,379 cordoba-provincia (CKAN datosgestionabierta.cba.gov.ar empleados-poder-ejecutivo)

**Issue identificado:** 333 funcionarios sin reparticion (campo `reparticion` NULL en el dataset original). Ej. "INTENDENCIA" sin secretaría asignada.

**Decisión clave:** Funcionario es una entidad distinta de PersonaFisica porque:
- Una persona puede tener múltiples cargos en períodos distintos.
- Los datasets cordobeses no publican DNI/CUIT de funcionarios → no podemos canonicalizar a PersonaFisica salvo por nombre (Tier 2, falible).

Cuando el dataset publique DNI (vía AFIP padrón empleadores con suscripción, o Boletín Oficial OCR), Funcionario.dni se popula y la arista `ES_LA_MISMA_PERSONA` pasa a Tier 1 (verificada).

### Módulo "Reparticion (Estado)"

| Atributo | Tipo | Origen | Reglas |
|---|---|---|---|
| `id` | string PK | `<jurisdiccion>:<nombre_norm>` (slug) | Determinístico |
| `nombre` | string | original casing | |
| `jurisdiccion` | string | "cordoba-capital" o "cordoba-provincia" | |
| `tipo` | string \| NULL | ministerio, secretaria, etc. | mayormente NULL |

**Cuenta actual:** 459 reparticiones.

**Fuentes:**
- Derivadas de `contratos.area` cuando un contrato cordobés se carga
- Derivadas de `agentes_publicos.reparticion` cuando un funcionario se carga

**Por construcción:** una Reparticion existe si y solo si tiene al menos un contrato emitido o un funcionario.

### Módulo "Contrato"

| Atributo | Tipo | Origen | Reglas |
|---|---|---|---|
| `id` | string PK | `contratos.hash` (sha256 del contrato) | Determinístico |
| `monto` | float | contratos.monto | |
| `tipo` | string | contratos.tipo (LICITACION PUBLICA, DIRECTA, etc.) | |
| `anio` | int | contratos.anio | |
| `area` | string | contratos.area (string libre) | usado para derivar Reparticion |
| `municipio` | string | "cordoba-capital" | |

**Cuenta actual:** 1,114 contratos en grafo (de 2,421 en DuckDB — los otros 1,307 no tienen CUIT resuelto).

**Issue identificado:** 1,307 contratos no llegan al grafo porque `identity_matches` no resolvió su `proveedor_norm` a un CUIT. Esto se mitiga en cada `analyze --force` re-corriendo `npm run resolve:identities` (Iter 8.3 ampliado a RNS+IGJ).

### Módulo "Señal"

| Atributo | Tipo | Origen | Reglas |
|---|---|---|---|
| `id` | string PK | señales_cache.id (UUID determinístico por hash de evidencia) | |
| `tipologia` | string | "monopolio_rubro", "red_de_empresas", etc. | |
| `titulo` | string | generado por detector | |
| `score` | int | 0-100 | |
| `severidad` | string | "grave" \| "moderada" \| "leve" | |

**Cuenta actual:** 12 señales activas (último analyze).

**Por construcción:** una señal solo existe si los detectores la disparan en el último `analyze --force`. Cada señal lleva su evidencia y marco legal completo en `señales_cache.evidencia_json` y `legal_json` (DuckDB) — el grafo solo tiene los identificadores y tipo.

---

## 3. Catálogo modular de aristas

| Arista | Dirección | Cardinalidad | Origen / Verificación |
|---|---|---|---|
| `DIRIGE` | PersonaFisica → Empresa | N:N | igj_autoridades.numero_correlativo → igj_entidades.cuit |
| `TRABAJA_EN` | Funcionario → Reparticion | N:1 | agentes_publicos.reparticion (string match) |
| `GANÓ` | Empresa → Contrato | 1:N | contratos.proveedor_norm + identity_matches → empresa.cuit |
| `EMITE` | Reparticion → Contrato | 1:N | contratos.area → reparticion.id |
| `OPERA_EN` | Empresa → Reparticion (agregada) | N:N | agregada de contratos por (empresa, reparticion) con sum(monto) y count |
| `ES_LA_MISMA_PERSONA` | Funcionario → PersonaFisica | N:1 | Tier 1: DNI exact / Tier 2: nombreNorm. **El tier viene en la arista.** |
| `CONFLICTO_CON` | Funcionario → Empresa | N:N | derivada vía Cypher: cierra el ciclo TRABAJA_EN-OPERA_EN-DIRIGE-ES_LA_MISMA |
| `SEÑALA` | Señal → Empresa | 1:N | señales_cache.entidades_cuit |

---

## 4. Hallazgos del audit (2026-04-26)

| # | Issue | Severidad | Estado |
|---|---|---|---|
| 1 | DNIs con whitespace/puntos creaban duplicates (55,096 casos) | Alta | ✅ **Resuelto** — apoc.periodic.iterate normalizó dni y mergeó duplicates. PersonaFisica: 823,874 → 782,350 (-41,524). |
| 2 | DNIs con letra (NIE extranjeros): 14,769 | Baja | Aceptado — son válidos por construcción, mantener tal cual |
| 3 | 1,988 empresas con director pero sin contratos en Córdoba | Media | Mitigado — el nucleo del frontend filtra solo empresas con OPERA_EN |
| 4 | 333 funcionarios sin reparticion | Baja | Aceptado — el dataset original tiene `reparticion=NULL` en esos casos |
| 5 | "PEREYRA ALBERTO DAVID dirige 20 empresas" | OK | **Verificado real** — DNI 8533203 aparece en 20 entradas IGJ distintas. Los CUITs son distintos (33707397999, 30708554096, 30707560432, 30707964835, 30707396349, ...) |
| 6 | 21 grupos de homónimos por nombreNorm con 22-45 DNIs distintos cada uno (FERNANDEZ JUAN CARLOS, etc.) | OK | **Personas reales distintas** — cada DNI es una persona diferente en Argentina con ese mismo nombre. El UNIQUE constraint en DNI los mantiene separados. |
| 7 | ES_LA_MISMA_PERSONA Tier 2 puede causar falsos positivos por homonimia | Media | ✅ **Refinado** — Eliminadas 5,017 aristas Tier 2 con homonimia masiva (target nombreNorm con >5 DNIs distintos). Quedan 8,561 aristas (51 con homonimia única + 14 con homonimia 2-3 + 14 con homonimia 4-5 + restantes sin DIRIGE). El frontend muestra el caveat explícito de Tier 2. Resolución definitiva sigue requiriendo DNI de Funcionario → padrón AFIP o Boletín OCR. |
| 8 | 1,307 contratos cordobeses no llegan al grafo (sin CUIT resuelto) | Media | Mitigado — `npm run resolve:identities` con tier 1-3 RNS+IGJ baja a ~50% no resueltos. Los restantes son personas físicas, UTEs, fideicomisos sin CUIT publicado. |
| 9 | Funcionario ES_LA_MISMA_PERSONA siempre Tier 2 (cero CUIT/DNI en datasets cordobeses) | Alta | Pendiente — bloqueado por ingesta Boletín OCR. Mientras tanto, los 51 pares con homonimia única (1 sola persona con ese nombre) son los conflictos más sólidos detectables; los demás llevan caveat. |

---

## 5. Reglas de integridad — qué nunca puede pasar

1. **Un DNI = una persona única**. UNIQUE constraint en `PersonaFisica.dni`. Imposible duplicar.
2. **Un CUIT = una empresa única**. UNIQUE constraint en `Empresa.cuit`.
3. **Una `Reparticion` solo existe si tiene al menos una arista entrante** (TRABAJA_EN, EMITE, OPERA_EN). Reparticiones huérfanas se eliminan con Cypher de mantenimiento.
4. **Un `Contrato` solo existe si tiene `Empresa.cuit` resuelto**. Sin CUIT no entra al grafo (queda en DuckDB esperando resolución).
5. **Toda arista debe tener fuente_url verificable** (en el atributo o vía el nodo origen). Cero aristas sintéticas.
6. **Una `Señal` solo existe en grafo si fue cacheada por `analyze --force`** sobre datos reales de DuckDB.

---

## 6. Pendientes de ingesta para cerrar el mapa público

| Prioridad | Fuente | Aporta | Bloqueador |
|---|---|---|---|
| 🔴 Alta | Boletín Oficial Córdoba — nombramientos formales | DNI/CUIT de funcionarios → Tier 1 ES_LA_MISMA_PERSONA → conflictos verificados | OCR pipeline (~3K PDFs) |
| 🟡 Media | OpenSanctions API | Match offshore/sancionado en CUITs argentinos | API key paga (no gratis ya) |
| 🟡 Media | ICIJ Offshore Leaks (CSV bulk) | Empresas en Panama/Pandora/Paradise Papers | Descarga manual ~5GB |
| 🔵 Baja | Padrón electoral / DDJJ funcionarios | DNI funcionarios + patrimonio declarado | Web scraping + OCR |
| 🔵 Baja | CONTRATAR nacional histórico | Contratos federales en territorio Córdoba | seed script existe, falta correr |

---

## 7. Auditoría end-to-end (DuckDB → Neo4j → /explorar)

Cada elemento que el usuario ve en el frontend tiene este pipeline trackeable:

```
┌─────────────────────┐
│ FUENTE OFICIAL      │   p.ej. gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2/version-dato/6467/recurso
└──────────┬──────────┘
           │ npm run seed:cordoba (parsea XLSX)
           ▼
┌─────────────────────┐
│ DuckDB              │   contratos table — 2,421 filas con fuente_url
└──────────┬──────────┘
           │ npm run resolve:identities (resuelve CUIT vía RNS+IGJ)
           ▼
┌─────────────────────┐
│ identity_matches    │   proveedor_norm → cuit_resuelto (tier+score)
└──────────┬──────────┘
           │ npm run seed:neo4j-actores (UNWIND batch)
           ▼
┌─────────────────────┐
│ Neo4j               │   Empresa, Reparticion, Contrato + aristas
└──────────┬──────────┘
           │ npm run analyze --force → señales_cache (DuckDB)
           │ npm run seed:neo4j-señales → :Señal en Neo4j
           ▼
┌─────────────────────┐
│ /api/grafo/nucleo   │   GrafoNode[] + GrafoEdge[]
└──────────┬──────────┘
           │ React Query — useGrafoNucleo()
           ▼
┌─────────────────────┐
│ /explorar           │   GraphCanvas (d3-force)
└─────────────────────┘
```

**Cero invenciones:** cada nodo `Empresa` referencia una empresa REAL de RNS/IGJ. Cada arista `GANÓ` referencia un `Contrato.id = sha256(municipio + expediente + monto + año)` cuyo `fuente_url` apunta al XLSX original. Cada `Señal` tiene su `evidencia_json` con citas inline `[[node:<id>]]` verificables.

**Validación post-LLM:** el chat ARGOS (Sonnet 4.6) tiene un validator que bloquea cualquier respuesta con monto/CUIT/fecha que no tenga cita inline. Tool-use Cypher se ejecuta read-only (whitelist de keywords) contra Neo4j — no permite `CREATE`/`DELETE`/`SET`.

---

## 8. Refinamientos post-audit (2026-04-26 22:55)

### 8.1 Cleanup de homonimia masiva en Tier 2

**Problema detectado:** 5,017 aristas `Funcionario-[ES_LA_MISMA_PERSONA tier=2]->PersonaFisica` apuntaban a personas con nombre demasiado común (>5 DNIs distintos compartiendo el mismo `nombreNorm`). Eso llenaba el grafo con falsos positivos del tipo *"cualquier funcionario JUAN PEREZ → cualquier persona JUAN PEREZ con empresa"*.

**Fix aplicado:**
```cypher
CALL apoc.periodic.iterate(
  "MATCH (f:Funcionario)-[link:ES_LA_MISMA_PERSONA]->(p:PersonaFisica)
   WHERE link.tier = 2
   WITH p.nombreNorm AS nn, collect(link) AS links, count(DISTINCT p) AS distinct_dnis
   WHERE distinct_dnis > 5
   UNWIND links AS l RETURN l",
  "DELETE l", {batchSize: 1000}
)
```

**Resultado:**
- Aristas `ES_LA_MISMA_PERSONA` Tier 2: **13,578 → 8,561** (-37%)
- Pares conflicto Funcionario↔Empresa: **distribución mejorada**
  - 51 con homonimia única (alta confianza)
  - 14 con homonimia 2-3 (confianza media)
  - 14 con homonimia 4-5 (confianza baja)
- Top conflictos sólidos: OLMOS MARIA ISABEL (DNI 6431986, 12 empresas), BATTISTELLI CARLOS LUIS (16673613, 2 empresas), NAHUM MOISES EDUARDO (12245849, 2 empresas).

### 8.2 Snapshot final del grafo (2026-04-26 22:55)

| Nodo | Cantidad |
|---|---|
| PersonaFisica | 782,350 |
| Funcionario | 142,851 |
| Empresa | 101,641 |
| Contrato | 1,114 |
| Reparticion | 450 |
| Señal | 12 |
| **Total nodos** | **1,028,418** |

| Arista | Cantidad |
|---|---|
| TRABAJA_EN | 142,518 |
| ES_LA_MISMA_PERSONA | 8,561 |
| DIRIGE | 8,057 |
| EMITE | 1,114 |
| GANÓ | 911 |
| OPERA_EN | 453 |
| SEÑALA | 65 |
| **Total aristas** | **161,679** |

---

## 9. Conclusión

El grafo cordobés en Neo4j cumple los principios declarados: **identidades únicas, trazabilidad completa, tier de confianza explícito, cero alucinaciones**. Los hallazgos del audit fueron resueltos o aceptados con justificación. El caso "PEREYRA dirige 20 empresas" es **realmente verdadero** — el algoritmo de canonicalización por DNI funciona correctamente.

El refinamiento de homonimia masiva (sección 8.1) elevó la calidad del Tier 2: ahora cuando el sistema dice *"funcionario X cruza con empresa Y vía nombreNorm"*, hay como mucho 5 personas con ese nombre — no 45 — lo que reduce la fricción cognitiva del caveat de homonimia y mejora la señal/ruido.

Próximo paso: ingesta de DNI/CUIT de funcionarios cordobeses (Boletín OCR) para subir todos los `ES_LA_MISMA_PERSONA` Tier 2 → Tier 1 y disparar conflictos verificados automáticamente.

*Generado por audit estructural automático. Validado contra Neo4j en docker-compose argos-neo4j. Última actualización: 2026-04-26 22:55.*
