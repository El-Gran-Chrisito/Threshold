import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1200)
await page.click('.view-switch >> text=2D')
await page.waitForTimeout(600)
const box = await page.locator('.plan-wrap, .plan').first().boundingBox()
const P = (fx, fy) => ({ x: box.x + box.width * fx, y: box.y + box.height * fy })
for (const [name, fx] of [['Stairs, L-shaped', 0.36], ['Stairs, U-shaped', 0.52]]) {
  await page.keyboard.press('f')
  await page.fill('.panel-body input[type="search"], .panel-body input[placeholder*="Search"]', name.split(', ')[1]).catch(() => {})
  await page.click(`.cat-card >> text=${name}`)
  const d = P(fx, 0.42)
  await page.mouse.move(d.x, d.y); await page.waitForTimeout(150); await page.mouse.click(d.x, d.y)
  await page.waitForTimeout(300)
  await page.keyboard.press('Escape')
}
await page.screenshot({ path: `${out}/stairs-plan.png` })
await page.click('.view-switch >> text=3D')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/stairs-3d.png` })
console.log(errors.join('\n') || 'no errors')
await browser.close()
