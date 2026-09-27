import { chromium } from 'playwright'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Start from scratch')
await page.click('.view-switch >> text=2D')
await page.keyboard.press('w')
const box = await (await page.$('.plan-svg')).boundingBox()
const P = (fx, fy) => [box.x + box.width * fx, box.y + box.height * fy]
for (const [fx, fy] of [[0.3, 0.3], [0.6, 0.3], [0.6, 0.7], [0.3, 0.7], [0.3, 0.3]]) {
  const [x, y] = P(fx, fy)
  await page.mouse.move(x, y, { steps: 3 })
  await page.mouse.click(x, y)
  await page.waitForTimeout(80)
}
await page.waitForTimeout(300)
console.log(JSON.stringify(await page.evaluate(() => { const l = window.__threshold.store.getState().project.levels[0]; return { walls: l.walls.length, rooms: l.rooms.map((r) => r.name), past: window.__threshold.store.getState().past.length } })))
// Finish button path: draw an open chain and press Finish
await page.keyboard.press('w')
let [x, y] = P(0.7, 0.3); await page.mouse.move(x, y); await page.mouse.click(x, y)
;[x, y] = P(0.8, 0.3); await page.mouse.move(x, y, { steps: 3 }); await page.mouse.click(x, y)
await page.click('.draw-actions >> text=Finish')
await page.waitForTimeout(200)
console.log(JSON.stringify(await page.evaluate(() => window.__threshold.store.getState().project.levels[0].walls.length)))
await browser.close()
