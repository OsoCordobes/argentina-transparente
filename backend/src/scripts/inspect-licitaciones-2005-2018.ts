// Inspecciona el dataset 2 versión 4747 — Compras y Contrataciones 2005-Mayo 2018.
// Si tiene formato similar a las versiones 2019-2023, extendemos el connector
// cordoba-capital existente para cubrir 2005-2018 sin necesidad de OCR.

import * as XLSX from 'xlsx'
import { listarRecursos } from '../lib/boletin-cordoba'

async function main() {
  // El módulo boletin-cordoba está hardcoded para dataset 2781. Acá fetcheo
  // directo del dataset 2.
  const versionId = '4747'
  const datasetId = '2'

  const resp = await fetch(
    `https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/${datasetId}/version-dato/${versionId}/recurso`,
    {
      headers: {
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        Accept: 'application/json',
      },
    },
  )
  const data = await resp.json() as { results: Array<{ url: string; titulo: string; formato?: string; icono?: string }> }

  // Tomar el XLS principal (no el de referencias a PDFs)
  const r = data.results.find(rs => {
    const fmt = (rs.formato ?? rs.icono ?? '').toLowerCase()
    const titulo = (rs.titulo ?? '').toLowerCase()
    return fmt.includes('xls') && titulo.includes('licitaciones')
  })
  if (!r) { console.log('No se encontró XLS de licitaciones'); return }

  console.log(`Descargando: ${r.titulo}`)
  console.log(`URL: ${r.url.slice(0, 80)}...`)
  const xlsResp = await fetch(r.url)
  if (!xlsResp.ok) { console.log(`HTTP ${xlsResp.status}`); return }
  const buf = Buffer.from(await xlsResp.arrayBuffer())
  console.log(`Tamaño: ${(buf.length / 1024 / 1024).toFixed(1)} MB`)

  const wb = XLSX.read(buf, { type: 'buffer' })
  console.log(`Hojas: ${wb.SheetNames.join(', ')}`)
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
  console.log(`Filas: ${rows.length.toLocaleString()}`)

  if (rows.length === 0) return
  console.log(`\nColumnas: ${Object.keys(rows[0]).join(' | ')}`)

  console.log(`\nPrimera fila:`)
  for (const [k, v] of Object.entries(rows[0])) {
    const val = String(v ?? '').slice(0, 100)
    console.log(`  ${k}: ${val}`)
  }

  // Distribución por año
  const porAnio = new Map<number, number>()
  for (const row of rows) {
    // Buscar campo de año/fecha
    let anio: number | null = null
    for (const k of ['Año contratación', 'Año', 'anio', 'Fecha', 'Fecha contratación']) {
      const v = row[k]
      if (v) {
        const s = String(v)
        const m = s.match(/\b(20\d{2}|19\d{2})\b/)
        if (m) { anio = parseInt(m[1]); break }
      }
    }
    if (anio === null) continue
    porAnio.set(anio, (porAnio.get(anio) ?? 0) + 1)
  }
  console.log(`\nDistribución por año:`)
  for (const [a, c] of [...porAnio.entries()].sort((x, y) => x[0] - y[0])) {
    console.log(`  ${a}: ${c.toLocaleString()}`)
  }
}

main().catch(err => { console.error(err); process.exit(1) })
