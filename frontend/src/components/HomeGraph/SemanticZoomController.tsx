// frontend/src/components/HomeGraph/SemanticZoomController.tsx
//
// Escucha el evento `cameraUpdated` de sigma y dispara cambios de detail
// level cuando el ratio cruza thresholds. NO modifica el reducer — eso
// vive en HomeGraphInner y consume `detail` desde props.
//
// Ratios sigma camera (ratio<1 = zoom in, ratio>1 = zoom out):
//   > 1.8       → MACRO (jurisdicciones + ministerios prominentes)
//   0.7 – 1.8   → MESO (incluye direcciones + empresas)
//   < 0.7       → DEEP (incluye personas/funcionarios — fetch on-demand)
//
// Dispara setDetail con debounce implícito (sólo si pasó threshold neto).

import { useEffect, useRef } from 'react'
import { useSigma } from '@react-sigma/core'
import type { MapaDetail } from '@/lib/queries'

interface Props {
  detail: MapaDetail
  setDetail: (d: MapaDetail) => void
}

export function SemanticZoomController({ detail, setDetail }: Props) {
  const sigma = useSigma()
  const lastRatio = useRef<number>(1)

  useEffect(() => {
    const camera = sigma.getCamera()

    function handleCameraUpdate() {
      const ratio = camera.getState().ratio
      // Anti-stutter: sólo procesamos si el cambio neto es > 0.08
      if (Math.abs(ratio - lastRatio.current) < 0.08) return
      lastRatio.current = ratio

      // Detail switching con histeresis (zona de transición ancha para
      // evitar oscilación en el borde)
      if (ratio < 0.7 && detail !== 'deep') {
        setDetail('deep')
      } else if (ratio > 1.8 && detail !== 'macro') {
        setDetail('macro')
      } else if (ratio >= 0.7 && ratio <= 1.8 && detail === 'macro') {
        setDetail('meso')
      }
    }

    camera.on('updated', handleCameraUpdate)
    return () => {
      camera.removeListener('updated', handleCameraUpdate)
    }
  }, [sigma, detail, setDetail])

  return null
}
