// Makes a PDF plan set in the browser with a paid key and saves it for inspection.
// Usage: node scripts/plan-set-check.mjs <key file> <out.pdf>
import { chromium } from 'playwright'
import { readFileSync } from 'node:fs'
const key = readFileSync(process.argv[2], 'utf8').trim().split('\n')[0]
const out = process.argv[3] || 'plan-set.pdf'
const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] })
const errors = []
const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, serviceWorkers: 'block', acceptDownloads: true })
const page = await ctx.newPage()
page.on('pageerror', (e) => errors.push(e.message))
await page.goto('http://localhost:4174/')
await page.evaluate((k) => {
  localStorage.setItem('threshold:welcomed', '1')
  localStorage.setItem('threshold:license', k)
  localStorage.setItem('threshold:brand', JSON.stringify({ company: 'Oak & Line Studio', contact: 'hello@oakline.example · 555 0142', logo: null }))
}, key)
await page.reload()
await page.waitForTimeout(1500)
await page.evaluate(() => window.__threshold.store.getState().setView('split'))
await page.waitForTimeout(2500)
await page.click('.panel-tabs >> text=Project')
const t0 = Date.now()
const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), page.click('button:has-text("Save plan set")')])
await dl.saveAs(out)
console.log('saved', dl.suggestedFilename(), 'in', Date.now() - t0, 'ms')
console.log(errors.join('\n') || 'no errors')
await browser.close()
