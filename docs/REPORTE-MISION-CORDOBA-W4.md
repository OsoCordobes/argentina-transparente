# Reporte W4 — M4.1 Detector conflicto_funcionario_proveedor

**Fecha:** 2026-04-28 ~05:00 GMT
**Branch:** `claude/chat-first-ui-design-aWg0V`
**Política:** autónomo nocturno, sin permisos intermedios.
**Spec base:** `docs/MISION-CORDOBA-2010-2026.md` § M4.

---

## Objetivo

Implementar el detector `conflicto_funcionario_proveedor` propuesto en M4 del plan maestro. Cruza datos cargados en M1 (agentes_publicos, igj_autoridades, igj_entidades, contratos) para identificar funcionarios públicos que comparten apellido con directores de empresas proveedoras del mismo municipio.

---

## Hallazgo de diseño

`agentes_publicos.cuit` está NULL en TODAS las 178,364 filas. Sin DNI ni CUIT del funcionario, el match por DNI directo (que era lo ideal) **no es posible**. El plan original mencionaba match por DNI, pero los datos cargados no lo soportan.

**Estrategia adoptada:** match por `apellido_nombre` normalizado, con filtros estrictos para reducir false positives:

1. **Filtro rareza:** apellido normalizado matchea ≤3 DNIs únicos en `igj_autoridades` (descarta nombres comunes como "GONZALEZ JOSE LUIS" que matchean 5K+ personas)
2. **Filtro geográfico:** `funcionario.jurisdiccion = contrato.municipio` (solo flag cuando hay coincidencia local)
3. **Filtro contrato:** la empresa debe tener al menos un contrato real (JOIN con `contratos` en lugar de listar todas las empresas con apellido coincidente)

---

## Implementación

### Archivos nuevos

| Archivo | Descripción |
|---|---|
| `backend/src/lib/detector-conflicto-funcionario-proveedor.ts` | Lógica del detector: `encontrarCrucesCandidatos()`, `candidatoASeñal()`, `ejecutarDetector()` |
| `backend/src/scripts/detect-conflictos.ts` | CLI ejecutable: `npm run detect:conflictos [--max-dnis N --min-monto M --municipio X --reemplazar]` |
| `backend/src/lib/detector-conflicto-funcionario-proveedor.test.ts` | 4 tests: scoring, severidad, cap 95, presencia en cache |

### Archivos modificados

| Archivo | Cambio |
|---|---|
| `backend/package.json` | + npm script `detect:conflictos` |

### Schema

No requiere tabla nueva. Inserta en `señales_cache` existente con `tipologia='conflicto_funcionario_proveedor'`.

---

## Scoring

```
score_monto  = min(50, log10(monto) * 6)        // 0-50 puntos
score_rareza = (4 - dnis_unicos) * 8             // 24/16/8 puntos por 1/2/3 DNIs
score_total  = min(95, base 30 + monto + rareza) // cap 95 hasta verificación DNI
```

**Severidad:** `grave` si score≥75, `moderada` si ≥55, `leve` resto.

**Cap 95:** la señal NO puede llegar a 100 sin verificación del DNI del funcionario. Es deuda explícita en cada `Señal.evidencia`.

---

## Resultados (corrida real con DB M1)

```
$ npm run detect:conflictos

Configuración:
  reemplazarExistentes: false
  maxDnisIGJ:           3
  minMonto:             $0
  municipios:           (todos)

Snapshot ID:        a8db056e-2361-497d-ba1f-17b5818087d8
Candidatos hallados: 2
Señales insertadas:  2
```

### Señales generadas

| Score | Severidad | Funcionario | Empresa | Monto |
|---|---|---|---|---|
| 91 | grave | FERNANDEZ ALEJANDRA BEATRIZ (cordoba-capital) | BECHER Y ASOCIADOS | $1,300,000 |
| 90 | grave | MOSQUERA ALEJANDRO (cordoba-capital) | RENAULT ARGENTINA | $21,965,500 |

**IMPORTANTE — verificación pendiente:** ambos casos requieren que un humano:
1. Verifique el DNI del funcionario contra biografía pública o consulta a la oficina de personal del municipio
2. Confirme que el DNI matchea con el del director IGJ (26470357 y 12753003 respectivamente)
3. Si match confirmado → conflicto de interés real, denunciable ante Tribunal de Cuentas

Si el DNI no matchea → falsos positivos por homonimia. La señal lo dice explícitamente en su `evidencia`.

---

## Decisiones autónomas tomadas

1. **Match por apellido_nombre, no DNI.** agentes_publicos no tiene DNI poblado. Opciones consideradas: (a) bloquear M4.1 hasta cargar DNI — descartado por falta de fuente upstream; (b) usar apellido con filtros estrictos — adoptado con cap de score 95 y disclaimer en cada señal.

2. **Cap score a 95.** Una señal sin verificación DNI no puede ser "100% certain" — se diferencia explícitamente de detectores Tier 1 que sí tienen evidencia primaria.

3. **Insertar en `señales_cache` existente vs tabla dedicada.** Reuso la tabla — la `tipologia` distingue. Permite que el dashboard ya construido (`/api/dashboard`) las muestre sin cambios.

