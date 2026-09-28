// CAD export: free users are asked for Pro; with a paid key the Project
// panel saves a .dxf of the design.
// Usage: node scripts/dxf-check.mjs <key file> <out.dxf>   (test build on :4174)
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const key = readFileSync(process.argv[2], 'utf8').trim().split('\n')[0]
const out = process.argv[3] || 'plan.dxf'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined })
const errors = []
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4174/')
await page.evaluate(() => localStorage.setItem('threshold:welcomed', '1'))
await page.reload()
await page.waitForTimeout(1200)
await page.evaluate(() => window.__threshold.store.getState().setView('plan'))
await page.click('.panel-tabs >> text=Project')
await page.click('button:has-text("Save CAD drawing")')
await page.waitForTimeout(400)
console.log('free: upgrade sheet shown:', await page.locator('.paywall, [role="dialog"]').first().isVisible().catch(() => false))
await page.keyboard.press('Escape')

await page.evaluate((k) => localStorage.setItem('threshold:license', k), key)
await page.reload()
await page.waitForTimeout(1200)
await page.evaluate(() => window.__threshold.store.getState().setView('plan'))
await page.click('.panel-tabs >> text=Project')
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), page.click('button:has-text("Save CAD drawing")')])
await dl.saveAs(out)
const text = readFileSync(out, 'utf8')
console.log('pro: saved', dl.suggestedFilename(), Math.round(text.length / 1024), 'KB', '| ends with EOF:', /0\r\nEOF\r\n$/.test(text))
console.log('toast:', await page.locator('.toast').first().textContent().catch(() => ''))
console.log(errors.join('\n') || 'no errors')
await browser.close()
