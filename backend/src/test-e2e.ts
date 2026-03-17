async function main() {
  const res = await fetch('http://localhost:3001/analizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      municipioId: 'cordoba-capital',
      anioDesde: 2023,
      anioHasta: 2023,
    }),
  })
  const data = await res.json()
  if (!data.ok) {
    console.error('Error:', data.error)
    process.exit(1)
  }
  const exp = data.expediente
  console.log('=== EXPEDIENTE GENERADO ===')
  console.log(`Municipio: ${exp.municipio}`)
  console.log(`Período: ${exp.periodo}`)
  console.log(`Contratos: ${exp.datosBase.totalContratos}`)
  console.log(`Señales: ${exp.señales.length}`)
  console.log(`\n--- RESUMEN EJECUTIVO ---`)
  console.log(exp.resumenEjecutivo)
  console.log(`\n--- SEÑALES ---`)
  exp.señales.forEach((s: any) => console.log(`[${s.score}] ${s.titulo}`))
  if (exp.guiaDenuncia) {
    console.log(`\n--- GUÍA DE DENUNCIA ---`)
    exp.guiaDenuncia.pasos.forEach((p: any) => console.log(p))
  }
}
main().catch(console.error)
