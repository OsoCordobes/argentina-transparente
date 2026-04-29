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
import { useParams, Link } from 'react-router-dom'
import { getPersonaJuridicaStub } from '@/lib/argos/fixtures/personas-stub'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import type { PersonaJuridica } from '@/lib/argos/types'

export default function Empresa() {
  const { cuit } = useParams<{ cuit: string }>()
  if (!cuit) return <NotFound cuit="(sin parámetro)" />

  const pj = getPersonaJuridicaStub(cuit)
  if (!pj) return <NotFound cuit={cuit} />

  return (
    <div
      style={{
        background: '#0d1117',
        color: '#dde3ee',
        minHeight: '100vh',
        padding: '24px 28px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
      }}
    >
      <Cabecera pj={pj} />
      <Section title="Contratos como proveedor">
        <ContratosTable pj={pj} />
      </Section>
      <Section title="Pagos recibidos (cadena de pago)">
        <PagosTable pj={pj} />
      </Section>
      <Section title="Directores históricos">
        <DirectoresTable pj={pj} />
      </Section>
      <Section title="Aportes a campañas hechos">
        <AportesHechosTable pj={pj} />
      </Section>
      <Section title="Transferencias / subsidios recibidos">
        <TransferenciasTable pj={pj} />
      </Section>
      <Section title="Señales asociadas">
        <SeñalesList pj={pj} />
      </Section>
      <Section title="Fuentes">
        <FuentesList urls={pj.fuentesUrl} />
      </Section>
      <StubFooter />
    </div>
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

// ─── Secciones ─────────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section style={{ marginBottom: 28 }}>
      <h2 style={{ fontSize: 13, fontWeight: 600, color: '#7c8aa3', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 12px 0' }}>
        {title}
      </h2>
      {children}
    </section>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div style={{ fontSize: 13, color: '#5a6478', padding: '16px 0', fontStyle: 'italic' }}>
      {text}
    </div>
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

// ─── Subcomponentes auxiliares ────────────────────────────────────────────────

function Table({ cols, children }: { cols: string[]; children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto', background: '#171b24', border: '1px solid #232938', borderRadius: 6 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr>
            {cols.map(c => (
              <th
                key={c}
                style={{
                  textAlign: 'left',
                  padding: '10px 12px',
                  borderBottom: '1px solid #232938',
                  fontSize: 11,
                  textTransform: 'uppercase',
                  letterSpacing: '0.04em',
                  color: '#7c8aa3',
                  fontWeight: 600,
                }}
              >
                {c}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

const rowStyle: React.CSSProperties = { borderBottom: '1px solid #1c2230' }
const cellStyle: React.CSSProperties = { padding: '10px 12px', color: '#dde3ee', verticalAlign: 'top' }
const linkStyle: React.CSSProperties = { color: '#5a8ad6', textDecoration: 'none', fontWeight: 500 }

function SourceLink({ url, text }: { url: string; text?: string }) {
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer noopener"
      style={{ color: '#5a8ad6', textDecoration: 'none', fontSize: 11, fontFamily: 'ui-monospace, monospace' }}
    >
      {text ?? '↗ ver'}
    </a>
  )
}

function StubFooter() {
  return (
    <footer style={{ marginTop: 40, padding: '16px 0', borderTop: '1px solid #1f2532', fontSize: 11, color: '#5a6478' }}>
      ⓘ Datos sintéticos del stub Profile (PLAN-UI §3.2, fixtures de Stub-2). En Fase D se reemplazan por
      <code style={{ margin: '0 4px', padding: '1px 4px', background: '#171b24', borderRadius: 2 }}>GET /api/empresa/:cuit</code>
      cuando termine el backfill de Fase A4-A5 + cadena de pago de Fase B.
    </footer>
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

// ─── Helpers de formato ────────────────────────────────────────────────────────

function formatDNI(dni: string): string {
  return dni.replace(/(\d)(?=(\d{3})+$)/g, '$1.')
}

function formatPesos(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)} M`
  if (n >= 1_000) return `$${(n / 1_000).toFixed(0)} K`
  return `$${n.toLocaleString('es-AR')}`
}

function humanJurisdiccion(j: string): string {
  const map: Record<string, string> = {
    'cordoba-capital': 'Córdoba Capital',
    'cordoba-provincia': 'Provincia de Córdoba',
    'nacion': 'Gobierno Nacional',
  }
  return map[j] ?? j
}

function humanProvincia(p: string): string {
  const map: Record<string, string> = {
    'CORDOBA': 'Córdoba',
    'CIUDAD AUTONOMA DE BUENOS AIRES': 'CABA',
    'BUENOS AIRES': 'Buenos Aires',
  }
  return map[p] ?? p
}

function humanVigencia(desde: string | null, hasta: string | null): string {
  if (!desde && !hasta) return '—'
  const d = desde ? formatFecha(desde) : '?'
  const h = hasta ? formatFecha(hasta) : 'vigente'
  return `${d} → ${h}`
}

function formatFecha(iso: string): string {
  if (/^\d{4}$/.test(iso)) return iso
  try {
    const d = new Date(iso)
    return d.toLocaleDateString('es-AR', { year: 'numeric', month: 'short' })
  } catch {
    return iso
  }
}

function severidadColor(s: 'grave' | 'moderada' | 'leve'): string {
  return s === 'grave' ? '#e25656' : s === 'moderada' ? '#f5b544' : '#9aa5bb'
}
