// m1-summary.ts — Resumen post-M1 de cobertura DB ARGOS.
// Comparar contra estado pre-M1 documentado en MISION-CORDOBA-2010-2026.md.

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

interface Row { c: bigint }

async function count(sql: string, params: unknown[] = []): Promise<number> {
  try {
    const r = await dbAll<Row>(sql, params)
    return Number(r[0]?.c ?? 0)
  } catch {
    return -1
  }
}

async function main() {
  await initDb()
  console.log('=== M1 Summary — ARGOS data coverage ===\n')

  const tabla = async (name: string, label: string, etiqueta: string) => {
    const c = await count(`SELECT COUNT(*)::BIGINT AS c FROM ${name}`)
    console.log(`${label.padEnd(38)} ${c.toLocaleString().padStart(10)}  ${etiqueta}`)
  }

  console.log('CONTRATACIONES')
  await tabla('contratos', 'contratos (todos municipios)', 'M1.1')
  const contCba = await count(`SELECT COUNT(*)::BIGINT AS c FROM contratos WHERE municipio='cordoba-capital'`)
  console.log(`  └ Córdoba Capital                     ${contCba.toLocaleString().padStart(10)}`)

  console.log('\nSALARIOS Y NÓMINA')
  await tabla('agentes_publicos', 'agentes_publicos (todos)', 'M1.2 + M1.3')
  const porCat = await dbAll<{cat:string,c:bigint}>(`SELECT categoria AS cat, COUNT(*)::BIGINT AS c FROM agentes_publicos GROUP BY categoria ORDER BY c DESC`)
  for (const r of porCat) console.log(`  └ ${r.cat.padEnd(18)} ${Number(r.c).toLocaleString().padStart(20)}`)

  console.log('\nEMPRESAS / PROVEEDORES')
  await tabla('empresas', 'empresas (cualquier fuente)', 'M1.8 + AFIP')
  const porFuente = await dbAll<{f:string,c:bigint}>(`SELECT fuente_padron AS f, COUNT(*)::BIGINT AS c FROM empresas GROUP BY fuente_padron ORDER BY c DESC`)
  for (const r of porFuente) console.log(`  └ ${(r.f ?? '(null)').padEnd(35)} ${Number(r.c).toLocaleString().padStart(10)}`)
  await tabla('empresas_padron_provincial', 'empresas_padron_provincial', 'M1.8')
  await tabla('proveedores_padron', 'proveedores_padron (catalogo)', '—')

  console.log('\nIGJ + RNS (personas jurídicas)')
  await tabla('igj_entidades', 'igj_entidades', '(pre-M1)')
  await tabla('igj_autoridades', 'igj_autoridades', '(pre-M1)')
  await tabla('rns_personas_juridicas', 'rns_personas_juridicas', 'M1.4')
  // RNS por provincia (top 5)
  const rnsProv = await dbAll<{p:string,c:bigint}>(`
    SELECT COALESCE(dom_legal_provincia, dom_fiscal_provincia, '(sin provincia)') AS p,
           COUNT(*)::BIGINT AS c
    FROM rns_personas_juridicas
    GROUP BY 1 ORDER BY c DESC LIMIT 5
  `).catch(() => [])
  for (const r of rnsProv) console.log(`  └ ${r.p.padEnd(40)} ${Number(r.c).toLocaleString().padStart(10)}`)

  console.log('\nPRESUPUESTO Y OBRAS')
  await tabla('presupuesto_ejecucion', 'presupuesto_ejecucion', 'M1.7 (parcial)')
  await tabla('obras_publicas', 'obras_publicas', '(post-M1)')
  await tabla('transferencias', 'transferencias', '(post-M1)')

  console.log('\nMETADATA / TRAZABILIDAD')
  await tabla('fuentes_publicas_catalogo', 'fuentes_publicas_catalogo', 'meta')
  await tabla('fuentes_datos', 'fuentes_datos', 'meta')

  console.log('\nDETECCIONES')
  await tabla('señales_cache', 'señales_cache', '—')

  process.exit(0)
}

main().catch(e => { console.error(e); process.exit(1) })
