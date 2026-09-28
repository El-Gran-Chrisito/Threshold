// The Studio client presentation on desktop and phone (with a Studio trial).
// Usage: FONT_CACHE=<dir> node scripts/ui-present.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
for (const [name, viewport, mobile] of [['desktop', { width: 1440, height: 900 }, false], ['phone', { width: 390, height: 844 }, true]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile })
  page.on('pageerror', (e) => errors.push(e.message))
  await serveLocalFonts(page)
  await page.goto(base)
  await page.evaluate(() => {
    localStorage.setItem('threshold:welcomed', '1')
    localStorage.setItem('threshold:lowq', '1')
    localStorage.setItem('threshold:trial', String(Date.now()))
    localStorage.setItem('threshold:trial-plan', 'studio')
    localStorage.setItem('threshold:brand', JSON.stringify({ company: 'Oak & Line Studio', contact: 'hello@oakline.example', logo: null }))
  })
  await page.reload()
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__threshold.store.getState().setView('3d'))
  await page.waitForTimeout(1200)
  await page.evaluate(() => window.__threshold.store.setState({ presenting: true }))
  await page.waitForTimeout(3500)
  await page.screenshot({ path: `${out}/present-${name}.png` })
  await page.close()
}
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
