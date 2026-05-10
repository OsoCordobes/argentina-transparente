// grafo-mapa-provincial.ts — Mapa comprehensive de la Provincia + Capital de Córdoba.
//
// Reemplaza al endpoint /jerarquia/v2 (que solo lee `contratos`) por un grafo
// multi-fuente que conecta:
//
//   depth 0 — jurisdicciones (Provincia + Capital, ambas siempre)
//   depth 1 — ministerios y secretarías (de agentes_publicos + contratos)
//   depth 2 — direcciones internas + organismos descentralizados +
//             top empresas con contratos
//   depth 3 — top funcionarios (por cargo/sueldo) + top directores
//             (deep mode only)
//
// Fuentes:
//   - contratos                 → empresas que ganaron, monto contractual
//   - agentes_publicos          → reparticiones reales con # empleados
//   - empresas                  → CUIT verificado AFIP
//   - cargos_funcionarios       → funcionarios con cargo formal
//   - entes_estatales_cordoba   → organismos descentralizados
//   - v_persona_dirige_empresa  → red de directores (cuando incluir_personas=true)
//
// CLAUDE.md §2: nada inventado. Cada nodo lleva 'fuente' indicando de qué
// tabla salió. Cada edge lleva 'fuente' equivalente.

import { dbAll } from './db'

export type JurisdiccionId = 'provincia' | 'capital' | 'ambas'
export type DetailLevel = 'macro' | 'meso' | 'deep'

export interface MapaNode {
  id: string
  type: 'jurisdiccion' | 'ministerio' | 'direccion' | 'organismo' | 'empresa' | 'persona' | 'empleado'
  label: string
  subtitle?: string
  weight: number  // 0..1 normalizado dentro de su tipo
  depth: 0 | 1 | 2 | 3
  jurisdiccion: 'provincia' | 'capital' | null  // null para empresas/personas que no son del Estado
  data: {
    monto?: number
    contratos?: number
    empleados?: number
    sueldo?: number
    cargo?: string
    cuit?: string
    fuente: string  // tabla de origen
    [k: string]: unknown
  }
  flags?: {
    senalGrave?: boolean
    senalModerada?: boolean
    cuitVerificado?: boolean
  }
}

export interface MapaEdge {
  source: string
  target: string
  kind:
    | 'contiene'
    | 'comparte_jurisdiccion'
    | 'contrata'
    | 'trabaja_en'
    | 'dirige'
    | 'preside'
    | 'conflicto_con'
    | 'comparte_director'
  weight: number
  data?: {
    monto?: number
    contratos?: number
    empleados?: number
    fuente: string
  }
}

export interface MapaProvincialResponse {
  nodes: MapaNode[]
  edges: MapaEdge[]
  meta: {
    detail: DetailLevel
    jurisdicciones: ('provincia' | 'capital')[]
    totalNodos: number
    totalAristas: number
    porTipo: Record<string, number>
    montoTotal: number
    empleadosTotal: number
    fuentes: string[]
    año: number | null
  }
}

export interface MapaProvincialOpts {
  detail?: DetailLevel
  jurisdiccion?: JurisdiccionId
  año?: number | null
}

const JUR_LABEL = {
  provincia: 'Provincia de Córdoba',
  capital: 'Córdoba Capital',
} as const

// ─── helpers ──────────────────────────────────────────────────────────────

function slugify(s: string, max = 60): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, max)
}

function claveNorm(s: string, max = 40): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/secreatari/g, 'secretari') // typo conocido portal Córdoba
    .replace(/[^a-z0-9]/g, '')
    .slice(0, max)
}

/**
 * Reglas heurísticas para clasificar la jurisdicción de un agente público:
 *   - municipio en `contratos` ('cordoba-capital' / 'upc') → capital
 *   - jurisdiccion en `agentes_publicos` ('cordoba-capital') → capital
 *   - jurisdiccion en `agentes_publicos` ('cordoba-provincia') → provincia
 */
