// inspect-presupuesto-aoa.ts — show raw first 20 rows of dataset XLSX
import 'dotenv/config'
import * as XLSX from 'xlsx'
import { listarVersionesDataset, descargarRecursoDeVersion, inferirAnioMesDesdeTitulo } from '../lib/cordoba-portal'

async function inspectDS(ds: string) {
  console.log(`\n========= Dataset ${ds} =========`)
  const versiones = await listarVersionesDataset(ds)
  const conAnio = versiones.filter(v => inferirAnioMesDesdeTitulo(v.titulo).anio !== null)
  // pick first version that has an actual XLS/CSV resource
  for (const cand of conAnio.slice(0, 8)) {
    const desc = await descargarRecursoDeVersion(ds, cand.id, ['xls', 'xlsx', 'csv'])
    if (!desc) continue
    console.log(`\nv${cand.id} — ${cand.titulo}`)
    console.log(`URL: ${desc.recurso.url.split('?')[0]}`)
    console.log(`Tamaño: ${desc.buffer.length} bytes`)

    const wb = XLSX.read(desc.buffer, { type: 'buffer', cellDates: true })
    console.log(`Sheets: ${wb.SheetNames.join(' | ')}`)
    for (const sn of wb.SheetNames.slice(0, 3)) {
      const sheet = wb.Sheets[sn]
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: null, blankrows: false })
      console.log(`\n  --- Sheet "${sn}" (${aoa.length} rows) ---`)
      for (let i = 0; i < Math.min(20, aoa.length); i++) {
        const row = aoa[i] as unknown[]
        const truncated = row.slice(0, 10).map(c => {
          if (c === null || c === undefined) return 'ø'
          const s = String(c)
          return s.length > 25 ? s.slice(0, 22) + '...' : s
        })
        console.log(`  [${String(i).padStart(2, ' ')}] ${truncated.join(' | ')}`)
      }
    }
    return  // first usable version is enough
  }
  console.log('No version with XLS/CSV resource found.')
}

async function main() {
  for (const ds of ['14', '65', '12']) {
    await inspectDS(ds)
  }
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
