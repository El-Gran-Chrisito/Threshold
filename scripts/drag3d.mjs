// Find a piece of furniture in the 3D view by probing clicks, then drag it and check it moved.
import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(1200)
await page.screenshot({ path: `${out}/40-welcome.png` })
await page.click('text=Explore the example home')
await page.click('.view-switch >> text=3D')
await page.waitForTimeout(2500)
const box = await (await page.$('.view-3d canvas')).boundingBox()
const sel = () => page.evaluate(() => window.__threshold.store.getState().selection)
let found = null
for (let fy = 0.35; fy <= 0.7 && !found; fy += 0.05) {
  for (let fx = 0.3; fx <= 0.75 && !found; fx += 0.05) {
    const x = box.x + box.width * fx, y = box.y + box.height * fy
    await page.mouse.click(x, y)
    await page.waitForTimeout(60)
    const s = await sel()
    if (s && s.kind === 'item') found = { x, y, id: s.id }
  }
}
console.log('found item', JSON.stringify(found))
if (found) {
  const before = await page.evaluate((id) => { const st = window.__threshold.store.getState(); for (const l of st.project.levels) { const i = l.items.find((i) => i.id === id); if (i) return { x: i.x, y: i.y, type: i.type } } }, found.id)
  const hist0 = await page.evaluate(() => window.__threshold.store.getState().past.length)
  await page.mouse.move(found.x, found.y)
  await page.mouse.down()
  await page.mouse.move(found.x + 40, found.y + 10, { steps: 6 })
  await page.mouse.move(found.x + 80, found.y + 20, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(300)
  const after = await page.evaluate((id) => { const st = window.__threshold.store.getState(); for (const l of st.project.levels) { const i = l.items.find((i) => i.id === id); if (i) return { x: i.x, y: i.y } } }, found.id)
  const hist1 = await page.evaluate(() => window.__threshold.store.getState().past.length)
  console.log('before', JSON.stringify(before), 'after', JSON.stringify(after), 'history +', hist1 - hist0)
  await page.screenshot({ path: `${out}/41-dragged.png` })
}
await browser.close()
