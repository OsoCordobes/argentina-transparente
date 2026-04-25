# ARGOS — Estado Técnico v3.0

> Canal de comunicación entre agentes (Cowork ↔ Claude Code).
> Leer ESTADO antes de tocar cualquier archivo.
>
> Nota: el proyecto se llamó "La Bestia" en sus primeras iteraciones. Renombrado a **ARGOS** en Sprint 0 (v3.0). Los servicios de Railway aún tienen el subdomain `bestia-backend-...` por inercia; renombrarlos requiere acción manual del usuario en Railway.

---

## URLs de Producción

- **Frontend:** https://victorious-luck-production-8d3a.up.railway.app
- **Backend:** https://bestia-backend-3e456938-0eae-49cf-b246-93a05746e060-production.up.railway.app *(rename pendiente en Railway → `argos-backend`)*

---

## Stack

| Capa | Tecnología | Deploy |
|------|-----------|--------|
| Frontend | React 18 + TypeScript + Tailwind + Vite | Railway (victorious-luck) |
| Backend | Node.js + TypeScript + Express | Railway (bestia-backend, rename pendiente) |
| LLM | Claude Sonnet 4 (anthropic SDK) | API call desde backend |
| Datos | gobiernoabierto.cordoba.gob.ar | API pública REST + XLSX |

---

## Arquitectura — Flujo de datos

```
Usuario
  │
  ▼
Landing.tsx ──POST /analizar──► Express (index.ts)
  │                                   │
  │                          getConnector(municipioId)
  │                                   │
  │                     cordobaCapitalConnector
  │                        .getContratos(desde, hasta)
  │                                   │
  │                          fetcher.ts → API REST + timeout
  │                          parser.ts  → XLSX parse
  │                                   │
  │                          calcularSeñales(contratos)
  │                          [8 detectores en signals.ts]
  │                                   │
  │                          enriquecerProveedores() ← afip.ts (best-effort)
  │                                   │
  │                          generarExpediente()
  │                          [Claude Sonnet — prompt periodístico]
  │                                   │
  │◄──── { ok: true, expediente } ────┘
  │
  ▼
sessionStorage.setItem('expediente', ...)
  │
  ▼
Report.tsx — señales expandibles, top proveedores, guía denuncia, botón Compartir
```

---

## Señales Implementadas (8 total)

| Señal | Tipología | Umbral | Severidad |
|-------|-----------|--------|-----------|
| Prórrogas excesivas | `prorrogas_excesivas` | ≥20% del gasto via prórroga | grave si ≥40% |
| Concentración proveedor | `concentracion_proveedor` | ≥35% gasto en 1 proveedor | grave si ≥60% |
| Contrataciones directas | `contrataciones_directas` | ≥5 contratos directos y ≥8% gasto | grave si >20 contratos |
| Monopolio por rubro | `monopolio_rubro` | ≥60% del gasto de un área en 1 proveedor | grave si ≥80% |
| Servicios sin historial | `servicio_sin_historial` | Servicios MO >$50M en ≤2 años | grave |
| Fraccionamiento avanzado | `fraccionamiento_avanzado` | ≥3 contratos directos, total >$20M, ninguno >40% | moderada |
| Gasto fin de ejercicio | `gasto_fin_ejercicio` | ≥30% via prórroga/ampliación en año único | grave si ≥40% |
| Proveedor crónico | `proveedor_cronico` | Presencia en ≥60% años, total >$50M (multi-año) | moderada |

---

## Fuentes de Datos Verificadas

| Fuente | URL | Años | Formato |
|--------|-----|------|---------|
| Córdoba Capital | gobiernoabierto.cordoba.gob.ar/.../compras-y-contrataciones/2 | 2019–2023 | XLSX via API REST |

Dataset IDs: 2019→`2`, 2020→`5977`, 2021→`5978`, 2022→`6466`, 2023→`6467`

---

## Cómo Agregar un Nuevo Municipio

1. Crear `backend/src/connectors/<id>/`
2. `fetcher.ts`: `fetchRawRows(anio) → Record<string, unknown>[]`
3. `parser.ts`: `parseRows(rows, anio) → Contrato[]`
4. `index.ts`: exportar `const xConnector: MunicipioConnector`
5. Registrar en `connectors/interface.ts` → `registry`

---

## Cómo Agregar una Nueva Señal

1. En `backend/src/engine/signals.ts` agregar `export function detectarXxx(contratos): Señal | null`
2. Agregar al array `detectores` en `calcularSeñales()`
3. Testear: `npm run test:signals 2022 2023`

---

## Variables de Entorno

**Backend (`backend/.env`):**
```
ANTHROPIC_API_KEY=sk-ant-...
PORT=3001
```

**Frontend (`frontend/.env.development` / `.env.production`):**
```
VITE_API_URL=http://localhost:3001
VITE_API_URL=https://bestia-backend-...railway.app  # rename pendiente → argos-backend-...
```

---

## Tests Disponibles

