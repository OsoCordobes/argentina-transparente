async function main() {
  const BACKEND = 'https://bestia-backend-3e456938-0eae-49cf-b246-93a05746e060-production.up.railway.app'

  // Test 1: health
  const health = await fetch(`${BACKEND}/health`)
  const healthData = await health.json()
  console.log('Health:', healthData)
  if (!healthData.ok) throw new Error('Health check failed')

  // Test 2: municipios
  const muni = await fetch(`${BACKEND}/municipios`)
  const muniData = await muni.json()
  console.log('Municipios:', muniData.length, muniData.map((m: any) => m.id).join(', '))

  // Test 3: analizar 2023
  console.log('\nAnalizando Córdoba Capital 2023 (puede tardar 2 min)...')
  const res = await fetch(`${BACKEND}/analizar`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ municipioId: 'cordoba-capital', anioDesde: 2023, anioHasta: 2023 })
  })
  const data = await res.json() as any
  if (!data.ok) throw new Error('Analizar failed: ' + data.error)

  const exp = data.expediente
  console.log('\n=== EXPEDIENTE PRODUCCIÓN ===')
  console.log('Municipio:', exp.municipio)
  console.log('Contratos:', exp.datosBase.totalContratos)
  console.log('Monto total:', exp.datosBase.montoTotal.toLocaleString('es-AR'))
  console.log('Señales:', exp.señales.length)
  exp.señales.forEach((s: any) => console.log(`  [${s.score}] ${s.tipologia}: ${s.titulo.slice(0, 80)}`))
  console.log('\nResumen (primeras 200 chars):', exp.resumenEjecutivo.slice(0, 200))
  console.log('\n✅ TEST E2E PRODUCCIÓN: PASSED')
}
main().catch(e => { console.error('❌ FAILED:', e.message); process.exit(1) })

export {}
