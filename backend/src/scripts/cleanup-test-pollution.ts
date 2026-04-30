// cleanup-test-pollution.ts — Limpia test fixtures filtradas en producción.
//
// Hallazgo: scripts/audit-tier-pollution.ts encontró 259 filas test en
// identity_matches y 64 en igj_entidades. Este script audita TODAS las
// tablas con columnas de texto buscando los patrones de fixture y purga.
//
// Patrones identificados:
//   - "__TEST_F<n>_<timestamp>_T<n>A"   (fixture de identity-resolver tests)
//   - "TEST_F<n>"                        (variante)
//   - CUIT "99100000004"                 (CUIT canonical de fixtures)
//
// Política: NO modifica filas legítimas, solo elimina las que matchean los
// patrones de fixture estrictos.

import 'dotenv/config'
import { initDb, dbAll, dbRun } from '../lib/db'

const PATRONES_FIXTURE = [
  '%__TEST_F%',     // KAPPA YNDU SRL__TEST_F3_1777334453378_T4A
  '%__TEST_%',      // genérico
  '%FIXTURE%',
]

const CUIT_FIXTURES = ['99100000004']

interface TablaConfig {
  tabla: string
  columnaTexto: string  // columna principal a auditar
  columnaCuit?: string  // columna CUIT si aplica
}

const TABLAS: TablaConfig[] = [
  { tabla: 'identity_matches', columnaTexto: 'proveedor_norm', columnaCuit: 'cuit_resuelto' },
  { tabla: 'igj_entidades', columnaTexto: 'razon_social', columnaCuit: 'cuit' },
  { tabla: 'igj_autoridades', columnaTexto: 'apellido_nombre' },
  { tabla: 'agentes_publicos', columnaTexto: 'apellido_nombre' },
  { tabla: 'rns_personas_juridicas', columnaTexto: 'razon_social', columnaCuit: 'cuit' },
  { tabla: 'empresas', columnaTexto: 'nombre', columnaCuit: 'cuit' },
  { tabla: 'contratos', columnaTexto: 'proveedor' },
  { tabla: 'señales_cache', columnaTexto: 'titulo' },
]

async function tablaExiste(nombre: string): Promise<boolean> {
  try {
    const r = await dbAll<{ name: string }>(`PRAGMA table_info('${nombre}')`)
    return r.length > 0
  } catch {
    return false
  }
}

async function columnaExiste(tabla: string, columna: string): Promise<boolean> {
  try {
    const r = await dbAll<{ name: string }>(`PRAGMA table_info('${tabla}')`)
    return r.some(c => c.name === columna)
  } catch {
    return false
  }
}

async function main() {
  await initDb()

  console.log('=== ARGOS — Cleanup test pollution ===\n')
  console.log('Patrones detectados como fixture:')
  for (const p of PATRONES_FIXTURE) console.log(`  ${p}`)
  console.log(`CUITs canónicos de fixture: ${CUIT_FIXTURES.join(', ')}\n`)

  let totalEliminadas = 0
  const reporte: Array<{ tabla: string; eliminadas: number }> = []

  for (const cfg of TABLAS) {
    if (!(await tablaExiste(cfg.tabla))) {
      console.log(`  ${cfg.tabla}: tabla no existe — skip`)
      continue
    }
    if (!(await columnaExiste(cfg.tabla, cfg.columnaTexto))) {
      console.log(`  ${cfg.tabla}.${cfg.columnaTexto}: columna no existe — skip`)
      continue
    }

    // Construir WHERE
    const whereParts: string[] = []
    const params: any[] = []

    for (const p of PATRONES_FIXTURE) {
      whereParts.push(`"${cfg.columnaTexto}" LIKE ?`)
      params.push(p)
    }

    if (cfg.columnaCuit && await columnaExiste(cfg.tabla, cfg.columnaCuit)) {
      for (const c of CUIT_FIXTURES) {
        whereParts.push(`"${cfg.columnaCuit}" = ?`)
        params.push(c)
      }
    }

    const whereSql = whereParts.join(' OR ')

    const before = (await dbAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM "${cfg.tabla}" WHERE ${whereSql}`, params
    ))[0].n

    if (Number(before) === 0) {
      console.log(`  ${cfg.tabla}: 0 fixtures — limpia`)
      continue
    }

    await dbRun(`DELETE FROM "${cfg.tabla}" WHERE ${whereSql}`, params)

    const eliminadas = Number(before)
    totalEliminadas += eliminadas
    reporte.push({ tabla: cfg.tabla, eliminadas })
    console.log(`  ${cfg.tabla}: -${eliminadas} filas test eliminadas`)
  }

  console.log(`\n=== Total eliminadas: ${totalEliminadas} filas ===`)

  // Re-correr detector M4.1 para ver impacto
  console.log('\n=== Impacto en M4.1 ===')
  const { ejecutarDetector } = await import('../lib/detector-conflicto-funcionario-proveedor')
  const r = await ejecutarDetector({ reemplazarExistentes: true })
  console.log(`  Candidatos:           ${r.candidatos}`)
  console.log(`  Patrones sistémicos:  ${r.patronesSistemicos}`)
  console.log(`  Señales totales:      ${r.insertadas}`)

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
