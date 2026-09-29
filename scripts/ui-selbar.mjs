// Selection bar: select a piece of furniture and a door on the plan; a small
// bar of actions floats above each, its buttons work, and it hides while
// the selection is dragged.
// Usage: FONT_CACHE=<dir> node scripts/ui-selbar.mjs <out dir>
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
const level = () =>
  page.evaluate(() => {
    const s = window.__threshold.store.getState()
    const l = s.project.levels.find((x) => x.id === s.levelId)
    return { items: l.items.map((i) => ({ id: i.id, rotation: i.rotation, mirrored: !!i.mirrored })), openings: l.openings.map((o) => ({ id: o.id, kind: o.kind, hinge: o.hinge, swing: o.swing })) }
  })
const shot = async (name) => {
  const box = await page.locator('.selection-bar').boundingBox()
  if (box) await page.screenshot({ path: `${out}/${name}.png`, clip: { x: box.x - 120, y: box.y - 30, width: box.width + 240, height: box.height + 200 } })
}

// Furniture
const item = page.locator('[data-hit^="item:"]').first()
const id = (await item.getAttribute('data-hit')).slice(5)
const ib = await item.boundingBox()
await page.mouse.click(ib.x + ib.width / 2, ib.y + ib.height / 2)
await page.waitForTimeout(300)
console.log('item bar:', await page.locator('.selection-bar').count(), '| buttons:', await page.locator('.selection-bar button').count())
const bar = await page.locator('.selection-bar').boundingBox()
console.log('bar above item:', bar && bar.y + bar.height <= ib.y + 2)
await shot('selbar-item')
const before = (await level()).items.find((i) => i.id === id)
await page.click('.selection-bar button[aria-label="Rotate 90°"]')
await page.click('.selection-bar button[aria-label="Mirror"]')
const after = (await level()).items.find((i) => i.id === id)
console.log('rotate:', before.rotation, '->', after.rotation, '| mirror:', before.mirrored, '->', after.mirrored)
const n0 = (await level()).items.length
await page.click('.selection-bar button[aria-label="Duplicate"]')
await page.waitForTimeout(200)
const n1 = (await level()).items.length
console.log('duplicate:', n0, '->', n1, '| bar still shown:', await page.locator('.selection-bar').count())
await page.click('.selection-bar button[aria-label="Delete"]')
await page.waitForTimeout(200)
console.log('delete:', n1, '->', (await level()).items.length, '| bar after delete:', await page.locator('.selection-bar').count())

// Drag hides the bar
const ib2 = await page.locator(`[data-hit="item:${id}"]`).boundingBox()
await page.mouse.click(ib2.x + ib2.width / 2, ib2.y + ib2.height / 2)
await page.waitForTimeout(200)
await page.mouse.move(ib2.x + ib2.width / 2, ib2.y + ib2.height / 2)
await page.mouse.down()
await page.mouse.move(ib2.x + ib2.width / 2 + 30, ib2.y + ib2.height / 2 + 10, { steps: 5 })
console.log('bar while dragging:', await page.locator('.selection-bar').count())
await page.mouse.up()
await page.waitForTimeout(200)
console.log('bar after drop:', await page.locator('.selection-bar').count())
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')

// Door
const door = (await level()).openings.find((o) => o.kind === 'door')
await page.evaluate((oid) => window.__threshold.store.getState().select({ kind: 'opening', id: oid }), door.id)
await page.waitForTimeout(300)
console.log('door bar buttons:', await page.locator('.selection-bar button').count())
await shot('selbar-door')
await page.click('.selection-bar button[aria-label="Flip hinge"]')
await page.click('.selection-bar button[aria-label="Swing the other way"]')
const d2 = (await level()).openings.find((o) => o.id === door.id)
console.log('hinge:', door.hinge, '->', d2.hinge, '| swing:', door.swing, '->', d2.swing)

// A piece facing up: the bar clears its rotate handle
const up = (await level()).items.find((i) => i.rotation === 0)
await page.evaluate((iid) => window.__threshold.store.getState().select({ kind: 'item', id: iid }), up.id)
await page.waitForTimeout(300)
const rot = await page.locator('.handle.is-rotate').boundingBox()
const b2 = await page.locator('.selection-bar').boundingBox()
console.log('bar clears rotate handle:', b2.y + b2.height <= rot.y)
await shot('selbar-up')

// Nothing selected
await page.keyboard.press('Escape')
await page.waitForTimeout(200)
console.log('bar with nothing selected:', await page.locator('.selection-bar').count())
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
