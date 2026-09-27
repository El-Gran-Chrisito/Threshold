import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
// Desktop walk mode
let page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(1200)
await page.click('.view-switch >> text=Walk')
await page.waitForTimeout(2500)
await page.keyboard.down('w'); await page.waitForTimeout(900); await page.keyboard.up('w')
await page.waitForTimeout(600)
await page.screenshot({ path: `${out}/30-walk.png` })
await page.close()
// Phone
page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(1500)
await page.screenshot({ path: `${out}/31-phone-plan.png` })
await page.tap('.view-switch button:nth-child(3)')
await page.waitForTimeout(2500)
await page.screenshot({ path: `${out}/32-phone-3d.png` })
console.log(errors.join('\n') || 'no page errors')
await browser.close()
