/**
 * Onboarding.tsx
 *
 * Modal de bienvenida que aparece UNA sola vez (primer load) explicando
 * la diferencia entre datos verificables (texto normal) e interpretación
 * de soporte (cursiva) — CLAUDE.md §5 "separar señal de interpretación".
 *
 * Persistencia: localStorage flag `argos.onboarding_seen.v1`. Bumpear el
 * sufijo `.v2` si se modifica el contenido y querés re-mostrarlo a usuarios
 * existentes.
 */

import { useState, useEffect } from 'react'

const STORAGE_KEY = 'argos.onboarding_seen.v1'

export function Onboarding() {
  const [open, setOpen] = useState(false)

  useEffect(() => {
    try {
      if (!localStorage.getItem(STORAGE_KEY)) setOpen(true)
    } catch { /* ignore */ }
  }, [])

  const cerrar = () => {
    try { localStorage.setItem(STORAGE_KEY, '1') } catch { /* ignore */ }
    setOpen(false)
  }

  if (!open) return null

  return (
    <div
      role="dialog"
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0,0,0,0.6)',
        display: 'grid',
        placeItems: 'center',
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: 'var(--bg-1)',
          border: '1px solid var(--stroke)',
          borderRadius: 8,
          padding: 32,
          maxWidth: 560,
          color: 'var(--text)',
        }}
      >
        <h2 style={{ margin: 0, marginBottom: 16 }}>Cómo leer ARGOS</h2>
        <p>ARGOS combina dos capas de información:</p>
        <ul>
          <li>
            <strong style={{ color: 'var(--celeste)' }}>● Datos verificables</strong> (texto normal)
            <br/>
            <span style={{ fontSize: '0.9em', color: 'var(--text-3)' }}>
              Provienen del Portal Gobiernoabierto Córdoba, AFIP, IGJ Nación,
              Padrón Provincial. Cada cifra cita su fuente original. Defendibles
              ante Tribunal de Cuentas.
            </span>
          </li>
          <li style={{ marginTop: 12 }}>
            <strong style={{ color: 'var(--ambar)' }}>● Interpretación de soporte</strong> (cursiva)
            <br/>
            <span style={{ fontSize: '0.9em', color: 'var(--text-3)' }}>
              ARGOS sugiere lecturas usando Claude (LLM). Es un asistente
              personal, no asesoría jurídica. Antes de actuar, validá la
              interpretación con tu propio criterio o un profesional del
              derecho.
            </span>
          </li>
        </ul>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 24 }}>
          Cero alucinaciones · Toda señal verificable
        </p>
        <button
          onClick={cerrar}
          style={{
            marginTop: 16,
            padding: '8px 24px',
            background: 'var(--celeste)',
            color: 'var(--bg-0)',
            border: 'none',
            borderRadius: 4,
            cursor: 'pointer',
          }}
        >
          Entendido →
        </button>
      </div>
    </div>
  )
}
