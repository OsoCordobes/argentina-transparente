import type { Contrato, Señal, Expediente } from '../types'

// Generador de expedientes de transparencia
export function generarExpediente(
  municipio: string,
  periodo: string,
  contratos: Contrato[],
  señales: Señal[]
): Expediente {
  const montoTotal = contratos.reduce((sum, c) => sum + c.monto, 0)

  return {
    municipio,
    periodo,
    generadoEn: new Date().toISOString(),
    resumenEjecutivo: 'En construcción',
    señales,
    datosBase: {
      totalContratos: contratos.length,
      montoTotal,
      topProveedores: [],
      tiposProceso: [],
    },
    fuentes: [],
  }
}
