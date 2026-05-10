// grafo-jerarquia.ts — Jerarquía Estado → Reparticion → Empresa desde DuckDB.
//
// Genera un grafo jerárquico real (sin Neo4j) para alimentar el home de ARGOS.
// Estructura por nivel:
//   depth 0 — Estado raíz (Córdoba Capital y/o Provincia de Córdoba)
//   depth 1 — Reparticiones (areas con más gasto del Estado)
//   depth 2 — Empresas (top proveedores de cada reparticion, conectados por
//             contratos reales)
//
// IDs estables (compatibles con expand-on-click futuro):
//   estado:<jurisdiccion>
//   rep:<slug-area>            ← clave compuesta jurisdiccion+area
//   emp:cuit:<cuit>            ← cuando hay CUIT verificado
//   emp:nom:<slug>             ← cuando solo hay nombre (Tier alto, no publicable)
//
// CLAUDE.md §2: solo se usan datos cargados en `contratos`. Si el área no tiene
// proveedor con CUIT verificado, se mantiene el nombre crudo (Tier alto, no
// se publica como vínculo confirmado — el frontend ya muestra TierBadge).

import { dbAll } from './db'

export interface JerarquiaNode {
  id: string
  type: 'jurisdiccion' | 'reparticion' | 'empresa' | 'funcionario'
  label: string
  subtitle?: string
  weight: number
  data: {
    depth: number
    monto?: number
    contratos?: number
    cuit?: string
    area?: string
    jurisdiccion?: string
    [k: string]: unknown
  }
}

export interface JerarquiaEdge {
  source: string
  target: string
  kind: 'pertenece_a' | 'gano' | 'opera_en'
  weight: number
}

export interface JerarquiaGraph {
  nodes: JerarquiaNode[]
  edges: JerarquiaEdge[]
  /** Siempre true — esta fuente no depende de Neo4j. */
  graphAvailable: true
  fuente: 'duckdb-jerarquia'
  meta: {
    jurisdicciones: string[]
    totalReparticiones: number
    totalEmpresas: number
    montoTotal: number
  }
}

export interface JerarquiaOpciones {
  /**
   * 'cordoba-capital' | 'cordoba-provincia' | 'all' (default: 'cordoba-capital').
   * Solo cordoba-capital tiene contratos cargados — el resto son placeholders
   * para cuando se incorpore data provincial / nacional.
   */
  jurisdiccion?: 'cordoba-capital' | 'cordoba-provincia' | 'all'
  /** Top N reparticiones por jurisdicción (default 12). */
  maxReparticiones?: number
  /** Top M empresas por reparticion (default 4). */
  maxEmpresasPorReparticion?: number
}

const JURISDICCION_LABEL: Record<string, string> = {
  'cordoba-capital': 'Córdoba Capital',
  'cordoba-provincia': 'Provincia de Córdoba',
}

function slugify(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60)
}

/**
 * Clave normalizada para agrupar variantes de un mismo nombre de área:
 *   - Sin diacríticos (NFD + remove combining marks)
 *   - Lowercase
 *   - Solo alfanuméricos (sin espacios ni puntuación)
 *   - Truncado a 35 chars (cubre el caso "...SOSTENIBILIDA" ≡ "...sostenibilidad",
 *     común en exports de portales que truncan al ancho de columna)
 *
 * "SECRETARÍA DE GESTIÓN AMBIENTAL Y SOSTENIBILIDA"
 * "Secretaría de Gestión Ambiental y Sostenibilidad"
 *   → ambos: "secretariadegestionambientalysost"
 */
function claveAreaNorm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    // Typo conocido en datos del portal: "secreatari" → "secretari"
    .replace(/secreatari/g, 'secretari')
    .replace(/[^a-z0-9]/g, '')
    .slice(0, 35)
}

/**
 * Construye el grafo jerárquico de Córdoba (Provincia + Capital) desde
 * `contratos`. Ejecuta 2 queries totales (una para reparticiones, una para
 * empresas con WINDOW function), independiente del N de jurisdicciones.
 */
