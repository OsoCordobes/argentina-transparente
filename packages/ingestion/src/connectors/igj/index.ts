import fs from 'fs'
import path from 'path'
import os from 'os'
import https from 'https'
import http from 'http'
import AdmZip from 'adm-zip'
import { v4 as uuidv4 } from 'uuid'
import type { Connector, SnapshotService, RawPayload } from '../../connector'
import type { Empresa, Persona } from '@argos/model'

// ─── IGJ Source ───────────────────────────────────────────────────────────────
// Fuente: datos.jus.gob.ar — "Entidades constituidas en la IGJ"
// Dataset: da045e06-35cb-4bdd-9b5e-ddee6712c86c
// Contenido: ZIP con entidades.csv + autoridades.csv
// Periodicidad: semestral
// Jurisdicción: IGJ solo cubre CABA (no Córdoba). Empresas que operan en Córdoba
// pueden estar registradas aquí si son nacionales o tienen domicilio legal en CABA.

const IGJ_SOURCE_URL = 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c'

// Semestres más recientes — más nuevo primero
// Se actualiza cada 6 meses aproximadamente
const IGJ_ZIP_SOURCES = [
  {
    label: '2026-S1',
    url: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/101ebb5b-bbb6-43b9-8929-27ab620443d5/download/igj-2026-semestre-1.zip',
  },
  {
    label: '2025-S2',
    url: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/fbcb0917-d298-479b-8fda-c314b4af33eb/download/igj-2025-semestre-2.zip',
  },
  {
    label: '2025-S1',
    url: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/some-placeholder-id/download/igj-2025-semestre-1.zip',
  },
]

// ─── CSV column names (from actual IGJ CSV, verified) ─────────────────────────
// The full CSV may contain more columns — we pick the ones we need.
const ENT_COL = {
  correlativo:        'numero_correlativo',
  cuit:               'cuit',
  razonSocial:        'razon_social',
  tipoSocietario:     'descripcion_tipo_societario',
  dadaDeBaja:         'dada_de_baja',
  // Extended fields — present in some semestres (optional, graceful if missing)
  fechaInscripcion:   'fecha_inscripcion',
  domicilio:          'domicilio',
  localidad:          'localidad',
  provincia:          'provincia',
}

const AUT_COL = {
  correlativo:        'numero_correlativo',
  apellidoNombre:     'apellido_nombre',
  tipoAdministrador:  'tipo_administrador',
  documento:          'numero_documento',
}

interface RawEntidad {
  numero_correlativo:        string | null
  cuit:                      string | null
  razon_social:              string | null
  descripcion_tipo_societario: string | null
  dada_de_baja:              string | null
  fecha_inscripcion?:        string | null
  domicilio?:                string | null
  localidad?:                string | null
  provincia?:                string | null
}

interface RawAutoridad {
  numero_correlativo:  string | null
  apellido_nombre:     string | null
  tipo_administrador:  string | null
  numero_documento:    string | null
}

export interface IGJParseResult {
  empresas:  Empresa[]
  personas:  Persona[]  // directors linked by correlativo
}

// ─── Download helper ─────────────────────────────────────────────────────────
function downloadToBuffer(url: string): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = []

    const request = (urlStr: string, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Too many redirects'))
      const mod = urlStr.startsWith('https') ? https : http
      mod.get(urlStr, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location, redirectCount + 1)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} for ${urlStr}`))
        }
        res.on('data', (chunk: Buffer) => chunks.push(chunk))
        res.on('end',  ()              => resolve(Buffer.concat(chunks)))
        res.on('error', reject)
      }).on('error', reject)
    }

    request(url)
  })
}

// ─── CSV parsing (simple — avoids csv-parse dep) ─────────────────────────────
function parseCSVBuffer(buf: Buffer): Record<string, string | null>[] {
  const text   = buf.toString('utf8')
  const lines  = text.split(/\r?\n/)
  if (lines.length < 2) return []

  const headers = parseCSVLine(lines[0])
  const rows: Record<string, string | null>[] = []

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = parseCSVLine(line)
    const row: Record<string, string | null> = {}
    headers.forEach((h, idx) => {
      const val = values[idx] ?? null
      row[h.trim().toLowerCase().replace(/\s+/g, '_')] = val === '' ? null : val
    })
    rows.push(row)
  }

  return rows
}

function parseCSVLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { current += '"'; i++ }
      else inQuotes = !inQuotes
    } else if (ch === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  result.push(current)
  return result
}

// ─── Entity builders ─────────────────────────────────────────────────────────
function buildEmpresas(rows: Record<string, string | null>[], sourceUrl: string, fetchedAt: Date, sha256: string, archivePath: string): Map<string, Empresa> {
  const map = new Map<string, Empresa>()

  for (const row of rows) {
    const cuitRaw = row[ENT_COL.cuit]
    if (!cuitRaw) continue
    const cuit = cuitRaw.replace(/-/g, '').trim()
    if (!/^\d{11}$/.test(cuit)) continue

    const razonSocial = row[ENT_COL.razonSocial]?.trim()
    if (!razonSocial) continue

    const dadaDeBaja = row[ENT_COL.dadaDeBaja]?.trim()
    const activa     = !dadaDeBaja

    let fechaConstitucion: Date | undefined
    const fechaRaw = row[ENT_COL.fechaInscripcion]?.trim()
    if (fechaRaw) {
      const d = new Date(fechaRaw)
      if (!isNaN(d.getTime())) fechaConstitucion = d
    }

    const domiciParts = [
      row[ENT_COL.domicilio]?.trim(),
      row[ENT_COL.localidad]?.trim(),
      row[ENT_COL.provincia]?.trim(),
    ].filter(Boolean)
    const domicilio = domiciParts.length > 0 ? domiciParts.join(', ') : undefined

    const correlativo = row[ENT_COL.correlativo]?.trim()

    const empresa: Empresa = {
      id:                  uuidv4(),
      nombre:              razonSocial,
      nombre_normalizado:  normEmpresa(razonSocial),
      cuit,
      estado:              activa ? 'activa' : 'inactiva',
      fecha_constitucion:  fechaConstitucion,
      domicilio,
      source_url:          sourceUrl,
      fetched_at:          fetchedAt,
      sha256,
      archive_path:        archivePath,
    }

    // Key by correlativo for linking directors, fallback to cuit
    map.set(correlativo ?? cuit, empresa)
  }

  return map
}

function buildPersonas(rows: Record<string, string | null>[], empresaMap: Map<string, Empresa>, sourceUrl: string, fetchedAt: Date, sha256: string, archivePath: string): Persona[] {
  const personas: Persona[] = []
  const seen = new Set<string>() // deduplicate by document number

  for (const row of rows) {
    const correlativo    = row[AUT_COL.correlativo]?.trim()
    const apellidoNombre = row[AUT_COL.apellidoNombre]?.trim()
    const tipoAdmin      = row[AUT_COL.tipoAdministrador]?.trim()
    const documento      = row[AUT_COL.documento]?.trim()

    if (!apellidoNombre) continue

    // Only include directors (A) and partners (S) — skip other roles
    if (tipoAdmin !== 'A' && tipoAdmin !== 'S') continue

    const dedupeKey = `${apellidoNombre}|${documento ?? ''}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    // Look up the empresa to cross-reference
    const empresa = correlativo ? empresaMap.get(correlativo) : undefined

    personas.push({
      id:                 uuidv4(),
      nombre:             apellidoNombre,
      nombre_normalizado: apellidoNombre.toUpperCase().trim(),
      dni:                documento ?? undefined,
      roles:              tipoAdmin === 'A' ? ['director'] : ['contratista'],
      source_url:         empresa?.source_url ?? sourceUrl,
      fetched_at:         fetchedAt,
      sha256,
      archive_path:       archivePath,
    })
  }

  return personas
}

