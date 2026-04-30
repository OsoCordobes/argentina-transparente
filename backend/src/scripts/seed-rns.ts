// seed-rns.ts — Carga el Registro Nacional de Sociedades (RNS) desde
// datos.jus.gob.ar/dataset/registro-nacional-de-sociedades.
//
// El RNS es snapshot mensual/trimestral de TODAS las personas jurídicas
// argentinas (SA, SRL, SAS, asociaciones, mutuales). Cubre las 24
// jurisdicciones — distinto de IGJ que es solo CABA.
//
// Cada año está empaquetado como ZIP que contiene 2-4 CSVs (snapshots por
// mes/trimestre). Cada CSV tiene ~1M filas. El sufijo de nombre de archivo
// indica el período (ej. registro-nacional-sociedades-201909.csv).
//
// Uso:
//   npm run seed:rns                       # solo Córdoba (default, ~50K filas)
//   npm run seed:rns -- --all              # nacional completo (~16M filas)
//   npm run seed:rns -- --anio 2024        # solo año
//   npm run seed:rns -- --force            # re-descargar zips ya cacheados
//
// Por defecto filtra a registros con domicilio fiscal o legal en provincia
// CORDOBA (case-insensitive). Esto reduce volumen de 16M → ~150K (acumulado
// 2019-2026, dedup por CUIT+fecha_actualizacion).

import 'dotenv/config'
import { initDb, dbRun } from '../lib/db'
import AdmZip from 'adm-zip'
import crypto from 'crypto'
import fs from 'fs'
import path from 'path'
import readline from 'readline'

const PACKAGE_ID = 'registro-nacional-de-sociedades'
const CKAN_BASE = 'https://datos.jus.gob.ar/api/3/action/package_show'
const CACHE_DIR = path.join(process.cwd(), 'data', 'cache', 'rns')

interface CKANResource {
  id: string
  name: string
  format: string
  url: string
  size?: number
}

interface CKANPackageResponse {
  result: {
    title: string
    resources: CKANResource[]
  }
  success: boolean
}

interface Args {
  all: boolean
  anio: number | null
  force: boolean
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const args: Args = { all: false, anio: null, force: false }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--all') args.all = true
    else if (a[i] === '--force') args.force = true
    else if (a[i] === '--anio') args.anio = parseInt(a[++i])
  }
  return args
}

async function descargarPackage(): Promise<CKANResource[]> {
  const res = await fetch(`${CKAN_BASE}?id=${PACKAGE_ID}`)
  if (!res.ok) throw new Error(`CKAN HTTP ${res.status}`)
  const data = await res.json() as CKANPackageResponse
  if (!data.success) throw new Error('CKAN retornó success=false')
  return data.result.resources
}

function inferirAnio(name: string): number | null {
  const m = name.match(/(20\d{2})/)
  if (!m) return null
  const a = parseInt(m[1])
  return a >= 2019 && a <= 2030 ? a : null
}

