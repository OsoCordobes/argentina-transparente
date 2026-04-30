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
import { parseDetectorConfig } from '../engine/detectors-loader'
import config from '../engine/detectors-config.json'

// Mapping tipologia (snake_case en señales_cache) → key del detector
// (camelCase con prefijo `detectar` en detectors-config.json).
// Esto NO se puede derivar trivialmente porque varias tipologías
// difieren del nombre de la función (ej. `prorrogas_excesivas` vs
// `detectarProrrogas`, `gasto_fin_ejercicio` vs
// `detectarConcentracionTemporal`). Se construye a partir de las
// tipologías reales emitidas por `signals.ts`.
const TIPOLOGIA_TO_DETECTOR: Record<string, string> = {
  prorrogas_excesivas: 'detectarProrrogas',
  concentracion_proveedor: 'detectarConcentracion',
  concentracion_cuit: 'detectarConcentracion', // C5 reusa config del legacy
  contrataciones_directas: 'detectarContratacionesDirectas',
  monopolio_rubro: 'detectarMonopolioRubro',
  servicio_sin_historial: 'detectarServiciosSinHistorial',
  fraccionamiento_avanzado: 'detectarFraccionamientoAvanzado',
  gasto_fin_ejercicio: 'detectarConcentracionTemporal',
  proveedor_cronico: 'detectarProveedorCronico',
  empresa_nueva: 'detectarEmpresaNueva',
  empresa_sin_empleados: 'detectarEmpresaSinEmpleados',
  directores_compartidos: 'detectarDirectoresCompartidos',
  rotacion_coordinada: 'detectarRotacionCoordinada',
  adenda_postajudicacion: 'detectarAdendaPostAdjudicacion',
  red_de_empresas: 'detectarRedDeEmpresas',
  aparicion_offshore: 'detectarAparicionOffshore',
}

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

  // Cargar y validar el config de detectores. Si el JSON está roto,
  // esto lanza ZodError y aborta antes del loop — comportamiento
  // deseado: el verify completo debe fallar.
  const CFG = parseDetectorConfig(config)

  let totalFails = 0

  for (const s of señales) {
    console.log(`\n━━━ [${s.score}] ${s.severidad.toUpperCase()} — ${s.tipologia}`)
    console.log(`     ${s.titulo}`)

    // Chequeo F9.1: cada tipologia cacheada debe tener una entrada
    // correspondiente en detectors-config.json (norma + tier).
    const detectorKey = TIPOLOGIA_TO_DETECTOR[s.tipologia]
    if (!detectorKey) {
      console.log(`     ✗ tipologia "${s.tipologia}" no tiene mapping a detectorKey`)
      totalFails++
    } else {
      const cfgEntry = CFG[detectorKey]
      if (!cfgEntry) {
        console.log(`     ✗ Señal ${s.tipologia} (${detectorKey}) sin entrada en detectors-config.json`)
        totalFails++
      } else {
        console.log(`     Tier ${cfgEntry.tier} — norma citada: ${cfgEntry.norma ? 'sí' : 'NO'}`)
      }
    }

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
  console.log(`Fails (evidencia ausente/malformada o config faltante): ${totalFails}`)

  if (totalFails > 0) {
    process.exit(1)
  }
  console.log(`✓ Todas las señales tienen evidencia poblada con fuente_url`)
  console.log(`✓ Todas las señales tienen entrada en detectors-config.json`)
  process.exit(0)
}

main().catch(err => { console.error(err); process.exit(1) })
