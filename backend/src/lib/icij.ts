// ICIJ Offshore Leaks Database — parser de CSVs bulk
//
// Descarga en: https://offshoreleaks.icij.org/pages/database
// Extraer el ZIP y pasar el directorio a seed:icij.
//
// Archivos del ZIP:
//   Entities.csv      — empresas, trusts, fundaciones offshore
//   Officers.csv      — personas/empresas con rol en una entidad offshore
//   Intermediaries.csv — intermediarios (estudios, bancos)
//   Addresses.csv     — domicilios
//   Relationships.csv — vínculos entre los anteriores
//
// Para ARGOS importamos Entities + Officers (los Intermediaries son más útiles
// para investigaciones de red, los Addresses tienen demasiado ruido).

import fs from 'fs'
import path from 'path'
import readline from 'readline'
import type { ICIJEntidad } from './db'

// Fuentes conocidas en el campo sourceID de ICIJ
const FUENTES_CONOCIDAS = [
  'Panama Papers',
  'Pandora Papers',
  'Paradise Papers',
  'Offshore Leaks',
  'Bahamas Leaks',
]

// ─── Parser CSV línea a línea (streaming — los archivos pueden ser >1GB) ──────

async function parsearCSV(
  filePath: string,
  onRow: (row: Record<string, string>) => void
): Promise<void> {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Archivo no encontrado: ${filePath}`)
  }

  const rl = readline.createInterface({
    input: fs.createReadStream(filePath, { encoding: 'utf8' }),
    crlfDelay: Infinity,
  })

  let headers: string[] = []
  let lineNum = 0

  for await (const line of rl) {
    lineNum++
    if (lineNum === 1) {
      headers = splitCSV(line)
      continue
    }
    if (!line.trim()) continue
    const values = splitCSV(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => { row[h.trim()] = (values[i] ?? '').trim() })
    onRow(row)
  }
}

// Divisor CSV básico que respeta campos entre comillas dobles
function splitCSV(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuote = false

  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (c === '"') {
      if (inQuote && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuote = !inQuote
      }
    } else if (c === ',' && !inQuote) {
      result.push(current)
      current = ''
    } else {
      current += c
    }
  }
  result.push(current)
  return result
}

function normFuente(raw: string): string {
  if (!raw) return 'ICIJ'
  for (const f of FUENTES_CONOCIDAS) {
    if (raw.includes(f)) return f
  }
  return raw.split(';')[0].trim() || 'ICIJ'
}

// ─── Parsers por tipo ─────────────────────────────────────────────────────────

export async function parsearEntidades(
  csvPath: string,
  onProgress?: (n: number) => void
): Promise<ICIJEntidad[]> {
  const entidades: ICIJEntidad[] = []
  let n = 0

  await parsearCSV(csvPath, (row) => {
    const nombre = (row['name'] ?? '').trim()
    if (!nombre) return

    entidades.push({
      nodeId: row['node_id'] ?? `e-${n}`,
      nombre,
      tipo: 'entity',
      jurisdiccion: row['jurisdiction'] || row['jurisdiction_description'] || null,
      countries: row['countries'] || null,
      countryCodes: row['country_codes'] || null,
      estado: row['status'] || null,
      fuente: normFuente(row['sourceID'] ?? ''),
      incorporacion: row['incorporation_date'] || null,
    })

    n++
    if (onProgress && n % 10_000 === 0) onProgress(n)
  })

  return entidades
}

export async function parsearOfficers(
  csvPath: string,
  onProgress?: (n: number) => void
): Promise<ICIJEntidad[]> {
  const officers: ICIJEntidad[] = []
  let n = 0

  await parsearCSV(csvPath, (row) => {
    const nombre = (row['name'] ?? '').trim()
    if (!nombre) return

    officers.push({
      nodeId: row['node_id'] ?? `o-${n}`,
      nombre,
      tipo: 'officer',
      jurisdiccion: null,
      countries: row['countries'] || null,
      countryCodes: row['country_codes'] || null,
      estado: row['status'] || null,
      fuente: normFuente(row['sourceID'] ?? ''),
      incorporacion: null,
    })

    n++
    if (onProgress && n % 10_000 === 0) onProgress(n)
  })

  return officers
}

// ─── Discovery de archivos en el directorio extraído ─────────────────────────
// El ZIP de ICIJ puede tener subdirectorios según la versión. Buscamos los
// archivos por nombre de forma case-insensitive.

export function encontrarArchivosICIJ(dirPath: string): {
  entities: string | null
  officers: string | null
} {
  if (!fs.existsSync(dirPath)) {
    throw new Error(`Directorio no encontrado: ${dirPath}`)
  }

  function findFile(dir: string, name: string): string | null {
    const entries = fs.readdirSync(dir, { withFileTypes: true })
    for (const e of entries) {
      const fullPath = path.join(dir, e.name)
      if (e.isFile() && e.name.toLowerCase() === name.toLowerCase()) return fullPath
      if (e.isDirectory()) {
        const found = findFile(fullPath, name)
        if (found) return found
      }
    }
    return null
  }

  return {
    entities: findFile(dirPath, 'Entities.csv'),
    officers: findFile(dirPath, 'Officers.csv'),
  }
}
