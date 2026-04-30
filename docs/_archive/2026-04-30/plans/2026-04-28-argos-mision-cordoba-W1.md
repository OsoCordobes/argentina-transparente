# ARGOS Misión Córdoba — W1 Foundation Repair

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Reparar fundaciones técnicas (DuckDB schema versioning + bitemporal columns + Neo4j root nodes :Estado/:Programa + parser presupuesto) y dejar listo el modelo de datos sobre el que construyen W2-W8.

**Architecture:** DuckDB sigue como source-of-truth tabular; Neo4j sigue como source-of-truth del grafo navegable. Agregamos versionado bitemporal append-only (snapshots+quarantine+identidad_candidates) en DuckDB y nodos raíz Estado/Programa en Neo4j. Refactor incremental: solo el connector cordoba-capital migra a IngestReport en W1; el resto migra en W3.

**Tech Stack:** TypeScript 5.3, DuckDB 1.4.4, Neo4j 6.0 (driver), zod 4.3, vitest 4.1, ts-node 10.9.

**Spec base:** `~/.claude/plans/actua-como-un-ingeniero-joyful-patterson.md` secciones 1-3, 5, 10 (W1).

**Estado actual verificado (2026-04-28):**
- `presupuesto_ejecucion`: **0 filas** (parser tiene `parsearTablaConHeaderDetectable` pero sigue insertando 0)
- `contratos`: 2,421 filas (Capital 2015–2025, gap pre-2015)
- Neo4j: 1.028M nodos, sin `:Estado` ni `:Programa`, aristas viejas (`:EMITE`)
- 0 tablas `snapshots`, `quarantine`, `identidad_candidates`, `entes_estatales_cordoba`

---

## File Structure

### Crear

| Archivo | Responsabilidad |
|---|---|
| `backend/src/types/ingest.ts` | Interfaces `IngestOpts`, `IngestReport`, `IngestStatus`, `QuarantineRow` |
| `backend/src/lib/snapshots.ts` | Helpers `crearSnapshot`, `getSnapshot`, `listSnapshots`, `marcarSupersededBy` |
| `backend/src/lib/quarantine.ts` | Helpers `enquarantine`, `getQuarantine`, `liberarQuarantine` |
| `backend/src/lib/identidad-candidates.ts` | CRUD de tabla `identidad_candidates` |
| `backend/src/scripts/migrate-bitemporal.ts` | Migración idempotente: agrega `t_efectivo, t_publicado, snapshot_id` a tablas core |
| `backend/src/scripts/migrate-neo4j-estados.ts` | Crea nodos `:Estado` Nación/Provincia/Capital + migra Reparticion → CONTIENE |
| `backend/src/scripts/inspect-presupuesto-debug.ts` | Diagnóstico paso a paso del parser dataset 14/65/12 |
| `backend/src/lib/snapshots.test.ts` | Tests vitest |
| `backend/src/lib/quarantine.test.ts` | Tests vitest |
| `backend/src/lib/identidad-candidates.test.ts` | Tests vitest |

### Modificar

| Archivo | Cambio |
|---|---|
| `backend/src/lib/db.ts` | + tablas `snapshots`, `quarantine`, `identidad_candidates`, `entes_estatales_cordoba`; + columnas bitemporal en `contratos`, `agentes_publicos`, `presupuesto_ejecucion`, `igj_entidades`, `igj_autoridades`, `licitaciones_llamado`, `obras_publicas` |
| `backend/src/lib/graph.ts` | + funciones `upsertEstado`, `upsertPrograma`, `upsertContieneReparticion`, `upsertTransferencia`, `upsertRecibePresupuesto`, `upsertOcupaCargo`, `upsertPagaNomina`; + constraints/indices nuevos |
| `backend/src/scripts/seed-cordoba-presupuesto.ts` | Diagnóstico inline + fix de regex columnas (si hace falta tras inspect) |
| `backend/src/connectors/cordoba-capital/index.ts` | + método `ingest(opts: IngestOpts): Promise<IngestReport>` |
| `backend/src/scripts/seed-cordoba.ts` | Refactor para usar `cordobaCapitalConnector.ingest()` y emitir IngestReport |
| `backend/src/types/index.ts` | Re-export desde `./ingest` |
| `backend/package.json` | Agregar scripts: `migrate:bitemporal`, `migrate:neo4j-estados`, `inspect:presupuesto` |

---

## Task 1: Tipos `IngestReport` + tabla `snapshots`

**Files:**
- Create: `backend/src/types/ingest.ts`
- Create: `backend/src/lib/snapshots.ts`
- Create: `backend/src/lib/snapshots.test.ts`
- Modify: `backend/src/lib/db.ts:200` (después de tabla `fuentes_datos`)
- Modify: `backend/src/types/index.ts` (re-export)

- [ ] **Step 1: Crear tipos `IngestOpts` y `IngestReport`**

Crear archivo `backend/src/types/ingest.ts`:

```ts
// Tipos compartidos por todos los seeds para reportar resultado.
// Los seeds heredan IngestReport y lo emiten al stdout + lo registran en
// tabla `snapshots`.

export interface IngestOpts {
  /** Año mínimo a procesar (inclusivo). */
  desde?: number
  /** Año máximo a procesar (inclusivo). Default: año actual. */
  hasta?: number
  /** Si true, ignora hash de snapshot previo y re-procesa. */
  force?: boolean
  /** Si true, ejecuta sin escribir a la DB (útil para testing/debug). */
  dryRun?: boolean
}

export type IngestStatus = 'success' | 'partial' | 'failed' | 'skipped_unchanged'

export interface IngestReport {
  /** UUID generado al inicio de la corrida. */
  snapshotId: string
  /** ID del seed que generó el snapshot. ej. 'seed:cordoba'. */
  seedId: string
  /** URL del archivo origen descargado. */
  fuenteUrl: string
  /** Timestamp ISO de inicio de la corrida. */
  fechaCorrida: string
  /** sha256 del payload origen. */
  hashArchivo: string
  filasLeidas: number
  filasInsertadas: number
  filasQuarantined: number
  errores: { fila: number; motivo: string }[]
  duracionMs: number
  status: IngestStatus
}

export interface QuarantineRow {
  id: string                  // UUID
  snapshotId: string          // FK
  tablaDestino: string        // 'contratos', 'agentes_publicos', etc.
  motivo: string              // 'schema_validation' | 'integrity' | 'sanity_check'
  detalle: string             // JSON con info diagnóstica
  filaJson: string            // JSON serializado del row original
  creadoEn: string            // ISO timestamp
  resueltoEn?: string | null
  resolucion?: string | null  // 'inserted' | 'discarded' | 'pending'
}
```

- [ ] **Step 2: Re-export desde types/index.ts**

Agregar al final de `backend/src/types/index.ts`:

```ts
export type { IngestOpts, IngestReport, IngestStatus, QuarantineRow } from './ingest'
```

- [ ] **Step 3: Escribir el test para `snapshots.ts`**

Crear `backend/src/lib/snapshots.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, dbRun, dbAll } from './db'
import { crearSnapshot, getSnapshot, listSnapshots, marcarSupersededBy } from './snapshots'

describe('snapshots', () => {
  beforeEach(async () => {
    await initDb()
    await dbRun(`DELETE FROM snapshots`)
  })

  it('crearSnapshot persiste un row con id estable', async () => {
    const snap = await crearSnapshot({
      seedId: 'test:dummy',
      fuenteUrl: 'https://ejemplo/dato.xlsx',
      hashArchivo: 'a'.repeat(64),
      filasLeidas: 100,
    })
    expect(snap.id).toBeDefined()
    expect(snap.id.length).toBeGreaterThan(8)

    const fetched = await getSnapshot(snap.id)
    expect(fetched).not.toBeNull()
    expect(fetched!.fuenteUrl).toBe('https://ejemplo/dato.xlsx')
    expect(fetched!.filasLeidas).toBe(100)
  })

  it('listSnapshots devuelve por seedId ordenado por fechaCorrida desc', async () => {
    await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u1', hashArchivo: 'h1', filasLeidas: 1 })
    await new Promise(r => setTimeout(r, 10))
    const second = await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u2', hashArchivo: 'h2', filasLeidas: 2 })

    const list = await listSnapshots('test:a')
    expect(list.length).toBe(2)
    expect(list[0].id).toBe(second.id)  // más reciente primero
  })

  it('marcarSupersededBy linkea uno con el otro', async () => {
    const old = await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u', hashArchivo: 'h1', filasLeidas: 1 })
    const next = await crearSnapshot({ seedId: 'test:a', fuenteUrl: 'u', hashArchivo: 'h2', filasLeidas: 1 })

    await marcarSupersededBy(old.id, next.id)
    const refreshed = await getSnapshot(old.id)
    expect(refreshed!.supersededBy).toBe(next.id)
  })
})
```

- [ ] **Step 4: Run test — debería FALLAR (snapshots.ts no existe)**

Run: `cd backend && npx vitest run src/lib/snapshots.test.ts`
Expected: FAIL — "Cannot find module './snapshots'"

- [ ] **Step 5: Crear tabla `snapshots` en `db.ts`**

Buscar línea ~191 de `backend/src/lib/db.ts` donde termina la tabla `fuentes_datos`. Después de su cierre `)`, agregar:

```ts
  // ─── Snapshots — versionado bitemporal de ingestas (W1) ───────────────────
  // Cada corrida de seed crea un snapshot. Datos cargados llevan snapshot_id
  // para trazabilidad. Cuando una nueva corrida trae los mismos datos con
  // valores diferentes (corrección oficial), se marca superseded_by.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS snapshots (
      id              TEXT PRIMARY KEY,
      seed_id         TEXT NOT NULL,
      fuente_url      TEXT NOT NULL,
      fecha_corrida   TEXT NOT NULL,
      hash_archivo    TEXT NOT NULL,
      filas_leidas    INTEGER NOT NULL DEFAULT 0,
      filas_insertadas INTEGER NOT NULL DEFAULT 0,
      filas_quarantined INTEGER NOT NULL DEFAULT 0,
      duracion_ms     INTEGER,
      status          TEXT NOT NULL DEFAULT 'success',
      superseded_by   TEXT,
      notas           TEXT
    )
  `)
  try {
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_snapshots_seed ON snapshots(seed_id, fecha_corrida DESC)`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_snapshots_hash ON snapshots(hash_archivo)`)
  } catch { /* idempotente */ }
```

- [ ] **Step 6: Implementar `snapshots.ts`**

Crear `backend/src/lib/snapshots.ts`:

```ts
import crypto from 'crypto'
import { dbRun, dbAll } from './db'
import type { IngestStatus } from '../types/ingest'

