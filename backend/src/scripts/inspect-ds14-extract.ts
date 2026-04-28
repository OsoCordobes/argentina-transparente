// inspect-ds14-extract.ts — debug what extraerDataset14 returns for a real file.
import 'dotenv/config'
import * as XLSX from 'xlsx'
import {
  listarVersionesDataset, descargarRecursoDeVersion, inferirAnioMesDesdeTitulo,
} from '../lib/cordoba-portal'

async function main() {
  const ds = process.argv[2] ?? '14'
  const versiones = await listarVersionesDataset(ds)
  for (const v of versiones.slice(0, 5)) {
    const desc = await descargarRecursoDeVersion(ds, v.id, ['xls', 'xlsx', 'csv'])
    if (!desc) continue
    console.log(`\nv${v.id} — ${v.titulo}`)
    const wb = XLSX.read(desc.buffer, { type: 'buffer', cellDates: true })
    for (const sn of wb.SheetNames) {
      const aoa = XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[sn], { header: 1, defval: null, blankrows: false })
      console.log(`  Sheet "${sn}" (${aoa.length} rows). First 6 rows:`)
      for (let i = 0; i < Math.min(6, aoa.length); i++) {
        const row = (aoa[i] ?? []) as unknown[]
        const cells = row.slice(0, 8).map(c => c === null || c === undefined ? 'ø' : String(c).slice(0, 30))
        console.log(`    [${i}] ${cells.join(' | ')}`)
      }
    }
    return
  }
}
main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1) })
