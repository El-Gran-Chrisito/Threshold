// Phone screens: plan with the panel closed and open, the tool rail at
// both ends of its scroll, and the 3D view.
// Usage: FONT_CACHE=<dir> node scripts/ui-phone.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await serveLocalFonts(page)
await page.goto(base)
await page.evaluate(() => {
  localStorage.setItem('threshold:welcomed', '1')
  localStorage.setItem('threshold:lowq', '1')
})
await page.reload()
await page.waitForTimeout(1500)
const shot = async (n) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/phone-${n}.png` })
}
await shot('1-plan')
console.log('rail classes at start:', await page.getAttribute('.toolrail', 'class'))
await page.locator('.toolrail').evaluate((el) => el.scrollTo({ left: el.scrollWidth }))
await page.waitForTimeout(300)
console.log('rail classes at end:', await page.getAttribute('.toolrail', 'class'))
await shot('2-rail-end')
await page.locator('.panel-tabs >> text=Edit').click()
await shot('3-panel-open')
await page.evaluate(() => window.__threshold.store.getState().setView('3d'))
await page.waitForTimeout(1500)
await shot('4-3d')
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
