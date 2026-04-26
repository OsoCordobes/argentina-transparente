import React from 'react'

interface Props { children: React.ReactNode }

/**
 * Renderiza un bloque de "interpretación" (cursiva, atenuado, prefijo).
 * Usado por ExplorarLayout cuando ARGOS sale del modo "hechos citados"
 * y pasa a sugerir lecturas / hipótesis. Visualmente diferenciado del
 * texto principal para que el lector distinga señal verificable de
 * análisis interpretativo (CLAUDE.md §5).
 */
export function InterpretationBlock({ children }: Props) {
  return (
    <div
      style={{
        marginTop: 8,
        paddingLeft: 12,
        borderLeft: '2px solid var(--text-3)',
        fontStyle: 'italic',
        color: 'var(--text-3)',
        fontSize: '0.95em',
      }}
    >
      <div style={{ fontSize: 10, opacity: 0.7, marginBottom: 4 }}>
        ╴Interpretación╴
      </div>
      {children}
    </div>
  )
}
