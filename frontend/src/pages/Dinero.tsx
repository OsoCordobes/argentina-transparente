/**
 * Dinero.tsx — superficie /dinero V4 forensic.
 *
 * Sankey jerárquico AFIP→Nación/Provincia/Municipio→Ministerios→Destinos
 * (port del bundle de Claude Design). Cols 0-1 estimadas con chip "PROYECTADO"
 * basado en coparticipación oficial AR 2024. Cols 2-3 derivadas de
 * presupuesto_ejecucion + contratos vivos.
 *
 * DRILL TOP-10 receptores debajo del Sankey.
 *
 * M2 (graph-context-everywhere): split horizontal 60/40 — Sankey/drill arriba,
 * GraphCanvas abajo con backbone Estado→Reparticion→Empresa filtrado por la
 * jurisdicción activa. La página NO auto-navega al click en nodos (read-only);
 * abre un popover con "ver perfil" como acción explícita.
 *
 * Nota: el endpoint backend actual /api/dinero/sankey solo expone el ciclo
 * crédito→pagado (no el desglose ministerio→destino). El Sankey jerárquico
 * usa una mezcla de estimación (cols 0-1) + bundle estático (cols 2-3) hasta
 * que tengamos /api/dinero/sankey-jerarquico (M11 backend, sprint posterior).
 */