export interface Snapshot {
  id: string
  seedId: string
  fuenteUrl: string
  fechaCorrida: string
  hashArchivo: string
  filasLeidas: number
  filasInsertadas: number
  filasQuarantined: number
  duracionMs: number | null
  status: IngestStatus
  supersededBy: string | null
  notas: string | null
}

interface SnapshotRow {
  id: string
  seed_id: string
  fuente_url: string
  fecha_corrida: string
  hash_archivo: string
  filas_leidas: number
  filas_insertadas: number
  filas_quarantined: number
  duracion_ms: number | null
  status: string
  superseded_by: string | null
  notas: string | null
}

function fromRow(r: SnapshotRow): Snapshot {
  return {
    id: r.id,
    seedId: r.seed_id,
    fuenteUrl: r.fuente_url,
    fechaCorrida: r.fecha_corrida,
    hashArchivo: r.hash_archivo,
    filasLeidas: Number(r.filas_leidas),
    filasInsertadas: Number(r.filas_insertadas),
    filasQuarantined: Number(r.filas_quarantined),
    duracionMs: r.duracion_ms === null ? null : Number(r.duracion_ms),
    status: (r.status as IngestStatus),
    supersededBy: r.superseded_by,
    notas: r.notas,
  }
}

export async function crearSnapshot(input: {
  seedId: string
  fuenteUrl: string
  hashArchivo: string
  filasLeidas: number
  filasInsertadas?: number
  filasQuarantined?: number
  duracionMs?: number
  status?: IngestStatus
  notas?: string
}): Promise<Snapshot> {
  const id = crypto.randomUUID()
  const fechaCorrida = new Date().toISOString()
  await dbRun(
    `INSERT INTO snapshots
      (id, seed_id, fuente_url, fecha_corrida, hash_archivo,
       filas_leidas, filas_insertadas, filas_quarantined, duracion_ms, status, notas)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id, input.seedId, input.fuenteUrl, fechaCorrida, input.hashArchivo,
      input.filasLeidas, input.filasInsertadas ?? 0, input.filasQuarantined ?? 0,
      input.duracionMs ?? null, input.status ?? 'success', input.notas ?? null,
    ]
  )
  return {
    id, seedId: input.seedId, fuenteUrl: input.fuenteUrl, fechaCorrida,
    hashArchivo: input.hashArchivo,
    filasLeidas: input.filasLeidas,
    filasInsertadas: input.filasInsertadas ?? 0,
    filasQuarantined: input.filasQuarantined ?? 0,
    duracionMs: input.duracionMs ?? null,
    status: input.status ?? 'success',
    supersededBy: null,
    notas: input.notas ?? null,
  }
}

export async function getSnapshot(id: string): Promise<Snapshot | null> {
  const rows = await dbAll<SnapshotRow>(`SELECT * FROM snapshots WHERE id = ?`, [id])
  return rows.length === 0 ? null : fromRow(rows[0])
}

export async function listSnapshots(seedId?: string, limit = 50): Promise<Snapshot[]> {
  const rows = seedId
    ? await dbAll<SnapshotRow>(`SELECT * FROM snapshots WHERE seed_id = ? ORDER BY fecha_corrida DESC LIMIT ?`, [seedId, limit])
    : await dbAll<SnapshotRow>(`SELECT * FROM snapshots ORDER BY fecha_corrida DESC LIMIT ?`, [limit])
  return rows.map(fromRow)
}

export async function marcarSupersededBy(viejoId: string, nuevoId: string): Promise<void> {
  await dbRun(`UPDATE snapshots SET superseded_by = ? WHERE id = ?`, [nuevoId, viejoId])
}

/**
 * Devuelve el snapshot previo del mismo seedId+fuenteUrl si existe (para
 * comparar hash y decidir si saltar la corrida nueva).
 */
export async function getUltimoSnapshot(seedId: string, fuenteUrl: string): Promise<Snapshot | null> {
  const rows = await dbAll<SnapshotRow>(
    `SELECT * FROM snapshots
     WHERE seed_id = ? AND fuente_url = ? AND superseded_by IS NULL
     ORDER BY fecha_corrida DESC LIMIT 1`,
    [seedId, fuenteUrl]
  )
  return rows.length === 0 ? null : fromRow(rows[0])
}
```

- [ ] **Step 7: Run test — debería PASAR**

Run: `cd backend && npx vitest run src/lib/snapshots.test.ts`
Expected: PASS — 3 tests OK

- [ ] **Step 8: Commit**

```bash
git add backend/src/types/ingest.ts backend/src/types/index.ts backend/src/lib/snapshots.ts backend/src/lib/snapshots.test.ts backend/src/lib/db.ts
git commit -m "feat(snapshots): tabla + helpers + tipos IngestReport — fundación bitemporal W1"
```

---

## Task 2: Tabla `quarantine` + helpers

**Files:**
- Create: `backend/src/lib/quarantine.ts`
- Create: `backend/src/lib/quarantine.test.ts`
- Modify: `backend/src/lib/db.ts` (después de tabla `snapshots`)

- [ ] **Step 1: Test primero**

Crear `backend/src/lib/quarantine.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, dbRun, dbAll } from './db'
import { crearSnapshot } from './snapshots'
import { enquarantine, getQuarantine, resolverQuarantine, countQuarantine } from './quarantine'

describe('quarantine', () => {
  beforeEach(async () => {
    await initDb()
    await dbRun(`DELETE FROM quarantine`)
    await dbRun(`DELETE FROM snapshots`)
  })

  it('enquarantine inserta una fila vinculada a snapshot', async () => {
    const snap = await crearSnapshot({ seedId: 'test', fuenteUrl: 'u', hashArchivo: 'h', filasLeidas: 0 })
    const id = await enquarantine({
      snapshotId: snap.id,
      tablaDestino: 'contratos',
      motivo: 'schema_validation',
      detalle: { campo: 'monto', error: 'expected number got string' },
      filaJson: { proveedor: 'X', monto: '$1.000' },
    })
    expect(id).toBeDefined()

    const all = await getQuarantine({ tablaDestino: 'contratos' })
    expect(all.length).toBe(1)
    expect(all[0].motivo).toBe('schema_validation')
    expect(all[0].resolucion).toBe('pending')
  })

  it('resolverQuarantine actualiza estado', async () => {
    const snap = await crearSnapshot({ seedId: 'test', fuenteUrl: 'u', hashArchivo: 'h', filasLeidas: 0 })
    const id = await enquarantine({
      snapshotId: snap.id,
      tablaDestino: 'contratos',
      motivo: 'sanity_check',
      detalle: { drop: 0.9 },
      filaJson: {},
    })

    await resolverQuarantine(id, 'discarded', 'manual review — falso positivo')
    const all = await getQuarantine({})
    expect(all[0].resolucion).toBe('discarded')
    expect(all[0].resueltoEn).toBeDefined()
  })

  it('countQuarantine filtra por estado', async () => {
    const snap = await crearSnapshot({ seedId: 'test', fuenteUrl: 'u', hashArchivo: 'h', filasLeidas: 0 })
    await enquarantine({ snapshotId: snap.id, tablaDestino: 't1', motivo: 'm', detalle: {}, filaJson: {} })
    await enquarantine({ snapshotId: snap.id, tablaDestino: 't1', motivo: 'm', detalle: {}, filaJson: {} })
    expect(await countQuarantine({ resolucion: 'pending' })).toBe(2)
    expect(await countQuarantine({ resolucion: 'discarded' })).toBe(0)
  })
})
```

- [ ] **Step 2: Run test — FAIL (quarantine.ts no existe)**

Run: `cd backend && npx vitest run src/lib/quarantine.test.ts`
Expected: FAIL

- [ ] **Step 3: Crear tabla `quarantine` en db.ts**

Después del bloque snapshots (Task 1 step 5):

```ts
  // ─── Quarantine — filas que fallan validación durante seeds (W1) ──────────
  // Política ARGOS: nunca abortar corrida nocturna por una fila sucia.
  // Aislamos en quarantine, seguimos con el resto, alertamos al operador.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS quarantine (
      id              TEXT PRIMARY KEY,
      snapshot_id     TEXT NOT NULL,
      tabla_destino   TEXT NOT NULL,
      motivo          TEXT NOT NULL,
      detalle         TEXT,            -- JSON serializado
      fila_json       TEXT,            -- JSON serializado del row original
      creado_en       TEXT NOT NULL,
      resuelto_en     TEXT,
      resolucion      TEXT NOT NULL DEFAULT 'pending'
    )
  `)
  try {
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_quarantine_snap ON quarantine(snapshot_id)`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_quarantine_tabla ON quarantine(tabla_destino)`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_quarantine_estado ON quarantine(resolucion)`)
  } catch { /* idempotente */ }
```

- [ ] **Step 4: Implementar `quarantine.ts`**

Crear `backend/src/lib/quarantine.ts`:

```ts
import crypto from 'crypto'
import { dbRun, dbAll } from './db'

export interface QuarantineEntry {
  id: string
  snapshotId: string
  tablaDestino: string
  motivo: string
  detalle: unknown
  filaJson: unknown
  creadoEn: string
  resueltoEn: string | null
  resolucion: 'pending' | 'inserted' | 'discarded'
}

interface QuarantineRow {
  id: string
  snapshot_id: string
  tabla_destino: string
  motivo: string
  detalle: string | null
  fila_json: string | null
  creado_en: string
  resuelto_en: string | null
  resolucion: string
}

function fromRow(r: QuarantineRow): QuarantineEntry {
  return {
    id: r.id,
    snapshotId: r.snapshot_id,
    tablaDestino: r.tabla_destino,
    motivo: r.motivo,
    detalle: r.detalle ? JSON.parse(r.detalle) : null,
    filaJson: r.fila_json ? JSON.parse(r.fila_json) : null,
    creadoEn: r.creado_en,
    resueltoEn: r.resuelto_en,
    resolucion: r.resolucion as QuarantineEntry['resolucion'],
  }
}

export async function enquarantine(input: {
  snapshotId: string
  tablaDestino: string
  motivo: string
  detalle: unknown
  filaJson: unknown
}): Promise<string> {
  const id = crypto.randomUUID()
  await dbRun(
    `INSERT INTO quarantine (id, snapshot_id, tabla_destino, motivo, detalle, fila_json, creado_en, resolucion)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'pending')`,
    [
      id, input.snapshotId, input.tablaDestino, input.motivo,
      JSON.stringify(input.detalle ?? null),
      JSON.stringify(input.filaJson ?? null),
      new Date().toISOString(),
    ]
  )
  return id
}

export async function getQuarantine(filter: {
  tablaDestino?: string
  snapshotId?: string
  resolucion?: 'pending' | 'inserted' | 'discarded'
  limit?: number
}): Promise<QuarantineEntry[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.tablaDestino) { where.push('tabla_destino = ?'); params.push(filter.tablaDestino) }
  if (filter.snapshotId)   { where.push('snapshot_id = ?');   params.push(filter.snapshotId) }
  if (filter.resolucion)   { where.push('resolucion = ?');    params.push(filter.resolucion) }
  const sql = `SELECT * FROM quarantine ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY creado_en DESC LIMIT ?`
  params.push(filter.limit ?? 100)
  const rows = await dbAll<QuarantineRow>(sql, params)
  return rows.map(fromRow)
}

export async function resolverQuarantine(
  id: string,
  resolucion: 'inserted' | 'discarded',
  notas?: string
): Promise<void> {
  await dbRun(
    `UPDATE quarantine
     SET resolucion = ?, resuelto_en = ?, motivo = COALESCE(motivo, '') || (? != '' ? ' | ' || ? : '')
     WHERE id = ?`,
    [resolucion, new Date().toISOString(), notas ?? '', notas ?? '', id]
  )
}

export async function countQuarantine(filter: {
  resolucion?: 'pending' | 'inserted' | 'discarded'
  tablaDestino?: string
}): Promise<number> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.resolucion)   { where.push('resolucion = ?');    params.push(filter.resolucion) }
  if (filter.tablaDestino) { where.push('tabla_destino = ?'); params.push(filter.tablaDestino) }
  const sql = `SELECT COUNT(*) as n FROM quarantine ${where.length ? 'WHERE ' + where.join(' AND ') : ''}`
  const rows = await dbAll<{ n: number | bigint }>(sql, params)
  return Number(rows[0]?.n ?? 0)
}
```

- [ ] **Step 5: Run test — PASA**

Run: `cd backend && npx vitest run src/lib/quarantine.test.ts`
Expected: PASS — 3 tests OK

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/quarantine.ts backend/src/lib/quarantine.test.ts backend/src/lib/db.ts
git commit -m "feat(quarantine): tabla + helpers — aislar filas inválidas sin abortar seed (W1)"
```

---

## Task 3: Tabla `identidad_candidates` + helpers

**Files:**
- Create: `backend/src/lib/identidad-candidates.ts`
- Create: `backend/src/lib/identidad-candidates.test.ts`
- Modify: `backend/src/lib/db.ts`

- [ ] **Step 1: Test**

Crear `backend/src/lib/identidad-candidates.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { initDb, dbRun } from './db'
import {
  insertarCandidato, listarCandidatos, verificarManualmente,
  contarCandidatosPorTier, autoPromoverPorConsenso,
} from './identidad-candidates'

describe('identidad_candidates', () => {
  beforeEach(async () => {
    await initDb()
    await dbRun(`DELETE FROM identidad_candidates`)
  })

  it('insertarCandidato persiste con tier 1/2/3', async () => {
    const id = await insertarCandidato({
      tipo: 'persona',
      fuenteA: 'sueldos:2024:1234',
      identificadorA: '12345678',
      fuenteB: 'igj:dni_12345678',
      identificadorB: '12345678',
      tier: 1,
      metodo: 'dni_exact',
      score: 1.0,
    })
    expect(id).toBeDefined()

    const items = await listarCandidatos({ tier: 1 })
    expect(items.length).toBe(1)
    expect(items[0].verificadoPorHumano).toBe(false)
  })

  it('verificarManualmente promueve a verified=true', async () => {
    const id = await insertarCandidato({
      tipo: 'persona', fuenteA: 'a', identificadorA: 'X', fuenteB: 'b', identificadorB: 'Y',
      tier: 2, metodo: 'nombre_norm', score: 0.7,
    })
    await verificarManualmente(id, true, 'amiunelautaro@gmail.com', 'mismo Pereyra')
    const all = await listarCandidatos({})
    expect(all[0].verificadoPorHumano).toBe(true)
  })

  it('contarCandidatosPorTier separa tier 1/2/3', async () => {
    await insertarCandidato({ tipo: 'persona', fuenteA: 'a1', identificadorA: 'X', fuenteB: 'b1', identificadorB: 'X', tier: 1, metodo: 'dni_exact', score: 1 })
    await insertarCandidato({ tipo: 'persona', fuenteA: 'a2', identificadorA: 'X', fuenteB: 'b2', identificadorB: 'Y', tier: 2, metodo: 'nombre_norm', score: 0.7 })
    await insertarCandidato({ tipo: 'persona', fuenteA: 'a3', identificadorA: 'X', fuenteB: 'b3', identificadorB: 'Z', tier: 3, metodo: 'levenshtein', score: 0.5 })
    const counts = await contarCandidatosPorTier()
    expect(counts.t1).toBe(1)
    expect(counts.t2).toBe(1)
    expect(counts.t3).toBe(1)
  })

  it('autoPromoverPorConsenso promueve T2 a T1 si dos fuentes >0.85', async () => {
    // 2 candidatos T2 que matchean misma persona desde 2 fuentes distintas con score >0.85
    await insertarCandidato({ tipo: 'persona', fuenteA: 'sueldos:1', identificadorA: 'PEREZ JUAN', fuenteB: 'igj:1', identificadorB: 'PEREZ JUAN', tier: 2, metodo: 'nombre_norm', score: 0.9 })
    await insertarCandidato({ tipo: 'persona', fuenteA: 'boletin:1', identificadorA: 'PEREZ JUAN', fuenteB: 'igj:1', identificadorB: 'PEREZ JUAN', tier: 2, metodo: 'nombre_norm', score: 0.88 })

    const promoted = await autoPromoverPorConsenso(0.85)
    expect(promoted).toBeGreaterThanOrEqual(1)
    const counts = await contarCandidatosPorTier()
    expect(counts.t1).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run — FAIL**

Run: `cd backend && npx vitest run src/lib/identidad-candidates.test.ts`
Expected: FAIL

- [ ] **Step 3: Tabla en db.ts**

Después del bloque quarantine:

```ts
  // ─── Identity Resolution candidates (W1) ──────────────────────────────────
  // T1 (DNI/CUIT exact) entran al grafo Neo4j público.
  // T2/T3 quedan acá hasta verificación humana (UI /admin/identidades).
  // Por LAI argentina, toda arista pública debe ser T1 (ver memory:traceability_tier1).
  await dbRun(`
    CREATE TABLE IF NOT EXISTS identidad_candidates (
      id                    TEXT PRIMARY KEY,
      tipo                  TEXT NOT NULL,
      fuente_a              TEXT NOT NULL,
      identificador_a       TEXT NOT NULL,
      fuente_b              TEXT NOT NULL,
      identificador_b       TEXT NOT NULL,
      tier                  INTEGER NOT NULL,
      metodo                TEXT NOT NULL,
      score                 DOUBLE NOT NULL,
      verificado_por_humano BOOLEAN NOT NULL DEFAULT false,
      verificado_en         TEXT,
      verificado_por        TEXT,
      notas                 TEXT,
      created_at            TEXT NOT NULL
    )
  `)
  try {
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_identidad_tipo ON identidad_candidates(tipo, tier)`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_identidad_a ON identidad_candidates(LOWER(identificador_a))`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_identidad_b ON identidad_candidates(LOWER(identificador_b))`)
  } catch { /* idempotente */ }
```

- [ ] **Step 4: Implementar `identidad-candidates.ts`**

Crear `backend/src/lib/identidad-candidates.ts`:

```ts
import crypto from 'crypto'
import { dbRun, dbAll } from './db'

export type IdentidadTipo = 'persona' | 'empresa'
export type IdentidadMetodo =
  | 'dni_exact' | 'cuit_exact'
  | 'nombre_norm' | 'razon_social_norm'
  | 'levenshtein' | 'soundex'
  | 'manual_verification' | 'consensus'

export interface IdentidadCandidato {
  id: string
  tipo: IdentidadTipo
  fuenteA: string
  identificadorA: string
  fuenteB: string
  identificadorB: string
  tier: 1 | 2 | 3
  metodo: IdentidadMetodo
  score: number
  verificadoPorHumano: boolean
  verificadoEn: string | null
  verificadoPor: string | null
  notas: string | null
  createdAt: string
}

interface Row {
  id: string; tipo: string
  fuente_a: string; identificador_a: string
  fuente_b: string; identificador_b: string
  tier: number; metodo: string; score: number
  verificado_por_humano: boolean
  verificado_en: string | null
  verificado_por: string | null
  notas: string | null
  created_at: string
}

function fromRow(r: Row): IdentidadCandidato {
  const t = Number(r.tier)
  const tier: 1 | 2 | 3 = t === 1 ? 1 : t === 2 ? 2 : 3
  return {
    id: r.id,
    tipo: r.tipo as IdentidadTipo,
    fuenteA: r.fuente_a, identificadorA: r.identificador_a,
    fuenteB: r.fuente_b, identificadorB: r.identificador_b,
    tier,
    metodo: r.metodo as IdentidadMetodo,
    score: Number(r.score),
    verificadoPorHumano: !!r.verificado_por_humano,
    verificadoEn: r.verificado_en,
    verificadoPor: r.verificado_por,
    notas: r.notas,
    createdAt: r.created_at,
  }
}

export async function insertarCandidato(input: {
  tipo: IdentidadTipo
  fuenteA: string; identificadorA: string
  fuenteB: string; identificadorB: string
  tier: 1 | 2 | 3
  metodo: IdentidadMetodo
  score: number
  notas?: string
}): Promise<string> {
  // Idempotente: hash determinístico para evitar duplicar el mismo candidato.
  const id = crypto
    .createHash('sha256')
    .update(`${input.tipo}|${input.fuenteA}|${input.identificadorA}|${input.fuenteB}|${input.identificadorB}|${input.metodo}`)
    .digest('hex').slice(0, 32)

  await dbRun(
    `INSERT OR IGNORE INTO identidad_candidates
      (id, tipo, fuente_a, identificador_a, fuente_b, identificador_b,
       tier, metodo, score, verificado_por_humano, notas, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, false, ?, ?)`,
    [
      id, input.tipo, input.fuenteA, input.identificadorA,
      input.fuenteB, input.identificadorB,
      input.tier, input.metodo, input.score,
      input.notas ?? null, new Date().toISOString(),
    ]
  )
  return id
}

export async function listarCandidatos(filter: {
  tipo?: IdentidadTipo
  tier?: 1 | 2 | 3
  verificado?: boolean
  limit?: number
}): Promise<IdentidadCandidato[]> {
  const where: string[] = []
  const params: unknown[] = []
  if (filter.tipo)             { where.push('tipo = ?');                  params.push(filter.tipo) }
  if (filter.tier)             { where.push('tier = ?');                  params.push(filter.tier) }
  if (filter.verificado !== undefined) { where.push('verificado_por_humano = ?'); params.push(filter.verificado) }
  const sql = `SELECT * FROM identidad_candidates ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY tier, score DESC LIMIT ?`
  params.push(filter.limit ?? 200)
  const rows = await dbAll<Row>(sql, params)
  return rows.map(fromRow)
}

export async function verificarManualmente(
  id: string,
  confirmar: boolean,
  verificadoPor: string,
  notas?: string
): Promise<void> {
  // Si confirmar=true, promovemos a tier 1 con metodo='manual_verification'.
  // Si confirmar=false, lo dejamos marcado como rechazado (tier negativo
  // para distinguir de pendientes; no borramos para auditoría).
  if (confirmar) {
    await dbRun(
      `UPDATE identidad_candidates
       SET tier = 1, metodo = 'manual_verification',
           verificado_por_humano = true,
           verificado_en = ?, verificado_por = ?,
           notas = COALESCE(notas, '') || (? != '' ? ' | confirmado: ' || ? : '')
       WHERE id = ?`,
      [new Date().toISOString(), verificadoPor, notas ?? '', notas ?? '', id]
    )
  } else {
    await dbRun(
      `UPDATE identidad_candidates
       SET verificado_por_humano = true,
           verificado_en = ?, verificado_por = ?,
           notas = COALESCE(notas, '') || (? != '' ? ' | rechazado: ' || ? : '')
       WHERE id = ?`,
      [new Date().toISOString(), verificadoPor, notas ?? '', notas ?? '', id]
    )
  }
}

export async function contarCandidatosPorTier(): Promise<{ t1: number; t2: number; t3: number }> {
  const rows = await dbAll<{ tier: number; n: number | bigint }>(
    `SELECT tier, COUNT(*) as n FROM identidad_candidates GROUP BY tier`
  )
  const out = { t1: 0, t2: 0, t3: 0 }
  for (const r of rows) {
    const t = Number(r.tier)
    const n = Number(r.n)
    if (t === 1) out.t1 = n
    else if (t === 2) out.t2 = n
    else if (t === 3) out.t3 = n
  }
  return out
}

/**
 * Auto-promueve a T1 los candidatos T2/T3 cuando hay 2+ candidatos
 * independientes (fuente_a distinta) que apuntan al mismo identificador_b
 * con score ≥ minScore. Política "consenso multi-fuente".
 */
export async function autoPromoverPorConsenso(minScore = 0.85): Promise<number> {
  const grupos = await dbAll<{ identificador_b: string; n: number | bigint; max_score: number }>(
    `SELECT identificador_b,
            COUNT(DISTINCT fuente_a) as n,
            MAX(score) as max_score
     FROM identidad_candidates
     WHERE tier IN (2, 3)
       AND verificado_por_humano = false
       AND score >= ?
     GROUP BY identificador_b
     HAVING COUNT(DISTINCT fuente_a) >= 2`,
    [minScore]
  )

  let promoted = 0
  for (const g of grupos) {
    const r = await dbRun(
      `UPDATE identidad_candidates
       SET tier = 1, metodo = 'consensus',
           verificado_por_humano = true,
           verificado_en = ?, verificado_por = 'sistema',
           notas = COALESCE(notas, '') || ' | auto-promoted via consensus (n=' || ? || ')'
       WHERE identificador_b = ? AND tier IN (2, 3) AND verificado_por_humano = false AND score >= ?`,
      [new Date().toISOString(), Number(g.n), g.identificador_b, minScore]
    )
    promoted += Number(g.n)
    void r
  }
  return promoted
}
```

- [ ] **Step 5: Run test — PASA**

Run: `cd backend && npx vitest run src/lib/identidad-candidates.test.ts`
Expected: PASS — 4 tests OK

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/identidad-candidates.ts backend/src/lib/identidad-candidates.test.ts backend/src/lib/db.ts
git commit -m "feat(identidad): tabla identidad_candidates + helpers T1/T2/T3 — solo T1 público (W1)"
```

---

## Task 4: Migración bitemporal — agregar `t_efectivo, t_publicado, snapshot_id` a tablas core

**Files:**
- Create: `backend/src/scripts/migrate-bitemporal.ts`
- Modify: `backend/package.json` (script `migrate:bitemporal`)

- [ ] **Step 1: Crear script de migración**

Crear `backend/src/scripts/migrate-bitemporal.ts`:

```ts
// migrate-bitemporal.ts — Agrega columnas bitemporal idempotentes a tablas core.
//
// Modelo:
//   t_efectivo  = fecha real del hecho (cuándo ocurrió)
//   t_publicado = fecha de extracción (cuándo lo supimos en ARGOS)
//   snapshot_id = FK a tabla snapshots
//   superseded_by_id = FK a la fila que reemplaza esta (correcciones oficiales)
//
// DuckDB no soporta IF NOT EXISTS en ADD COLUMN; capturamos error de columna
// duplicada para que sea idempotente.

import 'dotenv/config'
import { initDb, dbRun, dbAll } from '../lib/db'

const TABLAS_CORE = [
  'contratos',
  'agentes_publicos',
  'igj_entidades',
  'igj_autoridades',
  'rns_personas_juridicas',
  'licitaciones_llamado',
  'obras_publicas',
  'transferencias',
  'presupuesto_ejecucion',
] as const

async function tableExists(name: string): Promise<boolean> {
  const rows = await dbAll<{ n: number | bigint }>(
    `SELECT COUNT(*) as n FROM information_schema.tables WHERE table_schema='main' AND table_name = ?`,
    [name]
  )
  return Number(rows[0]?.n ?? 0) > 0
}

async function addColumnIfMissing(table: string, col: string, def: string): Promise<'added' | 'exists'> {
  try {
    await dbRun(`ALTER TABLE ${table} ADD COLUMN ${col} ${def}`)
    return 'added'
  } catch (err) {
    const msg = (err as Error).message ?? ''
    if (msg.includes('duplicate') || msg.includes('already exists')) return 'exists'
    throw err
  }
}

async function main() {
  console.log('=== ARGOS — Migración bitemporal ===\n')
  await initDb()

  for (const tabla of TABLAS_CORE) {
    if (!await tableExists(tabla)) {
      console.log(`  ${tabla}: tabla no existe, saltando`)
      continue
    }
    const a = await addColumnIfMissing(tabla, 't_efectivo', 'TEXT')
    const b = await addColumnIfMissing(tabla, 't_publicado', 'TEXT')
    const c = await addColumnIfMissing(tabla, 'snapshot_id', 'TEXT')
    const d = await addColumnIfMissing(tabla, 'superseded_by_id', 'TEXT')
    console.log(`  ${tabla}: t_efectivo=${a}, t_publicado=${b}, snapshot_id=${c}, superseded_by_id=${d}`)

    // Indices para queries as-of (siempre filtran por snapshot_id IS NOT NULL
    // o WHERE superseded_by_id IS NULL).
    try {
      await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla}_snapshot ON ${tabla}(snapshot_id) WHERE snapshot_id IS NOT NULL`)
      await dbRun(`CREATE INDEX IF NOT EXISTS idx_${tabla}_superseded ON ${tabla}(superseded_by_id) WHERE superseded_by_id IS NULL`)
    } catch { /* ignore */ }
  }

  console.log('\n✓ Migración bitemporal completada')
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
```

- [ ] **Step 2: Agregar script npm**

Editar `backend/package.json` sección `scripts`. Buscar la línea con `"migrate:` (no debería existir todavía) o agregar después de `"resolve:identities"`:

