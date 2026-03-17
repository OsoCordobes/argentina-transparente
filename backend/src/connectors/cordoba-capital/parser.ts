import { Contrato } from '../../types'

// Columnas verificadas contra el XLSX real de 2022 y 2023
const COL_TIPO        = 'Tipo de proceso de contratación'
const COL_PROVEEDOR   = 'Denominación de empresas contratadas o entidad licitante'
const COL_AREA        = 'Área Gubernamental que la ejecuta'
const COL_DESCRIPCION = 'Descripción'
const COL_MONTO       = 'Precio final de la contratación'
const COL_ANIO        = 'Año contratación'

const FUENTE_BASE = 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/erogaciones/compras-y-contrataciones/2'

export function parseRows(rows: Record<string, unknown>[], anio: number): Contrato[] {
  const contratos: Contrato[] = []

  for (const row of rows) {
    const tipo        = String(row[COL_TIPO]        ?? '').trim()
    const proveedor   = String(row[COL_PROVEEDOR]   ?? '').trim()
    const area        = String(row[COL_AREA]         ?? '').trim()
    const descripcion = String(row[COL_DESCRIPCION]  ?? '').trim()
    const montoRaw    = row[COL_MONTO]
    const anioRaw     = row[COL_ANIO]

    // Saltar filas vacías o sin datos críticos
    if (!tipo || !proveedor || !montoRaw) continue

    const monto = parseFloat(String(montoRaw).replace(/[^0-9.-]/g, ''))
    if (isNaN(monto) || monto <= 0) continue

    const anioFinal = anioRaw ? parseInt(String(anioRaw)) : anio

    contratos.push({
      tipo,
      proveedor,
      area,
      descripcion,
      monto,
      anio: anioFinal,
      fuenteUrl: FUENTE_BASE,
    })
  }

  return contratos
}
