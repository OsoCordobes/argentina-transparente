import crypto from 'crypto'
import { v4 as uuidv4 } from 'uuid'
import type { MunicipioConnector, SnapshotService, RawPayload } from '../../connector'
import type { Contrato } from '@argos/model'

// ─── Dataset version map ──────────────────────────────────────────────────────
// Verified against gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2/version-dato
// The portal publishes data with ~1 year lag. As of 2026-04-16, only 2019-2023 are published.
// New years are detected dynamically via the version-dato endpoint on each seed run.
// Status: 2024/2025/2026 — NOT PUBLISHED. The old portal (servicios.cordoba.gov.ar/licitaciones)
// was decommissioned; the new portal (compras.cordoba.gob.ar) has no bulk export API yet.
const KNOWN_VERSION_IDS: Record<number, string> = {
  2023: '6467',
  2022: '6466',
  2021: '5978',
  2020: '5977',
  2019: '2',
}

const API_BASE  = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos'
const DATO_ID   = '2'  // The "compras y contrataciones" dataset ID
const SOURCE_PAGE = 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/erogaciones/compras-y-contrataciones/2'

// Columns verified against real XLSX files for 2019-2023
const COL = {
  tipo:        'Tipo de proceso de contratación',
  proveedor:   'Denominación de empresas contratadas o entidad licitante',
  area:        'Área Gubernamental que la ejecuta',
  descripcion: 'Descripción',
  monto:       'Precio final de la contratación',
  anio:        'Año contratación',
  expediente:  'Número de expediente',
  nro:         'Número de resolución o decreto',
  fecha:       'Fecha de adjudicación',
} as const

async function fetchWithTimeout(url: string, ms = 30_000): Promise<Response> {
  const ctrl = new AbortController()
  const tid  = setTimeout(() => ctrl.abort(), ms)
  try {
    return await fetch(url, { signal: ctrl.signal })
  } finally {
    clearTimeout(tid)
  }
}

async function resolveVersionId(anio: number): Promise<string | null> {
  if (KNOWN_VERSION_IDS[anio]) return KNOWN_VERSION_IDS[anio]

  // Dynamic lookup — check if a new year has been published since last hardcoded
  const res = await fetchWithTimeout(`${API_BASE}/dato/${DATO_ID}/version-dato`)
  if (!res.ok) return null
  const data = await res.json() as { results: { id: string; titulo: string }[] }
  const match = data.results?.find(r => r.titulo.includes(String(anio)))
  return match?.id ?? null
}

async function fetchXLSXBuffer(versionId: string): Promise<{ buffer: Buffer; sourceUrl: string }> {
  const recursoUrl = `${API_BASE}/dato/${DATO_ID}/version-dato/${versionId}/recurso`
  const res = await fetchWithTimeout(recursoUrl)
  if (!res.ok) throw new Error(`API Córdoba error ${res.status} at ${recursoUrl}`)

  const data = await res.json() as { results: { url: string; titulo: string }[] }
  const recurso = data.results?.[0]
  if (!recurso?.url) throw new Error(`No recurso found for version ${versionId}`)

  const dlRes = await fetchWithTimeout(recurso.url, 90_000)
  if (!dlRes.ok) throw new Error(`Download error ${dlRes.status}: ${recurso.url}`)
  const arrayBuffer = await dlRes.arrayBuffer()
  return { buffer: Buffer.from(arrayBuffer), sourceUrl: recurso.url }
}

function parseXLSXRows(rows: Record<string, unknown>[], anio: number, sourceUrl: string, sha256: string, archivePath: string): Contrato[] {
  const fetchedAt = new Date()
  const contratos: Contrato[] = []

  for (const row of rows) {
    const proveedor = String(row[COL.proveedor] ?? '').trim()
    const tipo      = String(row[COL.tipo]      ?? '').trim()
    const montoRaw  = row[COL.monto]

    if (!proveedor || !tipo || !montoRaw) continue

    const monto = parseFloat(String(montoRaw).replace(/[^0-9.,-]/g, '').replace(',', '.'))
    if (isNaN(monto) || monto <= 0) continue

    const anioFinal = row[COL.anio] ? parseInt(String(row[COL.anio])) : anio
    if (isNaN(anioFinal)) continue

    const fechaRaw = row[COL.fecha] ? String(row[COL.fecha]).trim() : undefined
    let fecha: Date
    try {
      fecha = fechaRaw ? new Date(fechaRaw) : new Date(`${anioFinal}-07-01`)
      if (isNaN(fecha.getTime())) fecha = new Date(`${anioFinal}-07-01`)
    } catch {
      fecha = new Date(`${anioFinal}-07-01`)
    }

    contratos.push({
      id:                    uuidv4(),
      municipio_id:          'cordoba-capital',
      proveedor,
      proveedor_normalizado: normProveedor(proveedor),
      area:                  String(row[COL.area]        ?? '').trim() || undefined,
      descripcion:           String(row[COL.descripcion] ?? '').trim() || undefined,
      monto,
      moneda:                'ARS',
      fecha,
      anio:                  anioFinal,
      tipo:                  mapTipo(tipo),
      numero_expediente:     row[COL.expediente] ? String(row[COL.expediente]).trim() : undefined,
      numero:                row[COL.nro]         ? String(row[COL.nro]).trim()        : undefined,
      source_url:            sourceUrl,
      fetched_at:            fetchedAt,
      sha256,
      archive_path:          archivePath,
    })
  }

  return contratos
}

