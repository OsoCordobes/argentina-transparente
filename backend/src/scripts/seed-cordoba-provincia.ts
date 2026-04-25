// seed-cordoba-provincia.ts — Carga datos abiertos de la PROVINCIA DE CÓRDOBA
// vía CKAN estándar (datosgestionabierta.cba.gov.ar/api/3/action/*).
//
// Hallazgo del agente de investigación: el portal Provincia es CKAN estándar
// con 146 packages y 898 recursos descargables (XLSX/CSV/PDF/SVG).
//
// Datasets prioritarios para gasto público:
//   - empleados-poder-ejecutivo (30 XLSX/CSV planilla por ministerio, actualizado 2026-04)
//   - composicion-de-comunidades-regionales
//   - intendentes-y-jefes-comunales
//   - transferencias-a-municipios-y-comunas (enlaces a economiaygestionpublica)
//
// Este seed:
//   1. Lista TODOS los packages CKAN (sin filtro)
//   2. Detecta los relacionados con gasto/empleados/transferencias
//   3. Persiste el catálogo en `fuentes_publicas_catalogo` (estado=descubierto)
//   4. Para empleados: descarga XLSX e inserta en agentes_publicos

import 'dotenv/config'
import {
  initDb, registrarFuente, registrarFuenteCatalogo, dbRun,
} from '../lib/db'
import { CKANClient } from '../lib/ckan'
import { parsearTabla, parseMontoAR } from '../lib/cordoba-portal'
import crypto from 'crypto'
import type { FuenteMetadata } from '../types'

const PORTAL = 'https://datosgestionabierta.cba.gov.ar'
const JURISDICCION = 'cordoba-provincia'

const KEYWORDS_GASTO = [
  'empleado', 'planilla', 'sueldo', 'salario', 'remunera', 'haber',
  'presupuesto', 'ejecucion', 'erogac', 'gasto',
  'compra', 'contrat', 'licitac', 'proveedor',
  'transferencia', 'subsid', 'beca',
  'obra', 'inversion', 'infraestructura',
  'declaracion', 'patrimonial', 'jurada',
  'tarifa', 'recauda', 'impuesto',
]

interface PackageCKAN {
  name: string
  title: string
  notes?: string
  tags?: { name: string }[]
  resources: Array<{ id: string; name: string; format: string; url: string; size?: number }>
}

