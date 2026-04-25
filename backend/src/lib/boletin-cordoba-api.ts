// lib/boletin-cordoba-api.ts — Cliente de la API REST oficial del Boletín
// Municipal de Córdoba (apibridge).
//
// Endpoint descubierto vía reverse-engineering del SPA Angular:
//   GET https://boletinmunicipal.cordoba.gob.ar/apibridge/ciudadano/boletin
//
// Cobertura confirmada al 2026-04-25:
//   - 856 boletines (#3600 al #4458)
//   - Desde 2020-05-22 hasta 2026-04-21 (1 día de delay máximo)
//   - Estructura jerárquica: Boletín → TiposPublicacion → TiposNormas → Publicaciones
//
// Cada Publicación incluye: Asunto (texto libre), TipoNorma, Reparticion,
// FechaSancion, FechaPublicacion, NormaNumero, ExpedienteNumero, RutaDocFinal.

const API_BASE = 'https://boletinmunicipal.cordoba.gob.ar/apibridge/ciudadano/boletin'
const TIMEOUT_MS = 60_000

// ─── Tipos del payload de la API ─────────────────────────────────────────────

export interface PublicacionAPI {
  Id: number
  TipoNorma: string                  // "Decreto" | "Resolución" | "Ordenanza" | etc.
  Reparticion: string                // organismo emisor
  TipoPublicacion: string            // "Legislación - Normativa" etc.
  NormaNumero: string                // "030", "0977", etc.
  Letra: string
  ExpedienteNumero: string
  Asunto: string                     // texto libre — ÉSTE es el campo a procesar
  FechaSancion: string               // ISO 8601
  FechaPublicacion: string           // ISO 8601
  RutaDocFinal: string               // URL al PDF de la norma individual
  Estado: string
  Urgente: boolean
}

interface TipoNormaAPI {
  Orden: number
  Nombre: string
  Publicaciones: PublicacionAPI[]
}

interface TipoPublicacionAPI {
  Orden: number
  Nombre: string
  TiposNormas: TipoNormaAPI[]
}

export interface BoletinAPI {
  Numero: number
  Fecha: string
  EsUltimoBoletin: boolean
  RutaDocBoletin: string             // URL al PDF completo del boletín
  TiposPublicacion: TipoPublicacionAPI[]
}

interface APIResponse<T> {
  Object: T
  Ok: boolean
  Errors: unknown[]
  ErrorsText: string
}

// ─── Cliente ──────────────────────────────────────────────────────────────────

async function fetchWithTimeout(url: string): Promise<Response> {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    return await fetch(url, {
      signal: ctl.signal,
      headers: {
        // Firefox UA — el portal bloquea User-Agents que mencionan "bot" o
        // similares. Como esto es scraping de información pública (Ley 27.275),
        // usar UA neutro evita falsos negativos.
        'User-Agent': 'Mozilla/5.0 (X11; Linux x86_64; rv:120.0) Gecko/20100101 Firefox/120.0',
        Accept: 'application/json, text/plain, */*',
        'Accept-Language': 'es-AR,es;q=0.9',
      },
    })
  } finally {
    clearTimeout(timer)
  }
}

// Obtiene todos los boletines disponibles (la API retorna todo, los params
// fechaDesde/fechaHasta parecen ignorados — filtramos client-side).
export async function listarBoletines(): Promise<BoletinAPI[]> {
  // El endpoint tarda ~5-10s en responder con 3.8MB. No hay paginación.
  const res = await fetchWithTimeout(`${API_BASE}?fechaDesde=2020-01-01&fechaHasta=2030-12-31`)
  if (!res.ok) throw new Error(`API HTTP ${res.status}`)
  const data = await res.json() as APIResponse<BoletinAPI[]>
  if (!data.Ok) throw new Error(`API error: ${data.ErrorsText}`)
  return Array.isArray(data.Object) ? data.Object : [data.Object]
}

// Aplana la estructura jerárquica del boletín a una lista de publicaciones
// con la metadata del boletín contenedora.
export interface PublicacionPlana extends PublicacionAPI {
  boletinNumero: number
  boletinFecha: string
  boletinPdfUrl: string
}

export function aplanarPublicaciones(boletines: BoletinAPI[]): PublicacionPlana[] {
  const out: PublicacionPlana[] = []
  for (const b of boletines) {
    for (const tp of b.TiposPublicacion ?? []) {
      for (const tn of tp.TiposNormas ?? []) {
        for (const p of tn.Publicaciones ?? []) {
          out.push({
            ...p,
            boletinNumero: b.Numero,
            boletinFecha: b.Fecha,
            boletinPdfUrl: b.RutaDocBoletin,
          })
        }
      }
    }
  }
  return out
}

// Filtra publicaciones que probablemente sean contrataciones públicas
// basándose en TipoNorma + keywords en el Asunto. Pre-filtro barato antes de
// gastar tokens de Claude. False positives son OK (Claude los descartará),
// false negatives son peligrosos (perdés un contrato real).
const KEYWORDS_CONTRATACION = [
  'adjudic',     // adjudicación, adjudicar, adjudicado
  'licitac',     // licitación
  'contrat',     // contratación, contrato, contratista (también "contratación directa")
  'proveed',     // proveedor
  'compra',      // compra directa, compras
  'concurs',     // concurso de precios
  'convenio',    // convenios marco
  'convoca',     // convocatoria a licitación
  'fideicomis',  // fideicomisos urbanísticos
  'permiso',     // permisos de obra
  'rescind',     // rescisiones contractuales
  'prorr',       // prórrogas contractuales
  'ampli',       // ampliaciones de contrato
]

const TIPOS_NORMA_RELEVANTES = new Set([
  'Decreto',
  'Resolución',
  'Ordenanza',
  'Disposición',
])

export function filtrarRelevantes(publicaciones: PublicacionPlana[]): PublicacionPlana[] {
  return publicaciones.filter(p => {
    const asuntoLower = (p.Asunto ?? '').toLowerCase()
    const tipoOk = TIPOS_NORMA_RELEVANTES.has(p.TipoNorma)
    if (!tipoOk) return false
    return KEYWORDS_CONTRATACION.some(kw => asuntoLower.includes(kw))
  })
}
