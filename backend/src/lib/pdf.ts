// lib/pdf.ts — Utilidades para descarga y división de PDFs.
//
// Usado por el pipeline OCR (lib/ocr.ts) para procesar Boletines Oficiales
// que pueden tener cientos de páginas. Anthropic permite hasta 100 páginas
// por request — splitamos en chunks de 50 para tener margen + paralelizar.

import fs from 'fs/promises'
import { fileURLToPath } from 'url'
import { PDFDocument } from 'pdf-lib'

const TIMEOUT_MS = 120_000  // 2min para PDFs grandes

export async function descargarPDF(url: string): Promise<Buffer> {
  // Soporte file:// para smoke tests / fixtures locales (W2 cierre).
  // Node fetch en algunas versiones no maneja file:// nativamente; resolvemos
  // con fs.readFile sobre el path absoluto.
  if (url.startsWith('file://')) {
    const path = fileURLToPath(url)
    return await fs.readFile(path)
  }

  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(url, {
      signal: ctl.signal,
      headers: {
        'User-Agent': 'ARGOS/3.0 (investigación anticorrupción)',
        Accept: 'application/pdf',
      },
    })
    if (!res.ok) throw new Error(`HTTP ${res.status} descargando PDF`)
    const arrayBuffer = await res.arrayBuffer()
    return Buffer.from(arrayBuffer)
  } finally {
    clearTimeout(timer)
  }
}

export async function getPDFPageCount(buffer: Buffer): Promise<number> {
  const doc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  return doc.getPageCount()
}

export interface PDFChunk {
  buffer: Buffer
  startPage: number   // 1-indexed page number en el PDF original
  endPage: number     // inclusivo
}

// Divide un PDF en chunks de N páginas. Cada chunk es un PDF válido independiente.
// startPage/endPage son 1-indexed para reportar errores con la numeración humana.
export async function splitPDF(buffer: Buffer, chunkSize = 50): Promise<PDFChunk[]> {
  const sourceDoc = await PDFDocument.load(buffer, { ignoreEncryption: true })
  const totalPages = sourceDoc.getPageCount()
  const chunks: PDFChunk[] = []

  for (let i = 0; i < totalPages; i += chunkSize) {
    const startIdx = i
    const endIdx = Math.min(i + chunkSize, totalPages)
    const chunkDoc = await PDFDocument.create()
    const indices = Array.from({ length: endIdx - startIdx }, (_, k) => startIdx + k)
    const copiedPages = await chunkDoc.copyPages(sourceDoc, indices)
    for (const page of copiedPages) chunkDoc.addPage(page)

    const chunkBytes = await chunkDoc.save()
    chunks.push({
      buffer: Buffer.from(chunkBytes),
      startPage: startIdx + 1,
      endPage: endIdx,
    })
  }

  return chunks
}
