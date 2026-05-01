// routes/cola-verificacion.ts — PLAN-DATOS Fase E2.
//
// Cola de señales para verificación humana. Tres endpoints:
//   GET  /api/cola-verificacion           lista paginada con filtros
//   GET  /api/cola-verificacion/resumen   contadores estado × severidad
//   POST /api/cola-verificacion/:id       transiciona estado (verificar/descartar/bloquear/reset)
//
// Diseño:
//   - El listado NO se limita a `sin_verificar` (a diferencia del helper
//     getSeñalesParaVerificar). El UI muestra todos los estados con badges,
//     y permite filtrar.
//   - El POST valida el estado + auditor (defensa en profundidad — la lib
//     verificacion-senales también valida, pero acá frenamos antes de SQL).
//   - 404 explícito si la señal no existe (UPDATE silencioso es peor UX).

import { Router, Request, Response, NextFunction } from 'express'
import { dbAll } from '../lib/db'
import {
  ESTADOS_VERIFICACION,
  esEstadoVerificacionValido,
  actualizarEstadoSeñal,
  contarSeñalesPorEstadoYSeveridad,
} from '../lib/verificacion-senales'

const colaVerificacionRouter = Router()
export default colaVerificacionRouter

// Audit fix SEC-1: middleware que requiere un secret token en el header
// X-Argos-Admin-Token para cualquier operación de escritura sobre el estado
// de las señales. Valor en env var ARGOS_ADMIN_TOKEN. Si la env var no
// está seteada, el endpoint queda completamente cerrado (fail-closed) en
// vez de aceptar cualquier request (fail-open). Esto previene el ataque
// trolling masivo de "marcar todo descartada".
function requireAdminToken(req: Request, res: Response, next: NextFunction) {
  const expected = process.env.ARGOS_ADMIN_TOKEN
  if (!expected || expected.length < 8) {
    return res.status(503).json({
      error: 'verificación deshabilitada',
      detalle: 'el servidor no tiene configurado ARGOS_ADMIN_TOKEN',
    })
  }
  const header = req.header('X-Argos-Admin-Token')
  if (!header || header !== expected) {
    return res.status(401).json({ error: 'token de auditor inválido o ausente' })
  }
  next()
}

interface SeñalRow {
  id: string
  municipio: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: 'grave' | 'moderada' | 'leve'
  estado_verificacion: 'verificada' | 'sin_verificar' | 'descartada' | 'bloqueada'
  verificado_por: string | null
  verificado_en: string | null
  evidencia_json: string
  legal_json: string
  computado_en: string
  /** JSON array de CUITs/DNIs involucrados en la señal — poblada por
   *  analyze.ts (Sprint 2). Permite que el frontend resalte los nodos
   *  involucrados en el grafo cuando una señal está seleccionada. */
  entidades_cuit: string | null
}

const SEVERIDADES = ['grave', 'moderada', 'leve'] as const
type Severidad = typeof SEVERIDADES[number]

