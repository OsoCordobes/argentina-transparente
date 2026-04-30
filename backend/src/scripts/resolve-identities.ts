// resolve-identities.ts — Recorre todos los proveedores únicos de contratos
// cordobeses y los pasa por el resolver. Popula identity_matches.
//
// Es la pieza que cierra el gap de cobertura: hoy solo 264/2,410 contratos
// tienen CUIT resuelto. Después de correr este script, el resolver
// (ampliado con RNS+IGJ) debería resolver muchos más.
//
// Uso:
//   npm run resolve:identities         # solo los pendientes (sin entry en cache)
//   npm run resolve:identities -- --force   # re-resolver todos
//   npm run resolve:identities -- --no-llm  # skip Tier 4 (sin Anthropic budget)

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'
import { resolverEmpresa } from '../lib/identity-resolver'

interface Args {
  force: boolean
  noLlm: boolean
}
function parseArgs(): Args {
  const a = process.argv.slice(2)
  return {
    force: a.includes('--force'),
    noLlm: a.includes('--no-llm'),
  }
}

async function main() {
  const args = parseArgs()
  console.log('=== ARGOS — Resolve identities ===\n')
  await initDb()

  // Si --no-llm, deshabilitamos la API key durante el run para que el
  // resolver caiga en Tier 5 cuando llegue a candidatos ambiguos sin
  // poder llamar al LLM. Más rápido y sin costo.
  if (args.noLlm) {
    delete process.env.ANTHROPIC_API_KEY
    console.log('Modo --no-llm: Tier 4 (LLM) deshabilitado.\n')
  }

  if (args.force) {
    console.log('--force: limpiando identity_matches...')
    await dbRun('DELETE FROM identity_matches')
  }

  // Proveedores únicos de Córdoba Capital con su nombre original (para
  // poder mostrarlo). proveedor_norm es la clave.
  const proveedores = await dbAll<{ proveedor_norm: string; proveedor: string; n: bigint }>(
    `SELECT proveedor_norm, ANY_VALUE(proveedor) AS proveedor, COUNT(*)::BIGINT AS n
     FROM contratos
     WHERE municipio = 'cordoba-capital' AND proveedor_norm IS NOT NULL
     GROUP BY proveedor_norm
     ORDER BY n DESC`
  )
  console.log(`${proveedores.length.toLocaleString()} proveedores únicos en contratos cordobeses`)

  let resueltos = 0
  let porTier: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
  let errores = 0

  for (let i = 0; i < proveedores.length; i++) {
    const p = proveedores[i]
    try {
      const m = await resolverEmpresa(p.proveedor)
      porTier[m.tier] = (porTier[m.tier] ?? 0) + 1
      if (m.cuit) resueltos++
    } catch (err) {
      errores++
      if (errores < 5) console.warn(`  err ${p.proveedor}: ${(err as Error).message.slice(0, 60)}`)
    }
    if (i % 50 === 0) {
      process.stdout.write(`\r  progress ${i}/${proveedores.length}, resueltos: ${resueltos}, errores: ${errores}…`)
    }
  }
  process.stdout.write('\n')

  console.log(`\n=== Resumen ===`)
  console.log(`Total proveedores:           ${proveedores.length.toLocaleString()}`)
  console.log(`Resueltos (con CUIT):        ${resueltos.toLocaleString()}`)
  console.log(`Errores:                     ${errores}`)
  console.log(`\nDistribución por tier:`)
  console.log(`  Tier 1 (cuit_exact):       ${porTier[1] ?? 0}`)
  console.log(`  Tier 2 (name_normalized):  ${porTier[2] ?? 0}`)
  console.log(`  Tier 3 (name_fuzzy_high):  ${porTier[3] ?? 0}`)
  console.log(`  Tier 4 (llm_ambiguous):    ${porTier[4] ?? 0}`)
  console.log(`  Tier 5 (no_match):         ${porTier[5] ?? 0}`)

  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
