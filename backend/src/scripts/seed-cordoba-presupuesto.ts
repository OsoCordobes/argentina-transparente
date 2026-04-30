// seed-cordoba-presupuesto.ts — Carga ejecución presupuestaria + presupuesto
// + recursos de Córdoba Capital desde gobiernoabierto.cordoba.gob.ar.
//
// Datasets:
//   - 14:  Presupuesto anual (20 versiones 2007-2026) — partidas asignadas
//   - 65:  Ejecución de erogaciones (41 versiones 2018-2025) — gasto real
//   - 12:  Ejecución de recursos (63 versiones 2018-2025) — recaudación
//   - 187: Cuenta General del Ejercicio (12 versiones 2014-2022). Solo v6461
//          (Cuenta Ahorro-Inversión-Financiamiento 2022) tiene XLS — el resto
//          son PDF y se procesan en M2 (OCR pipeline). Catalogamos las 12.
//
// IMPORTANTE: cada dataset tiene un schema XLSX **completamente distinto**:
//   - 14: 3 filas título, header en row 2 (CÁLCULO DE RECURSOS | __EMPTY |
//         Rentas Generales | Afectación Específica | TOTAL), datos desde row 3
//   - 65: 1 fila título, header row 1 (Partida | Presupuesto Vigente |
//         Comprometido | Compromiso/Presupuesto | Devengado | Devengado/Compromiso)
//   - 12: 2 filas título, header row 2 (CÁLCULO DE RECURSOS | __EMPTY |
//         "Recaudación a <mes>" | ...), datos desde row 3
//
// Por eso parseamos via AOA + extracción posicional por dataset, no via regex
// genérica. Cada fila → tabla `presupuesto_ejecucion`.

import 'dotenv/config'
import crypto from 'crypto'
import * as XLSX from 'xlsx'
import {
  initDb, dbRun, registrarFuente, registrarFuenteCatalogo,
} from '../lib/db'
import {
  listarVersionesDataset, descargarRecursoDeVersion,
  inferirAnioMesDesdeTitulo, parseMontoAR,
} from '../lib/cordoba-portal'
import type { FuenteMetadata } from '../types'

const JURISDICCION = 'cordoba-capital'

interface DatasetPresup {
  datasetId: string
  tipo: 'presupuesto' | 'erogaciones' | 'recursos'
  nombre: string
}

const DATASETS: DatasetPresup[] = [
  { datasetId: '14', tipo: 'presupuesto', nombre: 'Presupuesto anual' },
  { datasetId: '65', tipo: 'erogaciones', nombre: 'Ejecución de erogaciones' },
  { datasetId: '12', tipo: 'recursos', nombre: 'Ejecución de recursos' },
]

const DATASET_187_ID = '187'
const DATASET_187_NOMBRE = 'Cuenta General del Ejercicio'

interface FilaPresup {
  programa: string | null
  partida: string | null
  partidaNombre: string | null
  creditoInicial: number | null
  creditoVigente: number | null
  devengado: number | null
  pagado: number | null
}

/**
 * Lee el XLSX como AOA (array de arrays) para acceder posicionalmente a celdas.
 * Devuelve sheets como matrices crudas para que cada extractor por dataset
 * busque sus columnas reales.
 */
function leerSheetsAOA(buffer: Buffer): { nombre: string; filas: unknown[][] }[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  return wb.SheetNames.map(nombre => ({
    nombre,
    filas: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[nombre], {
      header: 1,
      defval: null,
      blankrows: false,
    }),
  }))
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null
  const s = String(v).trim()
  return s ? s : null
}

/**
 * Encuentra el índice del header tabular en una matriz AOA.
 * Busca la primera fila donde alguna celda contenga al menos uno de los
 * keywords (case-insensitive, sustring match).
 *
 * Devuelve -1 si no encuentra.
 */
