/**
 * Verifica los counts del universo cordobés N2 (Phase F5).
 *
 * Las views `v_universo_cordobes_empresas` y `v_universo_cordobes_personas`
 * se crean automáticamente en `initDb()` — este script solo las consulta y
 * imprime totales. Útil para confirmar que el filtro N2 produce un universo
 * razonable post-seed o post-cambios al identity_resolver.
 *
 * Uso: npm run build:universo
 */
import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

async function main(): Promise<void> {
  await initDb()

  const eRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) as n FROM v_universo_cordobes_empresas`
  )
  const pRows = await dbAll<{ n: number }>(
    `SELECT COUNT(*) as n FROM v_universo_cordobes_personas`
  )

  const empresas = Number(eRows[0]?.n ?? 0)
  const personas = Number(pRows[0]?.n ?? 0)

  console.log('Universo Córdoba N2:')
  console.log(`  Empresas: ${empresas.toLocaleString()}`)
  console.log(`  Personas: ${personas.toLocaleString()}`)

  process.exit(0)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
