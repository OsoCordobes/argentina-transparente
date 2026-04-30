// inspect-boletin-dataset.ts — Diagnóstico: lista TODAS las versiones y recursos
// del dataset de boletines, sin filtros, para entender qué publica realmente.

import { listarVersiones, listarRecursos } from '../lib/boletin-cordoba'

async function main() {
  const versiones = await listarVersiones()
  console.log(`\n${versiones.length} versiones del dataset 2781:\n`)
  for (const v of versiones) {
    console.log(`Versión ${v.id}: ${v.titulo}`)
    if (v.descripcion) console.log(`  desc: ${v.descripcion.slice(0, 200)}`)
    if (v.fechaInicio) console.log(`  fechaInicio: ${v.fechaInicio}`)
    if (v.fechaFin) console.log(`  fechaFin: ${v.fechaFin}`)

    try {
      const recursos = await listarRecursos(v.id)
      console.log(`  ${recursos.length} recursos:`)
      for (const r of recursos) {
        console.log(`    [${r.formato ?? r.icono ?? '?'}] ${r.titulo}`)
        console.log(`      ${r.url}`)
      }
    } catch (err) {
      console.log(`  ERROR listando recursos: ${(err as Error).message}`)
    }
    console.log()
  }
}

main().catch(err => { console.error(err); process.exit(1) })
