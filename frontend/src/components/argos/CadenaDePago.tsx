/**
 * CadenaDePago.tsx — W5: breadcrumb vertical de la cadena de gasto público.
 *
 * Muestra el camino completo del dinero desde el Estado hasta la
 * Persona Física beneficiaria, anotando en cada paso:
 *   - tipo de nodo (Estado / Repartición / Programa / Contrato / Empresa / Persona)
 *   - tier de la fuente (TierBadge) — de dónde viene el dato
 *   - tier de identidad cuando aplica (IdentityBadge) — qué tan firme es el match
 *   - monto y fecha si aplica
 *
 * Diseño:
 *   Cada paso = card vertical con número de paso, icono, nombre,
 *   metadatos relevantes, y línea conectora hacia abajo.
 *   El último paso no tiene línea conectora.
 *
 * Cumple CLAUDE.md §5 ("Reglas para hallazgos"): cada paso lleva
 * fuente_url para reconstruir el dato desde la fuente original.
 */

import { TierBadge } from './TierBadge'
import { IdentityBadge } from './IdentityBadge'

export type PasoTipo =
  | 'estado'
  | 'reparticion'
  | 'programa'
  | 'contrato'
  | 'empresa'
  | 'persona'

export interface Paso {
  tipo: PasoTipo
  nombre: string                       // "Provincia de Córdoba", "Min. Salud", "ROGGIO SA"…
  detalle?: string                     // opcional: "Resolución 305/14", "CUIT 30-…"
  monto?: number | null                // monto en ARS si aplica
  fecha?: string | null                // ISO o "2024-03"
  fuenteTier?: 0 | 1 | 2 | 3 | 4 | 5   // tier de la FUENTE del dato
  fuenteSource?: string                // texto humano para tooltip
  fuenteUrl?: string                   // URL a la fuente original (CLAUDE.md §5)
  identidadTier?: 1 | 2 | 3 | 4 | 5    // tier del match de identidad si aplica
  identidadScore?: number              // 0-100
}

interface Props {
  pasos: Paso[]
  className?: string
}

const ICONOS: Record<PasoTipo, string> = {
  estado: '🏛',
  reparticion: '📋',
  programa: '📊',
  contrato: '📄',
  empresa: '🏢',
  persona: '👤',
}

const ETIQUETAS: Record<PasoTipo, string> = {
  estado: 'Estado',
  reparticion: 'Repartición',
  programa: 'Programa',
  contrato: 'Contrato',
  empresa: 'Empresa',
  persona: 'Persona física',
}

function formatARS(n: number | null | undefined): string {
  if (n == null) return ''
  return '$' + Math.round(n).toLocaleString('es-AR')
}

export function CadenaDePago({ pasos, className }: Props) {
  if (!pasos || pasos.length === 0) {
    return (
      <div
        className={className}
        style={{ fontSize: 12, color: '#9BA3B4', fontStyle: 'italic' }}
      >
        Cadena de pago no reconstruida (datos insuficientes).
      </div>
    )
  }

  return (
    <ol
      className={className}
      style={{
        listStyle: 'none',
        padding: 0,
        margin: 0,
        position: 'relative',
      }}
      aria-label="Cadena de pago — ruta del gasto"
    >
      {pasos.map((paso, idx) => {
        const esUltimo = idx === pasos.length - 1
        return (
          <li
            key={idx}
            style={{
              position: 'relative',
              paddingLeft: 36,
              paddingBottom: esUltimo ? 0 : 18,
            }}
          >
            {/* Línea vertical conectora */}
            {!esUltimo && (
              <div
                aria-hidden="true"
                style={{
                  position: 'absolute',
                  left: 13,
                  top: 28,
                  bottom: 0,
                  width: 2,
                  background: '#2A3142',
                }}
              />
            )}
            {/* Bullet con número de paso */}
            <div
              aria-hidden="true"
              style={{
                position: 'absolute',
                left: 0,
                top: 4,
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: '#1A1F2E',
                border: '2px solid #2A3142',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 14,
              }}
            >
              {ICONOS[paso.tipo]}
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <div style={{ display: 'flex', alignItems: 'baseline', flexWrap: 'wrap', gap: 6 }}>
                <span style={{ fontSize: 10, color: '#9BA3B4', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  Paso {idx + 1} · {ETIQUETAS[paso.tipo]}
                </span>
                {paso.fuenteTier != null && paso.fuenteSource && (
                  <TierBadge tier={paso.fuenteTier} source={paso.fuenteSource} />
                )}
                {paso.identidadTier != null && (
                  <IdentityBadge tier={paso.identidadTier} score={paso.identidadScore} />
                )}
              </div>

              <div style={{ fontSize: 14, fontWeight: 500, color: '#E8ECF5' }}>
                {paso.fuenteUrl
                  ? <a href={paso.fuenteUrl} target="_blank" rel="noopener noreferrer" style={{ color: '#E8ECF5', textDecoration: 'underline' }}>{paso.nombre}</a>
                  : paso.nombre}
              </div>

              {(paso.detalle || paso.monto || paso.fecha) && (
                <div style={{ fontSize: 11, color: '#9BA3B4' }}>
                  {paso.detalle && <span>{paso.detalle}</span>}
                  {paso.detalle && (paso.monto || paso.fecha) && <span> · </span>}
                  {paso.monto != null && <span>{formatARS(paso.monto)}</span>}
                  {paso.monto != null && paso.fecha && <span> · </span>}
                  {paso.fecha && <span>{paso.fecha}</span>}
                </div>
              )}
            </div>
          </li>
        )
      })}
    </ol>
  )
}
