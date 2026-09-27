import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1500)
await page.click('.view-switch >> text=3D')
await page.click('.panel-tabs >> text=Paint').catch(async () => page.click('button:has-text("Paint") >> nth=1'))
await page.waitForTimeout(500)
await page.locator('.style-card').first().scrollIntoViewIfNeeded()
await page.screenshot({ path: `${out}/styles-panel.png` })
for (const name of ['Modern farmhouse', 'Mid-century modern']) {
  await page.click(`.style-card:has-text("${name}")`)
  await page.click('.bar3d >> text=Outside')
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${out}/style-${name.split(' ')[0].toLowerCase()}-out.png` })
  await page.click('.bar3d >> text=Inside')
  await page.waitForTimeout(2200)
  await page.screenshot({ path: `${out}/style-${name.split(' ')[0].toLowerCase()}-in.png` })
}
await page.keyboard.press('Control+z')
await page.waitForTimeout(1200)
console.log(errors.join('\n') || 'no errors')
await browser.close()
