# PLAN DATOS — Arquitectura de la base de datos de ARGOS

> Versión: 1.1 · Fecha: 2026-04-29 · Estado: aprobado, pendiente ejecución
> Spec hermano: `docs/PLAN-UI.md` v1.0 (aprobado, derivó A6/A7/B6 hacia este doc)
> Sustituye: ninguno (es el primer documento canónico de modelo de datos)

Este documento define **cómo ARGOS modela la realidad argentina** en su base de datos. Toda decisión de schema futura se justifica contra este documento. Si una decisión de UI requiere cambiar el modelo de datos, primero se actualiza este documento.

---

## 1. Misión

Trackear **dónde se usa el dinero del contribuyente** en la provincia de Córdoba (provincia + capital) y **detectar si alguien lo desvía**. Para que esa promesa sea verdad y no marketing, el modelo de datos tiene que respetar la realidad jurídica argentina del dinero público y de las personas.

## 2. Reglas duras de identidad

Estas reglas son leyes, no convenciones del proyecto. Violarlas produce datos mal modelados.

| Regla | Detalle |
|---|---|
| **Persona Física (PF)** | Identificada por **DNI** (8 dígitos). Tiene además un **CUIT** = `XX-DDDDDDDD-V` con prefijo {20, 23, 24, 27} derivado del DNI + dígito verificador módulo-11. CUIL == CUIT cuando ambos coexisten. |
| **Persona Jurídica (PJ)** | Identificada por **CUIT** con prefijo {30, 33, 34}. **No tiene DNI.** El número no se deriva de un DNI; lo asigna AFIP al inscribirse. |
| **Extranjeros sin DNI** | Tienen **CDI** (Clave de Identificación). Tratarlos como PF con DNI = NULL pero CDI poblado. |
| **Dígito verificador** | Validable matemáticamente con módulo-11 y pesos `5 4 3 2 7 6 5 4 3 2`. Toda fila con CUIT/DNI inválido va a `quarantine`. |
| **Director ↔ Empresa** | Relación N:M con vigencia temporal. Un director es PF (DNI), una empresa es PJ (CUIT). Nunca confundir el DNI del director con un "DNI de la empresa". |

## 3. Reglas duras del dinero público

Argentina es una federación con **tres niveles** de gobierno con presupuestos y compras separados:

| Nivel | Marco normativo (compras / financiero) | Auditor externo |
|---|---|---|
| Nación | Decreto 1023/2001 + Ley 13.064 (obras) + Ley 24.156 (financiera) | AGN + Comisión Mixta Revisora de Cuentas |
| Provincia (Córdoba) | Ley 10.155 (compras) + Ley 8614 (obras) + Ley 9086 (financiera) | Tribunal de Cuentas Provincial |
| Municipio (Córdoba Capital) | Ordenanza 12.165 | Tribunal de Cuentas Municipal |

**Ciclo presupuestario** (cinco etapas obligatorias por Ley 24.156 y replicado en provincias):

```
Crédito inicial  →  Crédito vigente  →  Compromiso  →  Devengado  →  Pagado
  (sancionado)      (con DNUs/decretos)  (orden firmada)  (deuda nace)  (egreso real)
```

Las irregularidades viven en los **gaps** entre etapas:

- Crédito vigente >> inicial sin DNU justificado → refuerzo opaco
- Compromiso > devengado → orden firmada sin entrega (compromiso ficticio)
- Devengado > pagado → deuda flotante creciente
- Pagado a CUIT no presente en compromiso → pago sin orden previa (gravísimo)

**Ciclo del contrato** (en orden de transparencia decreciente):

```
Pedido → Pliego → Llamado → Apertura → Evaluación →
Adjudicación → Contrato/OC → Ejecución → Recepción → Pago
```

Modalidades: licitación pública > licitación privada > concurso de precios > compulsa abreviada > **contratación directa** (con causales tasadas) > interadministrativa.

## 4. Auditoría del schema actual (db.ts líneas 42-855)

### 4.1 Lo que está bien

- `aportantes_campanas` (l. 821): distingue `cuit` (PJ) y `dni` (PF) en columnas separadas.
- `declaraciones_juradas` (l. 774): tiene `cuit` y `dni` separados, populated post-OCR.
- `igj_entidades` (l. 128) + `igj_autoridades` (l. 145): PJ con CUIT, PF con `numero_documento`. Atómicamente correctos.
- `obras_publicas.adjudicatario_cuit` (l. 582), `transferencias.beneficiario_cuit` (l. 628): correctamente como CUIT.
- `presupuesto_ejecucion` (l. 548): tiene `credito_inicial`, `credito_vigente`, `devengado`, `pagado`.
- Modelo bitemporal con `snapshots`, `t_efectivo`, `t_publicado`, `superseded_by_id`.

