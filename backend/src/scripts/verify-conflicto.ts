// verify-conflicto.ts — Asistente de verificación humana para señales M4.1
// (PLAN-DATOS Fase E1). Habilita el "human-in-the-loop" descrito en
// PLAN-UI §8 — sin esto el cap-60 sin DNI confirmado nunca sube a 95.
//
// Flujo:
//   1. Toma señal_id de tipologia conflicto_funcionario_proveedor
//   2. Lee la señal de señales_cache + extrae dni_director y funcionario
//   3. Busca en declaraciones_juradas por apellido_nombre_norm + jurisdicción
//   4. Imprime comparación lado-a-lado: DNI del funcionario (DDJJ) vs DNI
//      del director (IGJ)
//   5. Si --action=verificar: si DDJJ trae DNI que coincide con el director,
//      marca la señal como 'verificada' vía helpers de A7
//   6. Si --action=descartar: marca como 'descartada' (homonimia confirmada)
//
// Uso:
//   npm run verify:conflicto -- --signal <id> [--por <handle>]
//   npm run verify:conflicto -- --signal <id> --action verificar --por amiun@gmail.com
//   npm run verify:conflicto -- --signal <id> --action descartar --por amiun@gmail.com

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'
import {
  marcarSeñalVerificada,
  marcarSeñalDescartada,
  marcarSeñalBloqueada,
} from '../lib/verificacion-senales'
import { validarDNI, normalizarDNI } from '../lib/identidad-validator'
// Review #1 E1: reusar el normalizador canónico (review A1 #1)
import { normalizarApellidoNombre } from '../lib/personas-fisicas'

interface Args {
  signalId: string | undefined
  action: 'verificar' | 'descartar' | 'bloquear' | 'inspeccionar'
  por: string | undefined
}

function parseArgs(): Args {
  const a = process.argv.slice(2)
  const out: Args = { signalId: undefined, action: 'inspeccionar', por: undefined }
  for (let i = 0; i < a.length; i++) {
    if (a[i] === '--signal') { out.signalId = a[i + 1]; i++ }
    else if (a[i] === '--por') { out.por = a[i + 1]; i++ }
    else if (a[i] === '--action') {
      const v = a[i + 1]
      if (v === 'verificar' || v === 'descartar' || v === 'bloquear' || v === 'inspeccionar') {
        out.action = v
      } else {
        console.error(`action desconocido: ${v}. Permitidos: verificar, descartar, bloquear, inspeccionar`)
        process.exit(2)
      }
      i++
    }
  }
  return out
}

interface SeñalRow {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: string
  evidencia_json: string
  estado_verificacion: string
  verificado_por: string | null
  verificado_en: string | null
}

interface DDJJRow {
  apellido_nombre: string
  apellido_nombre_norm: string
  anio_declarado: number | null
  dni: string | null
  cuit: string | null
  pdf_url: string | null
  fuente_url: string
}

export function extraerDNIDirectorEvidencia(evidenciaJson: string): string | null {
  try {
    const ev = JSON.parse(evidenciaJson) as Array<{ descripcion: string }>
    // Match "DNI <digits>" en cualquier descripción de evidencia
    for (const e of ev) {
      const m = e.descripcion.match(/DNI\s+(\d{6,9})/)
      if (m) return m[1]
    }
  } catch {
    return null
  }
  return null
}

/**
 * Review #1 E1: parser tolerante a las dos tipologias del detector M4.1.
 *   - conflicto_funcionario_proveedor → "Conflicto potencial: APELLIDO NOMBRE (jurisdiccion)..."
 *   - conflicto_funcionario_multiproveedor → "Patrón sistémico: APELLIDO NOMBRE (jurisdiccion)..."
 *
 * Antes solo cubría la primera. Una señal de patrón sistémico no se podía
 * verificar por este script — caía en el fallback de resumen, menos preciso.
 */
export function extraerFuncionarioYJurisdiccion(titulo: string, resumen: string): { funcionario: string | null; jurisdiccion: string | null } {
  // Cubre ambas tipologias del detector M4.1
  const m = titulo.match(/(?:Conflicto potencial|Patrón sistémico):\s+([^(]+?)\s+\(([^)]+)\)/)
  if (m) return { funcionario: m[1].trim(), jurisdiccion: m[2].trim() }
  // Fallback al resumen
  const m2 = resumen.match(/funcionario\s+([A-ZÁÉÍÓÚÑ][^,]*?)\s+comparte/)
  return { funcionario: m2 ? m2[1].trim() : null, jurisdiccion: null }
}