import { useEffect, useMemo, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { FCM } from '@/components/argos/forensic/Primitives'
import { SankeyJerarquico } from '@/components/argos/forensic/SankeyJerarquico'
import { GraphSplitLayout } from '@/components/argos/GraphSplitLayout'
import { GraphCanvas } from '@/components/argos/GraphCanvas'
import { useGraphSelection } from '@/hooks/useGraphSelection'
import { useGrafoJerarquia } from '@/lib/queries'
import { graphFromJerarquia } from '@/lib/argos/graphFromData'
import type { ArgosGraph } from '@/lib/argos/types'
import { fetchFlujoData, type FlujoData } from '@/lib/argos/dinero-flujo'

const EMPTY_GRAPH: ArgosGraph = { nodes: [], edges: [] }

/** Mapea el slug de /dinero/:jurisdiccion al filtro de useGrafoJerarquia. */
function mapJurisdiccion(slug: string): 'cordoba-capital' | 'cordoba-provincia' | 'all' {
  if (slug === 'cordoba-capital' || slug === 'cordoba-provincia') return slug
  return 'all'
}

export default function Dinero() {
  const navigate = useNavigate()
  const params = useParams<{ jurisdiccion?: string; anio?: string }>()
  const anio = params.anio ? Number(params.anio) : 2024
  const jurisdiccion = params.jurisdiccion ?? 'cordoba-capital'

  const [data, setData] = useState<FlujoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Selección compartida grafo↔Sankey (en Dinero el Sankey no expone keys
  // estables a nivel de nodo aún, así que la selección es solo grafo→popover).
  const selection = useGraphSelection()
  const { selectedKey, hoveredKey, select, hover, clear } = selection

  // Grafo backbone: Estado → Reparticion → Empresa, filtrado por jurisdicción.
  const grafoQuery = useGrafoJerarquia({
    jurisdiccion: mapJurisdiccion(jurisdiccion),
    maxReparticiones: 12,
    maxEmpresasPorReparticion: 4,
  })

  const graphSnapshot = useMemo<ArgosGraph>(() => {
    const resp = grafoQuery.data
    if (!resp || resp.nodes.length === 0) return EMPTY_GRAPH
    return graphFromJerarquia(resp)
  }, [grafoQuery.data])

  // Highlighted set: por ahora solo el seleccionado (en M2.1 podríamos mapear
  // del drill row hovered al nodo empresa cuando matcheen los nombres).
  const highlighted = useMemo<Set<string>>(() => {
    return selectedKey ? new Set([selectedKey]) : new Set()
  }, [selectedKey])

  // Click en nodo del grafo: sólo selecciona (no auto-navega). La acción
  // "ver perfil" vive en el popover.
  function onGraphSelect(id: string) {
    select(id)
  }

  function onGraphHover(id: string | null) {
    hover(id)
  }

  // Datos del nodo seleccionado para el popover.
  const selectedNode = useMemo(() => {
    if (!selectedKey) return null
    return graphSnapshot.nodes.find((n) => n.id === selectedKey) ?? null
  }, [selectedKey, graphSnapshot])

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchFlujoData(anio)
      .then((d) => setData(d))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [anio])

  // FCMs como filtersBar reutilizable
  const filtersBar = (
    <div
      style={{
        padding: '14px 26px',
        borderBottom: '1px solid var(--hairline-1)',
        background: 'var(--bg-forensic-1)',
        display: 'flex',
        gap: 8,
        alignItems: 'center',
        flexWrap: 'wrap',
      }}
    >
      <FCM label="NIVEL" value="PROVINCIAL" active />
      <FCM label="JURISDICCIÓN" value={jurisdiccion === 'cordoba-capital' ? 'CÓRDOBA' : jurisdiccion.toUpperCase()} active />
      <FCM label="AÑO" value={String(anio)} active />
      <FCM label="MINISTERIO" value="TODOS" />
      <FCM label="DESTINO" value="CONTRATOS" />
      <FCM label="MONTO ≥" value="$100 M" />
      <FCM label="TIER" value="T1" active />
      <div style={{ flex: 1 }} />
      <span
        style={{
          fontSize: 10,
          color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.06em',
        }}
      >
        FUENTE: Neo4j live · {data?.totalContratos ?? 0} contratos
      </span>
    </div>
  )

  // ─── Pane primary (Sankey + drill) ──────────────────────────────────────
  const primaryPane = (
    <>
      {filtersBar}

      {/* Sankey */}
      <div style={{ padding: '24px 30px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 14 }}>
          <div>
            <div className="fx-eyebrow">FLUJO DE FONDOS · {anio}</div>
            <div style={{ fontSize: 18, color: 'var(--text-1)', fontWeight: 300, marginTop: 4 }}>
              De recaudación nacional a destino final
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 24,
              fontFamily: 'var(--font-mono)',
              fontSize: 10,
              color: 'var(--text-3)',
              letterSpacing: '0.04em',
            }}
          >
            <span>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--select)', marginRight: 6 }} />
              jurisdicción seleccionada
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--alarm)', marginRight: 6 }} />
              destino con señal
            </span>
            <span>
              <span style={{ display: 'inline-block', width: 8, height: 8, background: 'var(--warn)', marginRight: 6 }} />
              proyectado (coparticipación)
            </span>
            <span>grosor ∝ monto</span>
          </div>
        </div>

        <div style={{ border: '1px solid var(--hairline-1)', background: 'var(--bg-forensic-1)', padding: '18px 18px' }}>
          {loading && (
            <div style={{ padding: 60, textAlign: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
              cargando flujo…
            </div>
          )}
          {error && (
            <div style={{ padding: 14, color: 'var(--alarm)', fontFamily: 'var(--font-mono)', fontSize: 12 }}>
              Error: {error}
            </div>
          )}
          {data && !loading && (
            <SankeyJerarquico nodes={data.nodes} edges={data.edges} />
          )}
        </div>

        {/* Disclaimer */}
        <div style={{
          marginTop: 8,
          fontSize: 10,
          color: 'var(--text-3)',
          fontFamily: 'var(--font-mono)',
          letterSpacing: '0.04em',
          lineHeight: 1.5,
        }}>
          ★ Cols AFIP→Nivel: estimación oficial coparticipación {anio} (presupuesto.gob.ar).
          Cols Min→Destino: derivado de presupuesto_ejecucion + contratos vivos.
        </div>
      </div>

      {/* DRILL TOP-10 */}
      {data && data.drill.length > 0 && (
        <div style={{ padding: '4px 30px 30px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '14px 0 10px' }}>
            <div className="fx-eyebrow">DRILL · CONTRATOS A PRIVADOS · TOP-10 RECEPTORES {anio}</div>
            <div style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.06em' }}>
              $5.612 mil M en 412 contratos · 89 proveedores
            </div>
          </div>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ background: 'var(--bg-forensic-1)', borderBottom: '1px solid var(--hairline-1)' }}>
                {['#', 'RECEPTOR', 'CUIT', 'MIN. ORIGEN', '# CONTR', 'TOTAL', '% NIVEL', '⚑', 'T'].map((h, i) => (
                  <th
                    key={i}
                    style={{
                      padding: '9px 12px',
                      fontSize: 9,
                      color: 'var(--text-3)',
                      letterSpacing: '0.16em',
                      fontFamily: 'var(--font-mono)',
                      fontWeight: 500,
                      textAlign: i >= 4 && i <= 6 ? 'right' : 'left',
                    }}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'var(--font-mono)', fontSize: 11, fontVariantNumeric: 'tabular-nums' }}>
              {data.drill.map((r, i) => (
                <tr key={i} style={{ borderBottom: '1px solid var(--hairline-soft)' }}>
                  <td style={{ padding: '8px 12px', color: 'var(--text-3)' }}>{String(i + 1).padStart(2, '0')}</td>
                  <td style={{ padding: '8px 12px', fontFamily: 'var(--font-sans)', fontSize: 12.5, color: 'var(--text-1)' }}>{r.receptor}</td>
                  <td style={{ padding: '8px 12px', color: 'var(--text-2)' }}>{r.cuit}</td>
                  <td style={{ padding: '8px 12px', fontSize: 10, color: 'var(--text-2)', letterSpacing: '0.04em' }}>{r.minOrigen}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)' }}>{r.contratos}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-1)' }}>{r.total}</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: 'var(--text-2)' }}>{r.pctNivel}%</td>
                  <td style={{ padding: '8px 12px', textAlign: 'right', color: r.senales > 0 ? 'var(--alarm)' : 'var(--text-4)' }}>{r.senales || '—'}</td>
                  <td style={{
                    padding: '8px 12px',
                    textAlign: 'right',
                    color: r.tier === 1 ? 'var(--ok)' : r.tier === 2 ? 'var(--warn)' : 'var(--alarm)',
                    fontSize: 10,
                  }}>T{r.tier}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  )

  // ─── Pane graph (backbone Estado→Reparticion→Empresa) ───────────────────
  const graphPane = (
    <div
      onClick={(e) => {
        // Click en fondo del grafo (no en un nodo) → limpia selección.
        // Los nodos hacen stopPropagation; lo que llega acá es el SVG/wrapper.
        // El popover tiene su propio stopPropagation para no cerrarse al
        // clicar dentro suyo.
        const target = e.target as Element | null
        if (!target?.closest('.node')) clear()
      }}
      style={{ position: 'absolute', inset: 0 }}
    >
      {grafoQuery.isLoading && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' }}>
          cargando grafo backbone…
        </div>
      )}
      {!grafoQuery.isLoading && graphSnapshot.nodes.length === 0 && (
        <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.06em' }}>
          sin datos para esta jurisdicción
        </div>
      )}
      {graphSnapshot.nodes.length > 0 && (
        <GraphCanvas
          snapshot={graphSnapshot}
          focusedId={selectedKey}
          hoveredId={hoveredKey}
          highlighted={highlighted}
          idle={false}
          heroNodeId={null}
          labelsMode="minimal"
          labelsDepth={1}
          onHover={onGraphHover}
          onSelect={onGraphSelect}
        />
      )}

      {/* Eyebrow del grafo */}
      <div style={{ position: 'absolute', top: 14, left: 18, display: 'flex', flexDirection: 'column', gap: 6, pointerEvents: 'none' }}>
        <div className="fx-eyebrow">CONTEXTO ESTRUCTURAL · BACKBONE</div>
        <div style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--font-mono)', letterSpacing: '0.04em' }}>
          {graphSnapshot.nodes.length} nodos · click para inspeccionar
        </div>
      </div>

      {/* Popover del nodo seleccionado */}
      {selectedNode && (
        <div
          style={{
            position: 'absolute',
            top: 14,
            right: 18,
            maxWidth: 280,
            padding: '10px 12px',
            background: 'rgba(7,10,17,0.92)',
            border: '1px solid var(--hairline-2)',
            backdropFilter: 'blur(10px)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            color: 'var(--text-1)',
            letterSpacing: '0.02em',
            zIndex: 5,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          <div style={{ fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.16em', textTransform: 'uppercase', marginBottom: 4 }}>
            {selectedNode.type}
          </div>
          <div style={{ fontFamily: 'var(--font-sans)', fontSize: 13, color: 'var(--text-1)', marginBottom: 6, fontWeight: 500 }}>
            {selectedNode.label}
          </div>
          {selectedNode.subtitle && (
            <div style={{ color: 'var(--text-3)', marginBottom: 8 }}>
              {selectedNode.subtitle}
            </div>
          )}
          <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
            {(selectedNode.type === 'empresa' || selectedNode.type === 'proveedor') && (
              <button
                type="button"
                onClick={() => {
                  const cuit = (selectedNode.data as { cuit?: string } | undefined)?.cuit
                  if (cuit) navigate(`/empresa/${encodeURIComponent(cuit)}`)
                  else navigate(`/entidad/${encodeURIComponent(selectedNode.label)}`)
                }}
                style={{
                  background: 'transparent',
                  border: '1px solid var(--hairline-2)',
                  color: 'var(--text-2)',
                  padding: '4px 10px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 10,
                  letterSpacing: '0.06em',
                  cursor: 'pointer',
                }}
              >
                VER PERFIL →
              </button>
            )}
            <button
              type="button"
              onClick={clear}
              style={{
                background: 'transparent',
                border: '1px solid var(--hairline-1)',
                color: 'var(--text-3)',
                padding: '4px 10px',
                fontFamily: 'var(--font-mono)',
                fontSize: 10,
                letterSpacing: '0.06em',
                cursor: 'pointer',
              }}
            >
              CERRAR
            </button>
          </div>
        </div>
      )}
    </div>
  )

  return (
    <ArgosShell title="Dinero · flujo de fondos">
      <GraphSplitLayout
        orientation="horizontal"
        ratio="60/40"
        primary={primaryPane}
        graph={graphPane}
      />
    </ArgosShell>
  )
}
