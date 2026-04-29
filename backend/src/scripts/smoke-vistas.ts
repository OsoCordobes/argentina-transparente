// Smoke de las vistas F6
import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

async function main() {
  await initDb()
  console.log('=== Smoke v_persona_dirige_empresa ===')
  const sample = await dbAll<{ dni: string; persona: string; cuit: string; empresa: string }>(
    `SELECT dni, persona_nombre AS persona, cuit, empresa_nombre AS empresa
       FROM v_persona_dirige_empresa
      LIMIT 5`,
  )
  for (const r of sample) {
    console.log(`  ${r.persona} (${r.dni}) → ${r.empresa} (${r.cuit})`)
  }
  const cnt = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM v_persona_dirige_empresa`)
  console.log(`  Total relaciones PF-dirige-PJ: ${cnt[0].n}`)

  console.log('\n=== Smoke v_actor_universo (top 5 por monto) ===')
  const top = await dbAll<{ kind: string; id: string; label: string; monto_total: number; senales_activas: number }>(
    `SELECT kind, id, label, monto_total, senales_activas
       FROM v_actor_universo
      WHERE monto_total > 0 OR senales_activas > 0
      ORDER BY monto_total DESC, senales_activas DESC
      LIMIT 5`,
  )
  for (const r of top) {
    console.log(`  ${r.kind} ${r.label.padEnd(40)} $${Number(r.monto_total).toLocaleString('es-AR').padStart(15)} señales=${r.senales_activas}`)
  }
  const ucnt = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM v_actor_universo`)
  console.log(`  Total actores: ${ucnt[0].n}`)
}
main().catch(e => { console.error(e); process.exit(1) })
