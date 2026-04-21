import { v4 as uuidv4 } from 'uuid'
import type { Hallazgo, CategoriaSenal, SeveridadHallazgo } from '@argos/model'

export const ORGANISMOS_DENUNCIA = [
  'Fiscalía de Instrucción de Turno',
  'Tribunal de Cuentas de Córdoba (tribunaldecuentas.cba.gov.ar)',
  'Defensoría del Pueblo de Córdoba (defensoria.cba.gov.ar)',
  'Fiscalía de Estado de Córdoba (fiscaliaestado.cba.gov.ar)',
  'Ministerio Público Fiscal — PROCELAC (fiscales.gob.ar)',
  'Oficina Anticorrupción (anticorrupcion.gob.ar)',
]

export function ars(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency', currency: 'ARS', maximumFractionDigits: 0,
  }).format(n)
}

export interface HallazgoOpts {
  señalId:     string
  tipologia:   string
  categoria:   CategoriaSenal
  score:       number
  titulo:      string
  resumen:     string
  severidad:   SeveridadHallazgo
  evidencia:   { descripcion: string; fuente_url: string }[]
  articulos:   string[]
  denunciarAnte?: string[]
  tipologia_ti?: string
  municipioId: string
  periodo:     string
  entidades?:  { tipo: 'Empresa' | 'Persona' | 'Contrato' | 'Organismo'; id: string; nombre: string }[]
}

export function makeHallazgo(opts: HallazgoOpts): Hallazgo {
  return {
    id:          uuidv4(),
    señal_id:    opts.señalId,
    tipologia:   opts.tipologia,
    categoria:   opts.categoria,
    score:       Math.min(100, Math.max(0, opts.score)),
    titulo:      opts.titulo,
    resumen:     opts.resumen,
    severidad:   opts.severidad,
    entidades_afectadas: opts.entidades ?? [],
    evidencia:   opts.evidencia,
    legal: {
      articulos:      opts.articulos,
      severidad:      opts.severidad,
      denunciar_ante: opts.denunciarAnte ?? ORGANISMOS_DENUNCIA,
      tipologia_ti:   opts.tipologia_ti,
    },
    municipio_id: opts.municipioId,
    periodo:      opts.periodo,
    generado_en:  new Date(),
  }
}

export function montoTotal(contratos: { monto: number }[]): number {
  return contratos.reduce((s, c) => s + c.monto, 0)
}

export function agruparPorProveedor<T extends { proveedor_normalizado: string; proveedor: string }>(
  items: T[],
): Map<string, T[]> {
  const map = new Map<string, T[]>()
  for (const item of items) {
    const key = item.proveedor_normalizado || item.proveedor.trim().toUpperCase()
    if (!map.has(key)) map.set(key, [])
    map.get(key)!.push(item)
  }
  return map
}

export function periodoLabel(desde: number, hasta: number): string {
  return desde === hasta ? String(desde) : `${desde}–${hasta}`
}
