// lib/scraper.ts — Base para scrapers de portales sin API estructurada
//
// Diseño:
//   - Fetch-based por defecto (cheerio para HTML, soporta tablas y listas)
//   - Cada scraper concreto extiende BaseScraper e implementa scrape()
//   - Registra automáticamente el resultado en scrapers_health (DuckDB)
//   - Para portales que requieren JS, el scraper concreto puede usar Playwright
//     (npm install playwright) e inyectar el HTML antes de llamar parsearTabla()
//
// Patrón para nuevo scraper:
//   1. Crear backend/src/connectors/<id>/scraper.ts
//   2. Extender BaseScraper, implementar scrape()
//   3. Registrar en la lista SCRAPERS_CONOCIDOS de routes/scrapers.ts

import { registrarScraperRun } from './db'
import type { Contrato } from '../types'

const TIMEOUT_MS = 30_000

export interface ScraperConfig {
  id: string
  nombre: string
  url: string
  municipio: string
}

export interface ScraperResult {
  ok: boolean
  contratos: Contrato[]
  duracionMs: number
  error?: string
}

// ─── Base class ───────────────────────────────────────────────────────────────

export abstract class BaseScraper {
  constructor(protected config: ScraperConfig) {}

  get id() { return this.config.id }
  get nombre() { return this.config.nombre }
  get url() { return this.config.url }
  get municipio() { return this.config.municipio }

  // Implementar en cada scraper concreto
  abstract scrape(anio: number): Promise<Contrato[]>

  // Ejecuta scrape() y registra el resultado en scrapers_health
  async run(anio: number): Promise<ScraperResult> {
    const t0 = Date.now()
    try {
      const contratos = await this.scrape(anio)
      const duracionMs = Date.now() - t0
      await registrarScraperRun({
        id: this.config.id,
        ejecutadoEn: new Date().toISOString(),
        ok: true,
        contratosCount: contratos.length,
        duracionMs,
        errorMsg: null,
        urlChequeada: this.config.url,
      })
      return { ok: true, contratos, duracionMs }
    } catch (err) {
      const duracionMs = Date.now() - t0
      const errorMsg = (err as Error).message
      await registrarScraperRun({
        id: this.config.id,
        ejecutadoEn: new Date().toISOString(),
        ok: false,
        contratosCount: null,
        duracionMs,
        errorMsg,
        urlChequeada: this.config.url,
      }).catch(() => {}) // no propagar errores de DB en el catch
      return { ok: false, contratos: [], duracionMs, error: errorMsg }
    }
  }

  // ─── Helpers de extracción HTML ─────────────────────────────────────────────

  protected async fetchHTML(url: string): Promise<string> {
    const ctl = new AbortController()
    const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, {
        signal: ctl.signal,
        headers: {
          'User-Agent': 'ARGOS/3.0 (ciudadano; investigación anticorrupción)',
          Accept: 'text/html,application/xhtml+xml',
        },
      })
      if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`)
      return await res.text()
    } finally {
      clearTimeout(timer)
    }
  }

  // Extrae filas de una tabla HTML dado el índice de tabla (0-based).
  // Retorna array de objetos { header: value } usando la primera fila como headers.
  protected parsearTablaHTML(
    html: string,
    tableIndex = 0
  ): Record<string, string>[] {
    const tableRegex = /<table[^>]*>([\s\S]*?)<\/table>/gi
    const tables = [...html.matchAll(tableRegex)]
    const tableHTML = tables[tableIndex]?.[0]
    if (!tableHTML) return []

    const rowRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi
    const rows = [...tableHTML.matchAll(rowRegex)]
    if (rows.length < 2) return []

    const headers = extraerCeldas(rows[0][1]).map(h => limpiarHTML(h).trim())
    const resultado: Record<string, string>[] = []

    for (let i = 1; i < rows.length; i++) {
      const celdas = extraerCeldas(rows[i][1]).map(c => limpiarHTML(c).trim())
      const fila: Record<string, string> = {}
      headers.forEach((h, idx) => { fila[h] = celdas[idx] ?? '' })
      if (Object.values(fila).some(v => v)) resultado.push(fila)
    }

    return resultado
  }
}

// ─── Helpers internos ─────────────────────────────────────────────────────────

function extraerCeldas(rowHTML: string): string[] {
  const regex = /<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi
  return [...rowHTML.matchAll(regex)].map(m => m[1])
}

function limpiarHTML(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#\d+;/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}
