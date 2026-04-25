export interface Contrato {
  tipo: string
  proveedor: string
  area: string
  descripcion: string
  monto: number
  anio: number
  fuenteUrl: string
  numeroExpediente?: string   // "EXP-2022-001234" si el dataset lo tiene
  numeroContrato?: string     // número de resolución/decreto
  fechaContrato?: string      // "2022-03-15"
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
  // CUITs de las entidades implicadas en la señal (poblado en analyze.ts).
  // Permite asociar señal↔entidad sin string matching frágil.
  cuits?: string[]
}

export interface ComoVerificar {
  instrucciones: string[]
  expedientesSugeridos: string[]
  plazosLegales: string[]
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
  comoVerificar?: ComoVerificar
}

export interface EmpresaEnriquecida {
  cuit: string | null
  razonSocial: string | null
  esEmpleador: boolean
  inicioActividades: string | null  // "DD/MM/YYYY" desde AFIP
  estado: string | null             // "ACTIVO" | "INACTIVO"
  actividadPrincipal: string | null
  directores: string[]              // nombres, desde IGJ (vacío hasta Sprint 3 completo)
  encontrado: boolean
  fuenteUrl: string
}

export interface MunicipioConnector {
  id: string
  nombre: string
  aniosDisponibles: number[]
  getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]>
}
