/**
 * ActorCard.tsx
 *
 * Componente reusable que renderiza un actor canónico (PersonaFisica o
 * PersonaJuridica) como card pequeño con nombre, identificador, tags, y
 * acción de navegación al Profile correspondiente.
 *
 * PLAN-UI §3 (átomo del UI) + Graph Visual Language §5:
 *   - Persona Física → círculo, color azul
 *   - Persona Jurídica → cuadrado, color naranja
 *
 * Click → navega a `/persona/:dni` o `/empresa/:cuit`.
 *
 * Variantes:
 *   - 'compact': para listados densos. Solo nombre + ID + 1-2 badges.
 *   - 'detailed': para resultados de búsqueda. Nombre + ID + jurisdicción
 *     + todos los badges + indicador de señales.
 */
import { Link } from 'react-router-dom'
import type { PersonaFisica, PersonaJuridica, Actor } from '@/lib/argos/types'

interface Props {
  actor: Actor
  variant?: 'compact' | 'detailed'
}

export function ActorCard({ actor, variant = 'detailed' }: Props) {
  if (actor.tipo === 'persona') {
    return <PersonaFisicaCard pf={actor.data} variant={variant} />
  }
  return <PersonaJuridicaCard pj={actor.data} variant={variant} />
}

// ─── Persona Física ────────────────────────────────────────────────────────────

function PersonaFisicaCard({ pf, variant }: { pf: PersonaFisica; variant: 'compact' | 'detailed' }) {
  const señalesActivas = pf.señales.filter(s => s.estadoVerificacion !== 'descartada')
  const totalGraves = señalesActivas.filter(s => s.severidad === 'grave').length

  return (
    <Link
      to={`/persona/${pf.dni}`}
      style={{
        display: 'block',
        padding: variant === 'compact' ? '8px 10px' : '12px 14px',
        background: '#171b24',
        border: '1px solid #232938',
        borderRadius: 6,
        textDecoration: 'none',
        color: '#dde3ee',
        transition: 'border-color 120ms, background 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#5a8ad6'
        e.currentTarget.style.background = '#1c2230'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#232938'
        e.currentTarget.style.background = '#171b24'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Glifo PF: círculo azul (Graph Visual Language) */}
        <div
          style={{
            width: 28,
            height: 28,
            borderRadius: '50%',
            background: '#3b6db5',
            border: '2px solid #5a8ad6',
            flexShrink: 0,
            marginTop: 2,
          }}
          aria-label="Persona Física"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: variant === 'compact' ? 13 : 14, fontWeight: 600, color: '#eef2f9' }}>
            {pf.apellidoNombre}
          </div>
          <div style={{ fontSize: 11, color: '#9aa5bb', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
            DNI {formatDNI(pf.dni)}
            {pf.cuit && (
              <>
                <span style={{ margin: '0 6px', color: '#3b4456' }}>·</span>
                CUIT {pf.cuit}
              </>
            )}
          </div>
          {variant === 'detailed' && pf.jurisdiccionPrimaria && (
            <div style={{ fontSize: 11, color: '#7c8aa3', marginTop: 4 }}>
              {humanJurisdiccion(pf.jurisdiccionPrimaria)}
            </div>
          )}
          {variant === 'detailed' && pf.badges.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
              {pf.badges.map(b => (
                <span
                  key={b}
                  style={{
                    fontSize: 10,
                    padding: '2px 7px',
                    borderRadius: 3,
                    background: '#232938',
                    color: '#aab4c9',
                    border: '1px solid #2c3447',
                  }}
                >
                  {b}
                </span>
              ))}
            </div>
          )}
        </div>
        {/* Indicador de señales */}
        {totalGraves > 0 && (
          <SignalCounter count={totalGraves} severidad="grave" />
        )}
      </div>
    </Link>
  )
}

// ─── Persona Jurídica ──────────────────────────────────────────────────────────

function PersonaJuridicaCard({ pj, variant }: { pj: PersonaJuridica; variant: 'compact' | 'detailed' }) {
  const señalesActivas = pj.señales.filter(s => s.estadoVerificacion !== 'descartada')
  const totalGraves = señalesActivas.filter(s => s.severidad === 'grave').length
  const totalContratado = pj.contratos.reduce((sum, c) => sum + c.monto, 0)

  return (
    <Link
      to={`/empresa/${pj.cuit}`}
      style={{
        display: 'block',
        padding: variant === 'compact' ? '8px 10px' : '12px 14px',
        background: '#171b24',
        border: '1px solid #232938',
        borderRadius: 6,
        textDecoration: 'none',
        color: '#dde3ee',
        transition: 'border-color 120ms, background 120ms',
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = '#d68a3e'
        e.currentTarget.style.background = '#1c2230'
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = '#232938'
        e.currentTarget.style.background = '#171b24'
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        {/* Glifo PJ: cuadrado naranja (Graph Visual Language) */}
        <div
          style={{
            width: 28,
            height: 28,
            background: '#b56b2d',
            border: '2px solid #d68a3e',
            borderRadius: 3,
            flexShrink: 0,
            marginTop: 2,
          }}
          aria-label="Persona Jurídica"
        />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: variant === 'compact' ? 13 : 14, fontWeight: 600, color: '#eef2f9' }}>
            {pj.razonSocial}
          </div>
          <div style={{ fontSize: 11, color: '#9aa5bb', marginTop: 2, fontFamily: 'ui-monospace, monospace' }}>
            CUIT {pj.cuit}
            {pj.tipoSocietario && (
              <>
                <span style={{ margin: '0 6px', color: '#3b4456' }}>·</span>
                {pj.tipoSocietario}
              </>
            )}
          </div>
          {variant === 'detailed' && pj.domFiscalProvincia && (
            <div style={{ fontSize: 11, color: '#7c8aa3', marginTop: 4 }}>
              Dom. fiscal: {humanProvincia(pj.domFiscalProvincia)}
              {pj.domFiscalLocalidad && pj.domFiscalLocalidad !== pj.domFiscalProvincia && (
                <span> · {pj.domFiscalLocalidad}</span>
              )}
            </div>
          )}
          {variant === 'detailed' && totalContratado > 0 && (
            <div style={{ fontSize: 11, color: '#9aa5bb', marginTop: 4 }}>
              {pj.contratos.length} contrato{pj.contratos.length === 1 ? '' : 's'} · {formatPesos(totalContratado)}
            </div>
          )}
        </div>
        {totalGraves > 0 && (
          <SignalCounter count={totalGraves} severidad="grave" />
        )}
      </div>
    </Link>
  )
}

// ─── Auxiliares ────────────────────────────────────────────────────────────────

function SignalCounter({ count, severidad }: { count: number; severidad: 'grave' | 'moderada' | 'leve' }) {
  const color = severidad === 'grave' ? '#e25656' : severidad === 'moderada' ? '#f5b544' : '#9aa5bb'
  return (
    <div
      style={{
        fontSize: 10,
        padding: '3px 8px',
        borderRadius: 4,
        background: color + '22',
        color,
        border: `1px solid ${color}`,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        marginTop: 2,
      }}
      title={`${count} señal${count === 1 ? '' : 'es'} ${severidad}${count === 1 ? '' : 's'}`}
    >
      ⚠ {count}
    </div>
  )
}

function formatDNI(dni: string): string {
  // Inserta puntos cada 3 dígitos desde la derecha. "24563128" → "24.563.128".
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
