// inventario-cordoba.ts — F1 audit: row counts por tabla.
//
// Distingue:
//   - Datos cargados (rowcount > 0)
//   - Schema sin datos (rowcount = 0 → tabla existe, no tiene contenido)
//   - Cobertura por jurisdicción cuando aplica

import 'dotenv/config'
import { initDb, dbAll } from '../lib/db'

interface TableSpec {
  table: string
  /** Si está, contar también por jurisdicción/municipio para ver cobertura. */
  jurisdictionCol?: string
  description: string
}

const TABLES: TableSpec[] = [
  // Datos canónicos de identidad
  { table: 'personas_fisicas', description: 'Tabla maestra PF (PLAN-DATOS A1)' },
  { table: 'personas_juridicas', description: 'Tabla maestra PJ (PLAN-DATOS A2)' },
  { table: 'cargos_funcionarios', description: 'Carrera funcionarios (PLAN-DATOS A6)' },
  { table: 'identity_matches', description: 'Resolver Tier 1-5' },

  // Compras + presupuesto
  { table: 'contratos', jurisdictionCol: 'municipio', description: 'Contratos públicos' },
  { table: 'presupuesto_ejecucion', jurisdictionCol: 'jurisdiccion', description: 'Ciclo presupuestario' },
  { table: 'pagos_contrato', description: 'Pagos atomizados (PLAN-DATOS B3)' },
  { table: 'licitaciones_llamado', description: 'Llamados a licitación' },
  { table: 'obras_publicas', jurisdictionCol: 'jurisdiccion', description: 'Obras públicas' },
  { table: 'transferencias', jurisdictionCol: 'jurisdiccion', description: 'Subsidios/transferencias' },
  { table: 'auditorias_tribunal_cuentas', description: 'Tribunal de Cuentas' },

  // RR.HH. del estado
  { table: 'agentes_publicos', jurisdictionCol: 'jurisdiccion', description: 'Sueldos públicos' },
  { table: 'declaraciones_juradas', jurisdictionCol: 'jurisdiccion', description: 'DDJJ patrimoniales' },

  // Boletines / normas
  { table: 'boletin_extractos', description: 'Boletín municipal Córdoba (extractos OCR)' },
  { table: 'boletin_actos', description: 'Boletín municipal (actos parseados)' },
  { table: 'boe_cba_pdfs', description: 'Boletín Oficial Córdoba (PDFs)' },

  // Sociedades / empresas
  { table: 'empresas', description: 'Tabla legacy de empresas' },
  { table: 'directores', description: 'Directores legacy' },
  { table: 'igj_entidades', description: 'IGJ entidades nacionales' },
  { table: 'igj_autoridades', description: 'IGJ autoridades nacionales' },
  { table: 'rns_personas_juridicas', description: 'RNS Reg. Nacional Sociedades' },
  { table: 'proveedores_padron', description: 'Padrón AFIP proveedores' },
  { table: 'empresas_padron_provincial', description: 'Padrón empresas Córdoba' },

  // Política / campañas
  { table: 'aportantes_campanas', description: 'Aportes a campañas (CNE)' },

  // Señales del motor
  { table: 'señales_cache', jurisdictionCol: 'municipio', description: 'Señales detectadas' },

  // Cross-jurisdicción / nacional
  { table: 'opensanctions_matches', description: 'OpenSanctions matches' },
  { table: 'icij_entidades', description: 'ICIJ Offshore Leaks' },

  // Estructurales (no son data, son metadata)
  { table: 'fuentes_publicas_catalogo', description: '[meta] Catálogo de fuentes' },
  { table: 'fuentes_datos', description: '[meta] Fuentes registradas' },
  { table: 'snapshots', description: '[meta] Snapshots de seeds' },
  { table: 'quarantine', description: '[meta] Filas rechazadas' },
  { table: 'entes_estatales_cordoba', description: 'Catálogo entes estatales Cba' },
]

async function main() {
  await initDb()
  const out: string[] = []
  out.push('# INVENTARIO DE DATOS — ARGOS')
  out.push('')
  out.push(`Generado: ${new Date().toISOString()}`)
  out.push('')
  out.push('| Tabla | Filas | Por jurisdicción | Descripción |')
  out.push('|---|---|---|---|')

  for (const t of TABLES) {
    let total = 0
    let breakdown = ''
    try {
      const r = await dbAll<{ n: number }>(`SELECT COUNT(*) AS n FROM ${t.table}`)
      total = Number(r[0]?.n ?? 0)
    } catch (e) {
      out.push(`| ${t.table} | ERROR | — | ${(e as Error).message.slice(0, 40)} |`)
      continue
    }
    if (t.jurisdictionCol && total > 0) {
      try {
        const rows = await dbAll<{ jur: string; n: number }>(
          `SELECT ${t.jurisdictionCol} AS jur, COUNT(*) AS n
             FROM ${t.table}
            WHERE ${t.jurisdictionCol} IS NOT NULL
            GROUP BY ${t.jurisdictionCol}
            ORDER BY n DESC LIMIT 5`,
        )
        breakdown = rows.map(r => `${r.jur}=${r.n}`).join(' · ')
      } catch { /* ignore */ }
    }
    out.push(`| ${t.table} | ${total.toLocaleString('es-AR')} | ${breakdown || '—'} | ${t.description} |`)
    console.log(`${t.table.padEnd(40)} ${String(total).padStart(8)}  ${breakdown}`)
  }
  console.log('\n=== resumen escrito a stdout, total tablas:', TABLES.length)
  // Imprimir también el markdown
  console.log('\n--- markdown ---')
  console.log(out.join('\n'))
}

main().catch(e => { console.error(e); process.exit(1) })