```json
    "migrate:bitemporal": "npx ts-node src/scripts/migrate-bitemporal.ts",
```

- [ ] **Step 3: Correr la migración**

Run: `cd backend && npm run migrate:bitemporal`
Expected output: lista de tablas con `t_efectivo=added, t_publicado=added, snapshot_id=added` para cada tabla existente; `=exists` si re-corrida.

- [ ] **Step 4: Verificar idempotencia (re-correr)**

Run: `cd backend && npm run migrate:bitemporal`
Expected: cada tabla muestra `=exists` para todas las columnas. No errores.

- [ ] **Step 5: Verificar columnas presentes via SQL**

Run:
```bash
cd backend && npx ts-node --transpile-only -e "import('./src/lib/db.js').then(async db => { await db.initDb(); const r = await db.dbAll(\"SELECT column_name FROM information_schema.columns WHERE table_name='contratos' AND column_name IN ('t_efectivo','t_publicado','snapshot_id','superseded_by_id') ORDER BY 1\"); console.log(r); process.exit(0); });"
```
Expected: 4 rows (column_name: snapshot_id, superseded_by_id, t_efectivo, t_publicado).

- [ ] **Step 6: Commit**

```bash
git add backend/src/scripts/migrate-bitemporal.ts backend/package.json
git commit -m "feat(bitemporal): migración idempotente de columnas t_efectivo/t_publicado/snapshot_id en tablas core (W1)"
```

