// Close-up screenshots of the floor plan and the side panel for design review.
// Usage: FONT_CACHE=<dir> node scripts/ui-plan.mjs <out dir>
import { chromium } from 'playwright'
import { serveLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await serveLocalFonts(page)
await page.goto(base)
await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
await page.reload()
await page.waitForTimeout(1200)
await page.evaluate(() => window.__threshold.store.getState().setView('plan'))
await page.waitForTimeout(900)
await page.screenshot({ path: `${out}/plan-full.png` })
await page.screenshot({ path: `${out}/plan-close.png`, clip: { x: 150, y: 250, width: 580, height: 450 } })
await page.screenshot({ path: `${out}/panel.png`, clip: { x: 1085, y: 56, width: 355, height: 844 } })
await page.evaluate(() => {
  const s = window.__threshold.store.getState()
  const l = s.project.levels.find((x) => x.id === s.levelId)
  s.select({ kind: 'room', id: l.rooms.find((r) => r.name === 'Den').id })
})
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/plan-room.png`, clip: { x: 150, y: 250, width: 580, height: 450 } })
await page.screenshot({ path: `${out}/panel-room.png`, clip: { x: 1085, y: 56, width: 355, height: 844 } })
await page.screenshot({ path: `${out}/header.png`, clip: { x: 0, y: 0, width: 1440, height: 60 } })
await page.evaluate(() => window.__threshold.store.getState().select(null))
await page.locator('.panel-tabs >> text=Catalog').click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/panel-catalog.png`, clip: { x: 1085, y: 56, width: 355, height: 844 } })
await page.locator('.panel-tabs >> text=Budget').click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/panel-budget.png`, clip: { x: 1085, y: 56, width: 355, height: 844 } })
await page.locator('.panel-tabs >> text=Levels').click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/panel-levels.png`, clip: { x: 1085, y: 56, width: 355, height: 844 } })
await page.locator('.panel-tabs >> text=Ask').click()
await page.waitForTimeout(400)
await page.screenshot({ path: `${out}/panel-ask.png`, clip: { x: 1085, y: 56, width: 355, height: 844 } })
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
