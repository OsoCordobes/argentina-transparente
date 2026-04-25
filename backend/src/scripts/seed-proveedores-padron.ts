// seed-proveedores-padron.ts — Carga padrones oficiales de proveedores de
// Córdoba Capital desde gobiernoabierto.cordoba.gob.ar.
//
// Datasets:
//   - 281 v6197-v6200: Contratistas Obra Pública 2019-2022 (4 padrones, ~217 entradas)
//   - 162 v397: Registro municipal de proveedores 01/2017 (snapshot único)
//
// Datos verbatim del XLSX. CUIT verificado por fuente oficial → cruce
// inmediato con OpenSanctions/ICIJ y empresas IGJ.

import 'dotenv/config'
import * as XLSX from 'xlsx'
import {
  initDb, registrarFuente, insertProveedorPadron, getProveedoresPadronCount,
} from '../lib/db'
import type { FuenteMetadata } from '../types'

const TIMEOUT_MS = 60_000

interface RecursoAPI {
  url: string
  titulo: string
  formato?: string
  icono?: string
}

async function fetchAPI(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${url}`)
  return res.json() as Promise<{ results: RecursoAPI[] }>
}

async function descargarXLSX(datasetId: string, versionId: string): Promise<Buffer> {
  const data = await fetchAPI(
    `https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/${datasetId}/version-dato/${versionId}/recurso`
  )
  const r = data.results.find(rs => {
    const fmt = ((rs.formato ?? rs.icono ?? '') as string).toLowerCase()
    return fmt.includes('xls') || fmt.includes('csv')
  })
  if (!r) throw new Error(`Sin XLS/CSV en versión ${versionId}`)
  const xlsRes = await fetch(r.url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!xlsRes.ok) throw new Error(`HTTP ${xlsRes.status} descargando`)
  return Buffer.from(await xlsRes.arrayBuffer())
}

function parsearPadron(buffer: Buffer): { nombre: string; cuit: string | null }[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  const out: { nombre: string; cuit: string | null }[] = []
  for (const row of rows) {
    // Las columnas pueden tener nombres ligeramente distintos por padrón
    const keys = Object.keys(row)
    const keyNombre = keys.find(k => /nombre|empresa|razon|denomina/i.test(k))
    const keyCuit = keys.find(k => /cuit|c\.u\.i\.t/i.test(k))
    if (!keyNombre) continue

    const nombre = String(row[keyNombre] ?? '').trim()
    if (!nombre) continue
    const cuit = keyCuit ? String(row[keyCuit] ?? '').trim() : null

    out.push({ nombre, cuit: cuit || null })
  }
  return out
}

const PADRONES = [
  { dsId: '281', vId: '6197', anio: 2019, categoria: 'obra_publica', nombre: 'Contratistas Obra Pública' },
  { dsId: '281', vId: '6198', anio: 2020, categoria: 'obra_publica', nombre: 'Contratistas Obra Pública' },
  { dsId: '281', vId: '6199', anio: 2021, categoria: 'obra_publica', nombre: 'Contratistas Obra Pública' },
  { dsId: '281', vId: '6200', anio: 2022, categoria: 'obra_publica', nombre: 'Contratistas Obra Pública' },
  { dsId: '162', vId: '397',  anio: 2017, categoria: 'general',      nombre: 'Registro Municipal de Proveedores' },
]

async function main() {
  console.log('=== ARGOS — Seed Padrón Proveedores Córdoba Capital ===\n')
  await initDb()

  await registrarFuente({
    id: 'cordoba-capital-padron-proveedores',
    jurisdiccion: 'Córdoba Capital',
    url: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/economia-y-finanzas/contratistas-de-obra-en-via-publica/281',
    formato: 'XLSX',
    oficial: true,
    nivelConfianza: 'alto',
    notas: 'Padrón oficial de proveedores habilitados (Dataset 281 + 162). CUITs verificados por fuente oficial — útil para cruce con OpenSanctions/ICIJ.',
  } as FuenteMetadata)

  let totalNuevos = 0
  for (const p of PADRONES) {
    console.log(`\nDataset ${p.dsId} v${p.vId} (${p.anio} - ${p.nombre})`)
    try {
      const buffer = await descargarXLSX(p.dsId, p.vId)
      console.log(`  Descargado: ${(buffer.length / 1024).toFixed(0)} KB`)
      const filas = parsearPadron(buffer)
      console.log(`  ${filas.length} proveedores parseados`)

      let nuevos = 0
      for (const f of filas) {
        const ok = await insertProveedorPadron({
          jurisdiccion: 'cordoba-capital',
          cuit: f.cuit,
          nombre: f.nombre,
          categoria: p.categoria,
          anioPadron: p.anio,
          estado: 'habilitado',
          fuenteUrl: `https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/dato/${p.dsId}/version-dato/${p.vId}`,
        })
        if (ok) nuevos++
      }
      console.log(`  ✓ ${nuevos} nuevos insertados`)
      totalNuevos += nuevos
    } catch (err) {
      console.warn(`  ✗ Error: ${(err as Error).message}`)
    }
  }

  const total = await getProveedoresPadronCount('cordoba-capital')
  console.log(`\n=== Resumen ===`)
  console.log(`Nuevos insertados: ${totalNuevos}`)
  console.log(`Total padrón Córdoba Capital: ${total}`)
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
