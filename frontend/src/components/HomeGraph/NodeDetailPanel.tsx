// frontend/src/components/HomeGraph/NodeDetailPanel.tsx
//
// Panel lateral derecho que aparece al click sobre un nodo. Muestra los
// datos REALES del nodo + su contexto (cadena de conexión hacia los
// padres + top vecinos directos).
//
// Estructura:
//   1. Header: badge color + tipo + nombre grande + subtitle
//   2. KPIs grandes data-driven según el tipo de entidad
//   3. Cadena de conexión (depth 0 → 1 → 2)
//   4. Top vecinos directos (de Graphology)
//   5. Footer: hint para expandir + link a perfil completo

import { useEffect, useMemo } from 'react'
import { useSigma } from '@react-sigma/core'
import { COLORS, type GraphNodeAttrs } from './buildGraph'

interface Props {
  node: GraphNodeAttrs | null
  onClose: () => void
}

function fmtARS(n: number): string {
  if (!n) return '$0'
  if (n >= 1e9) return `$${(n / 1e9).toFixed(2)} mil M`
  if (n >= 1e6) return `$${(n / 1e6).toFixed(1)} M`
  if (n >= 1e3) return `$${(n / 1e3).toFixed(0)} mil`
  return `$${Math.round(n)}`
}
function fmtN(n: number): string {
  return n.toLocaleString('es-AR')
}

function typeLabel(t: GraphNodeAttrs['entityType']): string {
  switch (t) {
    case 'jurisdiccion': return 'Jurisdicción'
    case 'ministerio': return 'Ministerio · Secretaría'
    case 'organismo': return 'Organismo descentralizado'
    case 'direccion': return 'Dirección interna'
    case 'empresa': return 'Empresa · Proveedor'
    case 'persona': return 'Persona · Funcionario'
    case 'empleado': return 'Empleado público'
    default: return t
  }
}

function nodeColor(n: GraphNodeAttrs): string {
  if (n.entityType === 'jurisdiccion') return n.jurisdiccion === 'provincia' ? COLORS.jurProvincia : COLORS.jurCapital
  if (n.entityType === 'ministerio') return n.jurisdiccion === 'provincia' ? COLORS.ministerioProvincia : COLORS.ministerioCapital
  if (n.entityType === 'organismo') return COLORS.organismo
  if (n.entityType === 'direccion') return COLORS.direccion
  if (n.entityType === 'empresa') return COLORS.empresa
  if (n.entityType === 'persona') return COLORS.personaFuncionario
  return COLORS.empleado
}

