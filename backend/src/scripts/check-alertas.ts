// check-alertas.ts — Detector que se ejecuta vía cron para refrescar alertas.
//
// Uso típico (crontab):
//   0 6 * * * cd /ruta/argos/backend && npm run alertas:check
//
// Cada corrida:
//   1. Re-evalúa scrapers_health → detecta scrapers rotos
//   2. Compara fuentes_datos.ultimo_crawl vs frecuencia esperada
//   3. Compara contratos count contra snapshot anterior → detecta datos nuevos
//   4. Persiste todo en la tabla `alertas` (idempotente — no genera duplicados)
//
// Frontend muestra badge en AppShell con count de no leídas.

import 'dotenv/config'
import { initDb } from '../lib/db'
import { detectarAlertas } from '../lib/alertas'

async function main() {
  console.log('=== ARGOS — Check Alertas ===\n')
  await initDb()

  const t0 = Date.now()
  const resultado = await detectarAlertas()
  const dur = Date.now() - t0

  console.log(`Generadas/actualizadas: ${resultado.generadas} alertas en ${dur}ms`)
  if (resultado.generadas > 0) {
    console.log('Por tipo:')
    for (const [tipo, cnt] of Object.entries(resultado.por_tipo)) {
      console.log(`  ${tipo}: ${cnt}`)
    }
  } else {
    console.log('Sin nuevos eventos detectados ✓')
  }
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
