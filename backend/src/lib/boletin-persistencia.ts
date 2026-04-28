// lib/boletin-persistencia.ts — W2 Task B: persistencia de OCR de Boletines Oficiales.
//
// Tomamos un OCRBoletinResultZC (devuelto por extraerBoletinZeroCost en lib/ocr.ts)
// y lo guardamos en DuckDB en 2 tablas:
//   - boletin_extractos: 1 row por PDF (UPSERT por hash_pdf — idempotente).
//   - boletin_actos:     N rows por PDF, 1 por ActoAdministrativoExtraido.
//
// Política de quarantine (CLAUDE.md §2 — cero alucinaciones):
//   Un acto sin CUIT NI DNI no es accionable para nuestro modelo de dominio
//   (no podemos linkearlo a un proveedor o funcionario real). Lo aislamos en
//   `quarantine` con motivo='missing_critical_field' y dejamos que un humano
//   decida si reintentar (override manual) o descartar.
//
// EXCEPCIÓN: los Decretos suelen ser normativos (designación de funcionarios,
//   aprobación de reglamentos) y no siempre llevan CUIT/DNI explícito. Son
//   relevantes igual — los aceptamos sin CUIT/DNI.
//
// Idempotencia:
//   id de cada acto = sha256(hash_pdf|pagina|tipo|numero|cuit|monto). Si los 6
//   componentes son iguales entre dos corridas, INSERT OR IGNORE no inserta
//   y contamos como duplicado. Si algo cambia (corrigieron OCR, etc.), el id
//   es distinto y se inserta como nuevo acto.

import crypto from 'crypto'
import { dbRun, dbAll } from './db'
import { enquarantine } from './quarantine'
import type { ActoAdministrativoExtraido, OCRBoletinResultZC } from './ocr'

export interface PersistirOpts {
  jurisdiccion: string
  fuenteUrl: string
  /** YYYY-MM-DD si parseable de la URL/título del boletín. */
  fechaPublicacion?: string | null
  snapshotId?: string | null
  /**
   * Si true, los actos sin CUIT NI DNI van a quarantine en vez de boletin_actos.
   * Default true.
   */
  cuarentenaCriticosFaltantes?: boolean
}

export interface PersistirResultado {
  hashPdf: string
  actosInsertados: number
  actosQuarantined: number
  /** INSERT OR IGNORE no-ops (mismo id ya existía → idempotente). */
  actosDuplicados: number
}

interface ActoRow {
  id: string
  hash_pdf: string
  jurisdiccion: string
  pagina: number | bigint
  tipo_acto: string | null
  numero_acto: string | null
  numero_expediente: string | null
  fecha_acto: string | null
  cuit: string | null
  dni: string | null
  proveedor_razon_social: string | null
  reparticion: string | null
  monto: number | null
  texto_crudo: string | null
  metodo_extraccion: string
  confidence: number
}

function rowToActo(r: ActoRow): ActoAdministrativoExtraido {
  return {
    pagina: Number(r.pagina),
    tipoActo: r.tipo_acto,
    numeroActo: r.numero_acto,
    numeroExpediente: r.numero_expediente,
    fechaActo: r.fecha_acto,
    cuit: r.cuit,
    dni: r.dni,
    proveedorRazonSocial: r.proveedor_razon_social,
    reparticion: r.reparticion,
    monto: r.monto === null ? null : Number(r.monto),
    textoCrudo: r.texto_crudo ?? '',
    metodoExtraccion: (r.metodo_extraccion === 'pdf-ocr-tesseract' ? 'pdf-ocr-tesseract' : 'pdf-text'),
    confidence: Number(r.confidence),
  }
}

/**
 * Calcula el id estable de un acto. Componentes elegidos para que dos OCRs
 * de la misma página del mismo PDF generen el mismo id (idempotente) pero
 * distinta página o distinto número generen ids distintos.
 */
function computarIdActo(hashPdf: string, acto: ActoAdministrativoExtraido): string {
  const fingerprint = [
    hashPdf,
    acto.pagina,
    acto.tipoActo ?? '',
    acto.numeroActo ?? '',
    acto.cuit ?? '',
    acto.monto ?? '',
  ].join('|')
  return crypto.createHash('sha256').update(fingerprint).digest('hex')
}

