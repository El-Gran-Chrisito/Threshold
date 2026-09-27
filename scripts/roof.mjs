import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('ERR_CERT')) errors.push(m.text()) })
await page.goto('http://localhost:4173/')
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1500)
await page.click('.view-switch >> text=3D')
await page.waitForTimeout(1200)
await page.click('.bar3d >> text=Outside')
await page.click('button:has-text("Levels")')
await page.click('text=Upper floor')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/roof-shingle.png` })
for (const [m, c] of [['Standing-seam metal', 'Colonial blue'], ['Clay tile', 'Terracotta'], ['Slate', 'Slate grey']]) {
  await page.click(`text=${m}`)
  await page.click(`[aria-label="${c}"], [title="${c}"]`).catch(() => errors.push('no swatch ' + c))
  await page.waitForTimeout(1800)
  await page.screenshot({ path: `${out}/roof-${m.split(' ')[0].toLowerCase()}.png` })
}
console.log(errors.join('\n') || 'no errors')
await browser.close()
