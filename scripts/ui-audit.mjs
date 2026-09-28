// Screenshots of every main screen for a design review.
// Usage: FONT_CACHE=<dir> node scripts/ui-audit.mjs <out dir> [desktop|phone]
// Fill the font cache with curl from fonts.googleapis.com (css-<md5 of query + newline, 10 chars>.css)
// and fonts.gstatic.com (path with / replaced by _).
import { chromium } from 'playwright'
import { useLocalFonts } from './local-fonts.mjs'
const out = process.argv[2]
const mode = process.argv[3] || 'desktop'
const base = process.env.BASE || 'http://localhost:4173/'
const phone = mode === 'phone'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: phone ? { width: 390, height: 844 } : { width: 1440, height: 900 }, deviceScaleFactor: phone ? 2 : 1 })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await useLocalFonts(page)
const shot = async (name) => {
  await page.waitForTimeout(700)
  await page.screenshot({ path: `${out}/${mode}-${name}.png` })
}
const st = (fn, arg) => page.evaluate(fn, arg)

await page.goto(base)
await page.waitForTimeout(1200)
await shot('01-welcome')
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1500)
await shot('02-split')
await st(() => window.__threshold.store.getState().setView('plan'))
await shot('03-plan')
await st(() => {
  const s = window.__threshold.store.getState()
  const l = s.project.levels.find((x) => x.id === s.levelId)
  s.select({ kind: 'room', id: l.rooms.find((r) => r.name === 'Living room').id })
})
await shot('04-room-selected')
await st(() => {
  const s = window.__threshold.store.getState()
  const l = s.project.levels.find((x) => x.id === s.levelId)
  s.select({ kind: 'item', id: l.items[0].id })
})
await shot('05-item-selected')
await st(() => window.__threshold.store.getState().select(null))
for (const [i, tab] of ['Ask', 'Catalog', 'Paint', 'Levels', 'Budget', 'Project'].entries()) {
  const btn = page.locator(`.panel-tabs >> text=${tab}`)
  if (await btn.count()) {
    await btn.first().click().catch(() => {})
    await shot(`06-panel-${i}-${tab.toLowerCase()}`)
  }
}
await page.locator('.panel-tabs >> text=Edit').first().click().catch(() => {})
await st(() => window.__threshold.store.getState().setView('3d'))
await page.waitForTimeout(2500)
await shot('07-3d')
await st(() => window.__threshold.store.setState({ explode: 1, cutaway: false, showRoof: true }))
await page.waitForTimeout(1500)
await shot('08-explode')
await st(() => window.__threshold.store.setState({ explode: 0 }))
await st(() => window.__threshold.store.getState().setView('walk'))
await page.waitForTimeout(2000)
await shot('09-walk')
await st(() => window.__threshold.store.getState().setView('split'))
const up = page.locator('button:has-text("Upgrade")')
if (await up.count()) {
  await up.first().click()
  await shot('10-plans-sheet')
  await page.keyboard.press('Escape')
}
const help = page.locator('button[aria-label*="elp"], button[title*="elp"]')
if (await help.count()) {
  await help.first().click()
  await shot('11-help')
  await page.keyboard.press('Escape')
}
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
