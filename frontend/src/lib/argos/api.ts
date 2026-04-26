/**
 * argos/api.ts — Capa de API para el modo Explorar.
 *
 * Hard rule (CLAUDE.md §2): cero datos sintéticos. Si el backend no responde,
 * la app muestra estado vacío + warning visible — NUNCA fixtures fake.
 *
 * Endpoints reales consumidos:
 *   - GET  /api/dashboard            → grafo inicial (vía graphFromDashboard)
 *   - GET  /api/entidad/search?q=    → búsqueda fuzzy
 *   - GET  /api/entidad/:nombre      → detalle proveedor
 *   - GET  /api/contrato/:hash       → detalle contrato
 *   - POST /api/chat                 → chat con SSE (Fase 4 — pendiente backend)
 *
 * No se importan fixtures sintéticas. `argosMock.ts` quedó como módulo vacío
 * documentado.
 */

import type {
  ArgosNode,
  ArgosNodeType,
  ArgosGraph,
  NodeDetail,
  NodeContrato,
  ChatMessage,
  ChatChunk,
  ChatContext,
} from './types'

// ─── Configuración ────────────────────────────────────────────────────────────

const API_BASE: string =
  (import.meta as ImportMeta).env?.VITE_API_URL ?? 'http://localhost:3001'

const CHAT_LLM_ENABLED: boolean =
  ((import.meta as ImportMeta).env?.VITE_CHAT_LLM ?? '').toString() === 'true'

function warn(msg: string, ...rest: unknown[]): void {
  // eslint-disable-next-line no-console
  console.warn(`[argos/api] ${msg}`, ...rest)
}

async function getJson<T>(path: string, signal?: AbortSignal): Promise<T> {
  const url = `${API_BASE}${path}`
  const res = await fetch(url, { signal })
  if (!res.ok) {
    throw new Error(`HTTP ${res.status} ${res.statusText} — ${path}`)
  }
  return res.json() as Promise<T>
}

// ─── Public interface ──────────────────────────────────────────────────────────

export interface ArgosApi {
  /** Snapshot del grafo. NO usar este directamente — el grafo lo construye
   *  `graphFromDashboard` desde `/api/dashboard` (en `pages/Explorar.tsx`).
   *  Este método queda como compatibilidad de interface; retorna empty si se
   *  llama antes de que el backend ofrezca un endpoint dedicado. */
  getGraphSnapshot(): Promise<ArgosGraph>

  /** Vecindario BFS desde un nodo. Hoy se calcula client-side sobre el grafo
   *  ya cargado — este método queda para API futura del backend. */
  getGraphNeighborhood(
    centerId: string,
    depth?: number
  ): Promise<ArgosGraph & { centerId: string }>

  /** Detalle del nodo para el panel. Lee del backend real:
   *  - proveedor   → GET /api/entidad/:label
   *  - contrato    → GET /api/contrato/:hash
   *  - jurisdiccion/director/señal → null (sin endpoint dedicado todavía) */
  getNodeDetail(type: ArgosNodeType, id: string): Promise<NodeDetail | null>

  /** Búsqueda fuzzy. Llama GET /api/entidad/search?q=... */
  searchEntities(
    query: string,
    opts?: { types?: ArgosNodeType[]; limit?: number }
  ): Promise<ArgosNode[]>

