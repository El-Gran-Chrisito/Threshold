// Screenshots of the 3D toolbar in each mode, on desktop and phone.
// Usage: FONT_CACHE=<dir> node scripts/ui-3d.mjs <out dir>
import { chromium } from 'playwright'
import { useLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
for (const [name, viewport, scale] of [['desktop', { width: 1440, height: 900 }, 1], ['phone', { width: 390, height: 844 }, 2]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: scale })
  page.on('pageerror', (e) => errors.push(e.message))
  await useLocalFonts(page)
  await page.goto(base)
  await page.evaluate(() => {
    localStorage.setItem('threshold:welcomed', '1')
    localStorage.setItem('threshold:lowq', '1')
  })
  await page.reload()
  await page.waitForTimeout(1200)
  const shot = async (n) => {
    await page.waitForTimeout(1500)
    await page.screenshot({ path: `${out}/${name}-3d-${n}.png` })
  }
  await page.evaluate(() => window.__threshold.store.getState().setView('split'))
  await shot('1-split')
  await page.evaluate(() => window.__threshold.store.getState().setView('3d'))
  await shot('2-inside')
  await page.click('.mode-seg >> text=Outside')
  await shot('3-outside')
  await page.click('.mode-seg >> text=Explode')
  await shot('4-explode')
  await page.click('.mode-seg >> text=Section')
  await shot('5-section')
  await page.close()
}
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
