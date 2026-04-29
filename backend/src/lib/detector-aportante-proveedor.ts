// detector-aportante-proveedor.ts (PLAN-DATOS Fase C2)
//
// Detector Tier 1 — cruza CUITs verificados de aportantes a campañas
// electorales con CUITs verificados de proveedores que firmaron contratos
// con el estado en años POSTERIORES al aporte.
//
// La construcción es Tier 1 porque:
//   - aportantes_campanas.cuit viene del CNE (Cámara Nacional Electoral) —
//     dato oficial, no inferido. PJ tiene CUIT, PF tiene DNI+CUIT.
//   - El CUIT del proveedor sale de identity_matches Tier 1-3 (CUIT exacto
//     verificado, name normalizado, fuzzy alto). Los Tier 4-5 LLM-ambiguos
//     se EXCLUYEN explícitamente — W4 documentó CUITs erróneos en Tier 4
//     (NIETO→OTERO, Córdoba→La Rioja).
//
// Por eso esta señal NO necesita cap-60 (no depende de match por apellido
// como M4.1). Cap directo a 95 — los últimos 5 puntos quedan reservados
// para auditoría judicial / Tribunal de Cuentas.
//
// Filtro temporal: contrato.anio >= aporte.anio_electoral. Si la empresa
// aportó en 2023 y el contrato es de 2022, NO es señal — el contrato
// preexistía. La causalidad fluye de aporte → contrato, no al revés.

import { dbAll, dbRun, insertSeñalCache } from './db'
import { crearSnapshot } from './snapshots'
import { validarCUIT } from './identidad-validator'
import crypto from 'crypto'
import type { Señal } from '../types/index'

const ORGANISMOS_DENUNCIA_C2 = [
  'Cámara Nacional Electoral (CNE)',
  'Tribunal de Cuentas de Córdoba',
  'Fiscalía de Estado de Córdoba',
  'Ministerio Público Fiscal',
]

const MARCO_LEGAL_C2 = [
  'Ley 26.215 — Financiamiento de los Partidos Políticos (límites a aportes y deber de transparencia)',
  'Ley 25.188 — Ética Pública: incompatibilidades por conflicto de intereses (art. 13-15)',
  'Ley 25.156 — Defensa de la Competencia (cuando aplica concentración)',
  'Decreto 1023/2001 — Régimen de Contrataciones del Estado Nacional',
]

export interface CruceAportanteProveedor {
  cuit: string                       // CUIT verificado (Tier 1 ambos lados)
  razon_social: string               // mejor versión humana conocida
  // Aporte
  partido: string
  alianza: string | null
  anio_electoral: number
  monto_aportado: number             // suma si hubo varios aportes en el período
  cantidad_aportes: number
  fecha_primer_aporte: string | null
  fuente_url_aporte: string
  // Contratos post-aporte
  cantidad_contratos: number
  monto_contratado: number
  primer_contrato_anio: number
  ultimo_contrato_anio: number
  fuente_url_contratos: string[]
  jurisdicciones_contratos: string[]
  // Identity match info (de identity_matches)
  tier_match_proveedor: number       // 1, 2 o 3 — solo Tier 1-3 entra
  score_match_proveedor: number
}

/**
 * Encuentra cruces aportante↔proveedor con CUIT verificado en ambos lados.
 *
 * Filtros:
 *   - identity_matches.tier <= 3 (rechaza Tier 4 LLM-ambiguous y Tier 5 no-match)
 *   - contrato.anio >= aportante.anio_electoral (post-aporte)
 *   - aportante.cuit IS NOT NULL (PJ con CUIT verificado, no PF aportante)
 *   - opcionalmente filtrar por jurisdicción (default: todas)
 */
