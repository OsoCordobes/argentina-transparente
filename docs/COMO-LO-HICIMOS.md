# Cómo lo hicimos — ARGOS

> Documento publicable. Ambito: cómo se construyó esta herramienta, qué datos usa, qué limitaciones tiene, qué garantías ofrece. Si vas a citar ARGOS o publicar conclusiones derivadas, lee primero este documento.

---

## 1. Misión

ARGOS es una herramienta civic-tech que **rastrea cómo se gasta el dinero público en la provincia de Córdoba** (provincia + capital municipal) y **detecta señales de irregularidad** en ese gasto. Las señales no son acusaciones — son hipótesis con evidencia trazable que un humano debe verificar antes de denunciar.

El nombre alude a Argos Panoptes, el gigante de cien ojos de la mitología griega. La idea: muchos ojos sobre el gasto público producen mejor vigilancia.

---

## 2. Modelo de datos canónico

ARGOS modela la realidad jurídica argentina con tres reglas duras (ver [`PLAN-DATOS.md`](./PLAN-DATOS.md) para la spec completa):

### 2.1 Identidad

| Concepto | Identificador | Notas |
|---|---|---|
| Persona Física (PF) | **DNI** (8 dígitos) y **CUIT** (`XX-DDDDDDDD-V`, prefijo {20, 23, 24, 27}) | CUIT se deriva del DNI con dígito verificador módulo-11 |
| Persona Jurídica (PJ) | **CUIT** únicamente, prefijo {30, 33, 34} | NO tienen DNI |
| Director de empresa | DNI propio (es PF) | NO se confunde con CUIT de la empresa |

Toda fila en ARGOS lleva validación de dígito verificador. CUITs corruptos van a `quarantine`.

### 2.2 Niveles de gobierno

Argentina es federación con tres niveles, cada uno con su régimen propio:

| Nivel | Marco normativo (compras / financiero) | Auditor externo |
|---|---|---|
| Nación | Decreto 1023/2001 + Ley 13.064 + Ley 24.156 | AGN + Comisión Mixta Revisora |
| Provincia (Córdoba) | Ley 10.155 + Ley 8614 + Ley 9086 | Tribunal de Cuentas Provincial |
| Municipio (Córdoba Capital) | Ordenanza 12.165 | Tribunal de Cuentas Municipal |

ARGOS NO mezcla niveles — un contrato municipal y uno provincial se evalúan por umbrales distintos.

### 2.3 Ciclo del dinero (Ley 24.156)

Toda fila de presupuesto pasa por las cinco etapas:

```
Crédito inicial → Crédito vigente → Compromiso → Devengado → Pagado
   (sancionado)    (con DNUs)        (orden       (deuda     (egreso
                                      firmada)    nació)      real)
```

ARGOS detecta los gaps entre etapas:

- Vigente >> inicial sin DNU → refuerzo opaco
- Compromiso > devengado → orden firmada sin entrega (compromiso ficticio)
- Devengado > pagado → deuda flotante con proveedores
- Pagado a CUIT no presente en compromiso → pago sin orden previa (gravísimo)

---

## 3. Fuentes de datos (todas públicas, todas trazables)

Cada fila en ARGOS lleva `fuente_url`, `metodo_extraccion`, `nivel_confianza`. Sin esos tres campos, la fila no entra. Las fuentes principales:

| Fuente | Qué publica | URL canónica | Método |
|---|---|---|---|
| Portal Córdoba Capital | Contratos, sueldos, llamados a licitación 2015-presente | gobiernoabierto.cordoba.gob.ar | API REST + XLSX |
| Portal Córdoba Provincia | Empleados Poder Ejecutivo, presupuesto | datosgestionabierta.cba.gov.ar | CKAN API + CSV |
| IGJ (Inspección General de Justicia) | 420K sociedades + 2.3M directores nacional | datos.jus.gob.ar/dataset/sociedades | CSV bulk |
| RNS (Registro Nacional Sociedades) | Domicilio fiscal de PJ (filtro geográfico) | datos.jus.gob.ar/dataset/registro-nacional-de-sociedades | CKAN API + CSV |
| CNE (Cámara Nacional Electoral) | Aportantes a campañas 2019-presente | aportantes.electoral.gob.ar | API + scraping |
| AFIP padrón empleadores | Empresas activas con CUIT + actividad principal | datos.gob.ar/dataset/sel-padron | CSV |
| Boletín Oficial Córdoba | Decretos, designaciones, adjudicaciones | static01.cordoba.gob.ar/boe | OCR (unpdf + tesseract.js) |
| OpenSanctions / ICIJ | Sanciones internacionales, offshore leaks | opensanctions.org / offshoreleaks.icij.org | API |

Cobertura actual: **Córdoba Capital 2015-2025** completo, **Provincia parcial**, multi-jurisdicción pospuesto.

---

## 4. Cómo se detectan las señales

