import { Router, Request, Response, IRouter } from 'express'
import { z }                                   from 'zod'
import Anthropic                               from '@anthropic-ai/sdk'
import type { Database }                       from 'duckdb'
import { apiErr }                              from '../lib/api-error'

const router: IRouter = Router()
const client = new Anthropic()

// ─── Config ───────────────────────────────────────────────────────────────────

const DOSSIER_MODEL      = process.env.DOSSIER_MODEL ?? 'claude-sonnet-4-6'
const MAX_OUTPUT_TOKENS  = 8192
const MAX_OCR_CHARS      = 15_000 // per attached file; prevents blowing up context

// ─── Schemas ──────────────────────────────────────────────────────────────────

const Modo = z.enum(['forense', 'periodistico', 'denuncia'])
type ModoT = z.infer<typeof Modo>

const RenderBody = z.object({
  modo: Modo,
})

const IdParams = z.object({ caso_id: z.string().min(1).max(100) })

// ─── Row types ────────────────────────────────────────────────────────────────

interface CasoRow {
  id:          string
  titulo:      string
  descripcion: string | null
  owner_email: string | null
  state_json:  string | null
  created_at:  string
  updated_at:  string
}

interface ArchivoRow {
  id:           string
  filename:     string
  mime_type:    string | null
  size_bytes:   number | bigint | null
  sha256:       string
  archive_path: string
  ocr_status:   string | null
  ocr_text:     string | null
  uploaded_at:  string
}

interface NotaRow {
  id:         string
  texto:      string
  anclada_a:  string | null
  created_at: string
}

// ─── Prompts por modo ─────────────────────────────────────────────────────────
// Cada modo se comporta como un "sistema" distinto: tono, estructura, nivel de
// prudencia legal. Comparten el header común con el marco normativo argentino
// para aprovechar el prompt caching.

const LEGAL_HEADER = `Sos un redactor forense especializado en corrupción pública argentina, asistiendo a periodistas e investigadores.

PRINCIPIOS OBLIGATORIOS:
- Nunca afirmés culpabilidad penal. Usá: "indica", "sugiere", "es consistente con", "constituye indicio de".
- Toda afirmación concreta debe ir ligada a su fuente (evidencia adjunta, señal algorítmica, nota del investigador).
- Si la evidencia no alcanza para una conclusión, decilo explícitamente.
- Los hallazgos del sistema ARGOS son SEÑALES ALGORÍTMICAS, no conclusiones judiciales.

MARCO LEGAL ARGENTINO (citá cuando aplique):
- Ley Provincial 8614 (Córdoba) — régimen de licitaciones públicas
- Decreto 1023/2001 — régimen de contrataciones del Estado Nacional
- Ley 27.442 — Defensa de la Competencia
- Ley 25.188 — Ética en el ejercicio de la función pública
- Código Penal arts. 256-268 — delitos contra la administración pública
- Ley 25.326 — Protección de datos personales (relevante cuando se nombran personas físicas)

ESTRUCTURA GENERAL DEL DOSSIER:
1. Resumen ejecutivo
2. Hallazgos clave (con evidencia enumerada)
3. Marco legal aplicable
4. Evidencia adjunta (referencias a archivos por nombre + sha256)
5. Metodología y limitaciones
6. Disclaimer

Respondé SIEMPRE en español, en formato Markdown.`

const MODO_INSTRUCTIONS: Record<ModoT, string> = {
  forense: `MODO FORENSE — lenguaje técnico, seco, exhaustivo.

- Tono: notarial. Sin adjetivos valorativos. Sin narrativa.
- Cada dato citado con su fuente exacta (nombre de archivo + sha256, o fecha de consulta + URL).
- Enumerá hallazgos con IDs: F1, F2, F3...
- Incluí una sección "Cadena de custodia" listando archivos con hash.
- Incluí una sección "Limitaciones metodológicas" enumerando qué NO se pudo verificar.
- Disclaimer estricto: "Este documento recopila evidencia documental; no constituye imputación penal."`,

  periodistico: `MODO PERIODÍSTICO — narrativa clara para lector general, con rigor.

- Tono: reportaje de investigación. Prosa cuidada pero sin dramatismo.
- Abrí con un párrafo-gancho que resuma el caso en lenguaje accesible.
- Desarrollá la historia con transiciones entre hallazgos.
- Citá fuentes con links/referencias al pie pero de forma fluida.
- Finalizá con "Qué sigue / qué queda por confirmar".
- Disclaimer: "Los datos surgen de fuentes públicas. Las personas y empresas mencionadas tienen derecho a réplica."`,

  denuncia: `MODO DENUNCIA JUDICIAL — estructura para presentar ante fiscalía o justicia.

- Tono: formal, dirigido a funcionario judicial ("Al Sr./Sra. Fiscal / Juez...").
- Estructura obligatoria:
  I. Encabezamiento (denunciante genérico — dejar placeholder [NOMBRE DEL DENUNCIANTE])
  II. Hechos denunciados (enumerados y fechados)
  III. Calificación legal preliminar (tipos penales posibles + artículos concretos del Código Penal)
  IV. Prueba documental ofrecida (listado de archivos adjuntos con sha256)
  V. Prueba informativa sugerida (qué oficios podrían solicitarse)
  VI. Petitorio
- Prudencia extrema: "los hechos denunciados podrían encuadrar en..." (nunca "constituyen").
- NO redactar petitorio de prisión preventiva ni calificaciones definitivas.
- Disclaimer: "Borrador orientativo. Requiere revisión y firma de letrado patrocinante matriculado."`,
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDb(req: Request): Database {
  return (req.app.locals as { db: Database }).db
}

function all<T>(db: Database, sql: string, ...params: unknown[]): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, ...params, (err: Error | null, rows: unknown[]) => {
      if (err) reject(err)
      else resolve(rows as T[])
    })
  })
}