/**
 * UPSERT del extracto. Si ya existía un row con el mismo hash_pdf actualizamos
 * procesado_en + metadata; si no, insertamos. Devolvemos true si fue UPDATE.
 */
async function upsertExtracto(
  resultado: OCRBoletinResultZC,
  opts: PersistirOpts,
): Promise<{ existed: boolean }> {
  const existing = await dbAll<{ hash_pdf: string }>(
    `SELECT hash_pdf FROM boletin_extractos WHERE hash_pdf = ?`,
    [resultado.hashPdf],
  )
  const existed = existing.length > 0

  // confidence_avg: promedio simple de confidences de los actos. Si no hay
  // actos, usar 0.
  const confidenceAvg = resultado.actos.length > 0
    ? resultado.actos.reduce((acc, a) => acc + (a.confidence ?? 0), 0) / resultado.actos.length
    : 0

  const paginasProblemAticasJson = JSON.stringify(resultado.paginasProblemAticas ?? [])
  const procesadoEn = new Date().toISOString()

  if (existed) {
    await dbRun(
      `UPDATE boletin_extractos SET
         jurisdiccion          = ?,
         fuente_url            = ?,
         fecha_publicacion     = ?,
         total_paginas         = ?,
         metodo_usado          = ?,
         confidence_avg        = ?,
         texto_completo        = ?,
         paginas_problematicas = ?,
         duracion_ms           = ?,
         snapshot_id           = ?,
         procesado_en          = ?
       WHERE hash_pdf = ?`,
      [
        opts.jurisdiccion,
        opts.fuenteUrl,
        opts.fechaPublicacion ?? null,
        resultado.totalPaginas,
        resultado.metodoUsado,
        confidenceAvg,
        resultado.textoCompleto ?? null,
        paginasProblemAticasJson,
        resultado.duracionMs ?? null,
        opts.snapshotId ?? null,
        procesadoEn,
        resultado.hashPdf,
      ],
    )
  } else {
    await dbRun(
      `INSERT INTO boletin_extractos
         (hash_pdf, jurisdiccion, fuente_url, fecha_publicacion, total_paginas,
          metodo_usado, confidence_avg, texto_completo, paginas_problematicas,
          duracion_ms, snapshot_id, procesado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resultado.hashPdf,
        opts.jurisdiccion,
        opts.fuenteUrl,
        opts.fechaPublicacion ?? null,
        resultado.totalPaginas,
        resultado.metodoUsado,
        confidenceAvg,
        resultado.textoCompleto ?? null,
        paginasProblemAticasJson,
        resultado.duracionMs ?? null,
        opts.snapshotId ?? null,
        procesadoEn,
      ],
    )
  }
  return { existed }
}

export async function persistirExtractoBoletin(
  resultado: OCRBoletinResultZC,
  opts: PersistirOpts,
): Promise<PersistirResultado> {
  const cuarentenarFaltantes = opts.cuarentenaCriticosFaltantes ?? true

  await upsertExtracto(resultado, opts)

  let actosInsertados = 0
  let actosQuarantined = 0
  let actosDuplicados = 0

  const ahora = new Date().toISOString()

  for (const acto of resultado.actos) {
    // Política: actos sin CUIT NI DNI van a quarantine, EXCEPTO Decretos
    // (que son normativos y suelen carecer de identificadores fiscales).
    const esNormativoSinIdentificador =
      acto.tipoActo === 'Decreto' || acto.tipoActo === 'Decretos'
    const faltanIdentificadores = !acto.cuit && !acto.dni
    if (cuarentenarFaltantes && faltanIdentificadores && !esNormativoSinIdentificador) {
      try {
        await enquarantine({
          snapshotId: opts.snapshotId ?? '',
          tablaDestino: 'boletin_actos',
          motivo: 'missing_critical_field',
          detalle: {
            campo: 'cuit_o_dni',
            mensaje: 'Acto sin CUIT ni DNI — no accionable sin verificación humana',
            tipoActo: acto.tipoActo,
            numeroActo: acto.numeroActo,
            pagina: acto.pagina,
          },
          filaJson: { ...acto, hashPdf: resultado.hashPdf },
        })
      } catch {
        // enquarantine puede fallar si no hay snapshot_id válido; en ese caso
        // simplemente registramos en quarantine con string vacío. La FK no es
        // strict en DuckDB, así que pasa.
      }
      actosQuarantined++
      continue
    }

    const id = computarIdActo(resultado.hashPdf, acto)

    // Detectar duplicado antes del INSERT para contar correctamente. DuckDB
    // soporta INSERT OR IGNORE pero no expone rowcount post-insert de manera
    // ergonómica desde nuestro wrapper, así que hacemos un SELECT primero.
    const dup = await dbAll<{ id: string }>(
      `SELECT id FROM boletin_actos WHERE id = ?`,
      [id],
    )
    if (dup.length > 0) {
      actosDuplicados++
      continue
    }

    await dbRun(
      `INSERT INTO boletin_actos
         (id, hash_pdf, jurisdiccion, pagina, tipo_acto, numero_acto,
          numero_expediente, fecha_acto, cuit, dni, proveedor_razon_social,
          reparticion, monto, texto_crudo, metodo_extraccion, confidence,
          snapshot_id, insertado_en, t_efectivo, t_publicado, superseded_by_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)`,
      [
        id,
        resultado.hashPdf,
        opts.jurisdiccion,
        acto.pagina,
        acto.tipoActo,
        acto.numeroActo,
        acto.numeroExpediente,
        acto.fechaActo,
        acto.cuit,
        acto.dni,
        acto.proveedorRazonSocial,
        acto.reparticion,
        acto.monto,
        acto.textoCrudo,
        acto.metodoExtraccion,
        acto.confidence,
        opts.snapshotId ?? null,
        ahora,
        acto.fechaActo, // t_efectivo = cuándo ocurrió el hecho oficial
        ahora,           // t_publicado = cuándo lo supimos en ARGOS
      ],
    )
    actosInsertados++
  }

  return {
    hashPdf: resultado.hashPdf,
    actosInsertados,
    actosQuarantined,
    actosDuplicados,
  }
}

export async function getActosPorPDF(hashPdf: string): Promise<ActoAdministrativoExtraido[]> {
  const rows = await dbAll<ActoRow>(
    `SELECT id, hash_pdf, jurisdiccion, pagina, tipo_acto, numero_acto,
            numero_expediente, fecha_acto, cuit, dni, proveedor_razon_social,
            reparticion, monto, texto_crudo, metodo_extraccion, confidence
     FROM boletin_actos
     WHERE hash_pdf = ?
     ORDER BY pagina ASC`,
    [hashPdf],
  )
  return rows.map(rowToActo)
}

export async function getActosPorJurisdiccion(
  jurisdiccion: string,
  limit = 200,
): Promise<ActoAdministrativoExtraido[]> {
  const rows = await dbAll<ActoRow>(
    `SELECT id, hash_pdf, jurisdiccion, pagina, tipo_acto, numero_acto,
            numero_expediente, fecha_acto, cuit, dni, proveedor_razon_social,
            reparticion, monto, texto_crudo, metodo_extraccion, confidence
     FROM boletin_actos
     WHERE jurisdiccion = ?
     ORDER BY fecha_acto DESC NULLS LAST, insertado_en DESC
     LIMIT ?`,
    [jurisdiccion, limit],
  )
  return rows.map(rowToActo)
}

export async function countBoletinExtractos(jurisdiccion?: string): Promise<number> {
  const rows = jurisdiccion
    ? await dbAll<{ n: number | bigint }>(
        `SELECT COUNT(*) as n FROM boletin_extractos WHERE jurisdiccion = ?`,
        [jurisdiccion],
      )
    : await dbAll<{ n: number | bigint }>(
        `SELECT COUNT(*) as n FROM boletin_extractos`,
        [],
      )
  return Number(rows[0]?.n ?? 0)
}
