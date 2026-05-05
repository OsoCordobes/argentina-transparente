// frontend/src/components/HomeGraph/GraphOnboarding.tsx
//
// Modal central, 3 pasos, dim global. Comunica al usuario que está mirando
// "esto es Córdoba" antes de que vea solo dots.
//
// Persistencia: localStorage 'argos.onboarding.mapa.v1'. Bumpear sufijo
// si se modifica el contenido.
//
// UX:
// - Aparece sólo en first load.
// - Esc cierra.
// - Click fuera del card cierra.
// - Botón "no mostrar más" + "Saltar".
// - Replay disponible (futuro: floating ? button).

import { useEffect, useState } from 'react'

const KEY = 'argos.onboarding.mapa.v1'

const STEPS = [
  {
    eyebrow: 'PASO 1 / 3',
    title: 'Esto es Córdoba',
    body:
      'Provincia + Capital. Dos jurisdicciones, ~30 ministerios y secretarías, ' +
      '178,356 empleados públicos cargados, +1,300 contratos firmados. ' +
      'Cada nodo trae link a la fuente original.',
    accent: 'Provincia (azul) y Capital (amber) son los dos roots.',
  },
  {
    eyebrow: 'PASO 2 / 3',
    title: 'Cómo explorar',
    body:
      'Scroll para hacer zoom · drag para panear · click en cualquier nodo ' +
      'para abrir su panel detalle.',
    accent: '⌘K abre la búsqueda. Doble-click expandirá vecinos (req. Neo4j).',
  },
  {
    eyebrow: 'PASO 3 / 3',
    title: 'Qué encontrarás',
    body:
      'Empresas con sus contratos firmados, ministerios con sus empleados, ' +
      'organismos descentralizados, funcionarios con cargo, ' +
      'señales detectadas en rojo. Todo verificable, nada inventado.',
    accent: 'Filtros arriba: por jurisdicción y por tipo de entidad.',
  },
]

export function GraphOnboarding() {
  const [open, setOpen] = useState(false)
  const [step, setStep] = useState(0)

  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setOpen(true)
    } catch { /* SSR/private mode */ }
  }, [])

  // Esc cierra
  useEffect(() => {
    if (!open) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') close()
      if (e.key === 'ArrowRight' || e.key === 'Enter') next()
      if (e.key === 'ArrowLeft') prev()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, step])

  function close() {
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }
  function next() {
    if (step < STEPS.length - 1) setStep(s => s + 1)
    else close()
  }
  function prev() {
    if (step > 0) setStep(s => s - 1)
  }

  if (!open) return null

  const s = STEPS[step]

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'absolute',
        inset: 0,
        background: 'rgba(2, 4, 10, 0.62)',
        backdropFilter: 'blur(4px)',
        zIndex: 300,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
      }}
      onClick={(e) => { if (e.target === e.currentTarget) close() }}
    >
      <div
        style={{
          width: 520,
          maxWidth: '90vw',
          background: 'linear-gradient(180deg, rgba(15, 22, 38, 0.98) 0%, rgba(11, 16, 32, 0.98) 100%)',
          border: '1px solid rgba(148, 163, 184, 0.22)',
          borderRadius: 10,
          boxShadow: '0 32px 80px rgba(0, 0, 0, 0.7)',
          overflow: 'hidden',
        }}
      >
        {/* Indicador de paso superior */}
        <div style={{ display: 'flex', gap: 4, padding: '14px 24px 0' }}>
          {STEPS.map((_, i) => (
            <span
              key={i}
              style={{
                flex: 1,
                height: 2,
                background: i <= step ? '#4FC3F7' : 'rgba(148, 163, 184, 0.18)',
                borderRadius: 1,
                transition: 'background 240ms ease',
              }}
            />
          ))}
        </div>

        {/* Contenido */}
        <div style={{ padding: '28px 30px 22px' }}>
          <div
            style={{
              fontFamily: '"Geist Mono", monospace',
              fontSize: 9.5,
              color: '#64748B',
              letterSpacing: '0.24em',
              marginBottom: 8,
            }}
          >
            {s.eyebrow}
          </div>
          <h2
            style={{
              margin: 0,
              fontFamily: '"Geist", system-ui, sans-serif',
              fontSize: 24,
              fontWeight: 600,
              color: '#E5E7EB',
              letterSpacing: '-0.02em',
              lineHeight: 1.18,
              marginBottom: 14,
            }}
          >
            {s.title}
          </h2>
          <p
            style={{
              margin: 0,
              fontFamily: '"Geist", system-ui, sans-serif',
              fontSize: 14,
              color: '#CBD5E1',
              lineHeight: 1.6,
              letterSpacing: '-0.005em',
              marginBottom: 14,
            }}
          >
            {s.body}
          </p>
          <p
            style={{
              margin: 0,
              fontFamily: '"Geist Mono", monospace',
              fontSize: 11.5,
              color: '#4FC3F7',
              lineHeight: 1.5,
              letterSpacing: '0.02em',
              padding: '10px 12px',
              background: 'rgba(79, 195, 247, 0.06)',
              border: '1px solid rgba(79, 195, 247, 0.18)',
              borderRadius: 4,
            }}
          >
            {s.accent}
          </p>
        </div>

        {/* Footer */}
        <div
          style={{
            padding: '16px 24px 18px',
            borderTop: '1px solid rgba(148, 163, 184, 0.14)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
          }}
        >
          <button
            type="button"
            onClick={close}
            style={{
              background: 'transparent',
              border: 'none',
              color: '#64748B',
              fontFamily: '"Geist Mono", monospace',
              fontSize: 10.5,
              letterSpacing: '0.16em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              padding: '6px 4px',
            }}
          >
            Saltar
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            {step > 0 && (
              <button
                type="button"
                onClick={prev}
                style={{
                  background: 'transparent',
                  border: '1px solid rgba(148, 163, 184, 0.22)',
                  color: '#94A3B8',
                  padding: '8px 16px',
                  borderRadius: 4,
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.16em',
                  textTransform: 'uppercase',
                  cursor: 'pointer',
                }}
              >
                Atrás
              </button>
            )}
            <button
              type="button"
              onClick={next}
              style={{
                background: '#4FC3F7',
                border: 'none',
                color: '#02040A',
                padding: '8px 22px',
                borderRadius: 4,
                fontFamily: '"Geist Mono", monospace',
                fontSize: 10.5,
                letterSpacing: '0.16em',
                textTransform: 'uppercase',
                cursor: 'pointer',
                fontWeight: 600,
                boxShadow: '0 4px 16px rgba(79, 195, 247, 0.30)',
              }}
            >
              {step < STEPS.length - 1 ? 'Siguiente →' : 'Empezar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
