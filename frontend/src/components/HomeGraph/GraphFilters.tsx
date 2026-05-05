// frontend/src/components/HomeGraph/GraphFilters.tsx
//
// Chips de filtro top-left: toggle de visibilidad por tipo de entidad.
// Al apagar un tipo, los nodos de ese tipo van a opacity baja vía el
// nodeReducer (via la flag `hidden` en sus atributos).
//
// El filtro modifica el Graphology Graph directamente (setNodeAttribute
// 'hidden') — es eficiente, no recomputa layout.

import { useEffect, useState } from 'react'
import { useSigma } from '@react-sigma/core'
import { ENTITY_COLORS, type EntityType, type GraphNodeAttrs } from './buildGraph'

const FILTERS: { type: EntityType; label: string }[] = [
  { type: 'jurisdiccion', label: 'Estado' },
  { type: 'reparticion', label: 'Reparticiones' },
  { type: 'empresa', label: 'Empresas' },
  { type: 'persona', label: 'Personas' },
]

export function GraphFilters() {
  const sigma = useSigma()
  // active = qué tipos están VISIBLES. Por default todos.
  const [active, setActive] = useState<Record<EntityType, boolean>>({
    jurisdiccion: true,
    reparticion: true,
    empresa: true,
    persona: true,
    documento: true,
  })

  // Aplica el filtro al Graphology Graph cada vez que cambia `active`.
  useEffect(() => {
    const graph = sigma.getGraph()
    graph.forEachNode((id, attrs) => {
      const a = attrs as GraphNodeAttrs
      const visible = active[a.entityType] ?? true
      if (a.hidden !== !visible) {
        graph.setNodeAttribute(id, 'hidden', !visible)
      }
    })
    // Aristas: ocultas si alguno de sus extremos está oculto.
    graph.forEachEdge((id, _, sId, tId) => {
      const sHidden = graph.getNodeAttribute(sId, 'hidden') as boolean | undefined
      const tHidden = graph.getNodeAttribute(tId, 'hidden') as boolean | undefined
      const eHidden = !!(sHidden || tHidden)
      const cur = graph.getEdgeAttribute(id, 'hidden') as boolean | undefined
      if (cur !== eHidden) graph.setEdgeAttribute(id, 'hidden', eHidden)
    })
    sigma.refresh()
  }, [active, sigma])

  return (
    <div
      style={{
        position: 'absolute',
        top: 18,
        left: 18,
        display: 'flex',
        gap: 6,
        zIndex: 90,
      }}
    >
      {FILTERS.map(({ type, label }) => {
        const isActive = active[type]
        const color = ENTITY_COLORS[type]
        return (
          <button
            key={type}
            type="button"
            onClick={() => setActive(prev => ({ ...prev, [type]: !prev[type] }))}
            style={{
              background: isActive ? `rgba(${hexToRgb(color)}, 0.12)` : 'rgba(15, 22, 38, 0.78)',
              backdropFilter: 'blur(12px)',
              WebkitBackdropFilter: 'blur(12px)',
              border: `1px solid ${isActive ? color : 'rgba(148, 163, 184, 0.18)'}`,
              borderRadius: 5,
              padding: '6px 12px',
              color: isActive ? color : '#64748B',
              fontFamily: '"Geist Mono", monospace',
              fontSize: 10,
              letterSpacing: '0.12em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 7,
              transition: 'all 140ms ease',
              opacity: isActive ? 1 : 0.7,
            }}
          >
            <span
              style={{
                width: 7,
                height: 7,
                borderRadius: '50%',
                background: isActive ? color : '#475569',
                boxShadow: isActive ? `0 0 6px ${color}` : 'none',
              }}
            />
            {label}
          </button>
        )
      })}
    </div>
  )
}

function hexToRgb(hex: string): string {
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `${r}, ${g}, ${b}`
}
