/**
 * Persona.tsx — Profile canónico de Persona Física.
 *
 * Ruta: /persona/:dni
 * PLAN-UI §3.1 — átomo del UI. Una persona = un DNI = una URL canónica.
 *
 * En esta fase (Stub-4) los datos vienen de fixtures sintéticas
 * (lib/argos/fixtures/personas-stub.ts). En Fase D se enchufa al
 * backend real (`GET /api/persona/:dni`).
 *
 * Secciones (orden top-down):
 *   1. Cabecera (nombre, DNI, CUIT, jurisdicción, badges)
 *   2. Cargos públicos (con vigencia)
 *   3. Direcciones en empresas (con vigencia, link a /empresa/:cuit)
 *   4. Patrimonio declarado (DDJJ por año)
 *   5. Aportes a campaña
 *   6. Señales asociadas (con badge de verificación universal)
 *   7. Fuentes
 *
 * Sin timeline unificado ni grafo 2-hop por ahora — Fase D los integra
 * usando <GraphCanvas> y el sistema de eventos del PLAN-UI §6.
 */
import { useParams, Link } from 'react-router-dom'
import { getPersonaFisicaStub } from '@/lib/argos/fixtures/personas-stub'
import { VerificacionBadge } from '@/components/argos/VerificacionBadge'
import {
  Section, EmptyState, Table, SourceLink, StubFooter,
  rowStyle, cellStyle, linkStyle,
  formatDNI, formatPesos, humanJurisdiccion, humanVigencia, severidadColor,
} from '@/components/argos/ProfileShared'
import type { PersonaFisica } from '@/lib/argos/types'

export default function Persona() {
  const { dni } = useParams<{ dni: string }>()
  if (!dni) return <NotFound dni="(sin parámetro)" />

  const pf = getPersonaFisicaStub(dni)
  if (!pf) return <NotFound dni={dni} />

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
      <Cabecera pf={pf} />
      <Section title="Cargos públicos" emptyText="Sin cargos públicos registrados">
        <CargosTable pf={pf} />
      </Section>
      <Section title="Direcciones en empresas" emptyText="Sin direcciones registradas">
        <DireccionesTable pf={pf} />
      </Section>
      <Section title="Patrimonio declarado (DDJJ)" emptyText="Sin declaraciones juradas registradas">
        <DDJJTable pf={pf} />
      </Section>
      <Section title="Aportes a campañas electorales" emptyText="Sin aportes registrados">
        <AportesTable pf={pf} />
      </Section>
      <Section title="Señales asociadas" emptyText="Sin señales detectadas — perfil sin alertas">
        <SeñalesList pf={pf} />
      </Section>
      <Section title="Fuentes">
        <FuentesList urls={pf.fuentesUrl} dniUrl={pf.fuenteDniUrl} />
      </Section>
      <StubFooter apiHint="GET /api/persona/:dni" fixturesHint="PLAN-UI §3.1" />
    </div>
  )
}

// ─── Cabecera ──────────────────────────────────────────────────────────────────

function Cabecera({ pf }: { pf: PersonaFisica }) {
  return (
    <header style={{ marginBottom: 32, paddingBottom: 24, borderBottom: '1px solid #1f2532' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 12 }}>
        {/* Glifo PF: círculo azul */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: '#3b6db5',
            border: '3px solid #5a8ad6',
            flexShrink: 0,
          }}
          aria-label="Persona Física"
        />
        <div style={{ flex: 1 }}>
          <h1 style={{ fontSize: 26, fontWeight: 700, color: '#eef2f9', margin: 0 }}>
            {pf.apellidoNombre}
          </h1>
          <div style={{ fontSize: 13, color: '#9aa5bb', marginTop: 4, fontFamily: 'ui-monospace, monospace' }}>
            DNI {formatDNI(pf.dni)}
            {pf.cuit && (
              <>
                <span style={{ margin: '0 8px', color: '#3b4456' }}>·</span>
                CUIT {pf.cuit}
              </>
            )}
            {pf.jurisdiccionPrimaria && (
              <>
                <span style={{ margin: '0 8px', color: '#3b4456' }}>·</span>
                <span style={{ color: '#7c8aa3', fontFamily: '-apple-system, sans-serif' }}>
                  {humanJurisdiccion(pf.jurisdiccionPrimaria)}
                </span>
              </>
            )}
          </div>
        </div>
      </div>
      {pf.badges.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {pf.badges.map(b => (
            <span
              key={b}
              style={{
                fontSize: 11,
                padding: '3px 10px',
                borderRadius: 3,
                background: '#171b24',
                color: '#aab4c9',
                border: '1px solid #2c3447',
              }}
            >
              {b}
            </span>
          ))}
        </div>
      )}
    </header>
  )
}

// ─── Tablas por sección ────────────────────────────────────────────────────────

