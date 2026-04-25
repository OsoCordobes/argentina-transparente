// lib/boletin-cordoba-csv.ts — Lector del dataset histórico 2013-2018 del
// Boletín Municipal de Córdoba (versión 5493 de gobiernoabierto.cordoba.gob.ar).
//
// El dataset es un XLSX/CSV con 32,895 normas estructuradas. Cada fila tiene:
//   Nº de Boletín | Fecha de Publicación | Ámbito | Tipo de Instrumento |
//   Número | Fecha de Aprobación | Expediente | Asunto | Impresión
//
// Estructuralmente equivalente a las Publicaciones del API REST → mapeamos
// a `PublicacionPlana` para reusar el mismo extractor (extractor-norma.ts).

import * as XLSX from 'xlsx'
import { listarRecursos, listarVersiones } from './boletin-cordoba'
import type { PublicacionPlana } from './boletin-cordoba-api'

const VERSION_5493_ID = '5493'  // 2013-2018 con resumen de texto

interface FilaCSV {
  'Nº de Boletín': string | number
  'Fecha de Publicación': string | number    // fecha Excel serial o ISO
  'Ámbito': string                            // 'Concejo' | 'Departamento Ejecutivo' | etc.
  'Tipo de Instrumento': string              // 'Decreto' | 'Ordenanza' | 'Resolución' | etc.
  'Número': string | number
  'Fecha de Aprobación': string | number
  'Expediente': string
  'Asunto': string
  'Impresión': string                         // 'Completo' | 'Sumario' | etc.
}

const TIMEOUT_MS = 60_000

