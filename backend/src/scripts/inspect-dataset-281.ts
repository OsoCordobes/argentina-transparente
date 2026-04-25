// Inspecciona dataset 281 (Contratistas Obra Pública 2019-2022) para diseñar
// el connector. Cada versión es un año.

import * as XLSX from 'xlsx'

const DATASET_ID = '281'
const VERSIONES = [
  { id: '6197', anio: 2019 },
  { id: '6198', anio: 2020 },
  { id: '6199', anio: 2021 },
  { id: '6200', anio: 2022 },
]

async function fetchJSON(url: string) {
  const res = await fetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
      Accept: 'application/json',
    },
  })
  return res.json()
}

async function main() {
  for (const v of VERSIONES) {
    console.log(`\n=== Versión ${v.id} (${v.anio}) ===`)
    const recursos = await fetchJSON(
      `https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/${DATASET_ID}/version-dato/${v.id}/recurso`
    ) as { results: Array<{ url: string; titulo: string; formato?: string; icono?: string }> }

    const xls = recursos.results.find(r => {
      const fmt = ((r.formato ?? r.icono ?? '') as string).toLowerCase()
      return fmt.includes('xls') || fmt.includes('csv')
    })
    if (!xls) { console.log('  Sin XLS/CSV'); continue }

    console.log(`  Recurso: ${xls.titulo}`)
    const buf = Buffer.from(await (await fetch(xls.url)).arrayBuffer())
    console.log(`  Tamaño: ${(buf.length / 1024).toFixed(0)} KB`)

    const wb = XLSX.read(buf, { type: 'buffer', cellDates: true })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    console.log(`  Filas: ${rows.length}`)
    if (rows.length > 0) {
      console.log(`  Columnas: ${Object.keys(rows[0]).join(' | ')}`)
      console.log(`  Primera fila:`)
      for (const [k, val] of Object.entries(rows[0])) {
        console.log(`    ${k}: ${String(val ?? '').slice(0, 80)}`)
      }
    }
  }
}
main().catch(console.error)
