// inspect-presupuesto-formats.ts — list ALL recurso formats for the first version
// of dataset 14, 65, 12 to discover actual formato strings.
import 'dotenv/config'
import { listarVersionesDataset, listarRecursosVersion, inferirAnioMesDesdeTitulo } from '../lib/cordoba-portal'

async function inspectDataset(ds: string) {
  console.log(`\n=== Dataset ${ds} ===`)
  const versiones = await listarVersionesDataset(ds)
  console.log(`Versiones: ${versiones.length}`)
  // Show 3 versions for variety: first, middle, last
  const showIdx = [0, Math.floor(versiones.length / 2), versiones.length - 1]
  for (const idx of showIdx) {
    const v = versiones[idx]
    if (!v) continue
    const { anio, mes } = inferirAnioMesDesdeTitulo(v.titulo)
    console.log(`\n  Versión[${idx}] v${v.id} — "${v.titulo}" → ${anio}${mes ? '-' + mes : ''}`)
    try {
      const recursos = await listarRecursosVersion(ds, v.id)
      console.log(`    Recursos (${recursos.length}):`)
      for (const r of recursos) {
        console.log(`      - id=${r.id} formato="${r.formato}" icono="${r.icono}" titulo="${r.titulo}" url=${r.url?.slice(0, 80)}...`)
      }
    } catch (err) {
      console.log(`    Error: ${(err as Error).message}`)
    }
  }
}

async function main() {
  for (const ds of ['14', '65', '12']) {
    await inspectDataset(ds)
  }
  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
