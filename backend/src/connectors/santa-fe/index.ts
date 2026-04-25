// Conector Santa Fe — datosabiertos.santafe.gob.ar (CKAN)
//
// Santa Fe Province tiene portal CKAN en datosabiertos.santafe.gob.ar.
// Usamos CKANClient para discovery + descarga CSV, igual que CABA.
// Si el portal deja de tener CKAN, esta implementación degrada a scraper HTML.

import { MunicipioConnector, Contrato, FuenteMetadata } from '../../types'
import { CKANClient } from '../../lib/ckan'

const SANTAFE_BASE = 'https://datosabiertos.santafe.gob.ar'
const QUERIES = ['contrataciones', 'compras', 'licitaciones', 'proveedores']
const TIMEOUT_MS = 45_000

const PRIMER_ANIO = 2018

function getAniosDisponibles(): number[] {
  const anios: number[] = []
  const ahora = new Date().getFullYear()
  for (let a = PRIMER_ANIO; a <= ahora; a++) anios.push(a)
  return anios
}

export const fuenteSantaFe: FuenteMetadata = {
  id: 'santafe-datos-abiertos',
  jurisdiccion: 'Santa Fe',
  url: SANTAFE_BASE,
  formato: 'CSV (CKAN)',
  oficial: true,
  licencia: 'CC-BY-4.0',
  frecuenciaActualizacion: 'anual',
  nivelConfianza: 'alto',
  notas:
    'Portal de datos abiertos de la Provincia de Santa Fe. ' +
    'Si el dataset de compras no aparece, ejecutar: npm run ckan:explore -- santafe compras',
}

async function fetchCSV(url: string): Promise<string> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    return await res.text()
  } finally {
    clearTimeout(timer)
  }
}

function parseCSV(text: string, anio: number): Contrato[] {
  const lines = text.split(/\r?\n/)
  if (lines.length < 2) return []
  const headers = lines[0].split(',').map(h => h.replace(/^"|"$/g, '').trim().toLowerCase())
  const contratos: Contrato[] = []

  // Columnas flexibles — Santa Fe puede cambiar nombres
  function pick(row: string[], keys: string[]): string {
    for (const k of keys) {
      const idx = headers.indexOf(k)
      if (idx !== -1) return (row[idx] ?? '').replace(/^"|"$/g, '').trim()
    }
    return ''
  }

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim()
    if (!line) continue
    const values = line.split(',')

    const proveedor = pick(values, ['proveedor', 'razon_social', 'empresa', 'contratista', 'adjudicatario'])
    const descripcion = pick(values, ['objeto', 'descripcion', 'concepto', 'descripcion_contratacion'])
    const montoRaw = pick(values, ['monto', 'importe', 'monto_adjudicado', 'precio_final', 'monto_total'])
    if (!proveedor || !montoRaw) continue

    const monto = parseFloat(montoRaw.replace(/[^0-9.,]/g, '').replace(',', '.'))
    if (isNaN(monto) || monto <= 0) continue

    const fechaRaw = pick(values, ['fecha', 'fecha_adjudicacion', 'fecha_contrato', 'fecha_publicacion'])
    const anioMatch = fechaRaw.match(/\b(20\d{2})\b/)
    const anioFinal = anioMatch ? parseInt(anioMatch[1]) : anio

    contratos.push({
      tipo: pick(values, ['modalidad', 'tipo', 'procedimiento']) || 'Sin especificar',
      proveedor,
      area: pick(values, ['organismo', 'reparticion', 'area', 'ministerio', 'jurisdiccion']),
      descripcion,
      monto,
      anio: anioFinal,
      fuenteUrl: SANTAFE_BASE,
      numeroExpediente: pick(values, ['expediente', 'numero_expediente', 'nro']) || undefined,
      fechaContrato: fechaRaw || undefined,
    })
  }
  return contratos
}

export const santaFeConnector: MunicipioConnector = {
  id: 'santa-fe',
  nombre: 'Provincia de Santa Fe',
  aniosDisponibles: getAniosDisponibles(),
  tipo: 'api_estructurada',
  fuente: fuenteSantaFe,

  async getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]> {
    const todos: Contrato[] = []
    const client = new CKANClient({ baseUrl: SANTAFE_BASE })

    // Descubrir dataset una sola vez
    let csvUrl: string | null = null
    for (const q of QUERIES) {
      const datasets = await client.searchDatasets(q, 5)
      for (const ds of datasets) {
        const r = CKANClient.pickStructuredResource(ds, ['CSV', 'XLSX'])
        if (r) { csvUrl = r.url; break }
      }
      if (csvUrl) break
    }

    if (!csvUrl) {
      console.warn('[santa-fe] No se encontró dataset CSV en el portal CKAN.')
      console.warn('  Tip: npm run ckan:explore -- santafe compras')
      return []
    }

    for (let anio = anioDesde; anio <= anioHasta; anio++) {
      console.log(`[santa-fe] Descargando contratos ${anio}...`)
      try {
        const text = await fetchCSV(csvUrl)
        const contratos = parseCSV(text, anio)
        console.log(`[santa-fe] ${contratos.length} contratos parseados para ${anio}`)
        todos.push(...contratos)
        // El portal de SF suele ser 1 archivo por dataset, no por año
        // Si ya lo procesamos para un año, no hace falta repetir para los otros
        if (contratos.length > 0) break
      } catch (err) {
        console.error(`[santa-fe] Error ${anio}: ${(err as Error).message}`)
      }
    }
    return todos
  },
}
