import { Router, Request, Response } from 'express'
import crypto from 'crypto'
import { renderDenunciaPDF, type DenunciaInput } from '../lib/denuncia-pdf'
import { armarDenunciaDesdeIds } from '../lib/denuncia-builder'

const router = Router()

// POST /api/denuncia — genera PDF formal con cadena de custodia
router.post('/', async (req: Request, res: Response) => {
  const body = req.body as Partial<DenunciaInput>

  // Validaciones mínimas (Zod del lado del frontend; acá nos defendemos)
  if (
    !body ||
    !body.destinatario ||
    !body.denuncianteNombre ||
    !body.denuncianteDni ||
    !body.denuncianteEmail ||
    !body.denuncianteDomicilio ||
    !body.hechos ||
    !body.petitorio ||
    !body.casoTitulo
  ) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' })
  }

  if (
    !body.entidades?.length &&
    !body.contratos?.length &&
    !body.señales?.length
  ) {
    return res
      .status(400)
      .json({ ok: false, error: 'La denuncia requiere al menos una pieza de evidencia' })
  }

  try {
    const documentId = crypto.randomUUID()
    const timestamp = new Date().toISOString()

    const buffer = await renderDenunciaPDF(body as DenunciaInput, {
      documentId,
      timestamp,
    })

    // Hash SHA256 del PDF generado (cadena de custodia forense)
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader(
      'Content-Disposition',
      `attachment; filename="denuncia-${documentId.slice(0, 8)}.pdf"`
    )
    res.setHeader('X-Document-SHA256', sha256)
    res.setHeader('X-Document-Timestamp', timestamp)
    res.setHeader('X-Document-ID', documentId)
    // Headers expuestos a CORS (sino el frontend no los puede leer)
    res.setHeader(
      'Access-Control-Expose-Headers',
      'X-Document-SHA256, X-Document-Timestamp, X-Document-ID'
    )

    res.send(buffer)
  } catch (err) {
    console.error('[denuncia] Error generando PDF:', err)
    // Audit fix: mensaje genérico (no String(err) que filtra stack/paths).
    res.status(500).json({ ok: false, error: 'error generando PDF' })
  }
})

// POST /api/denuncia/pdf — endpoint que recibe el caso (IDs sin hidratar)
// y arma el DenunciaInput vía armarDenunciaDesdeIds. PLAN-UI D7.
router.post('/pdf', async (req: Request, res: Response) => {
  const body = req.body ?? {}
  if (!body.denunciante || !body.destinatario || !body.casoTitulo
      || !body.hechos || !body.petitorio) {
    return res.status(400).json({ ok: false, error: 'Faltan campos requeridos' })
  }
  // Audit fix SEC-W3 + W4: cap arrays + cap longitud de strings narrativos
  // para evitar payloads abusivos. 200 ids/hashes es más que suficiente para
  // cualquier denuncia razonable; >200 es señal de error o ataque.
  const MAX_IDS = 200
  const MAX_TEXT = 50_000
  const cap = <T>(arr: T[] | undefined): T[] | undefined =>
    Array.isArray(arr) ? arr.slice(0, MAX_IDS) : undefined
  const truncate = (s: string | undefined): string =>
    typeof s === 'string' ? s.slice(0, MAX_TEXT) : ''
  try {
    const input = await armarDenunciaDesdeIds({
      denunciante: body.denunciante,
      destinatario: body.destinatario,
      casoTitulo: truncate(body.casoTitulo),
      casoDescripcion: body.casoDescripcion ? truncate(body.casoDescripcion) : undefined,
      hechos: truncate(body.hechos),
      petitorio: truncate(body.petitorio),
      senalIds: cap(body.senalIds),
      contratoHashes: cap(body.contratoHashes),
      entidadCuits: cap(body.entidadCuits),
      incluirCadenaDePago: body.incluirCadenaDePago,
    })

    if (!input.entidades.length && !input.contratos.length && !input.señales.length) {
      return res.status(400).json({
        ok: false,
        error: 'La denuncia requiere al menos una pieza de evidencia adjuntada',
      })
    }

    const documentId = crypto.randomUUID()
    const timestamp = new Date().toISOString()
    const buffer = await renderDenunciaPDF(input, { documentId, timestamp })
    const sha256 = crypto.createHash('sha256').update(buffer).digest('hex')

    res.setHeader('Content-Type', 'application/pdf')
    res.setHeader('Content-Disposition',
      `attachment; filename="denuncia-${documentId.slice(0, 8)}.pdf"`)
    res.setHeader('X-Document-SHA256', sha256)
    res.setHeader('X-Document-Timestamp', timestamp)
    res.setHeader('X-Document-ID', documentId)
    res.setHeader('Access-Control-Expose-Headers',
      'X-Document-SHA256, X-Document-Timestamp, X-Document-ID')
    res.send(buffer)
  } catch (err) {
    // Audit fix SEC-3 + EH-W5: log completo server-side, mensaje genérico
    // al cliente para no exfiltrar stack traces / paths de filesystem.
    console.error('[denuncia/pdf]', err)
    res.status(500).json({ ok: false, error: 'error generando PDF' })
  }
})

export default router
