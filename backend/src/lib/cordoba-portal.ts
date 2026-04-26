// lib/cordoba-portal.ts — Cliente genérico para gobiernoabierto.cordoba.gob.ar
//
// El portal expone una API REST con todos los datasets municipales de Córdoba
// Capital. Este módulo abstrae el descubrimiento + descarga para que cada
// connector específico (presupuesto, sueldos, obras, etc.) solo defina:
//   - dataset_id
//   - mapeo de columnas → schema interno
//
// API endpoints:
//   GET /api/datos-abiertos/dato/<dataset_id>/version-dato
//     → lista de versiones (típicamente una por año o por mes)
//   GET /api/datos-abiertos/dato/<dataset_id>/version-dato/<version_id>/recurso
//     → lista de recursos (XLS/CSV/PDF/etc) descargables
//
// Las URLs de descarga son S3 signed URLs con expiración corta — siempre
// regenerarlas vía API en lugar de cachearlas.

import * as XLSX from 'xlsx'

const API_BASE = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos'
const TIMEOUT_MS = 60_000

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
  Accept: 'application/json,application/octet-stream,*/*',
}

export interface VersionPortal {
  id: string
  titulo: string
  descripcion?: string
  fechaInicio?: string
  fechaFin?: string
}

export interface RecursoPortal {
  id: string
  titulo: string
  url: string
  formato?: string
  icono?: string
  tamano?: number
}

async function fetchWithTimeout(url: string, init?: RequestInit): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, { ...init, signal: ctl.signal, headers: HEADERS })
  } finally {
    clearTimeout(timer)
  }
}

export async function listarVersionesDataset(datasetId: string): Promise<VersionPortal[]> {
  const url = `${API_BASE}/dato/${datasetId}/version-dato`
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`API HTTP ${res.status} dataset ${datasetId}`)
  const data = await res.json() as { results: VersionPortal[] }
  return data.results ?? []
}

export async function listarRecursosVersion(datasetId: string, versionId: string): Promise<RecursoPortal[]> {
  const url = `${API_BASE}/dato/${datasetId}/version-dato/${versionId}/recurso`
  const res = await fetchWithTimeout(url)
  if (!res.ok) throw new Error(`API HTTP ${res.status} versión ${versionId}`)
  const data = await res.json() as { results: RecursoPortal[] }
  return data.results ?? []
}

// Encuentra el primer recurso con formato preferido y descarga su contenido.
export async function descargarRecursoDeVersion(
  datasetId: string, versionId: string,
  formatosPref: string[] = ['xls', 'csv'],
): Promise<{ buffer: Buffer; recurso: RecursoPortal } | null> {
  const recursos = await listarRecursosVersion(datasetId, versionId)
  for (const fmtPref of formatosPref) {
    const r = recursos.find(rs => {
      const fmt = ((rs.formato ?? rs.icono ?? '') as string).toLowerCase()
      return fmt.includes(fmtPref.toLowerCase())
    })
    if (!r) continue
    const res = await fetchWithTimeout(r.url)
    if (!res.ok) continue
    return { buffer: Buffer.from(await res.arrayBuffer()), recurso: r }
  }
  return null
}

// Parser genérico XLSX/CSV → array de objetos. XLSX library lee ambos.
export function parsearTabla(buffer: Buffer): Record<string, unknown>[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
}

/**
 * Variante robusta a XLSX con filas-título antes del header real.
 * Lee el sheet como array de arrays, busca la primera fila que contenga
 * ≥`minMatches` palabras de `headerKeywords`, y la usa como header.
 *
 * Caso real: dataset 14/65/12 (Presupuesto Córdoba) tienen 1-2 filas con
 * títulos como "PRESUPUESTO GENERAL DE GASTOS PARA EL EJERCICIO 2024"
 * antes del header tabular ("Partida", "Programa", "Crédito Vigente", etc.).
 *
 * Si no encuentra header válido, fallback a parsearTabla() estándar.
 */
