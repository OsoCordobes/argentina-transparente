/**
 * Tipos del modo Explorar (chat-first).
 *
 * Estos tipos son INTERNOS al frontend — viven en memoria mientras el usuario
 * navega `/explorar`. Se construyen a partir de los datos del backend
 * (queries.ts) por `graphFromData.ts`.
 *
 * Los nodos no son "documentos" del backend, son nodos visuales que apuntan
 * a entidades reales (proveedor por nombre, contrato por hash, etc.).
 */

export type ArgosNodeType =
  | 'jurisdiccion'
  | 'proveedor'
  | 'director'
  | 'contrato'
  | 'señal'
  // Mapa-neural cordobés (alimentado por Neo4j vía /api/grafo)
  | 'empresa'
  | 'persona'         // PersonaFisica (con DNI canónico)
  | 'funcionario'     // Cargo público
  | 'reparticion'     // Ministerio / secretaría / dependencia

export type ArgosSeveridad = 'grave' | 'moderada' | 'leve'

export interface ArgosNode {
  /** ID estable. Para proveedor: nombre normalizado. Para señal: id de señal. Etc. */
  id: string
  type: ArgosNodeType
  label: string
  /** Subtítulo opcional — CUIT, descripción, etc. */
  subtitle?: string
  /** Peso visual (0..1) — usado para tamaño y fuerza de simulación. */
  weight: number
  /** Flags visuales — verificación AFIP, severidad de señal, etc. */
  flags?: {
    verificadoAfip?: boolean
    severidad?: ArgosSeveridad
  }
  /** Datos crudos de la entidad para que el panel los muestre sin re-fetch. */
  data: Record<string, unknown>
  /** Posición en la simulación d3 — la mutamos en place. NO usar en JSX. */
  x?: number
  y?: number
  vx?: number
  vy?: number
}

export type ArgosEdgeKind =
  | 'opera_en'
  | 'gano'
  | 'tiene_director'
  | 'señalado_por'
  | 'comparte_director'
  // Aristas del mapa-neural Neo4j
  | 'dirige'                  // PersonaFisica → Empresa
  | 'trabaja_en'              // Funcionario → Reparticion
  | 'es_la_misma_persona'     // Funcionario → PersonaFisica
  | 'conflicto_con'           // Funcionario → Empresa (cruce calculado)

export interface ArgosEdge {
  source: string | ArgosNode
  target: string | ArgosNode
  kind: ArgosEdgeKind
  weight: number
}

export interface ArgosGraph {
  nodes: ArgosNode[]
  edges: ArgosEdge[]
}

// ─── Chat ───────────────────────────────────────────────────────────────────

export type ChatRole = 'user' | 'assistant'

export interface ChatMessage {
  role: ChatRole
  content: string
  ts: number
}

export interface ChatChunk {
  /** Texto del próximo trozo del stream. */
  delta?: string
  /** Entidades a resaltar en el grafo. */
  entidades?: { id: string; type: ArgosNodeType; label: string }[]
  /** Nodo a enfocar (centra cámara). */
  focus?: { nodeId: string }
  /** Última señal: stream terminó. */
  done?: boolean
}

/**
 * Niveles de "fade" del chat según interacción del usuario:
 * - 'typing': mensaje en streaming, opacidad alta
 * - 'idle': chat inactivo, opacidad media
 * - 'hover-graph': el cursor está sobre el grafo, chat se atenúa
 */
export type ChatFadeLevel = 'typing' | 'idle' | 'hover-graph'

export interface ChatContext {
  /** Nodo enfocado actual — el chat responde en su contexto si aplica. */
  focusNodeId: string | null
  /** Snapshot del grafo — fuente de verdad para resolver entidades. */
  graph: ArgosGraph
}

// ─── Detail Panel ───────────────────────────────────────────────────────────

export interface KPI {
  label: string
  /** Valor formateado o crudo. Si es trend, no usar value. */
  value?: string
  /** Subtítulo bajo el valor (ej. "11 años activo"). Acepta HTML simple. */
  sub?: string
  format: 'currency' | 'count' | 'date' | 'text' | 'trend'
  /** Para format=currency: valor crudo en pesos para formateo coherente. */
  amount?: number
  /** Para format=trend: serie temporal. */
  trend?: number[]
  trendYears?: number[]
  trendFormat?: 'currency' | 'count'
}