async function main() {
  console.log('=== ARGOS — Seed Provincia Córdoba (CKAN) ===\n')
  await initDb()

  const dryRun = process.argv.includes('--dry-run')
  const client = new CKANClient({ baseUrl: PORTAL })

  // Registrar fuente principal
  await registrarFuente({
    id: 'cordoba-provincia-ckan',
    jurisdiccion: 'Provincia de Córdoba',
    url: PORTAL,
    formato: 'CKAN API REST (JSON + recursos XLSX/CSV/PDF)',
    oficial: true,
    nivelConfianza: 'alto',
    notas: 'Portal CKAN estándar provincial. 146 packages, ~898 recursos. Cubre planilla de empleados del Poder Ejecutivo, transferencias a municipios, infraestructura, etc.',
  } as FuenteMetadata)

  // Buscar packages relevantes con keywords
  const todosLosPackages: PackageCKAN[] = []
  for (const kw of KEYWORDS_GASTO) {
    const results = await client.searchDatasets(kw, 50) as PackageCKAN[]
    for (const p of results) {
      if (!todosLosPackages.find(x => x.name === p.name)) {
        todosLosPackages.push(p)
      }
    }
    await new Promise(r => setTimeout(r, 200))
  }

  console.log(`✓ ${todosLosPackages.length} packages relevantes detectados (búsqueda por keywords)\n`)

  // Catalogar cada package descubierto
  let catalogados = 0
  for (const p of todosLosPackages) {
    const xlsxResources = p.resources.filter(r => /xlsx?|csv/i.test(r.format))
    const pdfResources = p.resources.filter(r => /pdf/i.test(r.format))

    const formato = xlsxResources.length > 0
      ? 'XLSX/CSV (CKAN)'
      : (pdfResources.length > 0 ? 'PDF (CKAN)' : 'web/otro')

    // Inferir dimensión por keyword en title/name
    const haystack = `${p.title} ${p.name} ${p.notes ?? ''}`.toLowerCase()
    let dimension: 'salarios' | 'presupuesto' | 'contratos' | 'obras' | 'subsidios' | 'normas' | 'proveedores' | 'otro' = 'otro'
    if (/empleado|planilla|sueldo|salario|remunera|haber/.test(haystack)) dimension = 'salarios'
    else if (/presupuesto|ejecucion|erogac|gasto/.test(haystack)) dimension = 'presupuesto'
    else if (/compra|contrat|licitac|proveedor/.test(haystack)) dimension = 'contratos'
    else if (/transferencia|subsid|beca/.test(haystack)) dimension = 'subsidios'
    else if (/obra|inversion|infraestructura/.test(haystack)) dimension = 'obras'
    else if (/declaracion|patrimonial/.test(haystack)) dimension = 'otro'

    if (!dryRun) {
      await registrarFuenteCatalogo({
        id: `cordoba-provincia-${p.name}`,
        jurisdiccion: JURISDICCION,
        organismo: 'Provincia de Córdoba',
        dimension,
        nombre: p.title,
        descripcion: (p.notes ?? '').slice(0, 500),
        urlOficial: `${PORTAL}/dataset/${p.name}`,
        formato,
        coberturaDesde: null,
        coberturaHasta: null,
        volumenEstimado: `${p.resources.length} recursos (${xlsxResources.length} XLSX/CSV)`,
        estadoImplementacion: xlsxResources.length > 0 ? 'pendiente' : 'descartado',
        razonBloqueo: xlsxResources.length === 0 ? 'Sin recursos estructurados (solo PDF/web)' : null,
        conectorId: null,
      })
      catalogados++
    }
  }

  console.log(`✓ ${catalogados} fuentes catalogadas en fuentes_publicas_catalogo\n`)

  // ─── Cargar planilla empleados poder ejecutivo (alto valor) ──────────────────
  const empleadosPkg = todosLosPackages.find(p =>
    /empleados.+poder.+ejecutivo/i.test(p.title + ' ' + p.name)
  )

  if (empleadosPkg) {
    console.log(`\n=== Cargando: ${empleadosPkg.title} ===`)
    const xlsxResources = empleadosPkg.resources.filter(r => /xlsx?/i.test(r.format))
    console.log(`${xlsxResources.length} archivos XLSX disponibles`)

    let totalAgentes = 0
    let totalArchivos = 0
    for (const r of xlsxResources) {
      try {
        const res = await fetch(r.url, {
          headers: { 'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0' },
          signal: AbortSignal.timeout(60_000),
        })
        if (!res.ok) continue
        const buf = Buffer.from(await res.arrayBuffer())
        const filas = parsearTabla(buf)
        totalArchivos++

        let nuevos = 0
        for (const row of filas) {
          // Detectar columnas (varían entre archivos)
          const keys = Object.keys(row)
          const apellidoNombre = keys
            .filter(k => /apellido|nombre|agente|empleado/i.test(k))
            .map(k => row[k]).filter(Boolean).join(' ').trim()
          const cargo = keys.filter(k => /cargo|funcion|puesto/i.test(k))
            .map(k => row[k]).filter(Boolean)[0] as string | undefined
          const reparticion = keys.filter(k => /minister|secretar|repartic|jurisdic|organ/i.test(k))
            .map(k => row[k]).filter(Boolean)[0] as string | undefined
          const bruto = keys.filter(k => /bruto|remunerac/i.test(k))
            .map(k => parseMontoAR(row[k])).find(v => v !== null) ?? null
          const neto = keys.filter(k => /neto|bolsillo/i.test(k))
            .map(k => parseMontoAR(row[k])).find(v => v !== null) ?? null

          if (!apellidoNombre && bruto === null && neto === null) continue

          // Inferir año del nombre del archivo (ej: "Empleados Min Ambiente 2026-04")
          const lastMod = (r as { last_modified?: string }).last_modified ?? ''
          const m = `${r.name} ${lastMod}`.match(/(20\d{2})/)
          const anio = m ? parseInt(m[1]) : new Date().getFullYear()

          const id = crypto.createHash('sha256').update([
            JURISDICCION, anio, '', 'agente', reparticion ?? '', cargo ?? '', apellidoNombre, '',
            bruto ?? '', neto ?? '', '',
          ].join('|')).digest('hex').slice(0, 16)

          try {
            await dbRun(
              `INSERT OR IGNORE INTO agentes_publicos VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
              [
                id, JURISDICCION, anio, null, 'agente',
                reparticion ?? null, cargo ?? null, apellidoNombre || null, null,
                bruto, neto, null,
                r.url, new Date().toISOString(),
              ]
            )
            nuevos++
          } catch { /* dup */ }
        }
        if (nuevos > 0) console.log(`  ${r.name.slice(0, 60)}: ${nuevos} agentes`)
        totalAgentes += nuevos
      } catch (err) {
        console.warn(`  ✗ ${r.name}: ${(err as Error).message.slice(0, 80)}`)
      }
    }

    console.log(`\n✓ ${totalArchivos} archivos procesados, ${totalAgentes} agentes provinciales insertados`)
  }

  console.log('\n✓ Provincia Córdoba CKAN: catálogo poblado.')
  process.exit(0)
}

main().catch(err => { console.error('Error:', err); process.exit(1) })