function encontrarHeaderRow(filas: unknown[][], keywordsAny: string[], maxScan = 8): number {
  const kws = keywordsAny.map(k => k.toLowerCase())
  for (let i = 0; i < Math.min(maxScan, filas.length); i++) {
    const cells = (filas[i] ?? []).map(c =>
      c === null || c === undefined ? '' : String(c).toLowerCase()
    )
    for (const kw of kws) {
      if (cells.some(c => c.includes(kw))) return i
    }
  }
  return -1
}

/**
 * Mapea por nombre canónico (normalizado) cada celda del header a su columna.
 * Devuelve diccionario { canonName: colIdx }.
 */
function mapearColumnasHeader(headerRow: unknown[], aliases: Record<string, RegExp[]>): Record<string, number> {
  const map: Record<string, number> = {}
  for (let i = 0; i < headerRow.length; i++) {
    const cell = headerRow[i]
    if (cell === null || cell === undefined) continue
    const cellStr = String(cell).trim()
    for (const [canonical, regexes] of Object.entries(aliases)) {
      if (map[canonical] !== undefined) continue
      if (regexes.some(r => r.test(cellStr))) {
        map[canonical] = i
      }
    }
  }
  return map
}

// ─── Extractor Dataset 14 (Presupuesto anual) ──────────────────────────────
//
// Estructura típica:
//   row 0-1: títulos (EXPEDIENTE..., PRESUPUESTO GENERAL...)
//   row 2:   header tabular: __EMPTY | __EMPTY | "Rentas Generales" |
//            "Afectación Específica" | "TOTAL"
//   row 3+:  datos: <codigo> | <denominacion> | <rentas> | <afectacion> | <total>
//
// El presupuesto anual NO distingue inicial/vigente/devengado/pagado — es la
// foto sancionada inicial. Lo cargamos como creditoInicial=total.
function extraerDataset14(filas: unknown[][]): FilaPresup[] {
  const headerIdx = encontrarHeaderRow(filas, ['rentas generales', 'afectación', 'afectacion', 'total'], 8)
  if (headerIdx < 0) return []
  const header = filas[headerIdx] ?? []

  // Buscar columnas con regex sobre cell strings
  const cols = mapearColumnasHeader(header, {
    rentas: [/rentas\s+generales/i],
    afectacion: [/afectaci[óo]n/i],
    total: [/^total$/i, /\btotal\b/i],
  })

  // Si no encontramos las 3 columnas de monto, abortar
  if (cols.total === undefined && cols.rentas === undefined) return []

  const out: FilaPresup[] = []
  for (let i = headerIdx + 1; i < filas.length; i++) {
    const row = filas[i] ?? []
    // Las primeras 2 columnas suelen ser código de partida + denominación.
    // En los XLSX que vimos: col 0 = codigo (ej "1.01.01"), col 1 = nombre.
    const partida = asString(row[0])
    const partidaNombre = asString(row[1])

    if (!partida && !partidaNombre) continue
    // Filas de subtotal "INGRESOS TOTALES" tienen partida=null pero nombre. Las dejamos.

    const total = cols.total !== undefined ? parseMontoAR(row[cols.total]) : null
    const rentas = cols.rentas !== undefined ? parseMontoAR(row[cols.rentas]) : null
    const afect = cols.afectacion !== undefined ? parseMontoAR(row[cols.afectacion]) : null
    const monto = total ?? (rentas !== null && afect !== null ? rentas + afect : rentas ?? afect)

    if (monto === null) continue

    out.push({
      programa: null,
      partida,
      partidaNombre,
      creditoInicial: monto,
      creditoVigente: null,
      devengado: null,
      pagado: null,
    })
  }
  return out
}