export function NodeDetailPanel({ node, onClose }: Props) {
  const sigma = useSigma()

  // Cerrar con Esc
  useEffect(() => {
    if (!node) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [node, onClose])

  // Compute neighbors + parent chain
  const { parents, neighbors } = useMemo(() => {
    if (!node) return { parents: [] as Array<{ id: string; attrs: GraphNodeAttrs }>, neighbors: [] as Array<{ id: string; attrs: GraphNodeAttrs; kind: string; weight: number }> }
    const graph = sigma.getGraph()
    if (!graph.hasNode((node as unknown as { id?: string }).id ?? '')) {
      // Fallback: find by label match
      let foundId: string | null = null
      graph.forEachNode((id, attrs) => {
        if ((attrs as GraphNodeAttrs).label === node.label) foundId = id
      })
      if (!foundId) return { parents: [], neighbors: [] }
    }
    // Encontrar el id del nodo seleccionado por label match (props no traen id)
    let selfId: string | null = null
    graph.forEachNode((id, attrs) => {
      const a = attrs as GraphNodeAttrs
      if (a.label === node.label && a.entityType === node.entityType) {
        selfId = id
      }
    })
    if (!selfId) return { parents: [], neighbors: [] }

    // Parents: vecinos via aristas 'contiene' que apuntan a self (self es target)
    const ps: Array<{ id: string; attrs: GraphNodeAttrs }> = []
    graph.forEachInNeighbor(selfId, (nid, nattrs) => {
      ps.push({ id: nid, attrs: nattrs as GraphNodeAttrs })
    })

    // Neighbors: top 8 por weight de arista
    const neigh: Array<{ id: string; attrs: GraphNodeAttrs; kind: string; weight: number }> = []
    graph.forEachOutEdge(selfId, (eid, eattrs, _, tId) => {
      const t = graph.getNodeAttributes(tId) as GraphNodeAttrs
      const e = eattrs as { kind: string; weight: number }
      neigh.push({ id: tId, attrs: t, kind: e.kind, weight: e.weight })
    })
    graph.forEachInEdge(selfId, (eid, eattrs, sId) => {
      const s = graph.getNodeAttributes(sId) as GraphNodeAttrs
      const e = eattrs as { kind: string; weight: number }
      // Skip ya capturados como parents (kind contiene)
      if (e.kind === 'contiene') return
      neigh.push({ id: sId, attrs: s, kind: e.kind, weight: e.weight })
    })
    neigh.sort((a, b) => b.weight - a.weight)
    return { parents: ps.slice(0, 3), neighbors: neigh.slice(0, 8) }
  }, [node, sigma])

  const open = !!node

  return (
    <aside
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        width: 380,
        height: '100%',
        background: 'rgba(11, 16, 32, 0.94)',
        backdropFilter: 'blur(20px) saturate(140%)',
        WebkitBackdropFilter: 'blur(20px) saturate(140%)',
        borderLeft: '1px solid rgba(148, 163, 184, 0.20)',
        boxShadow: '-12px 0 40px rgba(0,0,0,0.5)',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 320ms cubic-bezier(0.32, 0.72, 0, 1)',
        zIndex: 110,
        display: 'flex',
        flexDirection: 'column',
        pointerEvents: open ? 'auto' : 'none',
        overflowY: 'auto',
      }}
      aria-hidden={!open}
    >
      {!node ? null : (
        <>
          {/* ─── Header ────────────────────────────────────────────── */}
          <div
            style={{
              padding: '18px 22px 16px',
              borderBottom: '1px solid rgba(148, 163, 184, 0.14)',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 13,
            }}
          >
            <span
              style={{
                width: 18,
                height: 18,
                borderRadius: '50%',
                background: nodeColor(node),
                border: `2px solid ${nodeColor(node)}`,
                boxShadow: `0 0 14px ${nodeColor(node)}aa`,
                marginTop: 4,
                flexShrink: 0,
              }}
              aria-hidden
            />
            <div style={{ flex: 1, minWidth: 0 }}>
              <div
                style={{
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 9,
                  color: '#64748B',
                  letterSpacing: '0.24em',
                  marginBottom: 5,
                  textTransform: 'uppercase',
                }}
              >
                {typeLabel(node.entityType)}
                {node.jurisdiccion && (
                  <>
                    {' · '}
                    <span style={{ color: node.jurisdiccion === 'provincia' ? COLORS.jurProvincia : COLORS.jurCapital }}>
                      {node.jurisdiccion === 'provincia' ? 'Provincia' : 'Capital'}
                    </span>
                  </>
                )}
              </div>
              <div
                style={{
                  fontFamily: '"Geist", system-ui, sans-serif',
                  fontSize: 17,
                  color: '#E5E7EB',
                  fontWeight: 600,
                  lineHeight: 1.25,
                  letterSpacing: '-0.015em',
                  wordBreak: 'break-word',
                }}
              >
                {node.label}
              </div>
              {node.subtitle && (
                <div
                  style={{
                    fontFamily: '"Geist Mono", monospace',
                    fontSize: 11,
                    color: '#94A3B8',
                    marginTop: 7,
                    letterSpacing: '0.02em',
                  }}
                >
                  {node.subtitle}
                </div>
              )}
            </div>
            <button
              type="button"
              aria-label="Cerrar panel"
              onClick={onClose}
              style={{
                background: 'transparent',
                border: 'none',
                color: '#64748B',
                cursor: 'pointer',
                fontSize: 16,
                lineHeight: 1,
                padding: 6,
                fontFamily: 'monospace',
              }}
            >
              ✕
            </button>
          </div>

          {/* ─── KPIs grandes ──────────────────────────────────────── */}
          <div style={{ padding: '20px 22px 6px', display: 'flex', flexDirection: 'column', gap: 18 }}>
            {node.monto > 0 && (
              <Kpi label={node.entityType === 'empresa' ? 'MONTO RECIBIDO' : 'MONTO CONTRATADO'} value={fmtARS(node.monto)} highlight />
            )}
            {node.contratos > 0 && (
              <Kpi label="CONTRATOS" value={fmtN(node.contratos)} />
            )}
            {node.empleados > 0 && (
              <Kpi label="EMPLEADOS PÚBLICOS" value={fmtN(node.empleados)} highlight={node.entityType === 'ministerio' || node.entityType === 'organismo'} />
            )}
            {(node.hasGrave || node.hasModerada) && (
              <Kpi
                label="SEÑALES ACTIVAS"
                value={node.hasGrave ? 'GRAVE' : 'MODERADA'}
                tone={node.hasGrave ? 'danger' : 'warn'}
              />
            )}
            {(node.rawData.sueldo as number) > 0 && (
              <Kpi label="SUELDO MENSUAL" value={fmtARS(node.rawData.sueldo as number)} />
            )}
            {!node.cuitVerificado && node.entityType === 'empresa' && (
              <div
                style={{
                  padding: '10px 12px',
                  background: 'rgba(245, 158, 11, 0.08)',
                  border: '1px solid rgba(245, 158, 11, 0.28)',
                  borderRadius: 4,
                  color: '#FCD34D',
                  fontFamily: '"Geist Mono", monospace',
                  fontSize: 10.5,
                  letterSpacing: '0.04em',
                  lineHeight: 1.5,
                }}
              >
                ⚑ Sin CUIT verificado — la identidad fiscal está pendiente
                de cruce con AFIP/IGJ.
              </div>
            )}
          </div>

          {/* ─── Cadena de conexión (parents) ──────────────────────── */}
          {parents.length > 0 && (
            <div style={{ padding: '8px 22px 6px' }}>
              <Section label="PERTENECE A">
                {parents.map(p => (
                  <Connection key={p.id} attrs={p.attrs} />
                ))}
              </Section>
            </div>
          )}

          {/* ─── Top vecinos directos ──────────────────────────────── */}
          {neighbors.length > 0 && (
            <div style={{ padding: '8px 22px 6px' }}>
              <Section label={`CONECTADO CON · ${neighbors.length}`}>
                {neighbors.map(n => (
                  <Neighbor key={n.id} attrs={n.attrs} kind={n.kind} weight={n.weight} />
                ))}
              </Section>
            </div>
          )}

          {/* ─── Fuente original ──────────────────────────────────── */}
          <div style={{ padding: '8px 22px 14px' }}>
            <Section label="FUENTE">
              <div style={{ fontFamily: '"Geist Mono", monospace', fontSize: 10.5, color: '#94A3B8', letterSpacing: '0.06em' }}>
                {(node.rawData.fuente as string) ?? 'derivado'}
              </div>
            </Section>
          </div>

          {/* ─── Footer hint ──────────────────────────────────────── */}
          <div
            style={{
              marginTop: 'auto',
              padding: '14px 22px 16px',
              borderTop: '1px solid rgba(148, 163, 184, 0.14)',
              fontFamily: '"Geist Mono", monospace',
              fontSize: 9.5,
              color: '#475569',
              letterSpacing: '0.18em',
              textTransform: 'uppercase',
              display: 'flex',
              justifyContent: 'space-between',
            }}
          >
            <span>Esc · cerrar</span>
            <span style={{ color: '#64748B' }}>doble-click → expandir</span>
          </div>
        </>
      )}
    </aside>
  )
}

