// lib/alertas.ts — Detector de eventos relevantes para el investigador.
//
// Escanea el estado del sistema y genera entradas en la tabla `alertas`
// cuando detecta:
//   1. Scrapers rotos (última ejecución falló)
//   2. Fuentes desactualizadas (último crawl excede la frecuencia esperada)
//   3. Datos nuevos (count de contratos cambió desde la última verificación)
//
// Diseño: idempotente — usar IDs estables para que correr el detector
// múltiples veces no genere duplicados (UPSERT en lugar de INSERT).

import {
  upsertAlerta, listarFuentes, getScrapersHealth,
  getContratosCount, dbAll,
  type AlertaSeveridad,
} from './db'

const DIAS_ALERTA_FRECUENCIA: Record<string, number> = {
  diaria:    2,    // si pasaron >2 días, alerta
  semanal:   10,   // si pasaron >10 días, alerta
  mensual:   45,   // si pasaron >45 días, alerta
  anual:     400,  // si pasaron >400 días, alerta
  continua:  7,    // continua = al menos algo cada semana
  eventual:  730,  // 2 años
}

function diasDesde(iso: string): number {
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24)
}

interface DetectResult {
  generadas: number
  por_tipo: Record<string, number>
}

export async function detectarAlertas(): Promise<DetectResult> {
  const ahora = new Date().toISOString()
  let generadas = 0
  const porTipo: Record<string, number> = {}
  const incr = (t: string) => { porTipo[t] = (porTipo[t] ?? 0) + 1 }

  // ─── 1. Scrapers rotos ─────────────────────────────────────────────────────
  const scrapers = await getScrapersHealth()
  for (const s of scrapers) {
    if (!s.ok) {
      await upsertAlerta({
        id: `scraper-roto:${s.id}`,
        tipo: 'scraper_roto',
        severidad: 'critical',
        titulo: `Scraper "${s.id}" falló en última ejecución`,
        detalle: s.errorMsg
          ? `Error: ${s.errorMsg}\nURL: ${s.urlChequeada ?? 'desconocida'}\nÚltima corrida: ${s.ejecutadoEn}`
          : `URL: ${s.urlChequeada ?? 'desconocida'}\nÚltima corrida: ${s.ejecutadoEn}`,
        fuenteId: null,
        detectadoEn: ahora,
      })
      generadas++
      incr('scraper_roto')
    }
  }

  // ─── 2. Fuentes desactualizadas ────────────────────────────────────────────
  const fuentes = await listarFuentes()
  for (const f of fuentes) {
    if (!f.ultimo_crawl) continue  // nunca crawled — no es un evento, es estado inicial

    const dias = diasDesde(f.ultimo_crawl)
    const limite = DIAS_ALERTA_FRECUENCIA[f.frecuencia ?? 'eventual'] ?? 365
    if (dias > limite) {
      const severidad: AlertaSeveridad = dias > limite * 2 ? 'critical' : 'warning'
      await upsertAlerta({
        id: `fuente-stale:${f.id}`,
        tipo: 'fuente_desactualizada',
        severidad,
        titulo: `${f.jurisdiccion} sin actualizar desde hace ${Math.round(dias)} días`,
        detalle:
          `Frecuencia esperada: ${f.frecuencia ?? 'eventual'}.\n` +
          `Último crawl: ${f.ultimo_crawl}.\n` +
          `Fuente: ${f.url}.\n` +
          `Acción sugerida: re-ejecutar el seed correspondiente.`,
        fuenteId: f.id,
        detectadoEn: ahora,
      })
      generadas++
      incr('fuente_desactualizada')
    }
  }

  // ─── 3. Datos nuevos ───────────────────────────────────────────────────────
  // Comparar count actual de contratos contra snapshot anterior (en
  // alerta_snapshots). Si subió, generar alerta.
  await dbAll(`
    CREATE TABLE IF NOT EXISTS alerta_snapshots (
      municipio        TEXT PRIMARY KEY,
      contratos_count  INTEGER NOT NULL,
      verificado_en    TEXT NOT NULL
    )
  `)

  const municipios = await dbAll<{ municipio: string }>(
    `SELECT DISTINCT municipio FROM contratos`
  )
  for (const { municipio } of municipios) {
    const actual = await getContratosCount(municipio)
    const snap = await dbAll<{ contratos_count: number }>(
      `SELECT contratos_count FROM alerta_snapshots WHERE municipio = ?`,
      [municipio]
    )
    const previo = snap[0]?.contratos_count ?? 0

    if (previo > 0 && actual > previo) {
      const nuevos = actual - previo
      await upsertAlerta({
        id: `datos-nuevos:${municipio}:${ahora.slice(0, 10)}`,
        tipo: 'datos_nuevos',
        severidad: 'info',
        titulo: `${nuevos.toLocaleString()} contratos nuevos en ${municipio}`,
        detalle:
          `Conteo previo: ${previo.toLocaleString()}\n` +
          `Conteo actual: ${actual.toLocaleString()}\n` +
          `Acción sugerida: re-ejecutar npm run analyze --force para refrescar señales.`,
        fuenteId: null,
        detectadoEn: ahora,
      })
      generadas++
      incr('datos_nuevos')
    }

    await dbAll(
      `INSERT OR REPLACE INTO alerta_snapshots VALUES (?, ?, ?)`,
      [municipio, actual, ahora]
    )
  }

  return { generadas, por_tipo: porTipo }
}