export async function encontrarCrucesAportanteProveedor(opts: {
  jurisdicciones?: string[]
  minMontoContrato?: number
  minMontoAporte?: number
} = {}): Promise<CruceAportanteProveedor[]> {
  const minMontoContrato = opts.minMontoContrato ?? 0
  const minMontoAporte = opts.minMontoAporte ?? 0
  const jurisdiccionesFilter = opts.jurisdicciones?.length
    ? `AND c.municipio IN (${opts.jurisdicciones.map(j => `'${j.replace(/'/g, "''")}'`).join(',')})`
    : ''

  const rows = await dbAll<{
    cuit: string
    razon_social: string
    partido: string
    alianza: string | null
    anio_electoral: number
    monto_aportado: number
    cantidad_aportes: number
    fecha_primer_aporte: string | null
    fuente_url_aporte: string
    cantidad_contratos: number
    monto_contratado: number
    primer_contrato_anio: number
    ultimo_contrato_anio: number
    fuente_urls_contratos: string[] | string
    jurisdicciones_contratos: string[] | string
    tier_match_proveedor: number
    score_match_proveedor: number
  }>(`
    -- Review #1 C2: bug fix de causalidad temporal.
    -- Antes: contratos_agg sumaba TODOS los contratos (de cualquier año) y
    -- después filtraba por ca.primer_anio >= a.anio_electoral. Eso descartaba
    -- empresas con contratos PRE-aporte aunque también tuvieran POST-aporte,
    -- y la SUM mezclaba contratos pre con post.
    -- Ahora: el filtro c.anio >= a.anio_electoral está DENTRO del JOIN, por
    -- lo que solo se agregan contratos estrictamente posteriores al aporte.
    WITH aportes_pj AS (
      SELECT cuit,
             ANY_VALUE(razon_social) AS razon_social,
             partido,
             ANY_VALUE(alianza) AS alianza,
             anio_electoral,
             SUM(monto) AS monto_aportado,
             COUNT(*) AS cantidad_aportes,
             MIN(fecha_aporte) AS fecha_primer_aporte,
             ANY_VALUE(fuente_url) AS fuente_url
        FROM aportantes_campanas
       WHERE cuit IS NOT NULL
         AND monto IS NOT NULL
         AND monto > 0
       GROUP BY cuit, partido, anio_electoral
      HAVING SUM(monto) >= ${minMontoAporte}
    ),
    proveedores_verificados AS (
      -- Solo identity_matches Tier 1-3. Tier 4-5 se EXCLUYE.
      SELECT im.proveedor_norm,
             im.cuit_resuelto AS cuit,
             im.tier,
             im.score
        FROM identity_matches im
       WHERE im.tier <= 3
         AND im.cuit_resuelto IS NOT NULL
    )
    SELECT a.cuit,
           ANY_VALUE(a.razon_social) AS razon_social,
           a.partido,
           ANY_VALUE(a.alianza) AS alianza,
           a.anio_electoral,
           ANY_VALUE(a.monto_aportado) AS monto_aportado,
           ANY_VALUE(a.cantidad_aportes) AS cantidad_aportes,
           ANY_VALUE(a.fecha_primer_aporte) AS fecha_primer_aporte,
           ANY_VALUE(a.fuente_url) AS fuente_url_aporte,
           COUNT(c.hash) AS cantidad_contratos,
           SUM(c.monto) AS monto_contratado,
           MIN(c.anio) AS primer_contrato_anio,
           MAX(c.anio) AS ultimo_contrato_anio,
           LIST(DISTINCT c.fuente_url) AS fuente_urls_contratos,
           LIST(DISTINCT c.municipio) AS jurisdicciones_contratos,
           ANY_VALUE(pv.tier) AS tier_match_proveedor,
           ANY_VALUE(pv.score) AS score_match_proveedor
      FROM aportes_pj a
      JOIN proveedores_verificados pv ON pv.cuit = a.cuit
      JOIN contratos c
        ON c.proveedor_norm = pv.proveedor_norm
       AND c.anio >= a.anio_electoral  -- KEY: causalidad estricta post-aporte
       AND c.monto IS NOT NULL
       AND c.monto > 0
       ${jurisdiccionesFilter ? jurisdiccionesFilter.replace(/c\.municipio/g, 'c.municipio') : ''}
     GROUP BY a.cuit, a.partido, a.anio_electoral
    HAVING SUM(c.monto) >= ${minMontoContrato}
     ORDER BY SUM(c.monto) DESC
  `)

  // Review #2 C2: defensa módulo-11 del CUIT (último filtro antes de devolver).
  // CNE publica CUITs ocasionalmente corruptos (ejemplo: '20-' prefijos donde
  // debe ir '30-' para PJ, dígito verificador erróneo). Los detectores Tier 1
  // no pueden emitir señales sobre CUITs inválidos — un fiscal que recibe la
  // denuncia no puede cruzar contra AFIP. Filtramos acá en lugar de antes del
  // SQL para que si el caller necesita hallazgos puede inspeccionar la diff
  // (ver script audit-tier-pollution.ts).
  return rows
    .filter(r => validarCUIT(r.cuit))
    .map(r => ({
      cuit: r.cuit,
      razon_social: r.razon_social,
      partido: r.partido,
      alianza: r.alianza,
      anio_electoral: Number(r.anio_electoral),
      monto_aportado: Number(r.monto_aportado),
      cantidad_aportes: Number(r.cantidad_aportes),
      fecha_primer_aporte: r.fecha_primer_aporte,
      fuente_url_aporte: r.fuente_url_aporte,
      cantidad_contratos: Number(r.cantidad_contratos),
      monto_contratado: Number(r.monto_contratado),
      primer_contrato_anio: Number(r.primer_contrato_anio),
      ultimo_contrato_anio: Number(r.ultimo_contrato_anio),
      fuente_url_contratos: Array.isArray(r.fuente_urls_contratos)
        ? Array.from(new Set(r.fuente_urls_contratos)).slice(0, 8)
        : [],
      jurisdicciones_contratos: Array.isArray(r.jurisdicciones_contratos)
        ? Array.from(new Set(r.jurisdicciones_contratos))
        : [],
      tier_match_proveedor: Number(r.tier_match_proveedor),
      score_match_proveedor: Number(r.score_match_proveedor),
    }))
}