---

## Task 5: Tabla `entes_estatales_cordoba`

**Files:**
- Modify: `backend/src/lib/db.ts`
- Create: `backend/src/scripts/build-organigrama-cordoba.ts` (stub que carga lista mínima — la versión completa se construye autónomamente en W3)

- [ ] **Step 1: Crear tabla en db.ts**

Después del bloque identidad_candidates:

```ts
  // ─── Entes estatales Córdoba (W1) ─────────────────────────────────────────
  // Lista canónica de organismos públicos cordobeses (Provincia + Capital +
  // empresas estatales + universidades + concesionarios + cooperativas con
  // aporte público). Diferentes de :Empresa porque NO son privadas — modelan
  // como :Reparticion en el grafo.
  // La lista se popula vía build-organigrama-cordoba.ts (W3) desde organigrama
  // oficial. W1 solo crea la tabla y carga 10 entes pivote para tests.
  await dbRun(`
    CREATE TABLE IF NOT EXISTS entes_estatales_cordoba (
      id              TEXT PRIMARY KEY,
      cuit            TEXT,
      nombre          TEXT NOT NULL,
      jurisdiccion    TEXT NOT NULL,         -- 'cordoba-provincia' | 'cordoba-capital'
      tipo            TEXT NOT NULL,         -- 'ministerio'|'secretaria'|'estatal'|
                                              -- 'universidad'|'concesion'|'cooperativa'|
                                              -- 'tribunal'|'legislatura'|'caja'
      poder           TEXT NOT NULL,         -- 'ejecutivo'|'legislativo'|'judicial'|
                                              -- 'descentralizado'
      depende_de_id   TEXT,                  -- FK a otro ente (jerarquía interna)
      ley_creacion    TEXT,
      sitio_web       TEXT,
      fuente_url      TEXT NOT NULL,
      cargado_en      TEXT NOT NULL
    )
  `)
  try {
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_entes_jur ON entes_estatales_cordoba(jurisdiccion)`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_entes_tipo ON entes_estatales_cordoba(tipo)`)
    await dbRun(`CREATE INDEX IF NOT EXISTS idx_entes_cuit ON entes_estatales_cordoba(cuit) WHERE cuit IS NOT NULL`)
  } catch { /* idempotente */ }
```

