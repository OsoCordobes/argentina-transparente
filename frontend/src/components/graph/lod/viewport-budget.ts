import type { ViewportSize } from '../types'

/** Cap absoluto — no renderizamos más que esto, sin importar el viewport. */
export const MAX_RENDERED = 300
/** Mínimo bounding box por nodo (área aprox para que no se solapen). */
const NODE_BOUNDING_AREA = 80 * 60  // 4800 px²

export interface ViewportBudget {
  /** Cuántos nodos podemos renderizar cómodos */
  maxVisibleNodes: number
  /** Pixel area total del viewport */
  pixelArea: number
}

export function calcViewportBudget(
  viewport: ViewportSize,
  zoom: number
): ViewportBudget {
  // Area visible en world-coords (zoom amplía cantidad efectiva mostrable)
  const pixelArea = viewport.width * viewport.height * Math.max(zoom, 0.5)
  const raw = Math.floor(pixelArea / NODE_BOUNDING_AREA)
  return {
    maxVisibleNodes: Math.min(MAX_RENDERED, raw),
    pixelArea,
  }
}
