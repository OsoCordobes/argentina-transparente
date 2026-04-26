// lib/afip-padron-empleadores.ts — Cliente para padrón nacional de empresas
// con CUIT individual (datos.jus.gob.ar — Registro Nacional de Sociedades).
//
// Contexto: el plan original apuntaba a `datos.gob.ar/dataset/sspm-padron-puc-cuit-empresas`
// pero ese dataset (SSPM PUC) está dado de baja (404 en abril 2026). El reemplazo
// vigente con cobertura per-CUIT a nivel nacional es el Registro Nacional de
// Sociedades publicado por el Ministerio de Justicia, que cubre todas las personas
// jurídicas registradas (S.A., S.R.L., asociaciones, fundaciones, cooperativas).
//
// Nota: el archivo bulk anual (~hundreds of MB) viene en ZIP. Para evitar
// dependencia adicional, este lib espera un CSV ya descomprimido en `destPath`,
// o el muestreo público (CSV ~MB). El script seed-afip-padron.ts maneja la
// descarga; este módulo se enfoca en parser streaming line-by-line para evitar
// cargar el archivo completo en memoria (>500MB en algunos años).
//
// Licencia fuente: Creative Commons Attribution 4.0.
// Frecuencia: mensual.

import https from 'https'
import fs from 'fs'
import readline from 'readline'

// URL del muestreo (CSV liviano) — útil para smoke tests sin descargar el bulk.
// El bulk completo vive en archivos ZIP por año desde 2019; el seed-script puede
// apuntar a cualquier CSV con el mismo schema.
export const AFIP_PADRON_URL =
  'https://datos.jus.gob.ar/dataset/ee83de85-4305-4c53-9a9f-fd3d15e42c36/resource/6096331b-0511-4728-b01b-6c6b535f4c2b/download/registro-nacional-sociedades-muestreo.csv'

/**
 * Descarga el CSV del padrón a `destPath` por stream HTTPS.
 * Maneja redirects 301/302 una vez (sin loop).
 */
export async function descargarPadron(destPath: string, url: string = AFIP_PADRON_URL): Promise<void> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, res => {
      // Redirect handling (CKAN sirve via S3 con 302 ocasional)
      if (res.statusCode === 301 || res.statusCode === 302) {
        const next = res.headers.location
        if (!next) return reject(new Error(`Redirect ${res.statusCode} sin Location`))
        res.resume() // drain
        descargarPadron(destPath, next).then(resolve).catch(reject)
        return
      }
      if (res.statusCode !== 200) {
        return reject(new Error(`HTTP ${res.statusCode} descargando padrón`))
      }
      const file = fs.createWriteStream(destPath)
      res.pipe(file)
      file.on('finish', () => { file.close(); resolve() })
      file.on('error', reject)
    })
    req.on('error', reject)
  })
}

export interface AfipEmpresa {
  cuit: string
  razon_social: string
  actividad: string
  inicio_actividades: string | null
  estado: string
}

/**
 * Parser streaming line-by-line. El CSV puede ser >500MB en versiones bulk,
 * así que NUNCA cargar entero en memoria. Yield una empresa por fila válida.
 *
 * El header del Registro Nacional de Sociedades suele tener columnas como:
 *   "fecha_corte", "tipo", "denominacion", "cuit", "fecha_inscripcion",
 *   "estado", "objeto_social", "duracion", ...
 *
 * Mapeamos con flexibilidad — si una columna no aparece, usar fallback.
 */
export async function* parsearPadronStream(filePath: string): AsyncGenerator<AfipEmpresa> {
  const stream = fs.createReadStream(filePath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })
  let header: string[] | null = null

  for await (const line of rl) {
    if (!line.trim()) continue
    const cols = parseCsvLine(line)
    if (!header) {
      header = cols.map(s => s.toLowerCase().trim().replace(/\s+/g, '_'))
      continue
    }
    const row = Object.fromEntries(header.map((h, i) => [h, cols[i] ?? '']))
    const cuitRaw = String(
      row.cuit ?? row.c_u_i_t ?? row.cuit_empresa ?? ''
    )
    const cuit = cuitRaw.replace(/[-\s]/g, '')
    if (!/^\d{11}$/.test(cuit)) continue
    yield {
      cuit,
      razon_social: String(
        row.razon_social ?? row.denominacion ?? row.nombre ?? ''
      ).trim(),
      actividad: String(
        row.actividad ?? row.objeto_social ?? row.tipo ?? ''
      ).trim(),
      inicio_actividades: (
        row.inicio_actividades ||
        row.fecha_inscripcion ||
        row.fecha_alta ||
        null
      ) || null,
      estado: String(row.estado ?? 'activo').trim() || 'activo',
    }
  }
}

/**
 * Parser CSV minimal pero correcto: respeta comillas dobles + escape `""`.
 * No maneja newlines dentro de campos (no aparecen en este dataset).
 */
export function parseCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (ch === ',' && !inQuotes) {
      out.push(cur)
      cur = ''
    } else {
      cur += ch
    }
  }
  out.push(cur)
  return out
}
