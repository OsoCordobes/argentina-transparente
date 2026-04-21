import { Router, Request, Response, IRouter } from 'express'
import { z }                                   from 'zod'
import { Octokit }                             from '@octokit/rest'

const router: IRouter = Router()

// ─── Config ───────────────────────────────────────────────────────────────────
// GITHUB_REPO must be in "owner/repo" form.
// Expected scope for GITHUB_TOKEN: `repo` (for private repos) or `public_repo`.

const GITHUB_TOKEN = process.env.GITHUB_TOKEN ?? ''
const GITHUB_REPO  = process.env.GITHUB_REPO  ?? ''

const FEEDBACK_LABEL = 'user-feedback'

// ─── Schema ───────────────────────────────────────────────────────────────────

const FeedbackBody = z.object({
  mensaje:        z.string().min(1).max(5_000),
  ruta:           z.string().max(500).optional(),
  caso_id:        z.string().max(100).optional(),
  // base64-encoded PNG/JPG; capped at ~2MB decoded (base64 is ~33% larger)
  screenshot_b64: z.string().max(3_000_000).optional(),
  // Free-form extra context (user-agent, viewport, etc) captured by the frontend
  contexto:       z.record(z.unknown()).optional(),
})

// ─── Helpers ──────────────────────────────────────────────────────────────────

function parseRepo(repo: string): { owner: string; repo: string } | null {
  const parts = repo.split('/')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return null
  return { owner: parts[0], repo: parts[1] }
}

function userEmailFromReq(req: Request): string | null {
  const locals = (req as Request & { locals?: { userEmail?: string } }).locals
  return locals?.userEmail ?? null
}

function buildIssueBody(input: {
  mensaje:        string
  ruta?:          string
  caso_id?:       string
  user_email?:    string | null
  contexto?:      Record<string, unknown>
  screenshot_url?: string
}): string {
  const lines: string[] = []
  lines.push('## Feedback del usuario')
  lines.push('')
  lines.push(input.mensaje)
  lines.push('')
  lines.push('---')
  lines.push('')
  lines.push('### Contexto')
  lines.push(`- **Ruta:** ${input.ruta ?? '(no informada)'}`)
  lines.push(`- **Caso:** ${input.caso_id ?? '(ninguno)'}`)
  lines.push(`- **Usuario:** ${input.user_email ?? '(anónimo)'}`)
  lines.push(`- **Timestamp:** ${new Date().toISOString()}`)
  if (input.contexto && Object.keys(input.contexto).length > 0) {
    lines.push('')
    lines.push('### Contexto adicional')
    lines.push('```json')
    lines.push(JSON.stringify(input.contexto, null, 2))
    lines.push('```')
  }
  if (input.screenshot_url) {
    lines.push('')
    lines.push('### Captura adjunta')
    lines.push(`![screenshot](${input.screenshot_url})`)
  }
  return lines.join('\n')
}

function titleFromMessage(mensaje: string): string {
  const firstLine = mensaje.split('\n')[0].trim()
  const truncated = firstLine.length > 80 ? firstLine.slice(0, 77) + '...' : firstLine
  return `[feedback] ${truncated}`
}

// ─── POST /api/feedback ───────────────────────────────────────────────────────

router.post('/', async (req: Request, res: Response) => {
  const parse = FeedbackBody.safeParse(req.body)
  if (!parse.success) return res.status(400).json({ error: parse.error.flatten() })

  if (!GITHUB_TOKEN || !GITHUB_REPO) {
    return res.status(503).json({
      error:  'feedback_not_configured',
      detail: 'GITHUB_TOKEN or GITHUB_REPO env var missing',
    })
  }

  const repoInfo = parseRepo(GITHUB_REPO)
  if (!repoInfo) {
    return res.status(503).json({ error: 'invalid_github_repo', detail: 'GITHUB_REPO must be "owner/repo"' })
  }

  const { mensaje, ruta, caso_id, screenshot_b64, contexto } = parse.data
  const userEmail = userEmailFromReq(req)

  const octokit = new Octokit({ auth: GITHUB_TOKEN })

  // Screenshot upload — GitHub doesn't expose a direct image-upload API for issues,
  // so we embed the base64 via a gist instead and reference it in the issue body.
  // This keeps a single PAT working without extra setup.
  let screenshotUrl: string | undefined
  if (screenshot_b64) {
    try {
      const gist = await octokit.gists.create({
        public: false,
        description: `ARGOS feedback screenshot (${new Date().toISOString()})`,
        files: {
          'screenshot.b64.txt': { content: screenshot_b64.slice(0, 2_500_000) },
        },
      })
      screenshotUrl = gist.data.html_url ?? undefined
    } catch (err) {
      console.error('[feedback.gist]', err)
      // non-fatal — continue without screenshot link
    }
  }

  const body  = buildIssueBody({
    mensaje,
    ruta,
    caso_id,
    user_email:     userEmail,
    contexto,
    screenshot_url: screenshotUrl,
  })
  const title = titleFromMessage(mensaje)

  try {
    const issue = await octokit.issues.create({
      owner:  repoInfo.owner,
      repo:   repoInfo.repo,
      title,
      body,
      labels: [FEEDBACK_LABEL],
    })

    return res.status(201).json({
      issue_url:    issue.data.html_url,
      issue_number: issue.data.number,
    })
  } catch (err) {
    console.error('[feedback.create]', err)
    return res.status(500).json({ error: 'issue_create_failed', detail: String(err) })
  }
})

export default router
