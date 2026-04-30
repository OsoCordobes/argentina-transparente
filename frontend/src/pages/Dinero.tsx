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
 * Nota: el endpoint backend actual /api/dinero/sankey solo expone el ciclo
 * crédito→pagado (no el desglose ministerio→destino). El Sankey jerárquico
 * usa una mezcla de estimación (cols 0-1) + bundle estático (cols 2-3) hasta
 * que tengamos /api/dinero/sankey-jerarquico (M11 backend, sprint posterior).
 */
import { useEffect, useState } from 'react'
import { useParams } from 'react-router-dom'
import { ArgosShell } from '@/components/argos/ArgosShell'
import { FCM } from '@/components/argos/forensic/Primitives'
import { SankeyJerarquico } from '@/components/argos/forensic/SankeyJerarquico'
import { fetchFlujoData, type FlujoData } from '@/lib/argos/dinero-flujo'

export default function Dinero() {
  const params = useParams<{ jurisdiccion?: string; anio?: string }>()
  const anio = params.anio ? Number(params.anio) : 2024
  const jurisdiccion = params.jurisdiccion ?? 'cordoba-capital'

  const [data, setData] = useState<FlujoData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setLoading(true)
    setError(null)
    fetchFlujoData(anio)
      .then((d) => setData(d))
      .catch((e) => setError((e as Error).message))
      .finally(() => setLoading(false))
  }, [anio])

  // FCMs como customRight del header
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

  return (
    <ArgosShell title="Dinero · flujo de fondos">
      {/* Quitamos padding default del body: el filtersBar ocupa todo el ancho */}
      <div style={{ margin: '-24px -32px -48px' }}>
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
      </div>
    </ArgosShell>
  )
}
