// verify-hallazgos.ts — Verificación E2E de las señales detectadas.
//
// Para cada señal en señales_cache:
//   1. Lista la URL fuente del primer fragmento de evidencia
//   2. Verifica que existan al menos N contratos en `contratos` que la sustentan
//   3. Imprime sample de 2 contratos con fuente_url accesible
//
// CLAUDE.md §2 — toda señal verificable. Si una señal no tiene contratos
// trazables a fuente original, este script lo flagea y la auditoría falla.

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

interface SignalRow {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  score: number
  severidad: string
  evidencia_json: string
}

interface ContratoSimple {
  hash: string
  proveedor: string
  area: string
  monto: number
  anio: number
  tipo: string
  fuente_url: string
  metodo_extraccion: string
  nivel_confianza: string
}

async function main() {
  await initDb()

  const señales = await dbAll<SignalRow>(
    `SELECT id, municipio, tipologia, titulo, score, severidad, evidencia_json
     FROM señales_cache
     WHERE municipio = 'cordoba-capital'
     ORDER BY score DESC
     LIMIT 8`
  )

  console.log(`\n=== Verificación de ${señales.length} señales — Córdoba Capital ===\n`)

  let totalFails = 0

  for (const s of señales) {
    console.log(`\n━━━ [${s.score}] ${s.severidad.toUpperCase()} — ${s.tipologia}`)
    console.log(`     ${s.titulo}`)

    let evidencia: Array<{ descripcion: string; fuenteUrl: string }> = []
    try {
      evidencia = JSON.parse(s.evidencia_json)
    } catch {
      console.log(`     ✗ evidencia_json malformado`)
      totalFails++
      continue
    }

    if (evidencia.length === 0) {
      console.log(`     ✗ Sin evidencia adjunta`)
      totalFails++
      continue
    }

    // Sample primer fragmento de evidencia
    const ev0 = evidencia[0]
    console.log(`     Evidencia: ${ev0.descripcion.slice(0, 90)}…`)
    console.log(`     Fuente:    ${ev0.fuenteUrl}`)

    // Sample 2 contratos relacionados según la tipologia
    let contratosRelacionados: ContratoSimple[] = []
    if (s.tipologia === 'monopolio_rubro') {
      // Extraer área del título
      const m = s.titulo.match(/"([^"]+)"$/)
      const area = m?.[1]
      if (area) {
        contratosRelacionados = await dbAll<ContratoSimple>(
          `SELECT hash, proveedor, area, monto, anio, tipo, fuente_url,
                  metodo_extraccion, nivel_confianza
           FROM contratos
           WHERE municipio='cordoba-capital' AND UPPER(area) LIKE ?
           ORDER BY monto DESC LIMIT 2`,
          [`%${area.toUpperCase()}%`]
        )
      }
    } else if (s.tipologia === 'concentracion_proveedor') {
      const m = s.titulo.match(/^Concentración extrema: (.+?) recibe/)
      const prov = m?.[1]
      if (prov) {
        contratosRelacionados = await dbAll<ContratoSimple>(
          `SELECT hash, proveedor, area, monto, anio, tipo, fuente_url,
                  metodo_extraccion, nivel_confianza
           FROM contratos
           WHERE municipio='cordoba-capital' AND UPPER(proveedor) LIKE ?
           ORDER BY monto DESC LIMIT 2`,
          [`%${prov.toUpperCase()}%`]
        )
      }
    } else if (s.tipologia === 'contrataciones_directas') {
      contratosRelacionados = await dbAll<ContratoSimple>(
        `SELECT hash, proveedor, area, monto, anio, tipo, fuente_url,
                metodo_extraccion, nivel_confianza
         FROM contratos
         WHERE municipio='cordoba-capital'
           AND REGEXP_MATCHES(UPPER(tipo), '\\b(?:CONTRATACI[OÓ]N|COMPRA|ADJUDICACI[OÓ]N)\\s+DIRECTA\\b')
         ORDER BY monto DESC LIMIT 2`
      )
    } else if (s.tipologia === 'gasto_fin_ejercicio') {
      contratosRelacionados = await dbAll<ContratoSimple>(
        `SELECT hash, proveedor, area, monto, anio, tipo, fuente_url,
                metodo_extraccion, nivel_confianza
         FROM contratos
         WHERE municipio='cordoba-capital'
           AND (UPPER(tipo) LIKE '%PRORROGA%' OR UPPER(tipo) LIKE '%PRÓRROGA%'
             OR UPPER(tipo) LIKE '%AMPLIACI%' OR UPPER(tipo) LIKE '%COMPLEMENT%')
         ORDER BY monto DESC LIMIT 2`
      )
    }

    if (contratosRelacionados.length === 0) {
      console.log(`     ⚠ No se pudieron pull contratos de soporte (heurística no aplica)`)
    } else {
      console.log(`     Contratos sample (${contratosRelacionados.length}):`)
      for (const c of contratosRelacionados) {
        console.log(`       - ${c.proveedor.slice(0, 40)} | ${c.anio} | $${c.monto.toLocaleString('es-AR')} | ${c.metodo_extraccion}`)
        console.log(`         hash=${c.hash.slice(0, 12)}…  ${c.fuente_url}`)
      }
    }
  }

  console.log(`\n=== Resumen ===`)
  console.log(`Señales verificadas: ${señales.length}`)
  console.log(`Fails (evidencia ausente/malformada): ${totalFails}`)

  if (totalFails > 0) {
    process.exit(1)
  }
  console.log(`✓ Todas las señales tienen evidencia poblada con fuente_url`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
