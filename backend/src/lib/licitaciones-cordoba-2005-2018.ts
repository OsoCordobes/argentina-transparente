// lib/licitaciones-cordoba-2005-2018.ts — Carga el dataset 2 versión 4747:
// 2,777 llamados a licitación de Córdoba Capital entre 2005 y mayo 2018.
//
// IMPORTANTE: estos son LLAMADOS, no adjudicaciones. Tienen presupuesto_oficial
// (estimación al licitar) pero NO tienen proveedor adjudicatario ni monto final.
// Por eso van a una tabla separada `licitaciones_llamado` y no a `contratos`.
//
// Para conseguir el proveedor adjudicado:
//   - Cruzar `expediente` con normas del CSV histórico (ya cargadas vía
//     seed:cordoba-historico) — Asuntos como "Adjudicación licitación 28/18 a
//     EMPRESA X..." se cruzan por número de licitación + expediente.
//   - Los PDFs de adjudicación están en static.cordoba.gov.ar pero el servidor
//     responde 503 — fuente caída.

import * as XLSX from 'xlsx'
import crypto from 'crypto'
import { dbRun } from './db'

const DATASET_ID = '2'
const VERSION_ID = '4747'  // "Compras y Contrataciones 2005-2018"
const TIMEOUT_MS = 60_000

interface RecursoAPI {
  id: string
  titulo: string
  url: string
  formato?: string
  icono?: string
}

export interface LicitacionLlamado {
  municipio: string
  anio: number
  tipo: string
  categoria: string | null
  numero: string | null
  expediente: string | null
  titulo: string
  descripcion: string | null
  requiriente: string
  presupuestoOficial: number | null
  precioPliego: number | null
  apertura: string | null
  irExterno: string | null
  fuenteUrl: string
}

interface FilaXLSX {
  apertura?: string | number | null
  categoria?: string | null
  descripcion?: string | null
  expediente?: string | null
  ir?: string | null
  numero?: string | null
  precio_pliego?: number | string | null
  presupuesto_oficial?: number | string | null
  requiriente?: string | null
  tipo?: string | null
  titulo?: string | null
}

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        Accept: 'application/json,application/octet-stream,*/*',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

// Encuentra y descarga el XLS principal (no el de referencias).
async function descargarXLSX(): Promise<Buffer> {
  const res = await fetchWithTimeout(
    `https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/${DATASET_ID}/version-dato/${VERSION_ID}/recurso`
  )
  if (!res.ok) throw new Error(`API HTTP ${res.status} listando recursos de versión ${VERSION_ID}`)
  const data = await res.json() as { results: RecursoAPI[] }

  const r = data.results.find(rs => {
    const fmt = (rs.formato ?? rs.icono ?? '').toLowerCase()
    const tit = (rs.titulo ?? '').toLowerCase()
    return fmt.includes('xls') && tit.includes('licitaciones')
  })
  if (!r) throw new Error('XLS de licitaciones no encontrado en versión 4747')

  const xlsRes = await fetchWithTimeout(r.url)
  if (!xlsRes.ok) throw new Error(`HTTP ${xlsRes.status} descargando XLSX`)
  return Buffer.from(await xlsRes.arrayBuffer())
}

// Convierte string apertura en año + ISO date. Las aperturas vienen como
// "2018-06-11 09:00:00" en el XLSX original, ya parseado.
function parsearApertura(raw: unknown): { anio: number | null; iso: string | null } {
  if (raw === null || raw === undefined || raw === '') return { anio: null, iso: null }

  // Si ya es un Date object o se parsea como YYYY-MM-DD HH:MM
  const s = String(raw).trim()
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (m) {
    const anio = parseInt(m[1])
    if (anio >= 2000 && anio <= 2030) return { anio, iso: `${m[1]}-${m[2]}-${m[3]}T00:00:00` }
    return { anio: null, iso: null }
  }

  // Excel serial date
  const n = typeof raw === 'number' ? raw : parseFloat(s)
  if (!isNaN(n) && n >= 36526 && n <= 47848) {
    const ms = (n - 25569) * 86400 * 1000
    const date = new Date(ms)
    if (!isNaN(date.getTime())) {
      const anio = date.getFullYear()
      return { anio, iso: date.toISOString() }
    }
  }
  return { anio: null, iso: null }
}

function parseNumero(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[^0-9.,-]/g, '').replace(',', '.'))
  if (isNaN(n)) return null
  return n
}

export function parsearXLSX(buffer: Buffer): LicitacionLlamado[] {
  const wb = XLSX.read(buffer, { type: 'buffer', cellDates: true })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const filas = XLSX.utils.sheet_to_json<FilaXLSX>(sheet, { defval: null })

  const out: LicitacionLlamado[] = []
  let descartadas = 0

  for (const fila of filas) {
    if (!fila.titulo && !fila.descripcion) { descartadas++; continue }

    const { anio, iso: aperturaISO } = parsearApertura(fila.apertura)
    if (!anio) { descartadas++; continue }

    const titulo = String(fila.titulo ?? '').trim() || String(fila.descripcion ?? '').trim()
    if (!titulo) { descartadas++; continue }

    out.push({
      municipio: 'cordoba-capital',
      anio,
      tipo: String(fila.tipo ?? fila.categoria ?? 'Licitación').trim(),
      categoria: fila.categoria ? String(fila.categoria).trim() : null,
      numero: fila.numero ? String(fila.numero).trim() : null,
      expediente: fila.expediente ? String(fila.expediente).trim() : null,
      titulo,
      descripcion: fila.descripcion ? String(fila.descripcion).trim() : null,
      requiriente: String(fila.requiriente ?? '').trim(),
      presupuestoOficial: parseNumero(fila.presupuesto_oficial),
      precioPliego: parseNumero(fila.precio_pliego),
      apertura: aperturaISO,
      irExterno: fila.ir ? String(fila.ir).trim() : null,
      fuenteUrl: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/economia-y-finanzas/compras-y-contrataciones/2',
    })
  }

  if (descartadas > 0) {
    console.log(`[licitaciones-2005-2018] ${descartadas} filas descartadas (sin título/fecha válida)`)
  }
  return out
}

function hashLlamado(l: LicitacionLlamado): string {
  const key = `${l.municipio}|${l.expediente ?? ''}|${l.numero ?? ''}|${l.titulo}`
  return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16)
}

export async function insertarLlamados(llamados: LicitacionLlamado[]): Promise<number> {
  let inserted = 0
  const now = new Date().toISOString()
  for (const l of llamados) {
    const id = hashLlamado(l)
    try {
      await dbRun(
        `INSERT OR IGNORE INTO licitaciones_llamado VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, l.municipio, l.anio, l.tipo, l.categoria, l.numero, l.expediente,
          l.titulo, l.descripcion, l.requiriente, l.presupuestoOficial, l.precioPliego,
          l.apertura, l.irExterno, l.fuenteUrl, now,
        ]
      )
      inserted++
    } catch {
      // duplicate id — skip
    }
  }
  return inserted
}

export async function cargarLicitacionesHistoricas(): Promise<LicitacionLlamado[]> {
  console.log('[licitaciones-2005-2018] Descargando XLSX...')
  const buffer = await descargarXLSX()
  console.log(`[licitaciones-2005-2018] Tamaño: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)
  console.log('[licitaciones-2005-2018] Parseando...')
  const llamados = parsearXLSX(buffer)
  console.log(`[licitaciones-2005-2018] ${llamados.length.toLocaleString()} llamados parseados`)
  return llamados
}
