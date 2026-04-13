// seed-igj.ts — Descarga y carga los datos IGJ en DuckDB
//
// Fuente: datos.jus.gob.ar — "Entidades constituidas en la IGJ"
// Ejecutar: npm run seed:igj
//
// Este script:
//   1. Descarga el ZIP del último semestre disponible de datos.jus.gob.ar
//   2. Extrae los CSVs de entidades y autoridades
//   3. Carga los datos en las tablas igj_entidades e igj_autoridades de DuckDB
//   4. Las siguientes ejecuciones sobreescriben los datos anteriores

import 'dotenv/config'
import https from 'https'
import http from 'http'
import fs from 'fs'
import path from 'path'
import AdmZip from 'adm-zip'
import { initDb, isIGJLoaded, clearIGJTables, loadIGJFromCSV } from '../lib/db'

// Semestres disponibles — más reciente primero
const IGJ_SOURCES = [
  {
    label: '2026-S1',
    url: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/101ebb5b-bbb6-43b9-8929-27ab620443d5/download/igj-2026-semestre-1.zip',
  },
  {
    label: '2025-S2',
    url: 'https://datos.jus.gob.ar/dataset/da045e06-35cb-4bdd-9b5e-ddee6712c86c/resource/fbcb0917-d298-479b-8fda-c314b4af33eb/download/igj-2025-semestre-2.zip',
  },
]

const DATA_DIR = path.join(process.cwd(), 'data')
const TMP_DIR = path.join(DATA_DIR, 'tmp')

function downloadFile(url: string, destPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(destPath)

    const request = (urlStr: string, redirectCount = 0) => {
      if (redirectCount > 5) return reject(new Error('Demasiadas redirecciones'))
      const mod = urlStr.startsWith('https') ? https : http
      mod.get(urlStr, res => {
        if (res.statusCode && res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          return request(res.headers.location, redirectCount + 1)
        }
        if (res.statusCode !== 200) {
          return reject(new Error(`HTTP ${res.statusCode} para ${urlStr}`))
        }
        const total = parseInt(res.headers['content-length'] ?? '0', 10)
        let downloaded = 0
        let lastPct = 0

        res.on('data', (chunk: Buffer) => {
          downloaded += chunk.length
          if (total > 0) {
            const pct = Math.floor((downloaded / total) * 100)
            if (pct >= lastPct + 10) {
              process.stdout.write(`\r  Descargando... ${pct}%`)
              lastPct = pct
            }
          }
        })

        res.pipe(file)
        file.on('finish', () => { file.close(); process.stdout.write('\n'); resolve() })
        file.on('error', reject)
      }).on('error', reject)
    }

    request(url)
  })
}

function findCSVInZip(zip: AdmZip, pattern: RegExp): AdmZip.IZipEntry | null {
  return zip.getEntries().find(e => pattern.test(e.entryName)) ?? null
}

async function main() {
  console.log('=== ARGOS — Seed IGJ ===')

  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true })
  if (!fs.existsSync(TMP_DIR)) fs.mkdirSync(TMP_DIR, { recursive: true })

  await initDb()

  const alreadyLoaded = await isIGJLoaded()
  if (alreadyLoaded) {
    const args = process.argv.slice(2)
    if (!args.includes('--force')) {
      console.log('Los datos IGJ ya están cargados. Use --force para recargar.')
      process.exit(0)
    }
    console.log('Recargando datos IGJ (--force)...')
    await clearIGJTables()
  }

  let success = false

  for (const source of IGJ_SOURCES) {
    const zipPath = path.join(TMP_DIR, `igj-${source.label}.zip`)
    console.log(`\nIntentando ${source.label}: ${source.url}`)

    try {
      console.log('  Descargando ZIP...')
      await downloadFile(source.url, zipPath)

      console.log('  Extrayendo CSVs...')
      const zip = new AdmZip(zipPath)
      const entEntry = findCSVInZip(zip, /entidades.*\.csv$/i)
      const autEntry = findCSVInZip(zip, /autoridades.*\.csv$/i)

      if (!entEntry || !autEntry) {
        const names = zip.getEntries().map(e => e.entryName).join(', ')
        throw new Error(`No se encontraron entidades.csv o autoridades.csv. Archivos: ${names}`)
      }

      const entPath = path.join(TMP_DIR, 'igj-entidades.csv')
      const autPath = path.join(TMP_DIR, 'igj-autoridades.csv')

      fs.writeFileSync(entPath, entEntry.getData())
      fs.writeFileSync(autPath, autEntry.getData())

      console.log(`  Cargando en DuckDB...`)
      const counts = await loadIGJFromCSV(entPath, autPath)
      console.log(`  ✓ Entidades cargadas: ${counts.entidades.toLocaleString()}`)
      console.log(`  ✓ Autoridades cargadas: ${counts.autoridades.toLocaleString()}`)

      success = true

      // Limpiar archivos temporales (best-effort — Windows puede tener lock en CSV)
      for (const p of [zipPath, entPath, autPath]) {
        try { fs.rmSync(p, { force: true }) } catch { /* ignore EBUSY on Windows */ }
      }

      break
    } catch (err) {
      console.warn(`  ✗ Falló ${source.label}: ${err}`)
      try { fs.rmSync(zipPath, { force: true }) } catch { /* ignore */ }
    }
  }

  if (!success) {
    console.error('\n✗ No se pudo cargar ninguna fuente IGJ.')
    console.error('  Verificar conectividad a datos.jus.gob.ar')
    process.exit(1)
  }

  console.log('\n✓ Datos IGJ cargados correctamente.')
  console.log('  La señal directores_compartidos ya puede usar datos reales.')
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
