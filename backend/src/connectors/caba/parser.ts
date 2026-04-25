import { Contrato } from '../../types'
import { CABARow } from './fetcher'

const FUENTE_BASE = 'https://data.buenosaires.gob.ar'

// Columnas posibles del CSV de CABA (el portal puede cambiar nombres entre versiones).
// Se usan en orden de preferencia: el primer valor no-vacío es el ganador.
const COL_PROVEEDOR   = ['proveedor', 'razon_social', 'empresa', 'contratista', 'denominacion']
const COL_AREA        = ['organismo', 'reparticion', 'unidad_operativa', 'area', 'ministerio', 'secretaria']
const COL_DESCRIPCION = ['objeto', 'descripcion', 'descripcion_contratacion', 'denominacion', 'descripcion_licitacion']
const COL_MONTO       = ['monto_adjudicado', 'monto_contrato', 'importe', 'monto', 'precio_adjudicado', 'monto_total']
const COL_TIPO        = ['modalidad', 'tipo_contratacion', 'tipo_proceso', 'procedimiento']
const COL_EXPEDIENTE  = ['expediente', 'numero_expediente', 'nro_expediente', 'numero_contrato']
const COL_FECHA       = ['fecha_adjudicacion', 'fecha_contrato', 'fecha_inicio', 'fecha_publicacion']

function pickCol(row: CABARow, candidates: string[]): string {
  for (const col of candidates) {
    const val = row[col]
    if (val && val.trim()) return val.trim()
    // Búsqueda case-insensitive en las claves del row
    for (const key of Object.keys(row)) {
      if (key.toLowerCase() === col.toLowerCase()) {
        const v = row[key]
        if (v && v.trim()) return v.trim()
      }
    }
  }
  return ''
}

function parseMonto(raw: string): number {
  if (!raw) return 0
  const cleaned = raw.replace(/[^0-9.,]/g, '').replace(',', '.')
  const n = parseFloat(cleaned)
  return isNaN(n) ? 0 : n
}

function extractAnio(row: CABARow, fallback: number): number {
  for (const col of COL_FECHA) {
    const val = row[col] ?? ''
    const m = val.match(/\b(20\d{2})\b/)
    if (m) return parseInt(m[1])
  }
  return fallback
}

export function parseRows(rows: CABARow[], anio: number): Contrato[] {
  const contratos: Contrato[] = []

  for (const row of rows) {
    const proveedor   = pickCol(row, COL_PROVEEDOR)
    const descripcion = pickCol(row, COL_DESCRIPCION)
    const montoRaw    = pickCol(row, COL_MONTO)

    if (!proveedor || !descripcion || !montoRaw) continue

    const monto = parseMonto(montoRaw)
    if (monto <= 0) continue

    contratos.push({
      tipo:             pickCol(row, COL_TIPO) || 'Sin especificar',
      proveedor,
      area:             pickCol(row, COL_AREA),
      descripcion,
      monto,
      anio:             extractAnio(row, anio),
      fuenteUrl:        FUENTE_BASE,
      numeroExpediente: pickCol(row, COL_EXPEDIENTE) || undefined,
      fechaContrato:    pickCol(row, COL_FECHA) || undefined,
    })
  }

  return contratos
}
