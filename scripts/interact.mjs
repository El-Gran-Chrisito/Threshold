// Drive the editor like a user: draw a room, add a door and window, place furniture, paint, undo.
import { chromium } from 'playwright'
const out = process.argv[2]
const url = process.argv[3] ?? 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('console', (m) => { if (m.type() === 'error') errors.push(`${m.type()}: ${m.text()}`) })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto(url)
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1500)
// Start blank
await page.click('.panel-tabs >> text=Project')
await page.click('text=Blank plot')
await page.click('text=Click again')
await page.waitForTimeout(500)
await page.click('.view-switch >> text=2D')
await page.waitForTimeout(500)
const box = await (await page.$('.plan-svg')).boundingBox()
const P = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })
// Draw a room by dragging
await page.keyboard.press('r')
let a = P(0.25, 0.25), b = P(0.6, 0.7)
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 5 }); await page.mouse.move(b.x, b.y, { steps: 5 }); await page.mouse.up()
await page.waitForTimeout(300)
// Second room sharing a wall
a = P(0.6, 0.25); b = P(0.8, 0.55)
await page.mouse.move(a.x, a.y); await page.mouse.down(); await page.mouse.move(b.x, b.y, { steps: 8 }); await page.mouse.up()
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/10-rooms.png` })
// Door on the shared wall
await page.keyboard.press('d')
let d = P(0.6, 0.4)
await page.mouse.move(d.x, d.y); await page.waitForTimeout(100); await page.mouse.click(d.x, d.y)
// Window on the top wall of room 1
await page.keyboard.press('n')
d = P(0.42, 0.25)
await page.mouse.move(d.x, d.y); await page.waitForTimeout(100); await page.mouse.click(d.x, d.y)
await page.keyboard.press('Escape')
// Furniture: sofa near bottom wall
await page.keyboard.press('f')
await page.click('.cat-card >> text=Sofa, 3-seat')
d = P(0.42, 0.66)
await page.mouse.move(d.x, d.y); await page.waitForTimeout(150); await page.mouse.click(d.x, d.y)
await page.waitForTimeout(300)
await page.screenshot({ path: `${out}/11-furnished.png` })
// Draw a wall with typed length
await page.keyboard.press('w')
d = P(0.25, 0.85)
await page.mouse.click(d.x, d.y)
d = P(0.5, 0.85)
await page.mouse.move(d.x, d.y, { steps: 4 })
await page.keyboard.type('10')
await page.waitForTimeout(150)
await page.keyboard.press('Enter')
await page.keyboard.press('Enter')
await page.keyboard.press('Escape')
await page.waitForTimeout(900)
const state = await page.evaluate(() => {
  const raw = localStorage.getItem('threshold:last')
  const p = JSON.parse(localStorage.getItem('threshold:p:' + JSON.parse(raw)))
  const l = p.levels[0]
  return { rooms: l.rooms.length, walls: l.walls.length, openings: l.openings.map((o) => o.kind), items: l.items.map((i) => i.type), wallLens: l.walls.map((w) => Math.round(Math.hypot(w.b.x - w.a.x, w.b.y - w.a.y))) }
})
console.log(JSON.stringify(state))
// Undo twice
await page.keyboard.press('Control+z')
await page.keyboard.press('Control+z')
await page.waitForTimeout(600)
await page.click('.view-switch >> text=Split')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/12-split-after.png` })
console.log(errors.slice(0, 20).join('\n') || 'no page errors')
await browser.close()
