// sociedades-del-estado-arg.ts — Catálogo curado de Sociedades del Estado.
//
// Lista de CUITs de organismos públicos argentinos que SÍ tienen forma
// societaria (SA, SAU) pero son de propiedad estatal y sus directores
// son nombrados por el Poder Ejecutivo. Diferencia con un ente estatal
// puro (ministerio): tienen responsabilidad societaria adicional bajo
// Ley 19.550, no solo administrativa.
//
// Fuente: investigación legal (CCyC arts. 145-148 + Ley 20.705 +
// verificación caso por caso vs argentina.gob.ar).
//
// Esta lista es mantenida manualmente. Para una herramienta de
// transparencia de producción se debería complementar con scraping
// de SIDIF/Presupuesto Abierto + AFIP Constancia de Inscripción.

export interface EnteEstatalConocido {
  cuit: string
  nombre: string
  jurisdiccion: 'nacional' | 'provincial' | 'municipal'
  /** Tipo del ente:
   *  - 'sociedad_estado' — SA estatal (YPF, ARSAT)
   *  - 'banco_publico'   — Banco Nación, BancorPciaBA
   *  - 'ministerio'      — Ministerio nacional/provincial
   *  - 'municipio'       — Municipalidad
   *  - 'provincia'       — Provincia / Estado
   *  - 'universidad'     — Universidad Nacional/Provincial
   *  - 'organismo_autarquico' — AFIP, ANSES, INTA
   */
  tipo: 'sociedad_estado' | 'banco_publico' | 'ministerio' | 'municipio'
        | 'provincia' | 'universidad' | 'organismo_autarquico'
}

export const SOCIEDADES_DEL_ESTADO_ARG: EnteEstatalConocido[] = [
  // Sociedades del Estado nacional con forma SA
  { cuit: '30-54668997-9', nombre: 'YPF S.A.', jurisdiccion: 'nacional', tipo: 'sociedad_estado' },
  { cuit: '30-71044371-7', nombre: 'ARSAT (Empresa Argentina de Soluciones Satelitales)', jurisdiccion: 'nacional', tipo: 'sociedad_estado' },
  { cuit: '30-70956507-5', nombre: 'AySA (Agua y Saneamientos Argentinos)', jurisdiccion: 'nacional', tipo: 'sociedad_estado' },
  { cuit: '30-50000900-8', nombre: 'Aerolíneas Argentinas S.A.', jurisdiccion: 'nacional', tipo: 'sociedad_estado' },
  { cuit: '30-70801071-5', nombre: 'Correo Argentino', jurisdiccion: 'nacional', tipo: 'sociedad_estado' },
  // Bancos públicos
  { cuit: '30-50001091-2', nombre: 'Banco de la Nación Argentina', jurisdiccion: 'nacional', tipo: 'banco_publico' },
  // Organismos autárquicos
  { cuit: '33-69345023-9', nombre: 'AFIP (Administración Federal de Ingresos Públicos)', jurisdiccion: 'nacional', tipo: 'organismo_autarquico' },
  // Ministerios + estados
  { cuit: '30-54667186-9', nombre: 'Ministerio de Economía de la Nación', jurisdiccion: 'nacional', tipo: 'ministerio' },
  { cuit: '30-99922856-0', nombre: 'Municipalidad de Córdoba', jurisdiccion: 'municipal', tipo: 'municipio' },
  { cuit: '30-99925343-0', nombre: 'Provincia de Córdoba', jurisdiccion: 'provincial', tipo: 'provincia' },
  // Universidades
  { cuit: '30-54667062-3', nombre: 'Universidad Nacional de Córdoba (UNC)', jurisdiccion: 'nacional', tipo: 'universidad' },
  { cuit: '30-54666656-1', nombre: 'Universidad Tecnológica Nacional (UTN)', jurisdiccion: 'nacional', tipo: 'universidad' },
]

/** Set de CUITs para lookup O(1) en runtime. */
export const CUITS_ENTES_ESTATALES = new Set(SOCIEDADES_DEL_ESTADO_ARG.map(s => s.cuit))

/** SQL VALUES list para usar en WHERE cuit IN (...) o JOIN. */
export const SQL_CUITS_VALUES = SOCIEDADES_DEL_ESTADO_ARG
  .map(s => `('${s.cuit}', '${s.nombre.replace(/'/g, "''")}', '${s.jurisdiccion}', '${s.tipo}')`)
  .join(', ')