async function descargarZip(url: string, destPath: string, force: boolean): Promise<void> {
  if (!force && fs.existsSync(destPath)) {
    const stat = fs.statSync(destPath)
    if (stat.size > 1_000_000) return  // ya cacheado y razonablemente grande
  }
  console.log(`  ↓ descargando ${path.basename(destPath)}...`)
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Descarga HTTP ${res.status}: ${url}`)
  const buf = Buffer.from(await res.arrayBuffer())
  fs.writeFileSync(destPath, buf)
  console.log(`     ${(buf.length / 1024 / 1024).toFixed(1)}MB`)
}

// Divisor CSV simple respetando comillas dobles + escape ""
function splitCSVLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (inQuote) {
      if (c === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++ }
        else inQuote = false
      } else cur += c
    } else {
      if (c === ',') { out.push(cur); cur = '' }
      else if (c === '"') inQuote = true
      else cur += c
    }
  }
  out.push(cur)
  return out
}

function esCordoba(p?: string | null): boolean {
  if (!p) return false
  const s = p.toUpperCase()
  return s.includes('CORDOBA') || s.includes('CÓRDOBA')
}

async function procesarCSV(
  csvPath: string,
  snapshotAnioMes: string,
  fuenteUrl: string,
  filtrarCordoba: boolean,
): Promise<{ leidas: number; insertadas: number }> {
  const stream = fs.createReadStream(csvPath, { encoding: 'utf8' })
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity })

  let header: string[] | null = null
  let leidas = 0
  let insertadas = 0
  const now = new Date().toISOString()

  // Inserto fila por fila — para 1M filas el throughput es ~5-10K/s con DuckDB
  // node bindings. Aceptable para bulk one-shot offline.
  for await (const line of rl) {
    if (!line.trim()) continue
    if (!header) {
      // Primer header puede traer BOM (﻿) y los CSV de RNS post-2023 usan
      // columnas con espacios prefix (`, razon_social`). Normalizamos: BOM
      // strip, lowercase, trim por celda.
      const cleaned = line.replace(/^﻿/, '').toLowerCase()
      header = splitCSVLine(cleaned).map(s => s.trim())
      continue
    }
    leidas++
    const cells = splitCSVLine(line)
    if (cells.length < header.length) continue

    const get = (...cols: string[]): string | null => {
      for (const col of cols) {
        const idx = header!.indexOf(col)
        if (idx < 0) continue
        const v = cells[idx]
        if (v && v.trim()) return v.trim()
      }
      return null
    }

    const cuit = get('cuit')
    const razon_social = get('razon_social')
    if (!razon_social) continue

    const dom_fiscal_provincia = get('dom_fiscal_provincia')
    const dom_legal_provincia = get('dom_legal_provincia')

    if (filtrarCordoba && !esCordoba(dom_fiscal_provincia) && !esCordoba(dom_legal_provincia)) {
      continue
    }

    // Pre-2024: cols `fecha_actualizacion`, `fecha_contrato_social`.
    // 2024+: cols `fecha_hora_actualizacion`, `fecha_hora_contrato_social`.
    const fecha_actualizacion = get('fecha_actualizacion', 'fecha_hora_actualizacion')
    const fecha_contrato_social = get('fecha_contrato_social', 'fecha_hora_contrato_social')

    const id = crypto.createHash('sha256').update(
      [cuit ?? '', razon_social, fecha_actualizacion ?? '', snapshotAnioMes].join('|')
    ).digest('hex').slice(0, 24)

    try {
      await dbRun(
        `INSERT OR IGNORE INTO rns_personas_juridicas
         (id, cuit, razon_social, tipo_societario, fecha_contrato_social,
          numero_inscripcion, fecha_actualizacion,
          dom_fiscal_provincia, dom_fiscal_localidad,
          dom_legal_provincia, dom_legal_localidad,
          snapshot_anio_mes, fuente_url, cargado_en)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          id, cuit, razon_social, get('tipo_societario'),
          fecha_contrato_social, get('numero_inscripcion'),
          fecha_actualizacion,
          dom_fiscal_provincia, get('dom_fiscal_localidad'),
          dom_legal_provincia, get('dom_legal_localidad'),
          snapshotAnioMes, fuenteUrl, now,
        ]
      )
      insertadas++
    } catch { /* dup */ }

    if (insertadas % 10000 === 0 && insertadas > 0) {
      process.stdout.write(`\r    insertadas: ${insertadas.toLocaleString()}  leidas: ${leidas.toLocaleString()}`)
    }
  }
  process.stdout.write('\n')
  return { leidas, insertadas }
}

async function main() {
  const args = parseArgs()
  const filtrarCordoba = !args.all
  console.log('=== ARGOS — Seed RNS (Registro Nacional de Sociedades) ===')
  console.log(`Modo: ${filtrarCordoba ? 'solo CORDOBA' : 'NACIONAL completo'}${args.anio ? ` año=${args.anio}` : ''}\n`)

  await initDb()

  if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true })

  const recursos = await descargarPackage()
  const zipsAnuales = recursos.filter(r =>
    r.format.toUpperCase() === 'ZIP' &&
    /\b(20\d{2})\b/.test(r.name) &&
    !/asociaciones/i.test(r.name)
  )

  console.log(`${zipsAnuales.length} ZIPs anuales detectados:`)
  for (const r of zipsAnuales) {
    const a = inferirAnio(r.name)
    console.log(`  ${r.name.slice(0, 50)} → ${a}`)
  }

  let totalLeidas = 0
  let totalInsertadas = 0

  for (const r of zipsAnuales) {
    const anio = inferirAnio(r.name)
    if (!anio) continue
    if (args.anio && anio !== args.anio) continue

    const zipFile = path.join(CACHE_DIR, `rns-${anio}.zip`)
    try {
      await descargarZip(r.url, zipFile, args.force)
    } catch (err) {
      console.warn(`  ✗ Error descargando ${anio}: ${(err as Error).message}`)
      continue
    }

    const zip = new AdmZip(zipFile)
    const entries = zip.getEntries().filter(e => /\.csv$/i.test(e.entryName))
    console.log(`\n=== ${anio} (${entries.length} CSVs) ===`)

    for (const e of entries) {
      const snapshotMatch = e.entryName.match(/(\d{6})/)
      const snapshotAnioMes = snapshotMatch ? snapshotMatch[1] : `${anio}00`

      // Extraer al disco para streaming (los buffers en memoria de 200MB+
      // pueden hacer crash a node con CSV largos)
      const csvPath = path.join(CACHE_DIR, e.entryName)
      if (!fs.existsSync(csvPath) || args.force) {
        fs.writeFileSync(csvPath, e.getData())
      }

      console.log(`  ${e.entryName} (snapshot ${snapshotAnioMes})...`)
      const { leidas, insertadas } = await procesarCSV(
        csvPath, snapshotAnioMes, r.url.split('?')[0], filtrarCordoba
      )
      totalLeidas += leidas
      totalInsertadas += insertadas
      console.log(`    → leídas ${leidas.toLocaleString()}, insertadas ${insertadas.toLocaleString()}`)
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Filas leídas:      ${totalLeidas.toLocaleString()}`)
  console.log(`Filas insertadas:  ${totalInsertadas.toLocaleString()}`)
  console.log(`Filtro:            ${filtrarCordoba ? 'CORDOBA' : 'NACIONAL'}`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