  /** Chat en streaming. POST /api/chat con SSE. Si VITE_CHAT_LLM!='true' o
   *  el endpoint no existe, llama onChunk con un único mensaje informando el
   *  estado pendiente — sin generar narrativa inventada. */
  chat(
    messages: ChatMessage[],
    context: ChatContext | null,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<void>
}

// ─── Implementación ────────────────────────────────────────────────────────────

const NO_BACKEND_REASON =
  'Sin endpoint dedicado en el backend todavía. Esperá Fase 4 del plan-beta.'

const NO_LLM_REASON =
  'Chat LLM deshabilitado. Activalo seteando VITE_CHAT_LLM=true en frontend/.env y ANTHROPIC_API_KEY en backend/.env, una vez Fase 4 (POST /api/chat) esté implementada.'

interface BackendEntidadResponseEntidad {
  nombre: string
  cuit?: string
  municipios?: string[]
  totalContratos?: number
  montoTotal?: number
  anios?: number[]
  areas?: string[]
  topArea?: { area: string; monto: number; pct: number } | null
  fechaActualizacion?: string | null
  metodoDominante?: string
  señales?: Array<{
    id: string
    titulo: string
    resumen: string
    severidad: 'grave' | 'moderada' | 'leve'
    score: number
    evidencia?: Array<{ descripcion: string; fuenteUrl: string }>
    legal?: { articulos?: string[]; denunciarAnte?: string[] }
  }>
  contratos?: Array<{
    hash: string
    municipio: string
    tipo: string
    area: string
    descripcion: string
    anio: number
    monto: number
    proveedor: string
    fuenteUrl: string
    metodoExtraccion?: string
    nivelConfianza?: 'alto' | 'medio' | 'bajo'
    cargadoEn?: string
  }>
  afip?: {
    cuit?: string
    esEmpleador?: boolean
    inicioActividades?: string | null
    estado?: string | null
    actividadPrincipal?: string | null
  } | null
  identidad?: {
    tier: 1 | 2 | 3 | 4 | 5
    score?: number
  } | null
}

interface BackendEntidadResponse {
  ok: boolean
  entidad?: BackendEntidadResponseEntidad
  error?: string
}

interface BackendSearchResponse {
  entidades: Array<{
    id?: string
    proveedor: string
    municipio?: string
    cuit?: string
    montoTotal?: number
    totalContratos?: number
  }>
}

function entidadResponseToDetail(
  resp: BackendEntidadResponseEntidad,
  fallbackNodeType: ArgosNodeType
): NodeDetail {
  const node: ArgosNode = {
    id: resp.nombre.toLowerCase().trim(),
    type: fallbackNodeType,
    label: resp.nombre,
    weight: 0.6,
    flags: { verificadoAfip: !!resp.afip?.cuit },
    data: resp as unknown as Record<string, unknown>,
  }

  // KPIs Feature A — orden importante (los 4 que importan primero)
  const kpis: NodeDetail['kpis'] = []
  if (resp.montoTotal != null) {
    kpis.push({
      label: 'Monto total',
      amount: resp.montoTotal,
      format: 'currency',
    })
  }
  if (resp.totalContratos != null) {
    kpis.push({
      label: 'Contratos',
      value: resp.totalContratos.toLocaleString('es-AR'),
      sub: resp.anios && resp.anios.length > 0
        ? `${resp.anios[0]}–${resp.anios[resp.anios.length - 1]}`
        : undefined,
      format: 'count',
    })
  }
  if (resp.topArea) {
    kpis.push({
      label: 'Área principal',
      value: resp.topArea.area,
      sub: `${resp.topArea.pct.toFixed(1)}% del gasto`,
      format: 'text',
    })
  }
  // KPI "Top señal" — la señal con mayor score asociada
  const topSenal = (resp.señales ?? []).slice().sort((a, b) => b.score - a.score)[0]
  if (topSenal) {
    kpis.push({
      label: 'Señal más severa',
      value: `${topSenal.severidad} · score ${topSenal.score}`,
      sub: topSenal.titulo.length > 60 ? topSenal.titulo.slice(0, 58) + '…' : topSenal.titulo,
      format: 'text',
    })
  }
  if (resp.afip?.cuit) {
    kpis.push({ label: 'CUIT', value: resp.afip.cuit, format: 'text' })
  }

  const señales: NodeDetail['señales'] = (resp.señales ?? []).map((s) => ({
    id: s.id,
    titulo: s.titulo,
    resumen: s.resumen,
    severidad: s.severidad,
    score: s.score,
    evidencia: s.evidencia ?? [],
    legal: {
      articulos: s.legal?.articulos ?? [],
      denunciarAnte: s.legal?.denunciarAnte ?? [],
    },
  }))

  // Lista completa de contratos del proveedor (hasta 500 viene del backend).
  // El panel los filtra/ordena client-side y muestra los top N visibles.
  const contratos: NodeContrato[] = (resp.contratos ?? [])
    .slice()
    .sort((a, b) => b.monto - a.monto)
    .map((c) => ({
      hash: c.hash,
      anio: c.anio,
      area: c.area,
      tipo: c.tipo,
      descripcion: c.descripcion,
      monto: c.monto,
      fuenteUrl: c.fuenteUrl,
      metodoExtraccion: c.metodoExtraccion,
      nivelConfianza: c.nivelConfianza,
    }))

  // Fuentes derivadas de evidencia + URLs de contratos vistos
  const fuenteSet = new Map<string, NodeDetail['fuentes'][number]>()
  for (const s of resp.señales ?? []) {
    for (const ev of s.evidencia ?? []) {
      if (!fuenteSet.has(ev.fuenteUrl)) {
        fuenteSet.set(ev.fuenteUrl, {
          url: ev.fuenteUrl,
          descripcion: ev.descripcion,
          fechaAcceso: new Date().toISOString().slice(0, 10),
          nivelConfianza: 'alto',
        })
      }
    }
  }
  for (const c of resp.contratos ?? []) {
    if (c.fuenteUrl && !fuenteSet.has(c.fuenteUrl)) {
      fuenteSet.set(c.fuenteUrl, {
        url: c.fuenteUrl,
        descripcion: `Contrato ${c.anio} — ${c.municipio}`,
        fechaAcceso: new Date().toISOString().slice(0, 10),
        nivelConfianza: (c.nivelConfianza ?? 'alto'),
      })
    }
  }

  return {
    node,
    kpis,
    relaciones: [], // se llena con los nodos vecinos del grafo en cliente
    señales,
    fuentes: [...fuenteSet.values()],
    contratos,
    meta: {
      fechaActualizacion: resp.fechaActualizacion ?? null,
      metodoDominante: resp.metodoDominante ?? 'desconocido',
      topArea: resp.topArea ?? null,
    },
    identidad: resp.identidad ?? undefined,
  }
}

const argosApi: ArgosApi = {
  async getGraphSnapshot(): Promise<ArgosGraph> {
    warn(`getGraphSnapshot: ${NO_BACKEND_REASON} Devolviendo grafo vacío.`)
    return { nodes: [], edges: [] }
  },

  async getGraphNeighborhood(centerId: string): Promise<ArgosGraph & { centerId: string }> {
    warn(`getGraphNeighborhood: ${NO_BACKEND_REASON} Devolviendo vacío.`)
    return { nodes: [], edges: [], centerId }
  },

  async getNodeDetail(type: ArgosNodeType, id: string): Promise<NodeDetail | null> {
    try {
      if (type === 'proveedor') {
        // El node id viene normalizado (lowercase). El backend espera el nombre
        // del proveedor — usamos `label` original cuando está disponible. Como
        // fallback intentamos el id (puede que sea el nombre exacto en algunos
        // casos legacy donde no se normalizó).
        const data = await getJson<BackendEntidadResponse>(
          `/api/entidad/${encodeURIComponent(id)}`
        )
        if (!data.ok || !data.entidad) {
          warn(`getNodeDetail(proveedor, ${id}): backend devolvió ok=false`)
          return null
        }
        return entidadResponseToDetail(data.entidad, 'proveedor')
      }
      if (type === 'contrato') {
        // /api/contrato/:hash — schema distinto, no implementado todavía
        warn(`getNodeDetail(contrato, ${id}): mapper backend→NodeDetail pendiente.`)
        return null
      }
      // jurisdiccion / director / señal → sin endpoint dedicado todavía
      warn(`getNodeDetail(${type}, ${id}): sin endpoint backend, retornando null.`)
      return null
    } catch (err) {
      warn(`getNodeDetail error: ${(err as Error).message}`)
      return null
    }
  },

  async searchEntities(
    query: string,
    opts?: { types?: ArgosNodeType[]; limit?: number }
  ): Promise<ArgosNode[]> {
    if (!query.trim()) return []
    if (opts?.types && opts.types.length > 0 && !opts.types.includes('proveedor')) {
      // backend solo busca proveedores — si filtran fuera de eso, vacío
      return []
    }
    try {
      const data = await getJson<BackendSearchResponse>(
        `/api/entidad/search?q=${encodeURIComponent(query)}&limit=${opts?.limit ?? 20}`
      )
      return (data.entidades ?? []).map((e) => ({
        id: (e.id ?? e.proveedor).toLowerCase().trim(),
        type: 'proveedor' as ArgosNodeType,
        label: e.proveedor,
        subtitle: e.municipio,
        weight: 0.5,
        data: e as unknown as Record<string, unknown>,
      }))
    } catch (err) {
      warn(`searchEntities error: ${(err as Error).message}`)
      return []
    }
  },

  async chat(
    messages: ChatMessage[],
    context: ChatContext | null,
    onChunk: (chunk: ChatChunk) => void
  ): Promise<void> {
    if (!CHAT_LLM_ENABLED) {
      onChunk({
        delta: NO_LLM_REASON,
        done: true,
      })
      return
    }
    const lastUser = [...messages].reverse().find((m) => m.role === 'user')
    if (!lastUser) {
      onChunk({ done: true })
      return
    }
    try {
      // Compactar el grafo: solo nodos esenciales (id, type, label) + edges
      // como pares de IDs. Esto reduce el tamaño y por ende los tokens del
      // request — el LLM no necesita las posiciones x/y ni el data crudo.
      const compactGraph = context?.graph
        ? {
            nodes: context.graph.nodes.map((n) => ({
              id: n.id,
              type: n.type,
              label: n.label,
              ...(n.flags?.severidad ? { severidad: n.flags.severidad } : {}),
            })),
            edges: context.graph.edges.map((e) => ({
              source: typeof e.source === 'string' ? e.source : e.source.id,
              target: typeof e.target === 'string' ? e.target : e.target.id,
              kind: e.kind,
            })),
          }
        : undefined
      const res = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: lastUser.content,
          history: messages.slice(0, -1),
          context: {
            focusNodeId: context?.focusNodeId ?? null,
            graph: compactGraph,
          },
        }),
      })
      if (!res.ok || !res.body) {
        onChunk({
          delta: `Error backend chat (HTTP ${res.status}). Verificá que el endpoint POST /api/chat esté implementado (Fase 4).`,
          done: true,
        })
        return
      }
      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      while (true) {
        const { value, done } = await reader.read()
        if (done) break
        buf += decoder.decode(value, { stream: true })
        // SSE format: cada bloque "data: {...}\n\n"
        let idx: number
        while ((idx = buf.indexOf('\n\n')) >= 0) {
          const block = buf.slice(0, idx).trim()
          buf = buf.slice(idx + 2)
          if (!block) continue
          const dataLine = block.startsWith('data: ') ? block.slice(6) : block
          try {
            const parsed = JSON.parse(dataLine) as ChatChunk
            onChunk(parsed)
          } catch {
            // chunk no-JSON: pasarlo como delta de texto
            onChunk({ delta: dataLine })
          }
        }
      }
      onChunk({ done: true })
    } catch (err) {
      onChunk({
        delta: `Error de red al hablar con el backend: ${(err as Error).message}`,
        done: true,
      })
    }
  },
}

export default argosApi
