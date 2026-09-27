import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
for (const [w, h, name] of [[1440, 900, 'desk'], [390, 844, 'phone']]) {
  const page = await browser.newPage({ viewport: { width: w, height: h } })
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
  await page.goto('http://localhost:4173/')
  await page.evaluate(() => localStorage.clear())
  await page.reload()
  await page.waitForTimeout(800)
  if (await page.$('.welcome')) await page.click('text=Explore the example home')
  await page.waitForTimeout(1200)
  if (name === 'desk') await page.click('.view-switch >> text=Split')
  else await page.click('.view-switch button >> nth=2')
  await page.waitForTimeout(1500)
  await page.selectOption('#surroundings', process.argv[3] || 'country')
  await page.selectOption('#view-from', 'street')
  await page.waitForTimeout(4000)
  await page.screenshot({ path: `${out}/surround-${name}.png` })
  console.log(name, 'surroundings =', await page.$eval('#surroundings', (e) => e.value))
  await page.close()
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
