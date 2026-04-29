/**
 * Empresa.tsx — Profile canónico de Persona Jurídica.
 *
 * Ruta: /empresa/:cuit
 * PLAN-UI §3.2 — átomo del UI. Una empresa = un CUIT = una URL canónica.
 *
 * En esta fase (Stub-5) los datos vienen de fixtures sintéticas
 * (lib/argos/fixtures/personas-stub.ts). En Fase D se enchufa al
 * backend real (`GET /api/empresa/:cuit`).
 *
 * Secciones (orden top-down):
 *   1. Cabecera (razón social, CUIT, tipo, domicilios, fecha constitución, estado)
 *   2. Contratos como proveedor
 *   3. Pagos recibidos (cadena de pago)
 *   4. Directores históricos (con vigencia, link a /persona/:dni)
 *   5. Aportes a campañas hechos
 *   6. Transferencias / subsidios recibidos
 *   7. Señales asociadas (con badge de verificación universal)
 *   8. Fuentes
 */
import { useState, useEffect } from 'react'
import { useParams, Link } from 'react-router-dom'
import { getPersonaJuridicaStub } from '@/lib/argos/fixtures/personas-stub'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import { ProfileTwoPane, type ProfileSection } from '@/components/argos/ProfileTwoPane'
import { MiniGraph, type MiniNode, type MiniEdge } from '@/components/argos/MiniGraph'
import {
  EmptyState, Table, SourceLink,
  rowStyle, cellStyle, linkStyle,
  formatDNI, formatPesos, humanJurisdiccion, humanProvincia, humanVigencia, severidadColor,
} from '@/components/argos/ProfileShared'
import type { PersonaJuridica } from '@/lib/argos/types'

const API_URL = import.meta.env.VITE_API_URL ?? 'http://localhost:3001'