- [ ] **Step 2: Crear stub `build-organigrama-cordoba.ts`**

Crear `backend/src/scripts/build-organigrama-cordoba.ts`:

```ts
// build-organigrama-cordoba.ts — Carga lista canónica de entes estatales.
// W1: stub con 10 entes pivote (para tests + migración Neo4j).
// W3: versión autónoma que construye desde organigrama oficial completo.

import 'dotenv/config'
import { initDb, dbRun } from '../lib/db'

interface EntePivote {
  id: string
  cuit?: string
  nombre: string
  jurisdiccion: 'cordoba-provincia' | 'cordoba-capital'
  tipo: 'ministerio' | 'secretaria' | 'estatal' | 'universidad' | 'concesion'
       | 'cooperativa' | 'tribunal' | 'legislatura' | 'caja'
  poder: 'ejecutivo' | 'legislativo' | 'judicial' | 'descentralizado'
  dependeDeId?: string
  leyCreacion?: string
  sitioWeb?: string
  fuenteUrl: string
}

// Pivote W1 — 10 entes cuya cobertura es Tier S y tests dependen de ellos.
// La lista completa se construye en W3 vía build:organigrama --completo.
const ENTES_PIVOTE: EntePivote[] = [
  {
    id: 'gob-cba-prov',
    nombre: 'Gobierno de la Provincia de Córdoba',
    jurisdiccion: 'cordoba-provincia',
    tipo: 'ministerio', poder: 'ejecutivo',
    sitioWeb: 'https://www.cba.gov.ar',
    fuenteUrl: 'https://www.cba.gov.ar/poder-ejecutivo/',
  },
  {
    id: 'min-finanzas-cba',
    nombre: 'Ministerio de Economía y Gestión Pública',
    jurisdiccion: 'cordoba-provincia', tipo: 'ministerio', poder: 'ejecutivo',
    dependeDeId: 'gob-cba-prov',
    sitioWeb: 'https://finanzas.cba.gov.ar',
    fuenteUrl: 'https://finanzas.cba.gov.ar',
  },
  {
    id: 'min-salud-cba',
    nombre: 'Ministerio de Salud',
    jurisdiccion: 'cordoba-provincia', tipo: 'ministerio', poder: 'ejecutivo',
    dependeDeId: 'gob-cba-prov',
    sitioWeb: 'https://www.cba.gov.ar/reparticion/ministerio-de-salud/',
    fuenteUrl: 'https://www.cba.gov.ar/reparticion/ministerio-de-salud/',
  },
  {
    id: 'epec',
    cuit: '30-54571408-7',
    nombre: 'Empresa Provincial de Energía de Córdoba (EPEC)',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    leyCreacion: 'Ley provincial 4358 (1953)',
    sitioWeb: 'https://www.epec.com.ar',
    fuenteUrl: 'https://www.epec.com.ar/institucional',
  },
  {
    id: 'bancor',
    cuit: '30-99921020-3',
    nombre: 'Banco de la Provincia de Córdoba (Bancor)',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.bancor.com.ar',
    fuenteUrl: 'https://www.bancor.com.ar/institucional/',
  },
  {
    id: 'caminos-sierras',
    cuit: '30-69077820-3',
    nombre: 'Caminos de las Sierras S.A.',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.caminosdelassierras.com.ar',
    fuenteUrl: 'https://www.caminosdelassierras.com.ar/institucional',
  },
  {
    id: 'loteria-cba',
    cuit: '30-54573123-2',
    nombre: 'Lotería de Córdoba S.E.',
    jurisdiccion: 'cordoba-provincia', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.loteriadecordoba.com.ar',
    fuenteUrl: 'https://www.loteriadecordoba.com.ar/institucional/',
  },
  {
    id: 'gob-cap-cba',
    nombre: 'Municipalidad de Córdoba',
    jurisdiccion: 'cordoba-capital', tipo: 'ministerio', poder: 'ejecutivo',
    sitioWeb: 'https://www.cordoba.gob.ar',
    fuenteUrl: 'https://www.cordoba.gob.ar',
  },
  {
    id: 'tamse',
    cuit: '30-71064850-3',
    nombre: 'Transporte Automotor Municipal Sociedad del Estado (TAMSE)',
    jurisdiccion: 'cordoba-capital', tipo: 'estatal', poder: 'descentralizado',
    sitioWeb: 'https://www.tamse.com.ar',
    fuenteUrl: 'https://www.tamse.com.ar/institucional',
  },
  {
    id: 'concejo-cap-cba',
    nombre: 'Concejo Deliberante de la Ciudad de Córdoba',
    jurisdiccion: 'cordoba-capital', tipo: 'legislatura', poder: 'legislativo',
    sitioWeb: 'https://www.cdcordoba.gob.ar',
    fuenteUrl: 'https://www.cdcordoba.gob.ar',
  },
]

async function main() {
  console.log('=== ARGOS — Build organigrama Córdoba (W1 stub: 10 pivote) ===\n')
  await initDb()

  const now = new Date().toISOString()
  let inserted = 0
  for (const e of ENTES_PIVOTE) {
    await dbRun(
      `INSERT OR REPLACE INTO entes_estatales_cordoba
        (id, cuit, nombre, jurisdiccion, tipo, poder, depende_de_id, ley_creacion, sitio_web, fuente_url, cargado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        e.id, e.cuit ?? null, e.nombre, e.jurisdiccion, e.tipo, e.poder,
        e.dependeDeId ?? null, e.leyCreacion ?? null, e.sitioWeb ?? null,
        e.fuenteUrl, now,
      ]
    )
    inserted++
  }
  console.log(`✓ ${inserted} entes pivote cargados.`)
  console.log(`  W3 ampliará la lista al organigrama completo (~150 entes).`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
```

- [ ] **Step 3: Agregar script npm**

En `backend/package.json` después de `migrate:bitemporal`:

```json
    "build:organigrama": "npx ts-node src/scripts/build-organigrama-cordoba.ts",
```

- [ ] **Step 4: Correr el script**

Run: `cd backend && npm run build:organigrama`
Expected: `✓ 10 entes pivote cargados.`

- [ ] **Step 5: Verificar via SQL**

Run:
```bash
cd backend && npx ts-node --transpile-only -e "import('./src/lib/db.js').then(async db => { await db.initDb(); const r = await db.dbAll('SELECT id, nombre, jurisdiccion, tipo FROM entes_estatales_cordoba ORDER BY jurisdiccion, tipo, id'); console.table(r); process.exit(0); });"
```
Expected: tabla con 10 rows.

- [ ] **Step 6: Commit**

```bash
git add backend/src/lib/db.ts backend/src/scripts/build-organigrama-cordoba.ts backend/package.json
git commit -m "feat(entes): tabla entes_estatales_cordoba + 10 pivote W1 (organigrama completo en W3)"
```

---

## Task 6: Diagnóstico parser `presupuesto_ejecucion`

**Files:**
- Create: `backend/src/scripts/inspect-presupuesto-debug.ts`
- Possibly modify: `backend/src/scripts/seed-cordoba-presupuesto.ts:130-150`

- [ ] **Step 1: Crear script de diagnóstico**

Crear `backend/src/scripts/inspect-presupuesto-debug.ts`:

```ts
// inspect-presupuesto-debug.ts — Diagnóstico paso-a-paso del parser presupuesto.
// El seed-cordoba-presupuesto.ts inserta 0 filas. Este script muestra:
//   1. Qué versiones existen del dataset 14
//   2. Qué descarga (xls/xlsx/csv?) — si hay fallback a xlsx que falta
//   3. Qué header detecta el parser
//   4. Qué columnas extrae regex de un row sample
//   5. Por qué descarta el row

import 'dotenv/config'
import {
  listarVersionesDataset, descargarRecursoDeVersion,
  parsearTablaConHeaderDetectable,
  inferirAnioMesDesdeTitulo, parseMontoAR,
} from '../lib/cordoba-portal'

const DATASET = process.argv[2] ?? '14'
const HEADER_KEYWORDS_BY_DS: Record<string, string[]> = {
  '14': ['partida', 'programa', 'jurisdic', 'credito', 'devengado', 'pagado', 'denomina', 'codigo'],
  '65': ['partida', 'comprometido', 'devengado', 'vigente', 'pagado', 'denomina', 'codigo'],
  '12': ['concepto', 'recaudacion', 'recaudado', 'calculo', 'calculado', 'estimado', 'cod'],
}

async function main() {
  console.log(`=== Diagnóstico dataset ${DATASET} ===\n`)
  const versiones = await listarVersionesDataset(DATASET)
  console.log(`Versiones encontradas: ${versiones.length}`)
  if (versiones.length === 0) return process.exit(1)

  // Tomar una versión que tenga año conocido — preferir reciente
  const conAnio = versiones.find(v => inferirAnioMesDesdeTitulo(v.titulo).anio !== null)
  if (!conAnio) { console.error('Ninguna versión tiene año inferible'); return process.exit(2) }

  const { anio, mes } = inferirAnioMesDesdeTitulo(conAnio.titulo)
  console.log(`\nVersión elegida: v${conAnio.id} — "${conAnio.titulo}" → ${anio}${mes ? '-' + mes : ''}`)

  // Probar 3 niveles de fallback de formato
  for (const formatos of [['xls', 'csv'], ['xlsx'], ['xls', 'xlsx', 'csv']]) {
    console.log(`\nIntentando descarga con formatos: ${formatos.join(',')}`)
    const desc = await descargarRecursoDeVersion(DATASET, conAnio.id, formatos as ('xls'|'xlsx'|'csv')[])
    if (!desc) { console.log('  ✗ No descargó.'); continue }
    console.log(`  ✓ Descargó ${desc.recurso.url} (formato: ${desc.recurso.formato}, ${desc.buffer.length} bytes)`)

    const filas = parsearTablaConHeaderDetectable(
      desc.buffer,
      HEADER_KEYWORDS_BY_DS[DATASET] ?? [],
      { minMatches: 1, maxScanRows: 15 }
    )
    console.log(`  Filas parseadas: ${filas.length}`)
    if (filas.length > 0) {
      console.log(`  Columnas del header detectado: ${Object.keys(filas[0]).join(' | ')}`)
      const sample = filas.find(r => Object.values(r).some(v => v !== null && v !== ''))
      if (sample) {
        console.log(`  Sample row:`)
        for (const [k, v] of Object.entries(sample).slice(0, 12)) {
          console.log(`    ${k.padEnd(30)} = ${JSON.stringify(v)}`)
        }
        // Probar las regex del seed
        const programa = ['/programa/i', '/actividad/i', '/concepto/i', '/clase/i', '/objeto/i', '/^p\\.pr/i']
        for (const reStr of programa) {
          const re = new RegExp(reStr.replace(/\//g, '').split('').slice(0, -1).join('') ?? '', 'i')
          const matchKey = Object.keys(sample).find(k => re.test(k))
          if (matchKey) console.log(`    [programa] regex '${reStr}' matches col '${matchKey}' = ${JSON.stringify(sample[matchKey])}`)
        }
        const monto = ['credito', 'inicial', 'asignado', 'vigente', 'definitivo', 'devengado', 'compromiso', 'pagado', 'recaudacion']
        for (const m of monto) {
          const k = Object.keys(sample).find(k => k.toLowerCase().includes(m))
          if (k) console.log(`    [${m}] col '${k}' raw=${JSON.stringify(sample[k])} parseado=${parseMontoAR(sample[k])}`)
        }
      }
      break // suficiente con 1 versión que funcione
    }
  }

  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
```

- [ ] **Step 2: Agregar script npm**

En `backend/package.json`:

```json
    "inspect:presupuesto": "npx ts-node src/scripts/inspect-presupuesto-debug.ts",
```

- [ ] **Step 3: Correr para dataset 14 (presupuesto anual)**

Run: `cd backend && npm run inspect:presupuesto 14 2>&1 | tee /tmp/inspect-14.log`

Expected output: lista de versiones + intento de descarga + header detectado + sample row con columnas regex matches.

**Decision tree según resultado:**
- Si descarga falla con `[xls, csv]` pero funciona con `[xls, xlsx, csv]` → el bug es la lista de formatos en `seed-cordoba-presupuesto.ts:109`. Fix: agregar `'xlsx'` a esa lista.
- Si descarga OK pero filas=0 → header detector no encuentra la fila correcta. Fix: imprimir las primeras 15 filas para ver el header real y ajustar `headerKeywords`.
- Si filas>0 pero todas se descartan en `if (creditoInicial === null && ...)` → las regex de monto no matchean. Fix: agregar el patrón nuevo al array correspondiente.

- [ ] **Step 4: Aplicar fix correspondiente al diagnóstico**

Si el problema es formato (caso A): editar `backend/src/scripts/seed-cordoba-presupuesto.ts:109`:

```ts
// ANTES:
descarga = await descargarRecursoDeVersion(d.datasetId, v.id, ['xls', 'csv'])

// DESPUÉS:
descarga = await descargarRecursoDeVersion(d.datasetId, v.id, ['xls', 'xlsx', 'csv'])
```

Si el problema es header keywords (caso B): editar el array correspondiente en `seed-cordoba-presupuesto.ts:38-48` agregando los keywords reales descubiertos.

Si el problema es regex de monto (caso C): editar `seed-cordoba-presupuesto.ts:145-148` agregando los patrones que sí matchean en sample row.

- [ ] **Step 5: Re-correr el seed**

Run: `cd backend && npm run seed:cordoba-presupuesto -- --force 2>&1 | tail -50`

Expected: número final `Filas en presupuesto_ejecucion: > 100`.

- [ ] **Step 6: Verificar via SQL**

Run:
```bash
cd backend && npx ts-node --transpile-only -e "import('./src/lib/db.js').then(async db => { await db.initDb(); const r = await db.dbAll('SELECT anio, COUNT(*) as n FROM presupuesto_ejecucion GROUP BY anio ORDER BY anio'); console.table(r); process.exit(0); });"
```

Expected: filas por año, sumando >100. Si sigue 0, hacer otro round de inspect con dataset 65 y 12.

- [ ] **Step 7: Commit**

```bash
git add backend/src/scripts/inspect-presupuesto-debug.ts backend/src/scripts/seed-cordoba-presupuesto.ts backend/package.json
git commit -m "fix(presupuesto): diagnóstico + fix parser dataset 14/65/12 — primeras filas en presupuesto_ejecucion (W1)"
```

---

## Task 7: Modelo Neo4j extendido — nodos `:Estado`, `:Programa` + aristas

**Files:**
- Modify: `backend/src/lib/graph.ts:25-44` (constraints/indices) y agregar funciones nuevas al final
- Create: `backend/src/scripts/migrate-neo4j-estados.ts`

- [ ] **Step 1: Agregar constraints y indices nuevos en `initGraph`**

Editar `backend/src/lib/graph.ts:25` (dentro del bloque `try` del session.run, después de los constraints existentes). Agregar después del `senal_id`:

```ts
      // Schema W1 — nodos raíz Estado + Programa presupuestario
      await session.run(`CREATE CONSTRAINT estado_id IF NOT EXISTS FOR (e:Estado) REQUIRE e.id IS UNIQUE`)
      await session.run(`CREATE INDEX estado_tipo IF NOT EXISTS FOR (e:Estado) ON (e.tipo)`)
      await session.run(`CREATE CONSTRAINT programa_id IF NOT EXISTS FOR (p:Programa) REQUIRE p.id IS UNIQUE`)
      await session.run(`CREATE INDEX programa_anio IF NOT EXISTS FOR (p:Programa) ON (p.anio)`)
```

- [ ] **Step 2: Agregar funciones upsert para Estado y Programa**

Al final de `backend/src/lib/graph.ts` (línea ~1148, antes de `closeGraph`):

```ts
// ─── Mapa estatal — nodos raíz Estado y Programa (W1) ───────────────────────

export async function upsertEstado(data: {
  id: string
  nombre: string
  tipo: 'nacion' | 'provincia' | 'municipio'
  nivel: 0 | 1 | 2
  cuit?: string | null
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MERGE (e:Estado {id: $id})
     SET e.nombre = $nombre, e.tipo = $tipo, e.nivel = $nivel,
         e.cuit = $cuit, e.fuenteUrl = $fuenteUrl`,
    { ...data, cuit: data.cuit ?? null }
  ))
}

export async function upsertContieneReparticion(data: {
  estadoId: string
  reparticionId: string
  tipoRelacion?: 'dependencia_directa' | 'organo_descentralizado'
  fuenteUrl?: string | null
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (e:Estado {id: $estadoId}), (r:Reparticion {id: $reparticionId})
     MERGE (e)-[c:CONTIENE]->(r)
     SET c.tipoRelacion = $tipoRelacion, c.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      tipoRelacion: data.tipoRelacion ?? 'dependencia_directa',
      fuenteUrl: data.fuenteUrl ?? null,
    }
  ))
}

export async function upsertTransferencia(data: {
  origenEstadoId: string
  destinoEstadoId: string
  anio: number
  monto: number
  concepto?: string | null
  leyMarco?: string | null
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (a:Estado {id: $origenEstadoId}), (b:Estado {id: $destinoEstadoId})
     MERGE (a)-[t:TRANSFIERE {anio: $anio, concepto: $concepto}]->(b)
     SET t.monto = $monto, t.leyMarco = $leyMarco, t.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      concepto: data.concepto ?? '',
      leyMarco: data.leyMarco ?? null,
    }
  ))
}

export async function upsertPrograma(data: {
  id: string
  nombre: string
  anio: number
  estadoId: string
  reparticionId?: string | null
  montoAsignado?: number | null
  montoDevengado?: number | null
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(async s => {
    await s.run(
      `MERGE (p:Programa {id: $id})
       SET p.nombre = $nombre, p.anio = $anio, p.estadoId = $estadoId,
           p.fuenteUrl = $fuenteUrl`,
      data
    )
    // Link al Estado
    await s.run(
      `MATCH (p:Programa {id: $id}), (e:Estado {id: $estadoId})
       MERGE (e)-[:CONTIENE_PROGRAMA]->(p)`,
      { id: data.id, estadoId: data.estadoId }
    )
    // Link a Reparticion (RECIBE_PRESUPUESTO) si está provisto
    if (data.reparticionId && (data.montoAsignado != null || data.montoDevengado != null)) {
      await s.run(
        `MATCH (r:Reparticion {id: $reparticionId}), (p:Programa {id: $programaId})
         MERGE (r)-[rel:RECIBE_PRESUPUESTO {anio: $anio}]->(p)
         SET rel.montoAsignado = $montoAsignado,
             rel.montoDevengado = $montoDevengado,
             rel.fuenteUrl = $fuenteUrl`,
        {
          reparticionId: data.reparticionId,
          programaId: data.id,
          anio: data.anio,
          montoAsignado: data.montoAsignado ?? null,
          montoDevengado: data.montoDevengado ?? null,
          fuenteUrl: data.fuenteUrl,
        }
      )
    }
  })
}

export async function upsertOcupaCargo(data: {
  personaDni: string
  reparticionId: string
  cargo: string
  desde?: string | null
  hasta?: string | null
  electivo?: boolean
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (p:PersonaFisica {dni: $personaDni}), (r:Reparticion {id: $reparticionId})
     MERGE (p)-[oc:OCUPA_CARGO {cargo: $cargo, desde: $desde}]->(r)
     SET oc.hasta = $hasta, oc.electivo = $electivo, oc.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      desde: data.desde ?? null,
      hasta: data.hasta ?? null,
      electivo: data.electivo ?? false,
    }
  ))
}

/**
 * Resumen agregado por (reparticion, persona, año). Cada llamado actualiza
 * monto y meses_pagados acumulados. Permite que el grafo NO explote con
 * 178K aristas (1 por sueldo) sino tenga 1 arista por persona-reparticion-año.
 */
export async function upsertPagaNominaResumen(data: {
  reparticionId: string
  personaDni: string
  anio: number
  cargo?: string | null
  status?: 'activo' | 'pasivo'
  montoTotal: number
  mesesPagados: number
  fuenteUrl: string
}): Promise<void> {
  if (!_available) return
  await withSession(s => s.run(
    `MATCH (r:Reparticion {id: $reparticionId}), (p:PersonaFisica {dni: $personaDni})
     MERGE (r)-[pn:PAGA_NOMINA {anio: $anio}]->(p)
     SET pn.cargo = $cargo, pn.status = $status,
         pn.montoTotal = $montoTotal, pn.mesesPagados = $mesesPagados,
         pn.fuenteUrl = $fuenteUrl`,
    {
      ...data,
      cargo: data.cargo ?? null,
      status: data.status ?? 'activo',
    }
  ))
}
```

- [ ] **Step 3: Crear migración Neo4j**

Crear `backend/src/scripts/migrate-neo4j-estados.ts`:

```ts
// migrate-neo4j-estados.ts — Crea nodos :Estado raíz + migra Reparticion existentes.
//
// W1: crea Nación, Provincia Córdoba, Capital Córdoba.
// Conecta cada :Reparticion existente con su Estado padre vía :CONTIENE.
// Carga los entes_estatales_cordoba como :Reparticion también (los que no estén ya).

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'
import {
  initGraph, isGraphAvailable, closeGraph,
  upsertEstado, upsertReparticion, upsertContieneReparticion,
} from '../lib/graph'

const ESTADOS_RAIZ = [
  {
    id: 'nacion-ar',
    nombre: 'República Argentina',
    tipo: 'nacion' as const,
    nivel: 0 as const,
    cuit: '30-71034970-4',
    fuenteUrl: 'https://www.argentina.gob.ar',
  },
  {
    id: 'cordoba-provincia',
    nombre: 'Provincia de Córdoba',
    tipo: 'provincia' as const,
    nivel: 1 as const,
    cuit: '30-99921020-3',
    fuenteUrl: 'https://www.cba.gov.ar',
  },
  {
    id: 'cordoba-capital',
    nombre: 'Municipalidad de Córdoba',
    tipo: 'municipio' as const,
    nivel: 2 as const,
    cuit: '30-99905722-3',
    fuenteUrl: 'https://www.cordoba.gob.ar',
  },
]

async function main() {
  console.log('=== ARGOS — Migración Neo4j: nodos :Estado raíz (W1) ===\n')
  await initDb()
  await initGraph()

  if (!isGraphAvailable()) {
    console.error('✗ Neo4j no disponible. Iniciar el container y reintentar:')
    console.error('  docker start argos-neo4j')
    process.exit(1)
  }

  console.log('1) Creando nodos :Estado raíz...')
  for (const e of ESTADOS_RAIZ) {
    await upsertEstado(e)
    console.log(`   ✓ ${e.id} (${e.nombre})`)
  }

  console.log('\n2) Cargando entes_estatales_cordoba como :Reparticion + arista CONTIENE...')
  const entes = await dbAll<{
    id: string; cuit: string | null; nombre: string;
    jurisdiccion: string; tipo: string; poder: string;
    fuente_url: string;
  }>(
    `SELECT id, cuit, nombre, jurisdiccion, tipo, poder, fuente_url
     FROM entes_estatales_cordoba`
  )

  let ents = 0
  for (const e of entes) {
    await upsertReparticion({
      id: e.id,
      nombre: e.nombre,
      jurisdiccion: e.jurisdiccion,
      tipo: e.tipo,
    })
    await upsertContieneReparticion({
      estadoId: e.jurisdiccion,
      reparticionId: e.id,
      tipoRelacion: e.poder === 'descentralizado' ? 'organo_descentralizado' : 'dependencia_directa',
      fuenteUrl: e.fuente_url,
    })
    ents++
  }
  console.log(`   ✓ ${ents} entes pivote conectados`)

  console.log('\n3) Conectando :Reparticion existentes (no en entes_estatales) con su Estado por jurisdicción...')
  // Para Reparticiones que ya existían en Neo4j (creadas por seed-neo4j-actores)
  // antes del W1, asociarlas con su Estado por la propiedad jurisdiccion.
  const { dbRun } = await import('../lib/db')
  void dbRun
  // Usar Cypher directo:
  const { isGraphAvailable: avail } = await import('../lib/graph')
  void avail
  // Truco simple: usar withSession que está exportado indirectamente vía
  // helpers existentes; pero más limpio crear aristas para todas:
  const { default: neo4j } = await import('neo4j-driver')
  void neo4j
  // En vez de meter más código, llamamos a Cypher mediante helper:
  await connectAllReparticionesToEstado()

  await closeGraph()
  console.log('\n✓ Migración Neo4j completada')
  process.exit(0)
}

async function connectAllReparticionesToEstado(): Promise<void> {
  // Cypher: para cada Reparticion sin arista CONTIENE entrante, crearla.
  const { default: neo4j } = await import('neo4j-driver')
  const driver = neo4j.driver(
    process.env.NEO4J_URI ?? 'bolt://localhost:7687',
    neo4j.auth.basic(
      process.env.NEO4J_USER ?? 'neo4j',
      process.env.NEO4J_PASS ?? 'argos_local',
    )
  )
  const s = driver.session()
  try {
    const r = await s.run(
      `MATCH (r:Reparticion)
       WHERE NOT EXISTS { (e:Estado)-[:CONTIENE]->(r) }
       OPTIONAL MATCH (e:Estado {id: r.jurisdiccion})
       WITH r, e WHERE e IS NOT NULL
       MERGE (e)-[c:CONTIENE]->(r)
       ON CREATE SET c.tipoRelacion = 'dependencia_directa', c.fuenteUrl = 'derivada_de_jurisdiccion_property'
       RETURN count(c) AS creadas`
    )
    const creadas = r.records[0]?.get('creadas') ?? 0
    const n = typeof creadas === 'object' && 'toNumber' in creadas
      ? (creadas as { toNumber: () => number }).toNumber()
      : Number(creadas)
    console.log(`   ✓ ${n} aristas CONTIENE creadas para Reparticiones huérfanas`)
  } finally {
    await s.close()
    await driver.close()
  }
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
```

- [ ] **Step 4: Agregar script npm**

En `backend/package.json`:

```json
    "migrate:neo4j-estados": "npx ts-node src/scripts/migrate-neo4j-estados.ts",
```

- [ ] **Step 5: Verificar Neo4j corriendo**

Run: `docker ps --filter name=argos-neo4j --format '{{.Names}} {{.Status}}'`
Expected: `argos-neo4j Up X hours` (si no, `docker start argos-neo4j` y reintentar).

- [ ] **Step 6: Backup Neo4j antes de migración**

```bash
mkdir -p ~/Desktop/argos-backups
docker exec argos-neo4j cypher-shell -u neo4j -p argos_local "CALL apoc.export.cypher.all('/tmp/neo4j-backup.cypher', {format: 'plain'})" 2>&1 || echo "apoc.export no disponible — saltar"
docker cp argos-neo4j:/tmp/neo4j-backup.cypher ~/Desktop/argos-backups/neo4j-pre-W1-$(date +%Y%m%d).cypher 2>&1 || echo "backup omitido"
```

- [ ] **Step 7: Correr la migración**

Run: `cd backend && npm run migrate:neo4j-estados`
Expected:
- 3 estados creados
- 10 entes pivote como Reparticion + arista CONTIENE
- N aristas CONTIENE creadas para Reparticiones huérfanas (puede ser 100-450)

- [ ] **Step 8: Verificar via Cypher**

Run:
```bash
docker exec argos-neo4j cypher-shell -u neo4j -p argos_local "MATCH (e:Estado) RETURN e.id, e.nombre, e.tipo ORDER BY e.nivel"
```
Expected: 3 rows (nacion-ar, cordoba-provincia, cordoba-capital).

```bash
docker exec argos-neo4j cypher-shell -u neo4j -p argos_local "MATCH (e:Estado)-[c:CONTIENE]->(r:Reparticion) RETURN e.id AS estado, count(r) AS reparticiones GROUP BY estado"
```
Expected: 3 rows con counts > 0.

- [ ] **Step 9: Commit**

```bash
git add backend/src/lib/graph.ts backend/src/scripts/migrate-neo4j-estados.ts backend/package.json
git commit -m "feat(neo4j): nodos :Estado raíz + :Programa + aristas CONTIENE/TRANSFIERE/RECIBE_PRESUPUESTO/OCUPA_CARGO/PAGA_NOMINA (W1)"
```

---

## Task 8: Refactor `cordoba-capital` connector para `IngestReport`

**Files:**
- Modify: `backend/src/connectors/cordoba-capital/index.ts`
- Modify: `backend/src/scripts/seed-cordoba.ts`

- [ ] **Step 1: Agregar método `ingest()` al connector**

Editar `backend/src/connectors/cordoba-capital/index.ts`. Después de la definición existente del connector, exportar una función ingest separada:

```ts
import crypto from 'crypto'
import { fetchRawRows } from './fetcher'
import { parseRows } from './parser'
import { initDb, getContratosCount, clearContratos, insertContratoBatch } from '../../lib/db'
import { crearSnapshot, getUltimoSnapshot } from '../../lib/snapshots'
import type { IngestOpts, IngestReport } from '../../types/ingest'

const SEED_ID = 'seed:cordoba'
const FUENTE_URL_BASE = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2'

export async function ingestCordobaCapital(opts: IngestOpts): Promise<IngestReport> {
  const t0 = Date.now()
  await initDb()

  const aniosDisponibles = cordobaCapitalConnector.aniosDisponibles
  const desde = opts.desde ?? aniosDisponibles[0]
  const hasta = opts.hasta ?? aniosDisponibles[aniosDisponibles.length - 1]
  const anios = aniosDisponibles.filter(a => a >= desde && a <= hasta)

  // Hash combinado de URLs descargadas (proxy del payload completo).
  // Para skip-unchanged: si todos los archivos del rango año tienen el mismo
  // hash combinado vs último snapshot, saltamos.
  const hasherCombinado = crypto.createHash('sha256')
  const errores: { fila: number; motivo: string }[] = []
  let filasLeidas = 0
  let filasInsertadas = 0
  let filasQuarantined = 0

  if (!opts.dryRun && opts.force) {
    await clearContratos('cordoba-capital')
  }

  const seen = new Set<string>()
  for (const anio of anios) {
    try {
      const rows = await fetchRawRows(anio)
      filasLeidas += rows.length
      hasherCombinado.update(JSON.stringify(rows))

      const contratos = parseRows(rows, anio)
      const nuevos = contratos.filter(c => {
        const k = `${c.anio}|${c.tipo}|${c.proveedor}|${c.area}|${c.monto}`
        if (seen.has(k)) return false
        seen.add(k)
        return true
      })

      if (!opts.dryRun) {
        const inserted = await insertContratoBatch('cordoba-capital', nuevos)
        filasInsertadas += inserted
      }
    } catch (err) {
      errores.push({ fila: -1, motivo: `[${anio}] ${(err as Error).message}` })
    }
  }

  const hashArchivo = hasherCombinado.digest('hex')

  // Skip-unchanged check
  const ultimo = await getUltimoSnapshot(SEED_ID, FUENTE_URL_BASE)
  if (!opts.force && ultimo && ultimo.hashArchivo === hashArchivo) {
    return {
      snapshotId: ultimo.id,
      seedId: SEED_ID,
      fuenteUrl: FUENTE_URL_BASE,
      fechaCorrida: ultimo.fechaCorrida,
      hashArchivo,
      filasLeidas,
      filasInsertadas: 0,
      filasQuarantined: 0,
      errores,
      duracionMs: Date.now() - t0,
      status: 'skipped_unchanged',
    }
  }

  const snap = await crearSnapshot({
    seedId: SEED_ID,
    fuenteUrl: FUENTE_URL_BASE,
    hashArchivo,
    filasLeidas,
    filasInsertadas,
    filasQuarantined,
    duracionMs: Date.now() - t0,
    status: errores.length === 0 ? 'success' : 'partial',
  })

  if (!opts.dryRun && ultimo && ultimo.hashArchivo !== hashArchivo) {
    const { marcarSupersededBy } = await import('../../lib/snapshots')
    await marcarSupersededBy(ultimo.id, snap.id)
  }

  return {
    snapshotId: snap.id,
    seedId: SEED_ID,
    fuenteUrl: FUENTE_URL_BASE,
    fechaCorrida: snap.fechaCorrida,
    hashArchivo,
    filasLeidas,
    filasInsertadas,
    filasQuarantined,
    errores,
    duracionMs: Date.now() - t0,
    status: snap.status,
  }
}
```

(El export del connector existente queda intacto — solo agregamos el método ingest como función exportada separada para no romper la interfaz `MunicipioConnector`.)

- [ ] **Step 2: Refactor `seed-cordoba.ts` para usar ingest()**

Reemplazar todo el contenido de `backend/src/scripts/seed-cordoba.ts`:

```ts
// seed-cordoba.ts — Wrapper sobre ingestCordobaCapital con CLI args.
//
// Ejecutar: npm run seed:cordoba [--force] [--dry-run] [--desde 2015] [--hasta 2026]

import 'dotenv/config'
import { ingestCordobaCapital } from '../connectors/cordoba-capital'
import { listSnapshots } from '../lib/snapshots'

function parseArgs(): { force: boolean; dryRun: boolean; desde?: number; hasta?: number } {
  const a = process.argv.slice(2)
  const out: { force: boolean; dryRun: boolean; desde?: number; hasta?: number } = {
    force: a.includes('--force'),
    dryRun: a.includes('--dry-run'),
  }
  const desdeIdx = a.indexOf('--desde')
  if (desdeIdx >= 0 && a[desdeIdx + 1]) out.desde = Number(a[desdeIdx + 1])
  const hastaIdx = a.indexOf('--hasta')
  if (hastaIdx >= 0 && a[hastaIdx + 1]) out.hasta = Number(a[hastaIdx + 1])
  return out
}

async function main() {
  console.log('=== ARGOS — Seed Córdoba Capital (W1 IngestReport) ===\n')
  const opts = parseArgs()
  console.log(`Opciones: ${JSON.stringify(opts)}\n`)

  const report = await ingestCordobaCapital(opts)

  console.log(`\n=== Reporte ===`)
  console.log(`  Snapshot ID:         ${report.snapshotId}`)
  console.log(`  Status:              ${report.status}`)
  console.log(`  Filas leídas:        ${report.filasLeidas.toLocaleString()}`)
  console.log(`  Filas insertadas:    ${report.filasInsertadas.toLocaleString()}`)
  console.log(`  Filas quarantined:   ${report.filasQuarantined}`)
  console.log(`  Hash archivo:        ${report.hashArchivo.slice(0, 16)}...`)
  console.log(`  Duración:            ${report.duracionMs}ms`)
  if (report.errores.length > 0) {
    console.log(`\n  Errores (${report.errores.length}):`)
    for (const e of report.errores.slice(0, 5)) {
      console.log(`    - ${e.motivo}`)
    }
  }

  // Mostrar últimos 5 snapshots de este seed
  const snaps = await listSnapshots('seed:cordoba', 5)
  console.log(`\n=== Últimas corridas (top 5) ===`)
  for (const s of snaps) {
    console.log(`  ${s.fechaCorrida}  ${s.status.padEnd(20)}  ins=${s.filasInsertadas}  ${s.id.slice(0, 8)}`)
  }
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
```

- [ ] **Step 3: Correr en dry-run**

Run: `cd backend && npm run seed:cordoba -- --dry-run`
Expected: reporte con `filasLeidas > 2000`, `filasInsertadas = 0` (dry-run no escribe), snapshot creado.

- [ ] **Step 4: Correr seed real**

Run: `cd backend && npm run seed:cordoba -- --force`
Expected: reporte con `filasInsertadas > 2000`, status='success'.

- [ ] **Step 5: Verificar idempotencia**

Run: `cd backend && npm run seed:cordoba`
Expected: status='skipped_unchanged' (mismo hash que la última corrida).

- [ ] **Step 6: Verificar snapshots en SQL**

```bash
cd backend && npx ts-node --transpile-only -e "import('./src/lib/snapshots.js').then(async m => { const s = await m.listSnapshots('seed:cordoba', 5); console.table(s.map(x => ({id:x.id.slice(0,8), status:x.status, ins:x.filasInsertadas, fecha:x.fechaCorrida.slice(0,19)}))); process.exit(0) });"
```
Expected: 2 snapshots — el primero `success`, el segundo `skipped_unchanged`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/connectors/cordoba-capital/index.ts backend/src/scripts/seed-cordoba.ts
git commit -m "refactor(cordoba): IngestReport pattern — snapshot tracking + skip-unchanged + dry-run (W1 pivote)"
```

---

## Task 9: Verificación end-to-end W1

**Files:**
- ninguno nuevo (solo verificación)

- [ ] **Step 1: Typecheck backend**

Run: `cd backend && npm run typecheck`
Expected: 0 errores.

- [ ] **Step 2: Run all tests**

Run: `cd backend && npm test`
Expected: tests existentes (222) + 10 nuevos (3 snapshots + 3 quarantine + 4 identidad-candidates) = **232 PASS**.

- [ ] **Step 3: Audit-trazabilidad**

Run: `cd backend && npm run audit-trazabilidad 2>&1 | tail -10` (si el script existe en package.json; si no, saltar).
Expected: 0 referencias huérfanas.

- [ ] **Step 4: Verificar tablas DuckDB nuevas**

```bash
cd backend && npx ts-node --transpile-only -e "import('./src/lib/db.js').then(async db => { await db.initDb(); const r = await db.dbAll(\"SELECT table_name FROM information_schema.tables WHERE table_schema='main' AND table_name IN ('snapshots','quarantine','identidad_candidates','entes_estatales_cordoba') ORDER BY 1\"); console.log('Tablas W1:', r.map(x => x.table_name)); process.exit(0); });"
```
Expected: 4 tablas listadas.

- [ ] **Step 5: Verificar Neo4j Estados + CONTIENE**

```bash
docker exec argos-neo4j cypher-shell -u neo4j -p argos_local "MATCH (n) RETURN labels(n)[0] AS label, count(n) AS n ORDER BY n DESC"
```
Expected: incluye `Estado: 3` además de los labels viejos.

- [ ] **Step 6: Verificar presupuesto cargado**

```bash
cd backend && npx ts-node --transpile-only -e "import('./src/lib/db.js').then(async db => { await db.initDb(); const r = await db.dbAll('SELECT COUNT(*) as n FROM presupuesto_ejecucion'); console.log('presupuesto_ejecucion:', r[0].n); process.exit(0); });"
```
Expected: > 100. Si sigue 0, abrir issue para diagnóstico extra.

- [ ] **Step 7: Reporte W1**

Crear `docs/REPORTE-MISION-CORDOBA-W1.md`:

```markdown
# Reporte W1 — Foundation Repair (2026-04-XX)

## Counts antes/después

| Tabla | Antes | Después | Δ |
|---|---|---|---|
| snapshots | 0 | N | +N |
| quarantine | 0 | M | +M |
| identidad_candidates | 0 | K | +K |
| entes_estatales_cordoba | 0 | 10 | +10 |
| presupuesto_ejecucion | 0 | XXX | +XXX |
| contratos | 2421 | 2421 | 0 (re-corrida idempotente) |

## Neo4j

| Label | Antes | Después |
|---|---|---|
| :Estado | 0 | 3 |
| :Reparticion | 450 | ~460 (+10 entes pivote) |
| Aristas :CONTIENE | 0 | ~460 |

## Tests

- vitest: 222 → 232 PASS
- typecheck backend: 0 errores
- audit-trazabilidad: 0 huérfanas

## Bloqueadores

(ninguno previsto, registrar si aparecen)

## Próximo

W2 — OCR zero-cost end-to-end
```

- [ ] **Step 8: Commit final W1**

```bash
git add docs/REPORTE-MISION-CORDOBA-W1.md
git commit -m "docs(W1): reporte foundation repair — bitemporal + snapshots + quarantine + Estado/Programa + presupuesto fix"
```

- [ ] **Step 9: Marcar W1 completed**

Use `TaskUpdate` para marcar Task #3 (W1) como completed y Task #4 (W2) como ready.

---

## Spec Coverage Self-Review

Los siguientes ítems del spec W1 (sección 10 del plan padre) están cubiertos:

- ✅ Fix parser `seed-cordoba-presupuesto.ts` (header dinámico) → Task 6
- ✅ Re-correr `seed:cordoba` todas versiones dataset 2 → Task 8 (con IngestReport + skip-unchanged)
- ✅ Modelo Neo4j extendido nodos `:Estado`, `:Programa` → Task 7
- ✅ Aristas `TRANSFIERE`, `CONTIENE`, `RECIBE_PRESUPUESTO`, `OCUPA_CARGO`, `PAGA_NOMINA` → Task 7
- ⚠️ Renombrar `EMITE` → `EMITE_CONTRATO`: pendiente (no incluido para evitar breaking change en query existentes; W2 lo agregará como alias y luego W3 deprecará el viejo)
- ✅ Migración Neo4j Estados + Reparticion `CONTIENE` → Task 7 step 7
- ✅ Tabla `snapshots` → Task 1
- ✅ Tabla `quarantine` → Task 2
- ✅ Tabla `identidad_candidates` → Task 3
- ✅ Bitemporal columns en tablas core → Task 4
- ✅ Refactor `seed:*` para `IngestReport` standard → Task 8 (solo cordoba-capital — los otros connectors migran en W3)
- ✅ Tabla `entes_estatales_cordoba` con 10 pivote → Task 5

## Notas para el ejecutor

- **Backups Neo4j**: hacer dump antes de cualquier migración destructiva (Task 7 step 6).
- **Idempotencia**: todas las migraciones (`migrate:bitemporal`, `migrate:neo4j-estados`) son idempotentes. Re-correrlas es seguro.
- **Si Neo4j no está corriendo**: `docker start argos-neo4j` y reintentar.
- **Si presupuesto sigue 0 tras Task 6**: abrir issue, no bloquear W2 — el grafo funciona sin presupuesto en T1.
- **OCR queda fuera de W1**: empieza en W2.
- **No tocar el frontend** en W1.
