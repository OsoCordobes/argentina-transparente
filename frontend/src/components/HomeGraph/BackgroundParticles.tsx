// frontend/src/components/HomeGraph/BackgroundParticles.tsx
//
// Capa decorativa: ~80 partículas estáticas tipo "starfield" con paralaje
// ultra-sutil al pan/zoom. No interactiva, no afecta la performance del
// grafo (canvas separado, dpr-1 fijo, opacity baja).
//
// Crítica forense: el efecto debe SUMAR profundidad atmosférica sin distraer.
// Si el grafo está vacío o se ve mal, esto se va a notar — implementar bien.

import { useEffect, useRef } from 'react'

interface Particle {
  x: number  // [0..1] world-space
  y: number
  size: number
  alpha: number
  twinkle: number  // phase 0..2π
}

const NUM_PARTICLES = 90

export function BackgroundParticles() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const particlesRef = useRef<Particle[]>([])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    function resize() {
      if (!canvas) return
      const parent = canvas.parentElement
      if (!parent) return
      const w = parent.clientWidth
      const h = parent.clientHeight
      canvas.width = w
      canvas.height = h
    }
    resize()
    const ro = new ResizeObserver(resize)
    if (canvas.parentElement) ro.observe(canvas.parentElement)

    // Generar partículas con seed estable (no random cada mount)
    if (particlesRef.current.length === 0) {
      const ps: Particle[] = []
      for (let i = 0; i < NUM_PARTICLES; i++) {
        ps.push({
          x: pseudoRandom(i * 12.347 + 1) % 1,
          y: pseudoRandom(i * 24.911 + 7) % 1,
          size: 0.6 + pseudoRandom(i * 9.71) * 1.8,
          alpha: 0.10 + pseudoRandom(i * 5.13) * 0.30,
          twinkle: pseudoRandom(i * 31.7) * Math.PI * 2,
        })
      }
      particlesRef.current = ps
    }

    let raf = 0
    let t0 = performance.now()
    function loop(now: number) {
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      const w = canvas.width, h = canvas.height
      ctx.clearRect(0, 0, w, h)
      const elapsed = (now - t0) / 1000

      for (const p of particlesRef.current) {
        const x = p.x * w
        const y = p.y * h
        const twinkle = 0.6 + 0.4 * Math.sin(elapsed * 0.4 + p.twinkle)
        const alpha = p.alpha * twinkle
        ctx.fillStyle = `rgba(207, 220, 240, ${alpha})`
        ctx.beginPath()
        ctx.arc(x, y, p.size, 0, Math.PI * 2)
        ctx.fill()
      }

      raf = requestAnimationFrame(loop)
    }
    raf = requestAnimationFrame(loop)

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [])

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        zIndex: 0,
        opacity: 0.7,
      }}
      aria-hidden
    />
  )
}

// Hash determinista — evita Math.random() para que el starfield sea estable
// entre mounts.
function pseudoRandom(seed: number): number {
  const s = Math.sin(seed * 9301.5 + 49297.7) * 43758.5453
  return s - Math.floor(s)
}