export interface Relacion {
  node: ArgosNode
  via: ArgosEdgeKind
  weight: number
  /** Severidad heredada si la relación toca una señal. */
  severidad?: ArgosSeveridad
}

export interface Fuente {
  url: string
  descripcion: string
  fechaAcceso: string
  nivelConfianza?: 'alto' | 'medio' | 'bajo'
}

export interface NodeContrato {
  hash: string
  anio: number
  area: string
  tipo: string
  descripcion: string
  monto: number
  fuenteUrl: string
  metodoExtraccion?: string
  nivelConfianza?: 'alto' | 'medio' | 'bajo'
}

// ─── Watchlist ──────────────────────────────────────────────────────────────

/**
 * Item de watchlist personal del usuario. Persiste en localStorage por defecto;
 * si hay sesión Supabase, también se replica a la tabla `watchlist`.
 *
 * - `proveedor_id`: ID estable del nodo proveedor (nombre normalizado).
 * - `agregado_en` / `ultima_visita`: ISO strings para merge "latest wins".
 * - `cuit` y `notas` son opcionales (null si no se conocen).
 */
export interface WatchlistItem {
  proveedor_id: string
  proveedor_label: string
  cuit: string | null
  agregado_en: string
  ultima_visita: string
  notas: string | null
}

export interface NodeDetail {
  node: ArgosNode
  kpis: KPI[]
  relaciones: Relacion[]
  /** Señales asociadas a este nodo (vacío si no aplica). */
  señales: {
    id: string
    titulo: string
    resumen: string
    severidad: ArgosSeveridad
    score: number
    evidencia: { descripcion: string; fuenteUrl: string }[]
    legal: { articulos: string[]; denunciarAnte: string[] }
  }[]
  fuentes: Fuente[]
  /** Contratos asociados al nodo — para Feature A "ficha rápida". */
  contratos?: NodeContrato[]
  /** Meta de trazabilidad para badge prominente (Feature A). */
  meta?: {
    fechaActualizacion: string | null
    metodoDominante: string
    topArea?: { area: string; monto: number; pct: number } | null
  }
  /** Confianza del match de identidad (Phase F7) — proviene del backend
   *  via `resolverEmpresa()` cuando aplica. Tier 1 implícito si la entidad
   *  ya tiene CUIT cargado en empresas.cuit. */
  identidad?: {
    tier: 1 | 2 | 3 | 4 | 5
    score?: number
  }
}

// ─── Identidad canónica (PLAN-DATOS Fase A1+A2 / PLAN-UI §3) ─────────────────
// Reflejan las tablas maestras del backend (personas_fisicas / personas_juridicas).
// Una persona = un DNI = una URL canónica. Una empresa = un CUIT = una URL canónica.

export type EstadoVerificacionSeñal =
  | 'sin_verificar'
  | 'verificada'
  | 'descartada'
  | 'bloqueada'

export interface SeñalAsociada {
  id: string
  titulo: string
  resumen: string
  tipologia: string
  score: number
  severidad: ArgosSeveridad
  estadoVerificacion: EstadoVerificacionSeñal
  verificadoPor: string | null
  verificadoEn: string | null
  evidencia: { descripcion: string; fuenteUrl: string }[]
  legal: { articulos: string[]; severidad: ArgosSeveridad; denunciarAnte: string[] }
}

export interface CargoPublico {
  jurisdiccion: string                 // 'cordoba-capital' | 'cordoba-provincia' | 'nacion'
  reparticion: string | null           // 'Secretaría de Hacienda', 'Ministerio de Educación', etc.
  cargo: string                        // 'Director de Compras', 'Concejal', 'Maestra de jardín'
  vigenteDesde: string | null          // ISO YYYY-MM-DD; null si solo se conoce el año
  vigenteHasta: string | null          // null si está vigente
  brutoMensual?: number | null         // promedio de período si conocido
  fuenteUrl: string
}

export interface DireccionEmpresa {
  cuitEmpresa: string                  // FK a PersonaJuridica
  razonSocial: string                  // mejor versión humana
  tipoCargo: string                    // 'Presidente', 'Director', 'Síndico', etc.
  vigenteDesde: string | null
  vigenteHasta: string | null
  fuenteUrl: string
}