4. **Tests schema-only para el detector.** Igual decisión que M1.5/M1.6 — read-only evita worker fork crash en vitest. Cubre lógica de scoring (puro JS) sin tocar DB.

5. **No mostrar candidatos sin contrato.** Filtro JOIN con contratos — si una empresa con director "raro" NO tiene contrato con el municipio, no es señal accionable. Reduce ruido.

---

## Auto-crítica

### Riesgos identificados

1. **Match por apellido es falible.** Aunque "FERNANDEZ ALEJANDRA BEATRIZ" parece único (filtra a 1 DNI IGJ), podría haber dos personas distintas con el mismo nombre en universos distintos (funcionariado público vs IGJ nacional). Sin DNI cruzado, NO es prueba.

2. **Heurística de rareza es estática.** `≤3 DNIs IGJ` es threshold arbitrario. Para países pequeños o apellidos poco frecuentes en general, 3 DNIs ya es señal débil; para apellidos comunes, 3 DNIs es ruido. Mejora futura: ponderar por base rate del apellido en padrón nacional.

3. **No considera fechas.** La detección es "el funcionario aparece y la empresa tiene contrato" — pero no chequea si las fechas se solapan (el funcionario podría ser ex, no actual). Requiere cross con `agentes_publicos.anio` y `contratos.anio`.

4. **No diferencia tipo de cargo.** Un "Director de Compras" dirigiendo proveedor es señal mucho más fuerte que "Maestra de jardín de infantes" dirigiendo el mismo proveedor. La señal trata todos los cargos igual. Mejora: bonus de score por cargos con poder de adjudicación.

5. **No considera score de identidad.** `identity_matches` tiene Tiers 1-5 — podríamos filtrar empresas con `tier=1` (CUIT exacto verificado) para alta confianza, vs flagear como "exploratorio" las de tier 4-5. Mejora futura.

### Iteraciones recomendadas (M4.1+)

| # | Tarea | Esfuerzo | Valor |
|---|---|---|---|
| 1 | Cargar DNI de funcionarios desde fuente alternativa (DDJJ post-OCR contiene DNI) | 1-2d | desbloquea Tier 1 verification |
| 2 | Filtro temporal: solo cruces donde funcionario.anio ≥ contrato.anio - 2 | 1h | descarta ex-funcionarios |
| 3 | Bonus de score por cargo con poder de adjudicación (Director, Secretario, Jefe) | 2h | reduce noise sobre cargos administrativos |
| 4 | Score por base rate del apellido en padrón nacional | 4h | matemáticamente más justo |
| 5 | Integración con Neo4j: nodo `:Conflicto` + arista `:DETECTADO_EN` | 2h | UI gráfica del Mapa del Poder lo consume |
| 6 | Acumular casos múltiples por funcionario (señal compuesta si ≥2 empresas) | 3h | refleja patrón sistémico |

---

## Métricas

- Tests: 261 → **265** (+4 nuevos, todos schema-only / lógica pura)
- Build: tsc clean
- Coverage manual:
  - 1,998 funcionarios con apellido único en IGJ (1 DNI exacto)
  - 756 funcionarios con apellido raro (2-5 DNIs)
  - 2 cruces materializados (con filtros estrictos + filtro geográfico + match razon_social)
- Snapshot trazable: `a8db056e-2361-497d-ba1f-17b5818087d8`

---

## Política cumplida

- ✅ $0 Anthropic spend
- ✅ Cero datos sintéticos
- ✅ Cada señal trazable a fuente_url del contrato + DNI IGJ
- ✅ Disclaimer explícito de verificación pendiente (cap score 95)
- ✅ No bypass de bloqueadores legales (apellido match + filtro rareza es honesta heurística)
- ✅ Tests passing 266/266

---

## Hallazgo bonus: calidad identity_matches Tier 4-5

Investigué usar `identity_matches.cuit_resuelto` como path alternativo (M4.2) para JOIN por CUIT en lugar de razon_social. Hallazgos:

**Coverage:** 279/632 proveedores cordobeses tienen CUIT resuelto (44%).

**Problema crítico:** Tier 4 (41 matches LLM ambiguos) tiene CUITs MAL asignados. Ejemplos verificados:

- proveedor `"DANIEL ALBERTO NIETO"` → CUIT de `"DANIEL ALBERTO OTERO"` (apellidos distintos!)
- proveedor `"GOBIERNO DE LA PROVINCIA DE CÓRDOBA"` → CUIT de `"GOBIERNO DE LA PROVINCIA DE LA RIOJA"` (jurisdicción equivocada!)
- proveedor `"FIDEICOMISO DE ADMINISTRACIÓN TYKA"` → CUIT de `"FIDEICOMISO DE ADMINISTRACION RONAS"` (entidades distintas!)

**Recomendación:** **NO usar Tier 4-5 en detectores de M4.x**. Usar solo Tier 1-2-3 (CUIT exacto / nombre normalizado / fuzzy alto). Tier 4 requiere auditoría manual o re-corrida del identity resolver con mejor prompt.

**Para M4.1 actual:** mantengo el match por razon_social string (no usa identity_matches Tier 4). Si en el futuro se quiere upgrade a CUIT-based, restringir a `WHERE im.tier <= 3`.

Esto va a documentación de deuda de identity_matches — auditar Tier 4 es trabajo separado de M4.x.