export default function Empresa() {
  const { cuit } = useParams<{ cuit: string }>()
  const [graphExpanded, setGraphExpanded] = useState(false)
  const [pj, setPj] = useState<PersonaJuridica | null>(null)
  const [loading, setLoading] = useState(true)
  const [dataSource, setDataSource] = useState<'backend' | 'fixture' | null>(null)

  useEffect(() => {
    if (!cuit) { setLoading(false); return }
    const ac = new AbortController()
    setLoading(true); setDataSource(null)
    fetch(`${API_URL}/api/profile/empresa/${encodeURIComponent(cuit)}`, { signal: ac.signal })
      .then(async r => {
        if (r.status === 404) {
          const stub = getPersonaJuridicaStub(cuit)
          if (stub) { setPj(stub); setDataSource('fixture'); return null }
          throw new Error('Empresa no encontrada')
        }
        if (!r.ok) throw new Error(`HTTP ${r.status}`)
        return r.json()
      })
      .then(data => {
        if (ac.signal.aborted || !data) return
        setPj(data as PersonaJuridica); setDataSource('backend')
      })
      .catch(() => {
        if (ac.signal.aborted) return
        const stub = getPersonaJuridicaStub(cuit)
        if (stub) { setPj(stub); setDataSource('fixture') }
      })
      .finally(() => { if (!ac.signal.aborted) setLoading(false) })
    return () => ac.abort()
  }, [cuit])

  if (!cuit) return <NotFound cuit="(sin parámetro)" />
  if (loading) return <ProfileLoading />
  if (!pj) return <NotFound cuit={cuit} />

  const sections: ProfileSection[] = [
    { id: 'contratos', label: 'Contratos como proveedor', badge: pj.contratos.length, content: <ContratosTable pj={pj} /> },
    { id: 'pagos', label: 'Pagos recibidos', badge: pj.pagos.length, content: <PagosTable pj={pj} /> },
    { id: 'directores', label: 'Directores', badge: pj.directores.length, content: <DirectoresTable pj={pj} /> },
    { id: 'aportes', label: 'Aportes campaña', badge: pj.aportesHechos.length, content: <AportesHechosTable pj={pj} /> },
    { id: 'transferencias', label: 'Transferencias', badge: pj.transferenciasRecibidas.length, content: <TransferenciasTable pj={pj} /> },
    { id: 'senales', label: 'Señales', badge: pj.señales.length, content: <SeñalesList pj={pj} /> },
    { id: 'grafo', label: 'Grafo de relaciones',
      content: <EmpresaGrafo pj={pj} expanded={graphExpanded} onExpand={() => setGraphExpanded(true)} /> },
    { id: 'fuentes', label: 'Fuentes', content: <FuentesList urls={pj.fuentesUrl} /> },
  ]

  // Audit fix F8.5: badge ENTE ESTATAL cuando aplica + mantener CUIT verif.
  const verifBadge = (
    <span style={{ display: 'inline-flex', gap: 6 }}>
      {pj.esEnteEstatal && (
        <span style={{ fontSize: 10, color: '#7da3ff', border: '1px solid #7da3ff',
          padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>
          ★ ENTE ESTATAL
        </span>
      )}
      <span style={{ fontSize: 10, color: '#62C7A0', border: '1px solid #62C7A0',
        padding: '2px 6px', borderRadius: 3, fontWeight: 500 }}>
        ✓ CUIT módulo-11
      </span>
    </span>
  )
  const subParts: string[] = []
  if (pj.tipoSocietario) subParts.push(pj.tipoSocietario)
  if (pj.domFiscalProvincia) subParts.push(humanProvincia(pj.domFiscalProvincia))
  if (pj.estado) subParts.push(`Estado: ${pj.estado}`)

  return (
    <>
      {dataSource === 'fixture' && (
        <div style={{
          background: '#3a2d1d', color: '#F5B544', padding: '8px 16px',
          fontSize: 12, fontFamily: 'ui-monospace, monospace',
          borderBottom: '1px solid #F5B544',
        }}>
          ⚠ DATOS SINTÉTICOS DE PRUEBA — sin conexión con backend o CUIT inexistente.
          La información mostrada NO refleja la realidad y NO debe usarse para denuncias.
        </div>
      )}
      <ProfileTwoPane
        header={{
          title: pj.razonSocial,
          identityLabel: 'CUIT',
          identityValue: pj.cuit,
          glyph: '■',
          glyphColor: '#ff9b5c',
          badge: verifBadge,
          subtitle: subParts.join(' · ') || undefined,
        }}
        sections={sections}
        actorId={pj.cuit}
        actorKind="pj"
      />
    </>
  )
}

function EmpresaGrafo({ pj, expanded, onExpand }: { pj: PersonaJuridica; expanded: boolean; onExpand: () => void }) {
  const focalId = `pj:${pj.cuit}`
  const nodes: MiniNode[] = [
    { id: focalId, kind: 'pj', label: pj.razonSocial, weight: 1 },
    ...pj.directores.slice(0, 6).map(d => ({
      id: `pf:${d.dni}`, kind: 'pf' as const, label: d.apellidoNombre,
      href: `/persona/${d.dni}`, weight: 0.5,
    })),
    ...pj.señales.slice(0, 4).map(s => ({
      id: `sig:${s.id}`, kind: 'signal' as const, label: s.titulo.slice(0, 24),
      weight: s.score / 100,
    })),
    ...pj.contratos.slice(0, 4).map((c, i) => ({
      id: `ctr:${i}`, kind: 'contract' as const, label: c.area || `Contrato ${i + 1}`, weight: 0.3,
    })),
  ]
  const edges: MiniEdge[] = [
    ...pj.directores.slice(0, 6).map(d => ({ source: focalId, target: `pf:${d.dni}` })),
    ...pj.señales.slice(0, 4).map(s => ({ source: focalId, target: `sig:${s.id}` })),
    ...pj.contratos.slice(0, 4).map((_, i) => ({ source: focalId, target: `ctr:${i}` })),
  ]
  return (
    <MiniGraph
      focalId={focalId}
      nodes={nodes}
      edges={edges}
      onExpand={expanded ? undefined : onExpand}
      expanded={expanded}
    />
  )
}

// ─── Cabecera ──────────────────────────────────────────────────────────────────

function Cabecera({ pj }: { pj: PersonaJuridica }) {
  const totalContratado = pj.contratos.reduce((s, c) => s + c.monto, 0)
  return (
    <header style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #1f2532' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        {/* Glifo PJ: cuadrado naranja */}
        <div
          style={{
            width: 56,
            height: 56,
            background: '#b56b2d',
            border: '3px solid #d68a3e',
            borderRadius: 5,
            flexShrink: 0,
          }}
          aria-label="Persona Jurídica"
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#eef2f9', margin: 0 }}>
            {pj.razonSocial}
          </h1>
          <div style={{ fontSize: 13, color: '#9aa5bb', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
            CUIT {pj.cuit}
            {pj.tipoSocietario && (
              <>
                <span style={{ margin: '0 8px', color: '#3b4456' }}>·</span>
                {pj.tipoSocietario}
              </>
            )}
            {pj.fechaConstitucion && (
              <>
                <span style={{ margin: '0 8px', color: '#3b4456' }}>·</span>
                <span style={{ color: '#7c8aa3', fontFamily: '-apple-system, sans-serif' }}>
                  Constituida {pj.fechaConstitucion.slice(0, 4)}
                </span>
              </>
            )}
            {pj.estado && (
              <>
                <span style={{ margin: '0 8px', color: '#3b4456' }}>·</span>
                <span style={{ color: pj.estado === 'activa' ? '#62C7A0' : '#9BA3B4', fontFamily: '-apple-system, sans-serif', fontWeight: 600 }}>
                  {pj.estado}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      {/* Domicilios + métricas resumidas */}
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 24, fontSize: 12, color: '#aab4c9' }}>
        {pj.domFiscalProvincia && (
          <div>
            <span style={{ color: '#7c8aa3', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Dom. fiscal: </span>
            {humanProvincia(pj.domFiscalProvincia)}
            {pj.domFiscalLocalidad && pj.domFiscalLocalidad !== pj.domFiscalProvincia && ` · ${pj.domFiscalLocalidad}`}
          </div>
        )}
        {pj.actividadPrincipal && (
          <div>
            <span style={{ color: '#7c8aa3', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Actividad: </span>
            {pj.actividadPrincipal}
          </div>
        )}
        {totalContratado > 0 && (
          <div>
            <span style={{ color: '#7c8aa3', textTransform: 'uppercase', fontSize: 10, letterSpacing: '0.05em' }}>Total contratado: </span>
            <span style={{ fontFamily: 'ui-monospace, monospace', fontWeight: 600, color: '#eef2f9' }}>
              {formatPesos(totalContratado)}
            </span>
            <span style={{ color: '#7c8aa3' }}> · {pj.contratos.length} contrato{pj.contratos.length === 1 ? '' : 's'}</span>
          </div>
        )}
      </div>
    </header>
  )
}

// ─── Tablas por sección ────────────────────────────────────────────────────────

function ContratosTable({ pj }: { pj: PersonaJuridica }) {
  if (pj.contratos.length === 0) return <EmptyState text="Sin contratos registrados como proveedor" />
  return (
    <Table cols={['Año', 'Jurisdicción', 'Programa / partida', 'Tipo', 'Monto', 'Fuente']}>
      {pj.contratos.map(c => (
        <tr key={c.hash} style={rowStyle}>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace' }}>{c.anio}</td>
          <td style={cellStyle}>{humanJurisdiccion(c.jurisdiccion)}</td>
          <td style={{ ...cellStyle, fontSize: 12 }}>
            {c.programaPresupuestario ?? <span style={{ color: '#5a6478', fontStyle: 'italic' }}>sin partida (Fase B)</span>}
            {c.partidaPresupuestaria && (
              <div style={{ fontSize: 10, color: '#7c8aa3', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
                Partida {c.partidaPresupuestaria}
              </div>
            )}
            <div style={{ fontSize: 10, color: '#7c8aa3', marginTop: 2 }}>{c.area}</div>
          </td>
          <td style={{ ...cellStyle, fontSize: 11 }}>{c.tipo}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
            {formatPesos(c.monto)}
          </td>
          <td style={cellStyle}>
            <SourceLink url={c.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function PagosTable({ pj }: { pj: PersonaJuridica }) {
  if (pj.pagos.length === 0) return <EmptyState text="Sin pagos registrados (cadena de pago se completa en Fase B)" />
  return (
    <Table cols={['Fecha pago', 'Monto', 'Contrato origen', 'Fuente']}>
      {pj.pagos.map((p, i) => (
        <tr key={i} style={rowStyle}>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>{p.fechaPago}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
            {formatPesos(p.monto)}
          </td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
            {p.contratoHash ? (
              <Link to={`/contrato/${p.contratoHash}`} style={linkStyle}>
                {p.contratoHash.slice(0, 16)}…
              </Link>
            ) : '—'}
          </td>
          <td style={cellStyle}>
            <SourceLink url={p.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function DirectoresTable({ pj }: { pj: PersonaJuridica }) {
  if (pj.directores.length === 0) return <EmptyState text="Sin directores registrados" />
  return (
    <Table cols={['Director', 'DNI', 'Cargo', 'Vigencia', 'Fuente']}>
      {pj.directores.map((d, i) => (
        <tr key={i} style={rowStyle}>
          <td style={cellStyle}>
            <Link to={`/persona/${d.dni}`} style={linkStyle}>
              {d.apellidoNombre}
            </Link>
          </td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{formatDNI(d.dni)}</td>
          <td style={cellStyle}>{d.tipoCargo}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
            {humanVigencia(d.vigenteDesde, d.vigenteHasta)}
          </td>
          <td style={cellStyle}>
            <SourceLink url={d.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function AportesHechosTable({ pj }: { pj: PersonaJuridica }) {
  if (pj.aportesHechos.length === 0) return <EmptyState text="Sin aportes a campañas registrados" />
  return (
    <Table cols={['Año', 'Partido', 'Tipo', 'Monto', 'Fecha', 'Fuente']}>
      {pj.aportesHechos.map((a, i) => (
        <tr key={i} style={rowStyle}>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace' }}>{a.anioElectoral}</td>
          <td style={cellStyle}>{a.partido}</td>
          <td style={{ ...cellStyle, fontSize: 11, color: '#9aa5bb' }}>{a.tipoAporte ?? '—'}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
            {a.monto ? formatPesos(a.monto) : '—'}
          </td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{a.fechaAporte ?? '—'}</td>
          <td style={cellStyle}>
            <SourceLink url={a.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function TransferenciasTable({ pj }: { pj: PersonaJuridica }) {
  if (pj.transferenciasRecibidas.length === 0) return <EmptyState text="Sin transferencias o subsidios recibidos" />
  return (
    <Table cols={['Año', 'Tipo', 'Programa', 'Monto', 'Fuente']}>
      {pj.transferenciasRecibidas.map((t, i) => (
        <tr key={i} style={rowStyle}>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace' }}>{t.anio}</td>
          <td style={{ ...cellStyle, fontSize: 11, color: '#9aa5bb' }}>{t.tipo}</td>
          <td style={cellStyle}>{t.programa ?? '—'}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12, fontWeight: 600 }}>
            {formatPesos(t.monto)}
          </td>
          <td style={cellStyle}>
            <SourceLink url={t.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function SeñalesList({ pj }: { pj: PersonaJuridica }) {
  if (pj.señales.length === 0) return <EmptyState text="Sin señales detectadas — empresa sin alertas" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pj.señales.map(s => (
        <article
          key={s.id}
          style={{
            padding: 14,
            background: '#171b24',
            border: `1px solid ${severidadColor(s.severidad)}33`,
            borderLeft: `4px solid ${severidadColor(s.severidad)}`,
            borderRadius: 6,
          }}
        >
          <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12, marginBottom: 8 }}>
            <h3 style={{ fontSize: 14, fontWeight: 600, color: '#eef2f9', margin: 0, flex: 1 }}>
              {s.titulo}
            </h3>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontSize: 11, color: '#9aa5bb', fontFamily: 'ui-monospace, monospace' }}>
                Score {s.score}
              </span>
              <VerificacionBadge
                estado={s.estadoVerificacion}
                verificadoPor={s.verificadoPor}
                verificadoEn={s.verificadoEn}
              />
            </div>
          </header>
          <p style={{ fontSize: 13, color: '#aab4c9', margin: '0 0 10px 0', lineHeight: 1.5 }}>
            {s.resumen}
          </p>
          <details style={{ fontSize: 12 }}>
            <summary style={{ cursor: 'pointer', color: '#7c8aa3', userSelect: 'none' }}>
              Evidencia ({s.evidencia.length} item{s.evidencia.length === 1 ? '' : 's'})
            </summary>
            <ul style={{ margin: '8px 0 0 0', paddingLeft: 18, color: '#aab4c9' }}>
              {s.evidencia.map((e, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {e.descripcion}{' '}
                  <SourceLink url={e.fuenteUrl} />
                </li>
              ))}
            </ul>
            <div style={{ marginTop: 10, padding: '8px 0', borderTop: '1px solid #232938' }}>
              <div style={{ fontSize: 11, color: '#7c8aa3', marginBottom: 4 }}>Marco legal:</div>
              <ul style={{ margin: 0, paddingLeft: 18, color: '#aab4c9', fontSize: 12 }}>
                {s.legal.articulos.map((a, i) => <li key={i}>{a}</li>)}
              </ul>
              <div style={{ fontSize: 11, color: '#7c8aa3', marginTop: 8 }}>
                Denunciar ante: {s.legal.denunciarAnte.join(' · ')}
              </div>
            </div>
          </details>
        </article>
      ))}
    </div>
  )
}

function FuentesList({ urls }: { urls: string[] }) {
  if (urls.length === 0) return <EmptyState text="Sin fuentes registradas" />
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#aab4c9' }}>
      {urls.map(u => (
        <li key={u} style={{ marginBottom: 4 }}>
          <SourceLink url={u} text={u} />
        </li>
      ))}
    </ul>
  )
}

// ─── Subcomponentes auxiliares (sólo los específicos de Empresa) ──────────────

function ProfileLoading() {
  return (
    <div style={{
      background: '#0d1117', color: '#9BA3B4', minHeight: '100vh',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontSize: 13,
    }}>
      Cargando perfil…
    </div>
  )
}

function NotFound({ cuit }: { cuit: string }) {
  return (
    <div
      style={{
        background: '#0d1117',
        color: '#dde3ee',
        minHeight: '100vh',
        padding: '24px 28px',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 16,
      }}
    >
      <h1 style={{ fontSize: 22, color: '#eef2f9', margin: 0 }}>Empresa no encontrada</h1>
      <p style={{ fontSize: 13, color: '#9aa5bb', maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
        CUIT <code style={{ background: '#171b24', padding: '1px 6px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' }}>{cuit}</code> no figura en el stub actual.
        Fixtures de prueba disponibles: 30-71234567-1, 30-68923451-4, 33-50012345-7.
      </p>
      <Link to="/" style={{ color: '#5a8ad6', fontSize: 13 }}>← Volver al inicio</Link>
    </div>
  )
}

// Helpers de formato → ahora viven en components/argos/ProfileShared.tsx