### 4.2 Lo que está incompleto

1. **`presupuesto_ejecucion` no tiene `compromiso`.** Falta la etapa donde nace la orden de compra. Sin ella no se puede cruzar Compromiso ↔ Contrato individual.
2. **`contratos` no tiene `proveedor_cuit`.** El CUIT sale del JOIN con `identity_matches` (Tier 1-5). Tier 4-5 tiene CUITs equivocados documentados (NIETO→OTERO, Córdoba→La Rioja). Cada query pasa por filtro borroso.
3. **`contratos` no se ata a `presupuesto_ejecucion`.** Sin `partida_presupuestaria`, `programa_presupuestario`, ni `numero_orden_compra`. La cadena de pago está cortada.
4. **`agentes_publicos.cuit` está NULL en 100% de las filas y no hay columna `dni`.** Toda identidad de funcionario es por nombre, lo que produce homonimia garantizada en muestras grandes.
5. **`directores` (l. 118) tiene solo `nombre_director TEXT`** — sin DNI, sin FK a `igj_autoridades`. Tabla huérfana.

### 4.3 Lo que está estructuralmente mal

6. **No hay tabla maestra `personas_fisicas`.** Una persona aparece como filas independientes en agentes_publicos, igj_autoridades, declaraciones_juradas, aportantes_campanas, directores, sin nada que las una. Esto es la raíz del problema de identidad.
7. **No hay tabla maestra `personas_juridicas` consolidada.** Hay `empresas`, `igj_entidades`, `rns_personas_juridicas` por separado. Una empresa con CUIT X aparece tres veces.
8. **El detector M4.1 confunde "rareza local en IGJ" con "rareza poblacional".** Un apellido puede aparecer 1 vez en IGJ y miles en la población. El factor base rate actual usa el padrón de agentes públicos, lo que es proxy circular.
9. **El detector M4.1 no chequea domicilio fiscal de la PJ.** `rns_personas_juridicas.dom_fiscal_provincia` ya existe pero no se usa. Esto produce el falso positivo *MOSQUERA ↔ Renault Argentina*.
10. **No hay validación de dígito verificador CUIT/DNI en INSERT.** CUITs corruptos del OCR pasan silenciosos.
11. **Falta `cargos_funcionarios` con vigencia.** Hoy `agentes_publicos` agrupa por (jurisdicción, año, mes, cargo, apellido) — no como una "carrera". Hace falta vigencia por cargo.
12. **Falta detector `aportante_de_campana_y_proveedor`.** Es la señal Tier 1 con verificación CUIT directa — la más alta-valor publicable, hoy ausente.

## 5. Principios de diseño

1. **Identidad primero.** Hasta que cada PF tenga DNI canónico y cada PJ tenga CUIT canónico, todo lo demás es probabilidad sobre ruido.
2. **CUIT y DNI son cosas distintas y nunca se mezclan.** PJ no tienen DNI. PF tienen ambos.
3. **Toda señal publicable necesita identidad verificada.** Las que dependen de coincidencia de apellido se quedan en "exploratorio interno" hasta verificación humana.
4. **Las señales de robo viven en intersecciones de tablas, no en una sola.** Un proveedor solo no es señal; un proveedor que aportó a la campaña Y dirige una empresa cuyo director es funcionario que firma sus pagos sí lo es.
5. **Toda fila lleva trazabilidad.** `fuente_url`, `metodo_extraccion`, `nivel_confianza`, `snapshot_id`. Sin excepción.
6. **Tier 4-5 de `identity_matches` no se usa en detectores publicables.** Solo en exploratorio.

## 6. Plan de ejecución (5 fases)

**Estado al 2026-04-29: A1-A7 completos con review #2. B1-B6 completos con review #2. C1-C5 completos con review #2. E1-E4 completos con review #2 (excepto E4 que es docs continuos). Fase D parcial: stubs de Profile + cola E2 hechos; superficies completas pendientes.**

### Fase A — Identidad canónica (1 semana — bloquea todo lo demás) ✅

