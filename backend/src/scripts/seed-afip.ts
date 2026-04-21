// seed-afip.ts — Enriquece los top proveedores con datos AFIP
//
// Pre-requisito: npm run seed:cordoba (datos cargados en DuckDB)
//
// Ejecutar: npm run seed:afip
// Con --force: re-enriquece todos

import 'dotenv/config'
import { initDb, getContratosCount, dbAll, upsertEmpresa } from '../lib/db'
import { verificarCUIT } from '../lib/afip'

const TOP_N = 50
const BATCH_SIZE = 5
const DELAY_MS = 1500 // ser amable con cuitonline.com

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function main() {
  console.log('=== ARGOS — Seed AFIP ===\n')

  await initDb()

  const totalContratos = await getContratosCount()
  if (totalContratos === 0) {
    console.error('No hay contratos en la base de datos.')
    console.error('Ejecutar primero: npm run seed:cordoba')
    process.exit(1)
  }

  // Get top providers by total amount
  const topProveedores = await dbAll<{ proveedor: string; monto_total: number; contratos: number }>(`
    SELECT
      proveedor_norm as proveedor,
      SUM(monto) as monto_total,
      COUNT(*) as contratos
    FROM contratos
    GROUP BY proveedor_norm
    ORDER BY monto_total DESC
    LIMIT ?
  `, [TOP_N])

  console.log(`Top ${topProveedores.length} proveedores por monto:\n`)

  let enriched = 0
  let failed = 0

  for (let i = 0; i < topProveedores.length; i += BATCH_SIZE) {
    const batch = topProveedores.slice(i, i + BATCH_SIZE)

    const results = await Promise.allSettled(
      batch.map(p => verificarCUIT(p.proveedor))
    )

    for (let j = 0; j < batch.length; j++) {
      const prov = batch[j]
      const result = results[j]

      if (result.status === 'fulfilled' && result.value.encontrado && result.value.cuit) {
        const data = result.value
        await upsertEmpresa({
          cuit: data.cuit!,
          nombre: data.razonSocial ?? prov.proveedor,
          esEmpleador: data.esEmpleador,
          inicioActividades: data.inicioActividades,
          estado: data.estado,
          actividadPrincipal: data.actividadPrincipal,
          fuenteUrl: data.fuenteUrl,
        })
        enriched++
        console.log(`  ✓ ${prov.proveedor} → CUIT ${data.cuit} (empleador: ${data.esEmpleador ? 'SÍ' : 'NO'})`)
      } else {
        failed++
        const reason = result.status === 'rejected' ? result.reason : 'no encontrado'
        console.log(`  ✗ ${prov.proveedor} → ${reason}`)
      }
    }

    if (i + BATCH_SIZE < topProveedores.length) {
      await sleep(DELAY_MS)
    }
  }

  console.log(`\n=== Resultado ===`)
  console.log(`Enriquecidos: ${enriched}/${topProveedores.length}`)
  console.log(`Fallidos: ${failed}`)
  console.log(`\n✓ Seed AFIP completado.`)
  process.exit(0)
}

main().catch(err => {
  console.error('Error fatal:', err)
  process.exit(1)
})
