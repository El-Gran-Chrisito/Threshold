// The plans (upgrade) sheet on phone and desktop.
// Usage: FONT_CACHE=<dir> node scripts/ui-plans-sheet.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
for (const [name, viewport] of [['phone', { width: 390, height: 844 }], ['desktop', { width: 1440, height: 900 }]]) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: 2 })
  await serveLocalFonts(page)
  await page.goto(base)
  await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
  await page.reload()
  await page.waitForTimeout(1000)
  await page.click('.plan-badge')
  await page.waitForTimeout(600)
  const order = await page.$$eval('.plan-card', (els) => els.map((e) => ({ name: e.querySelector('h3')?.textContent, top: Math.round(e.getBoundingClientRect().top) })).sort((a, b) => a.top - b.top).map((x) => x.name))
  console.log(name, 'plan order:', order.join(', '))
  await page.screenshot({ path: `${out}/plans-${name}.png` })
  await page.close()
}
await browser.close()
