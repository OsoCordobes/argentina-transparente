// audit-no-pollution.ts — Guard CI: falla si hay test fixtures en
// tablas productivas. Se inspira en el hallazgo W4 (commit 2026-04-28)
// que halló 967 filas test contaminando empresas/identity_matches/
// igj_entidades/igj_autoridades/agentes_publicos/rns_personas_juridicas.
//
// Patrones canónicos de fixture (no inventar nuevos sin actualizar
// cleanup-test-pollution.ts):
//   - "__TEST_F<n>_<timestamp>"   suffix de identity-resolver.test.ts
//   - "__TEST_"                    genérico
//   - "FIXTURE"                    legado
//   - CUIT "991*" / "999*" / "111*"  rangos sintéticos (no AFIP-real)
//
// Uso en CI:
//   npm run audit-no-pollution
// Exit code 0 si limpio, 1 si encuentra polución.

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

const PATRONES_NOMBRE = ['%__TEST_%', '%FIXTURE%']
const PATRONES_CUIT = ['991%', '999%', '111%']

interface TablaCheck {
  tabla: string
  columnaTexto: string
  columnaCuit?: string
}

const CHECKS: TablaCheck[] = [
  { tabla: 'identity_matches', columnaTexto: 'proveedor_norm', columnaCuit: 'cuit_resuelto' },
  { tabla: 'igj_entidades', columnaTexto: 'razon_social', columnaCuit: 'cuit' },
  { tabla: 'igj_autoridades', columnaTexto: 'apellido_nombre' },
  { tabla: 'agentes_publicos', columnaTexto: 'apellido_nombre' },
  { tabla: 'rns_personas_juridicas', columnaTexto: 'razon_social', columnaCuit: 'cuit' },
  { tabla: 'empresas', columnaTexto: 'nombre', columnaCuit: 'cuit' },
  { tabla: 'contratos', columnaTexto: 'proveedor' },
  { tabla: 'señales_cache', columnaTexto: 'titulo' },
]

async function existeColumna(tabla: string, columna: string): Promise<boolean> {
  try {
    const r = await dbAll<{ name: string }>(`PRAGMA table_info('${tabla}')`)
    return r.some(c => c.name === columna)
  } catch {
    return false
  }
}

async function main() {
  await initDb()

  console.log('=== ARGOS — Audit no-pollution ===\n')

  const ofensores: Array<{ tabla: string; n: number; ejemplo: string }> = []

  for (const c of CHECKS) {
    if (!(await existeColumna(c.tabla, c.columnaTexto))) continue

    const ors: string[] = []
    const params: any[] = []

    for (const p of PATRONES_NOMBRE) {
      ors.push(`"${c.columnaTexto}" LIKE ?`)
      params.push(p)
    }

    if (c.columnaCuit && await existeColumna(c.tabla, c.columnaCuit)) {
      for (const p of PATRONES_CUIT) {
        ors.push(`"${c.columnaCuit}" LIKE ?`)
        params.push(p)
      }
    }

    const where = ors.join(' OR ')
    const r = await dbAll<{ n: number; ej: string | null }>(
      `SELECT COUNT(*) AS n, MAX("${c.columnaTexto}") AS ej
         FROM "${c.tabla}" WHERE ${where}`,
      params
    )

    const n = Number(r[0]?.n ?? 0)
    if (n > 0) {
      ofensores.push({ tabla: c.tabla, n, ejemplo: r[0].ej ?? '(null)' })
      console.log(`  ❌ ${c.tabla}: ${n} fila(s) con polución`)
      console.log(`     ejemplo: "${r[0].ej}"`)
    } else {
      console.log(`  ✅ ${c.tabla}: limpia`)
    }
  }

  console.log()

  if (ofensores.length > 0) {
    console.error(`FAIL: ${ofensores.length} tabla(s) con test pollution.\n`)
    console.error('Para limpiar: `npx ts-node src/scripts/cleanup-test-pollution.ts`')
    console.error('Para evitar recurrencia: revisar cleanup() en *.test.ts')
    process.exit(1)
  }

  console.log('OK: todas las tablas productivas libres de fixtures.')
  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
