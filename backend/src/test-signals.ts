import { cordobaCapitalConnector } from './connectors/cordoba-capital'
import { calcularSeñales } from './engine/signals'

async function main() {
  const anioDesde = parseInt(process.argv[2] ?? '2023')
  const anioHasta = parseInt(process.argv[3] ?? '2023')
  console.log(`Analizando Córdoba Capital ${anioDesde}–${anioHasta}...`)
  const contratos = await cordobaCapitalConnector.getContratos(anioDesde, anioHasta)
  console.log(`Total contratos: ${contratos.length}`)
  const señales = await calcularSeñales(contratos)
  console.log(`\nSeñales detectadas: ${señales.length}\n`)
  for (const s of señales) {
    console.log(`[score:${s.score}] [${s.legal.severidad}] ${s.tipologia}`)
    console.log(`  → ${s.titulo}\n`)
  }
}

main().catch(console.error)
