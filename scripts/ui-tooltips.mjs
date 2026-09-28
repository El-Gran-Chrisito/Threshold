// Tooltips: hover a rail tool, a 3D tool and the sun dock, and tab to a
// control; each shows its tooltip, and a click hides it.
// Usage: FONT_CACHE=<dir> node scripts/ui-tooltips.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
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
const tipText = () => page.locator('.tooltip').textContent().catch(() => null)
const hover = async (sel, name) => {
  await page.hover(sel)
  await page.waitForTimeout(600)
  console.log(name, '->', await tipText())
  const box = await page.locator('.tooltip').boundingBox().catch(() => null)
  if (box) await page.screenshot({ path: `${out}/tip-${name}.png`, clip: { x: Math.max(0, box.x - 90), y: Math.max(0, box.y - 50), width: Math.min(1440, box.width + 180), height: box.height + 100 } })
}
await hover('.tool[aria-pressed] >> nth=1', 'room')
await hover('.ctl-btn >> nth=0', 'reset')
await hover('.sun-play', 'play')
await page.mouse.click(700, 450)
await page.waitForTimeout(200)
console.log('after click:', await tipText())
await page.keyboard.press('Tab')
await page.keyboard.press('Tab')
await page.waitForTimeout(200)
console.log('keyboard focus ->', await tipText())
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
