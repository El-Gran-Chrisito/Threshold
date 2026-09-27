import { chromium } from 'playwright'
const out = process.argv[2]
const only = process.argv[3]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()) })
await page.goto('http://localhost:4173/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1200)
await page.click('.view-switch >> text=3D')
await page.click('.bar3d >> text=Outside')
await page.waitForTimeout(4000)
const shot = async (name) => { await page.waitForTimeout(3500); await page.screenshot({ path: `${out}/ext-${name}.png` }) }
await shot('corner')
await page.selectOption('#view-from', 'street')
await shot('street')
if (only !== 'quick') {
  await page.fill('#sun-hour', '19')
  await shot('street-dusk')
  await page.fill('#sun-hour', '22')
  await shot('street-night')
  await page.fill('#sun-hour', '15')
  await page.selectOption('#view-from', 'top')
  await shot('top')
}
console.log(errors.slice(0, 10).join('\n') || 'no errors')
await browser.close()
