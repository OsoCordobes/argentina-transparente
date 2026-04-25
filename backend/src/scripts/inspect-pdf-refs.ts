import * as XLSX from 'xlsx'

async function main() {
  // Descargar el archivo de "referencias a PDFs" + verificar distribución de años
  const resp = await fetch(
    'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2/version-dato/4747/recurso',
    { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } },
  )
  const data = await resp.json() as { results: Array<{ url: string; titulo: string; formato?: string; icono?: string }> }

  // Archivo principal — verificar años a partir del campo 'apertura'
  const main = data.results.find(r => {
    const fmt = (r.formato ?? r.icono ?? '').toLowerCase()
    return fmt.includes('xls') && r.titulo.toLowerCase().includes('licitaciones')
  })!
  const buf = Buffer.from(await (await fetch(main.url)).arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(wb.Sheets[wb.SheetNames[0]], { defval: null })

  const porAnio = new Map<number, number>()
  for (const r of rows) {
    const ap = String(r['apertura'] ?? '')
    const m = ap.match(/^(\d{4})/)
    if (m) {
      const a = parseInt(m[1])
      porAnio.set(a, (porAnio.get(a) ?? 0) + 1)
    }
  }
  console.log('Distribución 2005-2018 (campo apertura):')
  for (const [a, c] of [...porAnio.entries()].sort((x, y) => x[0] - y[0])) {
    console.log(`  ${a}: ${c.toLocaleString()}`)
  }

  // Archivo de referencias a PDFs
  console.log('\n=== Archivo "referencias a PDFs" ===')
  const refs = data.results.find(r => {
    const fmt = (r.formato ?? r.icono ?? '').toLowerCase()
    return fmt.includes('xls') && r.titulo.toLowerCase().includes('referencia')
  })
  if (!refs) { console.log('No existe'); return }
  const refsBuf = Buffer.from(await (await fetch(refs.url)).arrayBuffer())
  console.log(`Tamaño: ${(refsBuf.length / 1024).toFixed(0)} KB`)
  const refsWb = XLSX.read(refsBuf, { type: 'buffer' })
  const refsRows = XLSX.utils.sheet_to_json<Record<string, unknown>>(refsWb.Sheets[refsWb.SheetNames[0]], { defval: null })
  console.log(`Filas: ${refsRows.length}`)
  console.log(`Hojas: ${refsWb.SheetNames.join(', ')}`)
  if (refsRows.length === 0) return
  console.log(`Columnas: ${Object.keys(refsRows[0]).join(' | ')}`)
  console.log('\nPrimera fila:')
  for (const [k, v] of Object.entries(refsRows[0])) {
    console.log(`  ${k}: ${String(v ?? '').slice(0, 100)}`)
  }
  if (refsRows.length > 1) {
    console.log('\nSegunda fila:')
    for (const [k, v] of Object.entries(refsRows[1])) {
      console.log(`  ${k}: ${String(v ?? '').slice(0, 100)}`)
    }
  }
}
main().catch(console.error)