| Paso | Qué | Por qué | Estado |
|---|---|---|---|
| A1 | Tabla `personas_fisicas {dni PK, cuit, apellido_nombre, apellido_nombre_norm, fuentes_url[], primer_visto, ultimo_visto}` | Entidad canónica para "el funcionario" | ✅ +review #1 #2 (ON CONFLICT, no auto-deriva género) |
| A2 | Tabla `personas_juridicas {cuit PK, razon_social, alias[], dom_fiscal_provincia, dom_fiscal_localidad, fecha_constitucion, tipo_societario, fuentes_url[]}` consolidando `empresas` + `igj_entidades` + `rns_personas_juridicas` | Una empresa = una fila, no tres | ✅ +review #1 #2 (ON CONFLICT) |
| A3 | Validador módulo-11 CUIT/DNI en seeds. Toda fila inválida → `quarantine` con razón | Filtra basura OCR/scraping en origen | ✅ +review #1 (helpers ergonomía: formatDNI, categorizarCUIT, mismoDNI) |
| A4 | Backfill DNI a `agentes_publicos` cruzando con DDJJ → boletín municipal post-OCR → padrón electoral si hay acceso. Cada DNI poblado lleva `fuente_dni_url` | Cierra el agujero del 100% NULL | ✅ Tier 1 estricto (DNI módulo-11 + match único + name normalizado por jurisdicción). `npm run backfill:agentes-dni`. C1/C3 ya levantan dni desde acá automáticamente |
| A5 | Migrar referencias por nombre a FK hacia `personas_fisicas/juridicas` cuando hay match Tier 1-3. Sin DNI/CUIT confirmado → flag `name_only_unmatched=TRUE` | Marca lo verificado vs. lo inferido | ✅ Flag aplicado a `agentes_publicos`, `contratos`, `transferencias`. `npm run flag:name-only` |
| A6 | Tabla `cargos_funcionarios {dni FK, jurisdiccion, cargo, reparticion, vigente_desde, vigente_hasta, facultades, fuente_url}` | Trayectoria explícita en lugar de N filas anuales en `agentes_publicos`. Requerido por UI Profile + bonus por cargo en detector M4.1 | ✅ +review #1 (filtros temporales) #2 (ON CONFLICT) |
| A7 | Columna `estado_verificacion TEXT NOT NULL DEFAULT 'sin_verificar'` en `señales_cache` con CHECK ∈ {verificada, sin_verificar, descartada, bloqueada}. Más `verificado_por TEXT` y `verificado_en TIMESTAMP` | Soporta el badge de verificación universal del UI. Sin esto la disciplina de verificación no es enforceable | ✅ +review #1 (queue + breakdown estado×severidad) #2 (defensa señal inexistente) |

### Fase B — Cadena del dinero canónica (1 semana) ✅

| Paso | Qué | Estado |
|---|---|---|
| B1 | Agregar `compromiso DOUBLE` a `presupuesto_ejecucion`. Re-correr seed dataset 187 | ✅ |
| B2 | Agregar a `contratos`: `partida_presupuestaria`, `programa_presupuestario`, `proveedor_cuit` (Tier 1-3), `proveedor_cuit_inferido` (Tier 4-5 separado), `numero_orden_compra` | ✅ |
| B3 | Tabla `pagos_contrato {id, contrato_hash FK, fecha_pago, monto, fuente_url}` | ✅ +review #1 (fechas primer/último pago en resumen) #2 (filtro por hashes evita escan completo en denuncia-builder) |
| B4 | Vista materializada `cadena_de_pago` joinando partida → compromiso → contrato → devengado → pagos → beneficiario_cuit | ✅ |
| B5 | Endpoint `/api/peso/:partida_id` devuelve la cadena completa | ✅ |
| B6 | Índices Neo4j: por `monto` en aristas `:PROVEE`, por `jerarquia` en propiedad de `:Persona`. Más query helper de adyacencia con cap por relevancia (`MATCH (a)-[*1..N]-(b) RETURN ... ORDER BY relevancia DESC LIMIT 500`) | ✅ Soporta expansión por grados (1°/2°/3°) del UI con cap de 500 nodos sub-segundo |

### Fase C — Detectores rigurosos (1 semana) ✅

