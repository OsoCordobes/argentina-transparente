// seed-cordoba-ddjj.ts — Indexa Declaraciones Juradas de funcionarios de
// Córdoba Capital desde el portal gobiernoabierto.cordoba.gob.ar.
//
// Categorías:
//   - 85  → Gestión 2016-2019 (308 funcionarios)
//   - 105 → Gestión 2020-2023 (241 funcionarios)
//
// Cada funcionario es un "dato" (id) con N versiones (1 = 1 año declarado).
// Cada versión tiene 3 recursos pero SOLO el PDF es descargable; XLS/CSV
// están listados en la API pero los URLs relativos retornan 404 (servidor
// nunca implementó esos endpoints).
//
// Este seed CONSTRUYE EL ÍNDICE únicamente. NO descarga PDFs ni hace OCR.
// Eso queda para iteración futura (worker OCR Tier A).
//
// Uso:
//   npm run seed:cordoba-ddjj                 # ambas categorías
//   npm run seed:cordoba-ddjj -- --solo 85    # solo gestión 2016-2019
//   npm run seed:cordoba-ddjj -- --dry-run    # estimar sin escribir

import 'dotenv/config'
import crypto from 'crypto'
import { initDb, dbRun, registrarFuente, registrarFuenteCatalogo } from '../lib/db'
import { crearSnapshot } from '../lib/snapshots'
import { normalizarNombrePersona } from '../lib/graph'
import type { FuenteMetadata } from '../types/index'

const PORTAL = 'https://gobiernoabierto.cordoba.gob.ar'
const API = `${PORTAL}/api/datos-abiertos`

const CATEGORIAS = [
  { id: '85',  gestion: '2016-2019' },
  { id: '105', gestion: '2020-2023' },
]

interface DatoFuncionario {
  id: number
  titulo: string
  url: string
}

interface VersionDDJJ {
  id: string
  titulo: string  // "Declaracion Jurada 2019" | "Declaracion Jurada 2018" | etc
}

interface RecursoDDJJ {
  id: string
  titulo: string
  url: string
  icono: string  // 'pdf' | 'xls' | 'csv'
}

async function fetchJson<T>(url: string, retries = 3): Promise<T> {
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(20000) })
      if (!res.ok) throw new Error(`HTTP ${res.status}`)
      return res.json() as Promise<T>
    } catch (err) {
      if (i === retries - 1) throw err
      await new Promise(r => setTimeout(r, 2000 * (i + 1)))
    }
  }
  throw new Error('fetchJson: unreachable')
}

async function listarFuncionarios(categoriaId: string): Promise<DatoFuncionario[]> {
  const out: DatoFuncionario[] = []
  let page = 1
  const size = 50
  while (true) {
    const url = `${API}/dato?categoria=${categoriaId}&size=${size}&page=${page}`
    const data = await fetchJson<{ count: number; results: DatoFuncionario[]; next: string | null }>(url)
    out.push(...data.results)
    if (!data.next) break
    page++
    if (page > 30) break  // safety: max 1500 funcionarios
    await new Promise(r => setTimeout(r, 300))
  }
  return out
}

async function listarVersiones(datoId: number): Promise<VersionDDJJ[]> {
  const url = `${API}/dato/${datoId}/version-dato?size=50`
  const data = await fetchJson<{ results: VersionDDJJ[] }>(url)
  return data.results ?? []
}

async function listarRecursos(datoId: number, versionId: string): Promise<RecursoDDJJ[]> {
  const url = `${API}/dato/${datoId}/version-dato/${versionId}/recurso?size=10`
  const data = await fetchJson<{ results: RecursoDDJJ[] }>(url)
  return data.results ?? []
}

function inferirAnio(titulo: string): number | null {
  const m = titulo.match(/\b(20\d{2})\b/)
  return m ? parseInt(m[1]) : null
}

function extraerApellidoNombre(titulo: string): string {
  // "Declaraciones Juradas de Cecilia Ammann" -> "Cecilia Ammann"
  return titulo
    .replace(/^Declaraciones?\s+Juradas?\s+de\s+/i, '')
    .trim()
}