function truncate(text: string | null, max: number): string {
  if (!text) return ''
  if (text.length <= max) return text
  return text.slice(0, max) + `\n\n[... truncado, ${text.length - max} caracteres omitidos]`
}

// Source = one traceable piece of evidence cited in the dossier.
// Per HANDOFF §2.4: `{ label, url, sha256? }` — rendered as "Fuentes y cadena de
// custodia" in the frontend. Archivos always appear; contratos/proveedores are
// included when pinned via state_json.pinnedEntityIds.
interface DossierSource {
  label:   string
  url:     string
  sha256?: string
  kind:    'archivo' | 'contrato' | 'proveedor' | 'entidad'
}

async function collectSources(
  db:       Database,
  caso:     CasoRow,
  archivos: ArchivoRow[],
): Promise<DossierSource[]> {
  const sources: DossierSource[] = []
  const seen = new Set<string>() // dedup key: `${kind}:${url}`

  // 1. Archivos: always included — each has a download URL + sha256.
  for (const a of archivos) {
    const url = `/api/archivos/${a.id}`
    const key = `archivo:${url}`
    if (seen.has(key)) continue
    seen.add(key)
    sources.push({ label: a.filename, url, sha256: a.sha256, kind: 'archivo' })
  }

  // 2. Pinned contratos + proveedores (from state_json) → contratos.fuente_url
  let pinned: string[] = []
  if (caso.state_json) {
    try {
      const parsed = JSON.parse(caso.state_json) as unknown
      if (parsed && typeof parsed === 'object' && 'pinnedEntityIds' in parsed) {
        const ids = (parsed as { pinnedEntityIds?: unknown }).pinnedEntityIds
        if (Array.isArray(ids)) pinned = ids.filter((x): x is string => typeof x === 'string')
      }
    } catch {
      // Non-fatal: state_json malformed — skip pinned-entity sources.
    }
  }

  const contratoHashes = pinned.filter(id => /^[a-f0-9]{16}$/i.test(id))
  const proveedores    = pinned.filter(id => id.startsWith('prov:')).map(id => id.slice(5))

  if (contratoHashes.length > 0) {
    const placeholders = contratoHashes.map(() => '?').join(',')
    const rows = await all<{
      hash:        string
      proveedor:   string
      descripcion: string | null
      fuente_url:  string
      anio:        number
    }>(
      db,
      `SELECT hash, proveedor, descripcion, fuente_url, anio
       FROM contratos WHERE hash IN (${placeholders})`,
      ...contratoHashes,
    )
    for (const r of rows) {
      const key = `contrato:${r.hash}`
      if (seen.has(key)) continue
      seen.add(key)
      const descSnippet = r.descripcion ? ` — ${r.descripcion.slice(0, 80)}` : ''
      sources.push({
        label: `Contrato ${r.anio}: ${r.proveedor}${descSnippet}`,
        url:   r.fuente_url,
        kind:  'contrato',
      })
    }
  }

  if (proveedores.length > 0) {
    const placeholders = proveedores.map(() => '?').join(',')
    const rows = await all<{ proveedor_norm: string; fuente_url: string }>(
      db,
      `SELECT DISTINCT proveedor_norm, fuente_url
       FROM contratos WHERE proveedor_norm IN (${placeholders})`,
      ...proveedores,
    )
    for (const r of rows) {
      const key = `proveedor:${r.proveedor_norm}:${r.fuente_url}`
      if (seen.has(key)) continue
      seen.add(key)
      sources.push({
        label: `Proveedor: ${r.proveedor_norm}`,
        url:   r.fuente_url,
        kind:  'proveedor',
      })
    }
  }

  return sources
}

