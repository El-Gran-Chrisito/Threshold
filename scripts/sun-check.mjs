// Sun study: the date picker and "Play day" ask free users for Pro; with a
// trial the month changes the sun, and playing moves the time on.
import { chromium } from 'playwright'
const out = process.argv[2]
const base = process.env.BASE || 'http://localhost:4173/'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } })
const errors = []
page.on('pageerror', (e) => errors.push(e.message))
await page.goto(base)
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.click('.view-switch >> text=3D')
await page.click('text=Outside')
await page.waitForTimeout(1500)

// Free: a month asks for Pro and leaves the day alone.
const before = await page.evaluate(() => window.__threshold.store.getState().sunDay)
await page.selectOption('#sun-day', '12')
await page.waitForTimeout(400)
console.log('free paywall:', !!(await page.$('.paywall, [role="dialog"]')), 'day unchanged:', before === (await page.evaluate(() => window.__threshold.store.getState().sunDay)))
await page.keyboard.press('Escape')
await page.waitForTimeout(300)

// Pro trial.
await page.evaluate(() => localStorage.setItem('threshold:trial', String(Date.now())))
await page.reload()
await page.waitForTimeout(800)
if (await page.$('.welcome')) await page.click('text=Explore the example home')
await page.click('.view-switch >> text=3D')
await page.click('text=Outside')
await page.evaluate(() => window.__threshold.store.setState({ sunHour: 15 }))
await page.selectOption('#sun-day', '6')
await page.waitForTimeout(2200)
await page.screenshot({ path: `${out}/sun-jun-3pm.png` })
await page.selectOption('#sun-day', '12')
await page.waitForTimeout(2200)
await page.screenshot({ path: `${out}/sun-dec-3pm.png` })
console.log('december day:', await page.evaluate(() => window.__threshold.store.getState().sunDay), 'label:', await page.textContent('.sun-time .num'))
const h0 = await page.evaluate(() => window.__threshold.store.getState().sunHour)
await page.click('text=Play day')
await page.waitForTimeout(3000)
const h1 = await page.evaluate(() => window.__threshold.store.getState().sunHour)
console.log('play moved time:', h0.toFixed(2), '->', h1.toFixed(2), 'button:', await page.textContent('button[aria-pressed="true"]:has-text("Pause")').catch(() => 'none'))
await page.click('text=Pause')
await page.screenshot({ path: `${out}/sun-playing.png` })
console.log(errors.length ? 'errors: ' + errors.join(' | ') : 'no page errors')
await browser.close()
