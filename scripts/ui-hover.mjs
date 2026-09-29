// Select tool hover: moving over a room or a piece of furniture outlines it
// and shows a pointer cursor; leaving the plan clears it.
// Usage: FONT_CACHE=<dir> node scripts/ui-hover.mjs <out dir>
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
await page.waitForTimeout(800)
const at = async (sel) => {
  const box = await page.locator(sel).first().boundingBox()
  return box && { x: box.x + box.width / 2, y: box.y + box.height / 2 }
}
// An empty spot in the den (a room) and the first sofa (an item).
const den = await page.evaluate(() => {
  const s = window.__threshold.store.getState()
  const l = s.project.levels.find((x) => x.id === s.levelId)
  return l.rooms.find((r) => r.name === 'Den').id
})
const roomBox = await page.locator(`[data-hit="room:${den}"]`).boundingBox()
await page.mouse.move(roomBox.x + roomBox.width * 0.35, roomBox.y + roomBox.height * 0.3)
await page.waitForTimeout(250)
console.log('room hover outline:', await page.locator('.room-hover').count(), '| cursor:', await page.evaluate(() => getComputedStyle(document.querySelector('.room-fill')).cursor))
await page.screenshot({ path: `${out}/hover-room.png`, clip: { x: roomBox.x - 20, y: roomBox.y - 20, width: roomBox.width + 40, height: roomBox.height + 40 } })
const sofa = await at('[data-hit^="item:"]')
await page.mouse.move(sofa.x, sofa.y)
await page.waitForTimeout(250)
console.log('item hover outline:', await page.locator('.item-hover').count(), '| room outline gone:', (await page.locator('.room-hover').count()) === 0)
await page.mouse.move(5, 450)
await page.waitForTimeout(250)
console.log('after leaving:', await page.locator('.room-hover, .item-hover').count())
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
