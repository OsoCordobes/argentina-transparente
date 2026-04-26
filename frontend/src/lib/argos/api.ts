/**
 * argos/api.ts
 *
 * Capa de API para el modo Explorar (ARGOS v2).
 *
 * Dos adapters detrás de una sola interface ArgosApi:
 *   - mockApi: lee `@/data/argosMock` (datos sintéticos en memoria).
 *   - httpApi: apunta al backend Express real (Fase 4 del plan-beta).
 *
 * Migrado desde `.tmp-argos-v2/argos/api.jsx`. Las funciones internas
 *   `neighborhood`, `buildDetail`, `craftAnswer`, `answerInContext`,
 *   `resolveEntities`
 * son traducciones 1:1 desde el .jsx original.
 *
 * IMPORTANTE — CLAUDE.md §2: los datos del mockApi son SINTÉTICOS y se
 * usan únicamente para desarrollo/UI. NO se publican como hallazgos.
 */

import type {
  ArgosNode,
  ArgosNodeType,
  ArgosEdge,
  ArgosGraph,
  ArgosSeveridad,
  KPI,
  Relacion,
  Fuente,
  NodeDetail,
  ChatMessage,
  ChatChunk,
  ChatContext,
} from './types'
import ArgosMock from '@/data/argosMock'
import { fmtARS } from '../format'

// ─── Public interface ──────────────────────────────────────────────────────────