function buildCaseContext(
  caso:     CasoRow,
  archivos: ArchivoRow[],
  notas:    NotaRow[],
): string {
  const lines: string[] = []
  lines.push('# MATERIAL DEL CASO')
  lines.push('')
  lines.push(`**Título:** ${caso.titulo}`)
  if (caso.descripcion) lines.push(`**Descripción:** ${caso.descripcion}`)
  lines.push(`**Creado:** ${caso.created_at}`)
  lines.push(`**Última actualización:** ${caso.updated_at}`)
  lines.push('')

  // Estado del tablero (entidades pinneadas, señales, etc) viene serializado en state_json
  if (caso.state_json) {
    lines.push('## Estado de la investigación (serializado)')
    lines.push('```json')
    lines.push(truncate(caso.state_json, 10_000))
    lines.push('```')
    lines.push('')
  }

  if (notas.length > 0) {
    lines.push(`## Notas del investigador (${notas.length})`)
    for (const n of notas) {
      const anchor = n.anclada_a ? ` (anclada a: ${n.anclada_a})` : ''
      lines.push(`- [${n.created_at}]${anchor}: ${n.texto}`)
    }
    lines.push('')
  }

  if (archivos.length > 0) {
    lines.push(`## Archivos adjuntos (${archivos.length})`)
    for (const a of archivos) {
      lines.push('')
      lines.push(`### ${a.filename}`)
      lines.push(`- **sha256:** \`${a.sha256}\``)
      lines.push(`- **mime:** ${a.mime_type ?? 'desconocido'}`)
      lines.push(`- **tamaño:** ${a.size_bytes ?? '?'} bytes`)
      lines.push(`- **subido:** ${a.uploaded_at}`)
      lines.push(`- **OCR:** ${a.ocr_status ?? 'pending'}`)
      if (a.ocr_status === 'done' && a.ocr_text) {
        lines.push('')
        lines.push('**Contenido extraído:**')
        lines.push('```')
        lines.push(truncate(a.ocr_text, MAX_OCR_CHARS))
        lines.push('```')
      }
    }
    lines.push('')
  }

  return lines.join('\n')
}

// ─── POST /api/dossier/:caso_id/render ────────────────────────────────────────

router.post('/:caso_id/render', async (req: Request, res: Response) => {
  const idParse   = IdParams.safeParse(req.params)
  const bodyParse = RenderBody.safeParse(req.body)

  if (!idParse.success)   return apiErr(res, 400, 'invalid_caso_id', 'Invalid caso_id parameter')
  if (!bodyParse.success) return apiErr(res, 400, 'validation_error', 'Invalid request body', bodyParse.error.flatten())

  const db  = getDb(req)
  const { caso_id } = idParse.data
  const { modo }    = bodyParse.data

  try {
    const casos = await all<CasoRow>(
      db,
      `SELECT id, titulo, descripcion, owner_email, state_json, created_at, updated_at
       FROM casos WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
      caso_id,
    )
    if (casos.length === 0) return apiErr(res, 404, 'caso_not_found', 'Caso not found or deleted')

    const archivos = await all<ArchivoRow>(
      db,
      `SELECT id, filename, mime_type, size_bytes, sha256, archive_path, ocr_status, ocr_text, uploaded_at
       FROM caso_archivos WHERE caso_id = ? ORDER BY uploaded_at ASC`,
      caso_id,
    )
    const notas = await all<NotaRow>(
      db,
      `SELECT id, texto, anclada_a, created_at FROM caso_notas
       WHERE caso_id = ? ORDER BY created_at ASC`,
      caso_id,
    )

    const sources = await collectSources(db, casos[0], archivos)
    const caseContext = buildCaseContext(casos[0], archivos, notas)

    // Prompt caching: el header legal es ESTABLE y grande → se cachea.
    // Las instrucciones del modo y el material del caso NO se cachean (cambian por request).
    const systemBlocks: (Anthropic.TextBlockParam & { cache_control?: { type: 'ephemeral' } })[] = [
      { type: 'text', text: LEGAL_HEADER, cache_control: { type: 'ephemeral' } },
      { type: 'text', text: MODO_INSTRUCTIONS[modo] },
    ]

    const userMessage = `${caseContext}\n\n---\n\nRedactá el dossier completo en modo "${modo}" siguiendo la estructura y el tono indicados. Devolvé SOLO el Markdown del dossier — sin preámbulo ni comentarios adicionales.`

    const response = await client.messages.create({
      model:      DOSSIER_MODEL,
      max_tokens: MAX_OUTPUT_TOKENS,
      system:     systemBlocks,
      messages:   [{ role: 'user', content: userMessage }],
    })

    const markdown = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n\n')
      .trim()

    // `sources` carries chain-of-custody data the frontend renders in a
    // "Fuentes y cadena de custodia" section — see HANDOFF §2.4.
    const publicSources = sources.map(({ kind: _kind, ...s }) => s)

    return res.json({
      markdown,
      modo,
      caso_id,
      usage:       response.usage,
      stop_reason: response.stop_reason,
      sources:     publicSources,
    })
  } catch (err) {
    console.error('[dossier.render]', err)
    return apiErr(res, 500, 'render_failed', 'Dossier render failed', String(err))
  }
})

export default router
