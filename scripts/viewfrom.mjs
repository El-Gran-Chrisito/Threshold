import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()) })
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(2000)
await page.click('.view-switch >> text=3D')
await page.waitForTimeout(2500)
for (const v of ['top', 'S', 'E']) {
  await page.selectOption('#view-from', v)
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${out}/vf-${v}.png` })
}
await page.click('text=Fast 3D')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/vf-fast.png` })
const lowq = await page.evaluate(() => localStorage.getItem('threshold:lowq'))
console.log('lowq stored:', lowq)
console.log(errors.slice(0, 20).join('\n') || 'no errors')
await browser.close()
