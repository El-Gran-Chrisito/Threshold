// Phone flow: open welcome, draw a room with touch, open panel, view 3D.
import { chromium } from 'playwright'
const out = process.argv[2]
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })
page.on('pageerror', (e) => console.log('pageerror: ' + e.message))
await page.goto('http://localhost:4173/')
await page.waitForTimeout(1000)
await page.screenshot({ path: `${out}/a1-phone-welcome.png` })
await page.tap('text=Start from scratch')
await page.waitForTimeout(500)
await page.screenshot({ path: `${out}/a2-phone-blank.png` })
const box = await (await page.$('.plan-svg')).boundingBox()
// Two taps = rectangle room
await page.touchscreen.tap(box.x + box.width * 0.2, box.y + box.height * 0.25)
await page.waitForTimeout(150)
await page.touchscreen.tap(box.x + box.width * 0.8, box.y + box.height * 0.7)
await page.waitForTimeout(400)
console.log(JSON.stringify(await page.evaluate(() => { const s = window.__threshold.store.getState(); return { rooms: s.project.levels[0].rooms.length, panel: s.panel, sel: s.selection?.kind } })))
await page.screenshot({ path: `${out}/a3-phone-room.png` })
await browser.close()