| Comando | Desde | Descripción |
|---------|-------|-------------|
| `npm run test:connector` | backend/ | Descarga y parsea 2023 |
| `npm run test:signals 2022 2023` | backend/ | 2 años, señales detectadas |
| `npm run test:signals 2019 2023` | backend/ | 5 años — 1390 contratos, 5 señales |
| `npm run test:e2e` | backend/ | E2E contra localhost:3001 |
| `npx ts-node src/test-production.ts` | backend/ | E2E contra Railway producción |

---

## Roadmap

- Verificación AFIP completa (CUIT + empleadores + incumplimientos)
- Exportar expediente a PDF
- Análisis obra pública via Boletín Oficial
- Cruce nómina municipal vs proveedores
- Modo comparativo entre municipios
- Alertas automáticas cuando se publican nuevos datos

---

## Estructura de Archivos Clave

```
backend/src/
├── index.ts                    ← Express, /health /municipios /analizar
├── routes/analizar.ts          ← Validaciones + pipeline
├── connectors/
│   ├── interface.ts            ← Registry + getConnector()
│   └── cordoba-capital/
│       ├── fetcher.ts          ← API REST + XLSX + timeouts
│       └── parser.ts           ← XLSX → Contrato[]
├── engine/signals.ts           ← 8 detectores de riesgo
├── lib/
│   ├── claude.ts               ← generarExpediente() + prompt
│   └── afip.ts                 ← CUIT lookup best-effort
└── types/index.ts

frontend/src/
├── pages/Landing.tsx           ← Selector + barra de progreso
├── pages/Report.tsx            ← Expediente + ShareButton
└── lib/api.ts                  ← API client + tipos TS
```

---

## LOG

### 2026-03-18 — Claude Code (sesión plan 7h)
- E2E producción PASSED: 122 contratos, 3 señales, Sonnet OK
- +3 señales: `servicio_sin_historial`, `fraccionamiento_avanzado`, `gasto_fin_ejercicio`
- +1 señal multi-año: `proveedor_cronico`
- `afip.ts`: verificación CUIT best-effort vía cuitonline.com
- `claude.ts`: integración AFIP + prompt periodístico con marco legal
- `fetcher.ts`: timeout 30s/API, 60s/XLSX
- Frontend: barra de progreso 6 pasos en Loading
- Frontend: botón "Copiar para compartir" en Report
- Test 5 años 2019–2023: 1390 contratos, 5 señales detectadas


NO BORRAR//INSTRUCCIONES
# Argentina Transparente — Instrucciones fijas

## 1. Objetivo del sistema
Construir una plataforma de análisis de gasto público y generación de expedientes ciudadanos que sea:
- escalable a nivel nacional,
- modular por jurisdicción y dominio,
- auditable,
- reproducible,
- y apta para uso institucional serio.

## 2. Principios obligatorios
- Cero alucinaciones.
- No inventar datos, fuentes, números ni conclusiones.
- Toda salida importante debe ser verificable.
- Toda señal o hallazgo debe poder reconstruirse desde la fuente original.
- Todo cambio relevante debe conservar trazabilidad.
- La simplicidad correcta vence a la complejidad innecesaria.
- No priorizar velocidad si compromete confiabilidad.

## 3. Diseño arquitectónico
- Mantener separación clara entre:
  - ingestión,
  - normalización,
  - modelo de dominio,
  - motor de señales,
  - evaluación,
  - generación de expedientes,
  - API,
  - frontend,
  - observabilidad,
  - y pruebas.
- Evitar acoplamiento entre scraping, lógica de negocio y narrativa.
- Preferir monolito modular bien diseñado antes que microservicios prematuros.
- Toda frontera entre módulos debe ser explícita.

## 4. Reglas para datos
- Toda fuente debe registrarse con:
  - origen,
  - fecha de obtención,
  - método de extracción,
  - formato,
  - y nivel de confianza.
- Ningún reporte puede depender de datos no trazables.
- Las transformaciones deben ser reproducibles.
- Si un dato no puede verificarse, debe marcarse como incierto o descartarse.

## 5. Reglas para hallazgos
- Un hallazgo no se publica si no tiene evidencia suficiente.
- Todo hallazgo debe indicar:
  - fuente,
  - monto,
  - proveedor,
  - periodo,
  - jurisdicción,
  - y método de detección.
- Las señales automáticas deben distinguirse de conclusiones finales.
- El sistema debe separar “señal detectada” de “interpretación investigativa”.

## 6. Reglas para Claude
- Antes de cambiar código, auditar el contexto.
- Si falta control, pedirlo.
- Si conviene pasar a terminal, pedirlo.
- Si conviene usar pruebas o inspección manual, pedirlo.
- Si existe una mejor estrategia de trabajo, proponerla.
- No continuar sobre supuestos sin validación.
- No ignorar decisiones arquitectónicas ya tomadas.
- No hacer refactors grandes sin justificación.

## 7. Criterios de calidad
Antes de considerar una tarea completa:
- debe compilar o pasar checks relevantes,
- debe tener tests cuando aplique,
- debe conservar trazabilidad,
- debe tener comportamiento reproducible,
- y no debe introducir deuda técnica evitable.

## 8. Escala esperada
Este sistema debe diseñarse desde ahora para crecer:
- de una ciudad,
- a múltiples municipios,
- a una provincia,
- y eventualmente a nivel nacional.

Toda decisión técnica debe evaluarse contra esa trayectoria.