function normEmpresa(nombre: string): string {
  return nombre
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .replace(/\b(S\.?A\.?|S\.?R\.?L\.?|S\.?A\.?S\.?|S\.?C\.?|S\.?H\.?|UTE|SA|SRL|SAS|SC|SH)\s*$/, '')
    .trim()
}

// ─── Connector ────────────────────────────────────────────────────────────────
// IGJ uses a specialized interface since it returns multiple entity types
export interface IGJConnector {
  id: string
  description: string
  fetchRaw(params?: Record<string, unknown>): Promise<RawPayload>
  parse(raw: RawPayload): IGJParseResult
  upsert(result: IGJParseResult): Promise<{ inserted: number; skipped: number }>
}

export function createIGJConnector(snapshotSvc: SnapshotService): IGJConnector {
  return {
    id:          'igj',
    description: 'IGJ — Inspección General de Justicia (CABA). datos.jus.gob.ar',

    async fetchRaw(_params?: Record<string, unknown>): Promise<RawPayload> {
      let lastError: Error | null = null

      for (const source of IGJ_ZIP_SOURCES) {
        try {
          console.log(`[igj] Trying ${source.label}: ${source.url}`)
          const buf = await downloadToBuffer(source.url)
          console.log(`[igj] Downloaded ${(buf.length / 1024 / 1024).toFixed(1)}MB`)
          return snapshotSvc.save('igj', buf, 'zip', source.url)
        } catch (err) {
          lastError = err instanceof Error ? err : new Error(String(err))
          console.warn(`[igj] ${source.label} failed: ${lastError.message}`)
        }
      }

      throw lastError ?? new Error('[igj] All sources failed')
    },

    parse(raw: RawPayload): IGJParseResult {
      const buf        = raw.data instanceof Buffer ? raw.data : Buffer.from(raw.data as string)
      const fetchedAt  = raw.fetched_at
      const sha256     = raw.sha256
      const archivePath = raw.archive_path

      // Extract CSVs from ZIP
      const zip       = new AdmZip(buf)
      const entEntry  = zip.getEntries().find((e: AdmZip.IZipEntry) => /entidades.*\.csv$/i.test(e.entryName))
      const autEntry  = zip.getEntries().find((e: AdmZip.IZipEntry) => /autoridades.*\.csv$/i.test(e.entryName))

      if (!entEntry || !autEntry) {
        const names = zip.getEntries().map((e: AdmZip.IZipEntry) => e.entryName).join(', ')
        throw new Error(`[igj] ZIP missing entidades.csv or autoridades.csv. Found: ${names}`)
      }

      const entRows = parseCSVBuffer(entEntry.getData())
      const autRows = parseCSVBuffer(autEntry.getData())

      const empresaMap = buildEmpresas(entRows, IGJ_SOURCE_URL, fetchedAt, sha256, archivePath)
      const personas   = buildPersonas(autRows, empresaMap, IGJ_SOURCE_URL, fetchedAt, sha256, archivePath)
      const empresas   = [...empresaMap.values()]

      console.log(`[igj] Parsed ${empresas.length.toLocaleString()} empresas, ${personas.length.toLocaleString()} personas`)
      return { empresas, personas }
    },

    async upsert(result: IGJParseResult): Promise<{ inserted: number; skipped: number }> {
      // Implemented in apps/api when DuckDB layer is wired.
      return { inserted: result.empresas.length + result.personas.length, skipped: 0 }
    },
  }
}
