/**
 * V4 Forensic — type definitions
 * Compartidos por todos los primitivos y surfaces forenses.
 */

export type Severity = 'grave' | 'moderada' | 'baja'

export type Kind = 'PF' | 'PJ' | 'JR'

export type Tier = 1 | 2 | 3

/** Estado de verificación de una señal */
export type EstadoSenal = 'pending' | 'review' | 'verified' | 'rejected'

/** Tono de un nodo del Sankey jerárquico de Dinero */
export type SankeyTone = 'select' | 'alarm' | 'warn' | 'neutral'

/** Indicador de un panel forense (grid 2x2) */
export interface IndicadorForense {
  lbl: string
  val: string
  sub?: string
}

/** Relación de una entidad (lista vertical en NodeDetailPanel) */
export interface RelacionForense {
  kind: Kind
  name: string
  rel: string
  tier?: Tier
  /** id navegable al click (ej. persona:DNI o empresa:CUIT) */
  targetId?: string
}
