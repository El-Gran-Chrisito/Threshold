import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => console.log('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.evaluate(() => {
  const st = window.__threshold.store.getState()
  st.applyLevel((l) => ({ ...l, rooms: l.rooms.map((r) => (r.name === 'Living room' ? { ...r, floorAngle: 45, floor: 'oak' } : r.name === 'Kitchen & dining' ? { ...r, floorAngle: 90 } : r)) }))
})
await page.click('.view-switch >> text=3D')
await page.click('text=Low walls')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/c1-floor-angle.png` })
// Electrical: place a ceiling fan in the living room
await page.evaluate(() => window.__threshold.store.setState({ tool: 'item', placeType: 'ceiling-fan' }))
console.log('ok')
await browser.close()