colaVerificacionRouter.get('/', async (req: Request, res: Response) => {
  const estado = String(req.query.estado ?? 'sin_verificar')
  const severidad = req.query.severidad ? String(req.query.severidad) : undefined
  const tipologia = req.query.tipologia ? String(req.query.tipologia) : undefined
  const municipio = req.query.municipio ? String(req.query.municipio) : undefined
  const minScore = req.query.minScore !== undefined ? Number(req.query.minScore) : undefined

  // Review #2 E2: parsear limit/offset con clamp + defensa contra NaN.
  // Antes: si query.limit='abc' → Number('abc')=NaN → SQL `LIMIT NaN` rompía.
  // Si limit=-10 → Math.min(-10,200)=-10 → SQL `LIMIT -10` también rompía.
  // Ahora: si parseInt da NaN o negativo, fallback al default. Cap a 200.
  const limitRaw = Number(req.query.limit ?? 50)
  const offsetRaw = Number(req.query.offset ?? 0)
  const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50
  const offset = Number.isFinite(offsetRaw) && offsetRaw >= 0 ? offsetRaw : 0

  if (estado !== 'todas' && !esEstadoVerificacionValido(estado)) {
    return res.status(400).json({
      error: 'estado inválido',
      permitidos: [...ESTADOS_VERIFICACION, 'todas'],
    })
  }
  if (severidad && !SEVERIDADES.includes(severidad as Severidad)) {
    return res.status(400).json({ error: 'severidad inválida', permitidas: SEVERIDADES })
  }
  if (minScore !== undefined && (Number.isNaN(minScore) || minScore < 0 || minScore > 100)) {
    return res.status(400).json({ error: 'minScore debe ser número 0..100' })
  }

  const where: string[] = []
  const params: unknown[] = []
  if (estado !== 'todas') { where.push('estado_verificacion = ?'); params.push(estado) }
  if (severidad) { where.push('severidad = ?'); params.push(severidad) }
  if (tipologia) { where.push('tipologia = ?'); params.push(tipologia) }
  if (municipio) { where.push('municipio = ?'); params.push(municipio) }
  if (minScore !== undefined) { where.push('score >= ?'); params.push(minScore) }
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : ''

  try {
    const items = await dbAll<SeñalRow>(
      `SELECT id, municipio, tipologia, titulo, resumen, score, severidad,
              estado_verificacion, verificado_por, verificado_en,
              evidencia_json, legal_json, computado_en, entidades_cuit
         FROM señales_cache
         ${whereSql}
         ORDER BY score DESC, computado_en ASC
         LIMIT ${limit} OFFSET ${offset}`,
      params,
    )
    const totalRows = await dbAll<{ n: number }>(
      `SELECT COUNT(*) AS n FROM señales_cache ${whereSql}`, params,
    )
    const total = Number(totalRows[0]?.n ?? 0)

    return res.json({
      items: items.map(r => ({
        id: r.id,
        municipio: r.municipio,
        tipologia: r.tipologia,
        titulo: r.titulo,
        resumen: r.resumen,
        score: Number(r.score),
        severidad: r.severidad,
        estadoVerificacion: r.estado_verificacion,
        verificadoPor: r.verificado_por,
        verificadoEn: r.verificado_en,
        evidencia: parseJsonSafe(r.evidencia_json, []),
        legal: parseJsonSafe(r.legal_json, {}),
        computadoEn: r.computado_en,
        // M2 (graph-context-everywhere): array de CUITs/DNIs involucrados.
        // Patrón consistente con /api/contrato/:hash y /api/entidad/:nombre.
        cuits: parseJsonSafe<string[]>(r.entidades_cuit, []),
      })),
      paginacion: { total, limit, offset, hayMas: offset + items.length < total },
    })
  } catch (err) {
    console.error('[cola-verificacion GET]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})

colaVerificacionRouter.get('/resumen', async (req: Request, res: Response) => {
  const municipio = req.query.municipio ? String(req.query.municipio) : undefined
  try {
    const r = await contarSeñalesPorEstadoYSeveridad(municipio)
    return res.json(r)
  } catch (err) {
    console.error('[cola-verificacion resumen]', err)
    return res.status(500).json({ error: 'error interno' })
  }
})

colaVerificacionRouter.post('/:id', requireAdminToken, async (req: Request, res: Response) => {
  const id = String(req.params.id)
  const body = req.body ?? {}
  const estado = String(body.estado ?? '')
  // Review #2 E2: validar que auditor sea string primitivo. Antes
  // `body.auditor ? String(body.auditor) : undefined` aceptaba arrays/objetos
  // y los coercionaba ("[object Object]"). Pasaba la validación trim()!=''
  // pero la BD recibía basura. Ahora rechazamos explícitamente.
  if (body.auditor !== undefined && typeof body.auditor !== 'string') {
    return res.status(400).json({ error: 'auditor debe ser string' })
  }
  const auditor = body.auditor ? String(body.auditor).slice(0, 200) : undefined

  if (!esEstadoVerificacionValido(estado)) {
    return res.status(400).json({
      error: 'estado inválido',
      permitidos: ESTADOS_VERIFICACION,
    })
  }
  if (estado !== 'sin_verificar' && (!auditor || auditor.trim() === '')) {
    return res.status(400).json({ error: `estado "${estado}" requiere campo "auditor"` })
  }

  // Review #2 E2: removí el SELECT existence check redundante. A7 review #2
  // añadió el mismo check dentro de actualizarEstadoSeñal — la lib es la
  // fuente de verdad. Si la señal no existe, lib lanza; el catch traduce a
  // 404 con mensaje claro.
  try {
    await actualizarEstadoSeñal(id, estado, auditor)
    return res.json({ ok: true, id, estadoNuevo: estado })
  } catch (err) {
    // Review #2 E2: traducir el error específico de "señal no existe" a 404.
    // Otros errores (validación, BD) van a 500 con detalle.
    const msg = (err as Error).message
    if (msg.includes('no existe en señales_cache')) {
      return res.status(404).json({ error: 'señal no encontrada', id })
    }
    console.error('[cola-verificacion POST]', err)
    return res.status(500).json({ error: 'error al actualizar', detalle: msg })
  }
})

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
