// Inspecciona la versión 5656 para ver el rango real de fechas que cubre
// y si tiene URLs a PDFs de 2018-2019 que llenarían el gap.
import * as XLSX from 'xlsx'
import { listarRecursos } from './../lib/boletin-cordoba'

async function main() {
  const recursos = await listarRecursos('5656')
  const r = recursos.find(rs => {
    const f = ((rs as { formato?: string; icono?: string }).formato
              ?? (rs as { formato?: string; icono?: string }).icono
              ?? '').toLowerCase()
    return f.includes('xls')
  })
  if (!r) { console.log('No hay XLS'); return }
  console.log(`URL: ${r.url.slice(0, 80)}...`)

  const res = await fetch(r.url)
  const buf = Buffer.from(await res.arrayBuffer())
  const wb = XLSX.read(buf, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })

  console.log(`Total filas: ${rows.length}`)
  console.log(`Columnas: ${Object.keys(rows[0]).join(' | ')}`)
  console.log()

  // Distribución por año desde "Fecha publicación"
  const porAnio = new Map<number, number>()
  const urlsPorAnio = new Map<number, Set<string>>()
  for (const r of rows) {
    const fechaPub = r['Fecha publicación']
    let anio: number | null = null
    if (typeof fechaPub === 'number' && fechaPub > 36000) {
      const ms = (fechaPub - 25569) * 86400 * 1000
      anio = new Date(ms).getFullYear()
    } else if (typeof fechaPub === 'string') {
      const m = String(fechaPub).match(/(\d{4})/)
      if (m) anio = parseInt(m[1])
    }
    if (anio && anio >= 2010 && anio <= 2030) {
      porAnio.set(anio, (porAnio.get(anio) ?? 0) + 1)
      const url = r['URL Acceso']
      if (typeof url === 'string') {
        if (!urlsPorAnio.has(anio)) urlsPorAnio.set(anio, new Set())
        urlsPorAnio.get(anio)!.add(url)
      }
    }
  }

  console.log('Distribución por año (filas / boletines únicos):')
  for (const [anio, cnt] of [...porAnio.entries()].sort((a, b) => a[0] - b[0])) {
    const urls = urlsPorAnio.get(anio)?.size ?? 0
    console.log(`  ${anio}: ${cnt} normas, ${urls} URLs únicas`)
  }
}
main().catch(console.error)