ARGOS tiene **detectores deterministas** (no LLM). Cada uno emite señales de tipología fija con score 0-95 y severidad ∈ {leve, moderada, grave}.

### 4.1 Detectores publicables (Tier 1 — identidad verificada por CUIT)

| Tipología | Qué detecta | Cap |
|---|---|---|
| `aportante_de_campana_y_proveedor` | Empresa que aportó a campaña + ganó contrato post-aporte. CUIT verificado en ambos lados | 95 |
| `concentracion_cuit` | Un solo CUIT recibe ≥35% del gasto. Inmune a alias y homonimia | 95 |
| `directores_compartidos` | Empresas distintas que comparten directores | 95 |
| `red_de_empresas` | Cluster de empresas vinculadas por directorios | 95 |
| `aparicion_offshore` | Match contra ICIJ Offshore Leaks | 95 |

### 4.2 Detectores administrativos (Tier 2 — irregularidad, no necesariamente corrupción)

| Tipología | Qué detecta | Cap |
|---|---|---|
| `prorrogas_excesivas` | >3 prórrogas sucesivas con mismo proveedor | 80 |
| `contrataciones_directas` | Concentración en modalidad sin licitación | 80 |
| `monopolio_rubro` | Un proveedor en un rubro con sin competidores | 80 |
| `gasto_fin_ejercicio` | Picos de gasto en Q4 (concentracion temporal) | 80 |
| `fraccionamiento_avanzado` | División artificial de contratos para esquivar umbrales | 80 |
| `gap_compromiso_pagado` | Deuda flotante material y persistente | 80 |
| `ddjj_omitida` | Funcionario obligado por Anexo III Ley 25.188 sin DDJJ | 60 (75 con DNI verificado) |

### 4.3 Detectores exploratorios (Tier 3 — match por apellido, requieren verificación)

| Tipología | Qué detecta | Cap |
|---|---|---|
| `conflicto_funcionario_proveedor` | Funcionario con apellido coincidente con director de PJ proveedora — filtro geográfico (la PJ debe operar en la provincia) | 60 sin DNI / 95 con DNI verificado |
| `conflicto_funcionario_multiproveedor` | El mismo cruce sobre ≥2 empresas (patrón sistémico) | 60 / 95 |
| `concentracion_proveedor` | Igual que `concentracion_cuit` pero por nombre normalizado (legacy) | 80 |
| `proveedor_cronico` | Mismo proveedor por ≥5 años consecutivos | 80 |

---

## 5. Por qué confiar (y por qué no)

### Confiar

- **Toda fila tiene `fuente_url`.** Cualquier dato se puede reconstruir desde la fuente oficial.
- **Toda señal tiene evidencia con URLs.** Click → portal de datos abiertos del estado.
- **Identidad por CUIT/DNI con validación módulo-11.** No por "ACME se parece a ACME SA". Los detectores publicables descartan silenciosamente filas con CUIT corrupto (defensa en 3 capas: seed valida al insertar, identity_resolver valida al resolver, detector valida al emitir señal).
- **Filtro geográfico de C1 mata el FP estructural más común** (funcionario provincial cordobés "vinculado" a multinacional CABA). Mapeo jurisdicción↔provincia centralizado en `lib/jurisdicciones.ts` — fuente única de verdad usada por todos los detectores.
- **Causalidad temporal estricta.** En `aportante_de_campana_y_proveedor` (C2), solo se suman contratos post-aporte (`c.anio >= a.anio_electoral`). Una empresa con actividad pre-electoral no infla la suma.
- **Cargos clasificados con word boundaries.** En `ddjj_omitida` y `conflicto_funcionario_proveedor`, el matching de cargos del Anexo III usa `\bPATRON\b` — "Auxiliar administrativo" no se confunde con "MINISTRA" por substring.
- **Cap-60 sin DNI verificado.** Una señal nunca es "grave" por simple coincidencia de apellido.
- **`identity_matches` Tier 4-5 (LLM-ambiguous) NO entra a detectores publicables.** W4 documentó CUITs erróneos en Tier 4.
- **Badge de verificación universal.** Toda señal en cualquier UI lleva uno de cuatro estados: ✓ verificada / ◌ sin verificar / ✗ descartada / ⚠ bloqueada.
- **Inputs validados al ingreso de cada API pública.** Helpers como `encontrarPartidasConGap` rechazan inputs fuera de rango (ej. `minGapPct: 30` en lugar de `0.30`) con mensaje explícito. `armarDenunciaDesdeIds` rechaza DNIs malformados del denunciante antes de generar PDF.

### Por qué no confiar (limitaciones honestas)