// normalizarApellidoNombre ahora viene de personas-fisicas.ts (review A1 #1)
// Antes había una copia local — duplicación eliminada.

async function main() {
  console.log('=== ARGOS — verify-conflicto (Fase E1) ===\n')
  const args = parseArgs()

  if (!args.signalId) {
    console.error('Falta --signal <id>. Uso:')
    console.error('  npm run verify:conflicto -- --signal <id>')
    console.error('  npm run verify:conflicto -- --signal <id> --action verificar --por <handle>')
    console.error('  npm run verify:conflicto -- --signal <id> --action descartar --por <handle>')
    console.error('  npm run verify:conflicto -- --signal <id> --action bloquear --por <handle>')
    process.exit(2)
  }

  await initDb()

  // 1. Lookup señal
  const señales = await dbAll<SeñalRow>(
    `SELECT id, municipio, tipologia, titulo, resumen, score, severidad,
            evidencia_json, estado_verificacion, verificado_por, verificado_en
       FROM señales_cache
      WHERE id = ?`,
    [args.signalId],
  )
  if (señales.length === 0) {
    console.error(`Señal ${args.signalId} no encontrada en señales_cache.`)
    process.exit(1)
  }
  const s = señales[0]

  if (s.tipologia !== 'conflicto_funcionario_proveedor' && s.tipologia !== 'conflicto_funcionario_multiproveedor') {
    console.error(`Esta señal es de tipologia "${s.tipologia}". verify-conflicto solo aplica a conflicto_funcionario_proveedor o multiproveedor.`)
    process.exit(2)
  }

  console.log('Señal:')
  console.log(`  ID:        ${s.id}`)
  console.log(`  Municipio: ${s.municipio}`)
  console.log(`  Tipologia: ${s.tipologia}`)
  console.log(`  Score:     ${s.score} (${s.severidad})`)
  console.log(`  Titulo:    ${s.titulo}`)
  console.log(`  Estado:    ${s.estado_verificacion}${s.verificado_por ? ` (por ${s.verificado_por})` : ''}\n`)

  // 2. Extract director DNI + funcionario from evidence
  const dniDirector = extraerDNIDirectorEvidencia(s.evidencia_json)
  const { funcionario, jurisdiccion } = extraerFuncionarioYJurisdiccion(s.titulo, s.resumen)
  if (!dniDirector || !funcionario) {
    console.error('No se pudo extraer DNI del director o nombre del funcionario de la evidencia.')
    console.error('Evidencia:', s.evidencia_json.slice(0, 300))
    process.exit(1)
  }
  const funcionarioNorm = normalizarApellidoNombre(funcionario)

  console.log('Datos extraídos:')
  console.log(`  Funcionario:        ${funcionario}`)
  console.log(`  Funcionario_norm:   ${funcionarioNorm}`)
  console.log(`  Jurisdicción:       ${jurisdiccion ?? 'N/D'}`)
  console.log(`  DNI director (IGJ): ${dniDirector}\n`)

  // 3. Lookup DDJJ
  // Review #2 E1: filtramos por jurisdicción cuando la pudimos extraer del
  // título. Antes mezclábamos DDJJ de cordoba-capital con cordoba-provincia
  // si había homónimos — false-positive verifications. La señal sabe en qué
  // jurisdicción opera el funcionario; usar eso como filtro estricto.
  // Si no se pudo extraer jurisdicción, fallback al comportamiento legacy
  // (sin filtro) con un warning explícito.
  const ddjjQuery = jurisdiccion
    ? `SELECT apellido_nombre, apellido_nombre_norm, anio_declarado, dni, cuit, pdf_url, fuente_url
         FROM declaraciones_juradas
        WHERE apellido_nombre_norm = ? AND jurisdiccion = ?
        ORDER BY anio_declarado DESC NULLS LAST`
    : `SELECT apellido_nombre, apellido_nombre_norm, anio_declarado, dni, cuit, pdf_url, fuente_url
         FROM declaraciones_juradas
        WHERE apellido_nombre_norm = ?
        ORDER BY anio_declarado DESC NULLS LAST`
  const ddjjParams = jurisdiccion ? [funcionarioNorm, jurisdiccion] : [funcionarioNorm]
  const ddjjs = await dbAll<DDJJRow>(ddjjQuery, ddjjParams)
  if (jurisdiccion) {
    console.log(`DDJJ matches por norm="${funcionarioNorm}" en jurisdiccion="${jurisdiccion}": ${ddjjs.length} fila(s)\n`)
  } else {
    console.log(`⚠ Sin jurisdicción en título — query global. ${ddjjs.length} fila(s) por norm="${funcionarioNorm}".`)
    console.log(`  Posibles falsos positivos por homonimia cross-jurisdicción. Verificar manualmente.\n`)
  }

  if (ddjjs.length === 0) {
    console.log('⚠ Sin DDJJ matching. Verificación NO automatizable — falta data upstream.')
    console.log('  Posibles caminos:')
    console.log('  - Esperar OCR de DDJJ (W2 pipeline existe, acceso bloqueado)')
    console.log('  - Buscar nombramiento del funcionario en boletín municipal')
    console.log('  - Consulta formal a la oficina de personal del municipio (Ley 27.275)')
    if (args.action === 'bloquear' && args.por) {
      await marcarSeñalBloqueada(s.id, args.por)
      console.log(`\n✓ Señal marcada como BLOQUEADA por ${args.por}.`)
    } else if (args.action !== 'inspeccionar') {
      console.error(`\nNo se puede ejecutar action=${args.action} sin DDJJ data. Use --action bloquear con --por para marcar bloqueada.`)
      process.exit(1)
    }
    process.exit(0)
  }

  // 4. Comparison side-by-side
  console.log('Comparación DNI (funcionario en DDJJ) vs DNI (director en IGJ):')
  console.log('  Año    DNI DDJJ    | DNI IGJ     | Match')
  console.log('  ────   ─────────── | ─────────── | ─────')
  let matchEncontrado = false
  let dniFuncionario: string | null = null
  for (const d of ddjjs) {
    const dniDDJJ = normalizarDNI(d.dni)
    const validoDDJJ = dniDDJJ && validarDNI(dniDDJJ)
    const match = validoDDJJ && dniDDJJ === dniDirector
    if (match) {
      matchEncontrado = true
      dniFuncionario = dniDDJJ
    }
    console.log(`  ${String(d.anio_declarado ?? '?').padStart(4)}   ${(dniDDJJ ?? '(sin DNI OCR)').padEnd(11)} | ${dniDirector.padEnd(11)} | ${match ? '✓ COINCIDE' : validoDDJJ ? '✗ distinto' : '— sin DNI'}`)
  }
  console.log()

  // 5. Conclusion + action
  if (matchEncontrado) {
    console.log(`✓ DNI VERIFICADO: el funcionario "${funcionario}" tiene DNI ${dniFuncionario}, que coincide con el director IGJ. La señal pasa de cap-60 a cap-95.`)
    if (args.action === 'verificar') {
      if (!args.por) { console.error('Falta --por <handle> para verificar.'); process.exit(2) }
      await marcarSeñalVerificada(s.id, args.por)
      console.log(`\n✓ Señal marcada como VERIFICADA por ${args.por}.`)
    } else if (args.action === 'descartar') {
      console.error('\nERROR: pidieron descartar pero el DNI coincide. Use --action verificar.')
      process.exit(1)
    } else {
      console.log('\nPara persistir: --action verificar --por <handle>')
    }
  } else {
    const dnisDDJJDistintos = ddjjs.map(d => normalizarDNI(d.dni)).filter((x): x is string => !!x)
    if (dnisDDJJDistintos.length > 0) {
      console.log(`✗ HOMONIMIA: la(s) DDJJ del funcionario tiene(n) DNI ${[...new Set(dnisDDJJDistintos)].join(', ')}, distinto al DNI del director (${dniDirector}). El cruce de apellido es coincidencia — descartar.`)
      if (args.action === 'descartar') {
        if (!args.por) { console.error('Falta --por <handle> para descartar.'); process.exit(2) }
        await marcarSeñalDescartada(s.id, args.por)
        console.log(`\n✓ Señal marcada como DESCARTADA por ${args.por}.`)
      } else if (args.action === 'verificar') {
        console.error('\nERROR: pidieron verificar pero el DNI no coincide. Use --action descartar.')
        process.exit(1)
      } else {
        console.log('\nPara persistir: --action descartar --por <handle>')
      }
    } else {
      console.log('⚠ DDJJ del funcionario existe pero NO tiene DNI populado (OCR pendiente). No se puede verificar todavía.')
      if (args.action === 'bloquear' && args.por) {
        await marcarSeñalBloqueada(s.id, args.por)
        console.log(`\n✓ Señal marcada como BLOQUEADA por ${args.por}.`)
      }
    }
  }

  process.exit(0)
}
// Solo correr main() cuando se ejecuta como CLI directo (no cuando se importa
// para tests). require.main check es la forma estándar en Node.
if (require.main === module) {
  main().catch(err => { console.error(err); process.exit(1) })
}