interface Args {
  solo: string | null
  dryRun: boolean
}

function parseArgs(): Args {
  const args = process.argv.slice(2)
  const out: Args = { solo: null, dryRun: false }
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--solo') { out.solo = args[i + 1]; i++ }
    else if (args[i] === '--dry-run') out.dryRun = true
  }
  return out
}

async function main() {
  console.log('=== ARGOS — Seed Declaraciones Juradas Córdoba ===\n')

  const args = parseArgs()
  await initDb()

  if (!args.dryRun) {
    await registrarFuente({
      id: 'cordoba-capital-ddjj',
      jurisdiccion: 'Córdoba Capital',
      url: `${PORTAL}/data/datos-abiertos/categoria/declaraciones-juradas-de-funcionarios`,
      formato: 'PDF (índice JSON via API CKAN)',
      oficial: true,
      nivelConfianza: 'alto',
      notas: 'DDJJ funcionarios gestión 2016-2019 (cat 85) + 2020-2023 (cat 105). Solo PDFs descargables. XLS/CSV listados en API pero URLs relativos retornan 404.',
    } as FuenteMetadata)

    await registrarFuenteCatalogo({
      id: 'cordoba-capital-categoria-85-105',
      jurisdiccion: 'cordoba-capital',
      organismo: 'Municipalidad de Córdoba',
      dimension: 'otro',
      nombre: 'Declaraciones Juradas de Funcionarios',
      descripcion: '~549 funcionarios × ~4 declaraciones c/u. PDF descargable. Estructurado vía OCR pendiente.',
      urlOficial: `${PORTAL}/data/datos-abiertos/categoria/declaraciones-juradas-de-funcionarios`,
      formato: 'PDF',
      coberturaDesde: 2016,
      coberturaHasta: 2023,
      volumenEstimado: '~2200 PDFs',
      estadoImplementacion: 'implementado',
      razonBloqueo: 'XLS/CSV linked pero broken (404). PDFs indexados, contenido OCR pendiente.',
      conectorId: 'seed:cordoba-ddjj',
    })
  }

  let totalIndexados = 0
  let totalSkippedNoPdf = 0
  let totalQuarantine = 0
  let crashed = false

  // W1 bitemporal: snapshot por corrida para trazabilidad
  const snapshotStart = Date.now()
  const snapshot = args.dryRun ? null : await crearSnapshot({
    seedId: 'seed:cordoba-ddjj',
    fuenteUrl: `${PORTAL}/data/datos-abiertos/categoria/declaraciones-juradas-de-funcionarios`,
    hashArchivo: crypto.createHash('sha256').update(`ddjj-${snapshotStart}`).digest('hex').slice(0, 16),
    filasLeidas: 0,  // se updatea al final
    status: 'success',
    notas: `Indexa categorías ${args.solo ?? '85+105'}`,
  })
  const snapshotId = snapshot?.id ?? null

  // Helper para actualizar snapshot al final (success o failed via try/catch)
  const updateSnapshotOnExit = async (status: 'success' | 'partial' | 'failed') => {
    if (!snapshotId) return
    try {
      await dbRun(
        `UPDATE snapshots
            SET filas_leidas = ?, filas_insertadas = ?, filas_quarantined = ?,
                duracion_ms = ?, status = ?
          WHERE id = ?`,
        [
          totalIndexados + totalSkippedNoPdf + totalQuarantine,
          totalIndexados,
          totalQuarantine,
          Date.now() - snapshotStart,
          status,
          snapshotId,
        ]
      )
    } catch { /* swallow — proceso ya saliendo */ }
  }

  try {
    for (const cat of CATEGORIAS) {
      if (args.solo && args.solo !== cat.id) continue

      console.log(`\n=== Categoría ${cat.id} (gestión ${cat.gestion}) ===`)
      const funcionarios = await listarFuncionarios(cat.id)
      console.log(`✓ ${funcionarios.length} funcionarios listados`)

      for (let i = 0; i < funcionarios.length; i++) {
        const f = funcionarios[i]
        const apellidoNombre = extraerApellidoNombre(f.titulo)

        try {
          const versiones = await listarVersiones(f.id)
          await new Promise(r => setTimeout(r, 250))  // rate limit polite

          for (const v of versiones) {
            const anio = inferirAnio(v.titulo)
            const recursos = await listarRecursos(f.id, v.id)
            await new Promise(r => setTimeout(r, 200))

            const pdf = recursos.find(r => r.icono === 'pdf')?.url ?? null
            const xls = recursos.find(r => r.icono === 'xls')?.url ?? null
            const csv = recursos.find(r => r.icono === 'csv')?.url ?? null

            if (!pdf) {
              totalSkippedNoPdf++
              continue
            }

            // Normalizar URLs relativas a absolutas
            const pdfAbs = pdf.startsWith('http') ? pdf : `${PORTAL}${pdf}`
            const xlsAbs = xls && !xls.startsWith('http') ? `${PORTAL}${xls}` : xls
            const csvAbs = csv && !csv.startsWith('http') ? `${PORTAL}${csv}` : csv

            const fuenteUrl = `${PORTAL}/api/datos-abiertos/dato/${f.id}/version-dato/${v.id}`
            const id = crypto.createHash('sha256')
              .update(`cordoba-capital|${f.id}|${v.id}`)
              .digest('hex')
              .slice(0, 32)

            if (args.dryRun) {
              totalIndexados++
              continue
            }

            try {
              const now = new Date().toISOString()
              const apellidoNombreNorm = normalizarNombrePersona(apellidoNombre)
              await dbRun(
                `INSERT OR REPLACE INTO declaraciones_juradas
                 (id, jurisdiccion, dato_id, version_id, gestion, apellido_nombre,
                  apellido_nombre_norm, anio_declarado, pdf_url, xls_url, csv_url,
                  ocr_procesado, cuit, dni, monto_declarado,
                  fuente_url, cargado_en,
                  t_efectivo, t_publicado, snapshot_id, superseded_by_id)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, FALSE, NULL, NULL, NULL, ?, ?,
                         NULL, ?, ?, NULL)`,
                [
                  id, 'cordoba-capital', String(f.id), v.id, cat.gestion,
                  apellidoNombre, apellidoNombreNorm, anio, pdfAbs, xlsAbs, csvAbs, fuenteUrl,
                  now, now, snapshotId,
                ]
              )
              totalIndexados++
            } catch (err) {
              console.warn(`  [quarantine] ${apellidoNombre} ${v.titulo}: ${(err as Error).message.slice(0, 80)}`)
              totalQuarantine++
            }
          }

          if ((i + 1) % 25 === 0) {
            console.log(`  ${i + 1}/${funcionarios.length} funcionarios procesados — ${totalIndexados} DDJJ indexadas`)
          }
        } catch (err) {
          console.warn(`  [skip] ${f.titulo}: ${(err as Error).message.slice(0, 80)}`)
        }
      }
    }
  } catch (fatal) {
    crashed = true
    console.error(`\n[FATAL] ${(fatal as Error).message}`)
    await updateSnapshotOnExit('failed')
    throw fatal
  }

  // Update snapshot con counts reales (success path)
  if (snapshotId && !crashed) {
    await dbRun(
      `UPDATE snapshots
         SET filas_leidas = ?, filas_insertadas = ?, filas_quarantined = ?,
             duracion_ms = ?
       WHERE id = ?`,
      [
        totalIndexados + totalSkippedNoPdf + totalQuarantine,
        totalIndexados,
        totalQuarantine,
        Date.now() - snapshotStart,
        snapshotId,
      ]
    )
  }

  console.log(`\n=== Resumen ===`)
  console.log(`DDJJ indexadas:           ${totalIndexados}`)
  console.log(`Skipped (sin PDF):        ${totalSkippedNoPdf}`)
  console.log(`Quarantined:              ${totalQuarantine}`)
  if (snapshotId) console.log(`Snapshot ID:              ${snapshotId}`)
  console.log(`\nNOTA: solo se indexaron URLs. Procesamiento OCR de PDFs pendiente.`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
