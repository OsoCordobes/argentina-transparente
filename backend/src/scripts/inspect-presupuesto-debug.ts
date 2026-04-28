// inspect-presupuesto-debug.ts — Diagnóstico paso-a-paso del parser presupuesto.
// El seed-cordoba-presupuesto.ts inserta 0 filas. Este script muestra:
//   1. Qué versiones existen del dataset 14
//   2. Qué descarga (xls/xlsx/csv?) — si hay fallback a xlsx que falta
//   3. Qué header detecta el parser
//   4. Qué columnas extrae regex de un row sample
//   5. Por qué descarta el row

import 'dotenv/config'
import {
  listarVersionesDataset, descargarRecursoDeVersion,
  parsearTablaConHeaderDetectable,
  inferirAnioMesDesdeTitulo, parseMontoAR,
} from '../lib/cordoba-portal'

const DATASET = process.argv[2] ?? '14'
const HEADER_KEYWORDS_BY_DS: Record<string, string[]> = {
  '14': ['partida', 'programa', 'jurisdic', 'credito', 'devengado', 'pagado', 'denomina', 'codigo'],
  '65': ['partida', 'comprometido', 'devengado', 'vigente', 'pagado', 'denomina', 'codigo'],
  '12': ['concepto', 'recaudacion', 'recaudado', 'calculo', 'calculado', 'estimado', 'cod'],
}

async function main() {
  console.log(`=== Diagnóstico dataset ${DATASET} ===\n`)
  const versiones = await listarVersionesDataset(DATASET)
  console.log(`Versiones encontradas: ${versiones.length}`)
  if (versiones.length === 0) return process.exit(1)

  // Tomar versiones con año conocido — preferir recientes
  const conAnio = versiones.filter(v => inferirAnioMesDesdeTitulo(v.titulo).anio !== null)
  if (conAnio.length === 0) { console.error('Ninguna versión tiene año inferible'); return process.exit(2) }

  // Probar hasta 5 versiones distintas hasta que alguna descargue
  const candidatas = conAnio.slice(0, 5)
  console.log(`\nProbando hasta ${candidatas.length} versiones...`)
  for (const cand of candidatas) {
    const { anio, mes } = inferirAnioMesDesdeTitulo(cand.titulo)
    console.log(`\n--- v${cand.id} — "${cand.titulo}" → ${anio}${mes ? '-' + mes : ''} ---`)
  for (const formatos of [['xls', 'csv'], ['xlsx'], ['xls', 'xlsx', 'csv']]) {
    console.log(`\nIntentando descarga con formatos: ${formatos.join(',')}`)
    const desc = await descargarRecursoDeVersion(DATASET, cand.id, formatos as ('xls'|'xlsx'|'csv')[])
    if (!desc) { console.log('  ✗ No descargó.'); continue }
    console.log(`  ✓ Descargó ${desc.recurso.url} (formato: ${desc.recurso.formato}, ${desc.buffer.length} bytes)`)

    const filas = parsearTablaConHeaderDetectable(
      desc.buffer,
      HEADER_KEYWORDS_BY_DS[DATASET] ?? [],
      { minMatches: 1, maxScanRows: 15 }
    )
    console.log(`  Filas parseadas: ${filas.length}`)
    if (filas.length > 0) {
      console.log(`  Columnas del header detectado: ${Object.keys(filas[0]).join(' | ')}`)
      const sample = filas.find(r => Object.values(r).some(v => v !== null && v !== ''))
      if (sample) {
        console.log(`  Sample row:`)
        for (const [k, v] of Object.entries(sample).slice(0, 12)) {
          console.log(`    ${k.padEnd(30)} = ${JSON.stringify(v)}`)
        }
        // Probar las regex del seed (patrones literales que usa seed-cordoba-presupuesto.ts)
        const programaRegexes = [/programa/i, /actividad/i, /concepto/i, /clase/i, /objeto/i, /^p\.pr/i]
        const partidaRegexes = [/partida.+codigo/i, /\bpartida$/i, /\bcodigo\b/i, /^cod\b/i, /^cod\./i, /^p\.pr/i]
        const partidaNombreRegexes = [/partida.+nombre/i, /partida.+denomina/i, /denomina/i, /^descrip/i, /^concepto$/i]
        const creditoInicialRegexes = [/credito.+inicial/i, /asignado/i, /presup.+inicial/i, /sancion/i, /calculado/i, /estimado/i]
        const creditoVigenteRegexes = [/credito.+vigente/i, /vigente/i, /actual/i, /definitivo/i]
        const devengadoRegexes = [/deveng/i, /compromis/i, /ejecutad/i]
        const pagadoRegexes = [/pagad/i, /\bpag\b/i, /recaudad/i, /recaudaci/i, /abonad/i]

        const matchAny = (regexes: RegExp[]) => Object.keys(sample).find(k => regexes.some(r => r.test(k))) ?? null
        console.log(`\n  Matches:`)
        console.log(`    programa     → ${matchAny(programaRegexes) ?? '(ninguno)'}`)
        console.log(`    partida      → ${matchAny(partidaRegexes) ?? '(ninguno)'}`)
        console.log(`    partidaNombre→ ${matchAny(partidaNombreRegexes) ?? '(ninguno)'}`)
        console.log(`    creditoInic  → ${matchAny(creditoInicialRegexes) ?? '(ninguno)'}`)
        console.log(`    creditoVig   → ${matchAny(creditoVigenteRegexes) ?? '(ninguno)'}`)
        console.log(`    devengado    → ${matchAny(devengadoRegexes) ?? '(ninguno)'}`)
        console.log(`    pagado       → ${matchAny(pagadoRegexes) ?? '(ninguno)'}`)

        // Intentar parsear los montos
        const tryParse = (re: RegExp[]) => {
          for (const k of Object.keys(sample)) {
            for (const r of re) {
              if (r.test(k)) {
                const v = parseMontoAR(sample[k])
                if (v !== null) return { k, raw: sample[k], parsed: v }
              }
            }
          }
          return null
        }
        console.log(`\n  Monto-parsing test:`)
        console.log(`    creditoInic  → ${JSON.stringify(tryParse(creditoInicialRegexes))}`)
        console.log(`    creditoVig   → ${JSON.stringify(tryParse(creditoVigenteRegexes))}`)
        console.log(`    devengado    → ${JSON.stringify(tryParse(devengadoRegexes))}`)
        console.log(`    pagado       → ${JSON.stringify(tryParse(pagadoRegexes))}`)
      }
      process.exit(0)  // suficiente con 1 versión que funcione
    }
  }
  } // candidatas

  process.exit(0)
}

main().catch(err => { console.error('Error fatal:', err); process.exit(1) })
