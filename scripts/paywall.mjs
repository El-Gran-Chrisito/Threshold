import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
const page = await ctx.newPage()
const errors = []
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.evaluate(() => localStorage.clear())
await page.reload()
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.waitForTimeout(1200)
console.log('badge:', await page.locator('.plan-badge').textContent())
// Locked feature opens the upgrade sheet.
await page.click('button:has-text("Project")')
await page.click('text=Save 3D model (.glb)')
await page.waitForTimeout(300)
console.log('sheet title:', await page.locator('#paywall-title').textContent())
await page.screenshot({ path: `${out}/paywall.png` })
// Free plan export has a watermark and still downloads.
await page.keyboard.press('Escape')
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 15000 }), page.click('text=Save floor plan image')])
console.log('plan export:', dl.suggestedFilename())
await dl.saveAs(`${out}/plan-free.png`)
// Styles beyond the first two are locked.
await page.click('button:has-text("Paint")')
await page.click('.style-card:has-text("Industrial loft")')
console.log('styles gate:', await page.locator('#paywall-title').textContent())
await page.click('.paywall-trial')
await page.waitForTimeout(300)
console.log('badge after trial:', await page.locator('.plan-badge').textContent())
await page.click('button:has-text("Ask")')
console.log('assistant locked:', await page.locator('.locked-feature').count())
// Studio feature still locked on a Pro trial.
console.log(errors.join('\n') || 'no errors')
await browser.close()
