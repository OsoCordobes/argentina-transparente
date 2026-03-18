async function main() {
  const body = {
    municipioId: process.argv[2] ?? 'cordoba-capital',
    anioDesde: parseInt(process.argv[3] ?? '2023'),
    anioHasta: parseInt(process.argv[4] ?? '2023'),
  }
  console.log('Enviando:', body)

  const res = await fetch('http://localhost:3001/analizar', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })

  const data = await res.json() as any
  if (!data.ok) { console.error('Error:', data.error); process.exit(1) }

  const exp = data.expediente
  console.log('\n=== EXPEDIENTE GENERADO ===')
  console.log(`Municipio:  ${exp.municipio}`)
  console.log(`Período:    ${exp.periodo}`)
  console.log(`Generado:   ${exp.generadoEn}`)
  console.log(`Contratos:  ${exp.datosBase.totalContratos}`)
  console.log(`Monto:      ${exp.datosBase.montoTotal.toLocaleString('es-AR')}`)
  console.log(`\n--- RESUMEN EJECUTIVO ---`)
  console.log(exp.resumenEjecutivo)
  console.log(`\n--- SEÑALES (${exp.señales.length}) ---`)
  exp.señales.forEach((s: any) =>
    console.log(`  [${s.score}] [${s.legal.severidad}] ${s.tipologia}\n  ${s.titulo}\n`)
  )
  if (exp.guiaDenuncia) {
    console.log('--- GUÍA DE DENUNCIA ---')
    exp.guiaDenuncia.pasos.forEach((p: string) => console.log(' ', p))
  }
  console.log(`\n--- FUENTES ---`)
  exp.fuentes.forEach((f: any) => console.log(' ', f.url))
}
main().catch(console.error)