/**
 * Convierte un cruce aportante↔proveedor en una Señal Tier 1.
 *
 * Scoring:
 *   - Base: 50 (Tier 1 — CUIT verificado ambos lados)
 *   - Monto contratado: log10(monto)*8, max 30
 *   - Monto aportado:    log10(monto)*5, max 15
 *   - Cap: 95 (auditoría judicial reserva el último 5)
 *
 * No requiere cap-60 — la verificación es por CUIT (estructural), no por
 * coincidencia de apellido. Esta es la diferencia fundamental con M4.1.
 */
export function aportanteProveedorASeñal(c: CruceAportanteProveedor): Señal {
  const scoreContrato = Math.min(30, Math.log10(Math.max(c.monto_contratado, 1)) * 8)
  const scoreAporte = Math.min(15, Math.log10(Math.max(c.monto_aportado, 1)) * 5)
  const score = Math.min(95, Math.round(50 + scoreContrato + scoreAporte))

  const severidad: 'grave' | 'moderada' | 'leve' =
    score >= 75 ? 'grave' : score >= 55 ? 'moderada' : 'leve'

  const aniosContratoStr = c.primer_contrato_anio === c.ultimo_contrato_anio
    ? `${c.primer_contrato_anio}`
    : `${c.primer_contrato_anio}-${c.ultimo_contrato_anio}`

  const evidencia = [
    {
      descripcion: `La empresa "${c.razon_social}" (CUIT ${c.cuit}) aportó $${Math.round(c.monto_aportado).toLocaleString('es-AR')} a "${c.partido}"${c.alianza ? ` (alianza ${c.alianza})` : ''} en el ciclo electoral ${c.anio_electoral} (${c.cantidad_aportes} aporte${c.cantidad_aportes === 1 ? '' : 's'} desde ${c.fecha_primer_aporte ?? 'fecha sin precisar'}). Posteriormente, en ${aniosContratoStr}, recibió ${c.cantidad_contratos} contrato(s) por $${Math.round(c.monto_contratado).toLocaleString('es-AR')} de ${c.jurisdicciones_contratos.join(', ')}.`,
      fuenteUrl: c.fuente_url_aporte,
    },
    ...c.fuente_url_contratos.slice(0, 5).map(url => ({
      descripcion: `Contrato firmado por la empresa post-aporte.`,
      fuenteUrl: url,
    })),
    {
      descripcion: `IDENTIDAD VERIFICADA: ambos lados del cruce son CUIT (no apellido). Aportante: CUIT ${c.cuit} de CNE (Cámara Nacional Electoral, dataset oficial). Proveedor: identity_matches Tier ${c.tier_match_proveedor} (score ${c.score_match_proveedor}/100). Tier 4-5 está EXCLUIDO de este detector — no usamos inferencia LLM para señales publicables.`,
      fuenteUrl: 'https://aportantes.electoral.gob.ar/',
    },
  ]

  return {
    tipologia: 'aportante_de_campana_y_proveedor',
    score,
    titulo: `Aportante a campaña ${c.partido} ${c.anio_electoral} y proveedor del estado: ${c.razon_social} (CUIT ${c.cuit})`,
    resumen: `${c.razon_social} (CUIT ${c.cuit}) aportó $${Math.round(c.monto_aportado).toLocaleString('es-AR')} a ${c.partido} en ${c.anio_electoral}, y luego recibió ${c.cantidad_contratos} contrato(s) por $${Math.round(c.monto_contratado).toLocaleString('es-AR')} del estado en ${aniosContratoStr}. Tier 1 — CUIT verificado en ambos lados.`,
    evidencia,
    legal: {
      severidad,
      articulos: MARCO_LEGAL_C2,
      denunciarAnte: ORGANISMOS_DENUNCIA_C2,
    },
    cuits: [c.cuit],
  }
}

