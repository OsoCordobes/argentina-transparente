// migrate-cargos-funcionarios.ts — Deriva cargos_funcionarios desde
// agentes_publicos según PLAN-DATOS Fase A6.
//
// Idempotente: re-correr sobrescribe filas con mismo id. No toca
// agentes_publicos.
//
// Uso:
//   npm run migrate:cargos-funcionarios
import 'dotenv/config'
import { initDb } from '../lib/db'
import { derivarCargosFuncionariosDesdeAgentes } from '../lib/cargos-funcionarios'

async function main() {
  console.log('=== Migración A6 — derivar cargos_funcionarios desde agentes_publicos ===\n')
  await initDb()

  const start = Date.now()
  const { insertados, gruposEvaluados } = await derivarCargosFuncionariosDesdeAgentes()
  const elapsed = ((Date.now() - start) / 1000).toFixed(1)

  console.log(`Grupos evaluados:  ${gruposEvaluados}`)
  console.log(`Cargos derivados:  ${insertados}`)
  console.log(`Duración:          ${elapsed}s`)

  if (insertados === 0) {
    console.log('\n⚠ Cero cargos derivados. Verificar que agentes_publicos tiene filas con')
    console.log('  apellido_nombre + cargo + jurisdiccion + fuente_url no nulos.')
    process.exit(0)
  }

  console.log('\n✓ Migración completa. Próximos pasos:')
  console.log('  - Fase A4-A5: backfill de DNIs en cargos_funcionarios.dni')
  console.log('  - Curación humana de cargos_funcionarios.facultades_json')
  console.log('    (Director/Secretario/Jefe → poder de adjudicación, etc.)')
  process.exit(0)
}
main().catch(err => { console.error(err); process.exit(1) })
