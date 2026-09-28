// Room daylight: select a room and read the Daylight block in the inspector.
import { chromium } from 'playwright'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(base)
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.click('.view-switch >> text=2D')
await page.waitForTimeout(500)
for (const name of ['Living room', 'Kitchen & dining', 'Den']) {
  const id = await page.evaluate((n) => {
    const s = window.__threshold.store.getState()
    const l = s.project.levels.find((x) => x.id === s.levelId)
    return l.rooms.find((r) => r.name === n)?.id
  }, name)
  if (!id) continue
  await page.evaluate((id) => window.__threshold.store.setState({ selection: { kind: 'room', id } }), id)
  await page.waitForTimeout(300)
  console.log(name, '|', (await page.textContent('.daylight')).replace(/\s+/g, ' ').trim())
}
await page.locator('.daylight').first().scrollIntoViewIfNeeded()
await page.screenshot({ path: `${out}/daylight.png` })
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