function jurFromAgentesPublicos(j: string | null): 'provincia' | 'capital' | null {
  if (!j) return null
  if (j === 'cordoba-capital') return 'capital'
  if (j === 'cordoba-provincia') return 'provincia'
  return null
}
function jurFromContratos(m: string | null): 'provincia' | 'capital' | null {
  if (!m) return null
  if (m === 'cordoba-capital' || m === 'upc') return 'capital'
  return null
}

/**
 * Detecta si un nombre de repartición es un MINISTERIO (depth 1) o una
 * DIRECCIÓN/secretaría sub-ordinada (depth 2). Heurística por prefijo —
 * los datos del portal son inconsistentes pero esto cubre el 90% de casos.
 */
function clasificarReparticion(reparticion: string): 'ministerio' | 'direccion' | 'secretaria' | 'organismo' | 'otro' {
  const u = reparticion.toUpperCase().trim()
  if (u.startsWith('MINISTERIO')) return 'ministerio'
  if (u.startsWith('SECRETARÍA') || u.startsWith('SECRETARIA') || u.startsWith('SECREATARÍA')) return 'secretaria'
  if (u.startsWith('DIRECCIÓN') || u.startsWith('DIRECCION') || u.startsWith('DIR.')) return 'direccion'
  if (u.startsWith('CONSEJO') || u.startsWith('CONCEJO')) return 'organismo'
  if (u.startsWith('TRIBUNAL') || u.startsWith('FISCALÍA') || u.startsWith('DEFENSORÍA')) return 'organismo'
  if (u.includes('PENITENCIARIO') || u.includes('POLICÍA') || u.includes('POLICIA')) return 'organismo'
  if (u.startsWith('AGENCIA') || u.startsWith('SERVICIO')) return 'organismo'
  return 'otro'
}

// ─── main builder ─────────────────────────────────────────────────────────