// ─── Extractor Dataset 65 (Ejecución de erogaciones) ───────────────────────
//
// Estructura típica (2020+):
//   row 0:   "EJECUCIÓN DEL GASTO AL <fecha>"
//   row 1:   header: Partida | Presupuesto Vigente | Comprometido |
//            Compromiso/Presupuesto | Devengado | Devengado/Compromiso
//   row 2+:  datos por partida agregada (PERSONAL, BIENES DE CONSUMO, etc.)
//
// Estructura 2019 (v5502, etc):
//   row 0-1: títulos
//   row 2:   header: ø | Denominación | Definitivo | Comprometido | % de ejecución | Devengado* | %
//   row 3+:  datos
//
// Estructura 2018 y anteriores (v4790, etc):
//   row 0-2: títulos
//   row 3:   header: P.Pr. | DENOMINACION | DEFINITIVO (A) | COMPROMISO (B) | % | COMPROMISO DEPURADO(*) | %
//   row 4+:  datos. NB: usa "COMPROMISO" (no "Comprometido") y "DEFINITIVO" (no "Vigente").
//
// Multi-sheet: a veces hay "Cuadro" + "Cuadro (2)" — procesamos ambas.
function extraerDataset65(filas: unknown[][]): FilaPresup[] {
  // Keywords amplias: "compromiso" cubre "COMPROMISO (B)" y "Comprometido"; "denomina"
  // cubre "DENOMINACION" / "Denominación"; "definitivo" cubre formato 2018-2019.
  const headerIdx = encontrarHeaderRow(
    filas,
    ['partida', 'comprometido', 'compromiso', 'devengado', 'presupuesto vigente', 'definitivo', 'denomina'],
    8
  )
  if (headerIdx < 0) return []
  const header = filas[headerIdx] ?? []

  const cols = mapearColumnasHeader(header, {
    // partidaNombre puede ser "Partida" (2020+), "Denominación" (2019) o "DENOMINACION" (2018-)
    partidaNombre: [/^partida$/i, /denomina/i],
    // presupuestoVigente puede ser "Presupuesto Vigente" (2020+) o "Definitivo" / "DEFINITIVO (A)" (2018-2019)
    presupuestoVigente: [/presupuesto\s+vigente/i, /\bvigente\b/i, /definitivo/i],
    // comprometido: "Comprometido" (2020+) o "COMPROMISO (B)" / "COMPROMISO DEPURADO" (2018-2019).
    // Aceptamos compromiso depurado solo si no hay otro
    comprometido: [/^comprometido$/i, /^compromiso(\s|$|\()/i, /\bcomprometido\b/i],
    devengado: [/^devengado\*?$/i, /\bdeveng/i],
  })

  if (cols.partidaNombre === undefined) return []

  // En el formato 2018, la columna 0 es "P.Pr." con un código numérico (1, 2, 3, ...).
  // Lo capturamos como `partida` para preservar trazabilidad.
  const tieneCodigoIzquierda = cols.partidaNombre > 0

  const out: FilaPresup[] = []
  for (let i = headerIdx + 1; i < filas.length; i++) {
    const row = filas[i] ?? []
    const partidaNombre = asString(row[cols.partidaNombre])
    if (!partidaNombre) continue
    // Skip rows where the "name" looks like a ratio header repeat
    if (/^[\d.,%]+$/.test(partidaNombre)) continue
    // Skip filas con texto pero sin valor numérico real (notas al pie, totales)
    if (/^\s*\*/.test(partidaNombre)) continue

    let partida: string | null = null
    if (tieneCodigoIzquierda) {
      const v = asString(row[0])
      // Aceptamos códigos jerárquicos ("1.01.01") o números simples ("1", "2")
      if (v && /^[\d.]+$/.test(v)) partida = v
    }

    const presVigente = cols.presupuestoVigente !== undefined ? parseMontoAR(row[cols.presupuestoVigente]) : null
    const comprometido = cols.comprometido !== undefined ? parseMontoAR(row[cols.comprometido]) : null
    const devengado = cols.devengado !== undefined ? parseMontoAR(row[cols.devengado]) : null

    if (presVigente === null && comprometido === null && devengado === null) continue

    out.push({
      programa: null,
      partida,
      partidaNombre,
      creditoInicial: null,
      creditoVigente: presVigente,
      devengado: devengado ?? comprometido,  // si no hay devengado, comprometido es la mejor proxy
      pagado: null,
    })
  }
  return out
}

// ─── Extractor Dataset 12 (Ejecución de recursos) ──────────────────────────
//
// Estructura típica (2025):
//   row 0:   "CÁLCULO DE RECURSOS PARA EL EJERCICIO 2025"
//   row 1:   "CÁLCULO DE RECURSOS" | __EMPTY | "Recaudación a <mes>"
//   row 2:   "INGRESOS TOTALES" en col 3, total en col 4
//   row 3+:  datos: codigo1 | codigo2 | codigo_jerarquico | concepto | recaudado
//
// Estructura 2019 (v5337):
//   row 0:   "EJECUCIÓN DE RECURSOS 2019"
//   row 1:   "C O N C E P T O" | ø | "Provisoria Acum. Sept" | "Proyección Total 2019"
//   row 2+:  datos. Concepto está en col 1, montos en cols 2 y 3. Col 0 puede ser código.
//
// Versiones más viejas (2016, "Trimestre II 2016") podrían tener layout
// distinto; para esas, fallback al primer header detectable con keyword "concepto".
function extraerDataset12(filas: unknown[][]): FilaPresup[] {
  // Normalizamos el contenido al buscar header — el formato 2019 tiene
  // "C O N C E P T O" (con espacios) que no matchea "concepto" literal.
  // Hacemos un encontrarHeaderRow custom que también remueve espacios internos.
  const kwLower = ['cálculo de recursos', 'calculo de recursos', 'recaudaci', 'concepto', 'provisoria', 'proyecci']
  let headerIdx = -1
  for (let i = 0; i < Math.min(8, filas.length); i++) {
    const cells = (filas[i] ?? []).map(c =>
      c === null || c === undefined ? '' : String(c).toLowerCase()
    )
    // Versión "C O N C E P T O" → quitamos whitespace para comparar
    const cellsNoSpaces = cells.map(c => c.replace(/\s+/g, ''))
    const match = kwLower.some(kw => {
      const kwNs = kw.replace(/\s+/g, '')
      return cells.some(c => c.includes(kw)) ||
             cellsNoSpaces.some(c => c.includes(kwNs))
    })
    if (match) { headerIdx = i; break }
  }
  if (headerIdx < 0) return []
  const header = filas[headerIdx] ?? []

  // Para mapear columnas, también consideramos el header "espaciado" como concepto.
  // mapearColumnasHeader compara la celda original vs regex. Si la celda es
  // "C O N C E P T O", agregamos un regex que la matchee.
  const cols = mapearColumnasHeader(header, {
    concepto: [/c[áa]lculo\s+de\s+recursos/i, /^concepto$/i, /denomina/i, /^c\s+o\s+n\s+c\s+e\s+p\s+t\s+o$/i],
    recaudado: [/recaudaci/i, /recaudad/i, /provisoria/i, /acum/i],
  })

  if (cols.concepto === undefined) return []

  // Determinar columnas de monto: si no hay "recaudado" explícito, asumir
  // que la primera columna numérica a la derecha del concepto es el calculado.
  const out: FilaPresup[] = []
  for (let i = headerIdx + 1; i < filas.length; i++) {
    const row = filas[i] ?? []
    // Concepto típicamente está en cols.concepto pero el código de partida
    // puede estar a la izquierda
    const concepto = asString(row[cols.concepto])
    if (!concepto) continue

    // Buscar el código jerárquico (ej "1.01.01") en cualquier columna anterior
    let partida: string | null = null
    for (let c = 0; c < cols.concepto; c++) {
      const v = asString(row[c])
      if (v && /^\d+(\.\d+)+$/.test(v)) { partida = v; break }
    }

    let recaudado: number | null = null
    if (cols.recaudado !== undefined) {
      recaudado = parseMontoAR(row[cols.recaudado])
    }
    // Fallback: scan numeric cells right of concepto
    if (recaudado === null) {
      for (let c = cols.concepto + 1; c < row.length; c++) {
        const v = parseMontoAR(row[c])
        if (v !== null) { recaudado = v; break }
      }
    }

    if (recaudado === null) continue

    out.push({
      programa: null,
      partida,
      partidaNombre: concepto,
      creditoInicial: recaudado,  // recursos: lo "asignado" es lo presupuestado/calculado
      creditoVigente: null,
      devengado: null,
      pagado: recaudado,  // y lo "pagado" en recursos es lo recaudado
    })
  }
  return out
}

function extraerFilas(d: DatasetPresup, sheets: { nombre: string; filas: unknown[][] }[]): FilaPresup[] {
  const allFilas: FilaPresup[] = []
  for (const s of sheets) {
    let filas: FilaPresup[] = []
    if (d.tipo === 'presupuesto') filas = extraerDataset14(s.filas)
    else if (d.tipo === 'erogaciones') filas = extraerDataset65(s.filas)
    else if (d.tipo === 'recursos') filas = extraerDataset12(s.filas)
    allFilas.push(...filas)
  }
  return allFilas
}

async function procesarDataset(d: DatasetPresup): Promise<number> {
  console.log(`\n=== Dataset ${d.datasetId} (${d.nombre}) ===`)
  let versiones: Awaited<ReturnType<typeof listarVersionesDataset>>
  try {
    versiones = await listarVersionesDataset(d.datasetId)
  } catch (err) {
    console.warn(`  ✗ Error: ${(err as Error).message}`)
    return 0
  }
  console.log(`  ${versiones.length} versiones`)

  let totalInserted = 0
  const now = new Date().toISOString()
  let skipSinAnio = 0
  let skipSinXls = 0
  let procesadas = 0

  for (const v of versiones) {
    const { anio, mes } = inferirAnioMesDesdeTitulo(v.titulo)
    if (!anio) { skipSinAnio++; continue }

    let descarga: Awaited<ReturnType<typeof descargarRecursoDeVersion>>
    try {
      descarga = await descargarRecursoDeVersion(d.datasetId, v.id, ['xls', 'xlsx', 'csv'])
    } catch {
      skipSinXls++; continue
    }
    if (!descarga) { skipSinXls++; continue }
    procesadas++

    const sheets = leerSheetsAOA(descarga.buffer)
    const filas = extraerFilas(d, sheets)

    let nuevos = 0
    for (const f of filas) {
      // Saltar filas vacías
      if (
        f.creditoInicial === null && f.creditoVigente === null &&
        f.devengado === null && f.pagado === null
      ) continue
      if (!f.programa && !f.partida && !f.partidaNombre) continue

      const id = crypto.createHash('sha256').update([
        JURISDICCION, anio, mes ?? '', d.datasetId,
        f.partida ?? '', f.partidaNombre ?? '', f.programa ?? '',
        f.creditoInicial ?? '', f.creditoVigente ?? '', f.devengado ?? '', f.pagado ?? '',
      ].join('|')).digest('hex').slice(0, 16)

      try {
        // Lista de columnas explícita para no romper si se agregan columnas
        // bitemporales (t_efectivo, snapshot_id, etc.) por migración futura.
        await dbRun(
          `INSERT OR IGNORE INTO presupuesto_ejecucion (
            id, jurisdiccion, anio, trimestre,
            jurisdiccion_codigo, jurisdiccion_nombre,
            programa, partida, partida_nombre,
            credito_inicial, credito_vigente, devengado, pagado,
            fuente_url, cargado_en
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            id, JURISDICCION, anio,
            mes ? Math.ceil(mes / 3) : null,
            null, null,
            f.programa, f.partida, f.partidaNombre,
            f.creditoInicial, f.creditoVigente, f.devengado, f.pagado,
            descarga.recurso.url.split('?')[0], now,
          ]
        )
        nuevos++
      } catch (err) {
        // Log primer error para diagnosticar (e.g. type mismatch). Después suprimir.
        if (nuevos === 0) console.warn(`    INSERT err: ${(err as Error).message}`)
      }
    }

    if (nuevos > 0) {
      console.log(`  v${v.id} (${anio}${mes ? '-' + String(mes).padStart(2, '0') : ''}): ${nuevos} filas (${filas.length} parseadas)`)
    } else if (filas.length > 0) {
      console.log(`  v${v.id} (${anio}): 0 insertadas de ${filas.length} parseadas (sample: ${JSON.stringify(filas[0]).slice(0, 150)})`)
    } else {
      // Versión bajada pero parser no extrajo nada — log discreto
      console.log(`  v${v.id} (${anio}): 0 filas extraidas (sheet schema desconocido)`)
    }
    totalInserted += nuevos
  }

  console.log(`  → procesadas ${procesadas}, sin año ${skipSinAnio}, sin xls/csv ${skipSinXls}`)
  return totalInserted
}

async function main() {
  console.log('=== ARGOS — Seed Presupuesto Córdoba Capital ===\n')
  await initDb()

  await registrarFuente({
    id: 'cordoba-capital-presupuesto',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/economia-y-finanzas/14',
    formato: 'XLSX (CKAN)',
    oficial: true,
    nivelConfianza: 'alto',
    notas: 'Datasets 14 (presupuesto anual 2007-2026), 65 (ejecución erogaciones mensual 2018-2025), 12 (ejecución recursos mensual 2018-2025). Datos verbatim — base de detección de partidas anómalas.',
  } as FuenteMetadata)

  for (const d of DATASETS) {
    await registrarFuenteCatalogo({
      id: `cordoba-capital-presupuesto-${d.datasetId}`,
      jurisdiccion: 'cordoba-capital',
      organismo: 'Municipalidad de Córdoba',
      dimension: 'presupuesto',
      nombre: d.nombre,
      descripcion: `Dataset ${d.datasetId} — ${d.tipo}`,
      urlOficial: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/dato/${d.datasetId}`,
      formato: 'XLSX',
      coberturaDesde: d.datasetId === '14' ? 2007 : 2018,
      coberturaHasta: 2026,
      volumenEstimado: 'mensual o anual según dataset',
      estadoImplementacion: 'implementado',
      razonBloqueo: null,
      conectorId: 'seed:cordoba-presupuesto',
    })
  }

  await registrarFuenteCatalogo({
    id: `cordoba-capital-presupuesto-${DATASET_187_ID}`,
    jurisdiccion: 'cordoba-capital',
    organismo: 'Municipalidad de Córdoba',
    dimension: 'presupuesto',
    nombre: DATASET_187_NOMBRE,
    descripcion: 'Dataset 187 — Cuenta General Ejercicio anual auditada. 11 de 12 versiones son PDF (requiere OCR M2). v6461 (2022) tiene XLS pero formato resumen ahorro-inversión, requiere tabla dedicada.',
    urlOficial: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/dato/${DATASET_187_ID}`,
    formato: 'PDF (mayor) + XLS (1 versión)',
    coberturaDesde: 2014,
    coberturaHasta: 2022,
    volumenEstimado: '12 versiones (1 XLS + 11 PDF)',
    estadoImplementacion: 'pendiente',
    razonBloqueo: '11/12 versiones son PDF — pipeline OCR pendiente (M2). XLS único requiere tabla dedicada cuenta_general_resumen.',
    conectorId: null,
  })

  let totalGlobal = 0
  for (const d of DATASETS) {
    totalGlobal += await procesarDataset(d)
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Filas en presupuesto_ejecucion: ${totalGlobal.toLocaleString()}`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
