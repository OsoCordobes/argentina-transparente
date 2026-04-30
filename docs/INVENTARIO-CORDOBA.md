# INVENTARIO DE DATOS — ARGOS Córdoba (F1)

Generado: 2026-04-29 — auditoría real contra la DB.

## 1. Estado actual: poblado vs schema sin datos

| Tabla | Filas | Cobertura | Estado |
|---|---:|---|---|
| **agentes_publicos** | 178.356 | cba-provincia=126.884 · cba-capital=51.472 | ✅ poblado completo |
| **igj_autoridades** | 2.290.759 | nacional bulk | ✅ poblado |
| **igj_entidades** | 420.560 | nacional bulk | ✅ poblado |
| **rns_personas_juridicas** | 196.127 | nacional | ✅ poblado |
| **cargos_funcionarios** | 167.608 | derivados de A6 | ✅ poblado |
| **presupuesto_ejecucion** | 4.035 | cba-capital=4.035 | ✅ poblado capital |
| **licitaciones_llamado** | 2.341 | histórico | ✅ poblado |
| **contratos** | 1.393 | cba-capital=1.382 · upc=11 | ✅ poblado capital |
| **declaraciones_juradas** | 1.348 | cba-capital=1.348 | ✅ poblado capital |
| **identity_matches** | 1.306 | resolver | ✅ poblado |
| **empresas** | 119 | legacy | ✅ poblado |
| **empresas_padron_provincial** | 119 | provincia | ✅ poblado |
| **opensanctions_matches** | 119 | nacional | ✅ poblado |
| **señales_cache** | 12 | capital | ✅ poblado mínimo |
| **fuentes_publicas_catalogo** | 55 | meta | ✅ catálogo |
| **entes_estatales_cordoba** | 10 | meta | ✅ catálogo |
| `personas_fisicas` | 1 | testdata | 🔴 **NO POBLADO** |
| `personas_juridicas` | 0 | — | 🔴 **NO POBLADO** |
| `pagos_contrato` | 0 | — | 🔴 **NO POBLADO** |
| `obras_publicas` | 0 | — | 🔴 **NO POBLADO** |
| `transferencias` | 0 | — | 🔴 **NO POBLADO** |
| `aportantes_campanas` | 0 | — | 🔴 **NO POBLADO** |
| `auditorias_tribunal_cuentas` | 0 | — | 🔴 **NO POBLADO** |
| `boe_cba_pdfs` | 0 | — | 🔴 **NO POBLADO** |
| `boletin_extractos` | 1 | testdata | 🔴 **NO POBLADO** |
| `boletin_actos` | 1 | testdata | 🔴 **NO POBLADO** |
| `proveedores_padron` | 0 | — | 🔴 **NO POBLADO** |
| `icij_entidades` | 0 | — | 🔴 **NO POBLADO** |
| `directores` | 0 | — | 🔴 **NO POBLADO** (legacy, OK) |

## 2. Gap crítico: tablas canónicas vacías

**Lo más urgente:** las tablas maestras `personas_fisicas` y `personas_juridicas` (PLAN-DATOS A1/A2) están vacías. Toda la arquitectura de identidad asume que existen pobladas — los detectores Tier 1, el módulo Profile, la cola de verificación, todos asumen que las tablas tienen datos.

**Causa raíz**: A1 y A2 son tablas DE DESTINO. El paso A4 (backfill) no las popula desde agentes_publicos / igj_autoridades — solo backfilea agentes_publicos.dni. Falta el script que **proyecta** desde agentes_publicos / igj_autoridades / DDJJ → personas_fisicas, y desde empresas / igj_entidades / rns → personas_juridicas.

## 3. Plan de carga ordenado por impacto

### Round 1 — **Identidad canónica** (desbloquea todo lo demás)

| Paso | Acción | Fuente |
|---|---|---|
| R1.1 | Script `populate-personas-fisicas.ts`: proyectar PF desde DDJJ + agentes con DNI + igj_autoridades. Insertar con `upsertPersonaFisica`. | declaraciones_juradas + agentes_publicos.dni (post-A4) + igj_autoridades.numero_documento |
| R1.2 | Script `populate-personas-juridicas.ts`: proyectar PJ desde igj_entidades + rns_personas_juridicas + empresas legacy. Insertar con `upsertPersonaJuridica`. | igj_entidades + rns_personas_juridicas + empresas |
| R1.3 | Correr A4 backfill (`npm run backfill:agentes-dni -- --apply`) y A5 flag (`npm run flag:name-only`) | DDJJ post-OCR |