export interface ArgosApi {
  /** Snapshot completo del grafo (nodes + edges). */
  getGraphSnapshot(): Promise<ArgosGraph>
  /** Vecindario BFS desde un nodo. depth controla la profundidad (default 2). */
  getGraphNeighborhood(
    centerId: string,
    depth?: number
  ): Promise<ArgosGraph & { centerId: string }>
  /** Detalle del nodo (KPIs, relaciones, señales, fuentes) listo para el panel. */
  getNodeDetail(type: ArgosNodeType, id: string): Promise<NodeDetail | null>
  /** Búsqueda fuzzy por label. Filtros opcionales por tipo y límite (default 20). */
  searchEntities(
    query: string,
    opts?: { types?: ArgosNodeType[]; limit?: number }
  ): Promise<ArgosNode[]>
  /**
   * Chat en streaming. Llama `onChunk` por cada delta y un último chunk con
   * `{ done: true }`. El primer chunk puede traer entidades resueltas/foco.
   */
  chat(
    messages: ChatMessage[],
    context: ChatContext | null,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<void>
}

// ─── Helpers internos ──────────────────────────────────────────────────────────

const sleep = (ms: number): Promise<void> =>
  new Promise((r) => setTimeout(r, ms))

/** Clon defensivo en runtimes que tengan structuredClone, fallback JSON. */
function clone<T>(v: T): T {
  if (typeof structuredClone === 'function') {
    return structuredClone(v)
  }
  return JSON.parse(JSON.stringify(v)) as T
}

/** Extrae el id de un endpoint de edge (string o ArgosNode). */
function edgeId(end: string | ArgosNode): string {
  return typeof end === 'string' ? end : end.id
}

/** Lookup por id contra el grafo del mock. */
function nodeById(id: string): ArgosNode | null {
  return ArgosMock.GRAPH.nodes.find((n) => n.id === id) ?? null
}

function fmtCuit(c: string): string {
  return c.replace(/(\d{2})(\d{8})(\d{1})/, '$1-$2-$3')
}

// ─── Date helpers (migrados 1:1 desde el .jsx) ─────────────────────────────────

function parseInicio(str: string | null | undefined): Date | null {
  if (!str) return null
  const s = String(str).trim()
  const m1 = s.match(/^(\d{2})\/(\d{2})\/(\d{4})$/)
  if (m1) return new Date(+m1[3], +m1[2] - 1, +m1[1])
  const m2 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (m2) return new Date(+m2[1], +m2[2] - 1, +m2[3])
  const m3 = s.match(/^(\d{4})$/)
  if (m3) return new Date(+m3[1], 0, 1)
  return null
}

function yearsActiveOf(str: string | null | undefined): number | null {
  const d = parseInicio(str)
  if (!d) return null
  const today = new Date('2026-04-25')
  return Math.floor(
    (today.getTime() - d.getTime()) / (365.25 * 24 * 3600 * 1000)
  )
}

function shortDate(str: string | null | undefined): string {
  const d = parseInicio(str)
  if (!d) return str || '—'
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

// ─── neighborhood (BFS sobre edges) ────────────────────────────────────────────

/** BFS sobre las aristas hasta `depth` saltos. Migrado 1:1 desde api.jsx. */
function neighborhood(
  centerId: string,
  depth = 2
): ArgosGraph & { centerId: string } {
  const seen = new Set<string>([centerId])
  let frontier: string[] = [centerId]

  for (let d = 0; d < depth; d++) {
    const next: string[] = []
    ArgosMock.GRAPH.edges.forEach((e) => {
      const s = edgeId(e.source)
      const t = edgeId(e.target)
      if (frontier.includes(s) && !seen.has(t)) {
        seen.add(t)
        next.push(t)
      }
      if (frontier.includes(t) && !seen.has(s)) {
        seen.add(s)
        next.push(s)
      }
    })
    frontier = next
    if (!frontier.length) break
  }

  const nodes = ArgosMock.GRAPH.nodes.filter((n) => seen.has(n.id))
  const edges = ArgosMock.GRAPH.edges.filter((e) => {
    const s = edgeId(e.source)
    const t = edgeId(e.target)
    return seen.has(s) && seen.has(t)
  })

  return { nodes: clone(nodes), edges: clone(edges), centerId }
}

// ─── buildDetail (KPIs / relaciones / señales / fuentes) ───────────────────────

interface RawSenalShape {
  id: string
  tipologia: string
  score: number
  severidad: ArgosSeveridad
  label: string
  resumen: string
  articulos: string[]
  denunciar: string[]
  evidencia: { descripcion: string; fuenteUrl: string }[]
  target?: { id: string; type: string }
}

function buildSignalForOutput(s: RawSenalShape | undefined | null) {
  if (!s) return null
  return {
    id: s.id,
    titulo: s.label,
    resumen: s.resumen,
    severidad: s.severidad,
    score: s.score,
    evidencia: s.evidencia,
    legal: { articulos: s.articulos, denunciarAnte: s.denunciar },
  }
}

/** Migrado 1:1 desde api.jsx — construye un NodeDetail según el tipo de nodo. */
function buildDetail(node: ArgosNode | null): NodeDetail | null {
  if (!node) return null

  const kpis: KPI[] = []
  const relaciones: Relacion[] = []
  const senales: NodeDetail['señales'] = []
  const fuentes: Fuente[] = []

  const edgeOf = (id: string): ArgosEdge[] =>
    ArgosMock.GRAPH.edges.filter((e) => {
      const s = edgeId(e.source)
      const t = edgeId(e.target)
      return s === id || t === id
    })

  // Las señales del mock están tipadas como ArgosNode pero internamente
  // M.SEN es la lista de señales crudas (con .target.id). Las leemos así.
  const SEN = ArgosMock.SEN as unknown as RawSenalShape[]
  const PROV = ArgosMock.PROV as unknown as Array<{
    cuit: string
    razon: string
    monto: number
    n: number
    jur: string[]
    inicio: string
    actividadPrincipal?: string
  }>
  const DIR = ArgosMock.DIR as unknown as Array<{
    id: string
    label: string
    empresas: string[]
  }>

  if (node.type === 'jurisdiccion') {
    const d = node.data as {
      total_contratos: number
      monto_total: number
      anio_min: number
      anio_max: number
      total_señales: number
    }
    const sigs = SEN.filter((s) => s.target?.id === node.id)
    const gravesCount = sigs.filter((s) => s.severidad === 'grave').length
    const moderadasCount = sigs.filter(
      (s) => s.severidad === 'moderada'
    ).length
    const trend = [
      Math.round(d.total_contratos * 0.18),
      Math.round(d.total_contratos * 0.2),
      Math.round(d.total_contratos * 0.22),
      Math.round(d.total_contratos * 0.21),
      Math.round(d.total_contratos * 0.19),
    ]

    kpis.push({
      label: 'Contratos',
      value: d.total_contratos.toLocaleString('es-AR'),
      format: 'count',
    })
    kpis.push({ label: 'Monto total', amount: d.monto_total, format: 'currency' })
    kpis.push({
      label: 'Período',
      value: `${d.anio_min}–${d.anio_max}`,
      format: 'date',
      sub: `${d.anio_max - d.anio_min + 1} años de datos`,
    })
    kpis.push({
      label: 'Señales activas',
      value: String(d.total_señales),
      format: 'count',
      sub: `<span class="grave">${gravesCount} graves</span> · <span class="moderada">${moderadasCount} moderadas</span>`,
    })
    kpis.push({ label: 'Tendencia anual', value: '', format: 'trend', trend })

    edgeOf(node.id).forEach((e) => {
      const sId = edgeId(e.source)
      const tId = edgeId(e.target)
      const otherId = sId === node.id ? tId : sId
      const o = nodeById(otherId)
      if (!o || o.id === node.id) return
      if (relaciones.find((r) => r.node.id === o.id)) return
      relaciones.push({ node: o, via: e.kind, weight: e.weight })
    })

    sigs.forEach((s) => {
      const built = buildSignalForOutput(s)
      if (built) senales.push(built)
    })

    fuentes.push({
      url: `https://gobiernoabierto.${node.id.split('-')[0]}.gob.ar`,
      descripcion: 'Portal de gobierno abierto',
      fechaAcceso: '2026-04-15',
    })
  } else if (node.type === 'proveedor') {
    const d = node.data as {
      cuit: string
      inicioActividades: string
      montoTotal: number
      totalContratos: number
      municipios: string[]
      actividadPrincipal?: string
      estado?: string
      fuenteUrl?: string
    }
    const flags = node.flags
    const sigs = SEN.filter((s) => s.target?.id === node.id)
    const hasGrave = sigs.some((s) => s.severidad === 'grave')
    const yrs = yearsActiveOf(d.inicioActividades)

    kpis.push({ label: 'Monto total', amount: d.montoTotal, format: 'currency' })
    kpis.push({
      label: 'Contratos',
      value: String(d.totalContratos),
      format: 'count',
      sub: `${(d.montoTotal / Math.max(d.totalContratos, 1) / 1e6).toFixed(1).replace('.', ',')}M ARS promedio`,
    })
    kpis.push({
      label: 'CUIT',
      value: d.cuit,
      format: 'text',
      sub: flags?.verificadoAfip
        ? '<span style="color:var(--verde)">Verificado AFIP</span>'
        : 'Sin verificar AFIP',
    })
    kpis.push({
      label: 'Inicio actividad',
      value: shortDate(d.inicioActividades),
      format: 'date',
      sub: yrs != null ? `${yrs} año${yrs !== 1 ? 's' : ''} activo` : '',
    })

    if (sigs.length > 0) {
      const gravesN = sigs.filter((s) => s.severidad === 'grave').length
      kpis.push({
        label: 'Señales',
        value: String(sigs.length),
        format: 'count',
        sub: hasGrave
          ? `<span class="grave">${gravesN} grave${gravesN === 1 ? '' : 's'} activa${gravesN === 1 ? '' : 's'}</span>`
          : `${sigs.length} moderada${sigs.length === 1 ? '' : 's'}`,
      })
    }

    edgeOf(node.id).forEach((e) => {
      const sId = edgeId(e.source)
      const tId = edgeId(e.target)
      const otherId = sId === node.id ? tId : sId
      const o = nodeById(otherId)
      if (!o || o.id === node.id) return
      if (relaciones.find((r) => r.node.id === o.id)) return
      relaciones.push({ node: o, via: e.kind, weight: e.weight })
    })

    sigs.forEach((s) => {
      const built = buildSignalForOutput(s)
      if (built) senales.push(built)
    })

    fuentes.push({
      url: d.fuenteUrl ?? '',
      descripcion: 'Fuente oficial de contrataciones',
      fechaAcceso: '2026-04-15',
    })
    fuentes.push({
      url: 'https://serviciosweb.afip.gob.ar/genericos/cInscripcion/consulta.aspx',
      descripcion: 'Padrón AFIP',
      fechaAcceso: '2026-04-12',
    })
  } else if (node.type === 'director') {
    const d = node.data as { empresas: string[] }
    kpis.push({
      label: 'Empresas',
      value: String(d.empresas.length),
      format: 'count',
      sub: d.empresas.length > 1 ? 'Director en múltiples firmas' : '',
    })
    const totalMonto = d.empresas.reduce((acc, c) => {
      const p = PROV.find((x) => x.cuit === c)
      return acc + (p?.monto || 0)
    }, 0)
    kpis.push({ label: 'Monto agregado', amount: totalMonto, format: 'currency' })

    d.empresas.forEach((c) => {
      const o = nodeById(c)
      if (o) relaciones.push({ node: o, via: 'tiene_director', weight: 0.5 })
    })

    fuentes.push({
      url: 'https://www.argentina.gob.ar/justicia/igj',
      descripcion: 'Inspección General de Justicia',
      fechaAcceso: '2026-04-10',
    })
  } else if (node.type === 'contrato') {
    const d = node.data as {
      monto: number
      tipo: string
      anio: number
      numeroExpediente?: string
      proveedorCuit: string
      jurId: string
      fuenteUrl?: string
    }
    kpis.push({ label: 'Monto', amount: d.monto, format: 'currency' })
    kpis.push({ label: 'Modalidad', value: d.tipo, format: 'text' })
    kpis.push({ label: 'Año', value: String(d.anio), format: 'date' })
    kpis.push({
      label: 'Expediente',
      value: d.numeroExpediente || '—',
      format: 'text',
    })

    // proveedorCuit en data viene formateado (XX-XXXXXXXX-X). Buscamos su raw.
    const provRaw = PROV.find((p) => fmtCuit(p.cuit) === d.proveedorCuit)
    const provNode = provRaw ? nodeById(provRaw.cuit) : null
    if (provNode) relaciones.push({ node: provNode, via: 'gano', weight: 0.6 })
    const jurNode = nodeById(d.jurId)
    if (jurNode) relaciones.push({ node: jurNode, via: 'opera_en', weight: 0.4 })

    fuentes.push({
      url: d.fuenteUrl ?? '',
      descripcion: 'Dataset oficial del contrato',
      fechaAcceso: '2026-04-15',
    })
  } else if (node.type === 'señal') {
    const d = node.data as {
      score: number
      tipologia: string
      legal: { severidad: string; articulos: string[]; denunciarAnte: string[] }
      evidencia: { descripcion: string; fuenteUrl: string }[]
      target?: { id: string }
    }
    kpis.push({ label: 'Score', value: String(d.score), format: 'count' })
    kpis.push({
      label: 'Severidad',
      value: d.legal.severidad.toUpperCase(),
      format: 'text',
    })
    kpis.push({ label: 'Tipología', value: d.tipologia, format: 'text' })
    kpis.push({
      label: 'Evidencia',
      value: String(d.evidencia.length),
      format: 'count',
    })

    if (d.target?.id) {
      const t = nodeById(d.target.id)
      if (t) relaciones.push({ node: t, via: 'señalado_por', weight: 0.7 })
    }

    const raw = SEN.find((s) => s.id === node.id)
    const built = buildSignalForOutput(raw)
    if (built) senales.push(built)

    d.evidencia.forEach((ev) =>
      fuentes.push({
        url: ev.fuenteUrl,
        descripcion: ev.descripcion,
        fechaAcceso: '2026-04-15',
      })
    )
  }

  return { node, kpis, relaciones, señales: senales, fuentes }
}

// ─── resolveEntities + craftAnswer + answerInContext (chat dispatcher) ─────────

interface ResolvedHit {
  id: string
  type: ArgosNodeType
  label: string
}

interface ResolveResult {
  entities: ResolvedHit[]
  focusId: string | null
}

/** Migrado 1:1 desde api.jsx. Detecta entidades mencionadas en el query. */
function resolveEntities(query: string): ResolveResult {
  const q = query.toLowerCase()
  const hits: ResolvedHit[] = []
  const focus: string[] = []

  const PROV = ArgosMock.PROV as unknown as Array<{
    cuit: string
    razon: string
  }>
  const DIR = ArgosMock.DIR as unknown as Array<{ id: string; label: string }>
  const SEN = ArgosMock.SEN as unknown as Array<{ id: string; label: string }>

  // CUIT
  const cuitMatch = q.match(/\d{2}-?\d{8}-?\d{1}/)
  if (cuitMatch) {
    const cuit = cuitMatch[0].replace(/-/g, '')
    const p = nodeById(cuit)
    if (p) {
      hits.push({ id: p.id, type: p.type, label: p.label })
      focus.push(p.id)
    }
  }

  // jurisdicciones
  const jurKeys: { k: string[]; id: string }[] = [
    { k: ['córdoba capital', 'cordoba capital', 'municipalidad de córdoba', 'córdoba', 'cordoba'], id: 'cordoba-capital' },
    { k: ['río cuarto', 'rio cuarto'], id: 'rio-cuarto' },
    { k: ['villa maría', 'villa maria'], id: 'villa-maria' },
    { k: ['salta'], id: 'salta-capital' },
    { k: ['rosario'], id: 'rosario' },
  ]
  jurKeys.forEach((j) => {
    if (j.k.some((t) => q.includes(t))) {
      const n = nodeById(j.id)
      if (n && !hits.find((h) => h.id === n.id)) {
        hits.push({ id: n.id, type: n.type, label: n.label })
        focus.push(n.id)
      }
    }
  })

  // señales
  if (/(señal|senal|riesgo|alerta|sospech|fraude|irregular)/.test(q)) {
    SEN.slice(0, 4).forEach((s) => {
      if (!hits.find((h) => h.id === s.id)) {
        hits.push({ id: s.id, type: 'señal', label: s.label })
      }
    })
    if (focus.length === 0 && SEN[0]) focus.push(SEN[0].id)
  }

  // proveedor name
  PROV.forEach((p) => {
    const tokens = p.razon
      .toLowerCase()
      .split(/\s+/)
      .filter((t) => t.length > 4)
    if (tokens.some((t) => q.includes(t))) {
      if (!hits.find((h) => h.id === p.cuit)) {
        hits.push({ id: p.cuit, type: 'proveedor', label: p.razon })
        if (focus.length === 0) focus.push(p.cuit)
      }
    }
  })

  // director name
  DIR.forEach((d) => {
    const parts = d.label.toLowerCase().split(/\s+/)
    if (parts.some((p) => p.length > 4 && q.includes(p))) {
      if (!hits.find((h) => h.id === d.id)) {
        hits.push({ id: d.id, type: 'director', label: d.label })
        if (focus.length === 0) focus.push(d.id)
      }
    }
  })

  return { entities: hits.slice(0, 6), focusId: focus[0] || null }
}

/** Migrado 1:1 desde api.jsx. */
function craftAnswer(
  _query: string,
  _ents: ResolvedHit[],
  focusId: string | null
): string {
  const focusNode = focusId ? nodeById(focusId) : null
  const SEN = ArgosMock.SEN as unknown as Array<{
    id: string
    label: string
    target?: { id: string }
  }>
  const PROV = ArgosMock.PROV as unknown as Array<{
    cuit: string
    razon: string
    monto: number
    jur: string[]
  }>
  const DIR = ArgosMock.DIR as unknown as Array<{
    id: string
    label: string
    empresas: string[]
  }>

  if (!focusNode) {
    return `No encontré una entidad específica que coincida exactamente. Podés explorar el grafo o probar con una jurisdicción como **[[node:cordoba-capital]]** o un proveedor concreto. También podés escribir un CUIT (formato 30-XXXXXXXX-X) o el nombre de un funcionario.`
  }

  if (focusNode.type === 'jurisdiccion') {
    const d = focusNode.data as {
      total_contratos: number
      monto_total: number
      anio_min: number
      anio_max: number
      total_señales: number
    }
    const topProvs = PROV.filter((p) => p.jur.includes(focusNode.id))
      .sort((a, b) => b.monto - a.monto)
      .slice(0, 2)
    const sList = SEN.filter((s) => s.target?.id === focusNode.id).slice(0, 2)
    return [
      `**[[node:${focusNode.id}]]** registra **${d.total_contratos.toLocaleString('es-AR')} contratos** por un monto total de **${fmtARS(d.monto_total)}** en el período ${d.anio_min}–${d.anio_max}.`,
      ``,
      `Los proveedores con mayor facturación son ${topProvs.map((p) => `[[node:${p.cuit}]]`).join(' y ')}, que en conjunto explican una porción significativa del gasto.`,
      sList.length
        ? `\nDetectamos **${d.total_señales} señales activas** en esta jurisdicción, incluyendo ${sList.map((s) => `[[node:${s.id}]]`).join(' y ')}.`
        : '',
      `\nClickeá cualquier entidad para abrir su mini-dashboard, o explorá el grafo para ver las conexiones.`,
    ].join('\n')
  }

  if (focusNode.type === 'proveedor') {
    const d = focusNode.data as {
      totalContratos: number
      montoTotal: number
      inicioActividades?: string
      municipios: string[]
      actividadPrincipal?: string
      estado?: string
    }
    const dirs = DIR.filter((x) => x.empresas.includes(focusNode.id)).slice(0, 2)
    const sigs = SEN.filter((s) => s.target?.id === focusNode.id).slice(0, 2)
    return [
      `**[[node:${focusNode.id}]]** acumula **${d.totalContratos} contratos** por un total de **${fmtARS(d.montoTotal)}** desde ${d.inicioActividades?.slice(-4) || '2010'}, operando en ${d.municipios.map((m) => `[[node:${m}]]`).join(', ')}.`,
      d.actividadPrincipal
        ? `\nActividad principal: *${d.actividadPrincipal}*. Estado AFIP: **${d.estado ?? '—'}**.`
        : '',
      dirs.length
        ? `\nDirectorio identificado: ${dirs.map((x) => `[[node:${x.id}]]`).join(', ')}.`
        : '',
      sigs.length
        ? `\n⚠ Señales activas: ${sigs.map((x) => `[[node:${x.id}]]`).join(' · ')}.`
        : '',
    ].join('\n')
  }

  if (focusNode.type === 'director') {
    const d = focusNode.data as { empresas: string[] }
    return `**[[node:${focusNode.id}]]** figura como director en ${d.empresas.length} empresas: ${d.empresas.map((e) => `[[node:${e}]]`).join(', ')}. Esta concentración puede ser un indicio de red corporativa coordinada — vale revisar si esas empresas compiten entre sí en las mismas licitaciones.`
  }

  if (focusNode.type === 'señal') {
    const d = focusNode.data as {
      score: number
      resumen: string
      legal: { severidad: string; articulos: string[]; denunciarAnte: string[] }
    }
    return [
      `🚨 **[[node:${focusNode.id}]]** — severidad **${d.legal.severidad}**, score ${d.score}/100.`,
      `\n${d.resumen}`,
      `\nMarco legal aplicable: ${d.legal.articulos.join(', ')}. Organismos para denunciar: ${d.legal.denunciarAnte.join(', ')}.`,
    ].join('\n')
  }

  if (focusNode.type === 'contrato') {
    const d = focusNode.data as {
      tipo: string
      anio: number
      monto: number
      area: string
      numeroExpediente: string
      proveedorCuit: string
    }
    const provRaw = PROV.find((p) => fmtCuit(p.cuit) === d.proveedorCuit)
    return `**[[node:${focusNode.id}]]** — ${d.tipo} adjudicada en ${d.anio} por ${fmtARS(d.monto)} a [[node:${provRaw?.cuit ?? ''}]]. Área: ${d.area}. Expediente ${d.numeroExpediente}.`
  }

  return 'Resultado encontrado.'
}

/** Migrado 1:1 desde api.jsx. Respuesta contextual con un nodo enfocado. */
function answerInContext(query: string, ctx: { id: string }): string {
  const q = query.toLowerCase()
  const node = nodeById(ctx.id)
  if (!node) return craftAnswer(query, [], null)
  const d = (node.data || {}) as Record<string, unknown>

  const SEN = ArgosMock.SEN as unknown as Array<{
    id: string
    label: string
    severidad: ArgosSeveridad
    resumen: string
    target?: { id: string }
  }>
  const DIR = ArgosMock.DIR as unknown as Array<{
    id: string
    label: string
    empresas: string[]
  }>
  const PROV = ArgosMock.PROV as unknown as Array<{
    cuit: string
    actividadPrincipal?: string
  }>

  // Intent: señales / riesgo
  if (/señal|senal|riesgo|alert|sospech|grave|moderad|fraude/.test(q)) {
    const sigs = SEN.filter((s) => s.target?.id === node.id)
    if (!sigs.length) {
      return `**[[node:${node.id}]]** no tiene señales activas detectadas. Esto no significa que esté libre de irregularidades — solo que las heurísticas actuales no encontraron patrones.`
    }
    const graves = sigs.filter((s) => s.severidad === 'grave')
    const moderadas = sigs.filter((s) => s.severidad === 'moderada')
    return [
      `**[[node:${node.id}]]** tiene **${sigs.length} señal${sigs.length > 1 ? 'es' : ''}** activ${sigs.length > 1 ? 'as' : 'a'}: ${graves.length} grave${graves.length !== 1 ? 's' : ''}, ${moderadas.length} moderada${moderadas.length !== 1 ? 's' : ''}.`,
      ``,
      ...sigs.slice(0, 3).map((s) => `· **[[node:${s.id}]]** — ${s.resumen}`),
      ``,
      sigs.length > 3
        ? `Hay ${sigs.length - 3} señal${sigs.length - 3 > 1 ? 'es' : ''} más en el panel de la derecha.`
        : '',
    ]
      .filter(Boolean)
      .join('\n')
  }

  // Intent: directores / titulares
  if (/director|dueñ|titular|representante|firma|controla/.test(q)) {
    const dirs = DIR.filter((x) => x.empresas.includes(node.id))
    if (!dirs.length) {
      return `No tengo registros de directorio para **[[node:${node.id}]]** en la base IGJ disponible.`
    }
    const shared = dirs.filter((x) => x.empresas.length > 1)
    return [
      `Directorio identificado de **[[node:${node.id}]]**: ${dirs.map((x) => `[[node:${x.id}]]`).join(', ')}.`,
      shared.length
        ? `\n${shared.length} director${shared.length > 1 ? 'es figuran' : ' figura'} también en otras empresas — esto es señal potencial de red corporativa coordinada.`
        : '',
    ].join('')
  }

  // Intent: histórico / facturación / monto / evolución
  if (
    /histórico|historico|evolución|evolucion|años|tendencia|facturación|facturacion|monto|gast/.test(
      q
    )
  ) {
    if (node.type === 'proveedor') {
      const p = d as {
        montoTotal: number
        totalContratos: number
        inicioActividades?: string
        municipios: string[]
      }
      return `**[[node:${node.id}]]** facturó **${fmtARS(p.montoTotal)}** en ${p.totalContratos} contratos desde ${(p.inicioActividades || '').slice(-4) || '2010'}. Operó en ${p.municipios.length} jurisdicción${p.municipios.length > 1 ? 'es' : ''}: ${p.municipios.map((m) => `[[node:${m}]]`).join(', ')}.`
    }
    if (node.type === 'jurisdiccion') {
      const j = d as {
        total_contratos: number
        monto_total: number
        anio_min: number
        anio_max: number
      }
      return `**[[node:${node.id}]]** registró **${j.total_contratos.toLocaleString('es-AR')} contratos** por ${fmtARS(j.monto_total)} entre ${j.anio_min} y ${j.anio_max}. El panel muestra el desglose anual.`
    }
  }

  // Intent: comparación / similar
  if (/similar|otr|comparar|compet|rival|misma|igual/.test(q)) {
    if (node.type === 'proveedor') {
      const p = d as { actividadPrincipal?: string }
      const similars = PROV.filter(
        (x) => x.cuit !== node.id && x.actividadPrincipal === p.actividadPrincipal
      ).slice(0, 3)
      if (similars.length) {
        return `Otros proveedores con la misma actividad (*${p.actividadPrincipal}*): ${similars.map((s) => `[[node:${s.cuit}]]`).join(', ')}.`
      }
      return `No encontré otros proveedores en la base con la actividad *${p.actividadPrincipal}*.`
    }
  }

  // Intent: contratos
  if (/contrato|adjudicación|adjudicacion|licitación|licitacion|directa/.test(q)) {
    if (node.type === 'proveedor') {
      const p = d as { totalContratos: number; montoTotal: number }
      return `**[[node:${node.id}]]** ganó **${p.totalContratos} contratos** por ${fmtARS(p.montoTotal)} en total. Modalidad principal y desglose por área en el panel de la derecha.`
    }
    if (node.type === 'jurisdiccion') {
      const j = d as {
        total_contratos: number
        anio_min: number
        anio_max: number
      }
      return `**[[node:${node.id}]]** registra **${j.total_contratos.toLocaleString('es-AR')} contratos** entre ${j.anio_min} y ${j.anio_max}. Abrí el panel para ver el desglose por modalidad y proveedor.`
    }
  }

  // Fallback
  return [
    `Sobre **[[node:${node.id}]]**:`,
    ``,
    node.subtitle ? `*${node.subtitle}*\n` : '',
    node.type === 'proveedor'
      ? `Proveedor con ${(d as { totalContratos: number }).totalContratos} contratos por ${fmtARS((d as { montoTotal: number }).montoTotal)}, activo desde ${(d as { inicioActividades?: string }).inicioActividades || 'fecha desconocida'}.`
      : node.type === 'jurisdiccion'
      ? `Jurisdicción con ${(d as { total_contratos: number }).total_contratos} contratos por ${fmtARS((d as { monto_total: number }).monto_total)} en ${(d as { anio_max: number }).anio_max - (d as { anio_min: number }).anio_min + 1} años.`
      : node.type === 'director'
      ? `Director que figura en ${(d as { empresas: string[] }).empresas.length} empresa${(d as { empresas: string[] }).empresas.length > 1 ? 's' : ''}.`
      : node.type === 'señal'
      ? `Señal de severidad ${(d as { legal?: { severidad?: string } }).legal?.severidad || 'desconocida'}, score ${(d as { score: number }).score}.`
      : `Entidad del tipo ${node.type}.`,
    ``,
    `Probá preguntarme sobre **señales**, **directores**, **histórico** o **contratos** específicos de este nodo.`,
  ]
    .filter(Boolean)
    .join('\n')
}

// ─── mockApi ───────────────────────────────────────────────────────────────────

/** Datos sintéticos para desarrollo. NO usar en producción. */
export const mockApi: ArgosApi = {
  async getGraphSnapshot() {
    await sleep(60)
    return clone(ArgosMock.GRAPH)
  },

  async getGraphNeighborhood(centerId, depth = 2) {
    await sleep(80)
    return neighborhood(centerId, depth)
  },

  async getNodeDetail(_type, id) {
    await sleep(180)
    const n = nodeById(id)
    return buildDetail(n)
  },

  async searchEntities(query, opts) {
    await sleep(80)
    const q = query.toLowerCase().trim()
    if (!q) return []
    const limit = opts?.limit ?? 20
    const types = opts?.types
    return ArgosMock.GRAPH.nodes
      .filter((n) => {
        if (types && types.length > 0 && !types.includes(n.type)) return false
        return n.label.toLowerCase().includes(q)
      })
      .slice(0, limit)
  },

  async chat(messages, context, onChunk) {
    const last = messages[messages.length - 1]
    const q = last?.content || ''

    const explicit = resolveEntities(q)
    // Si hay foco y el usuario no nombró otra jurisdicción explícitamente,
    // respondemos en contexto.
    const useFocus =
      !!context?.focusNodeId &&
      !explicit.focusId &&
      !/(córdoba|cordoba|rosario|salta|villa maría|villa maria|río cuarto|rio cuarto)/i.test(
        q
      )

    const focusId = useFocus ? context!.focusNodeId : explicit.focusId
    const entities = useFocus
      ? focusId
        ? (() => {
            const n = nodeById(focusId)
            return n ? [{ id: n.id, type: n.type, label: n.label }] : []
          })()
        : []
      : explicit.entities

    onChunk({
      entidades: entities,
      focus: focusId ? { nodeId: focusId } : undefined,
    })

    await sleep(220)

    const text =
      useFocus && focusId
        ? answerInContext(q, { id: focusId })
        : craftAnswer(q, explicit.entities, explicit.focusId)

    // ~12-18 chunks total — robusto frente a throttling de iframe.
    const CHUNK = 28
    let i = 0
    while (i < text.length) {
      const step = CHUNK + Math.floor(Math.random() * 12)
      onChunk({ delta: text.slice(i, i + step) })
      i += step
      await sleep(55)
    }
    onChunk({ done: true })
  },
}

// ─── httpApi ───────────────────────────────────────────────────────────────────

const API_URL =
  (typeof import.meta !== 'undefined' && (import.meta as ImportMeta).env?.VITE_API_URL) ||
  ''
const CHAT_LLM_ENABLED =
  (typeof import.meta !== 'undefined' &&
    (import.meta as ImportMeta).env?.VITE_CHAT_LLM === 'true') ||
  false

async function fetchJSON<T>(path: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`)
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${path}`)
  const data = await res.json()
  if (data && typeof data === 'object' && 'ok' in data && data.ok === false) {
    throw new Error(
      (data as { error?: string }).error ?? `Backend respondió ok:false en ${path}`
    )
  }
  return data as T
}

interface BackendEntidadSearch {
  ok: true
  entidades: Array<{
    proveedor: string
    municipio: string
    total_contratos: number
    monto_total: number
    señales: number
    anio_min: number
    anio_max: number
  }>
}

export const httpApi: ArgosApi = {
  /**
   * El backend Express NO expone aún un /api/grafo. Caemos al snapshot del
   * mockApi y avisamos por consola. Pendiente Fase 4 del plan-beta.
   */
  async getGraphSnapshot() {
    console.warn(
      '[argos.httpApi] backend no implementa getGraphSnapshot — usando mock'
    )
    return mockApi.getGraphSnapshot()
  },

  /**
   * Sin endpoint backend para vecindario. Delegamos al mockApi.
   */
  async getGraphNeighborhood(centerId, depth = 2) {
    return mockApi.getGraphNeighborhood(centerId, depth)
  },

  async getNodeDetail(type, id) {
    try {
      if (type === 'proveedor') {
        // GET /api/entidad/:nombre — id usado como nombre normalizado.
        await fetchJSON<unknown>(`/api/entidad/${encodeURIComponent(id)}`)
        // FIXME: el backend no devuelve un NodeDetail directo. Hasta que
        // exista un mapper estable, caemos al detalle del mock.
        return mockApi.getNodeDetail(type, id)
      }
      if (type === 'contrato') {
        await fetchJSON<unknown>(`/api/contrato/${encodeURIComponent(id)}`)
        return mockApi.getNodeDetail(type, id)
      }
      // jurisdiccion / director / señal: sin endpoint propio. Mock.
      return mockApi.getNodeDetail(type, id)
    } catch (err) {
      console.warn(
        '[argos.httpApi.getNodeDetail] fallback a mock por error:',
        err
      )
      return mockApi.getNodeDetail(type, id)
    }
  },

  async searchEntities(query, opts) {
    try {
      const q = query.trim()
      if (!q) return []
      const data = await fetchJSON<BackendEntidadSearch>(
        `/api/entidad/search?q=${encodeURIComponent(q)}`
      )
      const limit = opts?.limit ?? 20
      const types = opts?.types
      // Backend solo devuelve "proveedor". Si el caller filtró por otros types
      // y proveedor no está incluido, devolvemos vacío.
      if (types && types.length > 0 && !types.includes('proveedor')) {
        return []
      }
      return data.entidades.slice(0, limit).map<ArgosNode>((e) => ({
        id: e.proveedor.trim().toLowerCase().replace(/\s+/g, ' '),
        type: 'proveedor',
        label: e.proveedor,
        subtitle: e.municipio,
        weight: 0.5,
        data: e as unknown as Record<string, unknown>,
      }))
    } catch (err) {
      console.warn(
        '[argos.httpApi.searchEntities] fallback a mock por error:',
        err
      )
      return mockApi.searchEntities(query, opts)
    }
  },

  async chat(messages, context, onChunk) {
    // Sin LLM habilitado o sin endpoint definido, fallback al mock.
    if (!CHAT_LLM_ENABLED) {
      return mockApi.chat(messages, context, onChunk)
    }

    try {
      const res = await fetch(`${API_URL}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages,
          focusNodeId: context?.focusNodeId ?? null,
        }),
      })
      if (!res.ok || !res.body) {
        throw new Error(`HTTP ${res.status} en /api/chat`)
      }

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE delimita eventos por doble newline.
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const event = buf.slice(0, idx)
          buf = buf.slice(idx + 2)
          // Cada línea "data: <json>".
          for (const line of event.split('\n')) {
            const m = line.match(/^data:\s?(.*)$/)
            if (!m) continue
            const payload = m[1]
            if (payload === '[DONE]') {
              onChunk({ done: true })
              return
            }
            try {
              const chunk = JSON.parse(payload) as ChatChunk
              onChunk(chunk)
            } catch {
              // Si el server emite texto plano, lo tratamos como delta.
              onChunk({ delta: payload })
            }
          }
        }
      }
      onChunk({ done: true })
    } catch (err) {
      console.warn('[argos.httpApi.chat] fallback a mock por error:', err)
      return mockApi.chat(messages, context, onChunk)
    }
  },
}

// ─── Selección por entorno ─────────────────────────────────────────────────────

const USE_HTTP =
  typeof import.meta !== 'undefined' &&
  !!(import.meta as ImportMeta).env?.VITE_API_URL &&
  (import.meta as ImportMeta).env.VITE_API_URL !== ''

export const argosApi: ArgosApi = USE_HTTP ? httpApi : mockApi
export default argosApi
