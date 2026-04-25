// inspect-boletin-csvs.ts — Descarga los CSVs del dataset 2781 y muestra
// las primeras filas para entender la estructura.

import * as XLSX from 'xlsx'
import { listarVersiones, listarRecursos } from '../lib/boletin-cordoba'

async function inspeccionarRecurso(versionId: string, formato: string) {
  const recursos = await listarRecursos(versionId)
  // formato puede estar en .formato o .icono según el recurso
  const r = recursos.find(rs => {
    const f = ((rs as { formato?: string; icono?: string }).formato
              ?? (rs as { formato?: string; icono?: string }).icono
              ?? '').toLowerCase()
    return f.includes(formato.toLowerCase())
  })
  if (!r) {
    console.log(`  No hay recurso ${formato} en versión ${versionId}`)
    console.log(`  Disponibles: ${recursos.map(r => (r as { formato?: string; icono?: string }).formato ?? (r as { formato?: string; icono?: string }).icono ?? '?').join(', ')}`)
    return
  }
  console.log(`  Descargando: ${r.titulo}`)
  console.log(`  URL: ${r.url.slice(0, 100)}...`)

  const res = await fetch(r.url)
  if (!res.ok) { console.log(`  HTTP ${res.status}`); return }

  const buf = Buffer.from(await res.arrayBuffer())
  console.log(`  Tamaño: ${(buf.length / 1024).toFixed(1)} KB`)

  // Intentar parsear como xlsx (XLSX puede leer csv también)
  try {
    const wb = XLSX.read(buf, { type: 'buffer' })
    const sheet = wb.Sheets[wb.SheetNames[0]]
    const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null })
    console.log(`  Filas: ${rows.length}`)
    if (rows.length > 0) {
      console.log(`  Columnas: ${Object.keys(rows[0]).join(' | ')}`)
      console.log(`  Primera fila:`)
      for (const [k, v] of Object.entries(rows[0])) {
        const val = String(v ?? '').slice(0, 100)
        console.log(`    ${k}: ${val}`)
      }
      if (rows.length > 1) {
        console.log(`  Segunda fila (muestra):`)
        for (const [k, v] of Object.entries(rows[1])) {
          const val = String(v ?? '').slice(0, 80)
          console.log(`    ${k}: ${val}`)
        }
      }
    }
  } catch (err) {
    console.log(`  No parseable como xlsx: ${(err as Error).message}`)
    // Mostrar primeras líneas como texto
    const text = buf.toString('utf8')
    const lines = text.split('\n').slice(0, 5)
    for (const l of lines) console.log(`  > ${l.slice(0, 200)}`)
  }
}

async function main() {
  const versiones = await listarVersiones()
  for (const v of versiones) {
    console.log(`\n=== Versión ${v.id}: ${v.titulo} ===`)
    // Intentar xls primero, fallback a csv
    await inspeccionarRecurso(v.id, 'xls').catch(e => console.log(`  Error xls: ${e.message}`))
  }
}

main().catch(err => { console.error(err); process.exit(1) })
