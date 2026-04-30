/**
 * sumario.ts — Genera bloques de Markdown listos para copiar al portapapeles
 * desde un NodeDetail. Pensado para que un periodista o asesor pegue
 * directamente en Google Docs / Notion / email.
 *
 * Hard rule (CLAUDE.md §2): cero alucinaciones — solo datos del NodeDetail
 * provisto. NO inventa montos, períodos, ni interpretaciones.
 */

import type { NodeDetail, NodeContrato } from './types'

function fmtARS(n: number): string {
  return new Intl.NumberFormat('es-AR', {
    style: 'currency',
    currency: 'ARS',
    maximumFractionDigits: 0,
  }).format(n)
}

function fmtFecha(iso: string | null | undefined): string {
  if (!iso) return 'fecha no disponible'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleDateString('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })
}

function clip(s: string | null | undefined, n: number): string {
  if (!s) return ''
  const t = String(s).trim().replace(/\s+/g, ' ')
  return t.length > n ? t.slice(0, n - 1) + '…' : t
}

/**
 * Genera un sumario en Markdown del proveedor.
 * Incluye:
 * - Título con nombre + (CUIT)
 * - KPIs principales como bullets
 * - Top 5 contratos con [link a fuente]
 * - Señales asociadas (si las hay)
 * - Footer con fecha y método de extracción
 */
export function sumarioProveedorMarkdown(detail: NodeDetail): string {
  const node = detail.node
  const contratos = (detail.contratos ?? []).slice(0, 5)
  const señales = (detail.señales ?? []).slice(0, 3)
  const meta = detail.meta

  // Título
  const cuitKpi = detail.kpis.find((k) => k.label === 'CUIT')
  const titulo = cuitKpi
    ? `# ${node.label} — CUIT ${cuitKpi.value}`
    : `# ${node.label}`

  // KPIs
  const kpiLines: string[] = []
  for (const k of detail.kpis) {
    if (k.label === 'CUIT') continue
    let valor: string
    if (k.format === 'currency' && k.amount != null) {
      valor = fmtARS(k.amount)
    } else if (k.value != null) {
      valor = k.value
    } else {
      continue
    }
    const sub = k.sub ? ` _(${k.sub})_` : ''
    kpiLines.push(`- **${k.label}**: ${valor}${sub}`)
  }

  // Contratos
  let contratosBlock = ''
  if (contratos.length > 0) {
    const total = detail.contratos?.length ?? contratos.length
    contratosBlock = `\n## Top ${contratos.length} contratos${total > contratos.length ? ` (de ${total})` : ''}\n\n`
    for (const c of contratos) {
      contratosBlock += contratoLine(c) + '\n'
    }
  }

  // Señales
  let señalesBlock = ''
  if (señales.length > 0) {
    señalesBlock = `\n## Señales detectadas (${señales.length})\n\n`
    for (const s of señales) {
      const evid = s.evidencia[0]
      const fuente = evid?.fuenteUrl ? ` ([fuente](${evid.fuenteUrl}))` : ''
      señalesBlock +=
        `- **[${s.severidad.toUpperCase()} · score ${s.score}]** ${clip(s.titulo, 100)}${fuente}\n`
    }
  }

  // Footer trazabilidad
  const fecha = fmtFecha(meta?.fechaActualizacion)
  const metodo = meta?.metodoDominante ?? 'desconocido'
  const footer =
    `\n---\n` +
    `*Datos extraídos con ARGOS · ${fecha} · ` +
    `fuente: gobiernoabierto.cordoba.gob.ar · método: ${metodo}*\n` +
    `*Cero alucinaciones · Toda señal verificable*\n`

  return [
    titulo,
    '',
    kpiLines.join('\n'),
    contratosBlock,
    señalesBlock,
    footer,
  ]
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

function contratoLine(c: NodeContrato): string {
  const desc = clip(c.descripcion || c.tipo, 60) || '(sin descripción)'
  const area = c.area || 'sin área'
  return `- **${c.anio}** · ${area} · **${fmtARS(c.monto)}** — ${desc} ([fuente](${c.fuenteUrl}))`
}

/**
 * Copia un texto al portapapeles. Retorna true si éxito.
 * Usa la Clipboard API moderna; fallback a textarea+execCommand para
 * navegadores viejos o contextos http (no localhost).
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallthrough
    }
  }
  if (typeof document !== 'undefined') {
    const ta = document.createElement('textarea')
    ta.value = text
    ta.style.position = 'fixed'
    ta.style.left = '-9999px'
    document.body.appendChild(ta)
    ta.select()
    try {
      const ok = document.execCommand('copy')
      ta.remove()
      return ok
    } catch {
      ta.remove()
      return false
    }
  }
  return false
}