// ─── Sub-componentes ───────────────────────────────────────────────────

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 9,
          color: '#475569',
          letterSpacing: '0.22em',
          marginBottom: 8,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>{children}</div>
    </div>
  )
}

function Connection({ attrs }: { attrs: GraphNodeAttrs }) {
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        fontFamily: '"Geist", system-ui, sans-serif',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: nodeColor(attrs),
          flex: '0 0 7px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#CBD5E1', fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {attrs.label}
        </div>
        <div style={{ color: '#64748B', fontSize: 9.5, fontFamily: '"Geist Mono", monospace', letterSpacing: '0.04em', marginTop: 1 }}>
          {typeLabel(attrs.entityType)}
        </div>
      </div>
    </div>
  )
}

const KIND_LABEL: Record<string, string> = {
  contiene: 'contiene',
  comparte_jurisdiccion: 'co-jurisdicción',
  contrata: 'contrata',
  trabaja_en: 'trabaja en',
  dirige: 'dirige',
  preside: 'preside',
  conflicto_con: 'conflicto',
  comparte_director: 'co-director',
}

function Neighbor({ attrs, kind, weight }: { attrs: GraphNodeAttrs; kind: string; weight: number }) {
  const monto = (attrs.monto as number) || 0
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '7px 0',
        fontFamily: '"Geist", system-ui, sans-serif',
      }}
    >
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: '50%',
          background: nodeColor(attrs),
          flex: '0 0 7px',
        }}
      />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ color: '#CBD5E1', fontSize: 12, lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {attrs.label}
        </div>
        <div style={{ color: '#64748B', fontSize: 9.5, fontFamily: '"Geist Mono", monospace', letterSpacing: '0.04em', marginTop: 1 }}>
          {KIND_LABEL[kind] ?? kind} · {typeLabel(attrs.entityType)}
        </div>
      </div>
      {monto > 0 && (
        <span style={{ color: '#94A3B8', fontFamily: '"Geist Mono", monospace', fontSize: 10.5, fontVariantNumeric: 'tabular-nums', flex: '0 0 auto' }}>
          {fmtARS(monto)}
        </span>
      )}
    </div>
  )
}

function Kpi({
  label,
  value,
  tone = 'default',
  highlight = false,
}: {
  label: string
  value: string
  tone?: 'default' | 'danger' | 'warn'
  highlight?: boolean
}) {
  const color =
    tone === 'danger' ? '#FCA5A5' :
    tone === 'warn' ? '#FCD34D' :
    '#E5E7EB'
  return (
    <div>
      <div
        style={{
          fontFamily: '"Geist Mono", monospace',
          fontSize: 9,
          color: '#475569',
          letterSpacing: '0.22em',
          marginBottom: 6,
          textTransform: 'uppercase',
        }}
      >
        {label}
      </div>
      <div
        style={{
          fontFamily: '"Geist", system-ui, sans-serif',
          fontSize: highlight ? 26 : 18,
          fontWeight: 600,
          color,
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '-0.02em',
          lineHeight: 1.1,
        }}
      >
        {value}
      </div>
    </div>
  )
}