export function parsearTablaConHeaderDetectable(
  buffer: Buffer,
  headerKeywords: string[],
  opts?: { minMatches?: number; maxScanRows?: number }
): Record<string, unknown>[] {
  const minMatches = opts?.minMatches ?? 2
  const maxScanRows = opts?.maxScanRows ?? 10

  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  // Leer como AOA (array of arrays) para escanear celdas crudas
  const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: null,
    blankrows: false,
  })

  if (aoa.length === 0) return []

  const kwLower = headerKeywords.map(k => k.toLowerCase())
  let headerRowIdx = -1

  for (let i = 0; i < Math.min(maxScanRows, aoa.length); i++) {
    const row = aoa[i]
    if (!Array.isArray(row)) continue
    const cellsLower = row
      .filter((v): v is string | number => v !== null && v !== undefined)
      .map(v => String(v).toLowerCase())
    const matches = kwLower.filter(kw =>
      cellsLower.some(c => c.includes(kw))
    ).length
    if (matches >= minMatches) {
      headerRowIdx = i
      break
    }
  }

  if (headerRowIdx < 0) {
    // No encontramos header — fallback al parser estándar
    return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  }

  // Re-parse con range = headerRowIdx (XLSX usa "range" para skip filas)
  return XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: null,
    range: headerRowIdx,
  })
}

// Helper: extraer año de un título de versión ("Sueldos 2023-04", "Presupuesto 2018", etc.)
export function inferirAnioDesdeTitulo(titulo: string): number | null {
  const m = titulo.match(/\b(20\d{2}|19\d{2})\b/)
  if (!m) return null
  const a = parseInt(m[0])
  if (a >= 1990 && a <= 2030) return a
  return null
}

// Helper: extraer (anio, mes) de un título mensual ("Sueldos 2023-04" o "abril 2023")
const MESES_ES: Record<string, number> = {
  enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6,
  julio: 7, agosto: 8, septiembre: 9, octubre: 10, noviembre: 11, diciembre: 12,
}

export function inferirAnioMesDesdeTitulo(titulo: string): { anio: number | null; mes: number | null } {
  const tituloLower = titulo.toLowerCase()
  const anio = inferirAnioDesdeTitulo(titulo)

  // Patrón YYYY-MM
  const ym = titulo.match(/(\d{4})[-/](\d{1,2})/)
  if (ym) return { anio: parseInt(ym[1]), mes: parseInt(ym[2]) }

  // Mes en español
  for (const [nombre, num] of Object.entries(MESES_ES)) {
    if (tituloLower.includes(nombre)) return { anio, mes: num }
  }

  return { anio, mes: null }
}

// Convierte Excel serial date a YYYY-MM-DD string
export function excelDateToISO(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  // String ISO o DD/MM/YYYY
  if (typeof v === 'string') {
    const iso = v.match(/^(\d{4}-\d{2}-\d{2})/)
    if (iso) return iso[1]
    const dmy = v.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2, '0')}-${dmy[1].padStart(2, '0')}`
  }
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return null
    return v.toISOString().slice(0, 10)
  }
  if (typeof v === 'number') {
    if (v < 36526 || v > 47848) return null
    const ms = (v - 25569) * 86400 * 1000
    const d = new Date(ms)
    return isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  return null
}

// Helpers para parsear montos en formato AR ($1.234.567,89)
export function parseMontoAR(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'number') return isNaN(v) ? null : v
  const s = String(v).replace(/[^0-9.,-]/g, '').trim()
  if (!s) return null
  // Si tiene coma como decimal: '1.234.567,89' → '1234567.89'
  if (s.includes(',')) {
    const cleaned = s.replace(/\./g, '').replace(',', '.')
    const n = parseFloat(cleaned)
    return isNaN(n) ? null : n
  }
  const n = parseFloat(s)
  return isNaN(n) ? null : n
}
