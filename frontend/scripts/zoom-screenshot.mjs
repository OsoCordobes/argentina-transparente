// One-off: tomar screenshot a alta resolución + zoom in para ver los icons.
import puppeteer from 'puppeteer'
import { mkdir, writeFile } from 'node:fs/promises'

const OUT = '../docs/screenshots/zoom-icons'
await mkdir(OUT, { recursive: true })

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] })
const page = await browser.newPage()
await page.setViewport({ width: 1920, height: 1200, deviceScaleFactor: 2 })
await page.evaluateOnNewDocument(() => {
  try {
    localStorage.setItem('argos.onboarding_seen.v1', '1')
    localStorage.setItem('argos.onboarding.mapa.v1', '1')
  } catch {}
})
await page.goto('http://localhost:8080/', { waitUntil: 'networkidle2' })
await new Promise(r => setTimeout(r, 6000))

// Full page first
await page.screenshot({ path: `${OUT}/full.png`, fullPage: false })

// Now click somewhere on the graph to trigger detail panel
await page.mouse.click(960, 600)
await new Promise(r => setTimeout(r, 500))
await page.screenshot({ path: `${OUT}/click.png`, fullPage: false })

// Zoom into the canvas area programmatically by sending wheel events
for (let i = 0; i < 8; i++) {
  await page.mouse.wheel({ deltaY: -200 })
  await new Promise(r => setTimeout(r, 200))
}
await page.screenshot({ path: `${OUT}/zoom-in.png`, fullPage: false })

console.log('done', OUT)
await browser.close()