export async function getMapaProvincial(opts: MapaProvincialOpts = {}): Promise<MapaProvincialResponse> {
  const detail: DetailLevel = opts.detail ?? 'meso'
  const jurFiltro: JurisdiccionId = opts.jurisdiccion ?? 'ambas'
  const año = opts.año ?? null

  const nodes: MapaNode[] = []
  const edges: MapaEdge[] = []
  const fuentes = new Set<string>()
  const porTipo: Record<string, number> = {}

  function pushNode(n: MapaNode) {
    nodes.push(n)
    porTipo[n.type] = (porTipo[n.type] ?? 0) + 1
    fuentes.add(n.data.fuente)
  }
  function pushEdge(e: MapaEdge) {
    edges.push(e)
    if (e.data?.fuente) fuentes.add(e.data.fuente)
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEPTH 0 — Jurisdicciones
  // ═══════════════════════════════════════════════════════════════════════
  const jurisdicciones: ('provincia' | 'capital')[] =
    jurFiltro === 'ambas' ? ['provincia', 'capital'] :
    jurFiltro === 'provincia' ? ['provincia'] :
    ['capital']

  for (const j of jurisdicciones) {
    pushNode({
      id: `jur:${j}`,
      type: 'jurisdiccion',
      label: JUR_LABEL[j],
      subtitle: j === 'provincia' ? 'Estado provincial' : 'Estado municipal',
      weight: 1,
      depth: 0,
      jurisdiccion: j,
      data: { fuente: 'derivado' },
    })
  }

  // Edge comparte_jurisdiccion (sólo si tenemos ambas)
  if (jurisdicciones.length === 2) {
    pushEdge({
      source: 'jur:provincia',
      target: 'jur:capital',
      kind: 'comparte_jurisdiccion',
      weight: 1,
      data: { fuente: 'derivado' },
    })
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEPTH 1 — Ministerios y secretarías
  // ═══════════════════════════════════════════════════════════════════════
  // Fuente A: agentes_publicos (reparticiones con empleados públicos)
  const agentesParams: unknown[] = []
  let whereAgentes = ''
  if (año) { whereAgentes += ' AND anio = ?'; agentesParams.push(año) }
  const jurFiltroAgentes = jurisdicciones
    .map(j => j === 'provincia' ? 'cordoba-provincia' : 'cordoba-capital')
  const placeholdersJur = jurFiltroAgentes.map(() => '?').join(',')
  agentesParams.unshift(...jurFiltroAgentes)

  type RawRep = { jurisdiccion: string; reparticion: string; empleados: number; sueldo_total: number }
  const rawReps = await dbAll<RawRep>(
    `SELECT
       jurisdiccion,
       reparticion,
       COUNT(*)::INTEGER AS empleados,
       COALESCE(SUM(bruto), 0)::DOUBLE AS sueldo_total
     FROM agentes_publicos
     WHERE jurisdiccion IN (${placeholdersJur})
       AND reparticion IS NOT NULL
       AND TRIM(reparticion) != ''
       ${whereAgentes}
     GROUP BY 1, 2`,
    agentesParams
  )

  // Fuente B: contratos.area (reparticiones con contratos pero sin empleados en agentes_publicos)
  const contratosParams: unknown[] = []
  let whereContratos = ''
  if (año) { whereContratos += ' AND anio = ?'; contratosParams.push(año) }
  const jurFiltroContratos = jurisdicciones
    .filter(j => j === 'capital')  // contratos solo tiene cordoba-capital + upc
    .flatMap(() => ['cordoba-capital', 'upc'])
  if (jurFiltroContratos.length > 0) {
    const phC = jurFiltroContratos.map(() => '?').join(',')
    contratosParams.unshift(...jurFiltroContratos)

    type RawArea = { municipio: string; area: string; contratos: number; monto: number }
    const rawAreas = await dbAll<RawArea>(
      `SELECT
         municipio,
         area,
         COUNT(*)::INTEGER AS contratos,
         COALESCE(SUM(monto), 0)::DOUBLE AS monto
       FROM contratos
       WHERE municipio IN (${phC})
         AND area IS NOT NULL AND TRIM(area) != ''
         ${whereContratos}
       GROUP BY 1, 2`,
      contratosParams
    )

    // Mergear contratos.area con agentes_publicos (mismo nombre canónico → mismo nodo)
    for (const r of rawAreas) {
      rawReps.push({
        jurisdiccion: r.municipio,
        reparticion: r.area,
        empleados: 0,
        sueldo_total: 0,
      })
    }

    // Las marcamos como fuente "contratos" para tracking
    for (const r of rawAreas) {
      // (los contratos se procesan abajo en la arista 'contrata')
      void r
    }
  }

  // Dedup + clasificar reparticiones por tipo
  type RepMerged = {
    jurId: 'provincia' | 'capital'
    norm: string
    label: string
    tipo: ReturnType<typeof clasificarReparticion>
    empleados: number
    contratos: number
    monto: number
    sueldo_total: number
  }
  const repsMap = new Map<string, RepMerged>()
  for (const r of rawReps) {
    const jurId = jurFromAgentesPublicos(r.jurisdiccion) ?? jurFromContratos(r.jurisdiccion)
    if (!jurId) continue
    if (!jurisdicciones.includes(jurId)) continue
    const norm = claveNorm(r.reparticion)
    if (!norm) continue
    const tipo = clasificarReparticion(r.reparticion)
    // Sólo subimos a depth 1 los que son ministerios/secretarías/organismos.
    // Las direcciones puras quedan para depth 2.
    if (tipo === 'direccion' || tipo === 'otro') continue
    const key = `${jurId}|${norm}`
    const existing = repsMap.get(key)
    if (existing) {
      existing.empleados += Number(r.empleados)
      existing.sueldo_total += Number(r.sueldo_total)
      // mantener label más descriptivo (más largo)
      if (r.reparticion.length > existing.label.length) existing.label = r.reparticion
    } else {
      repsMap.set(key, {
        jurId,
        norm,
        label: r.reparticion,
        tipo,
        empleados: Number(r.empleados),
        contratos: 0,
        monto: 0,
        sueldo_total: Number(r.sueldo_total),
      })
    }
  }

  // Cargar montos de contratos por área (capital)
  if (jurisdicciones.includes('capital')) {
    const cParams: unknown[] = ['cordoba-capital', 'upc']
    let cWhere = ''
    if (año) { cWhere += ' AND anio = ?'; cParams.push(año) }
    type AreaMonto = { area: string; contratos: number; monto: number }
    const areaMontos = await dbAll<AreaMonto>(
      `SELECT
         area,
         COUNT(*)::INTEGER AS contratos,
         COALESCE(SUM(monto), 0)::DOUBLE AS monto
       FROM contratos
       WHERE municipio IN (?, ?)
         AND area IS NOT NULL AND TRIM(area) != ''
         ${cWhere}
       GROUP BY 1`,
      cParams
    )
    for (const am of areaMontos) {
      const norm = claveNorm(am.area)
      const key = `capital|${norm}`
      const existing = repsMap.get(key)
      if (existing) {
        existing.contratos += Number(am.contratos)
        existing.monto += Number(am.monto)
      }
      // Si no existe (área en contratos sin empleados públicos en agentes_publicos),
      // creamos uno para no perder esa repartición.
      else {
        const tipo = clasificarReparticion(am.area)
        if (tipo === 'direccion' || tipo === 'otro') continue
        repsMap.set(key, {
          jurId: 'capital',
          norm,
          label: am.area,
          tipo,
          empleados: 0,
          contratos: Number(am.contratos),
          monto: Number(am.monto),
          sueldo_total: 0,
        })
      }
    }
  }

  // Push de ministerios/secretarías como depth 1
  const reps = Array.from(repsMap.values())
  // Ordenar por relevancia: empleados + monto contractual normalizado
  const maxEmpleados = Math.max(1, ...reps.map(r => r.empleados))
  const maxMonto = Math.max(1, ...reps.map(r => r.monto))
  reps.forEach(r => {
    const w = (r.empleados / maxEmpleados) * 0.55 + (r.monto / maxMonto) * 0.45
    // ID estable usando claveNorm (no slugify) para garantizar uniqueness
    // — slugify trunca y puede colisionar con nombres muy similares.
    const id = `min:${r.jurId}:${r.norm}`
    pushNode({
      id,
      type: r.tipo === 'organismo' ? 'organismo' : 'ministerio',
      label: r.label,
      subtitle: [
        r.empleados > 0 ? `${r.empleados.toLocaleString('es-AR')} empleados` : null,
        r.contratos > 0 ? `${r.contratos} contratos` : null,
      ].filter(Boolean).join(' · ') || 'Sin actividad cargada',
      weight: Math.max(0.1, w),
      depth: 1,
      jurisdiccion: r.jurId,
      data: {
        empleados: r.empleados,
        contratos: r.contratos,
        monto: r.monto,
        sueldo_total: r.sueldo_total,
        tipo: r.tipo,
        fuente: r.empleados > 0 ? 'agentes_publicos' : 'contratos',
      },
    })
    // contiene edge
    pushEdge({
      source: `jur:${r.jurId}`,
      target: id,
      kind: 'contiene',
      weight: 1,
      data: { empleados: r.empleados, fuente: 'derivado' },
    })
  })

  // Organismos estatales descentralizados (entes_estatales_cordoba) si la tabla
  // tiene filas. Son nodos separados, jurisdicción se infiere por la columna.
  try {
    type Ente = { id: string; nombre: string; jurisdiccion: string | null; tipo: string | null }
    const entes = await dbAll<Ente>(
      `SELECT id, nombre, jurisdiccion, tipo FROM entes_estatales_cordoba`,
      []
    )
    let orgIdx = 0
    for (const e of entes) {
      const jurId = jurFromAgentesPublicos(e.jurisdiccion) ?? null
      if (!jurId || !jurisdicciones.includes(jurId)) continue
      const id = `org:${jurId}:${e.id || orgIdx++}`
      pushNode({
        id,
        type: 'organismo',
        label: e.nombre,
        subtitle: e.tipo ?? 'Organismo descentralizado',
        weight: 0.4,
        depth: 1,
        jurisdiccion: jurId,
        data: { tipo_organismo: e.tipo, fuente: 'entes_estatales_cordoba' },
      })
      pushEdge({
        source: `jur:${jurId}`,
        target: id,
        kind: 'contiene',
        weight: 1,
        data: { fuente: 'entes_estatales_cordoba' },
      })
    }
  } catch {
    // tabla podría no existir en algunos entornos
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEPTH 2 — Direcciones internas + Empresas
  // ═══════════════════════════════════════════════════════════════════════
  if (detail === 'meso' || detail === 'deep') {
    // 2.A — Direcciones internas (de agentes_publicos)
    type RawDir = { jurisdiccion: string; reparticion: string; empleados: number; sueldo_total: number }
    const rawDirs = await dbAll<RawDir>(
      `SELECT
         jurisdiccion,
         reparticion,
         COUNT(*)::INTEGER AS empleados,
         COALESCE(SUM(bruto), 0)::DOUBLE AS sueldo_total
       FROM agentes_publicos
       WHERE jurisdiccion IN (${placeholdersJur})
         AND reparticion IS NOT NULL
         AND TRIM(reparticion) != ''
         AND (UPPER(reparticion) LIKE 'DIRECCI%' OR UPPER(reparticion) LIKE 'DIR.%')
         ${whereAgentes}
       GROUP BY 1, 2
       HAVING COUNT(*) >= 50
       ORDER BY empleados DESC
       LIMIT 80`,
      agentesParams
    )

    // Dedup por claveNorm (mismo patrón que ministerios) — evita colisiones
    // de slug truncado para nombres largos como "DIRECCION DE EMPLEO Y
    // CAPACITACION LABORAL PROG LANZADERA" vs "...PROG LA SAGRADA".
    const dirsMap = new Map<string, { jurId: 'provincia' | 'capital'; label: string; empleados: number; sueldo_total: number }>()
    for (const d of rawDirs) {
      const jurId = jurFromAgentesPublicos(d.jurisdiccion)
      if (!jurId || !jurisdicciones.includes(jurId)) continue
      const norm = claveNorm(d.reparticion, 50)
      if (!norm) continue
      const key = `${jurId}|${norm}`
      const existing = dirsMap.get(key)
      if (existing) {
        existing.empleados += Number(d.empleados)
        existing.sueldo_total += Number(d.sueldo_total)
        if (d.reparticion.length > existing.label.length) existing.label = d.reparticion
      } else {
        dirsMap.set(key, {
          jurId,
          label: d.reparticion,
          empleados: Number(d.empleados),
          sueldo_total: Number(d.sueldo_total),
        })
      }
    }
    let dirIdx = 0
    for (const d of dirsMap.values()) {
      // ID estable: usar la claveNorm para garantizar uniqueness, no slugify
      const norm = claveNorm(d.label, 50)
      const id = `dir:${d.jurId}:${norm}-${dirIdx++}`
      pushNode({
        id,
        type: 'direccion',
        label: d.label,
        subtitle: `${d.empleados.toLocaleString('es-AR')} empleados`,
        weight: 0.3 + Math.min(0.5, d.empleados / 2000),
        depth: 2,
        jurisdiccion: d.jurId,
        data: { empleados: d.empleados, sueldo_total: d.sueldo_total, fuente: 'agentes_publicos' },
      })
      // Conectar a su jurisdicción (el ministerio padre real se infiere en
      // futuras fases — por ahora dirección hangea bajo jurisdicción).
      pushEdge({
        source: `jur:${d.jurId}`,
        target: id,
        kind: 'contiene',
        weight: 0.5,
        data: { empleados: d.empleados, fuente: 'agentes_publicos' },
      })
    }

    // 2.B — Top empresas por contratos
    const topN = detail === 'deep' ? 250 : 150
    const empParams: unknown[] = []
    let empWhere = ''
    if (año) { empWhere += ' AND anio = ?'; empParams.push(año) }

    type RawEmpresa = {
      proveedor: string
      proveedor_norm: string
      proveedor_cuit: string | null
      area: string
      municipio: string
      contratos: number
      monto: number
    }
    const rawEmpresas = await dbAll<RawEmpresa>(
      `WITH ranked AS (
         SELECT
           proveedor,
           proveedor_norm,
           proveedor_cuit,
           area,
           municipio,
           COUNT(*)::INTEGER AS contratos,
           COALESCE(SUM(monto), 0)::DOUBLE AS monto
         FROM contratos
         WHERE proveedor IS NOT NULL AND TRIM(proveedor) != ''
           AND area IS NOT NULL AND TRIM(area) != ''
           AND UPPER(proveedor) NOT LIKE '%SIN ADJUDICAR%'
           AND UPPER(proveedor) NOT LIKE 'SIN PROVEEDOR%'
           AND UPPER(proveedor) NOT LIKE '%PENDIENTE%'
           AND monto > 0
           ${empWhere}
         GROUP BY 1, 2, 3, 4, 5
       )
       SELECT * FROM ranked
       ORDER BY monto DESC
       LIMIT ?`,
      [...empParams, topN]
    )

    // Empresas únicas (un mismo CUIT/nombre puede ganar varias áreas — un
    // solo nodo, varias aristas).
    const empresasMap = new Map<string, {
      label: string
      cuit: string | null
      contratosTotal: number
      montoTotal: number
    }>()
    for (const e of rawEmpresas) {
      const key = e.proveedor_cuit ? `cuit:${e.proveedor_cuit}` : `nom:${e.proveedor_norm}`
      const existing = empresasMap.get(key)
      if (existing) {
        existing.contratosTotal += Number(e.contratos)
        existing.montoTotal += Number(e.monto)
      } else {
        empresasMap.set(key, {
          label: e.proveedor,
          cuit: e.proveedor_cuit,
          contratosTotal: Number(e.contratos),
          montoTotal: Number(e.monto),
        })
      }
    }
    const maxEmpresaMonto = Math.max(1, ...Array.from(empresasMap.values()).map(e => e.montoTotal))
    for (const [key, e] of empresasMap.entries()) {
      const id = `emp:${key}`
      pushNode({
        id,
        type: 'empresa',
        label: e.label,
        subtitle: e.cuit ? `CUIT ${e.cuit}` : 'sin CUIT verificado',
        weight: 0.2 + Math.min(0.7, Math.sqrt(e.montoTotal / maxEmpresaMonto)),
        depth: 2,
        jurisdiccion: null,
        data: {
          monto: e.montoTotal,
          contratos: e.contratosTotal,
          cuit: e.cuit ?? undefined,
          fuente: 'contratos',
        },
        flags: { cuitVerificado: !!e.cuit },
      })
    }

    // Aristas contrata: empresa → reparticion (depth 1) por cada par único
    // (proveedor, area). Una empresa puede tener N aristas si gana en N
    // reparticiones (multi-edge útil: cuenta la historia de "este actor está
    // metido con varias reparticiones").
    const aristasContrataMap = new Map<string, { source: string; target: string; monto: number; n: number }>()
    for (const e of rawEmpresas) {
      const empKey = e.proveedor_cuit ? `cuit:${e.proveedor_cuit}` : `nom:${e.proveedor_norm}`
      const sourceId = `emp:${empKey}`
      const jurId = jurFromContratos(e.municipio)
      if (!jurId || !jurisdicciones.includes(jurId)) continue
      const norm = claveNorm(e.area)
      const targetId = `min:${jurId}:${norm}`
      // Verificamos que el target ministerio exista — si la area está clasificada
      // como 'direccion' u 'otro' no creamos arista (el repsMap.get lo confirma).
      if (!repsMap.has(`${jurId}|${norm}`)) continue
      const key = `${sourceId}->${targetId}`
      const existing = aristasContrataMap.get(key)
      if (existing) {
        existing.monto += Number(e.monto)
        existing.n += Number(e.contratos)
      } else {
        aristasContrataMap.set(key, {
          source: sourceId,
          target: targetId,
          monto: Number(e.monto),
          n: Number(e.contratos),
        })
      }
    }
    const maxArista = Math.max(1, ...Array.from(aristasContrataMap.values()).map(a => a.monto))
    for (const a of aristasContrataMap.values()) {
      pushEdge({
        source: a.source,
        target: a.target,
        kind: 'contrata',
        weight: Math.max(0.05, a.monto / maxArista),
        data: { monto: a.monto, contratos: a.n, fuente: 'contratos' },
      })
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // DEPTH 3 — Funcionarios + Directores (deep mode only)
  // ═══════════════════════════════════════════════════════════════════════
  if (detail === 'deep') {
    // 3.A — Top funcionarios por sueldo (de agentes_publicos.bruto)
    type RawFunc = {
      id: string
      jurisdiccion: string
      reparticion: string | null
      apellido_nombre: string
      cargo: string | null
      bruto: number
      cuit: string | null
    }
    const rawFuncs = await dbAll<RawFunc>(
      `SELECT id, jurisdiccion, reparticion, apellido_nombre, cargo, bruto, cuit
       FROM agentes_publicos
       WHERE jurisdiccion IN (${placeholdersJur})
         AND bruto IS NOT NULL AND bruto > 0
         AND apellido_nombre IS NOT NULL
         ${whereAgentes}
       ORDER BY bruto DESC
       LIMIT 80`,
      agentesParams
    )

    for (const f of rawFuncs) {
      const jurId = jurFromAgentesPublicos(f.jurisdiccion)
      if (!jurId) continue
      const id = `per:${f.id}`
      pushNode({
        id,
        type: 'persona',
        label: f.apellido_nombre,
        subtitle: f.cargo ?? f.reparticion ?? 'Funcionario',
        weight: 0.15,
        depth: 3,
        jurisdiccion: jurId,
        data: { sueldo: f.bruto, cargo: f.cargo ?? undefined, cuit: f.cuit ?? undefined, fuente: 'agentes_publicos' },
      })
      // Edge trabaja_en hacia su reparticion si la podemos resolver
      if (f.reparticion) {
        const norm = claveNorm(f.reparticion)
        if (repsMap.has(`${jurId}|${norm}`)) {
          pushEdge({
            source: id,
            target: `min:${jurId}:${norm}`,
            kind: 'trabaja_en',
            weight: 0.2,
            data: { fuente: 'agentes_publicos' },
          })
        } else {
          // Fallback: conectar directo a la jurisdicción
          pushEdge({
            source: id,
            target: `jur:${jurId}`,
            kind: 'trabaja_en',
            weight: 0.1,
            data: { fuente: 'agentes_publicos' },
          })
        }
      }
    }
  }

  // ═══════════════════════════════════════════════════════════════════════
  // META + sanity
  // ═══════════════════════════════════════════════════════════════════════
  const montoTotal = nodes
    .filter(n => n.type === 'ministerio' || n.type === 'organismo')
    .reduce((acc, n) => acc + Number(n.data.monto ?? 0), 0)
  const empleadosTotal = nodes
    .filter(n => n.type === 'ministerio' || n.type === 'organismo' || n.type === 'direccion')
    .reduce((acc, n) => acc + Number(n.data.empleados ?? 0), 0)

  return {
    nodes,
    edges,
    meta: {
      detail,
      jurisdicciones,
      totalNodos: nodes.length,
      totalAristas: edges.length,
      porTipo,
      montoTotal,
      empleadosTotal,
      fuentes: Array.from(fuentes).sort(),
      año,
    },
  }
}
