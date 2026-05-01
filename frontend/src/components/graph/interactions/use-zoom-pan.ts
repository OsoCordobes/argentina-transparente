import { useEffect, useRef } from 'react'
import { zoom, zoomIdentity, zoomTransform, type ZoomBehavior } from 'd3-zoom'
import { select } from 'd3-selection'
import type { ZoomState } from '../types'

interface Opts {
  svgRef: React.RefObject<SVGSVGElement>
  contentRef: React.RefObject<SVGGElement>
  initialState?: ZoomState
  minZoom?: number
  maxZoom?: number
  onZoom?: (state: ZoomState) => void
}

/**
 * Wire d3.zoom al SVG. Aplica el transform al `<g class="zoom-content">`.
 * Devuelve helpers: zoomTo(node), reset(), getCurrent().
 */
export function useZoomPan({ svgRef, contentRef, initialState, minZoom = 0.4, maxZoom = 6, onZoom }: Opts) {
  const zoomBehaviorRef = useRef<ZoomBehavior<SVGSVGElement, unknown> | null>(null)

  useEffect(() => {
    if (!svgRef.current || !contentRef.current) return
    const svg = select(svgRef.current)
    const content = select(contentRef.current)

    const zb = zoom<SVGSVGElement, unknown>()
      .scaleExtent([minZoom, maxZoom])
      .on('zoom', (event) => {
        const { x, y, k } = event.transform
        content.attr('transform', `translate(${x},${y}) scale(${k})`)
        onZoom?.({ k, x, y })
      })

    zoomBehaviorRef.current = zb
    svg.call(zb)

    if (initialState) {
      svg.call(zb.transform, zoomIdentity.translate(initialState.x, initialState.y).scale(initialState.k))
    }

    return () => {
      svg.on('.zoom', null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [svgRef, contentRef])

  return {
    /** Centra la cámara en (worldX, worldY) con zoom k. */
    zoomTo(worldX: number, worldY: number, k: number, viewportW: number, viewportH: number) {
      if (!svgRef.current || !zoomBehaviorRef.current) return
      const svg = select(svgRef.current)
      const transform = zoomIdentity.translate(viewportW / 2 - k * worldX, viewportH / 2 - k * worldY).scale(k)
      svg.transition().duration(700).call(zoomBehaviorRef.current.transform, transform)
    },
    reset() {
      if (!svgRef.current || !zoomBehaviorRef.current) return
      select(svgRef.current).transition().duration(400).call(zoomBehaviorRef.current.transform, zoomIdentity)
    },
    getCurrent(): ZoomState {
      if (!svgRef.current) return { k: 1, x: 0, y: 0 }
      const t = zoomTransform(svgRef.current)
      return { k: t.k, x: t.x, y: t.y }
    },
  }
}
