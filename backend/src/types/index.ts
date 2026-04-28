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

  // ── Trazabilidad de extracción (CLAUDE.md §4) ──────────────────────────────
  // Defaultea a alto/api_estructurada al insertarse si no se especifica.
  nivelConfianza?: NivelConfianza        // 'alto' (API), 'medio' (OCR), 'bajo' (scraper)
  metodoExtraccion?: ConnectorTipo       // tipo de connector que lo produjo
  paginaPdf?: number                     // página origen si vino de OCR
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
  /**
   * Caveat textual para detectores Tier 2 (indicio, no infracción directa).
   * Lo carga el motor desde detectors-config.json. Se muestra en la UI para
   * dejar claro al usuario que la señal NO equivale a delito y qué hay que
   * verificar antes de publicar. Ausente en detectores Tier 1.
   */
  caveat?: string
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

// Match cacheado contra OpenSanctions / ICIJ / OFAC.
// Se cachea en DuckDB.opensanctions_matches para evitar 1 round-trip API por
// cada análisis. TTL típico 30 días.
export interface OSMatch {
  cuit: string                                    // CUIT consultado
  nombre: string                                  // razón social ARGOS
  matched: boolean                                // ¿hubo match?
  riesgo: 'sancionado' | 'pep' | 'offshore' | 'crimen' | null
  datasetPrincipal: string | null                 // 'icij_offshore_leaks', etc.
  entidadId: string | null                        // OSEntidad.id
  entidadCaption: string | null                   // nombre legible del match
  entidadUrl: string | null                       // URL pública en OS
  consultadoEn: string                            // ISO timestamp
}

export interface MunicipioConnector {
  id: string
  nombre: string
  aniosDisponibles: number[]
  getContratos(anioDesde: number, anioHasta: number): Promise<Contrato[]>

  // ── Sprint 4 (Data Foundation) — metadata trazable ────────────────────────
  // Estos campos son opcionales por backwards compat con conectores existentes
  // pero conectores nuevos DEBERÍAN proveerlos para cumplir CLAUDE.md sección 4
  // (toda fuente debe registrarse con origen, fecha, método, formato y nivel
  // de confianza).
  tipo?: ConnectorTipo
  fuente?: FuenteMetadata
}

export type ConnectorTipo =
  | 'api_estructurada'    // CKAN, JSON, XLSX directo desde API oficial
  | 'scraper_html'        // Playwright sobre portal sin API
  | 'ocr_pdf'             // Vision API sobre boletines escaneados
  | 'dataset_internacional' // OpenSanctions, ICIJ, OFAC, etc.

export type NivelConfianza = 'alto' | 'medio' | 'bajo'

export interface FuenteMetadata {
  // Identificador estable para FK desde contratos.fuente_id
  id: string
  jurisdiccion: string             // 'Córdoba Capital', 'Nación', etc.
  url: string                      // URL pública del dataset/portal
  formato: string                  // 'XLSX', 'JSON', 'PDF', 'CSV', etc.
  oficial: boolean                 // ¿es fuente oficial (gobierno)?
  licencia?: string                // CC-BY-4.0, etc. cuando corresponda
  frecuenciaActualizacion?: string // 'anual', 'mensual', 'eventual'
  nivelConfianza: NivelConfianza
  notas?: string
}

export type { IngestOpts, IngestReport, IngestStatus, QuarantineRow } from './ingest'