- **`agentes_publicos.dni` está NULL en el 100% de las filas hoy.** El backfill desde DDJJ está en plan pero requiere OCR del boletín (W2 infraestructura lista, acceso bloqueado por la fuente). Las señales `conflicto_funcionario_proveedor` se quedan en cap-60 hasta que esto se resuelva.
- **Cobertura desigual entre municipios.** Córdoba Capital es el caso fuerte; otros municipios cordobeses tienen huecos. Comparar entre municipios es engañoso.
- **DDJJ post-OCR pendiente.** 1.348 filas indexadas, 0 con DNI extraído. Detectores `ddjj_omitida` operan en modo "match por nombre" hasta que OCR avance.
- **No cubrimos Nación, CABA, ni otras provincias en la UI.** Los connectors existen pero el universo del UI es Córdoba.
- **No verificamos contra RENAPER.** El padrón electoral / RENAPER son la única fuente que ata DNI ↔ persona viva. ARGOS no tiene acceso. Verificación humana sigue siendo necesaria.
- **No corremos análisis de redes sociales / LinkedIn / enriquecimiento privado.** Solo datos oficiales con URL.

---

## 6. Garantías de proceso

1. **Identidad primero.** No se publica una señal hasta que la identidad de los actores está verificada.
2. **Tier 4-5 nunca entra a detectores publicables.** Está EXPLÍCITO en el código (`WHERE tier <= 3`).
3. **Toda señal lleva su badge de verificación.** Innegociable. Sin badge, no se muestra.
4. **`estado_verificacion` es enforceable.** Helpers TS `marcarSeñalVerificada/Descartada/Bloqueada` exigen actor identificable (`verificadoPor`) y registran timestamp. Sin handle del auditor, no hay cambio de estado.
5. **Cap dinámico de score según verificación.** Sin DNI confirmado → cap 60 (severidad nunca 'grave'). Con DNI confirmado → cap 95.
6. **Filtro geográfico activo.** PJ proveedora con domicilio fiscal en otra provincia → la señal no se emite (mata el FP MOSQUERA↔Renault Argentina).

---

## 7. Para periodistas, fiscales, ciudadanos

Si vas a usar una señal de ARGOS para una nota o una denuncia:

1. **Lee el badge de verificación primero.** Solo "verificada" tiene valor jurídico inmediato.
2. **Click en cada `fuente_url`.** Las URLs son públicas, los datos son del estado.
3. **Si la señal está "sin verificar", pasa por `verify-conflicto.ts`** o equivalente antes de publicar.
4. **El PDF de denuncia** (renderizable desde cualquier caso `/caso/:id`) incluye toda la evidencia + marco legal + organismo competente.
5. **Si encontrás un error**, abrir issue en GitHub. Los datos vienen del estado; ARGOS solo los hace navegables.

Organismos sugeridos por tipo de señal:

| Señal | Denunciar ante |
|---|---|
| Conflicto de intereses (Ley 25.188) | Tribunal de Cuentas Provincial / Municipal + Fiscalía de Estado + Defensoría del Pueblo |
| Aporte de campaña + contrato | Cámara Nacional Electoral + Tribunal de Cuentas + MPF |
| Deuda flotante anómala | Tribunal de Cuentas + Sindicatura |
| Concentración / monopolio | Comisión Nacional de Defensa de la Competencia (CNDC) |
| Sanciones internacionales | UIF + Cancillería |

---

## 8. Stack técnico (para desarrolladores)

Detalle completo en [`README.md`](../README.md) y [`CLAUDE.md`](../CLAUDE.md). Resumen:

- **Backend**: Node.js + TypeScript + Express + DuckDB + Neo4j (opcional)
- **Frontend**: React 18 + TypeScript + Tailwind + Vite + d3-force
- **LLM**: Anthropic SDK (Sonnet 4.6 + Haiku 4.5) con budget guard hard-cap
- **OCR**: unpdf + tesseract.js (zero-cost, sin Anthropic) + LLM como opt-in
- **Tests**: vitest, 480+ tests, suite verde como precondición de merge
- **Open source**: pendiente de validación del beta

---

## 9. Licencia + responsabilidad

- **Código**: pendiente de licenciar (probablemente AGPL o MIT post-beta).
- **Datos**: todos los datos vienen de fuentes oficiales con sus propias licencias (mayoría CC-BY-4.0 vía portales de datos abiertos). ARGOS no reclama derechos sobre los datos.
- **Señales**: las señales generadas por los detectores son **hipótesis con evidencia**, no acusaciones. ARGOS no se responsabiliza por interpretaciones que asuman culpabilidad sin verificación humana de identidad. El badge de verificación es la línea entre "señal exploratoria" y "denuncia respaldada".
- **Limitación de responsabilidad**: el proyecto NO es asesoría legal. Las denuncias deben ser revisadas por abogados antes de presentarse.

---

## 10. Cómo contribuir

Issues, pull requests, sugerencias de fuentes nuevas: GitHub.
Para reportar un dato erróneo: ARGOS solo refleja lo que publica el estado. Si una fila está mal, primero verificar contra la fuente original; si la fuente está mal, denunciarlo a la oficina correspondiente.

Para discutir mejoras de detectores o nuevas tipologías: abrir RFC en `docs/RFC-<numero>.md` y PR contra `claude/chat-first-ui-design-aWg0V`.
