// frontend/src/components/HomeGraph/GraphFilters.tsx
//
// 2 grupos de filtros top-left:
//   • JURISDICCIÓN: Provincia / Capital (toggleables independientes)
//   • TIPO DE ENTIDAD: Ministerio / Dirección / Organismo / Empresa / Persona
//
// Modifica el Graphology graph via setNodeAttribute('hidden', ...). Sigma
// re-renderea via su nodeReducer (que ya respeta `hidden`). No recomputa layout.

import { useEffect, useState } from 'react'
import { useSigma } from '@react-sigma/core'
import { COLORS, type GraphNodeAttrs } from './buildGraph'

const TYPE_FILTERS: { type: GraphNodeAttrs['entityType']; label: string; color: string }[] = [
  { type: 'ministerio', label: 'Ministerios', color: COLORS.ministerioCapital },
  { type: 'organismo', label: 'Organismos', color: COLORS.organismo },
  { type: 'direccion', label: 'Direcciones', color: COLORS.direccion },
  { type: 'empresa', label: 'Empresas', color: COLORS.empresa },
  { type: 'persona', label: 'Personas', color: COLORS.personaFuncionario },
]

const JURISDICCIONES: { jur: 'provincia' | 'capital'; label: string; color: string }[] = [
  { jur: 'provincia', label: 'Provincia', color: COLORS.jurProvincia },
  { jur: 'capital', label: 'Capital', color: COLORS.jurCapital },
]

export function GraphFilters() {
  const sigma = useSigma()
  const [activeTypes, setActiveTypes] = useState<Record<GraphNodeAttrs['entityType'], boolean>>({
    jurisdiccion: true,
    ministerio: true,
    organismo: true,
    direccion: true,
    empresa: true,
    persona: true,
    empleado: true,
  })
  const [activeJur, setActiveJur] = useState<{ provincia: boolean; capital: boolean }>({
    provincia: true,
    capital: true,
  })

  // Re-aplicar filtros al graph cada vez que cambia el estado
  useEffect(() => {
    const graph = sigma.getGraph()
    graph.forEachNode((id, attrs) => {
      const a = attrs as GraphNodeAttrs
      const typeOk = activeTypes[a.entityType] ?? true
      const jurOk = a.jurisdiccion ? activeJur[a.jurisdiccion] : true
      const visible = typeOk && jurOk
      if (a.hidden !== !visible) {
        graph.setNodeAttribute(id, 'hidden', !visible)
      }
    })
    graph.forEachEdge((id, _, sId, tId) => {
      const sH = graph.getNodeAttribute(sId, 'hidden') as boolean | undefined
      const tH = graph.getNodeAttribute(tId, 'hidden') as boolean | undefined
      const eH = !!(sH || tH)
      const cur = graph.getEdgeAttribute(id, 'hidden') as boolean | undefined
      if (cur !== eH) graph.setEdgeAttribute(id, 'hidden', eH)
    })
    sigma.refresh()
  }, [activeTypes, activeJur, sigma])

  return (
    <div
      style={{
        position: 'absolute',
        top: 18,
        left: 18,
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        zIndex: 90,
      }}
    >
      <div style={{ display: 'flex', gap: 6 }}>
        <span style={pillLabelStyle}>jurisdicción</span>
        {JURISDICCIONES.map(({ jur, label, color }) => {
          const on = activeJur[jur]
          return (
            <button
              key={jur}
              type="button"
              onClick={() => setActiveJur(p => ({ ...p, [jur]: !p[jur] }))}
              style={chipStyle(on, color)}
            >
              <span style={dotStyle(on, color)} />
              {label}
            </button>
          )
        })}
      </div>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <span style={pillLabelStyle}>tipo</span>
        {TYPE_FILTERS.map(({ type, label, color }) => {
          const on = activeTypes[type]
          return (
            <button
              key={type}
              type="button"
              onClick={() => setActiveTypes(p => ({ ...p, [type]: !p[type] }))}
              style={chipStyle(on, color)}
            >
              <span style={dotStyle(on, color)} />
              {label}
            </button>
          )
        })}
      </div>
    </div>
  )
}

const pillLabelStyle: React.CSSProperties = {
  fontFamily: '"Geist Mono", monospace',
  fontSize: 9,
  letterSpacing: '0.22em',
  color: '#64748B',
  textTransform: 'uppercase',
  alignSelf: 'center',
  paddingRight: 4,
}

function chipStyle(on: boolean, color: string): React.CSSProperties {
  return {
    background: on ? `${hexToRgba(color, 0.13)}` : 'rgba(15, 22, 38, 0.78)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: `1px solid ${on ? color : 'rgba(148, 163, 184, 0.18)'}`,
    borderRadius: 5,
    padding: '5px 11px',
    color: on ? color : '#64748B',
    fontFamily: '"Geist Mono", monospace',
    fontSize: 10,
    letterSpacing: '0.10em',
    textTransform: 'uppercase',
    cursor: 'pointer',
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    transition: 'all 140ms ease',
    opacity: on ? 1 : 0.65,
  }
}

function dotStyle(on: boolean, color: string): React.CSSProperties {
  return {
    width: 7,
    height: 7,
    borderRadius: '50%',
    background: on ? color : '#475569',
    boxShadow: on ? `0 0 6px ${color}` : 'none',
  }
}

function hexToRgba(hex: string, a: number): string {
  if (!hex || hex[0] !== '#') return hex
  const r = parseInt(hex.slice(1, 3), 16)
  const g = parseInt(hex.slice(3, 5), 16)
  const b = parseInt(hex.slice(5, 7), 16)
  return `rgba(${r},${g},${b},${a})`
}
