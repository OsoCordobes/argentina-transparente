// ─── Signal Detectors — all 14 plugins ───────────────────────────────────────
// Each file = one detector implementing SignalDetector interface.
// Register all detectors here and import this index in the engine runner.

export { prorrogasExcesivas }          from './prorrogas_excesivas'
export { concentracionProveedor }      from './concentracion_proveedor'
export { contratacionesDirectas }      from './contrataciones_directas'
export { monopolioRubro }              from './monopolio_rubro'
export { servicioSinHistorial }        from './servicio_sin_historial'
export { fraccionamientoAvanzado }     from './fraccionamiento_avanzado'
export { gastoFinEjercicio }           from './gasto_fin_ejercicio'
export { proveedorCronico }            from './proveedor_cronico'
export { empresaNueva }                from './empresa_nueva'
export { empresaSinEmpleados }         from './empresa_sin_empleados'
export { directoresCompartidos }       from './directores_compartidos'
export { rotacionCoordinada }          from './rotacion_coordinada'
export { adendaPostajudicacion }       from './adenda_postajudicacion'
export { redDeEmpresas }               from './red_de_empresas'

import type { SignalDetector } from '../types'
import { prorrogasExcesivas }          from './prorrogas_excesivas'
import { concentracionProveedor }      from './concentracion_proveedor'
import { contratacionesDirectas }      from './contrataciones_directas'
import { monopolioRubro }              from './monopolio_rubro'
import { servicioSinHistorial }        from './servicio_sin_historial'
import { fraccionamientoAvanzado }     from './fraccionamiento_avanzado'
import { gastoFinEjercicio }           from './gasto_fin_ejercicio'
import { proveedorCronico }            from './proveedor_cronico'
import { empresaNueva }                from './empresa_nueva'
import { empresaSinEmpleados }         from './empresa_sin_empleados'
import { directoresCompartidos }       from './directores_compartidos'
import { rotacionCoordinada }          from './rotacion_coordinada'
import { adendaPostajudicacion }       from './adenda_postajudicacion'
import { redDeEmpresas }               from './red_de_empresas'

/**
 * Default set of all detectors in suggested execution order.
 * Pass a subset to runEngine() to selectively enable signals.
 */
export const ALL_DETECTORS: SignalDetector[] = [
  // Procedimiento
  prorrogasExcesivas,
  contratacionesDirectas,
  fraccionamientoAvanzado,
  gastoFinEjercicio,
  adendaPostajudicacion,

  // Concentración
  concentracionProveedor,
  monopolioRubro,
  servicioSinHistorial,
  proveedorCronico,

  // Entidades (requieren datos de registro empresarial)
  empresaNueva,
  empresaSinEmpleados,

  // Red (requieren Neo4j con directores cargados)
  directoresCompartidos,
  redDeEmpresas,

  // Comportamiento coordinado
  rotacionCoordinada,
]