export interface DDJJResumen {
  anio: number
  montoDeclarado: number | null
  pdfUrl: string
  cuitDeclarante: string | null
  dniDeclarante: string | null
  fuenteUrl: string
}

export interface AporteCampana {
  anioElectoral: number
  partido: string
  alianza: string | null
  monto: number | null
  tipoAporte: 'monetario' | 'no_monetario' | 'especie' | null
  fechaAporte: string | null
  fuenteUrl: string
}

export interface ContratoComoProveedor {
  hash: string
  jurisdiccion: string
  anio: number
  partidaPresupuestaria: string | null  // poblado post-Fase B
  programaPresupuestario: string | null
  monto: number
  area: string                          // área del organismo contratante
  tipo: string                          // licitación pública, contratación directa, etc.
  fuenteUrl: string
}

export interface PagoRecibido {
  fechaPago: string                     // ISO YYYY-MM-DD
  monto: number
  contratoHash: string | null           // FK opcional al contrato origen
  fuenteUrl: string
}

export interface TransferenciaRecibida {
  anio: number
  tipo: 'subsidio' | 'beca' | 'transferencia' | 'plan_social'
  programa: string | null
  monto: number
  fuenteUrl: string
}

/** Evento del timeline unificado del Profile. */
export interface TimelineEvento {
  fecha: string                         // ISO YYYY-MM-DD o YYYY si solo se conoce el año
  tipo:
    | 'cargo_publico'
    | 'ddjj'
    | 'aporte_campana'
    | 'direccion_empresa'
    | 'contrato_firmado'
    | 'pago_recibido'
    | 'transferencia_recibida'
    | 'señal_detectada'
  resumen: string                       // texto humano breve para la card del evento
  detalle?: Record<string, unknown>     // datos crudos para drill-down
}

/**
 * Persona Física canónica para el frontend (mirror de personas_fisicas backend).
 * Una persona = un DNI = una URL `/persona/:dni`.
 */
export interface PersonaFisica {
  dni: string
  cuit: string | null
  apellidoNombre: string
  apellidoNombreNorm: string
  fuentesUrl: string[]
  fuenteDniUrl: string | null
  primerVisto: string                   // ISO timestamp
  ultimoVisto: string
  // Relaciones (poblan secciones del Profile, ver PLAN-UI §3.1)
  cargosPublicos: CargoPublico[]
  direccionesEmpresas: DireccionEmpresa[]
  ddjj: DDJJResumen[]
  aportesCampana: AporteCampana[]
  señales: SeñalAsociada[]
  // Tags derivados (calculados al armar el Profile)
  jurisdiccionPrimaria: string | null   // jurisdicción del cargo más reciente
  badges: string[]                      // 'Funcionario activo', 'Declarante DJP', etc.
}

/**
 * Persona Jurídica canónica para el frontend (mirror de personas_juridicas backend).
 * Una empresa = un CUIT = una URL `/empresa/:cuit`.
 */
export interface PersonaJuridica {
  cuit: string
  razonSocial: string
  razonSocialNorm: string
  alias: string[]
  tipoSocietario: string | null
  fechaConstitucion: string | null
  domFiscalProvincia: string | null
  domFiscalLocalidad: string | null
  domLegalProvincia: string | null
  domLegalLocalidad: string | null
  estado: string | null
  esEmpleador: boolean | null
  actividadPrincipal: string | null
  fuentesUrl: string[]
  primerVisto: string
  ultimoVisto: string
  // Relaciones
  contratos: ContratoComoProveedor[]
  pagos: PagoRecibido[]
  directores: { dni: string; apellidoNombre: string; tipoCargo: string; vigenteDesde: string | null; vigenteHasta: string | null; fuenteUrl: string }[]
  aportesHechos: AporteCampana[]
  transferenciasRecibidas: TransferenciaRecibida[]
  señales: SeñalAsociada[]
}

/** Wrapper genérico: cualquier actor del UI es PF o PJ. Útil para componentes
 *  que aceptan ambos (ActorCard, listados desambiguados, etc.). */
export type Actor =
  | { tipo: 'persona'; data: PersonaFisica }
  | { tipo: 'empresa'; data: PersonaJuridica }