function CargosTable({ pf }: { pf: PersonaFisica }) {
  if (pf.cargosPublicos.length === 0) return <EmptyState text="Sin cargos públicos registrados" />
  return (
    <Table cols={['Jurisdicción', 'Repartición', 'Cargo', 'Vigencia', 'Bruto mensual', 'Fuente']}>
      {pf.cargosPublicos.map((c, i) => (
        <tr key={i} style={rowStyle}>
          <td style={cellStyle}>{humanJurisdiccion(c.jurisdiccion)}</td>
          <td style={cellStyle}>{c.reparticion ?? '—'}</td>
          <td style={cellStyle}>{c.cargo}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>
            {humanVigencia(c.vigenteDesde, c.vigenteHasta)}
          </td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
            {c.brutoMensual ? formatPesos(c.brutoMensual) : '—'}
          </td>
          <td style={cellStyle}>
            <SourceLink url={c.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function DireccionesTable({ pf }: { pf: PersonaFisica }) {
  if (pf.direccionesEmpresas.length === 0) return <EmptyState text="Sin direcciones registradas" />
  return (
    <Table cols={['Empresa', 'CUIT', 'Cargo', 'Vigencia', 'Fuente']}>
      {pf.direccionesEmpresas.map((d, i) => (
        <tr key={i} style={rowStyle}>
          <td style={cellStyle}>
            <Link to={`/empresa/${d.cuitEmpresa}`} style={linkStyle}>
              {d.razonSocial}
            </Link>
          </td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 11 }}>{d.cuitEmpresa}</td>
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

function DDJJTable({ pf }: { pf: PersonaFisica }) {
  if (pf.ddjj.length === 0) return <EmptyState text="Sin declaraciones juradas registradas" />
  return (
    <Table cols={['Año declarado', 'Patrimonio declarado', 'PDF', 'Fuente']}>
      {pf.ddjj.map((d, i) => (
        <tr key={i} style={rowStyle}>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace' }}>{d.anio}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
            {d.montoDeclarado ? formatPesos(d.montoDeclarado) : '—'}
          </td>
          <td style={cellStyle}>
            <SourceLink url={d.pdfUrl} text="Ver PDF" />
          </td>
          <td style={cellStyle}>
            <SourceLink url={d.fuenteUrl} />
          </td>
        </tr>
      ))}
    </Table>
  )
}

function AportesTable({ pf }: { pf: PersonaFisica }) {
  if (pf.aportesCampana.length === 0) return <EmptyState text="Sin aportes registrados" />
  return (
    <Table cols={['Año', 'Partido', 'Tipo', 'Monto', 'Fecha', 'Fuente']}>
      {pf.aportesCampana.map((a, i) => (
        <tr key={i} style={rowStyle}>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace' }}>{a.anioElectoral}</td>
          <td style={cellStyle}>{a.partido}</td>
          <td style={{ ...cellStyle, fontSize: 11, color: '#9aa5bb' }}>{a.tipoAporte ?? '—'}</td>
          <td style={{ ...cellStyle, fontFamily: 'ui-monospace, monospace', fontSize: 12 }}>
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

function SeñalesList({ pf }: { pf: PersonaFisica }) {
  if (pf.señales.length === 0) return <EmptyState text="Sin señales detectadas — perfil sin alertas" />
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {pf.señales.map(s => (
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

function FuentesList({ urls, dniUrl }: { urls: string[]; dniUrl: string | null }) {
  if (urls.length === 0 && !dniUrl) return <EmptyState text="Sin fuentes registradas" />
  return (
    <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, color: '#aab4c9' }}>
      {dniUrl && (
        <li style={{ marginBottom: 4 }}>
          <span style={{ fontSize: 11, color: '#62C7A0', marginRight: 6 }}>[DNI confirmado]</span>
          <SourceLink url={dniUrl} text={dniUrl} />
        </li>
      )}
      {urls.map(u => (
        <li key={u} style={{ marginBottom: 4 }}>
          <SourceLink url={u} text={u} />
        </li>
      ))}
    </ul>
  )
}

// ─── Subcomponentes auxiliares (sólo los específicos de Persona) ──────────────

function NotFound({ dni }: { dni: string }) {
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
      <h1 style={{ fontSize: 22, color: '#eef2f9', margin: 0 }}>Persona no encontrada</h1>
      <p style={{ fontSize: 13, color: '#9aa5bb', maxWidth: 480, textAlign: 'center', lineHeight: 1.5 }}>
        DNI <code style={{ background: '#171b24', padding: '1px 6px', borderRadius: 3, fontFamily: 'ui-monospace, monospace' }}>{dni}</code> no figura en el stub actual.
        Fixtures de prueba disponibles: 24563128, 14289301, 18567892.
      </p>
      <Link to="/" style={{ color: '#5a8ad6', fontSize: 13 }}>← Volver al inicio</Link>
    </div>
  )
}

// Helpers de formato → ahora viven en components/argos/ProfileShared.tsx
