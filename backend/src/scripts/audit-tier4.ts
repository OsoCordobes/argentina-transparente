// audit-tier4.ts — Audita identity_matches Tier 4-5 e identifica falsos positivos.
//
// Hallazgo previo (W4 commit 2706a23): 41 matches Tier 4 con CUITs erróneos
// (ej. "GOBIERNO PROVINCIA CORDOBA" → CUIT La Rioja).
// Hallazgo W4 2026-04-28: los 41 eran TEST POLLUTION (sufijo __TEST_F*) y
// fueron purgados. Este script queda como diagnóstico cuando vuelvan a haber
// matches Tier 4 reales (post-OCR boletines).
//
// Heurísticas de detección de falsos positivos:
//   1. Jurisdicción provincial distinta (palabra "PROVINCIA"/"GOBIERNO" en proveedor vs target)
//   2. Sin tokens significativos compartidos
//   3. Mismo tipo de entidad (FIDEICOMISO/FUNDACION/...) pero núcleo distintivo distinto
//
// Output: docs/tier4-audit.json (read-only, no modifica DB).

import 'dotenv/config'
import fs from 'fs'
import path from 'path'
import { initDb, dbAll } from '../lib/db'

interface MatchRow {
  proveedor_norm: string
  cuit_resuelto: string
  tier: number
  score: number
  metodo: string
  candidatos_alternos: string | null
}

interface AuditResult {
  proveedor_norm: string
  cuit_resuelto: string
  tier: number
  razon_social_target: string | null
  veredicto: 'ok' | 'sospechoso' | 'erroneo'
  motivos: string[]
}

const PROVINCIAS_AR = [
  'BUENOS AIRES', 'CABA', 'CIUDAD AUTONOMA', 'CATAMARCA', 'CHACO', 'CHUBUT',
  'CORDOBA', 'CORRIENTES', 'ENTRE RIOS', 'FORMOSA', 'JUJUY', 'LA PAMPA',
  'LA RIOJA', 'MENDOZA', 'MISIONES', 'NEUQUEN', 'RIO NEGRO', 'SALTA',
  'SAN JUAN', 'SAN LUIS', 'SANTA CRUZ', 'SANTA FE', 'SANTIAGO DEL ESTERO',
  'TIERRA DEL FUEGO', 'TUCUMAN'
]

function detectarProvincia(s: string): string | null {
  const up = s.toUpperCase()
  for (const p of PROVINCIAS_AR) {
    if (up.includes(p)) return p
  }
  return null
}

function tokensRelevantes(s: string): string[] {
  return s.toUpperCase()
    .replace(/[^A-ZÁÉÍÓÚÑ\s]/g, ' ')
    .split(/\s+/)
    .filter(t => t.length >= 4)
    .filter(t => !['DE', 'LA', 'EL', 'DEL', 'SA', 'SRL', 'SAS', 'LTDA', 'LTD',
      'PARA', 'CON', 'POR', 'COMO', 'SOBRE', 'BAJO',
      'COMPANIA', 'SOCIEDAD', 'ANONIMA', 'COMERCIAL', 'INDUSTRIAL',
      'SERVICIOS', 'CONSTRUCCION', 'CONSTRUCCIONES'].includes(t))
}

async function buscarRazonSocialPorCUIT(cuit: string): Promise<string | null> {
  // Probar empresas (AFIP), igj_entidades (IGJ), rns_personas_juridicas (RNS)
  const e = await dbAll<{ razon: string }>(
    `SELECT razon_social AS razon FROM empresas WHERE cuit = ? LIMIT 1`, [cuit]
  ).catch(() => [])
  if (e[0]?.razon) return e[0].razon

  const i = await dbAll<{ razon: string }>(
    `SELECT razon_social AS razon FROM igj_entidades WHERE cuit = ? LIMIT 1`, [cuit]
  ).catch(() => [])
  if (i[0]?.razon) return i[0].razon

  const r = await dbAll<{ razon: string }>(
    `SELECT razon_social AS razon FROM rns_personas_juridicas WHERE cuit = ? LIMIT 1`, [cuit]
  ).catch(() => [])
  if (r[0]?.razon) return r[0].razon

  return null
}

