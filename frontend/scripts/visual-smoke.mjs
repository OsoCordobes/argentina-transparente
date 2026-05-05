// frontend/scripts/visual-smoke.mjs — quick visual smoke test
import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'
import { join, resolve } from 'node:path'

const BASE = 'http://localhost:8080'
const ROUTES = ['/', '/explorar', '/dinero', '/senales', '/actores', '/casos', '/fuentes', '/metodologia', '/comparar']
const VIEWPORT = { width: 1440, height: 900 }
const STAMP = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
const OUT_DIR = resolve(process.cwd(), `../docs/screenshots/visual-smoke-${STAMP}`)

await mkdir(OUT_DIR, { recursive: true })
console.log(`[smoke] OUT=${OUT_DIR}`)

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const report = { base: BASE, timestamp: STAMP, routes: [] }

for (const route of ROUTES) {
  const url = `${BASE}${route}`
  const safe = route === '/' ? 'home' : route.replace(/^\//, '').replace(/\//g, '_')
  const file = join(OUT_DIR, `${safe}.png`)
  console.log(`\n[${route}] -> ${url}`)
  const page = await browser.newPage()
  await page.setViewport(VIEWPORT)
  await page.evaluateOnNewDocument(() => {
    try { localStorage.setItem('argos.onboarding_seen.v1', '1') } catch {}
  })
  const consoleErrors = []
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => consoleErrors.push('pageerror: ' + e.message))
  try {
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 30_000 })
    await new Promise(r => setTimeout(r, 5000))
    const dom = await page.evaluate(() => {
      const root = document.getElementById('root')
      const bg = window.getComputedStyle(document.body).backgroundColor
      const svgs = document.querySelectorAll('svg').length
      const text = (document.body.innerText || '').slice(0, 200).replace(/\s+/g, ' ')
      return { bg, rootChildren: root?.children.length ?? 0, svgs, text }
    })
    await page.screenshot({ path: file, fullPage: true })
    report.routes.push({ route, file, dom, errors: consoleErrors })
    console.log(`   bg=${dom.bg}  svgs=${dom.svgs}  console_errors=${consoleErrors.length}`)
  } catch (err) {
    console.error(`   FAIL: ${err.message}`)
    report.routes.push({ route, file, error: err.message, errors: consoleErrors })
  } finally {
    await page.close()
  }
}

await browser.close()
await writeFile(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2), 'utf-8')
console.log(`\n[smoke] DONE: ${OUT_DIR}`)
