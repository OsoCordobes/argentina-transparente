# Epic: Fase 2 — Signal Engine Rebuild

**Status:** open
**Priority:** P1 (depends on Fase 1 data layer)

## Context

The legacy signal engine in `backend/src/engine/signals.ts` has 14 detectors operating on `Contrato[]`.
The new engine in `packages/engine/` defines a plugin architecture (`SignalDetector`, `GraphContext`, `runEngine`)
that operates over the full entity graph (companies, directors, contracts, donations, cargos).

## Objective

Migrate all 14 existing signals + add 6 new ones, each as independent files with unit tests.

## Architecture

Each signal = one file at `packages/engine/src/signals/{signal_id}.ts` implementing `SignalDetector`.
`GraphContext` is provided by `apps/api/src/graph-context.ts` (DuckDB + Neo4j queries).

## Tasks

### Task 1: GraphContext implementation
**File:** `apps/api/src/graph-context.ts`

Implement `GraphContext` interface from `@argos/engine`. Wire DuckDB queries for contratos/empresas/personas
and Neo4j queries for directoresCompartidos/redDeEmpresas.

### Tasks 2-15: Migrate 14 existing signals

For each signal, create `packages/engine/src/signals/{id}.ts` implementing `SignalDetector`.
Reference logic from `backend/src/engine/signals.ts`.
Each must have `packages/engine/src/__tests__/{id}.test.ts` with ≥20 test cases (positive + negative + edge cases).

Signals to migrate:
- `prorrogas_excesivas` — ≥20% spend via prórroga
- `concentracion_proveedor` — ≥35% spend on 1 provider
- `contrataciones_directas` — ≥5 direct + ≥8% spend
- `monopolio_rubro` — ≥60% area spend on 1 provider
- `servicio_sin_historial` — services >$50M in ≤2 years
- `fraccionamiento_avanzado` — ≥3 direct contracts totalling >$20M, none >40%
- `gasto_fin_ejercicio` — ≥30% via prorroga/ampliacion in single year
- `proveedor_cronico` — ≥60% of years present, total >$50M
- `rotacion_coordinada` — providers rotate contracts across orgs
- `adenda_postajudicacion` — adendas after award
- `empresa_nueva` — company <2 years old wins large contract
- `empresa_sin_empleados` — zero-employee company wins contract
- `directores_compartidos` — directors shared across competing providers (Neo4j)
- `red_de_empresas` — network of companies with shared directors (Neo4j)

### Tasks 16-21: New signals

- `puerta_giratoria` — official joins/leaves contractor within 12 months of contract award
- `donante_contratista` — CNE donor wins contracts from same jurisdiction
- `nepotismo` — municipal employee shares surname with provider director
- `sobreprecio` — unit price >2x median for same type/year (requires `precio_unitario` field)
- `obras_abandonadas` — contracts with no completion in expected timeframe
- `aceleracion_pre_electoral` — spike in spend in 90-day window before elections

### Task 22: Meta-signals

**File:** `packages/engine/src/meta-signals.ts`

Define at minimum:
- `empresa_fantasma`: empresa_nueva + empresa_sin_empleados + contratacion_directa
- `captura_politica`: donante_contratista + concentracion_proveedor
- `red_coordinada`: red_de_empresas + rotacion_coordinada + fraccionamiento_avanzado

### Task 23: Fixtures for integration tests

**File:** `packages/engine/src/__fixtures__/`

Create DuckDB fixture datasets derived from public Vialidad/Cuadernos pattern (synthetic data, not real).
Use for meta-signal integration tests.

## Acceptance Criteria

- [ ] All 20 signals implemented with ≥20 unit tests each
- [ ] 3 meta-signals implemented with integration tests
- [ ] `runEngine()` executes all detectors on a GraphContext, returns sorted Hallazgo[]
- [ ] No signal crashes the pipeline (caught internally, logged)
- [ ] All new signals cite `legal.articulos` from CP or Ley 25.188