/**
 * Pipeline completo: encontrar cruces → convertir a señales → persistir en
 * señales_cache. Crea snapshot. Idempotente con `reemplazarExistentes`.
 */
export async function ejecutarDetectorAportanteProveedor(opts: {
  jurisdicciones?: string[]
  minMontoContrato?: number
  minMontoAporte?: number
  reemplazarExistentes?: boolean
} = {}): Promise<{
  snapshotId: string
  insertadas: number
  candidatos: number
}> {
  const start = Date.now()
  const snap = await crearSnapshot({
    seedId: 'detector:aportante_de_campana_y_proveedor',
    fuenteUrl: 'internal://duckdb',
    hashArchivo: crypto.createHash('sha256').update(`detector-c2-${start}`).digest('hex').slice(0, 16),
    filasLeidas: 0,
    notas: `jurisdicciones=${(opts.jurisdicciones ?? ['*']).join(',')}, minContrato=${opts.minMontoContrato ?? 0}, minAporte=${opts.minMontoAporte ?? 0}`,
  })

  const candidatos = await encontrarCrucesAportanteProveedor(opts)

  if (opts.reemplazarExistentes) {
    await dbRun(`DELETE FROM señales_cache WHERE tipologia = 'aportante_de_campana_y_proveedor'`)
  }

  let insertadas = 0
  for (const c of candidatos) {
    const señal = aportanteProveedorASeñal(c)
    // Municipio: si el contrato cubre múltiples, usamos el primero.
    // (Las señales globales por entidad pueden duplicar — el cache las dedupa por id.)
    const municipio = c.jurisdicciones_contratos[0] ?? 'multi-jurisdiccion'
    await insertSeñalCache(municipio, señal, [c.cuit])
    insertadas++
  }

  return { snapshotId: snap.id, insertadas, candidatos: candidatos.length }
}