// Convierte Excel serial date number a ISO YYYY-MM-DD.
// Solo acepta seriales en rango razonable para boletines 2010-2030
// (40000-50000 aproximadamente). Rechaza valores fuera de rango o 0/null.
function excelSerialToISO(serial: string | number | null | undefined): string | null {
  if (serial === null || serial === undefined || serial === '') return null

  // Probar string ISO primero (algunos boletines pueden venir formateados)
  const s = String(serial).trim()
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const yr = parseInt(s.slice(0, 4))
    if (yr >= 2000 && yr <= 2030) return s.slice(0, 10)
    return null
  }
  // Probar formato DD/MM/YYYY
  const m = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/)
  if (m) {
    const yr = parseInt(m[3])
    if (yr >= 2000 && yr <= 2030) {
      return `${yr}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
    }
    return null
  }

  const n = typeof serial === 'number' ? serial : parseFloat(s)
  if (isNaN(n)) return null

  // Rango válido para Excel serial dates entre 2000-2030:
  // 2000-01-01 = serial 36526, 2030-12-31 = serial 47848
  if (n < 36526 || n > 47848) return null

  // Excel epoch: 1900-01-01 = serial 1 (con bug de año bisiesto 1900).
  // Ajuste estándar: serial - 25569 días = días desde 1970-01-01.
  const ms = (n - 25569) * 86400 * 1000
  const date = new Date(ms)
  if (isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

// Descarga el XLSX desde el portal CKAN. La URL es signed S3 con expiración,
// así que la regeneramos llamando a la API cada vez.
export async function descargarXLSX(): Promise<Buffer> {
  const versiones = await listarVersiones()
  const v5493 = versiones.find(v => v.id === VERSION_5493_ID)
  if (!v5493) {
    throw new Error(`Versión ${VERSION_5493_ID} no encontrada en dataset 2781`)
  }
  const recursos = await listarRecursos(v5493.id)
  // Buscar el recurso XLS (puede estar en .formato o .icono)
  const r = recursos.find(rs => {
    const f = ((rs as { formato?: string; icono?: string }).formato
              ?? (rs as { formato?: string; icono?: string }).icono
              ?? '').toLowerCase()
    return f.includes('xls')
  })
  if (!r) throw new Error('Recurso XLS no encontrado en versión 5493')

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(r.url, { signal: ctl.signal })
    if (!res.ok) throw new Error(`HTTP ${res.status} descargando XLSX`)
    return Buffer.from(await res.arrayBuffer())
  } finally {
    clearTimeout(timer)
  }
}

// Parsea el XLSX en filas tipadas.
export function parsearFilas(buffer: Buffer): FilaCSV[] {
  const wb = XLSX.read(buffer, { type: 'buffer' })
  const sheet = wb.Sheets[wb.SheetNames[0]]
  return XLSX.utils.sheet_to_json<FilaCSV>(sheet, { defval: null })
}

// Mapea una fila CSV histórica al shape PublicacionPlana del API REST.
// Esto permite reusar el mismo extractor-norma.ts para ambos períodos.
// Retorna null si la fecha no es válida (no inventamos fechas — traceability).
export function mapearAPublicacion(fila: FilaCSV, idx: number): PublicacionPlana | null {
  const fechaPubISO = excelSerialToISO(fila['Fecha de Publicación'])
  const fechaSancISO = excelSerialToISO(fila['Fecha de Aprobación']) ?? fechaPubISO

  // Si no podemos validar al menos una fecha en rango 2000-2030, descartamos.
  // Mejor perder la norma que asignar fecha inventada (CLAUDE.md §2: cero alucinaciones).
  if (!fechaPubISO && !fechaSancISO) return null

  const fechaPubFinal = fechaPubISO ?? fechaSancISO!
  const fechaSancFinal = fechaSancISO ?? fechaPubISO!

  return {
    Id: idx,
    TipoNorma: String(fila['Tipo de Instrumento'] ?? '').trim(),
    Reparticion: String(fila['Ámbito'] ?? '').trim(),
    TipoPublicacion: 'Histórico CSV 2013-2018',
    NormaNumero: String(fila['Número'] ?? '').trim(),
    Letra: '',
    ExpedienteNumero: String(fila['Expediente'] ?? '').trim(),
    Asunto: String(fila['Asunto'] ?? '').trim(),
    FechaSancion: fechaSancFinal + 'T00:00:00',
    FechaPublicacion: fechaPubFinal + 'T00:00:00',
    RutaDocFinal: '',  // el CSV histórico no tiene URL al PDF individual
    Estado: 'Publicado',
    Urgente: false,
    boletinNumero: parseInt(String(fila['Nº de Boletín'] ?? '0')) || 0,
    boletinFecha: fechaPubFinal + 'T00:00:00',
    boletinPdfUrl: 'https://gobiernoabierto.cordoba.gob.ar/data/datos-abiertos/categoria/administracion-publica/boletines-municipales/2781',
  }
}

// Carga el dataset completo y lo mapea a PublicacionPlana[].
export async function cargarHistorico(): Promise<PublicacionPlana[]> {
  console.log('[csv-historico] Descargando XLSX (8MB, ~32k filas)...')
  const buffer = await descargarXLSX()
  console.log(`[csv-historico] Tamaño: ${(buffer.length / 1024 / 1024).toFixed(1)} MB`)

  console.log('[csv-historico] Parseando...')
  const filas = parsearFilas(buffer)
  console.log(`[csv-historico] ${filas.length.toLocaleString()} filas leídas`)

  const pubs: PublicacionPlana[] = []
  let descartadasVacias = 0
  let descartadasFecha = 0
  for (let i = 0; i < filas.length; i++) {
    const f = filas[i]
    if (!f['Asunto'] || !f['Tipo de Instrumento']) { descartadasVacias++; continue }
    const p = mapearAPublicacion(f, i + 1_000_000)  // offset para no colisionar con Ids del API
    if (!p) { descartadasFecha++; continue }
    pubs.push(p)
  }
  console.log(`[csv-historico] ${pubs.length.toLocaleString()} publicaciones mapeadas`)
  if (descartadasVacias > 0) console.log(`[csv-historico]   ${descartadasVacias} descartadas por Asunto/Tipo vacío`)
  if (descartadasFecha > 0) console.log(`[csv-historico]   ${descartadasFecha} descartadas por fecha inválida (fuera de 2000-2030)`)
  return pubs
}
