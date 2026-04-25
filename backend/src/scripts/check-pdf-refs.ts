import * as XLSX from 'xlsx'

async function main() {
  const url = 'https://gobiernoabierto.cordoba.gob.ar/api/datos-abiertos/dato/2/version-dato/4747/recurso'
  const resp = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Accept: 'application/json' } })
  const data = await resp.json() as { results: Array<{ url: string; titulo: string; formato?: string; icono?: string }> }

  const refs = data.results.find(r => {
    const fmt = (r.formato ?? r.icono ?? '').toLowerCase()
    return fmt.includes('xls') && r.titulo.toLowerCase().includes('referencia')
  })!
  const refsBuf = Buffer.from(await (await fetch(refs.url)).arrayBuffer())
  const wb = XLSX.read(refsBuf, { type: 'buffer' })
  const rows = XLSX.utils.sheet_to_json<{ ir: string; nombre: string; orden: number; url: string }>(wb.Sheets[wb.SheetNames[0]])

  // Distribución por tipo de documento
  const porTipo = new Map<string, number>()
  for (const r of rows) {
    const n = (r.nombre ?? '').toLowerCase()
    porTipo.set(n, (porTipo.get(n) ?? 0) + 1)
  }
  console.log('Tipos de documento:')
  for (const [t, c] of [...porTipo.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15)) {
    console.log(`  ${c.toString().padStart(5)}  ${t.slice(0, 80)}`)
  }

  // Filtrar adjudicaciones / contratos
  const adjudicaciones = rows.filter(r => {
    const n = (r.nombre ?? '').toLowerCase()
    return n.includes('adjudic') || n.includes('contrato') || n.includes('orden de compra') || n.includes('decreto')
  })
  console.log(`\n${adjudicaciones.length} documentos de adjudicación / contrato / orden de compra / decreto`)

  // Probar accesibilidad de algunas URLs (HEAD)
  console.log('\nProbando HEAD a 5 URLs de adjudicaciones:')
  for (const r of adjudicaciones.slice(0, 5)) {
    try {
      const ctl = new AbortController()
      const t = setTimeout(() => ctl.abort(), 8000)
      const head = await fetch(r.url, { method: 'HEAD', signal: ctl.signal, headers: { 'User-Agent': 'Mozilla/5.0' } }).catch(() => null)
      clearTimeout(t)
      const status = head?.status ?? 'ERR'
      const size = head?.headers.get('content-length') ?? '?'
      console.log(`  HTTP ${status} (${size} bytes) — ${r.nombre.slice(0, 50)}`)
      console.log(`    ${r.url}`)
    } catch (e) {
      console.log(`  ERR — ${(e as Error).message}`)
    }
  }
}
main().catch(console.error)
