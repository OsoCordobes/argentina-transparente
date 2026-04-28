// explore-cruce-funcionario-proveedor.ts — Exploración M4.1.
//
// Pregunta: ¿hay funcionarios cordobeses cuyo apellido_nombre coincide con
// directores de empresas que aparecen como proveedores en contratos de Córdoba?
//
// Esta query NO inserta señales — solo demuestra viabilidad del cruce sobre
// los datos ya cargados (post-M1). Si encuentra matches, M4.1 puede convertir
// la query en un detector formal.
//
// Cruce candidato:
//   agentes_publicos (funcionarios CBA Capital + Provincia)
//     .apellido_nombre
//     ↕ (match exacto, normalizado UPPERCASE sin tildes)
//   igj_autoridades.apellido_nombre (directores de empresas)
//     → join igj_entidades para obtener CUIT empresa
//     → join contratos por proveedor_norm (con identity_matches si tiene)
//     → resultado: funcionario X dirige empresa Y que tiene contrato Z con su mismo municipio

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

interface Cruce {
  funcionario: string
  reparticion: string | null
  cargo: string | null
  empresa: string
  cuit_empresa: string
  contratos_count: number
  monto_total: number
  municipio_contrato: string
}

async function main() {
  await initDb()
  console.log('=== EXPLORACIÓN M4.1 — Cruce funcionario ↔ director de proveedor ===\n')

  // Helper SQL: normaliza apellido_nombre igual que normalizarNombrePersona()
  // (UPPER + sin tildes + alfanum-only)
  const normSQL = (col: string) =>
    `regexp_replace(strip_accents(UPPER(${col})), '[^A-Z\\s]', ' ', 'g')`

  console.log('1. Coincidencias apellido_nombre exactas (normalizadas) entre agentes_publicos e igj_autoridades:\n')

  const matches = await dbAll<{ n: number }>(`
    SELECT COUNT(DISTINCT ${normSQL('a.apellido_nombre')}) AS n
      FROM agentes_publicos a
      JOIN igj_autoridades ia
        ON ${normSQL('a.apellido_nombre')} = ${normSQL('ia.apellido_nombre')}
     WHERE a.apellido_nombre IS NOT NULL
       AND ia.apellido_nombre IS NOT NULL
  `)
  console.log(`   ${Number(matches[0].n)} nombres únicos coinciden entre agentes y autoridades IGJ.`)

  console.log('\n2. Cruces funcionario → empresa con contrato (top 20 por monto):\n')

  const cruces = await dbAll<Cruce>(`
    WITH
      norm_funcs AS (
        SELECT DISTINCT
               apellido_nombre AS funcionario,
               ${normSQL('apellido_nombre')} AS norm,
               reparticion,
               cargo,
               jurisdiccion
          FROM agentes_publicos
         WHERE apellido_nombre IS NOT NULL
      ),
      norm_dir AS (
        SELECT ${normSQL('ia.apellido_nombre')} AS norm,
               ie.cuit AS cuit_empresa,
               ie.razon_social
          FROM igj_autoridades ia
          JOIN igj_entidades ie ON ie.numero_correlativo = ia.numero_correlativo
         WHERE ia.apellido_nombre IS NOT NULL
      ),
      contratos_agg AS (
        SELECT proveedor_norm,
               municipio,
               COUNT(*) AS contratos_count,
               SUM(monto) AS monto_total
          FROM contratos
         GROUP BY proveedor_norm, municipio
      )
    SELECT f.funcionario,
           f.reparticion,
           f.cargo,
           d.razon_social AS empresa,
           d.cuit_empresa,
           c.contratos_count,
           c.monto_total,
           c.municipio AS municipio_contrato
      FROM norm_funcs f
      JOIN norm_dir d ON f.norm = d.norm
      JOIN contratos_agg c ON UPPER(d.razon_social) = c.proveedor_norm
                          OR UPPER(REPLACE(d.razon_social, '.', '')) = c.proveedor_norm
     ORDER BY c.monto_total DESC
     LIMIT 20
  `)

  if (cruces.length === 0) {
    console.log('   Sin matches via JOIN exacto razon_social ↔ proveedor_norm.')
    console.log('   Probable: requiere identity resolver fuzzy (Tier 2-3) para cubrir')
    console.log('   variantes "EMPRESA SA" vs "EMPRESA S.A." vs "EMPRESA"')
  } else {
    for (const c of cruces) {
      console.log(`\n   ${c.funcionario} (${c.reparticion ?? 'N/D'}) → ${c.empresa}`)
      console.log(`     CUIT: ${c.cuit_empresa} | Contratos: ${c.contratos_count} | Monto: $${Math.round(Number(c.monto_total)).toLocaleString('es-AR')}`)
      console.log(`     Municipio contrato: ${c.municipio_contrato}`)
    }
  }

  console.log('\n3. Diagnóstico de cobertura para M4.1:')
  const counts = await dbAll<any>(`
    SELECT
      (SELECT COUNT(DISTINCT apellido_nombre) FROM agentes_publicos WHERE apellido_nombre IS NOT NULL) AS funcs_distintos,
      (SELECT COUNT(DISTINCT apellido_nombre) FROM igj_autoridades WHERE apellido_nombre IS NOT NULL) AS dir_distintos,
      (SELECT COUNT(DISTINCT proveedor_norm) FROM contratos) AS prov_distintos,
      (SELECT COUNT(*) FROM identity_matches WHERE cuit_resuelto IS NOT NULL) AS identity_resolved
  `)
  const c = counts[0]
  console.log(`   - Funcionarios únicos:          ${Number(c.funcs_distintos).toLocaleString('es-AR')}`)
  console.log(`   - Directores IGJ únicos:        ${Number(c.dir_distintos).toLocaleString('es-AR')}`)
  console.log(`   - Proveedores únicos:           ${Number(c.prov_distintos).toLocaleString('es-AR')}`)
  console.log(`   - Identity matches resueltos:   ${Number(c.identity_resolved).toLocaleString('es-AR')}`)

  console.log('\n=== Siguientes pasos para M4.1 (detector formal):')
  console.log('   1. Usar identity_matches para resolver proveedor_norm → CUIT')
  console.log('   2. Luego JOIN cuit_empresa (en lugar de razon_social)')
  console.log('   3. Threshold: solo flagear si funcionario.jurisdiccion = contrato.municipio')
  console.log('   4. Insertar como Señal "conflicto_funcionario_proveedor" en señales_cache')

  process.exit(0)
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