| ID | Detector | Cambio | Estado |
|---|---|---|---|
| C1 | Refactor `conflicto_funcionario_proveedor` (M4.1) | (a) filtro domicilio: PJ debe tener `dom_fiscal_provincia = jurisdiccion_funcionario` o actividad documentada en provincia. **Esto mata Renault/MOSQUERA estructuralmente.** (b) base rate poblacional con padrón electoral, no IGJ. (c) **cap score 60** sin DNI confirmado. Score ≥75 requiere DNI verificado vía DDJJ o boletín. | ✅ +review #1 (extrae módulo jurisdicciones) #2 (integra A4 — levanta dni desde agentes_publicos.dni automáticamente) |
| C2 | NUEVO `aportante_de_campana_y_proveedor` | Tier 1 con CUIT verificado entre `aportantes_campanas.cuit` y `personas_juridicas` proveedoras. Señal Tier 1 publicable. | ✅ +review #1 (fix causalidad temporal) #2 (defensa módulo-11 antes de emitir señal) |
| C3 | NUEVO `ddjj_omitida` | Funcionario en cargo del Anexo III Ley 25.188 que no presentó DDJJ ese año. Cruz directa entre `agentes_publicos` y `declaraciones_juradas`. | ✅ +review #1 (cargos extraídos a módulo + word-boundary) #2 (integra A4 + dedupe DDJJ por jurisdicción) |
| C4 | NUEVO `gap_compromiso_pagado` | Partidas con compromiso alto y pagado bajo persistente. Requiere Fase B. | ✅ +review #1 (validación de inputs) |
| C5 | Refactor `concentracion_proveedor` → `concentracion_cuit` | Agrupa por CUIT, no por nombre. Requiere Fase A. | ✅ +review #1 (defensa módulo-11) #2 (fuente_url del CUIT señalado, no del primer contrato) |

### Fase D — UI (definida en `PLAN-UI.md`, 1-2 semanas) — parcial

Stubs Profile (Persona/Empresa) + cola E2 hechos. Superficies completas (Landing, Dinero, Actores, Señales, Caso, Mapa, Metodología, Comparador) pendientes — bloqueadas a brainstorm UI con el usuario para definir alcance, animaciones y módulo de watchlist.

### Fase E — Verificación, denuncia, release (1 semana) ✅

| Paso | Qué | Estado |
|---|---|---|
| E1 | Script `verify-conflicto.ts` toma `senal_id`, busca DDJJ + padrón, compara DNI lado a lado | ✅ +review #1 (parser tolerante multi-tipologia) #2 (filtra DDJJ por jurisdicción — homonimia cross-provincia) |
| E2 | Cola "señales para verificación humana" en UI con workflow | ✅ Backend `/api/cola-verificacion` + frontend `/cola-verificacion` |
| E3 | PDF de denuncia con cadena de evidencia + citas legales (Ley 25.188 art. 13-15, Ley 8835, Decreto 1023/2001) + organismo competente | ✅ +review #1 (paraleliza queries + valida dni del denunciante) #2 (filtra getResumenPagosContratos por hashes) |
| E4 | README publicable + landing "Cómo lo hicimos" + push a `main` | ✅ docs/COMO-LO-HICIMOS.md + README publicable |

## 7. Glosario operativo

| Término | Definición |
|---|---|
| **DNI** | Documento Nacional de Identidad, 8 dígitos. PF únicamente. |
| **CUIT** | Clave Única de Identificación Tributaria. Formato `XX-DDDDDDDD-V`. PF y PJ. |
| **CUIL** | Clave Única de Identificación Laboral. Idéntico a CUIT cuando coexisten en una PF. |
| **CDI** | Clave de Identificación. Para extranjeros sin DNI. |
| **DDJJ / DJP** | Declaración Jurada Patrimonial Integral (Ley 25.188). Anual + alta + baja del cargo. |
| **AGN** | Auditoría General de la Nación. Control externo nacional. |
| **TCP** | Tribunal de Cuentas Provincial (Córdoba). Control externo provincial. |
| **TCM** | Tribunal de Cuentas Municipal (Córdoba Capital). |
| **MPF** | Ministerio Público Fiscal. Recibe denuncias penales. |
| **RUP** | Registro Único de Proveedores (provincial Córdoba). |
| **RNS** | Registro Nacional de Sociedades (datos.jus.gob.ar). |
| **IGJ** | Inspección General de Justicia. Federal/CABA — registra sociedades comerciales. |
| **CNE** | Cámara Nacional Electoral. Publica aportantes a campañas. |
| **Compromiso** | Etapa 3 del ciclo presupuestario. Orden de compra firmada. |
| **Devengado** | Etapa 4. La obligación de pago nació (bien recibido / servicio prestado). |
| **Pagado** | Etapa 5. Egreso efectivo de tesorería. |
| **Tier 1-5** | Niveles de confianza del identity resolver. Tier 1 = CUIT exacto verificado; Tier 5 = sin match. |
