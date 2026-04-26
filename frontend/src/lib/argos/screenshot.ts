/**
 * screenshot.ts — Captura el grafo + ficha del proveedor como PNG.
 *
 * Usa html-to-image (~10KB gzip). Funciona client-side, sin worker
 * ni servicio externo. Bandeja también el watermark "ARGOS · cordoba.
 * gob.ar · [fecha]" para que la imagen sea citable cuando se comparte.
 *
 * Hard rule (CLAUDE.md §2): el watermark deja constancia de que el
 * dato fue extraído desde ARGOS y de la fecha — el ciudadano que ve
 * la imagen sabe inmediatamente la procedencia.
 */

import { toPng } from 'html-to-image'

export interface ScreenshotOptions {
  /** Slug para el filename. Ej: "pinturas-cavazzon-srl". */
  slug: string
  /** Fecha de los datos (YYYY-MM-DD o ISO). Si null, usa hoy. */
  fechaDatos?: string | null
  /** Multiplicador de pixel ratio. 2 = retina-quality. Default: 2. */
  pixelRatio?: number
}

const WATERMARK_HEIGHT = 36
const WATERMARK_BG = 'rgba(12, 12, 16, 0.92)' // --bg-0 con alpha
const WATERMARK_FG = '#9BA3B4' // --text-3
const WATERMARK_ACCENT = '#6FB8E8' // --celeste

function fmtFecha(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date()
  if (Number.isNaN(d.getTime())) return new Date().toLocaleDateString('es-AR')
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Captura el elemento como PNG, agrega watermark abajo y dispara descarga.
 * Si falla, retorna { ok: false, error } para que el caller muestre toast.
 */
export async function capturarYDescargar(
  el: HTMLElement | null,
  opts: ScreenshotOptions,
): Promise<{ ok: boolean; error?: string }> {
  if (!el) return { ok: false, error: 'elemento no encontrado' }

  try {
    const ratio = opts.pixelRatio ?? 2

    // 1. Capturar el HTML como PNG dataURL
    const pngDataUrl = await toPng(el, {
      pixelRatio: ratio,
      cacheBust: true,
      backgroundColor: '#0c0c10', // --bg-0 sólido
      // Filter: omit elements marcados con data-no-screenshot="true"
      filter: (node) => {
        if (!(node instanceof HTMLElement)) return true
        return node.dataset.noScreenshot !== 'true'
      },
    })

    // 2. Cargar imagen para componer + agregar watermark abajo
    const img = await loadImage(pngDataUrl)
    const canvas = document.createElement('canvas')
    canvas.width = img.width
    canvas.height = img.height + WATERMARK_HEIGHT * ratio
    const ctx = canvas.getContext('2d')
    if (!ctx) return { ok: false, error: 'canvas 2d no disponible' }

    // Fondo
    ctx.fillStyle = '#0c0c10'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // Imagen original
    ctx.drawImage(img, 0, 0)

    // Watermark band
    const wmY = img.height
    const wmH = WATERMARK_HEIGHT * ratio
    ctx.fillStyle = WATERMARK_BG
    ctx.fillRect(0, wmY, canvas.width, wmH)

    // Línea separadora celeste
    ctx.fillStyle = WATERMARK_ACCENT
    ctx.fillRect(0, wmY, canvas.width, 2)

    // Texto
    const fontSize = 13 * ratio
    ctx.font = `${fontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
    ctx.fillStyle = WATERMARK_ACCENT
    ctx.textBaseline = 'middle'
    const textY = wmY + wmH / 2

    // Logo "ARGOS" en celeste
    ctx.fillText('● ARGOS', 16 * ratio, textY)

    // Subtítulo en gris
    ctx.fillStyle = WATERMARK_FG
    const subFontSize = 11 * ratio
    ctx.font = `${subFontSize}px ui-monospace, "SF Mono", Menlo, Consolas, monospace`
    ctx.fillText(
      `cordoba.gob.ar · datos al ${fmtFecha(opts.fechaDatos)}`,
      120 * ratio,
      textY,
    )

    // "Verificable" alineado derecha
    const verifText = 'Cero alucinaciones · Toda señal verificable'
    const verifWidth = ctx.measureText(verifText).width
    ctx.fillText(verifText, canvas.width - verifWidth - 16 * ratio, textY)

    // 3. Descargar
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png'),
    )
    if (!blob) return { ok: false, error: 'no se pudo generar el blob' }

    const fechaStr = fmtFecha(opts.fechaDatos).replace(/\//g, '-')
    const filename = `argos-${slugify(opts.slug)}-${fechaStr}.png`

    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = filename
    document.body.appendChild(a)
    a.click()
    a.remove()
    URL.revokeObjectURL(url)

    return { ok: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { ok: false, error: msg }
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('no se pudo cargar la imagen'))
    img.src = src
  })
}

/**
 * Helper conveniente: captura el `.canvas-wrap` actual de la página
 * (grafo + hero + panel) y dispara descarga.
 */
export async function capturarCanvasWrap(opts: ScreenshotOptions) {
  const el = document.querySelector<HTMLElement>('.canvas-wrap')
  return capturarYDescargar(el, opts)
}