function auditarMatch(proveedor: string, target: string | null): { veredicto: 'ok' | 'sospechoso' | 'erroneo', motivos: string[] } {
  const motivos: string[] = []
  if (!target) {
    return { veredicto: 'sospechoso', motivos: ['CUIT no resuelve a ninguna razón social conocida en empresas/IGJ/RNS'] }
  }

  // Heurística 1: jurisdicción provincial distinta
  const provProveedor = detectarProvincia(proveedor)
  const provTarget = detectarProvincia(target)
  if (provProveedor && provTarget && provProveedor !== provTarget) {
    motivos.push(`Provincia del proveedor (${provProveedor}) ≠ provincia del target (${provTarget})`)
  }

  // Heurística 2: tokens relevantes no comparten ningún común
  const tProv = new Set(tokensRelevantes(proveedor))
  const tTarget = new Set(tokensRelevantes(target))
  const comunes = [...tProv].filter(t => tTarget.has(t))
  if (tProv.size > 0 && comunes.length === 0) {
    motivos.push(`Sin tokens significativos compartidos (proveedor: ${[...tProv].slice(0, 4).join(',')} | target: ${[...tTarget].slice(0, 4).join(',')})`)
  }

  // Heurística 3: ambos llevan FIDEICOMISO/FUNDACION/etc pero el "núcleo" distintivo difiere
  const coresProv = [...tProv].filter(t => !['FIDEICOMISO', 'FUNDACION', 'COOPERATIVA', 'ASOCIACION', 'GOBIERNO', 'MUNICIPIO', 'MUNICIPALIDAD'].includes(t))
  const coresTarget = [...tTarget].filter(t => !['FIDEICOMISO', 'FUNDACION', 'COOPERATIVA', 'ASOCIACION', 'GOBIERNO', 'MUNICIPIO', 'MUNICIPALIDAD'].includes(t))
  const tipoComun = ['FIDEICOMISO', 'FUNDACION', 'COOPERATIVA', 'ASOCIACION', 'GOBIERNO']
    .find(t => tProv.has(t) && tTarget.has(t))
  if (tipoComun && coresProv.length > 0 && coresTarget.length > 0
      && !coresProv.some(c => coresTarget.includes(c))) {
    motivos.push(`Mismo tipo de entidad (${tipoComun}) pero núcleo distinto: "${coresProv.join(' ')}" vs "${coresTarget.join(' ')}"`)
  }

  // Veredicto: ≥2 motivos = erroneo, 1 = sospechoso, 0 = ok
  const veredicto: 'ok' | 'sospechoso' | 'erroneo' =
    motivos.length >= 2 ? 'erroneo'
      : motivos.length === 1 ? 'sospechoso'
      : 'ok'

  return { veredicto, motivos }
}

async function main() {
  await initDb()

  console.log('=== ARGOS — Audit Tier 4-5 identity_matches (read-only) ===\n')

  const tiers = await dbAll<{ tier: number; n: number }>(
    `SELECT tier, COUNT(*) AS n FROM identity_matches GROUP BY tier ORDER BY tier`
  )
  console.log('Distribución por tier:')
  for (const t of tiers) console.log(`  Tier ${t.tier}: ${t.n}`)
  console.log()

  // Audit todos los Tier 4 y 5
  const matches = await dbAll<MatchRow>(
    `SELECT proveedor_norm, cuit_resuelto, tier, score, metodo, candidatos_alternos
       FROM identity_matches
      WHERE tier IN (4, 5) AND cuit_resuelto IS NOT NULL`
  )

  console.log(`Auditando ${matches.length} matches Tier 4-5…\n`)

  const resultados: AuditResult[] = []
  let nOk = 0, nSospechoso = 0, nErroneo = 0

  for (const m of matches) {
    const target = await buscarRazonSocialPorCUIT(m.cuit_resuelto)
    const { veredicto, motivos } = auditarMatch(m.proveedor_norm, target)
    resultados.push({
      proveedor_norm: m.proveedor_norm,
      cuit_resuelto: m.cuit_resuelto,
      tier: m.tier,
      razon_social_target: target,
      veredicto,
      motivos,
    })
    if (veredicto === 'ok') nOk++
    else if (veredicto === 'sospechoso') nSospechoso++
    else nErroneo++
  }

  console.log('Resultado:')
  console.log(`  OK:         ${nOk}`)
  console.log(`  Sospechoso: ${nSospechoso}`)
  console.log(`  Erróneo:    ${nErroneo}`)
  console.log()

  // Mostrar 10 ejemplos de erróneos
  console.log('=== 10 ejemplos clasificados como ERRÓNEO ===')
  for (const r of resultados.filter(x => x.veredicto === 'erroneo').slice(0, 10)) {
    console.log(`\n  proveedor:  "${r.proveedor_norm}"`)
    console.log(`  cuit:       ${r.cuit_resuelto}`)
    console.log(`  → target:   "${r.razon_social_target}"`)
    console.log(`  motivos:    ${r.motivos.join(' | ')}`)
  }

  // Persistir reporte JSON
  const reportPath = path.join(__dirname, '..', '..', '..', 'docs', 'tier4-audit.json')
  fs.mkdirSync(path.dirname(reportPath), { recursive: true })
  fs.writeFileSync(reportPath, JSON.stringify({
    generado_en: new Date().toISOString(),
    total_auditados: matches.length,
    distribucion: { ok: nOk, sospechoso: nSospechoso, erroneo: nErroneo },
    resultados,
  }, null, 2))
  console.log(`\nReporte completo: ${path.relative(process.cwd(), reportPath)}`)

  process.exit(0)
}

main().catch(e => { console.error('Error:', e); process.exit(1) })
