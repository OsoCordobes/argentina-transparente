export interface Contrato {
  tipo: string
  proveedor: string
  area: string
  descripcion: string
  monto: number
  anio: number
  fuenteUrl: string
}

export interface Señal {
  tipologia: string
  score: number
  titulo: string
  resumen: string
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: {
    articulos: string[]
    severidad: 'grave' | 'moderada' | 'leve'
    denunciarAnte: string[]
  }
}

export interface Expediente {
  municipio: string
  periodo: string
  generadoEn: string
  resumenEjecutivo: string
  señales: Señal[]
  datosBase: {
    totalContratos: number
    montoTotal: number
    topProveedores: {
      nombre: string
      monto: number
      porcentaje: number
      afip?: {
        cuit: string
        esEmpleador: boolean
        encontrado: boolean
        fuenteUrl: string
      }
    }[]
    tiposProceso: { tipo: string; cantidad: number; monto: number }[]
  }
  fuentes: { url: string; descripcion: string; fechaAcceso: string }[]
  guiaDenuncia?: {
    organismos: string[]
    marcoLegal: string[]
    pasos: string[]
  }
}

export interface MunicipioConnector {
  id: string
  nombre: string
  aniosDisponibles: number[]
  getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]>
}
