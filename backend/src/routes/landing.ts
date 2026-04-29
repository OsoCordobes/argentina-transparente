// routes/landing.ts — datos para la página Landing.
//
// Tres bloques que la UI necesita:
//   1. Hero KPIs:    monto auditado total + cantidad de contratos + cobertura
//   2. Feed mensual: la señal con score más alto (featured) + 4 compactas
//   3. Sumario:      contadores totales por estado y severidad
//
// Lectura pura sobre señales_cache + contratos. Cero LLM, cero estado.

import { Router, Request, Response } from 'express'
import { dbAll } from '../lib/db'

const landingRouter = Router()
export default landingRouter

interface HeroKPIs {
  montoAuditado: number
  cantidadContratos: number
  cantidadAgentes: number
  jurisdiccionPrimaria: string
  rangoAnios: { desde: number; hasta: number }
  signalsGraves: number
  casosGenerados: number
}

interface SeñalListItem {
  id: string
  tipologia: string
  titulo: string
  resumen: string
  score: number
  severidad: 'grave' | 'moderada' | 'leve'
  estadoVerificacion: 'sin_verificar' | 'verificada' | 'descartada' | 'bloqueada'
  computadoEn: string
  // Aspirante: si la señal tiene un CUIT/DNI principal asociado, incluirlo
  // para deep-link al Profile correspondiente.
  cuitsAsociados: string[]
}

landingRouter.get('/', async (_req: Request, res: Response) => {
  try {
    // ─── 1. Hero KPIs ──────────────────────────────────────────────────────
    const [
      contratosAgg,
      agentesAgg,
      anioRange,
      gravesCount,
      casosCount,
    ] = await Promise.all([
      dbAll<{ total: number; cnt: number }>(
        `SELECT COALESCE(SUM(monto), 0) AS total, COUNT(*) AS cnt FROM contratos`,
      ),
      dbAll<{ cnt: number }>(
        `SELECT COUNT(DISTINCT apellido_nombre) AS cnt FROM agentes_publicos
          WHERE apellido_nombre IS NOT NULL`,
      ),
      dbAll<{ desde: number; hasta: number }>(
        `SELECT MIN(anio) AS desde, MAX(anio) AS hasta FROM contratos WHERE anio IS NOT NULL`,
      ),
      dbAll<{ cnt: number }>(
        `SELECT COUNT(*) AS cnt FROM señales_cache WHERE severidad = 'grave'`,
      ),
      // Casos abiertos: aproximamos por tipologías que tienen >=1 señal grave
      // (el modelo de Caso explícito vive en localStorage en MVP).
      dbAll<{ cnt: number }>(
        `SELECT COUNT(DISTINCT tipologia) AS cnt FROM señales_cache WHERE severidad IN ('grave', 'moderada')`,
      ),
    ])

    const hero: HeroKPIs = {
      montoAuditado: Number(contratosAgg[0]?.total ?? 0),
      cantidadContratos: Number(contratosAgg[0]?.cnt ?? 0),
      cantidadAgentes: Number(agentesAgg[0]?.cnt ?? 0),
      jurisdiccionPrimaria: 'Córdoba Capital',
      rangoAnios: {
        desde: Number(anioRange[0]?.desde ?? 2015),
        hasta: Number(anioRange[0]?.hasta ?? new Date().getFullYear()),
      },
      signalsGraves: Number(gravesCount[0]?.cnt ?? 0),
      casosGenerados: Number(casosCount[0]?.cnt ?? 0),
    }

    // ─── 2. Feed mensual (top score del último mes con datos) ─────────────
    // Tomamos las 5 señales con score más alto. El detector más severo va de
    // featured; los siguientes 4 como compactas.
    interface SeñalRow {
      id: string
      tipologia: string
      titulo: string
      resumen: string
      score: number
      severidad: 'grave' | 'moderada' | 'leve'
      estado_verificacion: 'sin_verificar' | 'verificada' | 'descartada' | 'bloqueada'
      computado_en: string
      entidades_cuit: string | null
    }

    const top5 = await dbAll<SeñalRow>(
      `SELECT id, tipologia, titulo, resumen, score, severidad,
              estado_verificacion, computado_en, entidades_cuit
         FROM señales_cache
        WHERE estado_verificacion != 'descartada'
        ORDER BY score DESC, computado_en DESC
        LIMIT 5`,
    )

    const feed: SeñalListItem[] = top5.map(r => ({
      id: r.id,
      tipologia: r.tipologia,
      titulo: r.titulo,
      resumen: r.resumen,
      score: Number(r.score),
      severidad: r.severidad,
      estadoVerificacion: r.estado_verificacion,
      computadoEn: r.computado_en,
      cuitsAsociados: parseJsonSafe<string[]>(r.entidades_cuit, []),
    }))

    // ─── 3. Sumario por estado y severidad ────────────────────────────────
    const sumarioRows = await dbAll<{ estado: string; severidad: string; cnt: number }>(
      `SELECT estado_verificacion AS estado, severidad, COUNT(*) AS cnt
         FROM señales_cache
        GROUP BY estado_verificacion, severidad`,
    )
    const sumario = {
      total: 0,
      porEstado: {
        sin_verificar: 0, verificada: 0, descartada: 0, bloqueada: 0,
      } as Record<string, number>,
      porSeveridad: { grave: 0, moderada: 0, leve: 0 } as Record<string, number>,
    }
    for (const r of sumarioRows) {
      const cnt = Number(r.cnt)
      sumario.total += cnt
      if (r.estado in sumario.porEstado) sumario.porEstado[r.estado] += cnt
      if (r.severidad in sumario.porSeveridad) sumario.porSeveridad[r.severidad] += cnt
    }

    return res.json({ hero, feed, sumario })
  } catch (err) {
    console.error('[landing GET]', err)
    return res.status(500).json({ error: 'error interno', detalle: (err as Error).message })
  }
})

function parseJsonSafe<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback
  try { return JSON.parse(raw) as T } catch { return fallback }
}