### Round 2 — **Datos públicos cargables con seeds existentes**

| Paso | Acción | Estado |
|---|---|---|
| R2.1 | `npm run seed:aportantes-cne` — datos electorales | seed existe, nunca corrió |
| R2.2 | `npm run seed:boletin-cordoba` + boletin-ocr | seed existe, parcial |
| R2.3 | `npm run seed:boe-cba` — Boletín Oficial Provincia | seed existe |
| R2.4 | `npm run seed:cordoba-historico` — boletín 2013-2018 LLM | seed existe, pesado |
| R2.5 | `npm run seed:icij` — Offshore Leaks | seed existe |
| R2.6 | `npm run seed:proveedores-padron` — AFIP proveedores | seed existe |

### Round 3 — **Datos provinciales** (expandir cobertura)

| Paso | Acción | Estado |
|---|---|---|
| R3.1 | Verificar/correr `seed:cordoba-provincia` para contratos provinciales | seed existe |
| R3.2 | Presupuesto provincial — buscar dataset si existe (datos.cba.gov.ar) | NUEVO |
| R3.3 | DDJJ provinciales — verificar si están públicas | NUEVO |
| R3.4 | Sueldos provinciales — ya cargados parcial en agentes_publicos | ✅ parcial |

### Round 4 — **Datos derivados de los ya cargados**

| Paso | Acción |
|---|---|
| R4.1 | `pagos_contrato`: extraer de portal de pagos público si existe; alternativa: derivar de presupuesto_ejecucion.pagado por proveedor |
| R4.2 | `obras_publicas`: cargar desde dataset 262 nación + dataset provincial |
| R4.3 | `transferencias`: subsidios/becas desde portal transparencia |
| R4.4 | `auditorias_tribunal_cuentas`: scraping de tribunaldecuentas.cba.gov.ar |

### Round 5 — **Conectividad lógica**

| Paso | Acción |
|---|---|
| R5.1 | Vista `v_actor_universo`: union de personas_fisicas + personas_juridicas con métricas precomputadas |
| R5.2 | Vista `v_persona_to_empresas`: PF → empresas que dirige (FK personas_fisicas.dni → igj_autoridades.numero_documento → igj_entidades.numero_correlativo → personas_juridicas.cuit) |
| R5.3 | Vista `v_actor_actividad`: timeline de cada actor (cargos + DDJJ + aportes + contratos + señales) ordenada cronológicamente |

### Round 6 — **Exposición UI**

| Paso | Acción |
|---|---|
| R6.1 | Profile: hidratar desde backend real (no fixtures), reemplazando `getPersonaFisicaStub` por `GET /api/persona/:dni` que devuelve PF + sus relaciones |
| R6.2 | Idem `GET /api/empresa/:cuit` |
| R6.3 | /actores: devolver universos pf+pj reales con count |
| R6.4 | /senales: incluir entidades_cuit hidratadas con razón social |
| R6.5 | /mapa: cargar desde Neo4j real con vínculos PF↔PJ↔contrato↔señal |

## 4. Goal statement (para tracking)

> "Provincia y capital de Córdoba han sido correctamente y completamente
> mapeados, su información correctamente estructurada y lógicamente conectada.
> Si algo existe en la vida real en el sistema público, se puede encontrar en
> ARGOS, y la información es correctamente expuesta en la herramienta."

**Criterios de cierre**:
- [ ] personas_fisicas > 100k filas
- [ ] personas_juridicas > 50k filas
- [ ] aportantes_campanas > 0
- [ ] boletines (extractos + actos + boe-cba) > 0 con data real
- [ ] obras_publicas + transferencias > 0
- [ ] señales_cache > 100 (corrida real de detectores post-population)
- [ ] cobertura provincial: contratos > 0 + presupuesto > 0 + DDJJ > 0
- [ ] vistas v_actor_universo + v_actor_actividad creadas
- [ ] Profile real (no stubs) accesible para cualquier DNI/CUIT en personas_fisicas/juridicas
- [ ] /actores devuelve universos completos
- [ ] Tests automatizados sobre los flujos críticos (PDF denuncia, watchlist alertas)