function normProveedor(nombre: string): string {
  return nombre
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|S\.?C\.?|S\.?H\.?|UTE|SA|SRL|SAS|SC|SH)\s*$/, '')
    .trim()
}

function mapTipo(raw: string): Contrato['tipo'] {
  const lower = raw.toLowerCase()
  if (lower.includes('licitación pública') || lower.includes('licitacion publica')) return 'licitacion_publica'
  if (lower.includes('licitación privada') || lower.includes('licitacion privada')) return 'licitacion_privada'
  if (lower.includes('directa') || lower.includes('compra directa')) return 'contratacion_directa'
  if (lower.includes('prórrog') || lower.includes('prorrog')) return 'prorroga'
  if (lower.includes('adenda')) return 'adenda'
  if (lower.includes('convenio')) return 'convenio'
  return 'otro'
}

// ─── Connector export ─────────────────────────────────────────────────────────
export function createCordobaCapitalConnector(
  snapshotSvc: SnapshotService,
): MunicipioConnector {
  return {
    id:                 'cordoba-capital',
    municipio_id:       'cordoba-capital',
    nombre:             'Municipalidad de Córdoba Capital',
    description:        'Compras y contrataciones — gobiernoabierto.cordoba.gob.ar',
    anios_disponibles:  Object.keys(KNOWN_VERSION_IDS).map(Number).sort(),

    async fetchRaw(params: Record<string, unknown>): Promise<RawPayload> {
      const anio = params['anio'] as number
      const versionId = await resolveVersionId(anio)
      if (!versionId) {
        throw new Error(
          `Año ${anio} no disponible en gobiernoabierto.cordoba.gob.ar. ` +
          `El portal publica con ~1 año de retraso. Último disponible: 2023. ` +
          `Para datos más recientes: compras.cordoba.gob.ar (sin API de bulk download aún).`
        )
      }
      const { buffer, sourceUrl } = await fetchXLSXBuffer(versionId)
      return snapshotSvc.save('cordoba-capital', buffer, 'xlsx', sourceUrl)
    },

    parse(raw: RawPayload): Contrato[] {
      // Dynamic import to keep xlsx out of tree if not needed
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const XLSX = require('xlsx') as typeof import('xlsx')
      const buf  = raw.data instanceof Buffer ? raw.data : Buffer.from(raw.data as string)
      const wb   = XLSX.read(buf, { type: 'buffer' })
      const ws   = wb.Sheets[wb.SheetNames[0]]
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: null, raw: false })
      // Infer year from source_url — fallback to current year
      const yearMatch = raw.source_url.match(/20(\d{2})/)
      const anio      = yearMatch ? 2000 + parseInt(yearMatch[1]) : new Date().getFullYear()
      return parseXLSXRows(rows, anio, raw.source_url, raw.sha256, raw.archive_path)
    },

    async upsert(_entities: Contrato[]): Promise<{ inserted: number; skipped: number }> {
      // Implemented in apps/api when DuckDB layer is wired.
      // Stub returns success so connector can be tested in isolation.
      return { inserted: _entities.length, skipped: 0 }
    },

    async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
      const all: Contrato[] = []
      for (let anio = anioDesde; anio <= anioHasta; anio++) {
        try {
          const raw      = await this.fetchRaw({ anio })
          const parsed   = this.parse(raw)
          all.push(...parsed)
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err)
          if (msg.includes('no disponible')) {
            console.warn(`[cordoba-capital] ${msg}`)
          } else {
            throw err
          }
        }
      }
      return all
    },
  }
}
