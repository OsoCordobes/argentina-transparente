// lib/cordoba-padron-proveedores.ts — Lector del padrón provincial de
// proveedores de Córdoba Capital (dataset 281: Contratistas de Obra en Vía
// Pública). Usa el cliente genérico `cordoba-portal.ts` para descubrir la
// versión más reciente y descargar el XLSX/CSV.
//
// El parser es flexible — el portal cambia ocasionalmente nombres de columnas
// (ej. "CUIT" vs "C.U.I.T.", "Razón Social" vs "Proveedor").
//
// Salida: array plano de proveedores con CUIT verificado por fuente oficial,
// listo para popular `empresas_padron_provincial` y opcionalmente `empresas`
// (para que el identity resolver lo encuentre).

import {
  listarVersionesDataset,
  descargarRecursoDeVersion,
  parsearTabla,
} from './cordoba-portal'

export interface ProveedorPadronCordoba {
  cuit: string
  razon_social: string
  rubro?: string
  inicio?: string
  fuente_url: string
}

const DATASET_ID = '281'

/**
 * Descarga el padrón completo. Itera todas las versiones disponibles del
 * dataset 281 (cada año/snapshot es una versión separada), agrega los
 * proveedores únicos por CUIT con prioridad a la versión más reciente.
 *
 * Si una versión no tiene XLSX/CSV descargable, la saltea silenciosamente.
 */
export async function descargarPadronProveedoresCordoba(): Promise<ProveedorPadronCordoba[]> {
  const versiones = await listarVersionesDataset(DATASET_ID)
  if (!versiones[0]) throw new Error(`Dataset ${DATASET_ID} sin versiones disponibles`)

  const porCuit = new Map<string, ProveedorPadronCordoba>()

  // Las versiones llegan en orden de la API (tipicamente más reciente primero).
  // Iteramos en orden inverso para que la versión más nueva sobreescriba a la
  // más vieja en el Map.
  const versionesDesdeMasVieja = [...versiones].reverse()
  for (const ver of versionesDesdeMasVieja) {
    let desc: Awaited<ReturnType<typeof descargarRecursoDeVersion>> = null
    try {
      desc = await descargarRecursoDeVersion(DATASET_ID, ver.id, ['xlsx', 'xls', 'csv'])
    } catch {
      continue
    }
    if (!desc) continue

    let filas: Record<string, unknown>[]
    try {
      filas = parsearTabla(desc.buffer)
    } catch {
      continue
    }

    const fuenteUrl = desc.recurso.url.split('?')[0]

    // Normalizar headers: pasar a uppercase, quitar acentos/puntuación/Nº/etc.
    // Caso real visto: dataset 281 usa "C.U.I.T.  Nº  " y "NOMBRE DE LA EMPRESA".
    const normHeader = (k: string): string => k
      .toUpperCase()
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^A-Z0-9]/g, '')

    for (const row of filas) {
      // Construir Map<normKey, valor> una vez por fila
      const norm: Record<string, unknown> = {}
      for (const k of Object.keys(row)) norm[normHeader(k)] = row[k]

      // CUIT: aceptar CUIT, CUITN, CUITNUMERO, CUITPROVEEDOR, etc.
      const cuitRaw = String(
        norm['CUIT'] ?? norm['CUITN'] ?? norm['CUITNUMERO'] ??
        norm['CUITPROVEEDOR'] ?? norm['CUITNDEG'] ?? ''
      )
      const cuit = cuitRaw.replace(/[-\s]/g, '')
      if (!/^\d{11}$/.test(cuit)) continue

      // Razón social: NOMBREDELAEMPRESA / RAZONSOCIAL / PROVEEDOR / EMPRESA / DENOMINACION
      const razon = String(
        norm['NOMBREDELAEMPRESA'] ?? norm['RAZONSOCIAL'] ?? norm['PROVEEDOR'] ??
        norm['EMPRESA'] ?? norm['DENOMINACION'] ?? norm['NOMBRE'] ?? ''
      ).trim()
      if (!razon) continue

      const rubro = String(
        norm['RUBRO'] ?? norm['CATEGORIA'] ?? norm['ESPECIALIDAD'] ?? ''
      ).trim() || undefined

      const inicio = String(
        norm['INICIO'] ?? norm['FECHAINICIO'] ?? norm['INICIOINSCRIPCION'] ??
        norm['FECHAINSCRIPCION'] ?? ''
      ).trim() || undefined

      porCuit.set(cuit, {
        cuit,
        razon_social: razon,
        rubro,
        inicio,
        fuente_url: fuenteUrl,
      })
    }
  }

  return Array.from(porCuit.values())
}