export async function getJerarquiaCordoba(
  opts: JerarquiaOpciones = {}
): Promise<JerarquiaGraph> {
  const jurArg = opts.jurisdiccion ?? 'cordoba-capital'
  const jurisdicciones =
    jurArg === 'all'
      ? ['cordoba-capital', 'cordoba-provincia']
      : [jurArg]
  const maxReparticiones = opts.maxReparticiones ?? 12
  const maxEmpresasPorReparticion = opts.maxEmpresasPorReparticion ?? 4

  const nodes: JerarquiaNode[] = []
  const edges: JerarquiaEdge[] = []
  // Tracking: solo agregamos un estado raíz al final si tiene reparticiones
  // hijas. Sin esto, "Provincia de Córdoba" aparecía aislado cuando todavía
  // no hay contratos provinciales cargados.
  const estadosCandidatos: { jur: string; node: JerarquiaNode }[] = []
  for (const jur of jurisdicciones) {
    estadosCandidatos.push({
      jur,
      node: {
        id: `estado:${jur}`,
        type: 'jurisdiccion',
        label: JURISDICCION_LABEL[jur] ?? jur,
        subtitle: 'Estado',
        weight: 1.0,
        data: { depth: 0, jurisdiccion: jur },
      },
    })
  }

  // ─── depth 1: top reparticiones por jurisdicción ────────────────────────
  // SQL trae todas las áreas tal cual están en `contratos`. La dedup de
  // variantes (mayúsc/minúsc/diacríticos/truncación) se hace en JS con
  // claveAreaNorm() — más expresivo que SQL para los casos que vimos.
  const placeholders = jurisdicciones.map(() => '?').join(',')
  type RawArea = { municipio: string; area: string; n: number; monto: number }
  const rawAreas = await dbAll<RawArea>(
    `SELECT
       municipio,
       area,
       COUNT(*)::INTEGER as n,
       COALESCE(SUM(monto), 0)::DOUBLE as monto
     FROM contratos
     WHERE municipio IN (${placeholders})
       AND area IS NOT NULL AND TRIM(area) != ''
     GROUP BY municipio, area`,
    jurisdicciones
  )

  // Merge variantes del mismo ministerio dentro de cada jurisdicción.
  type AreaMerged = {
    municipio: string
    areaCanonica: string  // variante más descriptiva (más larga)
    norm: string          // clave de normalización
    n: number
    monto: number
  }
  const mergedMap = new Map<string, AreaMerged>()
  for (const r of rawAreas) {
    const norm = claveAreaNorm(r.area)
    if (!norm) continue
    const key = `${r.municipio}|${norm}`
    const existing = mergedMap.get(key)
    if (existing) {
      existing.n += Number(r.n)
      existing.monto += Number(r.monto)
      if (r.area.length > existing.areaCanonica.length) {
        existing.areaCanonica = r.area
      }
    } else {
      mergedMap.set(key, {
        municipio: r.municipio,
        areaCanonica: r.area,
        norm,
        n: Number(r.n),
        monto: Number(r.monto),
      })
    }
  }

  // Top N por jurisdicción (tras la dedup).
  const reparticionesPorJur: Map<string, AreaMerged[]> = new Map()
  for (const m of mergedMap.values()) {
    const arr = reparticionesPorJur.get(m.municipio) ?? []
    arr.push(m)
    reparticionesPorJur.set(m.municipio, arr)
  }
  const reparticiones: AreaMerged[] = []
  for (const arr of reparticionesPorJur.values()) {
    arr.sort((a, b) => b.monto - a.monto)
    reparticiones.push(...arr.slice(0, maxReparticiones))
  }

  if (reparticiones.length === 0) {
    return {
      nodes,
      edges,
      graphAvailable: true,
      fuente: 'duckdb-jerarquia',
      meta: {
        jurisdicciones,
        totalReparticiones: 0,
        totalEmpresas: 0,
        montoTotal: 0,
      },
    }
  }

  // Agregar al grafo solo los estados que efectivamente tienen reparticiones.
  const jurConData = new Set(reparticiones.map(r => r.municipio))
  for (const c of estadosCandidatos) {
    if (jurConData.has(c.jur)) nodes.push(c.node)
  }

  const maxMontoRep = Math.max(...reparticiones.map(r => r.monto), 1)
  // Mapa: jurisdiccion + norm → repId (estable, basado en clave normalizada).
  const repIdByJurNorm = new Map<string, string>()

  for (const r of reparticiones) {
    const repId = `rep:${r.municipio}:${slugify(r.areaCanonica)}`
    repIdByJurNorm.set(`${r.municipio}|${r.norm}`, repId)
    nodes.push({
      id: repId,
      type: 'reparticion',
      label: r.areaCanonica,
      subtitle: `${r.n.toLocaleString()} contratos`,
      weight: 0.45 + 0.55 * (r.monto / maxMontoRep),
      data: {
        depth: 1,
        area: r.areaCanonica,
        jurisdiccion: r.municipio,
        contratos: r.n,
        monto: r.monto,
      },
    })
    edges.push({
      source: repId,
      target: `estado:${r.municipio}`,
      kind: 'pertenece_a',
      weight: r.monto / maxMontoRep,
    })
  }

  // ─── depth 2: top empresas por reparticion ──────────────────────────────
  // SQL trae empresas sumadas por (jurisdiccion, area, empresa_id). En JS
  // hacemos:
  //   1. Match cada empresa a su reparticion vía claveAreaNorm() (igual que
  //      el merge de reparticiones).
  //   2. Top N empresas por (jurisdiccion, area_norm) por monto desc.
  //   3. Acumulado de monto por empresa (puede aparecer en varias areas).
  type RawEmpresa = {
    municipio: string
    area: string
    proveedor: string
    cuit: string | null
    monto: number
    n: number
  }
  const rawEmpresas = await dbAll<RawEmpresa>(
    `SELECT
       municipio,
       area,
       arg_max(proveedor, LENGTH(proveedor)) AS proveedor,
       proveedor_cuit AS cuit,
       SUM(monto)::DOUBLE as monto,
       COUNT(*)::INTEGER as n
     FROM contratos
     WHERE municipio IN (${placeholders})
       AND area IS NOT NULL AND TRIM(area) != ''
       AND proveedor IS NOT NULL AND TRIM(proveedor) != ''
     GROUP BY
       municipio,
       area,
       proveedor_cuit,
       CASE WHEN proveedor_cuit IS NULL THEN LOWER(TRIM(proveedor)) ELSE NULL END`,
    jurisdicciones
  )

  // Merge variantes del área para cada empresa.
  type EmpresaPorRep = {
    municipio: string
    norm: string
    empId: string
    proveedor: string
    cuit: string | null
    monto: number
    contratos: number
  }
  const porRepMap = new Map<string, EmpresaPorRep>()
  for (const e of rawEmpresas) {
    const norm = claveAreaNorm(e.area)
    if (!norm) continue
    if (!repIdByJurNorm.has(`${e.municipio}|${norm}`)) continue
    const empId = e.cuit
      ? `emp:cuit:${e.cuit}`
      : `emp:nom:${slugify(e.proveedor)}`
    const k = `${e.municipio}|${norm}|${empId}`
    const existing = porRepMap.get(k)
    if (existing) {
      existing.monto += Number(e.monto)
      existing.contratos += Number(e.n)
      if (e.proveedor.length > existing.proveedor.length) {
        existing.proveedor = e.proveedor
      }
    } else {
      porRepMap.set(k, {
        municipio: e.municipio,
        norm,
        empId,
        proveedor: e.proveedor,
        cuit: e.cuit,
        monto: Number(e.monto),
        contratos: Number(e.n),
      })
    }
  }

  // Top N empresas por reparticion.
  const empresasPorRepMap: Map<string, EmpresaPorRep[]> = new Map()
  for (const e of porRepMap.values()) {
    const k = `${e.municipio}|${e.norm}`
    const arr = empresasPorRepMap.get(k) ?? []
    arr.push(e)
    empresasPorRepMap.set(k, arr)
  }
  const empresasFiltradas: EmpresaPorRep[] = []
  for (const arr of empresasPorRepMap.values()) {
    arr.sort((a, b) => b.monto - a.monto)
    empresasFiltradas.push(...arr.slice(0, maxEmpresasPorReparticion))
  }

  // Acumulado total por empresa (puede aparecer en varias reparticiones).
  const empresaMontosAcum = new Map<string, number>()
  for (const e of empresasFiltradas) {
    empresaMontosAcum.set(e.empId, (empresaMontosAcum.get(e.empId) ?? 0) + e.monto)
  }
  const maxMontoEmp = Math.max(...Array.from(empresaMontosAcum.values()), 1)

  const empresaIdsAdded = new Set<string>()
  for (const e of empresasFiltradas) {
    const repId = repIdByJurNorm.get(`${e.municipio}|${e.norm}`)
    if (!repId) continue
    const montoAcum = empresaMontosAcum.get(e.empId) ?? e.monto

    if (!empresaIdsAdded.has(e.empId)) {
      empresaIdsAdded.add(e.empId)
      nodes.push({
        id: e.empId,
        type: 'empresa',
        label: e.proveedor,
        subtitle: e.cuit ?? 'sin CUIT verificado',
        weight: 0.25 + 0.5 * (montoAcum / maxMontoEmp),
        data: {
          depth: 2,
          cuit: e.cuit ?? undefined,
          monto: montoAcum,
          contratos: e.contratos,
        },
      })
    }
    edges.push({
      source: e.empId,
      target: repId,
      kind: 'gano',
      weight: e.monto / maxMontoEmp,
    })
  }

  return {
    nodes,
    edges,
    graphAvailable: true,
    fuente: 'duckdb-jerarquia',
    meta: {
      jurisdicciones,
      totalReparticiones: reparticiones.length,
      totalEmpresas: empresaIdsAdded.size,
      montoTotal: reparticiones.reduce((acc, r) => acc + r.monto, 0),
    },
  }
}
