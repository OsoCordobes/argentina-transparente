// audit-conexiones.ts — F8.5 audit de la lógica de conexiones
//
// Verifica que el modelo no esté confundiendo:
//   1. Empleados de ministerio vs directores societarios
//   2. Entes estatales vs empresas privadas en personas_juridicas
//   3. Sociedades del Estado (PJ con CUIT 30 pero estatales) tratadas como
//      empresas privadas
//   4. PF marcadas como "dirige PJ" cuando en realidad son nombramientos
//      políticos en organismos públicos
//
// El audit imprime ejemplos sospechosos para inspección manual + métricas.

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

async function main() {
  await initDb()
  console.log('=== AUDIT CONEXIONES — Estructura institucional ===\n')

  // 1. ¿Qué tipos societarios hay en IGJ entidades?
  console.log('--- 1. Distribución de tipo_societario en IGJ entidades ---')
  const tiposSoc = await dbAll<{ tipo: string; n: number }>(
    `SELECT COALESCE(tipo_societario, '(NULL)') AS tipo, COUNT(*) AS n
       FROM igj_entidades
      GROUP BY tipo_societario
      ORDER BY n DESC LIMIT 20`,
  )
  for (const t of tiposSoc) {
    console.log(`  ${String(t.n).padStart(8)}  ${t.tipo}`)
  }

  // 2. ¿Hay entes estatales en personas_juridicas? (palabras clave en razón social)
  console.log('\n--- 2. PJ con razón social que sugiere ente estatal ---')
  const entesEstatales = await dbAll<{ razon_social: string; cuit: string; tipo: string | null }>(
    `SELECT razon_social, cuit, tipo_societario
       FROM personas_juridicas
      WHERE UPPER(razon_social) LIKE 'MINISTERIO %'
         OR UPPER(razon_social) LIKE 'SECRETARIA %'
         OR UPPER(razon_social) LIKE 'SUBSECRETARIA %'
         OR UPPER(razon_social) LIKE 'AGENCIA %'
         OR UPPER(razon_social) LIKE 'INSTITUTO NACIONAL%'
         OR UPPER(razon_social) LIKE 'MUNICIPALIDAD %'
         OR UPPER(razon_social) LIKE 'GOBIERNO %'
         OR UPPER(razon_social) LIKE 'PROVINCIA DE%'
         OR UPPER(razon_social) LIKE 'CAJA %'
         OR UPPER(razon_social) LIKE 'BANCO PROVINCIA%'
         OR UPPER(razon_social) LIKE 'BANCO DE LA NACION%'
         OR UPPER(razon_social) LIKE '%CONCEJO DELIBERANTE%'
      LIMIT 15`,
  )
  console.log(`  Total muestra (max 15): ${entesEstatales.length}`)
  for (const e of entesEstatales) {
    console.log(`  ${e.cuit}  ${(e.tipo ?? '?').padEnd(15)}  ${e.razon_social.slice(0, 70)}`)
  }
  const cntEntes = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM personas_juridicas
      WHERE UPPER(razon_social) LIKE 'MINISTERIO %'
         OR UPPER(razon_social) LIKE 'SECRETARIA %'
         OR UPPER(razon_social) LIKE 'SUBSECRETARIA %'
         OR UPPER(razon_social) LIKE 'AGENCIA %'
         OR UPPER(razon_social) LIKE 'INSTITUTO NACIONAL%'
         OR UPPER(razon_social) LIKE 'MUNICIPALIDAD %'
         OR UPPER(razon_social) LIKE 'PROVINCIA DE%'
    `,
  )
  console.log(`  Total entes estatales detectados: ${cntEntes[0].n}`)

  // 3. Sociedades del Estado con CUIT 30 (YPF, ARSAT, etc)
  console.log('\n--- 3. Sociedades del Estado conocidas (sample) ---')
  const sociedadesEstado = await dbAll<{ razon_social: string; cuit: string }>(
    `SELECT razon_social, cuit
       FROM personas_juridicas
      WHERE UPPER(razon_social) LIKE '%YPF%'
         OR UPPER(razon_social) LIKE '%ARSAT%'
         OR UPPER(razon_social) LIKE '%AYSA%'
         OR UPPER(razon_social) LIKE 'BANCO PROVINCIA%'
         OR UPPER(razon_social) LIKE '%CORREO ARGENTINO%'
         OR UPPER(razon_social) LIKE '%ENERGIA ARGENTINA%'
         OR UPPER(razon_social) LIKE '%AEROLINEAS ARGENTINAS%'
         OR UPPER(razon_social) LIKE '%BANCO NACION%'
      LIMIT 10`,
  )
  for (const s of sociedadesEstado) {
    console.log(`  ${s.cuit}  ${s.razon_social.slice(0, 70)}`)
  }

  // 4. Cantidad de PF que "dirigen" entes estatales (señal sospechosa)
  console.log('\n--- 4. PF "dirigiendo" entes estatales (= nombramientos políticos) ---')
  const dirigenEntes = await dbAll<{ n: number }>(
    `SELECT COUNT(*) AS n FROM v_persona_dirige_empresa v
      WHERE UPPER(v.empresa_nombre) LIKE 'MINISTERIO %'
         OR UPPER(v.empresa_nombre) LIKE 'SECRETARIA %'
         OR UPPER(v.empresa_nombre) LIKE 'SUBSECRETARIA %'
         OR UPPER(v.empresa_nombre) LIKE 'AGENCIA %'
         OR UPPER(v.empresa_nombre) LIKE 'MUNICIPALIDAD %'
         OR UPPER(v.empresa_nombre) LIKE 'PROVINCIA DE%'
         OR UPPER(v.empresa_nombre) LIKE 'CAJA %'`,
  )
  console.log(`  Relaciones que SÍ son nombramientos políticos (no dirección societaria): ${dirigenEntes[0].n}`)

  // 5. tipos_administrador en igj_autoridades (qué cargos hay)
  console.log('\n--- 5. tipo_administrador distinct en igj_autoridades ---')
  const tiposAdm = await dbAll<{ tipo: string; n: number }>(
    `SELECT COALESCE(tipo_administrador, '(NULL)') AS tipo, COUNT(*) AS n
       FROM igj_autoridades
      GROUP BY tipo_administrador
      ORDER BY n DESC LIMIT 15`,
  )
  for (const t of tiposAdm) {
    console.log(`  ${String(t.n).padStart(8)}  ${t.tipo}`)
  }

  // 6. Sample: PF que aparece como funcionario Y como director — ¿son los conflictos C1?
  console.log('\n--- 6. PF que es funcionario Y aparece en igj_autoridades (target del detector C1) ---')
  const conflictos = await dbAll<{
    dni: string; persona: string; cuit_dirigida: string; razon_dirigida: string; cargos_pub: number
  }>(
    `WITH pf_con_cargo AS (
      SELECT cf.dni, MIN(cf.cargo) AS cargo, COUNT(*) AS cnt
        FROM cargos_funcionarios cf
       WHERE cf.dni IS NOT NULL
       GROUP BY cf.dni
    )
    SELECT v.dni, v.persona_nombre AS persona, v.cuit AS cuit_dirigida,
           v.empresa_nombre AS razon_dirigida, c.cnt AS cargos_pub
      FROM v_persona_dirige_empresa v
      JOIN pf_con_cargo c ON c.dni = v.dni
     LIMIT 5`,
  )
  console.log(`  Encontrados ${conflictos.length} (sample): conflictos potenciales reales para C1`)
  for (const c of conflictos) {
    console.log(`  DNI ${c.dni}: ${c.persona} → dirige ${c.razon_dirigida.slice(0, 50)} (cuit ${c.cuit_dirigida}) · ${c.cargos_pub} cargos pub`)
  }

  // 7. ¿Hay personas_fisicas que ARGOS marca como "verificadas" pero sin source de DDJJ?
  console.log('\n--- 7. Source de fuente_dni_url en agentes_publicos ---')
  const sources = await dbAll<{ source: string; n: number }>(
    `SELECT
       CASE
         WHEN fuente_dni_url IS NULL THEN '(sin DNI)'
         WHEN fuente_dni_url LIKE 'argos://backfill-heuristico%' THEN 'Tier 2 heurístico (audit fix)'
         WHEN fuente_dni_url LIKE 'https://datos.jus.gob.ar%' THEN 'IGJ direct (¿deuda?)'
         WHEN fuente_dni_url LIKE 'http%' THEN 'URL externa otra'
         ELSE fuente_dni_url
       END AS source,
       COUNT(*) AS n
    FROM agentes_publicos
    GROUP BY source ORDER BY n DESC`,
  )
  for (const s of sources) {
    console.log(`  ${String(s.n).padStart(8)}  ${s.source}`)
  }

  // 8. Sample de razones sociales raras en personas_juridicas
  console.log('\n--- 8. Razones sociales SHORT (≤8 chars) en PJ — ¿basura no detectada? ---')
  const shorts = await dbAll<{ cuit: string; razon: string }>(
    `SELECT cuit, razon_social FROM personas_juridicas
      WHERE LENGTH(razon_social) <= 8
      ORDER BY razon_social
      LIMIT 10`,
  )
  for (const s of shorts) {
    console.log(`  ${s.cuit}  "${s.razon}"`)
  }

  // 9. ¿Cuántos contratos.proveedor_cuit referencian PJ que existen en personas_juridicas?
  console.log('\n--- 9. Integridad referencial contratos↔personas_juridicas ---')
  const integridadContratos = await dbAll<{
    total_con_cuit: number; resolvieron: number; huerfanos: number;
  }>(
    `WITH stats AS (
      SELECT
        COUNT(*) FILTER (WHERE proveedor_cuit IS NOT NULL) AS total_con_cuit,
        COUNT(*) FILTER (WHERE proveedor_cuit IS NOT NULL AND EXISTS (
          SELECT 1 FROM personas_juridicas pj WHERE pj.cuit = c.proveedor_cuit
        )) AS resolvieron
      FROM contratos c
    )
    SELECT total_con_cuit, resolvieron,
           total_con_cuit - resolvieron AS huerfanos
      FROM stats`,
  )
  const r = integridadContratos[0]
  console.log(`  Contratos con proveedor_cuit: ${r.total_con_cuit}`)
  console.log(`  Resolvieron a personas_juridicas: ${r.resolvieron}`)
  console.log(`  Huérfanos (cuit no existe en PJ): ${r.huerfanos}`)

  // 10. ¿Cuántos cargos_funcionarios.dni referencian PF que existen?
  console.log('\n--- 10. Integridad referencial cargos_funcionarios↔personas_fisicas ---')
  const integridadCargos = await dbAll<{
    total_con_dni: number; resolvieron: number; huerfanos: number;
  }>(
    `WITH stats AS (
      SELECT
        COUNT(*) FILTER (WHERE dni IS NOT NULL) AS total_con_dni,
        COUNT(*) FILTER (WHERE dni IS NOT NULL AND EXISTS (
          SELECT 1 FROM personas_fisicas pf WHERE pf.dni = cf.dni
        )) AS resolvieron
      FROM cargos_funcionarios cf
    )
    SELECT total_con_dni, resolvieron, total_con_dni - resolvieron AS huerfanos
      FROM stats`,
  )
  const c = integridadCargos[0]
  console.log(`  Cargos con dni: ${c.total_con_dni}`)
  console.log(`  Resolvieron a personas_fisicas: ${c.resolvieron}`)
  console.log(`  Huérfanos: ${c.huerfanos}`)

  console.log('\n=== Audit completo ===')
}

main().catch(e => { console.error(e); process.exit(1) })
